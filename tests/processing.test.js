import { test, mock } from "node:test";
import assert from "node:assert/strict";
import ChatAttachment from "../models/chatAttachment.model.js";
let extracted = [];
let result = { status: "IN_PROGRESS" };
let started = 0;
mock.module("../config/textract.js", {
  namedExports: { textractClient: { send: async () => ({}) } },
});
mock.module("../services/documentExtraction.service.js", {
  namedExports: { extractDocumentPages: async () => extracted },
});
mock.module("../services/attachmentOcr.service.js", {
  namedExports: { processAttachmentWithOcr: async () => ({}) },
});
mock.module("../services/asyncOcr.service.js", {
  namedExports: {
    startMultiPageOcr: async () => {
      started++;
      return { jobId: "job" };
    },
    getMultiPageOcrResult: async () => result,
  },
});
const { processDocument } =
  await import("../services/documentProcessing.service.js");
const attachment = {
  _id: "doc",
  companyId: "company",
  mimeType: "application/pdf",
  s3Bucket: "bucket",
  s3Key: "key",
};
function setup(t) {
  const updates = [];
  t.mock.method(ChatAttachment, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.companyId, "company");
    updates.push(update.$set);
    return { ...attachment, ...update.$set };
  });
  t.mock.method(ChatAttachment, "updateOne", async (filter, update) => {
    updates.push(update.$set);
  });
  return updates;
}
test("text PDFs finish without starting paid OCR", async (t) => {
  setup(t);
  started = 0;
  extracted = [{ pageNumber: 1, text: "Manual text" }];
  const processed = await processDocument({ attachment, file: {} });
  assert.equal(started, 0);
  assert.equal(processed.processingStatus, "completed");
  assert.equal(processed.pageCount, 1);
});
test("scanned PDFs return processing and resume the same job on follow-up", async (t) => {
  setup(t);
  started = 0;
  extracted = [{ pageNumber: 1, text: "" }];
  result = { status: "IN_PROGRESS" };
  const pending = await processDocument({ attachment, file: {} });
  assert.equal(pending.processingStatus, "processing");
  assert.equal(started, 1);
  result = {
    status: "SUCCEEDED",
    pages: [{ pageNumber: 1, text: "Scanned manual" }],
  };
  const completed = await processDocument({ attachment: pending });
  assert.equal(started, 1);
  assert.equal(completed.processingStatus, "completed");
  assert.equal(completed.extractedText, "Scanned manual");
});
test("OCR failure is stored on the attachment for display in Android", async (t) => {
  const updates = setup(t);
  extracted = [];
  result = { status: "FAILED", statusMessage: "Unreadable scan" };
  await assert.rejects(
    processDocument({ attachment, file: {} }),
    /Unreadable scan/,
  );
  assert.equal(updates.at(-1).processingStatus, "failed");
  assert.equal(updates.at(-1).processingError, "Unreadable scan");
});
