import {
  DetectDocumentTextCommand,
} from "@aws-sdk/client-textract";

import { textractClient } from "../config/textract.js";
import {
  extractLinesFromTextractBlocks,
} from "../utils/textract.util.js";

/**
 * Single-page OCR for JPG, JPEG, PNG or a
 * single-page PDF/TIFF stored in S3.
 */
export async function extractSinglePageText({
  bucket,
  key,
}) {
  if (!bucket || !key) {
    throw new Error(
      "S3 bucket and object key are required for OCR",
    );
  }

  const command = new DetectDocumentTextCommand({
    Document: {
      S3Object: {
        Bucket: bucket,
        Name: key,
      },
    },
  });

  const response = await textractClient.send(command);

  const extractedText =
    extractLinesFromTextractBlocks(
      response.Blocks || [],
    );

  return {
    extractedText,
    blockCount: response.Blocks?.length || 0,
    documentMetadata:
      response.DocumentMetadata || null,
  };
}