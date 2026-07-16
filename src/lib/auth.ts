import bcrypt from "bcryptjs";
import jwt, { type JwtPayload, type Secret, type SignOptions } from "jsonwebtoken";
import { prisma } from "@/lib/prisma";

export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type AdminUser = {
  id: string;
  email: string;
  role: "ADMIN";
};

type AdminSessionPayload = {
  userId: string;
  role: "ADMIN";
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plain, passwordHash);
}

export function signAdminSession(payload: AdminSessionPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");

  const expiresIn = (process.env.ADMIN_SESSION_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"];
  return jwt.sign(payload, secret as Secret, { expiresIn });
}

export function verifyAdminSession(token: string): AdminSessionPayload | null {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;

  try {
    const decoded = jwt.verify(token, secret as Secret) as JwtPayload & Partial<AdminSessionPayload>;
    if (!decoded.userId || decoded.role !== "ADMIN") return null;
    return { userId: decoded.userId, role: "ADMIN" };
  } catch {
    return null;
  }
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

export async function getAdminFromSessionToken(token: string | undefined): Promise<AdminUser | null> {
  if (!token) return null;

  const payload = verifyAdminSession(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, role: true },
  });

  if (!user || user.role !== "ADMIN") return null;
  return { id: user.id, email: user.email, role: "ADMIN" };
}

export async function getAdminFromRequest(req: Request): Promise<AdminUser | null> {
  const cookies = parseCookie(req.headers.get("cookie"));
  return getAdminFromSessionToken(cookies[ADMIN_SESSION_COOKIE_NAME]);
}
