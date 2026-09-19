import { selectRelevantOcrText } from "../utils/textChunks.util.js";

export function buildRelevantAttachmentContext({ query, attachments = [] }) {
  const matches = [];
  for (const attachment of attachments) {
    if (
      attachment.processingStatus !== "completed" ||
      !attachment.extractedText?.trim()
    )
      continue;
    const pages = attachment.ocrPages?.length
      ? attachment.ocrPages
      : [{ pageNumber: null, text: attachment.extractedText }];
    for (const page of pages) {
      const selected = selectRelevantOcrText({
        query,
        text: page.text,
        maxChunks: 2,
      });
      if (!selected.text.trim()) continue;
      matches.push({
        attachment,
        page,
        selected,
        score: Math.max(...selected.chunks.map((chunk) => chunk.score), 0),
      });
    }
  }
  const selected = matches
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return {
    context: selected
      .map(
        ({ attachment, page, selected }) =>
          `Uploaded document: ${attachment.originalName}\n${pageLabel(attachment, page.pageNumber)}\n${selected.text}`,
      )
      .join("\n\n"),
    sources: selected.map(({ attachment, page, selected }) => ({
      attachmentId: attachment._id.toString(),
      fileName: attachment.originalName,
      pageNumber: isPaginated(attachment) ? page.pageNumber : null,
      sectionNumber: isPaginated(attachment) ? null : page.pageNumber,
      uploadedAt: attachment.createdAt,
      selectedChunks: selected.chunks.map(({ startLine, endLine, score }) => ({
        startLine,
        endLine,
        score,
      })),
    })),
  };
}
function isPaginated(attachment) {
  return (
    attachment.mimeType === "application/pdf" ||
    attachment.mimeType.startsWith("image/")
  );
}
function pageLabel(attachment, number) {
  return number
    ? `${isPaginated(attachment) ? "Page" : "Section"}: ${number}`
    : "Page unavailable";
}
