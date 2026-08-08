import { pineconeIndex } from "../config/pinecone.js";
import { createEmbeddings } from "./embedding.service.js";
import { rerankKnowledge } from "./knowledgeReranker.service.js";
import { rankCandidatesLexically } from "../utils/rankCandidatesLexically.js";
export const searchVectorDB = async (
  query,
  machineId = null,
  companyId = null,
) => {
  const embedding = await createEmbeddings(query);

  if (!embedding?.length) {
    console.log("No embedding generated for query");

    return [];
  }

  const filter = {};

  if (machineId) {
    filter.machineId = machineId.toString();
  }

  if (companyId) {
    filter.companyId = companyId.toString();
  }

  console.log("========== PINECONE SEARCH ==========");

  console.log("Query:", query);
  console.log("Filter:", filter);

  const result = await pineconeIndex.namespace("__default__").query({
    topK: 30,
    vector: embedding,
    includeMetadata: true,
    filter,
  });

  console.log(
    "Raw Pinecone matches:",
    result.matches?.map((match) => ({
      id: match.id,
      score: match.score,
      type: match.metadata?.type,
      pageNumber: match.metadata?.pageNumber,
      textPreview: match.metadata?.text?.substring(0, 150),
    })),
  );

  if (!result.matches || result.matches.length === 0) {
    return [];
  }

  /*
   * Use a loose first-stage threshold.
   *
   * Pinecone is now candidate generation,
   * not final relevance selection.
   */
  // const candidates =
  //   result.matches
  //     .filter((match) => {
  //       const type =
  //         match.metadata?.type ||
  //         "knowledge_base";

  //       if (type === "machine_document") {
  //         return match.score >= 0.30;
  //       }

  //       return match.score >= 0.70;
  //     })
  //     .map((match) => ({
  //       id: match.id,

  //       score: match.score,

  //       type:
  //         match.metadata?.type ||
  //         "knowledge_base",

  //       question:
  //         match.metadata?.question || "",

  //       answer:
  //         match.metadata?.answer || "",

  //       text:
  //         match.metadata?.text || "",

  //       machineName:
  //         match.metadata?.machineName ||
  //         "",

  //       fileName:
  //         match.metadata?.fileName || "",

  //       pageNumber:
  //         match.metadata?.pageNumber ??
  //         null,

  //       pageChunkIndex:
  //         match.metadata
  //           ?.pageChunkIndex ?? null,

  //       attachmentId:
  //         match.metadata?.attachmentId ||
  //         null,
  //     }));

  const candidates = result.matches
    .filter((match) => {
      const type = match.metadata?.type || "knowledge_base";

      if (type === "machine_document") {
        return true;
      }

      return match.score >= 0.7;
    })
    .map((match) => ({
      id: match.id,
      score: match.score,

      type: match.metadata?.type || "knowledge_base",

      question: match.metadata?.question || "",

      answer: match.metadata?.answer || "",

      text: match.metadata?.text || "",

      machineName: match.metadata?.machineName || "",

      fileName: match.metadata?.fileName || "",

      pageNumber: match.metadata?.pageNumber ?? null,

      pageChunkIndex: match.metadata?.pageChunkIndex ?? null,

      attachmentId: match.metadata?.attachmentId || null,
    }));
  if (candidates.length === 0) {
    return [];
  }

  console.log(
    "Candidates before reranking:",
    candidates.map((candidate) => ({
      score: candidate.score,
      pageNumber: candidate.pageNumber,
      textPreview: candidate.text.substring(0, 150),
    })),
  );

  // reranking lexically first
  const preRankedCandidates = rankCandidatesLexically({
    query,
    candidates,
    limit: 12,
  });

  console.log(
    "Candidates after lexical ranking:",
    preRankedCandidates.map((candidate) => ({
      pageNumber: candidate.pageNumber,

      vectorScore: candidate.score,

      lexicalScore: candidate.lexicalScore,

      matchedTokens: candidate.matchedTokens,

      preview: candidate.text.substring(0, 200),
    })),
  );

  /*
   * Second-stage semantic relevance check.
   */
  // const reranked = await rerankKnowledge({
  //   query,
  //   candidates,
  //   maxResults: 3,
  // });

  const reranked = await rerankKnowledge({
    query,
    candidates: preRankedCandidates,
    maxResults: 3,
  });

  return reranked;

  console.log(
    "Final reranked knowledge:",
    reranked.map((candidate) => ({
      score: candidate.score,
      pageNumber: candidate.pageNumber,
      textPreview: candidate.text.substring(0, 200),
    })),
  );

  return reranked;
};
