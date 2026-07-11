import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await isAdmin(req))) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", message: "Admin authentication required" },
      { status: 401 },
    );
  }

  const { slug } = await params;
  const post = await prisma.post.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      excerpt: true,
      contentMd: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!post) {
    return NextResponse.json({ code: "POST_NOT_FOUND", message: "Post not found" }, { status: 404 });
  }

  return NextResponse.json({ code: "OK", data: post }, { status: 200 });
}
