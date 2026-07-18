import assert from "node:assert/strict";
import test from "node:test";
import { getAssistantConfig } from "./config";
import { DeepSeekProvider, parseGroundedAnswer } from "./provider";

test("provider citations are constrained to supplied evidence IDs", () => {
  assert.deepEqual(parseGroundedAnswer({ answer: "来自文章。", sourceIds: ["allowed", "draft", "allowed"] }, new Set(["allowed"])), {
    answer: "来自文章。", sourceIds: ["allowed"],
  });
});

test("provider answers without a valid citation are rejected", () => {
  assert.throws(() => parseGroundedAnswer({ answer: "没有来源", sourceIds: ["invented"] }, new Set(["allowed"])), /provider_sources_invalid/);
});

test("DeepSeek provider uses non-thinking JSON chat completions with bounded output", async () => {
  const config = getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true",
    AI_PROVIDER: "deepseek",
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
      choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ answer: "来自文章。", sourceIds: ["chunk-1"] }) } }],
      usage: { prompt_tokens: 120, completion_tokens: 24 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  try {
    const result = await new DeepSeekProvider(config).answer("文章写了什么？", [{
      id: "chunk-1", title: "测试文章", url: "/posts/test", heading: null, content: "文章内容",
    }]);
    assert.equal(requestUrl, "https://api.deepseek.com/chat/completions");
    assert.equal(requestBody.model, "deepseek-v4-flash");
    assert.equal(requestBody.max_tokens, 300);
    assert.equal(requestBody.stream, false);
    assert.deepEqual(requestBody.thinking, { type: "disabled" });
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
    assert.equal("store" in requestBody, false);
    const messages = requestBody.messages as Array<{ role: string; content: string }>;
    assert.match(messages[0].content, /json/);
    assert.match(messages[1].content, /chunk-1/);
    assert.deepEqual(result, { answer: "来自文章。", sourceIds: ["chunk-1"], inputUnits: 120, outputUnits: 24 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
