import { fail, getRequestId } from "@/lib/api";
import { getUserFromRequest, type SessionUser } from "@/lib/auth";

type VerifiedUserResult =
  | { ok: true; requestId: string; user: SessionUser }
  | { ok: false; response: Response };

export async function requireVerifiedUser(req: Request): Promise<VerifiedUserResult> {
  const requestId = getRequestId(req);
  const user = await getUserFromRequest(req);
  if (!user) return { ok: false, response: fail("UNAUTHORIZED", "请先登录", 401, requestId) };

  if (!user.emailVerifiedAt) {
    return { ok: false, response: fail("FORBIDDEN", "邮箱尚未验证", 403, requestId) };
  }
  return { ok: true, requestId, user };
}
