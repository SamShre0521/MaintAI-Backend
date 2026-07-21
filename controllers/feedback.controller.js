import Feedback from "../models/feedback.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import { sendPushNotificationToUser } from "../services/pushNotification.service.js";
export const submitFeedback = async (req, res) => {
  const { sessionId, question, answer, engineerFeedback, conversation } =
    req.body;

  try {
    if (!sessionId || !question || !answer || !engineerFeedback) {
      return res.status(400).json({
        error: "sessionId, question, answer and engineerFeedback are required",
      });
    }
    //validate conversation array
    const safeConversation = Array.isArray(conversation)
      ? conversation
          .filter(
            (message) =>
              ["user", "assistant"].includes(message.role) &&
              typeof message.content === "string" &&
              message.content.trim(),
          )
          .map((message) => ({
            role: message.role,
            content: message.content.trim(),
            createdAt: message.createdAt
              ? new Date(message.createdAt)
              : new Date(),
          }))
      : [];

    const feedback = await Feedback.create({
      sessionId,
      userId: req.user._id,
      question,
      answer,
      engineerFeedback,
      department: req.user.department,
      conversation: safeConversation,
    });
    // sending feedback submission notification to the manager
    const managers = await User.find({
      role: "manager",
      department: req.user.department,
    }).select("_id");

    for (const manager of managers) {
      const notification = await Notification.create({
        userId: manager._id,
        type: "feedback_submitted",
        title: "New solution submitted",
        message: `${req.user.name || "An engineer"} submitted a solution for review.`,
        feedbackId: feedback._id,
        sessionId: feedback.sessionId,
        isRead: false,
      });

      try {
        await sendPushNotificationToUser({
          userId: manager._id,
          title: notification.title,
          body: notification.message,
          data: {
            type: notification.type,
            notificationId: notification._id.toString(),
            feedbackId: feedback._id.toString(),
            sessionId: feedback.sessionId,
          },
        });
      } catch (error) {
        console.error("Manager push notification failed:", error);
      }
    }

    res.status(201).json({
      message: "Feedback submitted successfully",
      feedback,
    });
  } catch (error) {
    console.error("Submit feedback error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

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
    feedback.revisionNumber = (feedback.revisionNumber || 1) + 1;
    feedback.resubmittedAt = new Date();

    await feedback.save();
    // resbmitting feedback notification to the manager

    const managers = await User.find({
      role: "manager",
      department: req.user.department,
    }).select("_id");

    for (const manager of managers) {
      const notification = await Notification.create({
        userId: manager._id,
        type: "feedback_resubmitted",
        title: "Solution resubmitted",
        message: "An engineer revised and resubmitted a rejected solution.",
        feedbackId: feedback._id,
        sessionId: feedback.sessionId,
        isRead: false,
      });

      try {
        await sendPushNotificationToUser({
          userId: manager._id,
          title: notification.title,
          body: notification.message,
          data: {
            type: notification.type,
            notificationId: notification._id.toString(),
            feedbackId: feedback._id.toString(),
            sessionId: feedback.sessionId,
          },
        });
      } catch (error) {
        console.error("Manager push notification failed:", error);
      }
    }

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

export const getMyFeedbackBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId?.trim()) {
      return res.status(400).json({
        error: "sessionId is required",
      });
    }

    const feedback = await Feedback.findOne({
      sessionId,
      userId: req.user._id,
    })
      .populate(
        "approvedBy",
        "name email role department",
      )
      .sort({ updatedAt: -1 });

    if (!feedback) {
      return res.status(404).json({
        error: "No submitted feedback found for this session",
        hasFeedback: false,
      });
    }

    return res.status(200).json({
      hasFeedback: true,
      feedback,
    });
  } catch (error) {
    console.error(
      "Get feedback by session error:",
      error,
    );

    return res.status(500).json({
      error: "Failed to load feedback details",
    });
  }
};
