import express from "express";
import {
  getManagerDashboard,
  getPendingFeedback,
  reviewFeedback,
} from "../controllers/manager.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/manager/dashboard",
  protect,
  authorizeRoles("manager"),
  getManagerDashboard
);

router.get(
  "/manager/feedback/pending",
  protect,
  authorizeRoles("manager"),
  getPendingFeedback
);

router.patch(
  "/manager/feedback/:id",
  protect,
  authorizeRoles("manager"),
  reviewFeedback
);

export default router;