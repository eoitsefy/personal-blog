import assert from "node:assert/strict";
import test from "node:test";
import { getAssistantConfig, getAssistantHealthSummary } from "./config";

test("assistant stays disabled by default without exposing secrets", () => {
  assert.deepEqual(getAssistantConfig({}), { enabled: false, reason: "feature_disabled" });
  assert.deepEqual(getAssistantHealthSummary({ AI_ASSISTANT_ENABLED: "true" }), {
    enabled: false, provider: "none", generationModel: null, embeddings: false, reason: "invalid_configuration",
  });
});

test("assistant accepts a server-only DeepSeek configuration with low-usage defaults", () => {
  const config = getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true",
    AI_PROVIDER: "deepseek",
    AI_API_KEY: "secret",
    AI_ACTOR_SALT: "private-rate-limit-salt",
    AI_EMBEDDING_MODEL: "legacy-provider-model",
  });
  assert.equal(config.enabled, true);
  if (config.enabled) {
    assert.equal(config.baseUrl, "https://api.deepseek.com");
    assert.equal(config.generationModel, "deepseek-v4-flash");
    assert.equal(config.embeddingModel, null);
    assert.equal(config.thinkingMode, "disabled");
    assert.equal(config.maxOutputTokens, 300);
    assert.equal(config.retrievalLimit, 4);
  }
});

test("assistant rejects insecure remote provider URLs", () => {
  assert.deepEqual(getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true", AI_PROVIDER: "deepseek", AI_BASE_URL: "http://gateway.example/v1",
    AI_API_KEY: "secret", AI_GENERATION_MODEL: "model", AI_ACTOR_SALT: "salt",
  }), { enabled: false, reason: "invalid_configuration" });
});

test("assistant rejects the retired OpenAI provider configuration", () => {
  assert.deepEqual(getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true", AI_PROVIDER: "openai",
    AI_API_KEY: "secret", AI_ACTOR_SALT: "salt",
  }), { enabled: false, reason: "invalid_configuration" });
});

test("assistant rejects thinking mode to preserve the low-usage production profile", () => {
  assert.deepEqual(getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true", AI_PROVIDER: "deepseek", AI_THINKING_MODE: "enabled",
    AI_API_KEY: "secret", AI_ACTOR_SALT: "salt",
  }), { enabled: false, reason: "invalid_configuration" });
});
