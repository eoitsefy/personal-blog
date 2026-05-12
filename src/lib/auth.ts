import crypto from "node:crypto";

const ADMIN_COOKIE_NAME = "admin_session";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function signAccessToken(payload: string): string {
  return payload;
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
