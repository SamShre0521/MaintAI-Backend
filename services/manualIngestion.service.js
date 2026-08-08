import {
  buildManualChunks,
} from "./manualChunking.service.js";

import {
  createEmbeddings,
} from "./embedding.service.js";

import {
  pineconeIndex,
} from "../config/pinecone.js";

export async function ingestManualToPinecone({
  attachment,
}) {
  if (!attachment) {
    throw new Error(
      "Attachment is required",
    );
  }

  if (
    attachment.processingStatus !==
    "completed"
  ) {
    throw new Error(
      "OCR must be completed before ingestion",
    );
  }

  if (
    !Array.isArray(attachment.ocrPages) ||
    attachment.ocrPages.length === 0
  ) {
    throw new Error(
      "Attachment has no OCR pages",
    );
  }

  const chunks =
    buildManualChunks({
      attachment,
    });

  if (chunks.length === 0) {
    throw new Error(
      "No manual chunks were generated",
    );
  }

  console.log(
    `Generated ${chunks.length} manual chunks`,
  );

  /*
   * Batch embeddings so we do not send
   * all manual chunks in one huge request.
   */
  const batchSize = 25;

  let totalUpserted = 0;

  for (
    let start = 0;
    start < chunks.length;
    start += batchSize
  ) {
    const batch = chunks.slice(
      start,
      start + batchSize,
    );

    const texts = batch.map(
      (chunk) => chunk.text,
    );

    const embeddings =
      await createEmbeddings(texts);

    if (
      embeddings.length !== batch.length
    ) {
      throw new Error(
        "Embedding count does not match chunk count",
      );
    }

    const vectors = batch.map(
      (chunk, index) => ({
        /*
         * Deterministic ID.
         *
         * If the same document is re-ingested,
         * the same vector IDs get overwritten
         * instead of producing duplicates.
         */
        id: [
          "manual",
          attachment._id.toString(),
          chunk.pageNumber,
          chunk.pageChunkIndex,
        ].join("-"),

        values: embeddings[index],

        metadata: {
          ...chunk.metadata,

          text: chunk.text,

          knowledgeStatus:
            "permanent",
        },
      }),
    );

    await pineconeIndex.upsert(
      vectors,
    );

    totalUpserted += vectors.length;

    console.log(
      `Manual ingestion progress: ${totalUpserted}/${chunks.length}`,
    );
  }

  return {
    totalChunks: chunks.length,
    totalUpserted,
  };
}