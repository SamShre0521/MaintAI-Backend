import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "node:crypto";
import path from "node:path";

import {
  s3Bucket,
  s3Client,
} from "../config/s3.js";

function sanitiseFilename(filename) {
  const extension = path.extname(filename).toLowerCase();
  const baseName = path
    .basename(filename, extension)
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);

  return `${baseName || "file"}${extension}`;
}

export async function uploadChatAttachment({
  file,
  companyId,
  machineId,
  sessionId,
}) {
  if (!file?.buffer) {
    throw new Error("Valid upload file is required");
  }

  if (!companyId || !machineId || !sessionId) {
    throw new Error(
      "companyId, machineId and sessionId are required",
    );
  }

  const safeFilename = sanitiseFilename(
    file.originalname,
  );

  const uniqueName =
    `${Date.now()}-${crypto.randomUUID()}-${safeFilename}`;

  const key = [
    "companies",
    companyId.toString(),
    "machines",
    machineId.toString(),
    "sessions",
    sessionId.toString(),
    "attachments",
    uniqueName,
  ].join("/");

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalname: safeFilename,
        companyid: companyId.toString(),
        machineid: machineId.toString(),
        sessionid: sessionId.toString(),
      },
    }),
  );

  return {
    key,
    bucket: s3Bucket,
    originalName: file.originalname,
    storedName: uniqueName,
    mimeType: file.mimetype,
    size: file.size,
  };
}

export async function createAttachmentDownloadUrl(
  key,
  expiresInSeconds = 300,
) {
  if (!key) {
    throw new Error("S3 object key is required");
  }

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    }),
    {
      expiresIn: expiresInSeconds,
    },
  );
}

export async function deleteAttachment(key) {
  if (!key) {
    return;
  }

  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    }),
  );
}