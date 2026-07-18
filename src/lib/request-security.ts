const JSON_CONTENT_TYPE = "application/json";

export type RequestGuardFailure = { status: 400 | 403 | 413 | 415; message: string };

export function getClientAddress(req: Request) {
  const realAddress = req.headers.get("x-real-ip")?.trim();
  if (realAddress) return realAddress;

  // Nginx appends the connecting address to X-Forwarded-For. Reading the last
  // value avoids trusting a client-supplied first entry when the app is only
  // reachable through the local reverse proxy.
  const forwarded = req.headers.get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded?.at(-1) ?? "unknown";
}

export function validateMutationOrigin(req: Request): RequestGuardFailure | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;

  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(req.url);
    const forwardedHost = req.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
    const host = forwardedHost ?? req.headers.get("host") ?? requestUrl.host;
    if (originUrl.host !== host) {
      return { status: 403, message: "请求来源不受信任" };
    }
  } catch {
    return { status: 403, message: "请求来源不受信任" };
  }

  return null;
}

export function validateJsonMutation(req: Request, maxBytes = 256_000): RequestGuardFailure | null {
  const originFailure = validateMutationOrigin(req);
  if (originFailure) return originFailure;

  const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== JSON_CONTENT_TYPE) {
    return { status: 415, message: "请求必须使用 application/json" };
  }

  const contentLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { status: 413, message: "请求内容过大" };
  }

  return null;
}

export async function readJsonMutation(
  req: Request,
  maxBytes = 256_000,
): Promise<{ ok: true; value: unknown } | { ok: false; failure: RequestGuardFailure }> {
  const failure = validateJsonMutation(req, maxBytes);
  if (failure) return { ok: false, failure };

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength > maxBytes) {
    return { ok: false, failure: { status: 413, message: "请求内容过大" } };
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, failure: { status: 400, message: "JSON 内容无效" } };
  }
}
