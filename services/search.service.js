import { pineconeIndex } from "../config/pinecone.js";
import { createEmbedding } from "./embedding.service.js";

export const searchVectorDB = async (query, department) => {
  const embedding = await createEmbedding(query);

  const result = await pineconeIndex.namespace("__default__").query({
    topK: 3,
    vector: embedding,
    includeMetadata: true,
    filter: {
      department: department,
    },
  });

  if (!result.matches || result.matches.length === 0) {
    return [];
  }

  const MIN_SCORE = 0.50;

  const filteredMatches = result.matches.filter(
    (match) => match.score >= MIN_SCORE,
  );

  return filteredMatches.map((match) => ({
    score: match.score,
    question: match.metadata.question,
    answer: match.metadata.answer,
  }));
};
