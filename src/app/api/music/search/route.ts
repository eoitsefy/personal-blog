import { getClientAddress, readJsonMutation, validateJsonMutation } from "@/lib/request-security";
import { normalizeMusicQuery } from "@/lib/music/music-search";
import { musicSearchService, MusicSearchError } from "@/lib/music/music-search.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Cross-Origin-Resource-Policy": "same-origin" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json({ ok: false, message: "请求来源不受信任" }, 403);
  const invalid = validateJsonMutation(request, 1024);
  if (invalid) return json({ ok: false, message: invalid.message }, invalid.status);
  // Bound the incoming stream before invoking the common JSON parser.
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    if (reader) while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 1024) { await reader.cancel(); return json({ ok: false, message: "请求内容过大" }, 413); } chunks.push(next.value); }
  } catch { return json({ ok: false, message: "无法读取请求" }, 400); } finally { reader?.releaseLock(); }
  const copy = new Request(request.url, { method: "POST", headers: request.headers, body: Buffer.concat(chunks) });
  const body = await readJsonMutation(copy, 1024);
  if (!body.ok) return json({ ok: false, message: body.failure.message }, body.failure.status);
  const value = body.value && typeof body.value === "object" && !Array.isArray(body.value) ? body.value as Record<string, unknown> : {};
  const query = normalizeMusicQuery(value.query);
  if (!query) return json({ ok: false, message: "请输入 1 至 80 个字符的有效搜索词。" }, 400);
  try { return json({ ok: true, songs: await musicSearchService.search(query, getClientAddress(request)) }); }
  catch (error) {
    const reason = error instanceof MusicSearchError ? error.reason : "UPSTREAM";
    const status = reason === "RATE_LIMITED" ? 429 : reason === "BUSY" ? 503 : reason === "TIMEOUT" ? 504 : 502;
    return json({ ok: false, message: "搜索暂时不可用，请稍后重试，或粘贴网易云音乐完整链接。" }, status);
  }
}
