import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
import {
  extractSinglePageText,
} from "../services/ocr.service.js";

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
export const processAttachmentOcr = async (
  req,
  res,
) => {
  const { id } = req.params;

  try {
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

    const supportedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);

    if (!supportedTypes.has(attachment.mimeType)) {
      return res.status(400).json({
        error:
          "OCR is currently supported only for JPG, PNG and PDF files",
      });
    }

    /*
     * Do not send WEBP to Textract.
     * Your upload middleware supports WEBP,
     * but Textract officially supports JPEG,
     * PNG, TIFF and PDF.
     */
    if (attachment.mimeType === "image/webp") {
      return res.status(400).json({
        error:
          "WEBP must be converted to PNG or JPEG before OCR",
      });
    }

    if (attachment.processingStatus === "processing") {
      return res.status(409).json({
        error:
          "This attachment is already being processed",
      });
    }

    await ChatAttachment.updateOne(
      {
        _id: attachment._id,
        companyId: req.user.companyId,
      },
      {
        $set: {
          processingStatus: "processing",
          processingError: "",
        },
      },
    );

    const result = await extractSinglePageText({
      bucket: attachment.s3Bucket,
      key: attachment.s3Key,
    });

    const updatedAttachment =
      await ChatAttachment.findOneAndUpdate(
        {
          _id: attachment._id,
          companyId: req.user.companyId,
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

    return res.status(200).json({
      message: "OCR completed successfully",
      attachment: {
        id: updatedAttachment._id,
        originalName:
          updatedAttachment.originalName,
        processingStatus:
          updatedAttachment.processingStatus,
        extractedText:
          updatedAttachment.extractedText,
        blockCount: result.blockCount,
      },
    });
  } catch (error) {
    console.error("Attachment OCR error:", error);

    await ChatAttachment.updateOne(
      {
        _id: id,
        companyId: req.user.companyId,
      },
      {
        $set: {
          processingStatus: "failed",
          processingError:
            error.message || "OCR processing failed",
        },
      },
    ).catch((updateError) => {
      console.error(
        "Could not update OCR failure status:",
        updateError,
      );
    });

    return res.status(500).json({
      error:
        error.message || "OCR processing failed",
    });
  }
};