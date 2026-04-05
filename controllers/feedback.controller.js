import Feedback from "../models/feedback.model.js";

export const submitFeedback = async (req, res) => {
  const { sessionId, question, answer, engineerFeedback } = req.body;

  try {
    if (!sessionId || !question || !answer || !engineerFeedback) {
      return res.status(400).json({
        error: "sessionId, question, answer and engineerFeedback are required",
      });
    }

    const feedback = await Feedback.create({
      sessionId,
      userId: req.user._id,
      question,
      answer,
      engineerFeedback,
    });

    res.status(201).json({
      message: "Feedback submitted successfully",
      feedback,
    });
  } catch (error) {
    console.error("Submit feedback error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};