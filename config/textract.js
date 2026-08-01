import { TextractClient } from "@aws-sdk/client-textract";

const requiredVariables = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(
      `Missing environment variable: ${variable}`,
    );
  }
}

export const textractClient = new TextractClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY,
  },
});