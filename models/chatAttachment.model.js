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
      default: "",
      index: true,
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

    attachmentType: {
      type: String,
      enum: ["image", "pdf", "spreadsheet", "text", "unknown"],
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

    processingStatus: {
      type: String,
      enum: ["uploaded", "processing", "completed", "failed"],
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
      enum: ["temporary", "pending_approval", "approved", "rejected"],
      default: "temporary",
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    textractJobId: {
      type: String,
      default: "",
      index: true,
    },

    ocrMode: {
      type: String,
      enum: ["none", "synchronous", "asynchronous"],
      default: "none",
    },

    ocrPages: [
      {
        pageNumber: {
          type: Number,
          required: true,
        },

        text: {
          type: String,
          default: "",
        },

        lineCount: {
          type: Number,
          default: 0,
        },
      },
    ],

    pageCount: {
      type: Number,
      default: 0,
    },

    ocrStartedAt: {
      type: Date,
      default: null,
    },

    ocrCompletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("ChatAttachment", chatAttachmentSchema);
