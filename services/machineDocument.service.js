// import { PDFParse } from "pdf-parse";
// import Machine from "../models/machine.model.js";
// import { createEmbeddings } from "./embedding.service.js";
// import { pineconeIndex } from "../config/pinecone.js";
// import { chunkText } from "../utils/chunkText.js";
// import XLSX from "xlsx";

// const extractTextFromFile = async (file) => {
//   if (file.mimetype === "application/pdf") {
//     const parser = new PDFParse({ data: file.buffer });
//     const result = await parser.getText();
//     await parser.destroy();

//     return result.text || "";
//   }

//   if (file.mimetype === "text/plain") {
//     return file.buffer.toString("utf-8");
//   }

//   if (
//     file.mimetype ===
//       "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
//     file.mimetype === "application/vnd.ms-excel"
//   ) {
//     const workbook = XLSX.read(file.buffer, { type: "buffer" });

//     let text = "";

//     workbook.SheetNames.forEach((sheetName) => {
//       const sheet = workbook.Sheets[sheetName];

//       text += `Sheet: ${sheetName}\n`;
//       text += XLSX.utils.sheet_to_csv(sheet);
//       text += "\n\n";
//     });

//     return text;
//   }

//   return "";
// };

// export const processMachineFiles = async (machineId, files) => {
//   try {
//     const machine = await Machine.findById(machineId);

//     if (!machine) {
//       console.log("Machine not found for processing");
//       return;
//     }

//     for (const file of files) {
//       console.log(`Processing file: ${file.originalname}`);

//       await Machine.updateOne(
//         { _id: machineId, "files.originalName": file.originalname },
//         {
//           $set: {
//             "files.$.processingStatus": "processing",
//           },
//         },
//       );

//       try {
//         const extractedText = await extractTextFromFile(file);

//         if (!extractedText || extractedText.trim().length < 50) {
//           throw new Error("No readable text found in file");
//         }

//         const chunks = chunkText(extractedText);

//         for (let i = 0; i < chunks.length; i++) {
//           const chunk = chunks[i];

//           const textToEmbed = `
// Machine Name: ${machine.machineName}
// Specifications: ${machine.specifications}
// Department: ${machine.department}
// File: ${file.originalname}
// Content:
// ${chunk}
// `;

//           const embedding = await createEmbeddings(textToEmbed);

//           const record = {
//             id: `${machine._id.toString()}-${file.originalname}-${i}`,
//             values: embedding,
//             metadata: {
//               type: "machine_document",
//               machineId: machine._id.toString(),
//               machineName: machine.machineName,
//               department: machine.department,
//               fileName: file.originalname,
//               chunkIndex: i,
//               text: chunk,
//             },
//           };

//           await pineconeIndex.namespace("__default__").upsert({
//             records: [record],
//           });
//         }

//         await Machine.updateOne(
//           { _id: machineId, "files.originalName": file.originalname },
//           {
//             $set: {
//               "files.$.processingStatus": "completed",
//               "files.$.errorMessage": "",
//             },
//           },
//         );

//         console.log(`Completed processing: ${file.originalname}`);
//       } catch (fileError) {
//         console.error("File processing error:", fileError.message);

//         await Machine.updateOne(
//           { _id: machineId, "files.originalName": file.originalname },
//           {
//             $set: {
//               "files.$.processingStatus": "failed",
//               "files.$.errorMessage": fileError.message,
//             },
//           },
//         );
//       }
//     }
//   } catch (error) {
//     console.error("Machine document processor error:", error);
//   }
// };

import { PDFParse } from "pdf-parse";
import XLSX from "xlsx";

import Machine from "../models/machine.model.js";
import ChatAttachment from "../models/chatAttachment.model.js";

import {
  saveUploadedAttachments,
} from "./attachment.service.js";

import {
  startMultiPageOcr,
  getMultiPageOcrResult,
} from "./asyncOcr.service.js";

import {
  processAttachmentWithOcr,
} from "./attachmentOcr.service.js";

import {
  ingestManualToPinecone,
} from "./manualIngestion.service.js";

/*
 * ============================================================
 * MAIN MACHINE DOCUMENT PROCESSOR
 * ============================================================
 *
 * This service is called after a manager creates a machine.
 *
 * Flow:
 *
 * Machine
 *   ↓
 * uploaded files
 *   ↓
 * S3
 *   ↓
 * ChatAttachment
 *   ↓
 * OCR / text extraction
 *   ↓
 * page-aware text
 *   ↓
 * embeddings
 *   ↓
 * Pinecone
 */
export async function processMachineFiles({
  machineId,
  files,
  companyId,
  uploadedBy,
}) {
  try {
    if (!machineId) {
      throw new Error(
        "machineId is required",
      );
    }

    if (!companyId) {
      throw new Error(
        "companyId is required",
      );
    }

    if (!uploadedBy) {
      throw new Error(
        "uploadedBy is required",
      );
    }

    if (
      !Array.isArray(files) ||
      files.length === 0
    ) {
      console.log(
        "No machine files supplied for processing",
      );

      return;
    }

    /*
     * Always load machine using both machineId
     * and companyId.
     *
     * This prevents cross-company processing.
     */
    const machine =
      await Machine.findOne({
        _id: machineId,
        companyId,
      });

    if (!machine) {
      throw new Error(
        "Machine not found for document processing",
      );
    }

    console.log(
      "========================================",
    );

    console.log(
      `Starting document processing for machine: ${machine.machineName}`,
    );

    console.log(
      `Machine ID: ${machine._id}`,
    );

    console.log(
      `Company ID: ${companyId}`,
    );

    console.log(
      `Files: ${files.length}`,
    );

    /*
     * ========================================================
     * 1. Upload all files to S3 and create ChatAttachment
     *    records.
     * ========================================================
     *
     * Machine manuals do not belong to a chat session,
     * therefore sessionId is left undefined/null.
     */
    const attachments =
      await saveUploadedAttachments({
        files,
        companyId,
        machineId,
        sessionId: null,
        uploadedBy,
      });

    console.log(
      `Created ${attachments.length} machine attachments`,
    );

    /*
     * Link attachment records to the Machine.
     */
    if (attachments.length > 0) {
      await Machine.updateOne(
        {
          _id: machineId,
          companyId,
        },
        {
          $addToSet: {
            attachments: {
              $each: attachments.map(
                (attachment) =>
                  attachment._id,
              ),
            },
          },
        },
      );
    }

    /*
     * ========================================================
     * 2. Process each manual independently.
     * ========================================================
     *
     * Failure of one manual should not prevent
     * another manual from completing.
     */
    for (const attachment of attachments) {
      try {
        console.log(
          "----------------------------------------",
        );

        console.log(
          `Processing machine document: ${attachment.originalName}`,
        );

        /*
         * Update the manager-facing Machine.files[]
         * status.
         */
        await updateMachineFileStatus({
          machineId,
          companyId,
          originalName:
            attachment.originalName,
          processingStatus:
            "processing",
          errorMessage: "",
        });

        /*
         * Route the attachment through the appropriate
         * extraction strategy.
         */
        let processedAttachment;

        if (
          isMultiPageOcrDocument(
            attachment,
          )
        ) {
          processedAttachment =
            await processMultiPageDocument({
              attachment,
              companyId,
            });
        } else if (
          isSinglePageOcrImage(
            attachment,
          )
        ) {
          processedAttachment =
            await processImageDocument({
              attachment,
              companyId,
            });
        } else if (
          isDirectTextDocument(
            attachment,
          )
        ) {
          processedAttachment =
            await processDirectTextDocument({
              attachment,
              sourceFile:
                findOriginalFile(
                  files,
                  attachment.originalName,
                ),
              companyId,
            });
        } else {
          throw new Error(
            `Unsupported machine document type: ${attachment.mimeType}`,
          );
        }

        /*
         * Validate extraction result before
         * generating embeddings.
         */
        if (
          !processedAttachment
            ?.extractedText
            ?.trim()
        ) {
          throw new Error(
            "No readable text was extracted from the machine document",
          );
        }

        if (
          !Array.isArray(
            processedAttachment.ocrPages,
          ) ||
          processedAttachment.ocrPages
            .length === 0
        ) {
          throw new Error(
            "No OCR/text pages available for manual ingestion",
          );
        }

        console.log(
          `Text extraction completed for ${attachment.originalName}`,
        );

        console.log(
          `Pages: ${processedAttachment.ocrPages.length}`,
        );

        console.log(
          `Extracted text length: ${processedAttachment.extractedText.length}`,
        );

        /*
         * ====================================================
         * 3. Chunk → embeddings → Pinecone
         * ====================================================
         */
        const ingestionResult =
          await ingestManualToPinecone({
            attachment:
              processedAttachment,
          });

        console.log(
          `Pinecone ingestion completed: ${attachment.originalName}`,
        );

        console.log(
          `Chunks generated: ${ingestionResult.totalChunks}`,
        );

        console.log(
          `Vectors upserted: ${ingestionResult.totalUpserted}`,
        );

        /*
         * Mark this document as permanent knowledge
         * ONLY after Pinecone succeeds.
         */
        const permanentAttachment =
          await ChatAttachment.findOneAndUpdate(
            {
              _id:
                processedAttachment._id,
              companyId,
            },
            {
              $set: {
                knowledgeStatus:
                  "permanent",
                processingStatus:
                  "completed",
                processingError: "",
              },
            },
            {
              returnDocument: "after",
            },
          );

        /*
         * Update manager-facing file status.
         */
        await updateMachineFileStatus({
          machineId,
          companyId,
          originalName:
            attachment.originalName,
          processingStatus:
            "completed",
          errorMessage: "",
        });

        console.log(
          `✅ Machine knowledge ready: ${permanentAttachment.originalName}`,
        );
      } catch (fileError) {
        console.error(
          `Machine document processing failed for ${attachment.originalName}:`,
          fileError,
        );

        /*
         * Mark ChatAttachment failed.
         */
        await ChatAttachment.updateOne(
          {
            _id: attachment._id,
            companyId,
          },
          {
            $set: {
              processingStatus:
                "failed",
              processingError:
                fileError.message ||
                "Machine document processing failed",
            },
          },
        ).catch(() => {});

        /*
         * Mark Machine.files[] failed.
         */
        await updateMachineFileStatus({
          machineId,
          companyId,
          originalName:
            attachment.originalName,
          processingStatus:
            "failed",
          errorMessage:
            fileError.message ||
            "Machine document processing failed",
        }).catch(() => {});
      }
    }

    console.log(
      "========================================",
    );

    console.log(
      `Finished processing documents for machine ${machine.machineName}`,
    );
  } catch (error) {
    console.error(
      "Machine document processor error:",
      error,
    );

    throw error;
  }
}

/*
 * ============================================================
 * MULTI-PAGE PDF / TIFF
 * ============================================================
 */
async function processMultiPageDocument({
  attachment,
  companyId,
}) {
  /*
   * Start asynchronous Textract job.
   */
  const { jobId } =
    await startMultiPageOcr({
      bucket:
        attachment.s3Bucket,
      key:
        attachment.s3Key,

      jobTag:
        `maintai-${attachment._id}`,
    });

  console.log(
    `Textract job started: ${jobId}`,
  );

  /*
   * Save the job immediately so it is traceable
   * from MongoDB.
   */
  await ChatAttachment.updateOne(
    {
      _id: attachment._id,
      companyId,
    },
    {
      $set: {
        textractJobId:
          jobId,
        ocrMode:
          "asynchronous",
        processingStatus:
          "processing",
        processingError: "",
        ocrStartedAt:
          new Date(),
        ocrCompletedAt:
          null,
      },
    },
  );

  /*
   * Poll Textract until it completes.
   *
   * For UAT this is acceptable.
   *
   * Later in production we should move this to
   * SQS / worker processing rather than keeping
   * one Node process polling.
   */
  const result =
    await waitForMultiPageOcr({
      jobId,
    });

  if (
    result.status === "FAILED"
  ) {
    throw new Error(
      result.statusMessage ||
        "Textract multi-page OCR failed",
    );
  }

  if (
    !result.extractedText?.trim()
  ) {
    throw new Error(
      "Textract completed but returned no readable text",
    );
  }

  if (
    !Array.isArray(result.pages) ||
    result.pages.length === 0
  ) {
    throw new Error(
      "Textract returned no OCR pages",
    );
  }

  /*
   * Save page-aware OCR into MongoDB.
   */
  return await ChatAttachment.findOneAndUpdate(
    {
      _id: attachment._id,
      companyId,
    },
    {
      $set: {
        textractJobId:
          jobId,

        ocrMode:
          "asynchronous",

        processingStatus:
          "completed",

        processingError:
          "",

        extractedText:
          result.extractedText,

        ocrPages:
          result.pages,

        pageCount:
          result.pageCount,

        ocrCompletedAt:
          new Date(),
      },
    },
    {
      returnDocument: "after",
    },
  );
}

/*
 * ============================================================
 * SINGLE IMAGE OCR
 * ============================================================
 */
async function processImageDocument({
  attachment,
  companyId,
}) {
  /*
   * Reuse the synchronous OCR service that
   * already works for chat images.
   */
  const processedAttachment =
    await processAttachmentWithOcr({
      attachmentId:
        attachment._id,
      companyId,
    });

  if (
    !processedAttachment
      ?.extractedText
      ?.trim()
  ) {
    throw new Error(
      "No readable text found in image",
    );
  }

  /*
   * manualIngestion.service.js expects
   * page-aware OCR.
   *
   * A normal image is treated as page 1.
   */
  return await ChatAttachment.findOneAndUpdate(
    {
      _id:
        processedAttachment._id,
      companyId,
    },
    {
      $set: {
        ocrMode:
          "synchronous",

        pageCount:
          1,

        ocrPages: [
          {
            pageNumber: 1,
            text:
              processedAttachment
                .extractedText,
            lineCount:
              countLines(
                processedAttachment
                  .extractedText,
              ),
          },
        ],

        processingStatus:
          "completed",

        processingError:
          "",

        ocrCompletedAt:
          new Date(),
      },
    },
    {
      returnDocument: "after",
    },
  );
}

/*
 * ============================================================
 * TXT / XLS / XLSX
 * ============================================================
 *
 * These file types do not require Textract.
 *
 * We still convert them into page-aware text so
 * they can use the SAME manual ingestion service.
 */
async function processDirectTextDocument({
  attachment,
  sourceFile,
  companyId,
}) {
  if (!sourceFile) {
    throw new Error(
      `Original upload buffer not found for ${attachment.originalName}`,
    );
  }

  await ChatAttachment.updateOne(
    {
      _id: attachment._id,
      companyId,
    },
    {
      $set: {
        processingStatus:
          "processing",
        processingError:
          "",
        ocrMode:
          "none",
      },
    },
  );

  let extractedText = "";

  if (
    sourceFile.mimetype ===
    "text/plain"
  ) {
    extractedText =
      sourceFile.buffer.toString(
        "utf-8",
      );
  } else if (
    sourceFile.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    sourceFile.mimetype ===
      "application/vnd.ms-excel"
  ) {
    const workbook =
      XLSX.read(
        sourceFile.buffer,
        {
          type: "buffer",
        },
      );

    const parts = [];

    for (
      const sheetName
      of workbook.SheetNames
    ) {
      const sheet =
        workbook.Sheets[
          sheetName
        ];

      parts.push(
        `Sheet: ${sheetName}`,
      );

      parts.push(
        XLSX.utils.sheet_to_csv(
          sheet,
        ),
      );
    }

    extractedText =
      parts.join("\n\n");
  }

  extractedText =
    extractedText.trim();

  if (
    extractedText.length < 10
  ) {
    throw new Error(
      "No readable text found in document",
    );
  }

  /*
   * Treat direct-text files as a single logical page.
   */
  return await ChatAttachment.findOneAndUpdate(
    {
      _id:
        attachment._id,
      companyId,
    },
    {
      $set: {
        extractedText,

        ocrMode:
          "none",

        pageCount:
          1,

        ocrPages: [
          {
            pageNumber:
              1,

            text:
              extractedText,

            lineCount:
              countLines(
                extractedText,
              ),
          },
        ],

        processingStatus:
          "completed",

        processingError:
          "",

        ocrCompletedAt:
          new Date(),
      },
    },
    {
      returnDocument: "after",
    },
  );
}

/*
 * ============================================================
 * TEXTRACT POLLING
 * ============================================================
 */
async function waitForMultiPageOcr({
  jobId,
  pollingIntervalMs = 4000,
  timeoutMs = 10 * 60 * 1000,
}) {
  const startedAt =
    Date.now();

  while (true) {
    const result =
      await getMultiPageOcrResult({
        jobId,
      });

    if (
      result.status ===
        "SUCCEEDED" ||
      result.status ===
        "PARTIAL_SUCCESS" ||
      result.status ===
        "FAILED"
    ) {
      return result;
    }

    if (
      Date.now() - startedAt >
      timeoutMs
    ) {
      throw new Error(
        "Textract OCR timed out",
      );
    }

    console.log(
      `Textract job ${jobId} still processing...`,
    );

    await sleep(
      pollingIntervalMs,
    );
  }
}

/*
 * ============================================================
 * MACHINE FILE STATUS
 * ============================================================
 */
async function updateMachineFileStatus({
  machineId,
  companyId,
  originalName,
  processingStatus,
  errorMessage = "",
}) {
  await Machine.updateOne(
    {
      _id:
        machineId,

      companyId,

      "files.originalName":
        originalName,
    },
    {
      $set: {
        "files.$.processingStatus":
          processingStatus,

        "files.$.errorMessage":
          errorMessage,
      },
    },
  );
}

/*
 * ============================================================
 * FILE TYPE HELPERS
 * ============================================================
 */
function isMultiPageOcrDocument(
  attachment,
) {
  return (
    attachment.mimeType ===
      "application/pdf" ||
    attachment.mimeType ===
      "image/tiff" ||
    attachment.mimeType ===
      "image/tif"
  );
}

function isSinglePageOcrImage(
  attachment,
) {
  return (
    attachment.mimeType ===
      "image/jpeg" ||
    attachment.mimeType ===
      "image/png"
  );
}

function isDirectTextDocument(
  attachment,
) {
  return (
    attachment.mimeType ===
      "text/plain" ||
    attachment.mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    attachment.mimeType ===
      "application/vnd.ms-excel"
  );
}

function findOriginalFile(
  files,
  originalName,
) {
  return files.find(
    (file) =>
      file.originalname ===
      originalName,
  );
}

function countLines(
  text = "",
) {
  return text
    .split(/\r?\n/)
    .map(
      (line) =>
        line.trim(),
    )
    .filter(Boolean)
    .length;
}

function sleep(ms) {
  return new Promise(
    (resolve) =>
      setTimeout(
        resolve,
        ms,
      ),
  );
}