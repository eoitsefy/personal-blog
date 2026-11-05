import { GET as getMusic, POST as postMusic } from "@/app/api/music/route";
import { isLocalMusicTrial } from "@/lib/music/netease-trial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the old diagnostic URL unavailable on the public site.
export async function GET(request: Request) {
  return isLocalMusicTrial(request, process.env.NODE_ENV) ? getMusic(request) : new Response(null, { status: 404 });
}
export async function POST(request: Request) {
  return isLocalMusicTrial(request, process.env.NODE_ENV) ? postMusic(request) : new Response(null, { status: 404 });
}
