import { test, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Session from "../models/session.model.js";
import Message from "../models/message.model.js";
import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
let savedUploads = [];
let generatedMessages;
let currentKnowledge = [];
mock.module("../services/openai.service.js", {
  namedExports: {
    generateResponse: async (messages) => {
      generatedMessages = messages;
      return {
        reply: "Use the new fuse",
        usedContext: true,
        usedWeb: false,
        webSources: [],
      };
    },
  },
});
mock.module("../services/search.service.js", {
  namedExports: { searchVectorDB: async () => currentKnowledge },
});
mock.module("../services/queryValidation.service.js", {
  namedExports: { isMachineRelatedQuery: async () => true },
});
mock.module("../services/attachment.service.js", {
  namedExports: { saveUploadedAttachments: async () => savedUploads },
});
mock.module("../services/documentProcessing.service.js", {
  namedExports: {
    processDocument: async ({ attachment }) => ({
      ...attachment,
      processingStatus: "completed",
      extractedText: "E42 replace fuse",
      ocrPages: [{ pageNumber: 4, text: "E42 replace fuse" }],
    }),
  },
});
mock.module("../services/conversationResolver.service.js", {
  namedExports: {
    resolveConversationQuery: async ({ currentMessage }) => currentMessage,
  },
});
const { chatHandler } = await import("../controllers/chat.controller.js");
const companyId = new mongoose.Types.ObjectId(),
  userId = new mongoose.Types.ObjectId(),
  machineId = new mongoose.Types.ObjectId();
const user = { _id: userId, companyId, department: "Production" };
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
  sort() {
    return this;
  },
  limit() {
    return this;
  },
  then(resolve) {
    return Promise.resolve(value).then(resolve);
  },
});
function setup(t, { history = [], attachment = null } = {}) {
  const session = {
    _id: new mongoose.Types.ObjectId(),
    sessionId: "session",
    machineId,
    title: "E42",
  };
  t.mock.method(Session, "findOne", async () => session);
  t.mock.method(Session, "create", async (fields) => ({
    ...session,
    ...fields,
  }));
  t.mock.method(Session, "updateOne", async () => ({}));
  t.mock.method(Machine, "findOne", async (filter) => {
    assert.equal(filter.companyId, companyId);
    return { machineName: "Press" };
  });
  t.mock.method(ChatAttachment, "find", (filter) =>
    chain(
      filter.processingStatus === "completed" && attachment ? [attachment] : [],
    ),
  );
  t.mock.method(ChatAttachment, "updateMany", async () => ({
    matchedCount: 1,
  }));
  t.mock.method(Message, "find", () => ({
    sort(order) {
      assert.equal(order.createdAt, -1);
      return {
        limit(size) {
          assert.equal(size, 20);
          return Promise.resolve([...history].reverse());
        },
      };
    },
  }));
  const created = [];
  t.mock.method(Message, "create", async (fields) => {
    const result = {
      ...fields,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
    };
    created.push(result);
    return result;
  });
  return created;
}

test("new chat can read a PDF and return filename, timestamp and persisted page citation", async (t) => {
  const attachment = {
    _id: new mongoose.Types.ObjectId(),
    originalName: "Manual.pdf",
    mimeType: "application/pdf",
    processingStatus: "completed",
    extractedText: "E42 replace fuse",
    ocrPages: [{ pageNumber: 4, text: "E42 replace fuse" }],
  };
  savedUploads = [attachment];
  currentKnowledge = [];
  const created = setup(t, { attachment });
  const res = response();
  await chatHandler(
    {
      user,
      body: { message: "E42 alarm", machineId: machineId.toString() },
      files: [{ originalname: "Manual.pdf" }],
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.attachments[0].originalName, "Manual.pdf");
  assert.equal(res.body.attachmentOcrSources[0].pageNumber, 4);
  assert.ok(res.body.userCreatedAt instanceof Date);
  assert.equal(created[1].attachmentOcrSources[0].pageNumber, 4);
  assert.equal(created[0].attachments[0], attachment._id);
});

test("continued chat uses newest messages beyond turn twenty and fresh approved fixes", async (t) => {
  savedUploads = [];
  currentKnowledge = [
    {
      type: "knowledge_base",
      question: "E42",
      answer: "New fix",
      uploaderName: "Worker",
      updatedAt: new Date(),
    },
  ];
  const history = Array.from({ length: 20 }, (_, index) => ({
    role: index % 2 ? "assistant" : "user",
    content: `Latest turn ${index + 21}`,
  }));
  setup(t, { history });
  const res = response();
  await chatHandler(
    { user, body: { sessionId: "session", message: "E42 again" }, files: [] },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.ok(
    generatedMessages.some((message) => message.content === "Latest turn 40"),
  );
  assert.equal(generatedMessages.at(-1).content, "E42 again");
  assert.equal(res.body.sourceType, "internal_knowledge");
  assert.deepEqual(res.body.attachments, []);
});

test("file-only upload starts a conversation", async (t) => {
  const attachment = {
    _id: new mongoose.Types.ObjectId(),
    originalName: "Manual.pdf",
    mimeType: "application/pdf",
    processingStatus: "completed",
    extractedText: "E42 replace fuse",
    ocrPages: [{ pageNumber: 4, text: "E42 replace fuse" }],
  };
  savedUploads = [attachment];
  currentKnowledge = [];
  setup(t, { attachment });
  const res = response();
  await chatHandler(
    {
      user,
      body: { machineId: machineId.toString() },
      files: [{ originalname: "Manual.pdf" }],
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sourceType, "uploaded_document");
});

test("switching machine within an existing conversation is rejected", async (t) => {
  setup(t);
  const res = response();
  await chatHandler(
    {
      user,
      body: {
        sessionId: "session",
        message: "E42",
        machineId: new mongoose.Types.ObjectId().toString(),
      },
      files: [],
    },
    res,
  );
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /new chat/);
});
