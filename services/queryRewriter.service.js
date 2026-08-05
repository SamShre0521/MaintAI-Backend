import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function rewriteRetrievalQuery({
  currentMessage,
  previousMessages = [],
  machineName = "",
}) {
  const cleanCurrentMessage =
    currentMessage?.trim() || "";

  if (!cleanCurrentMessage) {
    return "";
  }

  if (
    !Array.isArray(previousMessages) ||
    previousMessages.length === 0
  ) {
    return cleanCurrentMessage;
  }

  const conversation = previousMessages
    .slice(-6)
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
You rewrite conversational industrial-machine questions into standalone search queries.

Your output will be used for:
- machine-manual retrieval,
- approved troubleshooting retrieval,
- OCR text retrieval.

Rules:
- Rewrite only the latest user message.
- Use the previous conversation only to resolve references such as:
  "it", "this", "that", "the cause", "the solution", or "the countermeasure".
- Preserve the actual machine symptom, component, error code, operating mode, and requested action.
- Do not answer the question.
- Do not add causes, solutions, specifications, or facts not stated in the conversation.
- Return one concise standalone search query.
- Return plain text only.
          `,
        },
        {
          role: "user",
          content: `
Machine:
${machineName || "Selected industrial machine"}

Previous conversation:
${conversation}

Latest user message:
${cleanCurrentMessage}

Rewrite the latest message as a standalone retrieval query.
          `,
        },
      ],
    });

    const rewritten =
      response.output_text?.trim();

    return rewritten || cleanCurrentMessage;
  } catch (error) {
    console.error(
      "Query rewriting failed. Using original message:",
      error,
    );

    return cleanCurrentMessage;
  }
}