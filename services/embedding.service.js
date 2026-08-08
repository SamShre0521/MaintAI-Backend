import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function createEmbeddings(input) {
  if (!input) {
    return [];
  }

  const texts = Array.isArray(input)
    ? input.map((text) => text?.trim()).filter(Boolean)
    : [input.toString().trim()].filter(Boolean);

  if (texts.length === 0) {
    return [];
  }

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  const embeddings = response.data.map(
    (item) => item.embedding,
  );

  /*
   * If caller passed one string,
   * return one vector.
   *
   * If caller passed an array,
   * return an array of vectors.
   */
  return Array.isArray(input)
    ? embeddings
    : embeddings[0];
}