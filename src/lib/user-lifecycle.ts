import { Prisma, type UserTokenType } from "@prisma/client";
import { z } from "zod";
import { createSessionToken, hashPassword, hashSessionToken, isSessionToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export const EmailSchema = z.string().trim().email().max(120).transform((value) => value.toLowerCase());
export const PasswordSchema = z.string()
  .min(12, "密码至少需要 12 个字符")
  .max(128, "密码不能超过 128 个字符")
  .regex(/[a-z]/, "密码需要包含小写字母")
  .regex(/[A-Z]/, "密码需要包含大写字母")
  .regex(/[0-9]/, "密码需要包含数字");

export type LifecycleResult =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "INVALID_TOKEN" | "EMAIL_EXISTS" | "USER_UNAVAILABLE" };

export async function issueUserToken(input: {
  type: UserTokenType;
  email: string;
  userId?: string;
  createdById: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const token = createSessionToken();
  const expiresAt = new Date(now.getTime() + (input.type === "INVITE" ? INVITE_TTL_MS : PASSWORD_RESET_TTL_MS));

  await prisma.$transaction(async (tx) => {
    await tx.userToken.updateMany({
      where: {
        type: input.type,
        usedAt: null,
        ...(input.type === "INVITE" ? { email: input.email } : { userId: input.userId }),
      },
      data: { usedAt: now },
    });
    await tx.userToken.create({
      data: {
        tokenHash: hashSessionToken(token),
        type: input.type,
        email: input.email,
        userId: input.userId,
        createdById: input.createdById,
        expiresAt,
      },
    });
  });

  return { token, expiresAt };
}

export async function acceptInvitation(token: string | undefined, password: string, now = new Date()): Promise<LifecycleResult> {
  if (!isSessionToken(token)) return { ok: false, reason: "INVALID_TOKEN" };
  const candidate = await prisma.userToken.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { type: true, usedAt: true, expiresAt: true },
  });
  if (!candidate || candidate.type !== "INVITE" || candidate.usedAt || candidate.expiresAt <= now) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  const passwordHash = await hashPassword(password);

  try {
    return await prisma.$transaction(async (tx) => {
      const invitation = await tx.userToken.findUnique({ where: { tokenHash: hashSessionToken(token) } });
      if (!invitation || invitation.type !== "INVITE" || invitation.usedAt || invitation.expiresAt <= now) {
        return { ok: false, reason: "INVALID_TOKEN" } as const;
      }
      if (await tx.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
        return { ok: false, reason: "EMAIL_EXISTS" } as const;
      }
      const claimed = await tx.userToken.updateMany({
        where: { id: invitation.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) return { ok: false, reason: "INVALID_TOKEN" } as const;

      const user = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          role: "USER",
          status: "ACTIVE",
          emailVerifiedAt: now,
        },
        select: { id: true, email: true },
      });
      return { ok: true, userId: user.id, email: user.email } as const;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "EMAIL_EXISTS" };
    }
    throw error;
  }
}

export async function resetPasswordWithToken(token: string | undefined, password: string, now = new Date()): Promise<LifecycleResult> {
  if (!isSessionToken(token)) return { ok: false, reason: "INVALID_TOKEN" };
  const candidate = await prisma.userToken.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { type: true, usedAt: true, expiresAt: true, userId: true },
  });
  if (!candidate || candidate.type !== "PASSWORD_RESET" || !candidate.userId || candidate.usedAt || candidate.expiresAt <= now) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const reset = await tx.userToken.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    if (!reset || reset.type !== "PASSWORD_RESET" || !reset.userId || reset.usedAt || reset.expiresAt <= now) {
      return { ok: false, reason: "INVALID_TOKEN" } as const;
    }
    const user = await tx.user.findUnique({ where: { id: reset.userId }, select: { id: true, email: true, status: true, emailVerifiedAt: true } });
    if (!user || user.status !== "ACTIVE") return { ok: false, reason: "USER_UNAVAILABLE" } as const;

    const claimed = await tx.userToken.updateMany({
      where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { ok: false, reason: "INVALID_TOKEN" } as const;

    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? now },
    });
    await tx.userSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    return { ok: true, userId: user.id, email: user.email } as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
