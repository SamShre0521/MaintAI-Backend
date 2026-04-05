import express from "express";
import {
  getAllSessions,
  getSessionMessages,
  renameSession,
  deleteSession
} from "../controllers/session.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/sessions", protect, getAllSessions);
router.get("/sessions/:sessionId/messages", protect, getSessionMessages);
router.patch("/sessions/:sessionId", protect, renameSession);
router.delete("/sessions/:sessionId", protect, deleteSession);

export default router;