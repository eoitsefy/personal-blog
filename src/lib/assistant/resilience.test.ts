import assert from "node:assert/strict";
import test from "node:test";
import { getAssistantConfig } from "./config";
import { resetAssistantResilienceForTests, withAssistantResilience } from "./resilience";

const config = getAssistantConfig({
  AI_ASSISTANT_ENABLED: "true", AI_PROVIDER: "deepseek", AI_BASE_URL: "https://gateway.example/v1",
  AI_API_KEY: "secret", AI_GENERATION_MODEL: "model", AI_ACTOR_SALT: "salt",
  AI_MAX_CONCURRENT_REQUESTS: "1", AI_CIRCUIT_FAILURE_THRESHOLD: "1", AI_CIRCUIT_COOLDOWN_SECONDS: "10",
});

test("assistant resilience blocks concurrent work and opens after failure", async () => {
  assert.equal(config.enabled, true);
  if (!config.enabled) return;
  resetAssistantResilienceForTests();
  let release!: () => void;
  const pending = withAssistantResilience(config, () => new Promise<void>((resolve) => { release = resolve; }));
  await assert.rejects(() => withAssistantResilience(config, async () => undefined), /assistant_concurrency_exhausted/);
  release();
  await pending;
  await assert.rejects(() => withAssistantResilience(config, async () => { throw new Error("provider_failure"); }), /provider_failure/);
  await assert.rejects(() => withAssistantResilience(config, async () => undefined), /assistant_circuit_open/);
});
