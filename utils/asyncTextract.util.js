export function groupTextractLinesByPage(
  blocks = [],
) {
  const pages = new Map();

  for (const block of blocks) {
    if (
      block.BlockType !== "LINE" ||
      !block.Text?.trim()
    ) {
      continue;
    }

    const pageNumber = Number(block.Page || 1);

    if (!pages.has(pageNumber)) {
      pages.set(pageNumber, []);
    }

    pages.get(pageNumber).push(
      block.Text.trim(),
    );
  }

  return [...pages.entries()]
    .sort(
      ([firstPage], [secondPage]) =>
        firstPage - secondPage,
    )
    .map(([pageNumber, lines]) => ({
      pageNumber,
      text: lines.join("\n"),
      lineCount: lines.length,
    }));
}

export function combinePageText(pages = []) {
  return pages
    .map(
      (page) => `--- Page ${page.pageNumber} ---
${page.text}`,
    )
    .join("\n\n");
}