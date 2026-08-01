import mongoose from "mongoose";

const machineSchema = new mongoose.Schema(
  {
    machineName: {
      type: String,
      required: true,
      trim: true,
    },
    specifications: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    files: [
      {
        originalName: String,
        mimeType: String,
        size: Number,
        processingStatus: {
          type: String,
          enum: ["pending", "processing", "completed", "failed"],
          default: "pending",
        },
        errorMessage: {
          type: String,
          default: "",
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true },
);

const Machine = mongoose.model("Machine", machineSchema);

export default Machine;
