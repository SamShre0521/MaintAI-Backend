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
      department: req.user.department,
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
import Feedback from "../models/feedback.model.js";

export const resubmitFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer } = req.body;

    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({
        error: "question and answer are required",
      });
    }

    const feedback = await Feedback.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!feedback) {
      return res.status(404).json({
        error: "Feedback not found",
      });
    }

    if (feedback.managerStatus !== "rejected") {
      return res.status(400).json({
        error: "Only rejected feedback can be resubmitted",
      });
    }

    feedback.revisionHistory.push({
      question: feedback.question,
      answer: feedback.answer,
      managerStatus: feedback.managerStatus,
      managerComment: feedback.managerComment,
      revisedAt: new Date(),
    });

    feedback.question = question.trim();
    feedback.answer = answer.trim();
    feedback.managerStatus = "pending";
    feedback.managerComment = "";
    feedback.approvedBy = null;
    feedback.revisionNumber =
      (feedback.revisionNumber || 1) + 1;
    feedback.resubmittedAt = new Date();

    await feedback.save();

    return res.status(200).json({
      message: "Feedback resubmitted successfully",
      feedback,
    });
  } catch (error) {
    console.error("Resubmit feedback error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};