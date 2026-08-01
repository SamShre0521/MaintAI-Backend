import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";

import {
  uploadAttachmentToS3,
  generateAttachmentUrl,
} from "../services/s3.service.js";

import {
  getAttachmentType,
} from "../utils/attachment.util.js";

export const uploadTestAttachments = async (
  req,
  res,
) => {
  try {
    const { machineId, sessionId } = req.body;

    if (!machineId) {
      return res.status(400).json({
        error: "machineId is required",
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: "At least one file is required",
      });
    }

    const companyId = req.user.companyId;

    const machine = await Machine.findOne({
      _id: machineId,
      companyId,
    });

    if (!machine) {
      return res.status(404).json({
        error:
          "Machine not found or does not belong to your company",
      });
    }

    const attachments = [];

    for (const file of req.files) {
      const attachmentType =
        getAttachmentType(file);

      const uploaded = await uploadAttachmentToS3({
        file,
        companyId,
        machineId,
        sessionId,
      });

      const attachment =
        await ChatAttachment.create({
          companyId,
          machineId,
          sessionId: sessionId || "",
          uploadedBy: req.user._id,
          originalName: file.originalname,
          mimeType: file.mimetype,
          attachmentType,
          size: file.size,
          s3Bucket: uploaded.bucket,
          s3Key: uploaded.key,
          processingStatus: "uploaded",
          knowledgeStatus: "temporary",
        });

      attachments.push(attachment);
    }

    return res.status(201).json({
      message:
        "Attachments uploaded successfully",
      count: attachments.length,
      attachments,
    });
  } catch (error) {
    console.error(
      "Upload attachments error:",
      error,
    );

    return res.status(500).json({
      error:
        error.message ||
        "Failed to upload attachments",
    });
  }
};

export const getAttachmentDownloadUrl = async (
  req,
  res,
) => {
  try {
    const { id } = req.params;

    const attachment =
      await ChatAttachment.findOne({
        _id: id,
        companyId: req.user.companyId,
      });

    if (!attachment) {
      return res.status(404).json({
        error: "Attachment not found",
      });
    }

    const url = await generateAttachmentUrl(
      attachment.s3Key,
    );

    return res.status(200).json({
      attachmentId: attachment._id,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      url,
      expiresInSeconds: 300,
    });
  } catch (error) {
    console.error(
      "Get attachment URL error:",
      error,
    );

    return res.status(500).json({
      error:
        "Failed to generate attachment URL",
    });
  }
};