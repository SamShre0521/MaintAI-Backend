import {
  selectRelevantOcrText,
} from "../utils/textChunk.util.js";

export function buildRelevantAttachmentContext({
  query,
  attachments,
}) {
  if (
    !Array.isArray(attachments) ||
    attachments.length === 0
  ) {
    return {
      context: "",
      sources: [],
    };
  }

  const sourceContexts = [];
  const sources = [];

  for (const attachment of attachments) {
    if (
      attachment.processingStatus !==
        "completed" ||
      !attachment.extractedText?.trim()
    ) {
      continue;
    }

    const selected = selectRelevantOcrText({
      query,
      text: attachment.extractedText,
      maxChunks: 3,
    });

    if (!selected.text.trim()) {
      continue;
    }

    sourceContexts.push(
      `CURRENT UPLOADED ATTACHMENT
File: ${attachment.originalName}
MIME type: ${attachment.mimeType}

Most relevant OCR sections:
${selected.text}`,
    );

    sources.push({
      attachmentId:
        attachment._id.toString(),
      fileName: attachment.originalName,
      selectedChunks: selected.chunks.map(
        (chunk) => ({
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          score: Number(
            chunk.score.toFixed(2),
          ),
          matchedTokens:
            chunk.matchedTokens,
        }),
      ),
    });
  }

  return {
    context: sourceContexts.join("\n\n"),
    sources,
  };
}