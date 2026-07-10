import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { ok: true, code: "OK", route: "/api/_diag/ping", ts: new Date().toISOString() },
    { status: 200 }
  );
}
