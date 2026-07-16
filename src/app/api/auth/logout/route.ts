import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE_NAME } from "@/lib/auth";
import { fail, getRequestId } from "@/lib/api";
import { validateMutationOrigin } from "@/lib/request-security";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const guardFailure = validateMutationOrigin(req);
  if (guardFailure) return fail("FORBIDDEN", guardFailure.message, guardFailure.status, requestId);
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
  return response;
}
