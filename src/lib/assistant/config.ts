export type AssistantConfig =
  | { enabled: false; reason: "feature_disabled" | "invalid_configuration" }
  | {
      enabled: true;
      provider: "openai";
      baseUrl: string;
      apiKey: string;
      generationModel: string;
      embeddingModel: string | null;
      reasoningEffort: "minimal" | "low" | "medium" | "high";
      timeoutMs: number;
      maxQuestionChars: number;
      maxOutputTokens: number;
      retrievalLimit: number;
      minRelevance: number;
      rateLimitWindowMs: number;
      maxRequestsPerWindow: number;
      blockMs: number;
      maxDailyRequests: number;
      maxConcurrentRequests: number;
      circuitFailureThreshold: number;
      circuitCooldownMs: number;
      actorSalt: string;
    };

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function decimal(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

type AssistantEnvironment = Record<string, string | undefined>;

export function getAssistantConfig(environment: AssistantEnvironment = process.env): AssistantConfig {
  if (environment.AI_ASSISTANT_ENABLED?.trim().toLowerCase() !== "true") {
    return { enabled: false, reason: "feature_disabled" };
  }

  const provider = environment.AI_PROVIDER?.trim().toLowerCase();
  const rawBaseUrl = environment.AI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const apiKey = environment.AI_API_KEY?.trim();
  const generationModel = environment.AI_GENERATION_MODEL?.trim() || "gpt-5-nano";
  const actorSalt = environment.AI_ACTOR_SALT?.trim();
  const reasoningEffort = environment.AI_REASONING_EFFORT?.trim().toLowerCase() || "minimal";
  if (provider !== "openai" || !apiKey || !actorSalt || !["minimal", "low", "medium", "high"].includes(reasoningEffort)) {
    return { enabled: false, reason: "invalid_configuration" };
  }

  try {
    const baseUrl = new URL(rawBaseUrl);
    if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(baseUrl.hostname))) {
      return { enabled: false, reason: "invalid_configuration" };
    }
    return {
      enabled: true,
      provider,
      baseUrl: baseUrl.toString().replace(/\/$/, ""),
      apiKey,
      generationModel,
      embeddingModel: environment.AI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small",
      reasoningEffort: reasoningEffort as "minimal" | "low" | "medium" | "high",
      timeoutMs: integer(environment.AI_TIMEOUT_MS, 15_000, 1_000, 60_000),
      maxQuestionChars: integer(environment.AI_MAX_QUESTION_CHARS, 500, 50, 4_000),
      maxOutputTokens: integer(environment.AI_MAX_OUTPUT_TOKENS, 300, 64, 4_096),
      retrievalLimit: integer(environment.AI_RETRIEVAL_LIMIT, 4, 1, 12),
      minRelevance: decimal(environment.AI_MIN_RELEVANCE, 0.12, 0.01, 1),
      rateLimitWindowMs: integer(environment.AI_RATE_LIMIT_WINDOW_SECONDS, 600, 10, 86_400) * 1_000,
      maxRequestsPerWindow: integer(environment.AI_MAX_REQUESTS_PER_WINDOW, 4, 1, 100),
      blockMs: integer(environment.AI_RATE_LIMIT_BLOCK_SECONDS, 1_800, 10, 86_400) * 1_000,
      maxDailyRequests: integer(environment.AI_MAX_DAILY_REQUESTS, 50, 1, 100_000),
      maxConcurrentRequests: integer(environment.AI_MAX_CONCURRENT_REQUESTS, 2, 1, 20),
      circuitFailureThreshold: integer(environment.AI_CIRCUIT_FAILURE_THRESHOLD, 3, 1, 20),
      circuitCooldownMs: integer(environment.AI_CIRCUIT_COOLDOWN_SECONDS, 60, 10, 3_600) * 1_000,
      actorSalt,
    };
  } catch {
    return { enabled: false, reason: "invalid_configuration" };
  }
}

export function getAssistantHealthSummary(environment: AssistantEnvironment = process.env) {
  const config = getAssistantConfig(environment);
  return config.enabled
    ? { enabled: true, provider: config.provider, generationModel: config.generationModel, embeddings: Boolean(config.embeddingModel), reason: null }
    : { enabled: false, provider: "none", generationModel: null, embeddings: false, reason: config.reason };
}
