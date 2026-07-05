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
- Mention causes, checks, and solutions
- Keep answers practical and actionable

If internal context is provided:
- Use it first
- Do not say "consult the manual" if the manual context already contains the answer
- Mention "Based on available internal knowledge" when using context

If context is not relevant:
- Answer normally
`,
      },
      ...messages,
    ],
  });

  return response.output_text;
};
