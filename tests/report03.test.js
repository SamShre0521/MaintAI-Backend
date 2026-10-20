import { test, mock } from "node:test";
import assert from "node:assert/strict";
import ChatAttachment from "../models/chatAttachment.model.js";
import Machine from "../models/machine.model.js";
import User from "../models/user.model.js";
import Company from "../models/company.model.js";
import Invitation from "../models/signupInvitation.model.js";

let indexingFails = false;
let indexed = 0;
mock.module("../services/manualIngestion.service.js", {
  namedExports: {
    ingestManualToPinecone: async () => {
      indexed++;
      if (indexingFails) throw new Error("Index unavailable");
    },
  },
});
const { submitDocument, reviewDocument, listDocuments } =
  await import("../controllers/documentReview.controller.js");
const { signup, createSignupInvitation } = await import("../controllers/auth.controller.js");
const user = { _id: "uploader", companyId: "company", department: "Production", role: "engineer" };
const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

test("submission requires uploader ownership, completed processing and an eligible state", async (t) => {
  t.mock.method(ChatAttachment, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.uploadedBy, user._id);
    assert.equal(filter.companyId, user.companyId);
    assert.equal(filter.processingStatus, "completed");
    assert.deepEqual(filter.knowledgeStatus.$in, ["temporary", "rejected"]);
    assert.equal(update.$set.knowledgeStatus, "pending_approval");
    assert.equal(update.$set.documentTitle, "Press manual");
    return { _id: "document", ...update.$set };
  });
  const res = response();
  await submitDocument({ user, params: { id: "document" }, body: { documentTitle: " Press manual " } }, res);
  assert.equal(res.statusCode, 200);
});

test("duplicate or premature submission returns conflict", async (t) => {
  t.mock.method(ChatAttachment, "findOneAndUpdate", async () => null);
  const res = response();
  await submitDocument({ user, params: { id: "document" }, body: {} }, res);
  assert.equal(res.statusCode, 409);
});

test("approval indexes before making the document searchable and links the existing machine", async (t) => {
  indexingFails = false;
  indexed = 0;
  const attachment = { _id: "document", machineId: "machine", knowledgeStatus: "approved",
    async save() { assert.equal(indexed, 1); assert.equal(this.knowledgeStatus, "permanent"); } };
  t.mock.method(ChatAttachment, "findOneAndUpdate", async (filter) => {
    assert.equal(filter.companyId, user.companyId);
    assert.equal(filter.knowledgeStatus, "pending_approval");
    return attachment;
  });
  t.mock.method(Machine, "updateOne", async (filter, update) => {
    assert.equal(filter._id, "machine");
    assert.equal(filter.companyId, user.companyId);
    assert.equal(update.$addToSet.attachments, "document");
  });
  const res = response();
  await reviewDocument({ user, params: { id: "document" }, body: { decision: "approved" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(attachment.knowledgeStatus, "permanent");
});

test("failed indexing restores pending status so partial vectors remain hidden and review can retry", async (t) => {
  indexingFails = true;
  t.mock.method(ChatAttachment, "findOneAndUpdate", async () => ({ _id: "document" }));
  let reset;
  t.mock.method(ChatAttachment, "updateOne", async (_, update) => { reset = update.$set; });
  const res = response();
  await reviewDocument({ user, params: { id: "document" }, body: { decision: "approved" } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(reset.knowledgeStatus, "pending_approval");
  indexingFails = false;
});

test("rejection records the comment without indexing", async (t) => {
  indexed = 0;
  t.mock.method(ChatAttachment, "findOneAndUpdate", async (_, update) => {
    assert.equal(update.$set.reviewComment, "Upload the corrected manual");
    assert.equal(update.$set.reviewedBy, user._id);
    return update.$set;
  });
  const res = response();
  await reviewDocument({ user, params: { id: "document" }, body: {
    decision: "rejected", comment: "Upload the corrected manual",
  } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(indexed, 0);
});

test("employees can list only their own documents on accessible machines", async (t) => {
  t.mock.method(Machine, "find", () => ({ select: async () => [{ _id: "machine" }] }));
  t.mock.method(ChatAttachment, "find", (filter) => {
    assert.equal(filter.uploadedBy, user._id);
    assert.equal(filter.companyId, user.companyId);
    assert.deepEqual(filter.machineId.$in, ["machine"]);
    const query = { select() { return this; }, populate() { return this; }, sort: async () => [] };
    return query;
  });
  const res = response();
  await listDocuments({ user, query: {} }, res);
  assert.equal(res.statusCode, 200);
});

test("signup gets its company and role from the invitation, ignoring request overrides", async (t) => {
  process.env.JWT_SECRET = "test-only-signing-secret";
  t.mock.method(Invitation, "findOne", async () => ({ companyId: "invited-company", department: "Production", role: "engineer" }));
  t.mock.method(Company, "exists", async () => true);
  t.mock.method(User, "exists", async () => false);
  t.mock.method(User, "create", async (fields) => {
    assert.equal(fields.companyId, "invited-company");
    assert.equal(fields.role, "engineer");
    assert.equal(fields.email, "worker@example.com");
    assert.notEqual(fields.password, "password123");
    return { _id: "new-user", ...fields };
  });
  t.mock.method(Invitation, "deleteMany", async () => ({}));
  const res = response();
  await signup({ body: {
    name: "Worker", email: " WORKER@example.com ", password: "password123",
    invitationToken: "a".repeat(64), role: "manager", companyId: "other-company",
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.user.companyId, "invited-company");
});

test("expired invitations cannot create an account", async (t) => {
  t.mock.method(Invitation, "findOne", async (filter) => {
    assert.ok(filter.expiresAt.$gt instanceof Date);
    return null;
  });
  const create = t.mock.method(User, "create", async () => { throw new Error("Must not create"); });
  const res = response();
  await signup({ body: { name: "Worker", email: "worker@example.com", password: "password123", invitationToken: "a".repeat(64) } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(create.mock.callCount(), 0);
});

test("invitations store a hash and inherit the manager's company and department", async (t) => {
  t.mock.method(User, "exists", async () => false);
  let invitation;
  t.mock.method(Invitation, "create", async (fields) => { invitation = fields; });
  const res = response();
  await createSignupInvitation({ user, body: { email: "manager@example.com", role: "manager", companyId: "other" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(invitation.companyId, "company");
  assert.equal(invitation.department, "Production");
  assert.notEqual(invitation.tokenHash, res.body.invitationToken);
});

test("document access blocks another department before review", async (t) => {
  const { attachmentAccess } = await import("../middleware/attachmentAccess.middleware.js");
  t.mock.method(ChatAttachment, "findOne", async () => ({ uploadedBy: "other", machineId: "machine" }));
  t.mock.method(Machine, "exists", async (filter) => {
    assert.equal(filter.department, user.department);
    assert.equal(filter.companyId, user.companyId);
    return null;
  });
  const res = response();
  let allowed = false;
  await attachmentAccess({ user: { ...user, role: "manager" }, method: "POST",
    params: { id: "507f1f77bcf86cd799439011" } }, res, () => { allowed = true; });
  assert.equal(res.statusCode, 404);
  assert.equal(allowed, false);
});

test("employees can download approved shared chat documents but cannot change another uploader's document", async (t) => {
  const { attachmentAccess } = await import("../middleware/attachmentAccess.middleware.js");
  t.mock.method(ChatAttachment, "findOne", async () => ({
    uploadedBy: "other", machineId: "machine", sessionId: "private-chat", knowledgeStatus: "permanent",
  }));
  t.mock.method(Machine, "exists", async () => true);
  let allowed = false;
  const req = { user, method: "GET", params: { id: "507f1f77bcf86cd799439011" } };
  await attachmentAccess(req, response(), () => { allowed = true; });
  assert.equal(allowed, true);
  const res = response();
  await attachmentAccess({ ...req, method: "POST" }, res, () => assert.fail("Must not allow editing"));
  assert.equal(res.statusCode, 403);
});
