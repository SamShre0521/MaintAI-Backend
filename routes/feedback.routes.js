import express from "express";
import { submitFeedback,resubmitFeedback } from "../controllers/feedback.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import {
  getMyFeedbackBySession,
} from "../controllers/feedback.controller.js";

const router = express.Router();

router.post(
  "/feedback",
  protect,
  authorizeRoles("engineer", "manager"),
  submitFeedback
);
router.get(
  "/feedback/session/:sessionId",
  protect,
  getMyFeedbackBySession,
);
router.patch(
  "/feedbacks/:id/resubmit",
  protect,
  resubmitFeedback,
);



export default router;