export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function ok<T>(data: T, requestId: string, status = 200) {
  return Response.json(
    { success: true, data, error: null, requestId },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId: string,
  headers?: HeadersInit,
) {
  return Response.json(
    { success: false, data: null, error: { code, message }, requestId },
    { status, headers: { "Cache-Control": "no-store", ...Object.fromEntries(new Headers(headers)) } }
  );
}

export function getRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function logApi(params: {
  requestId: string;
  path: string;
  method: string;
  status: number;
  latencyMs: number;
  userId?: string | null;
}) {
  // MVP先console，后续接入结构化日志平台
  console.log(
    JSON.stringify({
      level: "info",
      type: "api_access",
      ...params,
      ts: new Date().toISOString(),
    })
  );
}
