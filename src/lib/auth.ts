import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE_NAME = "blog_session";
export const LEGACY_ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
export const ADMIN_SESSION_MAX_AGE = SESSION_MAX_AGE;

const SESSION_DURATION_MS = SESSION_MAX_AGE * 1000;
const LAST_SEEN_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_ACTIVE_SESSIONS_PER_USER = 5;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SessionUser = {
  id: string;
  email: string;
  role: UserRole;
  emailVerifiedAt: Date | null;
};

export type AdminUser = SessionUser & { role: "ADMIN" };

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isSessionToken(token: string | undefined): token is string {
  return typeof token === "string" && SESSION_TOKEN_PATTERN.test(token);
}

export async function issueUserSession(userId: string, now = new Date()) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_MS);

  await prisma.$transaction(async (tx) => {
    await tx.userSession.deleteMany({
      where: {
        userId,
        OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }],
      },
    });

    const olderSessions = await tx.userSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      skip: MAX_ACTIVE_SESSIONS_PER_USER - 1,
      select: { id: true },
    });
    if (olderSessions.length > 0) {
      await tx.userSession.updateMany({
        where: { id: { in: olderSessions.map(({ id }) => id) } },
        data: { revokedAt: now },
      });
    }

    await tx.userSession.create({
      data: { tokenHash, userId, expiresAt, lastSeenAt: now },
    });
  });

  return { token, expiresAt };
}

export async function revokeSessionToken(token: string | undefined, now = new Date()) {
  if (!isSessionToken(token)) return;
  await prisma.userSession.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: now },
  });
}

export async function revokeAllUserSessions(userId: string, now = new Date()) {
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now },
  });
}

export function parseCookie(header: string | null): Record<string, string> {
  if (!header) return {};

  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;

    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export async function getUserFromSessionToken(token: string | undefined, now = new Date()): Promise<SessionUser | null> {
  if (!isSessionToken(token)) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastSeenAt: true,
      user: { select: { id: true, email: true, role: true, status: true, emailVerifiedAt: true } },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== "ACTIVE") {
    return null;
  }

  if (session.lastSeenAt.getTime() <= now.getTime() - LAST_SEEN_WRITE_INTERVAL_MS) {
    await prisma.userSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastSeenAt: now },
    });
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    emailVerifiedAt: session.user.emailVerifiedAt,
  };
}

export async function getAdminFromSessionToken(token: string | undefined, now = new Date()): Promise<AdminUser | null> {
  const user = await getUserFromSessionToken(token, now);
  if (!user || user.role !== "ADMIN") return null;
  return { ...user, role: "ADMIN" };
}

export async function getUserFromRequest(req: Request): Promise<SessionUser | null> {
  const requestCookies = parseCookie(req.headers.get("cookie"));
  return getUserFromSessionToken(requestCookies[SESSION_COOKIE_NAME]);
}

export async function getAdminFromRequest(req: Request): Promise<AdminUser | null> {
  const user = await getUserFromRequest(req);
  if (!user || user.role !== "ADMIN") return null;
  return { ...user, role: "ADMIN" };
}
