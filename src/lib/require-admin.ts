import { fail, getRequestId } from "@/lib/api";
import { getAdminFromRequest, type AdminUser } from "@/lib/auth";

type AdminAuthResult =
  | { ok: true; requestId: string; user: AdminUser }
  | { ok: false; response: Response };

export async function requireAdmin(req: Request): Promise<AdminAuthResult> {
  const requestId = getRequestId(req);
  const user = await getAdminFromRequest(req);

  if (!user) {
    return {
      ok: false,
      response: fail("UNAUTHORIZED", "管理员登录已失效，请重新登录", 401, requestId),
    };
  }

  return { ok: true, requestId, user };
}
