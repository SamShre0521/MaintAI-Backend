import { pineconeIndex } from "../config/pinecone.js";
import { createEmbeddings } from "./embedding.service.js";
import { rerankKnowledge } from "./knowledgeReranker.service.js";
import KnowledgeBase from "../models/knowledgeBase.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";
import { rankCandidatesLexically } from "../utils/retrievalScoring.util.js";

export const searchVectorDB = async (query, machineId, companyId) => {
  if (!companyId || !machineId)
    throw new Error("Company and machine are required for retrieval");
  const scope = { companyId, machineId, isActive: { $ne: false } };
  // Mongo is authoritative: new approvals work immediately even while vector indexing is unavailable.
  const escapedQuestion = query
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  const exact = await KnowledgeBase.findOne({
    ...scope,
    question: { $regex: `^\\s*${escapedQuestion}\\s*$`, $options: "i" },
  })
    .populate("uploadedBy", "name")
    .sort({ updatedAt: -1 });
  if (exact) return [knowledgeCandidate(exact)];

  const recent = await KnowledgeBase.find(scope)
    .populate("uploadedBy", "name")
    .sort({ updatedAt: -1 })
    .limit(200);
  const freshCandidates = rankCandidatesLexically({
    query,
    candidates: recent.map(knowledgeCandidate),
    limit: 15,
  }).filter((item) => item.lexicalScore > 0);
  let vectorMatches = [];
  try {
    const embedding = await createEmbeddings(query);
    const result = await pineconeIndex
      .namespace("__default__")
      .query({
        topK: 40,
        vector: embedding,
        includeMetadata: true,
        filter: {
          companyId: companyId.toString(),
          machineId: machineId.toString(),
        },
      });
    vectorMatches = result.matches || [];
  } catch (error) {
    console.error(
      "Vector retrieval unavailable; using approved database fixes:",
      error.message,
    );
  }

  const knowledgeIds = vectorMatches
    .filter((match) => match.metadata?.type !== "machine_document")
    .map((match) => match.metadata?.knowledgeId || match.id)
    .filter((id) => /^[a-f\d]{24}$/i.test(id));
  const authoritative = await KnowledgeBase.find({
    ...scope,
    _id: { $in: knowledgeIds },
  }).populate("uploadedBy", "name");
  const fixes = [
    ...new Map(
      [...freshCandidates, ...authoritative.map(knowledgeCandidate)].map(
        (item) => [item.id, item],
      ),
    ).values(),
  ];
  if (fixes.length) {
    const relevantFixes = await rerankKnowledge({
      query,
      candidates: fixes,
      maxResults: 3,
    });
    if (relevantFixes.length)
      return relevantFixes.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
      );
  }

  // Re-check document state so a manager's removal takes effect even with stale vectors.
  const manualMatches = vectorMatches.filter(
    (match) => match.metadata?.type === "machine_document",
  );
  const ids = manualMatches
    .map((match) => match.metadata.attachmentId)
    .filter((id) => /^[a-f\d]{24}$/i.test(id));
  const documents = await ChatAttachment.find({
    _id: { $in: ids },
    companyId,
    machineId,
    knowledgeStatus: "permanent",
    processingStatus: "completed",
  }).populate("uploadedBy", "name");
  const byId = new Map(documents.map((item) => [item._id.toString(), item]));
  const manuals = manualMatches
    .filter((match) => byId.has(match.metadata.attachmentId))
    .map((match) => {
      const doc = byId.get(match.metadata.attachmentId);
      return {
        ...match.metadata,
        id: match.id,
        score: match.score,
        uploadedBy: doc.uploadedBy?._id?.toString(),
        uploaderName: doc.uploadedBy?.name,
        uploadedAt: doc.createdAt,
        text: match.metadata.text || "",
      };
    });
  return rerankKnowledge({
    query,
    candidates: rankCandidatesLexically({
      query,
      candidates: manuals,
      limit: 15,
    }),
    maxResults: 3,
  });
};

function knowledgeCandidate(item) {
  return {
    id: item._id.toString(),
    knowledgeId: item._id.toString(),
    type: "knowledge_base",
    question: item.question,
    answer: item.answer,
    text: "",
    machineName: item.machineName,
    uploadedBy: item.uploadedBy?._id?.toString(),
    uploaderName: item.uploadedBy?.name || null,
    uploadedAt: item.createdAt,
    updatedAt: item.updatedAt,
    score: 1,
  };
}
