import { getUserFromRequest } from "@/lib/auth";
import { readJsonMutation } from "@/lib/request-security";
import { readNeteaseConfiguration } from "@/lib/music/netease-config.server";
import { createNeteaseClient, getNeteaseStatus } from "@/lib/music/netease.server";
import { NeteaseTrialError, safeMusicId } from "@/lib/music/netease-trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Cross-Origin-Resource-Policy": "same-origin",
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });

export async function GET(request: Request) {
  const user = await getUserFromRequest(request);
  const configuration = readNeteaseConfiguration();
  return json({ ok: true, ready: Boolean(configuration.config), signedIn: Boolean(user),
    accountId: user?.id ?? null,
    authenticated: user ? getNeteaseStatus(user.id).authenticated : false,
    message: configuration.config ? "音乐接入已配置，连接自己的网易云账号后即可搜索播放。" : "音乐服务暂未开放，请稍后再来。" });
}

export async function POST(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return json({ ok: false, code: "FORBIDDEN", message: "请求来源不受信任" }, 403);
  const body = await readJsonMutation(request, 2_048);
  if (!body.ok) return json({ ok: false, message: body.failure.message }, body.failure.status);
  if (!body.value || typeof body.value !== "object" || Array.isArray(body.value)) return json({ ok: false, message: "请求内容无效" }, 400);
  const input = body.value as Record<string, unknown>;
  if (!["search", "play", "login-start", "login-check"].includes(String(input.action))) return json({ ok: false, message: "不支持的操作" }, 400);
  if (input.action === "search" && (typeof input.query !== "string" || !input.query.trim() || input.query.trim().length > 80)) return json({ ok: false, message: "请输入 1 至 80 个字符的歌曲或歌手名称" }, 400);
  if (input.action === "play" && !safeMusicId(input.songId)) return json({ ok: false, message: "歌曲编号无效" }, 400);
  const user = await getUserFromRequest(request);
  if (!user) return json({ ok: false, code: "LOGIN_REQUIRED", message: "请先登录博客，再连接网易云音乐。" }, 401);
  try {
    const client = createNeteaseClient(user.id);
    client.reserveRequest();
    const { config } = readNeteaseConfiguration();
    if (!config) return json({ ok: false, code: "MISSING_CONFIGURATION", message: "音乐服务暂未开放，请稍后再来。" }, 503);
    if (input.action === "login-start") return json({ ok: true, login: await client.startNeteaseLogin(config) });
    if (input.action === "login-check") return json({ ok: true, login: await client.checkNeteaseLogin(config) });
    if (input.action === "search") return json({ ok: true, songs: await client.searchNeteaseSongs(input.query as string, config) });
    return json({ ok: true, track: await client.getNeteaseTrack(input.songId as string, config) });
  } catch (error) {
    if (error instanceof NeteaseTrialError) return json({ ok: false, code: error.code, message: error.message }, error.status);
    return json({ ok: false, code: "UPSTREAM_ERROR", message: "音乐服务暂时无法响应，请稍后重试。" }, 502);
  }
}
