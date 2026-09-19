import { test, mock } from "node:test";
import assert from "node:assert/strict";
import KnowledgeBase from "../models/knowledgeBase.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
const calls = [];
let matches = [];
let selected = [];
let embeddingFailure = false;
mock.module("../config/pinecone.js", {
  namedExports: {
    pineconeIndex: {
      namespace: () => ({
        query: async (params) => {
          calls.push(params);
          return { matches };
        },
      }),
    },
  },
});
mock.module("../services/embedding.service.js", {
  namedExports: {
    createEmbeddings: async () => {
      if (embeddingFailure) throw new Error("offline");
      return [1, 2];
    },
  },
});
mock.module("../services/knowledgeReranker.service.js", {
  namedExports: {
    rerankKnowledge: async (args) => {
      selected.push(args.candidates);
      return args.candidates.slice(0, 3);
    },
  },
});
const { searchVectorDB } = await import("../services/search.service.js");
const chain = (value) => ({
  populate() {
    return this;
  },
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

test("exact repeated error uses newest database approval without needing a manual or vectors", async (t) => {
  calls.length = 0;
  t.mock.method(KnowledgeBase, "findOne", (filter) => {
    assert.equal(filter.companyId, "tenant");
    assert.equal(filter.machineId, "machine");
    assert.ok(new RegExp(filter.question.$regex, "i").test("E42 alarm"));
    return chain({
      _id: "fix",
      question: "E42 alarm",
      answer: "New approved fix",
      uploadedBy: { name: "Worker" },
      updatedAt: new Date(),
    });
  });
  const result = await searchVectorDB("E42 alarm", "machine", "tenant");
  assert.equal(result[0].answer, "New approved fix");
  assert.equal(result[0].uploaderName, "Worker");
  assert.equal(calls.length, 0);
});
test("new approved fix remains retrievable when vector indexing is unavailable", async (t) => {
  embeddingFailure = true;
  t.mock.method(KnowledgeBase, "findOne", () => chain(null));
  t.mock.method(KnowledgeBase, "find", (filter) =>
    chain(
      filter._id
        ? []
        : [
            {
              _id: "fix",
              question: "E42 alarm",
              answer: "Replace fuse",
              updatedAt: new Date(),
            },
          ],
    ),
  );
  const result = await searchVectorDB("E42", "machine", "tenant");
  assert.equal(result[0].answer, "Replace fuse");
  embeddingFailure = false;
});
test("manual retrieval is scoped and stale removed document vectors are ignored", async (t) => {
  matches = [
    {
      id: "manual",
      score: 0.9,
      metadata: {
        type: "machine_document",
        attachmentId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        text: "old removed manual",
      },
    },
  ];
  t.mock.method(KnowledgeBase, "findOne", () => chain(null));
  t.mock.method(KnowledgeBase, "find", () => chain([]));
  t.mock.method(ChatAttachment, "find", (filter) => {
    assert.equal(filter.companyId, "tenant");
    assert.equal(filter.knowledgeStatus, "permanent");
    return chain([]);
  });
  const result = await searchVectorDB("E42", "machine", "tenant");
  assert.deepEqual(result, []);
  assert.deepEqual(calls.at(-1).filter, {
    companyId: "tenant",
    machineId: "machine",
  });
});
test("unscoped retrieval is rejected before accessing external services", async () => {
  await assert.rejects(searchVectorDB("E42", "machine"), /Company and machine/);
});
