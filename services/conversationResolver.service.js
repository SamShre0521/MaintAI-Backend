import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function resolveConversationQuery({
  currentMessage,
  conversation = [],
  machineName = "",
}) {
  const cleanMessage = currentMessage?.trim() || "";

  if (!cleanMessage) {
    return "";
  }

  if (!Array.isArray(conversation) || conversation.length === 0) {
    return cleanMessage;
  }

  const conversationText = conversation
    .slice(-8)
    .map(
      (message) =>
        `${message.role.toUpperCase()}: ${message.content}`,
    )
    .join("\n");

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: `
You resolve conversational industrial-machine troubleshooting messages
into standalone retrieval queries.

The result will be used to search:
- machine manuals,
- approved troubleshooting knowledge,
- OCR text extracted from uploaded files.

Rules:

- Resolve only the latest user message.
- Use both previous user messages and assistant replies.
- Replace references such as:
  "it",
  "this",
  "that",
  "the cause",
  "the solution",
  "the countermeasure",
  "the first point",
  "the previous answer".

- Preserve:
  - machine symptom,
  - machine component,
  - operating mode,
  - error code,
  - pressure or temperature condition,
  - previously identified cause,
  - previously recommended countermeasure,
  - the user's latest requested action.

- Do not answer the question.
- Do not invent new causes, solutions, values, components, or procedures.
- Return one concise standalone search query.
- Return plain text only.
          `,
        },
        {
          role: "user",
          content: `
Machine:
${machineName || "Selected industrial machine"}

Conversation:
${conversationText}

Latest user message:
${cleanMessage}

Rewrite the latest user message as one standalone retrieval query.
          `,
        },
      ],
    });

    const resolvedQuery =
      response.output_text?.trim();

    if (!resolvedQuery) {
      console.warn(
        "Conversation resolver returned empty output. Using original message.",
      );

      return cleanMessage;
    }

    return resolvedQuery;
  } catch (error) {
    console.error(
      "Conversation resolver failed. Using original message:",
      error,
    );

    return cleanMessage;
  }
}