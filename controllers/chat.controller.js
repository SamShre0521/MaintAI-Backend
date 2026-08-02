import { v4 as uuidv4 } from "uuid";

import Message from "../models/message.model.js";
import Session from "../models/session.model.js";
import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";

import { generateResponse } from "../services/openai.service.js";
import { searchVectorDB } from "../services/search.service.js";
import { isMachineRelatedQuery } from "../services/queryValidation.service.js";
import { saveUploadedAttachments } from "../services/attachment.service.js";
import { processAttachmentWithOcr } from "../services/attachmentOcr.service.js";
import { supportsSynchronousOcr } from "../utils/attachment.util.js";

export const chatHandler = async (req, res) => {
  const { message, sessionId, machineId } = req.body;

  try {
    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required",
      });
    }

    if (!req.user.companyId) {
      return res.status(403).json({
        error: "User is not assigned to a company",
      });
    }

    const companyId = req.user.companyId;
    const userId = req.user._id;
    const currentSessionId = sessionId || uuidv4();

    console.log("========== CHAT REQUEST ==========");
    console.log("Chat message:", message);
    console.log("Request machine ID:", machineId);
    console.log("Request session ID:", sessionId);
    console.log("Resolved session ID:", currentSessionId);
    console.log("Uploaded files:", req.files?.length || 0);

    /*
     * 1. Resolve existing session.
     */
    let existingSession = null;

    if (sessionId) {
      existingSession = await Session.findOne({
        sessionId,
        userId,
        companyId,
      });

      if (!existingSession) {
        return res.status(404).json({
          error: "Chat session not found",
        });
      }
    }

    const resolvedMachineId =
      machineId || existingSession?.machineId;

    if (!resolvedMachineId) {
      return res.status(400).json({
        error: "Machine is required",
      });
    }

    /*
     * 2. Verify machine belongs to the user's company.
     */
    const machine = await Machine.findOne({
      _id: resolvedMachineId,
      companyId,
    });

    if (!machine) {
      return res.status(404).json({
        error:
          "Machine not found or does not belong to your company",
      });
    }

    /*
     * 3. Prepare query-validation context.
     */
    let validationText = message.trim();

    if (existingSession) {
      const previousMessages = await Message.find({
        sessionId: currentSessionId,
        companyId,
      })
        .sort({ createdAt: -1 })
        .limit(4);

      const previousContext = previousMessages
        .reverse()
        .map((item) => item.content)
        .join("\n");

      validationText = `
Previous machine issue context:
${previousContext}

Current user message:
${message}
`;
    }

    const isValidQuery =
      await isMachineRelatedQuery(validationText);

    if (!isValidQuery) {
      return res.status(200).json({
        error:
          "Please ask only machine-related troubleshooting, maintenance, operation, specification, or industrial equipment questions.",
      });
    }

    /*
     * 4. Create a session before uploading files so that
     * attachments use the real session UUID.
     */
    if (!existingSession) {
      existingSession = await Session.create({
        companyId,
        sessionId: currentSessionId,
        userId,
        department: req.user.department,
        machineId: resolvedMachineId,
        title:
          message.length > 40
            ? `${message.substring(0, 40)}...`
            : message,
      });
    }

    /*
     * 5. Upload files to S3 and create attachment metadata.
     */
    const uploadedAttachments =
      await saveUploadedAttachments({
        files: req.files || [],
        companyId,
        machineId: resolvedMachineId,
        sessionId: currentSessionId,
        uploadedBy: userId,
      });

    /*
     * 6. Run synchronous OCR on supported files.
     *
     * Supported initially:
     * JPG / JPEG / PNG / single-page PDF
     */
    const processedAttachments = [];

    for (const attachment of uploadedAttachments) {
      if (!supportsSynchronousOcr(attachment)) {
        processedAttachments.push(attachment);
        continue;
      }

      try {
        const processedAttachment =
          await processAttachmentWithOcr({
            attachmentId: attachment._id,
            companyId,
          });

        processedAttachments.push(
          processedAttachment || attachment,
        );
      } catch (ocrError) {
        console.error(
          `OCR failed for attachment ${attachment._id}:`,
          ocrError,
        );

        const failedAttachment =
          await ChatAttachment.findOne({
            _id: attachment._id,
            companyId,
          });

        processedAttachments.push(
          failedAttachment || attachment,
        );
      }
    }

    console.log(
      "Processed attachments:",
      processedAttachments.map((attachment) => ({
        id: attachment._id.toString(),
        processingStatus:
          attachment.processingStatus,
        extractedTextLength:
          attachment.extractedText?.length || 0,
      })),
    );

    /*
     * 7. Save the user message with attachment references.
     */
    const userMessage = await Message.create({
      companyId,
      sessionId: currentSessionId,
      userId,
      role: "user",
      content: message.trim(),
      attachments: processedAttachments.map(
        (attachment) => attachment._id,
      ),
    });

    /*
     * 8. Store reverse messageId link on attachments.
     */
    if (processedAttachments.length > 0) {
      await ChatAttachment.updateMany(
        {
          _id: {
            $in: processedAttachments.map(
              (attachment) => attachment._id,
            ),
          },
          companyId,
        },
        {
          $set: {
            messageId: userMessage._id,
          },
        },
      );
    }

    /*
     * 9. Retrieve recent conversation context.
     */
    const chats = await Message.find({
      sessionId: currentSessionId,
      companyId,
    })
      .sort({ createdAt: 1 })
      .limit(20);

    const formattedChats = chats
      .slice(-6)
      .map((chat) => ({
        role: chat.role,
        content: chat.content,
      }));

    /*
     * 10. Retrieve approved machine knowledge from Pinecone.
     */
    const relevantKnowledge = await searchVectorDB(
      message.trim(),
      resolvedMachineId,
      companyId,
    );

    let internalKnowledgeContext = "";

    if (relevantKnowledge.length > 0) {
      internalKnowledgeContext = relevantKnowledge
        .map((item, index) => {
          if (item.type === "machine_document") {
            return `Approved Machine Manual Context ${index + 1}:
Source File: ${item.fileName || "Unknown file"}
Machine: ${item.machineName || machine.machineName}
Relevance Score: ${item.score}
Extracted Manual Text:
${item.text || ""}`;
          }

          return `Approved Troubleshooting Context ${index + 1}:
Question: ${item.question || ""}
Answer: ${item.answer || ""}`;
        })
        .join("\n\n");
    }

    /*
     * 11. Build context from newly uploaded attachment OCR.
     */
    const attachmentContext = processedAttachments
      .filter(
        (attachment) =>
          attachment.processingStatus === "completed" &&
          attachment.extractedText?.trim(),
      )
      .map(
        (attachment, index) => `Current Uploaded Attachment ${index + 1}:
File Name: ${attachment.originalName}
File Type: ${attachment.attachmentType}
MIME Type: ${attachment.mimeType}

OCR Extracted Text:
${attachment.extractedText}`,
      )
      .join("\n\n");

    /*
     * 12. Combine approved knowledge and temporary
     * current-chat attachment evidence.
     */
    const combinedContext = [
      internalKnowledgeContext,
      attachmentContext,
    ]
      .filter((value) => value?.trim())
      .join("\n\n");

    console.log(
      "Internal knowledge context length:",
      internalKnowledgeContext.length,
    );
    console.log(
      "Attachment OCR context length:",
      attachmentContext.length,
    );

    /*
     * 13. Generate the AI response.
     */
    const reply = await generateResponse(
      formattedChats,
      combinedContext,
    );

    /*
     * 14. Save assistant response.
     */
    await Message.create({
      companyId,
      sessionId: currentSessionId,
      userId,
      role: "assistant",
      content: reply,
      attachments: [],
    });

    await Session.findOneAndUpdate(
      {
        sessionId: currentSessionId,
        userId,
        companyId,
      },
      {
        $set: {
          updatedAt: new Date(),
        },
      },
    );

    /*
     * 15. Prepare source metadata.
     */
    const knowledgeSources = relevantKnowledge.map(
      (item) => ({
        score: item.score,
        type: item.type,
        fileName: item.fileName || null,
        machineName: item.machineName || null,
        source:
          item.type === "machine_document"
            ? item.fileName
            : "Approved Internal Knowledge Base",
      }),
    );

    const attachmentResponse =
      processedAttachments.map((attachment) => ({
        id: attachment._id.toString(),
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        attachmentType:
          attachment.attachmentType,
        size: attachment.size,
        processingStatus:
          attachment.processingStatus,
        knowledgeStatus:
          attachment.knowledgeStatus,
        hasExtractedText: Boolean(
          attachment.extractedText?.trim(),
        ),
      }));

    const usedInternalKnowledge =
      relevantKnowledge.length > 0;

    const usedAttachmentOcr =
      processedAttachments.some(
        (attachment) =>
          attachment.processingStatus ===
            "completed" &&
          attachment.extractedText?.trim(),
      );

    let sourceType = "general_ai";

    if (
      usedInternalKnowledge &&
      usedAttachmentOcr
    ) {
      sourceType = "mixed";
    } else if (usedInternalKnowledge) {
      sourceType = "internal_knowledge";
    } else if (usedAttachmentOcr) {
      sourceType = "uploaded_document";
    }

    let sourceMessage =
      "Answer generated using AI general knowledge.";

    if (sourceType === "mixed") {
      sourceMessage =
        "Answer generated using MaintAI internal knowledge and text extracted from the uploaded attachment.";
    } else if (
      sourceType === "internal_knowledge"
    ) {
      sourceMessage =
        "Answer generated using MaintAI internal knowledge.";
    } else if (
      sourceType === "uploaded_document"
    ) {
      sourceMessage =
        "Answer generated using text extracted from the uploaded attachment.";
    }

    return res.status(200).json({
      sessionId: currentSessionId,
      title: existingSession.title,
      reply,

      usedKnowledge:
        usedInternalKnowledge ||
        usedAttachmentOcr,

      sourceType,
      sourceMessage,

      knowledgeSources,
      attachments: attachmentResponse,
    });
  } catch (error) {
    console.error("========== CHAT ERROR ==========");
    console.error(error);
    console.error(error.stack);

    return res.status(500).json({
      error:
        error.message || "Something went wrong",
    });
  }
};