import { z } from "zod";
import { fail, getRequestId, ok } from "@/lib/api";
import { getAssistantConfig } from "@/lib/assistant/config";
import { assistantActorKey, consumeAssistantRateLimit, recordBudgetUnits, reserveDailyBudget } from "@/lib/assistant/limits";
import { answerAssistantQuestion, recordAssistantUsage } from "@/lib/assistant/query";
import { withAssistantResilience } from "@/lib/assistant/resilience";
import { readJsonMutation } from "@/lib/request-security";

const QuestionSchema = z.object({
  question: z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(2).max(4_000)),
  conversationId: z.string().max(100).optional(),
  responseMode: z.literal("text").default("text"),
}).strict();

export async function POST(req: Request) {
  const startedAt = Date.now();
  const requestId = getRequestId(req);
  const config = getAssistantConfig();
  if (!config.enabled) return fail("SERVICE_UNAVAILABLE", "文本助手当前未启用", 503, requestId);
  const actorKeyHash = assistantActorKey(req, config.actorSalt);
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, requestId);
  const parsed = QuestionSchema.safeParse(body.value);
  if (!parsed.success || parsed.data.question.length > config.maxQuestionChars) {
    return fail("BAD_REQUEST", `问题长度必须为 2 至 ${config.maxQuestionChars} 个字符`, 400, requestId);
  }

  const throttle = await consumeAssistantRateLimit(actorKeyHash, config);
  if (throttle.limited) {
    await recordAssistantUsage({ requestId, actorKeyHash, config, status: "RATE_LIMITED", latencyMs: Date.now() - startedAt });
    return fail("RATE_LIMITED", "提问过于频繁，请稍后再试", 429, requestId, { "Retry-After": String(throttle.retryAfterSeconds) });
  }
  if (!(await reserveDailyBudget(config.maxDailyRequests))) {
    await recordAssistantUsage({ requestId, actorKeyHash, config, status: "BUDGET_EXHAUSTED", latencyMs: Date.now() - startedAt });
    return fail("SERVICE_UNAVAILABLE", "今日助手额度已用完，请稍后再来", 503, requestId);
  }

  try {
    const result = await withAssistantResilience(config, () => answerAssistantQuestion(parsed.data.question, config));
    const status = result.mode === "grounded" || result.mode === "conversation" ? "SUCCESS" as const : "NO_EVIDENCE" as const;
    await Promise.all([
      recordBudgetUnits(result.usage.inputUnits, result.usage.outputUnits),
      recordAssistantUsage({
        requestId, actorKeyHash, config, status, latencyMs: Date.now() - startedAt,
        inputUnits: result.usage.inputUnits, outputUnits: result.usage.outputUnits,
        retrievalCount: result.retrievalCount, sourcePostIds: result.sources.map(({ postId }) => postId),
      }),
    ]);
    return ok({ ...result, cached: false, usage: { provider: config.provider, ...result.usage } }, requestId);
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "AbortError";
    const category = timeout ? "timeout" : error instanceof Error ? error.message.slice(0, 100) : "unknown";
    await recordAssistantUsage({ requestId, actorKeyHash, config, status: timeout ? "TIMEOUT" : "PROVIDER_ERROR", latencyMs: Date.now() - startedAt, errorCategory: category });
    console.error(JSON.stringify({ level: "error", type: "assistant_error", requestId, provider: config.provider, category, ts: new Date().toISOString() }));
    return fail("SERVICE_UNAVAILABLE", timeout ? "助手响应超时，请稍后再试" : "助手暂时不可用，请稍后再试", 503, requestId);
  }
}
