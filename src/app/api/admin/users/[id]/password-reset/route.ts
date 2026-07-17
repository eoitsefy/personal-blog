import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { validateMutationOrigin } from "@/lib/request-security";
import { requireAdmin } from "@/lib/require-admin";
import { absoluteUrl } from "@/lib/site";
import { issueUserToken } from "@/lib/user-lifecycle";

export async function POST(req: Request, context: RouteContext<"/api/admin/users/[id]/password-reset">) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const originFailure = validateMutationOrigin(req);
  if (originFailure) return fail("FORBIDDEN", originFailure.message, originFailure.status, auth.requestId);
  const { id } = await context.params;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, status: true },
  });
  if (!user) return fail("NOT_FOUND", "用户不存在", 404, auth.requestId);
  if (user.status !== "ACTIVE") return fail("CONFLICT", "停用用户不能生成密码重置链接", 409, auth.requestId);

  const issued = await issueUserToken({
    type: "PASSWORD_RESET",
    email: user.email,
    userId: user.id,
    createdById: auth.user.id,
  });
  return ok({
    email: user.email,
    expiresAt: issued.expiresAt.toISOString(),
    resetUrl: absoluteUrl(`/reset-password?token=${encodeURIComponent(issued.token)}`),
  }, auth.requestId, 201);
}
