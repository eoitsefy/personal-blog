import { z } from "zod";
import { fail, ok, getRequestId } from "@/lib/api";
import { issueUserSession } from "@/lib/auth";
import { readJsonMutation } from "@/lib/request-security";
import { acceptInvitation, PasswordSchema } from "@/lib/user-lifecycle";

const Schema = z.object({
  token: z.string().max(128),
  password: PasswordSchema,
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const body = await readJsonMutation(req, 8_192);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, requestId);
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", parsed.error.issues[0]?.message ?? "注册信息无效", 400, requestId);
  const result = await acceptInvitation(parsed.data.token, parsed.data.password);
  if (!result.ok) {
    const message = result.reason === "EMAIL_EXISTS" ? "该邮箱已经注册" : "邀请链接无效或已过期";
    return fail(result.reason === "EMAIL_EXISTS" ? "CONFLICT" : "BAD_REQUEST", message, result.reason === "EMAIL_EXISTS" ? 409 : 400, requestId);
  }
  const session = await issueUserSession(result.userId);
  const response = ok({ user: { id: result.userId, email: result.email, role: "USER" } }, requestId, 201);
  response.headers.append("Set-Cookie", `blog_session=${session.token}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
