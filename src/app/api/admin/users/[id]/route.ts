import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { readJsonMutation } from "@/lib/request-security";
import { requireAdmin } from "@/lib/require-admin";

const Schema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });

export async function PATCH(req: Request, context: RouteContext<"/api/admin/users/[id]">) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", "账号状态无效", 400, auth.requestId);
  const { id } = await context.params;
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
  if (!target) return fail("NOT_FOUND", "用户不存在", 404, auth.requestId);
  if (target.id === auth.user.id && parsed.data.status === "DISABLED") {
    return fail("CONFLICT", "不能停用当前登录的管理员", 409, auth.requestId);
  }
  if (target.role === "ADMIN" && parsed.data.status === "DISABLED") {
    const activeAdmins = await prisma.user.count({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (activeAdmins <= 1) return fail("CONFLICT", "不能停用最后一个有效管理员", 409, auth.requestId);
  }

  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: { status: parsed.data.status },
      select: { id: true, email: true, role: true, status: true },
    });
    if (parsed.data.status === "DISABLED") {
      await tx.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: now } });
      await tx.userToken.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: now } });
    }
    return updated;
  });
  return ok({ user }, auth.requestId);
}
