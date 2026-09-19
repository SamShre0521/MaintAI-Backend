import express from "express";
import {
  getKnowledgeBase,
  updateKnowledge,
  removeDocumentKnowledge,
} from "../controllers/knowledgeBase.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get(
  "/knowledge-base",
  protect,
  authorizeRoles("manager"),
  getKnowledgeBase,
);

router.patch(
  "/knowledge-base/:id",
  protect,
  authorizeRoles("manager"),
  updateKnowledge,
);
router.delete(
  "/knowledge-base/documents/:id",
  protect,
  authorizeRoles("manager"),
  removeDocumentKnowledge,
);

export default router;
