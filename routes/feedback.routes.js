import express from "express";
import { submitFeedback } from "../controllers/feedback.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/feedback",
  protect,
  authorizeRoles("engineer", "manager"),
  submitFeedback
);

export default router;