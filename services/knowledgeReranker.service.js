import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function rerankKnowledge({
  query,
  candidates,
  maxResults = 3,
}) {
  if (
    !query?.trim() ||
    !Array.isArray(candidates) ||
    candidates.length === 0
  ) {
    return [];
  }

  const candidateText = candidates
    .map((candidate, index) => {
      return `
CANDIDATE ${index}

Type:
${candidate.type || "unknown"}

Page:
${candidate.pageNumber ?? "unknown"}

Vector similarity:
${candidate.score ?? 0}

Content:
${
  candidate.type === "machine_document"
    ? candidate.text || ""
    : `
Question:
${candidate.question || ""}

Answer:
${candidate.answer || ""}
`
}
`;
    })
    .join("\n\n");

  try {
    const response =
      await openai.responses.create({
        model: "gpt-4.1-mini",

        input: [
          {
            role: "system",
            content: `
You are a retrieval reranker for an industrial-machine knowledge base.

Your job is NOT to answer the user's question.

Your job is to identify which retrieved knowledge chunks actually contain information useful for answering the user's exact question.

Rules:

- Prefer chunks that directly answer the question.
- Prefer exact specifications, maintenance intervals, procedures, error descriptions, causes, and countermeasures.
- Reject chunks that only share broad words such as "hydraulic", "motor", "pressure", or "machine" but discuss a different subject.
- Do not invent relevance.
- A lower vector similarity chunk may rank higher if its actual text directly answers the query.
- Return ONLY valid JSON.
- Return candidate indexes from most relevant to least relevant.

EXACT-QUESTION RELEVANCE RULES:

- Identify the exact subject and action requested by the user.
- Prefer candidates that explicitly contain the answer to that exact action.
- Do not rank a candidate highly merely because it contains related words.

Example:

User asks:
"How often should hydraulic oil be replaced?"

Highly relevant:
"Replace hydraulic oil once every two years."

Not highly relevant:
"Clean hydraulic oil filter every month."
"Clean hydraulic oil filter every 3 to 6 months."
"Hydraulic pump makes abnormal sound."
"Check hydraulic oil viscosity."

These may be related to hydraulic oil maintenance, but they do not directly answer the replacement interval question.

If one candidate directly answers the question, rank it above all indirectly related candidates.
- Return no more than ${maxResults} candidates.

Required JSON format:

{
  "indexes": [1, 4, 7]
}

If none of the candidates answer or materially help answer the query:

{
  "indexes": []
}
`,
          },

          {
            role: "user",
            content: `
USER QUESTION:

${query}

RETRIEVED CANDIDATES:

${candidateText}
`,
          },
        ],
      });

    const raw =
      response.output_text?.trim();

    if (!raw) {
      return [];
    }

    const cleaned = raw
      .replace(/^```json/i, "")
      .replace(/^```/i, "")
      .replace(/```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!Array.isArray(parsed.indexes)) {
      return [];
    }

    return parsed.indexes
      .filter(
        (index) =>
          Number.isInteger(index) &&
          index >= 0 &&
          index < candidates.length,
      )
      .slice(0, maxResults)
      .map((index) => candidates[index]);
  } catch (error) {
    console.error(
      "Knowledge reranking failed:",
      error,
    );

    /*
     * Safe fallback:
     * return the highest vector matches.
     */
    return candidates.slice(0, maxResults);
  }
}