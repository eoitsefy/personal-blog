import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getClientAddress } from "@/lib/request-security";
import type { AssistantConfig } from "./config";

type EnabledConfig = Extract<AssistantConfig, { enabled: true }>;

export function assistantActorKey(req: Request, salt: string) {
  return createHash("sha256").update(`${salt}|${getClientAddress(req)}`).digest("hex");
}

export async function consumeAssistantRateLimit(key: string, config: EnabledConfig, now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.aiRateLimit.findUnique({ where: { key } });
    if (current?.blockedUntil && current.blockedUntil > now) {
      return { limited: true as const, retryAfterSeconds: Math.max(1, Math.ceil((current.blockedUntil.getTime() - now.getTime()) / 1_000)) };
    }
    const expired = !current || current.windowStartedAt.getTime() <= now.getTime() - config.rateLimitWindowMs;
    const attempts = expired ? 1 : current.attempts + 1;
    const blockedUntil = attempts > config.maxRequestsPerWindow ? new Date(now.getTime() + config.blockMs) : null;
    await tx.aiRateLimit.upsert({
      where: { key },
      create: { key, attempts, windowStartedAt: now, blockedUntil },
      update: { attempts, windowStartedAt: expired ? now : current.windowStartedAt, blockedUntil },
    });
    return blockedUntil
      ? { limited: true as const, retryAfterSeconds: Math.ceil(config.blockMs / 1_000) }
      : { limited: false as const };
  }, { isolationLevel: "Serializable" });
}

export async function reserveDailyBudget(maxRequests: number, now = new Date()) {
  const periodKey = now.toISOString().slice(0, 10);
  return prisma.$transaction(async (tx) => {
    const current = await tx.aiBudgetUsage.findUnique({ where: { periodKey } });
    if ((current?.requestCount ?? 0) >= maxRequests) return false;
    await tx.aiBudgetUsage.upsert({
      where: { periodKey },
      create: { periodKey, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
    });
    return true;
  }, { isolationLevel: "Serializable" });
}

export async function recordBudgetUnits(inputUnits: number, outputUnits: number, now = new Date()) {
  const periodKey = now.toISOString().slice(0, 10);
  await prisma.aiBudgetUsage.updateMany({ where: { periodKey }, data: { inputUnits: { increment: inputUnits }, outputUnits: { increment: outputUnits } } });
}
