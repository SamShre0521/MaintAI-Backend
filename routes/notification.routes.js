import express from "express";

import {
  getNotifications,
  getUnreadNotificationCount,
  getNotificationById,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../controllers/notification.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/notifications",
  protect,
  getNotifications,
);

router.get(
  "/notifications/unread-count",
  protect,
  getUnreadNotificationCount,
);

router.patch(
  "/notifications/read-all",
  protect,
  markAllNotificationsAsRead,
);
router.get(
  "/notifications/unread-count",
  protect,
  getUnreadNotificationCount,
);
router.get(
  "/notifications/:notificationId",
  protect,
  getNotificationById,
);

router.patch(
  "/notifications/:notificationId/read",
  protect,
  markNotificationAsRead,
);

export default router;