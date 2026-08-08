import express from "express";
import {
  protect,
} from "../middleware/auth.middleware.js";

import {
  uploadAttachments,
} from "../middleware/upload.middleware.js";

import {
  checkAttachmentMultiPageOcr,
  getAttachmentDownloadUrl,
  processAttachmentOcr,
  startAttachmentMultiPageOcr,
  uploadTestAttachments,
  previewManualChunks,
  ingestManualKnowledge,
} from "../controllers/attachment.controller.js";

const router = express.Router();

router.post(
  "/test-upload",
  protect,
  uploadAttachments.array("files", 5),
  uploadTestAttachments,
);

// router.get(
//   "/:id/download-url",
//   protect,
//   getAttachmentDownloadUrl,
// );
router.post(
  "/:id/process-ocr",
  protect,
  processAttachmentOcr,
);
router.post(
  "/:id/multi-page-ocr/start",
  protect,
  startAttachmentMultiPageOcr,
);

router.get(
  "/:id/multi-page-ocr/status",
  protect,
  checkAttachmentMultiPageOcr,
);

router.post(
  "/test-upload",
  protect,
  uploadAttachments.array(
    "files",
    5,
  ),
  uploadTestAttachments,
);

router.post(
  "/:id/process-ocr",
  protect,
  processAttachmentOcr,
);

router.post(
  "/:id/multi-page-ocr/start",
  protect,
  startAttachmentMultiPageOcr,
);

router.get(
  "/:id/multi-page-ocr/status",
  protect,
  checkAttachmentMultiPageOcr,
);

router.get(
  "/:id/download-url",
  protect,
  getAttachmentDownloadUrl,
);

router.get(
  "/:id/manual-chunks/preview",
  protect,
  previewManualChunks,
);

router.post(
  "/:id/manual-ingestion",
  protect,
  authorizeRoles("manager"),
  ingestManualKnowledge,
);

export default router;