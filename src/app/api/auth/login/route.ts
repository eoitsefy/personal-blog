import { NextResponse } from "next/server";
import { z } from "zod";
import { fail, getRequestId, logApi } from "@/lib/api";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE,
  signAdminSession,
  verifyPassword,
} from "@/lib/auth";
import {
  clearLoginFailures,
  getLoginThrottle,
  loginThrottleKey,
  recordLoginFailure,
} from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import { readJsonMutation } from "@/lib/request-security";

const LoginSchema = z.object({
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const body = await readJsonMutation(req, 8_192);
    if (!body.ok) {
      return fail("BAD_REQUEST", body.failure.message, body.failure.status, requestId);
    }

    const parsed = LoginSchema.safeParse(body.value);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "请输入有效的邮箱和密码", 400, requestId);
    }

    const email = parsed.data.email.toLowerCase();
    const throttleKey = loginThrottleKey(req, email);
    const throttle = await getLoginThrottle(throttleKey);
    if (throttle.limited) {
      return fail(
        "RATE_LIMITED",
        "登录尝试过于频繁，请稍后再试",
        429,
        requestId,
        { "Retry-After": String(throttle.retryAfterSeconds) },
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true },
    });

    // Always run a bcrypt comparison so unknown accounts do not create a timing side channel.
    const fallbackHash = "$2b$12$g5Zk0H5CAIJal76fGVjdpeXAkgwybRQA6X/19ptYZhgFs6bDNleEW";
    const passwordMatches = await verifyPassword(
      parsed.data.password,
      user?.passwordHash ?? fallbackHash,
    ).catch(() => false);

    if (!user || user.role !== "ADMIN" || !passwordMatches) {
      await recordLoginFailure(throttleKey);
      logApi({
        requestId,
        path: "/api/auth/login",
        method: "POST",
        status: 401,
        latencyMs: Date.now() - start,
      });
      return fail("UNAUTHORIZED", "邮箱或密码错误", 401, requestId);
    }

    await clearLoginFailures(throttleKey);

    const token = signAdminSession({ userId: user.id, role: "ADMIN" });
    const response = NextResponse.json(
      {
        success: true,
        data: { user: { id: user.id, email: user.email, role: "ADMIN" } },
        error: null,
        requestId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );

    response.cookies.set(ADMIN_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE,
      priority: "high",
    });

    logApi({
      requestId,
      path: "/api/auth/login",
      method: "POST",
      status: 200,
      latencyMs: Date.now() - start,
      userId: user.id,
    });
    return response;
  } catch (error) {
    console.error("[POST /api/auth/login] failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("INTERNAL_ERROR", "登录服务暂时不可用", 500, requestId);
  }
}
