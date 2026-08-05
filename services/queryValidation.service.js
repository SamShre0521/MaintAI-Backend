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

A message may be a short contextual follow-up.

When previous machine-troubleshooting context is supplied, messages such as:

- explain that
- explain in detail
- why does that happen
- what should I check first
- what next
- tell me more
- what is the countermeasure
- is this dangerous
- can you simplify it

must be treated as machine-related unless the current message clearly changes the topic.

Judge the current message together with the supplied previous conversation and uploaded machine evidence, not in isolation.
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
