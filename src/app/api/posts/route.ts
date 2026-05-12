import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/api";
import { PostStatus } from "@prisma/client";

const createPostSchema = z.object({
  title: z.string().min(1).max(120),
  slug: z.string().min(1).max(160).regex(/^[a-z0-9-]+$/),
  contentMd: z.string().min(1),
  status: z.nativeEnum(PostStatus).default(PostStatus.DRAFT),
});

function json(
  body: unknown,
  init?: { status?: number; requestId?: string }
): NextResponse {
  const requestId = init?.requestId ?? crypto.randomUUID();
  return NextResponse.json(
    { ...(body as object), requestId },
    { status: init?.status ?? 200 }
  );
}

function parseCookie(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function isAdminByCookie(req: Request): boolean {
  const cookies = parseCookie(req.headers.get("cookie"));
  const session = cookies["admin_session"];
  const expected = process.env.ADMIN_SESSION_TOKEN;
  return Boolean(session && expected && session === expected);
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  const posts = await prisma.post.findMany({
    where: { status: PostStatus.PUBLISHED },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json({ success: true, data: posts }, { requestId });
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);

  try {
    if (!isAdminByCookie(req)) {
      return json(
        { success: false, error: { code: "FORBIDDEN", message: "无权限" } },
        { status: 403, requestId }
      );
    }

    const raw = await req.json();
    const parsed = createPostSchema.safeParse(raw);

    if (!parsed.success) {
      return json(
        {
          success: false,
          error: { code: "VALIDATION_ERROR", message: parsed.error.message },
        },
        { status: 400, requestId }
      );
    }

    const { title, slug, contentMd, status } = parsed.data;

    const exists = await prisma.post.findUnique({ where: { slug } });
    if (exists) {
      return json(
        { success: false, error: { code: "CONFLICT", message: "slug 已存在" } },
        { status: 409, requestId }
      );
    }

    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      return json(
        {
          success: false,
          error: { code: "INTERNAL_ERROR", message: "ADMIN_EMAIL 未配置" },
        },
        { status: 500, requestId }
      );
    }

    const adminUser = await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash: "env-admin-no-db-login",
        role: "ADMIN",
      },
      select: { id: true },
    });

    const created = await prisma.post.create({
      data: {
        title,
        slug,
        contentMd,
        status,
        author: { connect: { id: adminUser.id } },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });

    return json({ success: true, data: created }, { status: 201, requestId });
  } catch (error) {
    console.error("[POST /api/posts] failed", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "服务器错误" } },
      { status: 500, requestId }
    );
  }
}
