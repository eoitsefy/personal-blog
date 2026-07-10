import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload, type Secret, type SignOptions } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

const ADMIN_COOKIE_NAME = "admin_session";
const ACCESS_COOKIE_NAME = "access_token";

type AccessTokenPayload = {
  userId: string;
  role: string;
};

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");

  const expiresInEnv = process.env.ACCESS_TOKEN_EXPIRES_IN ?? "7d";
  const options: SignOptions = { expiresIn: expiresInEnv as SignOptions["expiresIn"] };

  return jwt.sign(payload, secret as Secret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret as Secret) as JwtPayload & AccessTokenPayload;
    if (!decoded?.userId || !decoded?.role) return null;
    return { userId: decoded.userId, role: decoded.role };
  } catch {
    return null;
  }
}

export function parseCookie(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

export async function isAdmin(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookie(cookieHeader);
  const session = cookies[ADMIN_COOKIE_NAME];
  const expected = process.env.ADMIN_SESSION_TOKEN;

  if (!session || !expected) return false;
  return safeEqual(session, expected);
}

export async function getCurrentUserFromRequest(
  req: Request
): Promise<{ id: string; role: string } | null> {
  const cookieHeader = req.headers.get("cookie");
  const cookies = parseCookie(cookieHeader);

  const token = cookies[ACCESS_COOKIE_NAME];
  if (token) {
    const payload = verifyAccessToken(token);
    if (!payload) return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true },
    });
    return user ?? null;
  }

  // 向后兼容旧 admin_session
  const session = cookies[ADMIN_COOKIE_NAME];
  const expected = process.env.ADMIN_SESSION_TOKEN;
  if (session && expected && safeEqual(session, expected)) {
    return { id: "legacy-admin-session", role: "ADMIN" };
  }

  return null;
}

export async function requireAdmin(req: Request): Promise<{ id: string; role: string }> {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    const err = new Error("UNAUTHORIZED") as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (user.role !== "ADMIN") {
    const err = new Error("FORBIDDEN") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
  return user;
}
