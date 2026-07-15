import { v4 as uuidv4 } from "uuid";
import Message from "../models/message.model.js";
import Session from "../models/session.model.js";
import { generateResponse } from "../services/openai.service.js";
import { searchVectorDB } from "../services/search.service.js";
import { isMachineRelatedQuery } from "../services/queryValidation.service.js";

export const chatHandler = async (req, res) => {
  const { message, sessionId, machineId } = req.body;

  try {
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let validationText = message;

    if (sessionId) {
      const previousMessages = await Message.find({ sessionId })
        .sort({ createdAt: -1 })
        .limit(4);

      const previousContext = previousMessages
        .map((msg) => msg.content)
        .join("\n");

      validationText = `
Previous machine issue context:
${previousContext}

Current user message:
${message}
`;
    }

    const isValidQuery = await isMachineRelatedQuery(validationText);

    if (!isValidQuery) {
      return res.status(200).json({
        error:
          "Please ask only machine-related troubleshooting, maintenance, operation, specification, or industrial equipment questions.",
      });
    }

    console.log("User message:", message);
    const currentSessionId = sessionId || uuidv4();

    let existingSession = await Session.findOne({
      sessionId: currentSessionId,
      userId: req.user._id,
      department: req.user.department,
    });

    if (!existingSession) {
      existingSession = await Session.create({
        sessionId: currentSessionId,
        userId: req.user._id,
        department: req.user.department,
        machineId: machineId || null,
        title: message.length > 40 ? message.substring(0, 40) + "..." : message,
      });
    }

    await Message.create({
      sessionId: currentSessionId,
      role: "user",
      content: message,
    });

    const chats = await Message.find({ sessionId: currentSessionId }).sort({
      createdAt: 1,
    });

    const formattedChats = chats.slice(-6).map((chat) => ({
      role: chat.role,
      content: chat.content,
    }));

    const relevantKnowledge = await searchVectorDB(
      message,
      machineId || existingSession.machineId,
    );

    // console.log("RAG results:", relevantKnowledge);

    let contextText = "";

    if (relevantKnowledge.length > 0) {
      contextText = relevantKnowledge
        .map((item, index) => {
          if (item.type === "machine_document") {
            return `Context ${index + 1}:
Source File: ${item.fileName}
Machine: ${item.machineName}
Relevance Score: ${item.score}
Extracted Manual Text:
${item.text}`;
          }

          return `Context ${index + 1}:
Question: ${item.question}
Answer: ${item.answer}`;
        })
        .join("\n\n");
    }

    // console.log("Context:", contextText);

    const ragChats = [
      {
        role: "system",
        content: `
You are a senior manufacturing engineer.

Use the following context if relevant:

${contextText}

If context is useful:
- prioritize it
- give practical solutions

If not:
- answer normally
`,
      },
      ...formattedChats,
    ];

    // const reply = await generateResponse(formattedChats);
    const reply = await generateResponse(formattedChats, contextText);

    await Message.create({
      sessionId: currentSessionId,
      role: "assistant",
      content: reply,
    });

    await Session.findOneAndUpdate(
      { sessionId: currentSessionId, userId: req.user._id },
      { $set: { updatedAt: new Date() } },
    );

    const knowledgeSources = relevantKnowledge.map((item) => ({
      score: item.score,
      type: item.type,
      fileName: item.fileName || null,
      machineName: item.machineName || null,
      source:
        item.type === "machine_document"
          ? item.fileName
          : "Approved Internal Knowledge Base",
    }));

    // console.log("Final relevantKnowledge length:", relevantKnowledge.length);

    res.json({
      sessionId: currentSessionId,
      title: existingSession.title,
      reply,

      usedKnowledge: relevantKnowledge.length > 0,

      sourceType:
        relevantKnowledge.length > 0 ? "internal_knowledge" : "general_ai",

      sourceMessage:
        relevantKnowledge.length > 0
          ? "Answer generated using MaintAI internal knowledge."
          : "Answer generated using AI general knowledge.",

      knowledgeSources,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
