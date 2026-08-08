const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "for",
  "how",
  "is",
  "it",
  "of",
  "on",
  "should",
  "the",
  "this",
  "to",
  "what",
  "when",
]);

function normalizeWord(word) {
  let value = word
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  /*
   * Very lightweight normalization.
   * Enough for:
   * replaced -> replace
   * replacing -> replace
   */
  if (value.endsWith("ing")) {
    value = value.slice(0, -3);
  }

  if (value.endsWith("ed")) {
    value = value.slice(0, -2);
  }

  if (value.endsWith("s") && value.length > 4) {
    value = value.slice(0, -1);
  }

  return value;
}

function getImportantTokens(query = "") {
  return [
    ...new Set(
      query
        .split(/\s+/)
        .map(normalizeWord)
        .filter(
          (token) =>
            token.length >= 3 &&
            !STOP_WORDS.has(token),
        ),
    ),
  ];
}

export function rankCandidatesLexically({
  query,
  candidates,
  limit = 12,
}) {
  const queryTokens =
    getImportantTokens(query);

  return candidates
    .map((candidate) => {
      const candidateText = [
        candidate.text,
        candidate.question,
        candidate.answer,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let lexicalScore = 0;
      const matchedTokens = [];

      for (const token of queryTokens) {
        if (
          candidateText.includes(token)
        ) {
          lexicalScore += 1;
          matchedTokens.push(token);
        }
      }

      /*
       * Strong bonus if multiple important
       * terms occur together.
       */
      if (
        matchedTokens.length >= 2
      ) {
        lexicalScore +=
          matchedTokens.length * 2;
      }

      /*
       * Pinecone score still matters.
       */
      const combinedScore =
        (candidate.score || 0) +
        lexicalScore * 0.1;

      return {
        ...candidate,
        lexicalScore,
        matchedTokens,
        combinedScore,
      };
    })
    .sort(
      (a, b) =>
        b.combinedScore -
        a.combinedScore,
    )
    .slice(0, limit);
}