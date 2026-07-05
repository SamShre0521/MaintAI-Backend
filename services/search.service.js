import { pineconeIndex } from "../config/pinecone.js";
import { createEmbedding } from "./embedding.service.js";

export const searchVectorDB = async (query, department, machineId = null) => {
  const embedding = await createEmbedding(query);

  const filter = {
    department,
  };

  if (machineId) {
    filter.machineId = machineId.toString();
  }

  const result = await pineconeIndex.namespace("__default__").query({
    topK: 5,
    vector: embedding,
    includeMetadata: true,
    filter,
  });

  console.log("Pinecone filter:", filter);
  console.log("Raw Pinecone matches:", result.matches);

  if (!result.matches || result.matches.length === 0) {
    return [];
  }

  const filteredMatches = result.matches.filter((match) => {
    const type = match.metadata?.type || "knowledge_base";

    if (type === "machine_document") {
      return match.score >= 0.30;
    }

    return match.score >= 0.75;
  });

  return filteredMatches.map((match) => ({
    score: match.score,
    type: match.metadata?.type || "knowledge_base",
    question: match.metadata?.question || "",
    answer: match.metadata?.answer || "",
    text: match.metadata?.text || "",
    machineName: match.metadata?.machineName || "",
    fileName: match.metadata?.fileName || "",
  }));
};