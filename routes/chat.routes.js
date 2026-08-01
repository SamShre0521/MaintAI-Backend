import express from "express";
import { chatHandler } from "../controllers/chat.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { uploadMachineFiles } from "../middleware/upload.middleware.js";
const router = express.Router();

router.post("/chat", protect,uploadMachineFiles.array("files", 5), chatHandler);

export default router;