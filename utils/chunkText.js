export const chunkText = (text, chunkSize = 1000, overlap = 150) => {
  const chunks = [];

  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    const chunk = text.slice(start, end).trim();

    if (chunk.length > 100) {
      chunks.push(chunk);
    }

    start += chunkSize - overlap;
  }

  return chunks;
};