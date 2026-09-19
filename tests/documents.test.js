import test from "node:test";
import assert from "node:assert/strict";
import { extractDocumentPages } from "../services/documentExtraction.service.js";
import { buildManualChunks } from "../services/manualChunking.service.js";
import { buildRelevantAttachmentContext } from "../services/ocrContext.service.js";
import { validSolutionText } from "../utils/solutionValidation.util.js";
import XLSX from "xlsx";

function pdf(pages) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((text, index) => {
    const content = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  });
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}

test("multipage PDF extraction preserves text and actual page numbers", async () => {
  const pages = await extractDocumentPages({
    mimetype: "application/pdf",
    buffer: pdf([
      "Replace hydraulic oil every two years.",
      "Alarm E42: replace the fuse.",
    ]),
  });
  assert.equal(pages.length, 2);
  assert.match(pages[0].text, /two years/);
  assert.match(pages[1].text, /E42/);
  assert.deepEqual(
    pages.map((page) => page.pageNumber),
    [1, 2],
  );
});

test("Word DOCX extraction reads paragraphs without inventing printed page numbers", async () => {
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(
    zip,
    "[Content_Types].xml",
    Buffer.from(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
  );
  XLSX.CFB.utils.cfb_add(
    zip,
    "word/document.xml",
    Buffer.from(
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Replace the E42 fuse.</w:t></w:r></w:p></w:body></w:document>',
    ),
  );
  const buffer = XLSX.CFB.write(zip, { type: "buffer", fileType: "zip" });
  const pages = await extractDocumentPages({
    mimetype:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer,
  });
  assert.match(pages[0].text, /E42 fuse/);
});

test("document citations identify relevant page and exclude unrelated documents", () => {
  const attachment = {
    _id: "doc",
    originalName: "Manual.pdf",
    mimeType: "application/pdf",
    processingStatus: "completed",
    extractedText: "oil replacement\nalarm fuse",
    ocrPages: [
      { pageNumber: 1, text: "oil replacement" },
      { pageNumber: 4, text: "E42 alarm: replace fuse" },
    ],
  };
  const result = buildRelevantAttachmentContext({
    query: "E42 alarm",
    attachments: [attachment],
  });
  assert.equal(result.sources[0].pageNumber, 4);
  assert.match(result.context, /Page: 4/);
  assert.equal(
    buildRelevantAttachmentContext({
      query: "unrelated bearings",
      attachments: [attachment],
    }).sources.length,
    0,
  );
});

test("manual vectors retain tenant, machine, uploader and physical PDF page", () => {
  const chunks = buildManualChunks({
    attachment: {
      _id: "doc",
      companyId: "company",
      machineId: "machine",
      uploadedBy: "worker",
      mimeType: "application/pdf",
      originalName: "Manual.pdf",
      ocrPages: [{ pageNumber: 4, text: "Replace fuse" }],
    },
  });
  assert.equal(chunks[0].metadata.companyId, "company");
  assert.equal(chunks[0].metadata.uploadedBy, "worker");
  assert.equal(chunks[0].metadata.pageNumber, 4);
});

test("solution validation rejects empty, placeholder, non-text and profane input", () => {
  for (const value of ["", "  ", null, {}, "null", "undefined", "fuck"])
    assert.equal(validSolutionText(value), false);
  assert.equal(
    validSolutionText("Replace the fuse and verify the alarm clears."),
    true,
  );
});
