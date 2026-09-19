import KnowledgeBase from "../models/knowledgeBase.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
import Machine from "../models/machine.model.js";
import { validSolutionText } from "../utils/solutionValidation.util.js";
import { upsertKnowledgeToVectorDB } from "../services/vector.service.js";

export const getKnowledgeBase = async (req, res) => {
  try {
    const scope = {
      companyId: req.user.companyId,
      department: req.user.department,
    };
    const knowledge = await KnowledgeBase.find(scope)
      .populate("approvedBy", "name email role department")
      .populate("uploadedBy", "name email role")
      .populate("sourceFeedbackId", "userId revisionNumber resubmittedAt")
      .sort({ updatedAt: -1 });
    const machines = await Machine.find(scope).select("_id");
    const documents = await ChatAttachment.find({
      companyId: req.user.companyId,
      machineId: { $in: machines.map((machine) => machine._id) },
      $or: [
        { sessionId: null },
        { sessionId: "" },
        {
          knowledgeStatus: {
            $in: ["permanent", "approved", "pending_approval", "rejected"],
          },
        },
      ],
    })
      .select(
        "originalName mimeType size machineId uploadedBy processingStatus processingError knowledgeStatus pageCount createdAt updatedAt",
      )
      .populate("uploadedBy", "name email role")
      .populate("machineId", "machineName")
      .sort({ updatedAt: -1 });
    res.json({ knowledge, documents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load knowledge base" });
  }
};

export const updateKnowledge = async (req, res) => {
  try {
    const { question, answer, isActive } = req.body;
    if (
      (question !== undefined && !validSolutionText(question)) ||
      (answer !== undefined && !validSolutionText(answer)) ||
      (isActive !== undefined && typeof isActive !== "boolean")
    )
      return res
        .status(400)
        .json({
          error:
            "Provide appropriate, non-empty question/answer text and a boolean isActive",
        });
    const changes = { approvedBy: req.user._id };
    if (question !== undefined) changes.question = question.trim();
    if (answer !== undefined) changes.answer = answer.trim();
    if (isActive !== undefined) changes.isActive = isActive;
    const knowledge = await KnowledgeBase.findOneAndUpdate(
      {
        _id: req.params.id,
        companyId: req.user.companyId,
        department: req.user.department,
      },
      { $set: changes },
      { returnDocument: "after", runValidators: true },
    );
    if (!knowledge)
      return res.status(404).json({ error: "Knowledge not found" });
    let vectorStored = false;
    if (knowledge.isActive) {
      try {
        await upsertKnowledgeToVectorDB(knowledge);
        vectorStored = true;
      } catch (error) {
        console.error("Knowledge vector update failed:", error.message);
      }
    }
    res.json({ knowledge, vectorStored });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update knowledge" });
  }
};

export const removeDocumentKnowledge = async (req, res) => {
  try {
    const machines = await Machine.find({
      companyId: req.user.companyId,
      department: req.user.department,
    }).select("_id");
    const document = await ChatAttachment.findOneAndUpdate(
      {
        _id: req.params.id,
        companyId: req.user.companyId,
        machineId: { $in: machines.map((machine) => machine._id) },
      },
      { $set: { knowledgeStatus: "rejected" } },
      { returnDocument: "after" },
    );
    if (!document) return res.status(404).json({ error: "Document not found" });
    res.json({
      message: "Document removed from permanent AI knowledge",
      attachmentId: document._id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not remove document knowledge" });
  }
};
