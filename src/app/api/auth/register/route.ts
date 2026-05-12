import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, getRequestId, logApi, ok } from "@/lib/api";
import { hashPassword, signAccessToken } from "@/lib/auth";

const RegisterSchema = z.object({
  email: z.string().email().max(120),
  password: z.string().min(8).max(64),
});

export async function POST(req: Request) {
  const start = Date.now();
  const requestId = getRequestId(req);

  try {
    const body = await req.json();
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      const res = fail("BAD_REQUEST", "参数不合法", 400, requestId);
      logApi({
        requestId,
        path: "/api/auth/register",
        method: "POST",
        status: 400,
        latencyMs: Date.now() - start,
      });
      return res;
    }

    const adminCount = await prisma.user.count({
      where: { role: "ADMIN" },
    });

    if (adminCount > 0) {
      const res = fail("FORBIDDEN", "管理员已存在，禁止重复初始化", 403, requestId);
      logApi({
        requestId,
        path: "/api/auth/register",
        method: "POST",
        status: 403,
        latencyMs: Date.now() - start,
      });
      return res;
    }

    const exists = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });

    if (exists) {
      const res = fail("CONFLICT", "邮箱已注册", 409, requestId);
      logApi({
        requestId,
        path: "/api/auth/register",
        method: "POST",
        status: 409,
        latencyMs: Date.now() - start,
      });
      return res;
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        passwordHash,
        role: "ADMIN",
      },
      select: { id: true, email: true, role: true },
    });

    const accessToken = signAccessToken({
      userId: user.id,
      role: "ADMIN",
    });

    const res = ok({ user, accessToken }, requestId);
    logApi({
      requestId,
      path: "/api/auth/register",
      method: "POST",
      status: 200,
      latencyMs: Date.now() - start,
      userId: user.id,
    });
    return res;
  } catch (e) {
    console.error(e);
    const res = fail("INTERNAL_ERROR", "服务器内部错误", 500, requestId);
    logApi({
      requestId,
      path: "/api/auth/register",
      method: "POST",
      status: 500,
      latencyMs: Date.now() - start,
    });
    return res;
  }
}
