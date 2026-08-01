import { v4 as uuidv4 } from "uuid";

import Message from "../models/message.model.js";
import Session from "../models/session.model.js";
import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";

import { generateResponse } from "../services/openai.service.js";
import { searchVectorDB } from "../services/search.service.js";
import { isMachineRelatedQuery } from "../services/queryValidation.service.js";
import { saveUploadedAttachments } from "../services/attachment.service.js";

export const chatHandler = async (req, res) => {
  const {
    message,
    sessionId,
    machineId,
  } = req.body;

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
     *
     * For continued chats, machineId may not be present in the request.
     * Therefore, first load the session and retrieve its machineId.
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
     * 2. Verify the selected/resolved machine belongs
     * to the authenticated user's company.
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
     * 3. Prepare validation context.
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
     * 4. Create session for a new conversation.
     *
     * The real session ID must exist before uploading files,
     * so attachments are never stored under temporary/.
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
     * 5. Upload attachments to S3 and store metadata.
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
     * 6. Save the user message and link attachment IDs.
     */
    const userMessage = await Message.create({
      companyId,
      sessionId: currentSessionId,
      userId,
      role: "user",
      content: message.trim(),
      attachments: uploadedAttachments.map(
        (attachment) => attachment._id,
      ),
    });

    /*
     * Optional reverse link:
     * Store the created message ID on each ChatAttachment.
     */
    if (uploadedAttachments.length > 0) {
      await ChatAttachment.updateMany(
        {
          _id: {
            $in: uploadedAttachments.map(
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
     * 7. Retrieve recent chat history.
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
     * 8. Retrieve machine-specific approved knowledge.
     */
    const relevantKnowledge = await searchVectorDB(
      message.trim(),
      resolvedMachineId,
      companyId,
    );

    let contextText = "";

    if (relevantKnowledge.length > 0) {
      contextText = relevantKnowledge
        .map((item, index) => {
          if (item.type === "machine_document") {
            return `Context ${index + 1}:
Source File: ${item.fileName || "Unknown file"}
Machine: ${item.machineName || machine.machineName}
Relevance Score: ${item.score}
Extracted Manual Text:
${item.text || ""}`;
          }

          return `Context ${index + 1}:
Question: ${item.question || ""}
Answer: ${item.answer || ""}`;
        })
        .join("\n\n");
    }

    /*
     * Phase 1 boundary:
     *
     * We are storing attachments, but we are not yet sending
     * their content to OCR/OpenAI Vision.
     *
     * Phase 2 will add extractedText here.
     * Phase 3 will add visualAnalysis here.
     */
    const reply = await generateResponse(
      formattedChats,
      contextText,
    );

    /*
     * 9. Save assistant response.
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
     * 10. Prepare source metadata.
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
      uploadedAttachments.map((attachment) => ({
        id: attachment._id.toString(),
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        attachmentType: attachment.attachmentType,
        size: attachment.size,
        processingStatus:
          attachment.processingStatus,
        knowledgeStatus:
          attachment.knowledgeStatus,
      }));

    return res.status(200).json({
      sessionId: currentSessionId,
      title: existingSession.title,
      reply,

      usedKnowledge: relevantKnowledge.length > 0,

      sourceType:
        relevantKnowledge.length > 0
          ? "internal_knowledge"
          : "general_ai",

      sourceMessage:
        relevantKnowledge.length > 0
          ? "Answer generated using MaintAI internal knowledge."
          : "Answer generated using AI general knowledge.",

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