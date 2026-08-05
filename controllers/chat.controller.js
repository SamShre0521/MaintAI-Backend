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
import { buildRelevantAttachmentContext } from "../services/ocrContext.service.js";
import { resolveConversationQuery } from "../services/conversationResolver.service.js";

export const chatHandler = async (req, res) => {
  const { message, sessionId, machineId } = req.body;

  try {
    /*
     * 1. Validate the incoming request.
     */
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
    const cleanMessage = message.trim();
    const currentSessionId = sessionId || uuidv4();

    console.log("========== CHAT REQUEST ==========");
    console.log("Message:", cleanMessage);
    console.log("Requested machine ID:", machineId);
    console.log("Requested session ID:", sessionId);
    console.log("Resolved session ID:", currentSessionId);
    console.log("Uploaded file count:", req.files?.length || 0);

    /*
     * 2. Load an existing session for continued chats.
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

    /*
     * For a new chat, machineId comes from the request.
     * For a continued chat, it may be resolved from the session.
     */
    const resolvedMachineId =
      machineId || existingSession?.machineId;

    if (!resolvedMachineId) {
      return res.status(400).json({
        error: "Machine is required",
      });
    }

    /*
     * 3. Verify that the machine belongs to the user's company.
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
     * 4. Load previous conversation and OCR context before
     * machine-query validation.
     *
     * This helps validate short follow-up messages such as:
     * - Explain that
     * - Why?
     * - What should I check first?
     * - Tell me more
     */
    let previousMessagesForValidation = [];
    let previousAttachmentsForValidation = [];
    let validationText = cleanMessage;

    if (existingSession) {
      previousMessagesForValidation = await Message.find({
        sessionId: currentSessionId,
        userId,
        companyId,
      })
        .sort({ createdAt: -1 })
        .limit(6);

      const previousConversationContext = [
        ...previousMessagesForValidation,
      ]
        .reverse()
        .map(
          (item) =>
            `${item.role.toUpperCase()}: ${item.content}`,
        )
        .join("\n");

      previousAttachmentsForValidation =
        await ChatAttachment.find({
          sessionId: currentSessionId,
          companyId,
          processingStatus: "completed",
          extractedText: {
            $exists: true,
            $ne: "",
          },
        })
          .sort({ createdAt: -1 })
          .limit(5);

      const previousAttachmentContext =
        previousAttachmentsForValidation
          .map(
            (attachment, index) => `
Previous uploaded machine attachment ${index + 1}:
File: ${attachment.originalName}

OCR text:
${attachment.extractedText.slice(0, 2500)}
`,
          )
          .join("\n");

      validationText = `
This is a continued industrial-machine troubleshooting conversation.

Machine:
${
  machine.machineName ||
  machine.name ||
  "Selected machine"
}

Department:
${req.user.department || "Unknown"}

Previous conversation:
${
  previousConversationContext ||
  "No previous conversation messages are available."
}

Previous uploaded machine evidence:
${
  previousAttachmentContext ||
  "No previous uploaded machine evidence is available."
}

Current follow-up message:
${cleanMessage}

Important:
Short follow-up messages such as "explain that", "why",
"tell me more", "what next", "what should I check first",
"is this dangerous", or "explain the countermeasure"
must be treated as machine-related when they refer to
the troubleshooting context above.
`;
    }

    /*
     * 5. Validate that the user is asking a machine-related query.
     */
    const isValidQuery =
      await isMachineRelatedQuery(validationText);

    if (!isValidQuery) {
      return res.status(200).json({
        error:
          "Please ask only machine-related troubleshooting, maintenance, operation, specification, or industrial equipment questions.",
      });
    }

    /*
     * 6. Create a new session before uploading attachments.
     *
     * This ensures files are stored under the real session UUID,
     * rather than under a temporary S3 prefix.
     */
    if (!existingSession) {
      existingSession = await Session.create({
        companyId,
        sessionId: currentSessionId,
        userId,
        department: req.user.department,
        machineId: resolvedMachineId,
        title:
          cleanMessage.length > 40
            ? `${cleanMessage.substring(0, 40)}...`
            : cleanMessage,
      });
    }

    /*
     * 7. Upload files from the current request to S3 and save
     * attachment metadata in MongoDB.
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
     * 8. Run synchronous OCR on supported current uploads.
     *
     * Current support:
     * - image/jpeg
     * - image/png
     * - single-page PDF
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
      "Current processed attachments:",
      processedAttachments.map((attachment) => ({
        id: attachment._id.toString(),
        fileName: attachment.originalName,
        status: attachment.processingStatus,
        extractedTextLength:
          attachment.extractedText?.length || 0,
      })),
    );

    /*
     * 9. Load OCR attachments uploaded in earlier messages of
     * the same session.
     *
     * Reuse the results loaded during validation when possible.
     */
    const previousSessionAttachments =
      previousAttachmentsForValidation.length > 0
        ? previousAttachmentsForValidation
        : await ChatAttachment.find({
            companyId,
            sessionId: currentSessionId,
            processingStatus: "completed",
            extractedText: {
              $exists: true,
              $ne: "",
            },
          })
            .sort({ createdAt: -1 })
            .limit(5);

    /*
     * 10. Combine earlier attachments and current uploads.
     *
     * A Map prevents duplicate attachment records.
     */
    const contextualAttachmentMap = new Map();

    for (const attachment of [
      ...previousSessionAttachments,
      ...processedAttachments,
    ]) {
      contextualAttachmentMap.set(
        attachment._id.toString(),
        attachment,
      );
    }

    const contextualAttachments = [
      ...contextualAttachmentMap.values(),
    ];

    console.log(
      "Contextual attachments:",
      contextualAttachments.map((attachment) => ({
        id: attachment._id.toString(),
        fileName: attachment.originalName,
        status: attachment.processingStatus,
        extractedTextLength:
          attachment.extractedText?.length || 0,
      })),
    );

    /*
     * 11. Save the current user message.
     *
     * Only newly uploaded files are linked to this message.
     * Previous session attachments are reused only as context.
     */
    const userMessage = await Message.create({
      companyId,
      sessionId: currentSessionId,
      userId,
      role: "user",
      content: cleanMessage,
      attachments: processedAttachments.map(
        (attachment) => attachment._id,
      ),
    });

    /*
     * 12. Store the reverse message reference on new attachments.
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
     * 13. Load recent messages for conversation-aware answering.
     */
    const chats = await Message.find({
      sessionId: currentSessionId,
      companyId,
      userId,
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
     * 14. Build the conversation supplied to the resolver.
     *
     * The latest user message is excluded because it is passed
     * separately as currentMessage.
     */
    const retrievalConversation =
      formattedChats.length > 0
        ? formattedChats.slice(0, -1)
        : [];

    /*
     * Convert the latest conversational message into a
     * standalone retrieval query.
     *
     * Example:
     * "Explain that countermeasure"
     *
     * may become:
     * "Explain the fuse replacement countermeasure for the
     * machine stopping in AUTO mode."
     */
    const retrievalQuery =
      await resolveConversationQuery({
        currentMessage: cleanMessage,
        conversation: retrievalConversation,
        machineName:
          machine.machineName ||
          machine.name ||
          "Selected machine",
      });

    console.log(
      "Original user message:",
      cleanMessage,
    );

    console.log(
      "Resolved retrieval query:",
      retrievalQuery,
    );

    /*
     * 15. Search Pinecone using the standalone retrieval query.
     *
     * This runs whether or not a file was uploaded.
     */
    const relevantKnowledge = await searchVectorDB(
      retrievalQuery,
      resolvedMachineId,
      companyId,
    );

    let internalKnowledgeContext = "";

    if (relevantKnowledge.length > 0) {
      internalKnowledgeContext =
        relevantKnowledge
          .map((item, index) => {
            if (
              item.type === "machine_document"
            ) {
              return `Approved Machine Manual Context ${index + 1}:
Source File: ${item.fileName || "Unknown file"}
Machine: ${
                item.machineName ||
                machine.machineName ||
                machine.name ||
                "Selected machine"
              }
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
     * 16. Search the relevant OCR chunks using the resolved
     * standalone retrieval query.
     */
    const {
      context: attachmentContext,
      sources: attachmentOcrSources,
    } = buildRelevantAttachmentContext({
      query: retrievalQuery,
      attachments: contextualAttachments,
    });

    /*
     * 17. Combine permanent approved knowledge with temporary
     * session attachment evidence.
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

    console.log(
      "Selected OCR sources:",
      JSON.stringify(
        attachmentOcrSources,
        null,
        2,
      ),
    );

    /*
     * 18. Generate the final answer using the original chat
     * messages and retrieved context.
     *
     * The rewritten query is used only for retrieval.
     */
    const reply = await generateResponse(
      formattedChats,
      combinedContext,
    );

    /*
     * 19. Save the assistant response.
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
     * 20. Prepare permanent-knowledge source metadata.
     */
    const knowledgeSources =
      relevantKnowledge.map((item) => ({
        score: item.score,
        type: item.type,
        fileName: item.fileName || null,
        machineName: item.machineName || null,
        source:
          item.type === "machine_document"
            ? item.fileName
            : "Approved Internal Knowledge Base",
      }));

    /*
     * Return only files uploaded in the current request.
     *
     * A continued chat with no new upload correctly returns [].
     */
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

    /*
     * 21. Determine the answer source.
     */
    const usedInternalKnowledge =
      relevantKnowledge.length > 0;

    const usedAttachmentOcr =
      attachmentOcrSources.length > 0 &&
      contextualAttachments.some(
        (attachment) =>
          attachment.processingStatus ===
            "completed" &&
          Boolean(
            attachment.extractedText?.trim(),
          ),
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
        "Answer generated using MaintAI internal knowledge and text extracted from uploaded attachment evidence.";
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

    /*
     * 22. Return the response.
     *
     * retrievalQuery is included temporarily for UAT debugging.
     */
    return res.status(200).json({
      sessionId: currentSessionId,
      title: existingSession.title,
      reply,

      retrievalQuery,

      usedKnowledge:
        usedInternalKnowledge ||
        usedAttachmentOcr,

      sourceType,
      sourceMessage,

      knowledgeSources,
      attachmentOcrSources,
      attachments: attachmentResponse,
    });
  } catch (error) {
    console.error(
      "========== CHAT ERROR ==========",
    );

    console.error(error);
    console.error(error.stack);

    return res.status(500).json({
      error:
        error.message ||
        "Something went wrong",
    });
  }
};