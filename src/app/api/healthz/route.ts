import { NextResponse } from "next/server";
import { getMapHealthSummary } from "@/lib/map/config";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      code: "OK",
      route: "/api/healthz",
      features: { map: getMapHealthSummary() },
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
