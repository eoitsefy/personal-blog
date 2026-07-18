import assert from "node:assert/strict";
import test from "node:test";
import { getAssistantConfig, getAssistantHealthSummary } from "./config";

test("assistant stays disabled by default without exposing secrets", () => {
  assert.deepEqual(getAssistantConfig({}), { enabled: false, reason: "feature_disabled" });
  assert.deepEqual(getAssistantHealthSummary({ AI_ASSISTANT_ENABLED: "true" }), {
    enabled: false, provider: "none", generationModel: null, embeddings: false, reason: "invalid_configuration",
  });
});

test("assistant accepts a complete server-only OpenAI-compatible configuration", () => {
  const config = getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true",
    AI_PROVIDER: "openai-compatible",
    AI_BASE_URL: "https://gateway.example/v1/",
    AI_API_KEY: "secret",
    AI_GENERATION_MODEL: "answer-model",
    AI_EMBEDDING_MODEL: "embedding-model",
    AI_ACTOR_SALT: "private-rate-limit-salt",
  });
  assert.equal(config.enabled, true);
  if (config.enabled) {
    assert.equal(config.baseUrl, "https://gateway.example/v1");
    assert.equal(config.embeddingModel, "embedding-model");
  }
});

test("assistant rejects insecure remote provider URLs", () => {
  assert.deepEqual(getAssistantConfig({
    AI_ASSISTANT_ENABLED: "true", AI_PROVIDER: "openai-compatible", AI_BASE_URL: "http://gateway.example/v1",
    AI_API_KEY: "secret", AI_GENERATION_MODEL: "model", AI_ACTOR_SALT: "salt",
  }), { enabled: false, reason: "invalid_configuration" });
});
