import Machine from "../models/machine.model.js";
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
import ChatAttachment from "../models/chatAttachment.model.js";

import {
  getMultiPageOcrResult,
  startMultiPageOcr,
} from "../services/asyncOcr.service.js";

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


export const startAttachmentMultiPageOcr =
  async (req, res) => {
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

      const supportedMimeTypes = new Set([
        "application/pdf",
        "image/tiff",
      ]);

      if (
        !supportedMimeTypes.has(
          attachment.mimeType,
        )
      ) {
        return res.status(400).json({
          error:
            "Multi-page OCR supports PDF and TIFF files only",
        });
      }

      if (
        attachment.processingStatus ===
          "processing" &&
        attachment.textractJobId
      ) {
        return res.status(409).json({
          error:
            "OCR is already processing",
          jobId:
            attachment.textractJobId,
        });
      }

      if (
        attachment.processingStatus ===
          "completed" &&
        attachment.ocrMode ===
          "asynchronous" &&
        attachment.extractedText?.trim()
      ) {
        return res.status(409).json({
          error:
            "This attachment has already been processed",
        });
      }

      const { jobId } =
        await startMultiPageOcr({
          bucket:
            attachment.s3Bucket,
          key: attachment.s3Key,
          jobTag:
            `maintai-${attachment._id}`,
        });

      const updatedAttachment =
        await ChatAttachment.findOneAndUpdate(
          {
            _id: attachment._id,
            companyId:
              req.user.companyId,
          },
          {
            $set: {
              textractJobId: jobId,
              ocrMode: "asynchronous",
              processingStatus:
                "processing",
              processingError: "",
              extractedText: "",
              ocrPages: [],
              pageCount: 0,
              ocrStartedAt: new Date(),
              ocrCompletedAt: null,
            },
          },
          {
            returnDocument: "after",
          },
        );

      return res.status(202).json({
        message:
          "Multi-page OCR started",
        attachmentId:
          updatedAttachment._id,
        jobId,
        processingStatus:
          updatedAttachment.processingStatus,
      });
    } catch (error) {
      console.error(
        "Start multi-page OCR error:",
        error,
      );

      await ChatAttachment.updateOne(
        {
          _id: id,
          companyId:
            req.user.companyId,
        },
        {
          $set: {
            processingStatus: "failed",
            processingError:
              error.message ||
              "Could not start OCR",
          },
        },
      ).catch(() => {});

      return res.status(500).json({
        error:
          error.message ||
          "Could not start multi-page OCR",
      });
    }
  };


  export const checkAttachmentMultiPageOcr =
  async (req, res) => {
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

      if (
        !attachment.textractJobId
      ) {
        return res.status(400).json({
          error:
            "No Textract job exists for this attachment",
        });
      }

      if (
        attachment.processingStatus ===
          "completed" &&
        attachment.extractedText?.trim()
      ) {
        return res.status(200).json({
          message:
            "Multi-page OCR already completed",
          attachment: {
            id: attachment._id,
            processingStatus:
              attachment.processingStatus,
            pageCount:
              attachment.pageCount,
            extractedTextLength:
              attachment.extractedText.length,
            pages:
              attachment.ocrPages,
          },
        });
      }

      const result =
        await getMultiPageOcrResult({
          jobId:
            attachment.textractJobId,
        });

      if (
        result.status ===
        "IN_PROGRESS"
      ) {
        return res.status(202).json({
          message:
            "Multi-page OCR is still processing",
          attachmentId:
            attachment._id,
          processingStatus:
            "processing",
        });
      }

      if (
        result.status === "FAILED"
      ) {
        const failedAttachment =
          await ChatAttachment.findOneAndUpdate(
            {
              _id: attachment._id,
              companyId:
                req.user.companyId,
            },
            {
              $set: {
                processingStatus:
                  "failed",
                processingError:
                  result.statusMessage ||
                  "Textract OCR failed",
              },
            },
            {
              returnDocument: "after",
            },
          );

        return res.status(500).json({
          error:
            failedAttachment.processingError,
        });
      }

      const updatedAttachment =
        await ChatAttachment.findOneAndUpdate(
          {
            _id: attachment._id,
            companyId:
              req.user.companyId,
          },
          {
            $set: {
              processingStatus:
                "completed",
              processingError: "",
              ocrMode:
                "asynchronous",
              extractedText:
                result.extractedText,
              ocrPages:
                result.pages,
              pageCount:
                result.pageCount,
              ocrCompletedAt:
                new Date(),
            },
          },
          {
            returnDocument: "after",
          },
        );

      return res.status(200).json({
        message:
          "Multi-page OCR completed successfully",

        attachment: {
          id:
            updatedAttachment._id,
          originalName:
            updatedAttachment.originalName,
          processingStatus:
            updatedAttachment.processingStatus,
          pageCount:
            updatedAttachment.pageCount,
          extractedTextLength:
            updatedAttachment.extractedText
              .length,
          blockCount:
            result.blockCount,
          pages:
            updatedAttachment.ocrPages.map(
              (page) => ({
                pageNumber:
                  page.pageNumber,
                lineCount:
                  page.lineCount,
                textLength:
                  page.text.length,
              }),
            ),
        },
      });
    } catch (error) {
      console.error(
        "Check multi-page OCR error:",
        error,
      );

      await ChatAttachment.updateOne(
        {
          _id: id,
          companyId:
            req.user.companyId,
        },
        {
          $set: {
            processingStatus: "failed",
            processingError:
              error.message ||
              "Could not retrieve OCR results",
          },
        },
      ).catch(() => {});

      return res.status(500).json({
        error:
          error.message ||
          "Could not retrieve OCR results",
      });
    }
  };


