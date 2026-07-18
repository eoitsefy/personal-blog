import assert from "node:assert/strict";
import test from "node:test";
import { getAssistantConfig } from "./config";
import { OpenAiProvider, parseGroundedAnswer } from "./provider";

test("provider citations are constrained to supplied evidence IDs", () => {
  assert.deepEqual(parseGroundedAnswer({ answer: "来自文章。", sourceIds: ["allowed", "draft", "allowed"] }, new Set(["allowed"])), {
    answer: "来自文章。", sourceIds: ["allowed"],
  });
});

test("provider answers without a valid citation are rejected", () => {
  assert.throws(() => parseGroundedAnswer({ answer: "没有来源", sourceIds: ["invented"] }, new Set(["allowed"])), /provider_sources_invalid/);
});

test("OpenAI provider uses Responses with storage disabled and bounded output", async () => {
  const config = getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true",
    AI_PROVIDER: "openai",
    AI_API_KEY: "secret",
    AI_ACTOR_SALT: "private-salt",
  });
  assert.equal(config.enabled, true);
  if (!config.enabled) return;

  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ answer: "来自文章。", sourceIds: ["chunk-1"] }) }] }],
      usage: { input_tokens: 120, output_tokens: 24 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await new OpenAiProvider(config).answer("文章写了什么？", [{
      id: "chunk-1", title: "测试文章", url: "/posts/test", heading: null, content: "文章内容",
    }]);
    assert.equal(requestUrl, "https://api.openai.com/v1/responses");
    assert.equal(requestBody.store, false);
    assert.equal(requestBody.model, "gpt-5-nano");
    assert.equal(requestBody.max_output_tokens, 300);
    assert.deepEqual(requestBody.reasoning, { effort: "minimal" });
    assert.deepEqual(result, { answer: "来自文章。", sourceIds: ["chunk-1"], inputUnits: 120, outputUnits: 24 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
