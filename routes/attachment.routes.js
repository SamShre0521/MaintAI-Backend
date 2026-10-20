import { listDocuments, submitDocument, reviewDocument } from "../controllers/documentReview.controller.js";
import express from "express";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import { uploadAttachments } from "../middleware/upload.middleware.js";
import {
  checkAttachmentMultiPageOcr,
  getAttachmentDownloadUrl,
  processAttachmentOcr,
  startAttachmentMultiPageOcr,
  uploadTestAttachments,
  previewManualChunks,
  ingestManualKnowledge,
} from "../controllers/attachment.controller.js";
import { attachmentAccess } from "../middleware/attachmentAccess.middleware.js";
const router = express.Router();
router.get("/", protect, listDocuments);
router.post("/:id/submit", protect, attachmentAccess, submitDocument);
router.post("/:id/review", protect, authorizeRoles("manager"), attachmentAccess, reviewDocument);
router.post(
  "/test-upload",
  protect,
  uploadAttachments.array("files", 5),
  uploadTestAttachments,
);
router.post(
  "/upload",
  protect,
  uploadAttachments.array("files", 5),
  uploadTestAttachments,
);
router.post(
  "/:id/process-ocr",
  protect,
  attachmentAccess,
  processAttachmentOcr,
);
router.post(
  "/:id/multi-page-ocr/start",
  protect,
  attachmentAccess,
  startAttachmentMultiPageOcr,
);
router.get(
  "/:id/multi-page-ocr/status",
  protect,
  attachmentAccess,
  checkAttachmentMultiPageOcr,
);
router.get(
  "/:id/download-url",
  protect,
  attachmentAccess,
  getAttachmentDownloadUrl,
);
router.get(
  "/:id/manual-chunks/preview",
  protect,
  attachmentAccess,
  previewManualChunks,
);
router.post(
  "/:id/manual-ingestion",
  protect,
  authorizeRoles("manager"),
  attachmentAccess,
  ingestManualKnowledge,
);
export default router;
