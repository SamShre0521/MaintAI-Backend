import Session from "../models/session.model.js";
import Message from "../models/message.model.js";

export const getAllSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id }).sort({
      updatedAt: -1,
    });

    res.json({ sessions });
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const getSessionMessages = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await Session.findOne({
      sessionId,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const messages = await Message.find({ sessionId }).sort({ createdAt: 1 });

    res.json({ messages });
  } catch (error) {
    console.error("Get session messages error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const renameSession = async (req, res) => {
  const { sessionId } = req.params;
  const { title } = req.body;

  try {
    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const updatedSession = await Session.findOneAndUpdate(
      { sessionId, userId: req.user._id },
      { title: title.trim() },
      { new: true }
    );

    if (!updatedSession) {
      return res.status(404).json({ error: "Session not found" });
    }

    res.json({
      message: "Session renamed successfully",
      session: updatedSession,
    });
  } catch (error) {
    console.error("Rename session error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const deleteSession = async (req, res) => {
  const { sessionId } = req.params;

  try {
    const session = await Session.findOne({
      sessionId,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    await Session.deleteOne({ sessionId, userId: req.user._id });
    await Message.deleteMany({ sessionId });

    res.json({ message: "Session deleted successfully" });
  } catch (error) {
    console.error("Delete session error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};