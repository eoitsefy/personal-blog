import { readMotionCandidateAsset } from "@/lib/assistant/natural-motion-preview.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ version: string; file: string }> }) {
  if (process.env.NODE_ENV !== "development") return new Response(null, { status: 404 });
  const host = new URL(request.url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) return new Response(null, { status: 404 });
  const { version, file } = await context.params;
  const test = new URL(request.url).searchParams.get("assetTest");
  if (test && !["fail-wave", "delay-1200"].includes(test)) return new Response(null, { status: 404 });
  try {
    const bytes = await readMotionCandidateAsset(version, file);
    // Fixed development-only fault cases, after normal path/hash validation.
    // Only action pages fail/delay so idle and the common anchor stay inspectable.
    if (/^wave-\d+\.webp$/.test(file)) {
      if (test === "fail-wave") return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
      if (test === "delay-1200") await new Promise(resolve => setTimeout(resolve, 1200));
    }
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin", "X-Robots-Tag": "noindex, nofollow",
    } });
  } catch { return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } }); }
}
