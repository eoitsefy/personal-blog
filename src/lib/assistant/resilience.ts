import type { AssistantConfig } from "./config";

type EnabledConfig = Extract<AssistantConfig, { enabled: true }>;
let activeRequests = 0;
let consecutiveFailures = 0;
let openUntil = 0;

export async function withAssistantResilience<T>(config: EnabledConfig, operation: () => Promise<T>): Promise<T> {
  const now = Date.now();
  if (openUntil > now) throw new Error("assistant_circuit_open");
  if (activeRequests >= config.maxConcurrentRequests) throw new Error("assistant_concurrency_exhausted");
  activeRequests += 1;
  try {
    const result = await operation();
    consecutiveFailures = 0;
    openUntil = 0;
    return result;
  } catch (error) {
    consecutiveFailures += 1;
    if (consecutiveFailures >= config.circuitFailureThreshold) {
      openUntil = Date.now() + config.circuitCooldownMs;
    }
    throw error;
  } finally {
    activeRequests -= 1;
  }
}

export function resetAssistantResilienceForTests() {
  activeRequests = 0;
  consecutiveFailures = 0;
  openUntil = 0;
}
