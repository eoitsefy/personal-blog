import { fail, getRequestId } from "@/lib/api";
import { getUserFromRequest, type SessionUser } from "@/lib/auth";

type ActiveUserResult =
  | { ok: true; requestId: string; user: SessionUser }
  | { ok: false; response: Response };

export async function requireActiveUser(req: Request): Promise<ActiveUserResult> {
  const requestId = getRequestId(req);
  const user = await getUserFromRequest(req);
  if (!user) return { ok: false, response: fail("UNAUTHORIZED", "请先登录", 401, requestId) };

  return { ok: true, requestId, user };
}
