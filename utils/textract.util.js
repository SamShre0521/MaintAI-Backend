export function extractLinesFromTextractBlocks(
  blocks = [],
) {
  return blocks
    .filter(
      (block) =>
        block.BlockType === "LINE" &&
        typeof block.Text === "string" &&
        block.Text.trim().length > 0,
    )
    .map((block) => block.Text.trim())
    .join("\n");
}