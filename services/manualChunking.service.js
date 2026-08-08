export function buildManualChunks({
  attachment,
  maxCharacters = 1800,
  overlapCharacters = 250,
}) {
  if (!attachment) {
    throw new Error("Attachment is required");
  }

  if (
    !Array.isArray(attachment.ocrPages) ||
    attachment.ocrPages.length === 0
  ) {
    throw new Error(
      "Attachment does not contain OCR pages",
    );
  }

  const chunks = [];

  for (const page of attachment.ocrPages) {
    const pageNumber = page.pageNumber;
    const pageText = cleanOcrText(page.text);

    if (!pageText) {
      continue;
    }

    const pageChunks = splitTextWithOverlap({
      text: pageText,
      maxCharacters,
      overlapCharacters,
    });

    pageChunks.forEach((text, pageChunkIndex) => {
      chunks.push({
        pageNumber,
        pageChunkIndex,
        text,

        metadata: {
          companyId:
            attachment.companyId.toString(),

          machineId:
            attachment.machineId.toString(),

          attachmentId:
            attachment._id.toString(),

          fileName:
            attachment.originalName,

          pageNumber,

          pageChunkIndex,

          type: "machine_document",
        },
      });
    });
  }

  return chunks;
}

function cleanOcrText(text = "") {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitTextWithOverlap({
  text,
  maxCharacters,
  overlapCharacters,
}) {
  if (!text) {
    return [];
  }

  if (text.length <= maxCharacters) {
    return [text];
  }

  const chunks = [];

  let start = 0;

  while (start < text.length) {
    let end = Math.min(
      start + maxCharacters,
      text.length,
    );

    /*
     * Avoid cutting in the middle of a sentence/line
     * whenever possible.
     */
    if (end < text.length) {
      const candidate = text.substring(
        start,
        end,
      );

      const lastBreak = Math.max(
        candidate.lastIndexOf("\n"),
        candidate.lastIndexOf(". "),
      );

      /*
       * Only use the natural break if enough text
       * remains in the current chunk.
       */
      if (
        lastBreak >
        maxCharacters * 0.6
      ) {
        end = start + lastBreak + 1;
      }
    }

    const chunk = text
      .substring(start, end)
      .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(
      end - overlapCharacters,
      start + 1,
    );
  }

  return chunks;
}