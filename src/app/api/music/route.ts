export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function GET(_request: Request) {
  void _request;
  return Response.json({ ok: true, mode: "official-embed", ready: true, message: "音乐已改用网易云官方播放器。" }, { headers });
}

export async function POST(_request: Request) {
  void _request;
  return Response.json({ ok: false, code: "MUSIC_EMBED_ONLY", message: "音乐已改用网易云官方播放器，请刷新音乐页。" }, { status: 410, headers });
}
