import multer from "multer";

const storage = multer.memoryStorage();

export const uploadAttachments = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      // Documents
      "application/pdf",
      "text/plain",

      // Excel
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",

      // Images
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Only PDF, TXT, XLS, XLSX, JPG, JPEG, PNG and WEBP files are allowed.",
        ),
      );
    }

    cb(null, true);
  },
});
export const uploadMachineFiles = uploadAttachments;