import multer from "multer";

const storage = multer.memoryStorage();

export const uploadMachineFiles = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["application/pdf", "text/plain"];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only PDF and TXT files are allowed"));
    }

    cb(null, true);
  },
});