import ChatAttachment from "../models/chatAttachment.model.js";

import {
  deleteAttachment,
  uploadAttachmentToS3,
} from "./s3.service.js";

import {
  getAttachmentType,
} from "../utils/attachment.util.js";

export async function saveUploadedAttachments({
  files,
  companyId,
  machineId,
  sessionId,
  uploadedBy,
}) {
  if (!Array.isArray(files) || files.length === 0) {
    return [];
  }

  const savedAttachments = [];

  for (const file of files) {
    let uploadedObject = null;

    try {
      uploadedObject = await uploadAttachmentToS3({
        file,
        companyId,
        machineId,
        sessionId,
      });

      const attachment = await ChatAttachment.create({
        companyId,
        machineId,
        sessionId,
        uploadedBy,

        originalName: file.originalname,
        mimeType: file.mimetype,
        attachmentType: getAttachmentType(file),
        size: file.size,

        s3Bucket: uploadedObject.bucket,
        s3Key: uploadedObject.key,

        processingStatus: "uploaded",
        knowledgeStatus: "temporary",
      });

      savedAttachments.push(attachment);
    } catch (error) {
      if (uploadedObject?.key) {
        try {
          await deleteAttachment(uploadedObject.key);
        } catch (cleanupError) {
          console.error(
            "Failed to clean orphaned S3 file:",
            cleanupError,
          );
        }
      }

      throw error;
    }
  }

  return savedAttachments;
}