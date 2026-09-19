import mongoose from "mongoose";
import ChatAttachment from "../models/chatAttachment.model.js";
import Machine from "../models/machine.model.js";
export async function attachmentAccess(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ error: "Invalid attachment ID" });
    const attachment = await ChatAttachment.findOne({
      _id: req.params.id,
      companyId: req.user.companyId,
    });
    if (!attachment)
      return res.status(404).json({ error: "Attachment not found" });
    const machine = await Machine.exists({
      _id: attachment.machineId,
      companyId: req.user.companyId,
      department: req.user.department,
    });
    const owns = attachment.uploadedBy.toString() === req.user._id.toString();
    const shared =
      !attachment.sessionId && attachment.knowledgeStatus === "permanent";
    if (!machine || (!owns && req.user.role !== "manager" && !shared))
      return res.status(404).json({ error: "Attachment not found" });
    if (req.method !== "GET" && !owns && req.user.role !== "manager")
      return res
        .status(403)
        .json({
          error: "Only the uploader or manager can process this attachment",
        });
    next();
  } catch (error) {
    next(error);
  }
}
