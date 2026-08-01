import express from "express";

import {
  uploadTestAttachments,
  getAttachmentDownloadUrl,
  processAttachmentOcr
} from "../controllers/attachment.controller.js";

import {
  protect,
} from "../middleware/auth.middleware.js";

import {
  uploadAttachments,
} from "../middleware/upload.middleware.js";

const router = express.Router();

router.post(
  "/test-upload",
  protect,
  uploadAttachments.array("files", 5),
  uploadTestAttachments,
);

router.get(
  "/:id/download-url",
  protect,
  getAttachmentDownloadUrl,
);
router.post(
  "/:id/process-ocr",
  protect,
  processAttachmentOcr,
);

export default router;