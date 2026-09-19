// Dry-run by default. Explicit --apply repairs metadata and reindexes existing approved fixes.
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import KnowledgeBase from "../models/knowledgeBase.model.js";
import Feedback from "../models/feedback.model.js";
import Session from "../models/session.model.js";
import Machine from "../models/machine.model.js";
import Message from "../models/message.model.js";
import { upsertKnowledgeToVectorDB } from "../services/vector.service.js";
const apply = process.argv.includes("--apply");
await connectDB();
const totals = {
  mode: apply ? "apply" : "dry-run",
  eligible: 0,
  skipped: 0,
  vectorFailures: 0,
};
try {
  for await (const knowledge of KnowledgeBase.find().cursor()) {
    const feedback = await Feedback.findById(knowledge.sourceFeedbackId);
    if (
      !feedback ||
      feedback.managerStatus !== "approved" ||
      !feedback.companyId
    ) {
      totals.skipped++;
      continue;
    }
    const session = await Session.findOne({
      sessionId: feedback.sessionId,
      userId: feedback.userId,
      companyId: feedback.companyId,
    });
    const machineId = feedback.machineId || session?.machineId;
    if (
      !machineId ||
      !(await Machine.exists({ _id: machineId, companyId: feedback.companyId }))
    ) {
      totals.skipped++;
      continue;
    }
    if (
      knowledge.companyId &&
      knowledge.companyId.toString() !== feedback.companyId.toString()
    ) {
      totals.skipped++;
      continue;
    }
    totals.eligible++;
    if (!apply) continue;
    // Preserve content and historical timestamps; only repair missing ownership metadata.
    await KnowledgeBase.updateOne(
      { _id: knowledge._id },
      {
        $set: {
          companyId: feedback.companyId,
          machineId,
          uploadedBy: feedback.userId,
        },
      },
      { timestamps: false },
    );
    await Feedback.updateOne(
      { _id: feedback._id },
      { $set: { machineId } },
      { timestamps: false },
    );
    const repaired = await KnowledgeBase.findById(knowledge._id);
    if (repaired.isActive !== false) {
      try {
        await upsertKnowledgeToVectorDB(repaired);
      } catch {
        totals.vectorFailures++;
      }
    }
  }
  if (apply) {
    for await (const session of Session.find().cursor()) {
      await Message.updateMany(
        {
          sessionId: session.sessionId,
          $or: [
            { companyId: { $exists: false } },
            { userId: { $exists: false } },
          ],
        },
        { $set: { companyId: session.companyId, userId: session.userId } },
        { timestamps: false },
      );
    }
  }
  console.log(JSON.stringify(totals));
} finally {
  await mongoose.disconnect();
}
