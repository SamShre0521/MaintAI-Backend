import ChatAttachment from "../models/chatAttachment.model.js";
import Machine from "../models/machine.model.js";
import { ingestManualToPinecone } from "../services/manualIngestion.service.js";

// Both lists are limited to machines the current user can access.
export async function listDocuments(req, res) {
  try {
    const machines = await Machine.find({
      companyId: req.user.companyId,
      department: req.user.department,
    }).select("_id");
    const filter = {
      companyId: req.user.companyId,
      machineId: { $in: machines.map((machine) => machine._id) },
    };
    if (req.query.machineId) {
      filter.machineId = { $in: machines.filter((machine) =>
        machine._id.toString() === req.query.machineId).map((machine) => machine._id) };
    }
    if (req.user.role !== "manager") filter.uploadedBy = req.user._id;
    if (req.query.status) {
      const statuses = ["temporary", "pending_approval", "approved", "rejected", "permanent"];
      if (!statuses.includes(req.query.status)) {
        return res.status(400).json({ error: "Invalid document status" });
      }
      filter.knowledgeStatus = req.query.status;
    }
    const attachments = await ChatAttachment.find(filter)
      .select("originalName documentTitle machineId uploadedBy createdAt processingStatus processingError knowledgeStatus submittedAt reviewedBy reviewedAt reviewComment pageCount")
      .populate("uploadedBy", "name email")
      .populate("reviewedBy", "name")
      .sort({ submittedAt: -1, createdAt: -1 });
    return res.json({ attachments });
  } catch (error) {
    console.error("List documents error:", error.message);
    return res.status(500).json({ error: "Could not list documents" });
  }
}

export async function submitDocument(req, res) {
  try {
    const title = req.body.documentTitle;
    if (title !== undefined && (typeof title !== "string" || !title.trim() || title.length > 200)) {
      return res.status(400).json({ error: "Document title must contain 1 to 200 characters" });
    }
    // Only the uploader can choose to share a private chat document.
    const attachment = await ChatAttachment.findOneAndUpdate({
      _id: req.params.id,
      companyId: req.user.companyId,
      uploadedBy: req.user._id,
      processingStatus: "completed",
      "ocrPages.0": { $exists: true },
      knowledgeStatus: { $in: ["temporary", "rejected"] },
    }, { $set: {
      knowledgeStatus: "pending_approval",
      submittedAt: new Date(), reviewedBy: null, reviewedAt: null, reviewComment: "",
      ...(title ? { documentTitle: title.trim() } : {}),
    } }, { returnDocument: "after" });
    if (!attachment) {
      return res.status(409).json({ error: "Only your completed temporary or rejected documents can be submitted" });
    }
    return res.json({ message: "Document submitted for manager approval", attachment });
  } catch (error) {
    console.error("Submit document error:", error.message);
    return res.status(500).json({ error: "Could not submit document" });
  }
}

export async function reviewDocument(req, res) {
  let attachment;
  try {
    const { decision, comment = "" } = req.body;
    if (!["approved", "rejected"].includes(decision) || typeof comment !== "string" || comment.length > 2000) {
      return res.status(400).json({ error: "Provide decision (approved or rejected) and a comment of up to 2000 characters" });
    }
    // Claim a pending document atomically so two managers cannot review it at once.
    attachment = await ChatAttachment.findOneAndUpdate({
      _id: req.params.id, companyId: req.user.companyId,
      knowledgeStatus: "pending_approval", processingStatus: "completed",
    }, { $set: {
      knowledgeStatus: decision, reviewedBy: req.user._id,
      reviewedAt: new Date(), reviewComment: comment.trim(),
    } }, { returnDocument: "after" });
    if (!attachment) return res.status(409).json({ error: "Document is no longer pending review" });
    if (decision === "approved") {
      await ingestManualToPinecone({ attachment });
      await Machine.updateOne({ _id: attachment.machineId, companyId: req.user.companyId }, {
        $addToSet: { attachments: attachment._id },
      });
      attachment.knowledgeStatus = "permanent";
      await attachment.save();
    }
    return res.json({ message: decision === "approved" ? "Document added to machine knowledge" : "Document rejected", attachment });
  } catch (error) {
    // Retrieval checks Mongo status, so partially indexed documents stay hidden.
    // Deterministic vector IDs allow the manager to retry without duplicates.
    if (attachment && req.body.decision === "approved") {
      await ChatAttachment.updateOne({ _id: attachment._id, knowledgeStatus: { $in: ["approved", "permanent"] } }, {
        $set: { knowledgeStatus: "pending_approval", reviewedBy: null, reviewedAt: null },
      }).catch((rollbackError) => console.error("Review reset failed:", rollbackError.message));
    }
    console.error("Review document error:", error.message);
    return res.status(500).json({ error: "Could not complete review. Please retry." });
  }
}
