import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sourceType: String,
    sourceMessage: String,
    knowledgeSources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    attachmentOcrSources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    webSources: { type: [mongoose.Schema.Types.Mixed], default: [] },
    sessionId: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    attachments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ChatAttachment",
      },
    ],
  },
  { timestamps: true },
);

messageSchema.index({ sessionId: 1, createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
