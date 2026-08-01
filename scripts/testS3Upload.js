import "dotenv/config";

import {
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  s3Bucket,
  s3Client,
} from "../config/s3.js";

async function run() {
  const key =
    `system-tests/${Date.now()}-s3-test.txt`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: "MaintAI S3 connection successful",
      ContentType: "text/plain",
    }),
  );

  console.log("S3 upload successful");
  console.log("Bucket:", s3Bucket);
  console.log("Key:", key);
}

run().catch((error) => {
  console.error("S3 upload failed:", error);
  process.exit(1);
});