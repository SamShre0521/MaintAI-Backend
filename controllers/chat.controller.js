import { v4 as uuidv4 } from "uuid";
import mongoose from "mongoose";
import Message from "../models/message.model.js";
import Session from "../models/session.model.js";
import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
import { generateResponse } from "../services/openai.service.js";
import { searchVectorDB } from "../services/search.service.js";
import { isMachineRelatedQuery } from "../services/queryValidation.service.js";
import { saveUploadedAttachments } from "../services/attachment.service.js";
import { processDocument } from "../services/documentProcessing.service.js";
import { buildRelevantAttachmentContext } from "../services/ocrContext.service.js";
import { resolveConversationQuery } from "../services/conversationResolver.service.js";

export const chatHandler = async (req, res) => {
  try {
    const { message, sessionId, machineId } = req.body;
    if (message !== undefined && typeof message !== "string")
      return res.status(400).json({ error: "Message must be text" });
    let attachmentIds = req.body.attachmentIds || [];
    if (typeof attachmentIds === "string") {
      try {
        attachmentIds = JSON.parse(attachmentIds);
      } catch {
        return res
          .status(400)
          .json({ error: "attachmentIds must be an array" });
      }
    }
    if (
      !Array.isArray(attachmentIds) ||
      attachmentIds.length > 5 ||
      !attachmentIds.every(
        (id) => typeof id === "string" && mongoose.isValidObjectId(id),
      )
    )
      return res.status(400).json({ error: "Invalid attachmentIds" });
    attachmentIds = [...new Set(attachmentIds)];
    if (!message?.trim() && !req.files?.length && !attachmentIds.length)
      return res
        .status(400)
        .json({ error: "Message or attachment is required" });
    const { companyId, _id: userId } = req.user;
    if (!companyId)
      return res
        .status(403)
        .json({ error: "User is not assigned to a company" });
    if (sessionId !== undefined && typeof sessionId !== "string")
      return res.status(400).json({ error: "Invalid sessionId" });
    let session = sessionId
      ? await Session.findOne({ sessionId, userId, companyId })
      : null;
    if (sessionId && !session)
      return res.status(404).json({ error: "Chat session not found" });
    if (session && machineId && machineId !== session.machineId?.toString())
      return res
        .status(400)
        .json({ error: "Start a new chat to change machines" });
    const resolvedMachineId = session?.machineId || machineId;
    if (!mongoose.isValidObjectId(resolvedMachineId))
      return res.status(400).json({ error: "A valid machine is required" });
    const machine = await Machine.findOne({
      _id: resolvedMachineId,
      companyId,
      department: req.user.department,
    });
    if (!machine) return res.status(404).json({ error: "Machine not found" });
    const preUploaded = await ChatAttachment.find({
      _id: { $in: attachmentIds },
      companyId,
      machineId: resolvedMachineId,
      uploadedBy: userId,
      messageId: null,
      $or: [
        { sessionId: "" },
        { sessionId: null },
        ...(session ? [{ sessionId: session.sessionId }] : []),
      ],
    });
    if (preUploaded.length !== attachmentIds.length)
      return res
        .status(404)
        .json({ error: "One or more attachments are unavailable" });
    const currentSessionId = session?.sessionId || uuidv4();
    const cleanMessage =
      message?.trim() ||
      "Read the attached machine document and summarize its relevant information.";
    // The session is already ownership-checked. This also supports legacy messages without user/company fields.
    const history = session
      ? (
          await Message.find({ sessionId: currentSessionId })
            .sort({ createdAt: -1, _id: -1 })
            .limit(20)
        ).reverse()
      : [];
    const conversation = history
      .slice(-6)
      .map(({ role, content }) => ({ role, content }));
    const validationText = `Machine: ${machine.machineName}\nRecent conversation: ${JSON.stringify(conversation)}\nUploaded files: ${(req.files || []).map((file) => file.originalname).join(", ")}\nCurrent question: ${cleanMessage}`;
    if (!(await isMachineRelatedQuery(validationText)))
      return res.status(200).json({
        error:
          "Please ask only machine-related troubleshooting, maintenance, operation, specification, or industrial equipment questions.",
      });
    if (!session)
      session = await Session.create({
        companyId,
        sessionId: currentSessionId,
        userId,
        department: req.user.department,
        machineId: resolvedMachineId,
        title:
          cleanMessage.length > 40
            ? `${cleanMessage.slice(0, 40)}...`
            : cleanMessage,
      });
    const uploads = await saveUploadedAttachments({
      files: req.files || [],
      companyId,
      machineId: resolvedMachineId,
      sessionId: currentSessionId,
      uploadedBy: userId,
    });
    const processed = [...preUploaded];
    for (let index = 0; index < uploads.length; index++) {
      const attachment = uploads[index];
      try {
        processed.push(
          await processDocument({ attachment, file: req.files[index] }),
        );
      } catch {
        processed.push(
          await ChatAttachment.findOne({ _id: attachment._id, companyId }),
        );
      }
    }
    if (preUploaded.length) {
      const linked = await ChatAttachment.updateMany(
        {
          _id: { $in: preUploaded.map((item) => item._id) },
          companyId,
          uploadedBy: userId,
          messageId: null,
          $or: [
            { sessionId: "" },
            { sessionId: null },
            { sessionId: currentSessionId },
          ],
        },
        { $set: { sessionId: currentSessionId } },
      );
      if (linked.matchedCount !== preUploaded.length)
        return res.status(409).json({
          error: "An attachment was linked to another chat. Please reload.",
        });
      uploads.push(...preUploaded);
    }
    // Resume scanned PDF jobs on subsequent messages without requiring a separate OCR call.
    const pending = await ChatAttachment.find({
      companyId,
      sessionId: currentSessionId,
      processingStatus: "processing",
      textractJobId: { $ne: "" },
      _id: {
        $nin: uploads
          .filter((item) => !preUploaded.includes(item))
          .map((item) => item._id),
      },
    });
    for (const attachment of pending) {
      try {
        const refreshed = await processDocument({ attachment });
        const index = processed.findIndex(
          (item) => item?._id.toString() === attachment._id.toString(),
        );
        if (index >= 0) processed[index] = refreshed;
      } catch (error) {
        console.error("Chat OCR failed:", error.message);
      }
    }
    const attachments = await ChatAttachment.find({
      companyId,
      sessionId: currentSessionId,
      processingStatus: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(20);
    const userMessage = await Message.create({
      companyId,
      userId,
      sessionId: currentSessionId,
      role: "user",
      content: cleanMessage,
      attachments: uploads.map((item) => item._id),
    });
    await ChatAttachment.updateMany(
      { _id: { $in: uploads.map((item) => item._id) }, companyId },
      { $set: { messageId: userMessage._id } },
    );
    const retrievalQuery = await resolveConversationQuery({
      currentMessage: cleanMessage,
      conversation,
      machineName: machine.machineName,
    });
    // Try the literal query first, preserving exact repeat matches of newly approved solutions.
    let knowledge = await searchVectorDB(
      cleanMessage,
      resolvedMachineId,
      companyId,
    );
    if (!knowledge.length && retrievalQuery !== cleanMessage)
      knowledge = await searchVectorDB(
        retrievalQuery,
        resolvedMachineId,
        companyId,
      );
    const knowledgeSources = knowledge.map((item) => ({
      knowledgeId: item.knowledgeId || null,
      attachmentId: item.attachmentId || null,
      score: item.score,
      type: item.type,
      fileName: item.fileName || null,
      pageNumber: item.pageNumber || null,
      sectionNumber: item.sectionNumber || null,
      machineName: item.machineName || machine.machineName,
      uploaderName: item.uploaderName || null,
      uploadedBy: item.uploadedBy || null,
      uploadedAt: item.uploadedAt || null,
      updatedAt: item.updatedAt || null,
      source: item.fileName || "Approved Internal Knowledge Base",
    }));
    const internalContext = knowledge
      .map(
        (item, index) =>
          `${JSON.stringify(knowledgeSources[index])}\n${item.type === "machine_document" ? item.text : `Approved fix\nQuestion: ${item.question}\nAnswer: ${item.answer}`}`,
      )
      .join("\n\n");
    let { context: attachmentContext, sources: attachmentOcrSources } =
      buildRelevantAttachmentContext({ query: retrievalQuery, attachments });
    // An explicit file-only upload can summarize the beginning of its extracted content.
    if (!message?.trim() && !attachmentContext) {
      const current = attachments.filter((item) =>
        uploads.some((upload) => upload._id.toString() === item._id.toString()),
      );
      attachmentContext = current
        .map(
          (item) =>
            `Document: ${item.originalName}\nExcerpt (may be incomplete):\n${item.extractedText.slice(0, 12000)}`,
        )
        .join("\n\n");
      attachmentOcrSources = current.map((item) => ({
        attachmentId: item._id.toString(),
        fileName: item.originalName,
        pageNumber: null,
        uploadedAt: item.createdAt,
      }));
    }
    const processingUploads = processed.filter(
      (item) => item?.processingStatus !== "completed",
    );
    let result;
    if (processingUploads.length && !internalContext && !attachmentContext) {
      result = {
        reply: processingUploads
          .map((item) =>
            item.processingStatus === "failed"
              ? `Could not read ${item.originalName}: ${item.processingError}`
              : `${item.originalName} is still being read. Please try your question again shortly.`,
          )
          .join("\n"),
        usedContext: false,
        usedWeb: false,
        webSources: [],
      };
    } else {
      result = await generateResponse(
        [...conversation, { role: "user", content: cleanMessage }],
        [internalContext, attachmentContext].filter(Boolean).join("\n\n"),
        { searchQuery: retrievalQuery, machineName: machine.machineName },
      );
    }
    const usedKnowledge = result.usedContext && knowledge.length > 0;
    const usedAttachment =
      result.usedContext && attachmentOcrSources.length > 0;
    const sourceType = result.usedWeb
      ? "web"
      : usedKnowledge && usedAttachment
        ? "mixed"
        : usedKnowledge
          ? "internal_knowledge"
          : usedAttachment
            ? "uploaded_document"
            : "unverified";
    const sourceMessage = {
      web: "No sufficient internal answer was found. This answer uses external web sources.",
      mixed: "Answer uses approved internal knowledge and uploaded documents.",
      internal_knowledge: "Answer uses approved MaintAI internal knowledge.",
      uploaded_document: "Answer uses text extracted from uploaded documents.",
      unverified: "No verified answer is available yet.",
    }[sourceType];
    const sourceFields = {
      sourceType,
      sourceMessage,
      knowledgeSources: usedKnowledge ? knowledgeSources : [],
      attachmentOcrSources: usedAttachment ? attachmentOcrSources : [],
      webSources: result.webSources,
    };
    const assistantMessage = await Message.create({
      companyId,
      userId,
      sessionId: currentSessionId,
      role: "assistant",
      content: result.reply,
      ...sourceFields,
    });
    await Session.updateOne(
      { _id: session._id, companyId, userId },
      { $set: { updatedAt: new Date() } },
    );
    return res.json({
      sessionId: currentSessionId,
      title: session.title,
      reply: result.reply,
      retrievalQuery,
      usedKnowledge: Boolean(usedKnowledge || usedAttachment),
      ...sourceFields,
      webSearchStatus: result.webSearchStatus,
      userMessageId: userMessage._id,
      assistantMessageId: assistantMessage._id,
      userCreatedAt: userMessage.createdAt,
      createdAt: assistantMessage.createdAt,
      attachments: processed.filter(Boolean).map((item) => ({
        id: item._id,
        originalName: item.originalName,
        mimeType: item.mimeType,
        attachmentType: item.attachmentType,
        size: item.size,
        processingStatus: item.processingStatus,
        processingError: item.processingError,
        knowledgeStatus: item.knowledgeStatus,
        pageCount: item.pageCount,
        hasExtractedText: Boolean(item.extractedText?.trim()),
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error("Chat error:", error);
    return res
      .status(500)
      .json({ error: "Could not complete the chat request. Please retry." });
  }
};
