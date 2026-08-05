function normalizeText(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getQueryTokens(query = "") {
  const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "could",
  "detail",
  "details",
  "do",
  "does",
  "explain",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "machine",
  "more",
  "my",
  "of",
  "on",
  "one",
  "or",
  "please",
  "sentence",
  "should",
  "the",
  "then",
  "this",
  "to",
  "what",
  "when",
  "why",
  "with",
]);

  return [
    ...new Set(
      normalizeText(query)
        .split(" ")
        .filter(
          (token) =>
            token.length >= 3 &&
            !stopWords.has(token),
        ),
    ),
  ];
}

/**
 * Divides OCR output into overlapping groups of lines.
 *
 * Example:
 * linesPerChunk = 12
 * overlapLines = 4
 */
export function chunkOcrText(
  text,
  {
    linesPerChunk = 12,
    overlapLines = 4,
  } = {},
) {
  if (!text?.trim()) {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return [];
  }

  const safeOverlap = Math.min(
    overlapLines,
    Math.max(linesPerChunk - 1, 0),
  );

  const step = Math.max(
    linesPerChunk - safeOverlap,
    1,
  );

  const chunks = [];

  for (
    let start = 0;
    start < lines.length;
    start += step
  ) {
    const chunkLines = lines.slice(
      start,
      start + linesPerChunk,
    );

    if (chunkLines.length === 0) {
      continue;
    }

    chunks.push({
      index: chunks.length,
      startLine: start + 1,
      endLine: start + chunkLines.length,
      text: chunkLines.join("\n"),
    });

    if (start + linesPerChunk >= lines.length) {
      break;
    }
  }

  return chunks;
}

export function rankOcrChunks({
  query,
  chunks,
  limit = 3,
}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }

  const normalizedQuery = normalizeText(query);
  const queryTokens = getQueryTokens(query);

  if (
    !normalizedQuery ||
    queryTokens.length === 0
  ) {
    return chunks.slice(0, limit).map((chunk) => ({
      ...chunk,
      score: 0,
      matchedTokens: [],
    }));
  }

  const ranked = chunks.map((chunk) => {
    const normalizedChunk = normalizeText(
      chunk.text,
    );

    let score = 0;
    const matchedTokens = [];

    for (const token of queryTokens) {
      const pattern = new RegExp(
        `\\b${escapeRegExp(token)}\\b`,
        "g",
      );

      const occurrences =
        normalizedChunk.match(pattern)?.length ?? 0;

      if (occurrences > 0) {
        matchedTokens.push(token);

        // Reward both token presence and repetition.
        score += 3 + Math.min(occurrences, 3);
      }
    }

    // Reward phrase-like matches from adjacent query tokens.
    for (
      let index = 0;
      index < queryTokens.length - 1;
      index += 1
    ) {
      const phrase =
        `${queryTokens[index]} ${queryTokens[index + 1]}`;

      if (normalizedChunk.includes(phrase)) {
        score += 6;
      }
    }

    // Give a strong reward when most important words match.
    const coverage =
      queryTokens.length > 0
        ? matchedTokens.length /
          queryTokens.length
        : 0;

    score += coverage * 10;

    return {
      ...chunk,
      score,
      matchedTokens,
    };
  });

  const relevant = ranked
    .filter((chunk) => chunk.score > 0)
    .sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return first.index - second.index;
    });

  // If OCR text exists but lexical matching found nothing,
  // return the first few chunks rather than the whole document.
  return (
    relevant.length > 0 ? relevant : ranked
  ).slice(0, limit);
}

export function selectRelevantOcrText({
  query,
  text,
  maxChunks = 1,
}) {
  const chunks = chunkOcrText(text);

  const selectedChunks = rankOcrChunks({
    query,
    chunks,
    limit: maxChunks,
  });

  return {
    chunks: selectedChunks,
    text: selectedChunks
      .map(
        (chunk) =>
          `[OCR lines ${chunk.startLine}-${chunk.endLine}]\n${chunk.text}`,
      )
      .join("\n\n"),
  };
}

function escapeRegExp(value) {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}