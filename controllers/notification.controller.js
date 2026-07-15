import Notification from "../models/notification.model.js";

export const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({
      userId: req.user._id,
    })
      .populate({
        path: "feedbackId",
        select:
          "sessionId question answer managerStatus managerComment department createdAt updatedAt",
      })
      .sort({
        createdAt: -1,
      });

    return res.status(200).json({
      count: notifications.length,
      notifications: notifications.map((item) => ({
        ...item.toObject(),
        feedback: item.feedbackId,
        feedbackId: item.feedbackId?._id,
      })),
    });
  } catch (error) {
    console.error("Get notifications error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const getUnreadNotificationCount = async (
  req,
  res,
) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });

    return res.status(200).json({
      count,
    });
  } catch (error) {
    console.error("Get unread count error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const getNotificationById = async (req, res) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.notificationId,
      userId: req.user._id,
    }).populate({
      path: "feedbackId",
      select:
        "sessionId question answer managerStatus managerComment department createdAt updatedAt",
    });

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found",
      });
    }

    const result = notification.toObject();

    return res.status(200).json({
      notification: {
        ...result,
        feedback: result.feedbackId,
        feedbackId: result.feedbackId?._id,
      },
    });
  } catch (error) {
    console.error("Get notification details error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const markNotificationAsRead = async (
  req,
  res,
) => {
  try {
    const notification =
      await Notification.findOneAndUpdate(
        {
          _id: req.params.notificationId,
          userId: req.user._id,
        },
        {
          isRead: true,
        },
        {
          returnDocument: "after",
        },
      );

    if (!notification) {
      return res.status(404).json({
        error: "Notification not found",
      });
    }

    return res.status(200).json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    console.error("Mark notification read error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const markAllNotificationsAsRead = async (
  req,
  res,
) => {
  try {
    const result = await Notification.updateMany(
      {
        userId: req.user._id,
        isRead: false,
      },
      {
        isRead: true,
      },
    );

    return res.status(200).json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};