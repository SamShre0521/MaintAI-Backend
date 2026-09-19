import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    machineId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Machine",
      index: true,
    },
    question: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
    },
    engineerFeedback: {
      type: String,
      enum: ["correct", "not_helpful"],
      required: true,
    },
    managerStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    managerComment: {
      type: String,
      default: "",
    },
    department: {
      type: String,
      required: true,
      trim: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revisionNumber: {
      type: Number,
      default: 1,
    },

    resubmittedAt: {
      type: Date,
      default: null,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    conversation: [
      {
        role: {
          type: String,
          enum: ["user", "assistant"],
          required: true,
        },
        content: {
          type: String,
          required: true,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    revisionHistory: [
      {
        question: {
          type: String,
          required: true,
        },

        answer: {
          type: String,
          required: true,
        },

        managerStatus: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          required: true,
        },

        managerComment: {
          type: String,
          default: "",
        },

        revisedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true, optimisticConcurrency: true },
);

feedbackSchema.index({
  companyId: 1,
  department: 1,
  managerStatus: 1,
  updatedAt: -1,
});

const Feedback = mongoose.model("Feedback", feedbackSchema);

export default Feedback;
