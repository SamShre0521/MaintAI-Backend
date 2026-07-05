import { PDFParse } from "pdf-parse";
import Machine from "../models/machine.model.js";
import { createEmbedding } from "./embedding.service.js";
import { pineconeIndex } from "../config/pinecone.js";
import { chunkText } from "../utils/chunkText.js";

const extractTextFromFile = async (file) => {
  if (file.mimetype === "application/pdf") {
    const parser = new PDFParse({ data: file.buffer });
    const result = await parser.getText();
    await parser.destroy();

    return result.text || "";
  }

  if (file.mimetype === "text/plain") {
    return file.buffer.toString("utf-8");
  }

  return "";
};

export const processMachineFiles = async (machineId, files) => {
  try {
    const machine = await Machine.findById(machineId);

    if (!machine) {
      console.log("Machine not found for processing");
      return;
    }

    for (const file of files) {
      console.log(`Processing file: ${file.originalname}`);

      await Machine.updateOne(
        { _id: machineId, "files.originalName": file.originalname },
        {
          $set: {
            "files.$.processingStatus": "processing",
          },
        },
      );

      try {
        const extractedText = await extractTextFromFile(file);

        if (!extractedText || extractedText.trim().length < 50) {
          throw new Error("No readable text found in file");
        }

        const chunks = chunkText(extractedText);

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];

          const textToEmbed = `
Machine Name: ${machine.machineName}
Specifications: ${machine.specifications}
Department: ${machine.department}
File: ${file.originalname}
Content:
${chunk}
`;

          const embedding = await createEmbedding(textToEmbed);

          const record = {
            id: `${machine._id.toString()}-${file.originalname}-${i}`,
            values: embedding,
            metadata: {
              type: "machine_document",
              machineId: machine._id.toString(),
              machineName: machine.machineName,
              department: machine.department,
              fileName: file.originalname,
              chunkIndex: i,
              text: chunk,
            },
          };

          await pineconeIndex.namespace("__default__").upsert({
            records: [record],
          });
        }

        await Machine.updateOne(
          { _id: machineId, "files.originalName": file.originalname },
          {
            $set: {
              "files.$.processingStatus": "completed",
              "files.$.errorMessage": "",
            },
          },
        );

        console.log(`Completed processing: ${file.originalname}`);
      } catch (fileError) {
        console.error("File processing error:", fileError.message);

        await Machine.updateOne(
          { _id: machineId, "files.originalName": file.originalname },
          {
            $set: {
              "files.$.processingStatus": "failed",
              "files.$.errorMessage": fileError.message,
            },
          },
        );
      }
    }
  } catch (error) {
    console.error("Machine document processor error:", error);
  }
};
