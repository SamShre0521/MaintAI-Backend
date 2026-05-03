import { pineconeIndex } from "../config/pinecone.js";
import { createEmbedding } from "./embedding.service.js";

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

  const embedding = await createEmbedding(textToEmbed);

  console.log("Embedding length:", embedding.length);

  const record = {
    id: knowledge._id.toString(),
    values: embedding,
    metadata: {
      knowledgeId: knowledge._id.toString(),
      question: knowledge.question || "",
      answer: knowledge.answer || "",
      department: knowledge.department || "",
      machineName: knowledge.machineName || "",
      issueType: knowledge.issueType || "",
      tags: (knowledge.tags || []).join(", "),
    },
  };

  // console.log("Pinecone record id:", record.id);
  // console.log("Pinecone " , record);

  // await pineconeIndex.namespace("__default__").upsert([record]);

  // console.log("✅ Vector stored in Pinecone");


  console.log("Pinecone ", record);

await pineconeIndex.namespace("__default__").upsert({
  records: [record],
});

console.log("✅ Vector stored in Pinecone");
};