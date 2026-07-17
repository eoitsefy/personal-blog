import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { readJsonMutation } from "@/lib/request-security";
import { requireAdmin } from "@/lib/require-admin";
import { absoluteUrl } from "@/lib/site";
import { EmailSchema, issueUserToken } from "@/lib/user-lifecycle";

const Schema = z.object({ email: EmailSchema });

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", "请输入有效邮箱", 400, auth.requestId);

  if (await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } })) {
    return fail("CONFLICT", "该邮箱已经注册", 409, auth.requestId);
  }
  const issued = await issueUserToken({
    type: "INVITE",
    email: parsed.data.email,
    createdById: auth.user.id,
  });
  return ok({
    email: parsed.data.email,
    expiresAt: issued.expiresAt.toISOString(),
    invitationUrl: absoluteUrl(`/join?token=${encodeURIComponent(issued.token)}`),
  }, auth.requestId, 201);
}
