import Session from "../models/session.model.js";
import { sendReviewEmail } from "../services/email.service.js";
import { validSolutionText } from "../utils/solutionValidation.util.js";
import Feedback from "../models/feedback.model.js";
import KnowledgeBase from "../models/knowledgeBase.model.js";
import { upsertKnowledgeToVectorDB } from "../services/vector.service.js";
import Notification from "../models/notification.model.js";

import { sendPushNotificationToUser } from "../services/pushNotification.service.js";

export const getManagerDashboard = async (req, res) => {
  try {
    res.json({
      message: "Welcome to manager dashboard",
      user: req.user,
    });
  } catch (error) {
    console.error("Manager dashboard error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const getPendingFeedback = async (req, res) => {
  try {
    const feedbacks = await Feedback.find({
      managerStatus: "pending",
      companyId: req.user.companyId,
      department: req.user.department,
    })
      .populate("userId", "name email role")
      .sort({ updatedAt: -1 });

    console.log("User : " + req.user);
    console.log("Feedback For Manager : " + feedbacks);

    res.json({ feedbacks });
  } catch (error) {
    console.error("Get pending feedback error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const reviewFeedback = async (req, res) => {
  const { id } = req.params;

  const { managerStatus, managerComment, machineName, issueType, tags } =
    req.body;

  try {
    if (!["approved", "rejected"].includes(managerStatus)) {
      return res.status(400).json({
        error: "managerStatus must be approved or rejected",
      });
    }

    const pending = await Feedback.findOne({
      _id: id,
      companyId: req.user.companyId,
      department: req.user.department,
      managerStatus: "pending",
    });
    if (!pending)
      return res
        .status(409)
        .json({
          error: "Feedback is no longer pending. Refresh the review queue.",
        });
    if (
      managerStatus === "approved" &&
      (!validSolutionText(pending.question) ||
        !validSolutionText(pending.answer))
    )
      return res
        .status(400)
        .json({
          error: "A non-empty, appropriate question and solution are required",
        });
    if (
      req.body.revisionNumber !== undefined &&
      Number(req.body.revisionNumber) !== pending.revisionNumber
    )
      return res
        .status(409)
        .json({ error: "The solution was revised. Refresh before reviewing." });
    const session = await Session.findOne({
      sessionId: pending.sessionId,
      userId: pending.userId,
      companyId: req.user.companyId,
    });
    const machineId = pending.machineId || session?.machineId;
    if (managerStatus === "approved" && !machineId)
      return res
        .status(400)
        .json({ error: "The submission has no associated machine" });
    const feedback = await Feedback.findOneAndUpdate(
      {
        _id: id,
        managerStatus: "pending",
        revisionNumber: pending.revisionNumber,
        companyId: req.user.companyId,
        department: req.user.department,
      },
      {
        managerStatus,
        managerComment: managerComment || "",
        approvedBy: req.user._id,
      },
      {
        returnDocument: "after",
      },
    );

    if (!feedback) {
      return res.status(404).json({
        error: "Feedback not found",
      });
    }

    let knowledge = null;

    let vectorStored = false;
    if (managerStatus === "approved") {
      try {
        knowledge = await KnowledgeBase.findOneAndUpdate(
          {
            sourceFeedbackId: feedback._id,
          },
          {
            companyId: req.user.companyId,
            machineId,
            uploadedBy: feedback.userId,
            isActive: true,
            question: feedback.question,
            answer: feedback.answer,
            department: feedback.department,
            sourceFeedbackId: feedback._id,
            approvedBy: req.user._id,
            machineName: machineName || "",
            issueType: issueType || "",
            tags: Array.isArray(tags) ? tags : [],
          },
          {
            returnDocument: "after",
            upsert: true,
            runValidators: true,
          },
        );
      } catch (error) {
        await Feedback.updateOne(
          {
            _id: feedback._id,
            companyId: req.user.companyId,
            managerStatus: "approved",
            revisionNumber: feedback.revisionNumber,
          },
          { $set: { managerStatus: "pending", approvedBy: null } },
        );
        throw error;
      }

      try {
        await upsertKnowledgeToVectorDB(knowledge);
        vectorStored = true;

        console.log(
          "Knowledge successfully stored in Pinecone:",
          knowledge._id.toString(),
        );
      } catch (vectorError) {
        console.error(
          "Knowledge approved, but Pinecone storage failed:",
          vectorError,
        );
      }
    }

    const isApproved = managerStatus === "approved";

    const notification = await Notification.create({
      userId: feedback.userId,
      companyId: req.user.companyId,

      type: isApproved ? "feedback_approved" : "feedback_rejected",

      title: isApproved ? "Solution approved" : "Solution needs revision",

      message: isApproved
        ? "Your troubleshooting solution was approved and stored in the MaintAI knowledge base."
        : managerComment || "Your troubleshooting solution requires revision.",

      feedbackId: feedback._id,
      sessionId: feedback.sessionId,
      isRead: false,
    });

    let pushResult = {
      successCount: 0,
      failureCount: 0,
    };

    try {
      console.log("========== PUSH START ==========");
      console.log("Feedback ID:", feedback._id.toString());
      console.log("Feedback owner:", feedback.userId.toString());
      console.log("Notification type:", notification.type);

      pushResult = await sendPushNotificationToUser({
        userId: feedback.userId,
        title: notification.title,
        body: notification.message,
        data: {
          type: notification.type,
          notificationId: notification._id.toString(),
          feedbackId: feedback._id.toString(),
          sessionId: feedback.sessionId,
          knowledgeId: knowledge?._id?.toString() || "",
          screen: "solution_detail",
          createdAt: notification.createdAt.toISOString(),
        },
      });

      console.log("Push result:", pushResult);
      console.log("========== PUSH END ==========");
    } catch (pushError) {
      console.error("Feedback updated, but push delivery failed:", pushError);
    }

    const email = await sendReviewEmail({
      userId: feedback.userId,
      notification,
      question: feedback.question,
    });

    return res.status(200).json({
      message: isApproved
        ? "Feedback approved and saved to knowledge base"
        : "Feedback rejected successfully",

      feedback,
      knowledge,
      vectorStored,
      notification: {
        id: notification._id,
        type: notification.type,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
      },

      push: pushResult,
      email,
    });
  } catch (error) {
    console.error("Review feedback error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const getDepartmentFeedback = async (req, res) => {
  try {
    const { status } = req.query;

    const filter = {
      companyId: req.user.companyId,
      department: req.user.department,
    };

    if (status) {
      filter.managerStatus = status; // pending / approved / rejected
    }

    const feedbacks = await Feedback.find(filter)
      .populate("userId", "name email role department")
      .populate("approvedBy", "name email role department")
      .sort({ updatedAt: -1 });

    res.json({
      companyId: req.user.companyId,
      department: req.user.department,
      count: feedbacks.length,
      feedbacks,
    });
  } catch (error) {
    console.error("Get department feedback error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
