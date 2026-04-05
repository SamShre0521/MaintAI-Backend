import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const generateResponse = async (messages) => {
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: `
You are a senior manufacturing engineer.

Always:
- Give step-by-step troubleshooting
- Focus on industrial machines
- Mention possible causes, checks, and solutions
- Keep answers practical and actionable
        `,
      },
      ...messages,
    ],
  });

  return response.output_text;
};
