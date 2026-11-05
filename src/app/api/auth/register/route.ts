import { Prisma } from "@prisma/client";
import { fail, getRequestId, ok } from "@/lib/api";
import { hashPassword, issueUserSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import { consumeLoginThrottle, loginThrottleKeys } from "@/lib/login-throttle";
import { prisma } from "@/lib/prisma";
import { registrationData, RegistrationSchema } from "@/lib/registration";
import { readJsonMutation } from "@/lib/request-security";

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  try {
    const body = await readJsonMutation(req, 8192);
    if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, requestId);
    const parsed = RegistrationSchema.safeParse(body.value);
    if (!parsed.success) return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "注册信息无效", 400, requestId);
    const { email, password } = parsed.data;
    const throttle = await consumeLoginThrottle(loginThrottleKeys(req, `registration:${email}`));
    if (throttle.limited) return fail("RATE_LIMITED", "注册尝试过于频繁，请稍后再试", 429, requestId, { "Retry-After": String(throttle.retryAfterSeconds) });
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: registrationData(email, passwordHash), select: { id: true, email: true } });
    const session = await issueUserSession(user.id);
    const response = ok({ user: { ...user, role: "USER" } }, requestId, 201);
    response.headers.set("Cache-Control", "no-store");
    response.headers.append("Set-Cookie", `${SESSION_COOKIE_NAME}=${session.token}; Path=/; Max-Age=${SESSION_MAX_AGE}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("CONFLICT", "该邮箱已经注册", 409, requestId);
    console.error("[POST /api/auth/register] failed", { requestId, code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : "UNEXPECTED" });
    return fail("INTERNAL_ERROR", "注册服务暂时不可用", 500, requestId);
  }
}
