import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
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
  { timestamps: true }
);

const Message = mongoose.model("Message", messageSchema);

export default Message;