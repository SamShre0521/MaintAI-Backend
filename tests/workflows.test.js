import { test, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Feedback from "../models/feedback.model.js";
import KnowledgeBase from "../models/knowledgeBase.model.js";
import Session from "../models/session.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import Message from "../models/message.model.js";
const pushes = [];
const emails = [];
const vectors = [];
mock.module("../services/pushNotification.service.js", {
  namedExports: {
    sendPushNotificationToUser: async (args) => {
      pushes.push(args);
      return { successCount: 1 };
    },
  },
});
mock.module("../services/email.service.js", {
  namedExports: {
    sendReviewEmail: async (args) => {
      emails.push(args);
      return { sent: true };
    },
  },
});
mock.module("../services/vector.service.js", {
  namedExports: {
    upsertKnowledgeToVectorDB: async (args) => {
      vectors.push(args);
    },
  },
});
const { reviewFeedback, getPendingFeedback } =
  await import("../controllers/manager.controller.js");
const { resubmitFeedback } =
  await import("../controllers/feedback.controller.js");
const { getSessionMessages } =
  await import("../controllers/session.controller.js");
const { authorizeRoles } = await import("../middleware/auth.middleware.js");
const { login } = await import("../controllers/auth.controller.js");
const companyId = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const machineId = new mongoose.Types.ObjectId();
const user = {
  _id: userId,
  companyId,
  department: "Production",
  role: "manager",
};
const response = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});
const chain = (value) => ({
  populate() {
    return this;
  },
  sort() {
    return this;
  },
  select() {
    return this;
  },
  then(resolve) {
    return Promise.resolve(value).then(resolve);
  },
});

test("approval persists company/machine, latest answer, attribution and employee notifications", async (t) => {
  const feedback = {
    _id: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    companyId,
    machineId,
    department: "Production",
    sessionId: "session",
    question: "E42 alarm",
    answer: "Revised fuse replacement",
    revisionNumber: 2,
  };
  t.mock.method(Feedback, "findOne", async (filter) => {
    assert.equal(filter.companyId, companyId);
    return feedback;
  });
  t.mock.method(Session, "findOne", async () => ({ machineId }));
  t.mock.method(Feedback, "findOneAndUpdate", async (filter) => {
    assert.equal(filter.revisionNumber, 2);
    assert.equal(filter.managerStatus, "pending");
    return feedback;
  });
  t.mock.method(
    KnowledgeBase,
    "findOneAndUpdate",
    async (_, changes, options) => {
      assert.equal(changes.companyId, companyId);
      assert.equal(changes.machineId, machineId);
      assert.equal(changes.answer, feedback.answer);
      assert.equal(changes.uploadedBy, feedback.userId);
      assert.equal(options.runValidators, true);
      return { ...changes, _id: new mongoose.Types.ObjectId() };
    },
  );
  t.mock.method(Notification, "create", async (fields) => ({
    ...fields,
    _id: new mongoose.Types.ObjectId(),
    createdAt: new Date(),
  }));
  const res = response();
  await reviewFeedback(
    {
      user,
      params: { id: feedback._id },
      body: { managerStatus: "approved", revisionNumber: 2 },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.vectorStored, true);
  assert.equal(pushes.at(-1).userId, feedback.userId);
  assert.equal(pushes.at(-1).data.screen, "solution_detail");
  assert.equal(emails.at(-1).userId, feedback.userId);
});

test("stale approval cannot overwrite a newer submission", async (t) => {
  t.mock.method(Feedback, "findOne", async () => ({
    question: "E42",
    answer: "New solution",
    revisionNumber: 3,
  }));
  const update = t.mock.method(Feedback, "findOneAndUpdate", async () => {
    throw new Error("must not update");
  });
  const res = response();
  await reviewFeedback(
    {
      user,
      params: { id: "id" },
      body: { managerStatus: "approved", revisionNumber: 2 },
    },
    res,
  );
  assert.equal(res.statusCode, 409);
  assert.equal(update.mock.callCount(), 0);
});

test("employee resubmission keeps history and exposes revised text with pending status", async (t) => {
  const feedback = {
    _id: new mongoose.Types.ObjectId(),
    question: "Old question",
    answer: "Old answer",
    revisionNumber: 1,
    managerStatus: "rejected",
    managerComment: "Please revise",
    approvedBy: userId,
    revisionHistory: [],
    async save() {},
  };
  t.mock.method(Feedback, "findOne", async (filter) => {
    assert.equal(filter.userId, userId);
    assert.equal(filter.companyId, companyId);
    return feedback;
  });
  t.mock.method(User, "find", () => chain([]));
  const res = response();
  await resubmitFeedback(
    {
      user,
      params: { id: feedback._id },
      body: { question: "E42 alarm", answer: "Replace fuse" },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.feedback.answer, "Replace fuse");
  assert.equal(feedback.managerStatus, "pending");
  assert.equal(feedback.revisionNumber, 2);
  assert.equal(feedback.revisionHistory[0].answer, "Old answer");
  assert.equal(feedback.approvedBy, null);
});

test("manager queue is company scoped and orders by latest revision", async (t) => {
  t.mock.method(Feedback, "find", (filter) => {
    assert.equal(filter.companyId, companyId);
    return {
      populate() {
        return this;
      },
      sort(order) {
        assert.deepEqual(order, { updatedAt: -1 });
        return [];
      },
    };
  });
  const res = response();
  await getPendingFeedback({ user }, res);
  assert.deepEqual(res.body.feedbacks, []);
});

test("history populates uploaded filenames and preserves timestamp/source metadata", async (t) => {
  t.mock.method(Session, "findOne", async () => ({ sessionId: "session" }));
  t.mock.method(Message, "find", () => ({
    sort() {
      return this;
    },
    populate(path, fields) {
      assert.equal(path, "attachments");
      assert.match(fields, /originalName/);
      return [{ createdAt: "time", knowledgeSources: [{ pageNumber: 4 }] }];
    },
  }));
  const res = response();
  await getSessionMessages({ user, params: { sessionId: "session" } }, res);
  assert.equal(res.body.messages[0].knowledgeSources[0].pageNumber, 4);
});

test("employees cannot invoke manager review routes", () => {
  const res = response();
  let called = false;
  authorizeRoles("manager")({ user: { role: "engineer" } }, res, () => {
    called = true;
  });
  assert.equal(res.statusCode, 403);
  assert.equal(called, false);
});

test("login normalizes email and provides an actionable credential error", async (t) => {
  t.mock.method(User, "findOne", async (filter) => {
    assert.equal(filter.email, "worker@example.com");
    return null;
  });
  const res = response();
  await login(
    { body: { email: "  WORKER@example.com ", password: "wrong" } },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.code, "INVALID_CREDENTIALS");
  assert.match(res.body.error, /Email or password/);
});

test("message schema retains tenant and source fields", () => {
  const message = new Message({
    companyId,
    userId,
    sessionId: "session",
    role: "assistant",
    content: "Answer",
    knowledgeSources: [{ pageNumber: 4 }],
    sourceType: "internal_knowledge",
  });
  assert.equal(message.validateSync(), undefined);
  assert.equal(message.companyId.toString(), companyId.toString());
  assert.equal(message.knowledgeSources[0].pageNumber, 4);
});
