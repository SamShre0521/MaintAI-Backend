import express from "express";
import { chatHandler } from "../controllers/chat.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/chat", protect, chatHandler);

export default router;