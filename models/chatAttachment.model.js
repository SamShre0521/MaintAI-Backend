import mongoose from "mongoose";

const chatAttachmentSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    machineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      required: true,
      index: true,
    },

    sessionId: {
      type: String,
      required: true,
      index: true,
    },

    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    originalName: {
      type: String,
      required: true,
    },

    mimeType: {
      type: String,
      required: true,
    },

    size: {
      type: Number,
      required: true,
    },

    s3Bucket: {
      type: String,
      required: true,
    },

    s3Key: {
      type: String,
      required: true,
      unique: true,
    },

    purpose: {
      type: String,
      enum: [
        "error_image",
        "supporting_document",
        "solution_document",
      ],
      default: "supporting_document",
    },

    processingStatus: {
      type: String,
      enum: [
        "uploaded",
        "processing",
        "completed",
        "failed",
      ],
      default: "uploaded",
    },

    extractedText: {
      type: String,
      default: "",
    },

    visualAnalysis: {
      type: String,
      default: "",
    },

    processingError: {
      type: String,
      default: "",
    },

    knowledgeStatus: {
      type: String,
      enum: [
        "temporary",
        "pending_approval",
        "approved",
        "rejected",
      ],
      default: "temporary",
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model(
  "ChatAttachment",
  chatAttachmentSchema,
);