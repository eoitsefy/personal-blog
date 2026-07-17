import { z } from "zod";
import { fail, getRequestId, ok } from "@/lib/api";
import { readJsonMutation } from "@/lib/request-security";
import { PasswordSchema, resetPasswordWithToken } from "@/lib/user-lifecycle";

const Schema = z.object({ token: z.string().max(128), password: PasswordSchema });

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, requestId);
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "重置信息无效", 400, requestId);
  const result = await resetPasswordWithToken(parsed.data.token, parsed.data.password);
  if (!result.ok) return fail("BAD_REQUEST", "重置链接无效、已使用或已过期", 400, requestId);
  return ok({ reset: true }, requestId);
}
