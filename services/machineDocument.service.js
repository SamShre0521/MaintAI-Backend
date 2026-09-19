import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
import { saveUploadedAttachments } from "./attachment.service.js";
import { processDocument } from "./documentProcessing.service.js";
import { ingestManualToPinecone } from "./manualIngestion.service.js";

export async function processMachineFiles({
  machineId,
  files,
  companyId,
  uploadedBy,
}) {
  const machine = await Machine.findOne({ _id: machineId, companyId });
  if (!machine) throw new Error("Machine not found for document processing");
  // Process independently: a failed upload must not strand all remaining files.
  for (const file of files || []) {
    const filter = {
      _id: machineId,
      companyId,
      ...(file.machineFileId
        ? { "files._id": file.machineFileId }
        : { "files.originalName": file.originalname }),
    };
    let attachment;
    try {
      await Machine.updateOne(filter, {
        $set: {
          "files.$.processingStatus": "processing",
          "files.$.errorMessage": "",
        },
      });
      [attachment] = await saveUploadedAttachments({
        files: [file],
        companyId,
        machineId,
        uploadedBy,
        sessionId: null,
      });
      await Machine.updateOne(
        { _id: machineId, companyId },
        { $addToSet: { attachments: attachment._id } },
      );
      const processed = await processDocument({
        attachment,
        file,
        waitForOcr: true,
      });
      await ingestManualToPinecone({ attachment: processed });
      await ChatAttachment.updateOne(
        { _id: attachment._id, companyId },
        { $set: { knowledgeStatus: "permanent" } },
      );
      await Machine.updateOne(filter, {
        $set: {
          "files.$.processingStatus": "completed",
          "files.$.errorMessage": "",
        },
      });
    } catch (error) {
      if (attachment)
        await ChatAttachment.updateOne(
          { _id: attachment._id, companyId },
          {
            $set: {
              processingStatus: "failed",
              processingError: error.message,
            },
          },
        );
      await Machine.updateOne(filter, {
        $set: {
          "files.$.processingStatus": "failed",
          "files.$.errorMessage": error.message,
        },
      });
      console.error("Machine document processing failed:", error.message);
    }
  }
}
