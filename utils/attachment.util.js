export function getAttachmentType(file) {
  if (!file) return "unknown";

  if (file.mimetype.startsWith("image/")) {
    return "image";
  }

  if (file.mimetype === "application/pdf") {
    return "pdf";
  }

  if (
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimetype === "application/vnd.ms-excel"
  ) {
    return "spreadsheet";
  }

  if (file.mimetype === "text/plain") {
    return "text";
  }

  return "unknown";
}