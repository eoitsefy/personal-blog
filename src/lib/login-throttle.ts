import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClientAddress } from "@/lib/request-security";

const WINDOW_MS = 15 * 60 * 1000;
const BLOCK_MS = 30 * 60 * 1000;
const PAIR_MAX_ATTEMPTS = 5;
const IP_MAX_ATTEMPTS = 30;
const ACCOUNT_MAX_ATTEMPTS = 20;

type LoginThrottleKeys = { pair: string; ip: string; account: string };
type LoginThrottleResult = { limited: false } | { limited: true; retryAfterSeconds: number };

class LoginThrottleExceeded extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Login throttle exceeded");
  }
}

export function loginThrottleKey(req: Request, email: string): string {
  const address = getClientAddress(req);
  return createHash("sha256").update(`${address}|${email.trim().toLowerCase()}`).digest("hex");
}

export function loginThrottleKeys(req: Request, email: string): LoginThrottleKeys {
  return {
    // Preserve the existing pair key so a release cannot clear active blocks.
    pair: loginThrottleKey(req, email),
    ip: createHash("sha256").update(`login:ip\0${getClientAddress(req)}`).digest("hex"),
    account: createHash("sha256").update(`login:account\0${email.trim().toLowerCase()}`).digest("hex"),
  };
}

export async function consumeLoginThrottle(keys: LoginThrottleKeys, now = new Date()): Promise<LoginThrottleResult> {
  const buckets = [
    { key: keys.ip, maxAttempts: IP_MAX_ATTEMPTS, blockMs: WINDOW_MS },
    { key: keys.account, maxAttempts: ACCOUNT_MAX_ATTEMPTS, blockMs: WINDOW_MS },
    { key: keys.pair, maxAttempts: PAIR_MAX_ATTEMPTS, blockMs: BLOCK_MS },
  ];
  // Keep denied traffic read-only in the usual case. This is only a fast path:
  // every UPSERT below checks again while holding its row lock.
  const blocked = await prisma.loginThrottle.findFirst({
    where: { key: { in: buckets.map(bucket => bucket.key) }, blockedUntil: { gt: now } },
    orderBy: { blockedUntil: "desc" }, select: { blockedUntil: true },
  });
  if (blocked?.blockedUntil) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((blocked.blockedUntil.getTime() - now.getTime()) / 1000)) };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // All requests take locks in IP -> account -> pair order to avoid cycles.
      for (const bucket of buckets) {
        const expired = Prisma.sql`("LoginThrottle"."windowStartedAt" <= ${new Date(now.getTime() - WINDOW_MS)}
          OR "LoginThrottle"."blockedUntil" IS NOT NULL)`;
        // ON CONFLICT locks the row and evaluates the current counter in SQL.
        // Reserving before bcrypt bounds concurrent attempts as well as failures.
        const admitted = await tx.$queryRaw<Array<{ key: string }>>(Prisma.sql`
          INSERT INTO "LoginThrottle" ("key", "attempts", "windowStartedAt", "blockedUntil", "updatedAt")
          VALUES (${bucket.key}, 1, ${now}, NULL, ${now})
          ON CONFLICT ("key") DO UPDATE SET
            "attempts" = CASE WHEN ${expired} THEN 1 ELSE "LoginThrottle"."attempts" + 1 END,
            "windowStartedAt" = CASE WHEN ${expired} THEN ${now} ELSE "LoginThrottle"."windowStartedAt" END,
            "blockedUntil" = CASE
              WHEN ${expired} THEN NULL
              WHEN "LoginThrottle"."attempts" + 1 >= ${bucket.maxAttempts}
                THEN ${new Date(now.getTime() + bucket.blockMs)}
              ELSE NULL END,
            "updatedAt" = ${now}
          WHERE "LoginThrottle"."blockedUntil" IS NULL OR "LoginThrottle"."blockedUntil" <= ${now}
          RETURNING "key"
        `);
        if (admitted.length === 0) {
          const record = await tx.loginThrottle.findUnique({ where: { key: bucket.key } });
          // Throwing rolls back reservations in the other buckets. Rejected
          // requests cannot consume their budgets or extend the current block.
          throw new LoginThrottleExceeded(Math.max(1, Math.ceil(((record?.blockedUntil?.getTime() ?? now.getTime()) - now.getTime()) / 1000)));
        }
      }
    });
    return { limited: false };
  } catch (error) {
    if (error instanceof LoginThrottleExceeded) return { limited: true, retryAfterSeconds: error.retryAfterSeconds };
    throw error;
  }
}

export async function clearLoginPair(keys: LoginThrottleKeys): Promise<void> {
  // A valid password must not replenish the IP or account-wide request budget.
  await prisma.loginThrottle.deleteMany({ where: { key: keys.pair } });
}
