import express from "express";
import {
  getManagerDashboard,
  getPendingFeedback,
  reviewFeedback,
  getDepartmentFeedback,
} from "../controllers/manager.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/manager/dashboard",
  protect,
  authorizeRoles("manager"),
  getManagerDashboard,
);

router.get(
  "/manager/feedback/pending",
  protect,
  authorizeRoles("manager"),
  getPendingFeedback,
);

router.patch(
  "/manager/feedback/:id",
  protect,
  authorizeRoles("manager"),
  reviewFeedback,
);

router.get(
  "/manager/feedback",
  protect,
  authorizeRoles("manager"),
  getDepartmentFeedback,
);

export default router;
