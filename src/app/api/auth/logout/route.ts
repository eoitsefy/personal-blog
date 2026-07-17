import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE_NAME,
  LEGACY_ADMIN_SESSION_COOKIE_NAME,
  parseCookie,
  revokeSessionToken,
} from "@/lib/auth";
import { fail, getRequestId } from "@/lib/api";
import { validateMutationOrigin } from "@/lib/request-security";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const guardFailure = validateMutationOrigin(req);
  if (guardFailure) return fail("FORBIDDEN", guardFailure.message, guardFailure.status, requestId);
  const requestCookies = parseCookie(req.headers.get("cookie"));
  await revokeSessionToken(requestCookies[ADMIN_SESSION_COOKIE_NAME]).catch((error) => {
    console.error("[POST /api/auth/logout] session revocation failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
  const response = NextResponse.json({
    success: true,
    data: { loggedOut: true },
    error: null,
    requestId,
  }, { headers: { "Cache-Control": "no-store" } });

  response.cookies.set(ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(LEGACY_ADMIN_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
