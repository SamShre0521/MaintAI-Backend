import express from "express";
import { getKnowledgeBase } from "../controllers/knowledgeBase.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/knowledge-base",
  protect,
  authorizeRoles("manager"),
  getKnowledgeBase,
);

export default router;
