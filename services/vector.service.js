import { pineconeIndex } from "../config/pinecone.js";
import { createEmbeddings } from "./embedding.service.js";

export const upsertKnowledgeToVectorDB = async (knowledge) => {
  if (!knowledge || !knowledge._id) {
    throw new Error("Invalid knowledge object");
  }

  const textToEmbed = `
Question: ${knowledge.question}
Answer: ${knowledge.answer}
Machine: ${knowledge.machineName || ""}
Issue Type: ${knowledge.issueType || ""}
Tags: ${(knowledge.tags || []).join(", ")}
Department: ${knowledge.department}
`;

  const embedding = await createEmbeddings(textToEmbed);

  const record = {
    id: knowledge._id.toString(),
    values: embedding,
    metadata: {
      type: "knowledge_base",
      companyId: knowledge.companyId.toString(),
      machineId: knowledge.machineId.toString(),
      uploadedBy: knowledge.uploadedBy?.toString() || "",
      updatedAt: knowledge.updatedAt.toISOString(),
      knowledgeId: knowledge._id.toString(),
      question: knowledge.question || "",
      answer: knowledge.answer || "",
      department: knowledge.department || "",
      machineName: knowledge.machineName || "",
      issueType: knowledge.issueType || "",
      tags: (knowledge.tags || []).join(", "),
    },
  };

  await pineconeIndex.namespace("__default__").upsert({
    records: [record],
  });

  console.log("✅ Vector stored in Pinecone");
};
