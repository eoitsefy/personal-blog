import { fail, getRequestId } from "@/lib/api";
import { getClientAddress, readJsonMutation } from "@/lib/request-security";
import { MapClientEventSchema, MapEventRateLimiter } from "@/lib/map/telemetry";

const limiter = new MapEventRateLimiter();

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const body = await readJsonMutation(request, 4_096);
  if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, requestId);

  const parsed = MapClientEventSchema.safeParse(body.value);
  if (!parsed.success) return fail("BAD_REQUEST", "地图运行事件无效", 400, requestId);
  if (!limiter.allow(getClientAddress(request))) {
    return fail("RATE_LIMITED", "地图运行事件提交过于频繁", 429, requestId);
  }

  console.info(JSON.stringify({
    level: "info",
    type: "map_client_event",
    requestId,
    ...parsed.data,
    ts: new Date().toISOString(),
  }));
  return Response.json(
    { success: true, data: { accepted: true }, error: null, requestId },
    { status: 202, headers: { "Cache-Control": "no-store" } },
  );
}
