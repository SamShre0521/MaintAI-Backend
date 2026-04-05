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
  },
  { timestamps: true }
);

const Feedback = mongoose.model("Feedback", feedbackSchema);

export default Feedback;