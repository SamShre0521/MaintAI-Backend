import ChatAttachment from "../models/chatAttachment.model.js";
import { extractSinglePageText } from "./ocr.service.js";

export async function processAttachmentWithOcr({
  attachmentId,
  companyId,
}) {
  const attachment = await ChatAttachment.findOne({
    _id: attachmentId,
    companyId,
  });

  if (!attachment) {
    throw new Error("Attachment not found");
  }

  if (attachment.processingStatus === "completed") {
    return attachment;
  }

  await ChatAttachment.updateOne(
    {
      _id: attachment._id,
      companyId,
    },
    {
      $set: {
        processingStatus: "processing",
        processingError: "",
      },
    },
  );

  try {
    const result = await extractSinglePageText({
      bucket: attachment.s3Bucket,
      key: attachment.s3Key,
    });

    return await ChatAttachment.findOneAndUpdate(
      {
        _id: attachment._id,
        companyId,
      },
      {
        $set: {
          extractedText: result.extractedText,
          processingStatus: "completed",
          processingError: "",
        },
      },
      {
        returnDocument: "after",
      },
    );
  } catch (error) {
    await ChatAttachment.updateOne(
      {
        _id: attachment._id,
        companyId,
      },
      {
        $set: {
          processingStatus: "failed",
          processingError:
              error.message || "OCR processing failed",
        },
      },
    );

    throw error;
  }
}