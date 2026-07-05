import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const isMachineRelatedQuery = async (message) => {
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: `
You classify user queries.

Return only YES or NO.

YES if query is related to:
- industrial machines
- manufacturing equipment
- machine failure
- troubleshooting
- maintenance
- repair
- operation
- safety
- manuals
- specifications
- alarms
- production equipment

NO if query is about:
- general knowledge
- politics
- sports
- entertainment
- personal advice
- coding
- finance
- random chat
        `,
      },
      {
        role: "user",
        content: message,
      },
    ],
  });

  return response.output_text.trim().toUpperCase().startsWith("YES");
};