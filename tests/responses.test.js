import { test, mock } from "node:test";
import assert from "node:assert/strict";
const calls = [];
let outputs = [];
mock.module("dotenv", { defaultExport: { config() {} } });
mock.module("openai", {
  defaultExport: class {
    responses = {
      create: async (args) => {
        calls.push(args);
        const next = outputs.shift();
        if (next instanceof Error) throw next;
        return next;
      },
    };
  },
});
const { generateResponse } = await import("../services/openai.service.js");
const { rerankKnowledge } =
  await import("../services/knowledgeReranker.service.js");
const messages = [{ role: "user", content: "How to clear E42?" }];
const web = {
  output_text: "External web answer [Manual](https://example.com/manual)",
  output: [
    { type: "web_search_call", status: "completed" },
    {
      type: "message",
      content: [
        {
          type: "output_text",
          annotations: [
            {
              type: "url_citation",
              title: "Manual",
              url: "https://example.com/manual",
              start_index: 20,
              end_index: 30,
            },
          ],
        },
      ],
    },
  ],
};
test("internal answer does not invoke web search", async () => {
  calls.length = 0;
  outputs = [{ output_text: "Replace the approved fuse." }];
  const result = await generateResponse(messages, "Approved fix: replace fuse");
  assert.equal(result.usedContext, true);
  assert.equal(result.usedWeb, false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tools, undefined);
});
test("missing internal knowledge forces web search and returns actual citations", async () => {
  calls.length = 0;
  outputs = [web];
  const result = await generateResponse(messages, "", {
    searchQuery: "E42 alarm",
    machineName: "Press",
  });
  assert.equal(calls[0].tool_choice, "required");
  assert.equal(calls[0].tools[0].type, "web_search");
  assert.equal(result.usedWeb, true);
  assert.equal(result.webSources[0].url, "https://example.com/manual");
});
test("insufficient internal context falls back without exposing the internal document", async () => {
  calls.length = 0;
  outputs = [{ output_text: "INTERNAL_CONTEXT_INSUFFICIENT" }, web];
  const result = await generateResponse(messages, "private company procedure");
  assert.equal(calls.length, 2);
  assert.equal(result.usedContext, false);
  assert.equal(result.usedWeb, true);
  assert.ok(!JSON.stringify(calls[1]).includes("private company procedure"));
});
test("search failure is explicit and never fabricates a sourced answer", async () => {
  outputs = [new Error("offline")];
  const result = await generateResponse(messages);
  assert.equal(result.usedWeb, false);
  assert.equal(result.webSearchStatus, "unavailable");
  assert.deepEqual(result.webSources, []);
});
test("uncited model output is not presented as web evidence", async () => {
  outputs = [
    {
      output_text: "Unverified guess",
      output: [{ type: "web_search_call", status: "completed" }],
    },
  ];
  const result = await generateResponse(messages);
  assert.equal(result.usedWeb, false);
  assert.doesNotMatch(result.reply, /Unverified guess/);
});
test("reranker failures do not promote unrelated vector matches", async () => {
  outputs = [new Error("offline")];
  assert.deepEqual(
    await rerankKnowledge({
      query: "E42",
      candidates: [{ text: "unrelated", type: "machine_document" }],
    }),
    [],
  );
});
