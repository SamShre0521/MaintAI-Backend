import sharp from "sharp";
import { textractClient } from "../config/textract.js";
import { DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { extractLinesFromTextractBlocks } from "../utils/textract.util.js";
import ChatAttachment from "../models/chatAttachment.model.js";
import { extractDocumentPages } from "./documentExtraction.service.js";
import { processAttachmentWithOcr } from "./attachmentOcr.service.js";
import {
  startMultiPageOcr,
  getMultiPageOcrResult,
} from "./asyncOcr.service.js";

export async function processDocument({
  attachment,
  file,
  waitForOcr = false,
}) {
  const filter = { _id: attachment._id, companyId: attachment.companyId };
  try {
    const pages = file ? await extractDocumentPages(file) : null;
    if (
      pages?.some((page) => page.text.trim()) &&
      pages.every((page) => page.text.trim())
    ) {
      return await savePages(filter, pages, "synchronous");
    }
    if (
      ["application/pdf", "image/tiff", "image/tif"].includes(
        attachment.mimeType,
      )
    ) {
      let jobId =
        attachment.processingStatus === "failed"
          ? ""
          : attachment.textractJobId;
      if (!jobId)
        ({ jobId } = await startMultiPageOcr({
          bucket: attachment.s3Bucket,
          key: attachment.s3Key,
          jobTag: `maintai-${attachment._id}`,
        }));
      attachment = await ChatAttachment.findOneAndUpdate(
        filter,
        {
          $set: {
            textractJobId: jobId,
            processingStatus: "processing",
            ocrMode: "asynchronous",
            ocrStartedAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );
      const deadline = Date.now() + (waitForOcr ? 180000 : 0);
      do {
        const result = await getMultiPageOcrResult({ jobId });
        if (result.status === "FAILED")
          throw new Error(result.statusMessage || "Document OCR failed");
        if (result.status !== "IN_PROGRESS")
          return await savePages(filter, result.pages, "asynchronous");
        if (!waitForOcr) return attachment;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } while (Date.now() < deadline);
      throw new Error("Document OCR timed out; retry processing the document");
    }
    if (file && ["image/webp", "image/jpg"].includes(attachment.mimeType)) {
      const bytes = await sharp(file.buffer).png().toBuffer();
      const result = await textractClient.send(
        new DetectDocumentTextCommand({ Document: { Bytes: bytes } }),
      );
      return await savePages(
        filter,
        [
          {
            pageNumber: 1,
            text: extractLinesFromTextractBlocks(result.Blocks || []),
          },
        ],
        "synchronous",
      );
    }
    if (attachment.mimeType.startsWith("image/"))
      return await processAttachmentWithOcr({
        attachmentId: attachment._id,
        companyId: attachment.companyId,
      });
    throw new Error("No readable text found in document");
  } catch (error) {
    await ChatAttachment.updateOne(filter, {
      $set: { processingStatus: "failed", processingError: error.message },
    });
    throw error;
  }
}

async function savePages(filter, pages, mode) {
  if (!pages?.some((page) => page.text?.trim()))
    throw new Error("No readable text found in document");
  return ChatAttachment.findOneAndUpdate(
    filter,
    {
      $set: {
        ocrPages: pages,
        pageCount: pages.length,
        extractedText: pages.map((page) => page.text).join("\n\n"),
        processingStatus: "completed",
        processingError: "",
        ocrMode: mode,
        ocrCompletedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  );
}
