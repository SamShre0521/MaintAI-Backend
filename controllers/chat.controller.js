import { v4 as uuidv4 } from "uuid";
import Message from "../models/message.model.js";
import Session from "../models/session.model.js";
import { generateResponse } from "../services/openai.service.js";

export const chatHandler = async (req, res) => {
  const { message, sessionId } = req.body;

  try {
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const currentSessionId = sessionId || uuidv4();

    let existingSession = await Session.findOne({
      sessionId: currentSessionId,
      userId: req.user._id,
    });

    if (!existingSession) {
      existingSession = await Session.create({
        sessionId: currentSessionId,
        userId: req.user._id,
        title: message.length > 40 ? message.substring(0, 40) + "..." : message,
      });
    }

    await Message.create({
      sessionId: currentSessionId,
      role: "user",
      content: message,
    });

    const chats = await Message.find({ sessionId: currentSessionId }).sort({
      createdAt: 1,
    });

    const formattedChats = chats.slice(-6).map((chat) => ({
      role: chat.role,
      content: chat.content,
    }));

    const reply = await generateResponse(formattedChats);

    await Message.create({
      sessionId: currentSessionId,
      role: "assistant",
      content: reply,
    });

    await Session.findOneAndUpdate(
      { sessionId: currentSessionId, userId: req.user._id },
      { $set: { updatedAt: new Date() } }
    );

    res.json({
      sessionId: currentSessionId,
      title: existingSession.title,
      reply,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};