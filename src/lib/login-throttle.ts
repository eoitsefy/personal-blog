import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getClientAddress } from "@/lib/request-security";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function loginThrottleKey(req: Request, email: string): string {
  const address = getClientAddress(req);
  return createHash("sha256").update(`${address}|${email.trim().toLowerCase()}`).digest("hex");
}

export async function getLoginThrottle(key: string, now = new Date()) {
  const record = await prisma.loginThrottle.findUnique({ where: { key } });
  if (!record?.blockedUntil || record.blockedUntil <= now) return { limited: false as const };

  return {
    limited: true as const,
    retryAfterSeconds: Math.max(1, Math.ceil((record.blockedUntil.getTime() - now.getTime()) / 1000)),
  };
}

export async function recordLoginFailure(key: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const current = await tx.loginThrottle.findUnique({ where: { key } });
    const windowExpired = !current || current.windowStartedAt.getTime() <= now.getTime() - WINDOW_MS;
    const attempts = windowExpired ? 1 : current.attempts + 1;
    const blockedUntil = attempts >= MAX_ATTEMPTS ? new Date(now.getTime() + BLOCK_MS) : null;

    await tx.loginThrottle.upsert({
      where: { key },
      create: { key, attempts, windowStartedAt: now, blockedUntil },
      update: {
        attempts,
        windowStartedAt: windowExpired ? now : current.windowStartedAt,
        blockedUntil,
      },
    });
  });
}

export async function clearLoginFailures(key: string): Promise<void> {
  await prisma.loginThrottle.deleteMany({ where: { key } });
}
