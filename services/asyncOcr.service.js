import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
} from "@aws-sdk/client-textract";

import {
  textractClient,
} from "../config/textract.js";

import {
  combinePageText,
  groupTextractLinesByPage,
} from "../utils/asyncTextract.util.js";

/*
 * Starts OCR for a multi-page PDF or TIFF already
 * stored privately in S3.
 */
export async function startMultiPageOcr({
  bucket,
  key,
  jobTag,
}) {
  if (!bucket || !key) {
    throw new Error(
      "S3 bucket and object key are required",
    );
  }

  const command =
    new StartDocumentTextDetectionCommand({
      DocumentLocation: {
        S3Object: {
          Bucket: bucket,
          Name: key,
        },
      },

      ...(jobTag
        ? {
            JobTag: String(jobTag).slice(0, 64),
          }
        : {}),
    });

  const result =
    await textractClient.send(command);

  if (!result.JobId) {
    throw new Error(
      "Textract did not return a JobId",
    );
  }

  return {
    jobId: result.JobId,
  };
}

/*
 * Checks one asynchronous Textract job.
 *
 * When the job succeeds, this function follows
 * every NextToken and combines all result pages.
 */
export async function getMultiPageOcrResult({
  jobId,
}) {
  if (!jobId) {
    throw new Error(
      "Textract JobId is required",
    );
  }

  let nextToken;
  let jobStatus;
  let statusMessage = "";
  let documentMetadata = null;

  const allBlocks = [];

  do {
    const result =
      await textractClient.send(
        new GetDocumentTextDetectionCommand({
          JobId: jobId,
          MaxResults: 1000,
          ...(nextToken
            ? { NextToken: nextToken }
            : {}),
        }),
      );

    jobStatus = result.JobStatus;
    statusMessage =
      result.StatusMessage || "";

    if (result.DocumentMetadata) {
      documentMetadata =
        result.DocumentMetadata;
    }

    /*
     * Do not continue through pagination while
     * the job is still running.
     */
    if (
      jobStatus === "IN_PROGRESS"
    ) {
      return {
        status: "IN_PROGRESS",
        statusMessage,
      };
    }

    if (
      jobStatus === "FAILED"
    ) {
      return {
        status: "FAILED",
        statusMessage:
          statusMessage ||
          "Textract OCR job failed",
      };
    }

    if (
      jobStatus === "PARTIAL_SUCCESS"
    ) {
      console.warn(
        "Textract returned PARTIAL_SUCCESS:",
        statusMessage,
      );
    }

    if (
      Array.isArray(result.Blocks)
    ) {
      allBlocks.push(...result.Blocks);
    }

    nextToken = result.NextToken;
  } while (nextToken);

  const pages =
    groupTextractLinesByPage(allBlocks);

  const extractedText =
    combinePageText(pages);

  return {
    status: jobStatus,
    statusMessage,
    pageCount:
      documentMetadata?.Pages ||
      pages.length,
    pages,
    extractedText,
    blockCount: allBlocks.length,
  };
}