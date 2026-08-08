import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbeddings(
  texts,
) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const cleanTexts = texts
    .map((text) => text?.trim())
    .filter(Boolean);

  if (cleanTexts.length === 0) {
    return [];
  }

  const response =
    await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: cleanTexts,
    });

  return response.data.map(
    (item) => item.embedding,
  );
}