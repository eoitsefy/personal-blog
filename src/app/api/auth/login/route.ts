import { NextResponse } from "next/server";
import { z } from "zod";

const LoginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(120),
});

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  try {
    const raw = await req.json();
    const parsed = LoginSchema.safeParse(raw);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
          requestId,
        },
        { status: 400 }
      );
    }

    const { username, password } = parsed.data;
    const envUser = process.env.ADMIN_USERNAME;
    const envPass = process.env.ADMIN_LOGIN_PASSWORD;
    const sessionToken = process.env.ADMIN_SESSION_TOKEN;

    if (!envUser || !envPass || !sessionToken) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "管理员配置缺失" },
          requestId,
        },
        { status: 500 }
      );
    }

    if (username !== envUser || password !== envPass) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "用户名或密码错误" },
          requestId,
        },
        { status: 401 }
      );
    }

    const res = NextResponse.json(
      { success: true, data: { username: envUser }, requestId },
      { status: 200 }
    );

    res.cookies.set("admin_session", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false, // 生产 HTTPS 改 true
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return res;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "服务器错误" },
        requestId,
      },
      { status: 500 }
    );
  }
}
