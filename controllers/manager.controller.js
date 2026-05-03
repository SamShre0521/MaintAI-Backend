import Feedback from "../models/feedback.model.js";
import KnowledgeBase from "../models/knowledgeBase.model.js";
import { upsertKnowledgeToVectorDB } from "../services/vector.service.js";

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
      department: req.user.department,
    })
      .populate("userId", "name email role")
      .sort({ createdAt: -1 });

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

    const feedback = await Feedback.findOneAndUpdate(
      {
        _id: id,
        department: req.user.department,
      },
      {
        managerStatus,
        managerComment: managerComment || "",
      },
      { returnDocument: "after" },
    );

    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    let knowledge = null;

    if (managerStatus === "approved") {
      knowledge = await KnowledgeBase.findOneAndUpdate(
        { sourceFeedbackId: feedback._id },
        {
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
        },
      );

      await upsertKnowledgeToVectorDB(knowledge);
    }

    res.json({
      message:
        managerStatus === "approved"
          ? "Feedback approved and saved to knowledge base"
          : "Feedback rejected successfully",
      feedback,
      knowledge,
    });
  } catch (error) {
    console.error("Review feedback error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
