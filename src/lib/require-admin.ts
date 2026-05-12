import { fail } from "@/lib/api";

type AdminAuthOk = {
  ok: true;
  requestId: string;
  user: {
    userId: string;
    role: "ADMIN";
  };
};

type AdminAuthFail = {
  ok: false;
  response: Response;
};

export type AdminAuthResult = AdminAuthOk | AdminAuthFail;

export function requireAdmin(req: Request): AdminAuthResult {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  const token = req.headers.get("x-admin-token");
  const expected = process.env.ADMIN_TOKEN;

  if (!expected) {
    return {
      ok: false,
      response: fail("INTERNAL_ERROR", "ADMIN_TOKEN is not configured", 500, requestId),
    };
  }

  if (!token || token !== expected) {
    return {
      ok: false,
      response: fail("UNAUTHORIZED", "Admin authorization required", 401, requestId),
    };
  }

  return {
    ok: true,
    requestId,
    user: {
      userId: "admin-token-user",
      role: "ADMIN",
    },
  };
}
