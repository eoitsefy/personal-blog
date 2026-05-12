import { NextResponse } from "next/server";
import { z } from "zod";
import { getRequestId } from "@/lib/api";

const bodySchema = z.object({
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: "参数不合法", details: parsed.error.flatten() },
          requestId,
        },
        { status: 400 },
      );
    }

    const ok = parsed.data.password === process.env.ADMIN_LOGIN_PASSWORD;
    if (!ok) {
      return NextResponse.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "密码错误" }, requestId },
        { status: 401 },
      );
    }

    const res = NextResponse.json({ success: true, data: { loggedIn: true }, requestId });

    res.cookies.set("admin_session", process.env.ADMIN_SESSION_SECRET || "dev-admin-session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    console.info(
      JSON.stringify({
        requestId,
        route: "/api/admin/login",
        method: "POST",
        status: 200,
        latency: Date.now() - start,
      }),
    );

    return res;
  } catch (e) {
    console.error(
      JSON.stringify({
        requestId,
        route: "/api/admin/login",
        method: "POST",
        status: 500,
        latency: Date.now() - start,
        error: String(e),
      }),
    );
    return NextResponse.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" }, requestId },
      { status: 500 },
    );
  }
}
