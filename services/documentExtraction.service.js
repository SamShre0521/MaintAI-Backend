import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import XLSX from "xlsx";

export async function extractDocumentPages(file) {
  let pages;
  if (file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      pages = result.pages.map((page) => ({
        pageNumber: page.num,
        text: page.text,
      }));
    } finally {
      await parser.destroy();
    }
  } else if (
    file.mimetype ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    pages = [{ pageNumber: 1, text: result.value }];
  } else if (file.mimetype === "application/msword") {
    const result = await new WordExtractor().extract(file.buffer);
    pages = [{ pageNumber: 1, text: result.getBody() }];
  } else if (file.mimetype === "text/plain") {
    pages = [{ pageNumber: 1, text: file.buffer.toString("utf8") }];
  } else if (
    [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].includes(file.mimetype)
  ) {
    const book = XLSX.read(file.buffer, { type: "buffer" });
    pages = book.SheetNames.map((name, index) => ({
      pageNumber: index + 1,
      text: `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(book.Sheets[name])}`,
    }));
  } else {
    return null;
  }
  return pages.map((page) => ({
    ...page,
    lineCount: page.text.split(/\r?\n/).filter((line) => line.trim()).length,
  }));
}
