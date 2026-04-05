import Feedback from "../models/feedback.model.js";

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
    const feedbacks = await Feedback.find({ managerStatus: "pending" })
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
  const { managerStatus, managerComment } = req.body;

  try {
    if (!["approved", "rejected"].includes(managerStatus)) {
      return res.status(400).json({
        error: "managerStatus must be approved or rejected",
      });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      {
        managerStatus,
        managerComment: managerComment || "",
      },
      { new: true }
    );

    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }

    res.json({
      message: `Feedback ${managerStatus} successfully`,
      feedback,
    });
  } catch (error) {
    console.error("Review feedback error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};