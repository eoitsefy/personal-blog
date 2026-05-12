import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, ok, logApi } from "@/lib/api";
import { requireAdmin } from "@/lib/require-admin";

const CreatePostSchema = z.object({
  title: z.string().min(2).max(120),
  slug: z.string().min(3).max(80).regex(/^[a-z0-9-]+$/),
  excerpt: z.string().max(300).optional(),
  contentMd: z.string().min(10),
});

export async function POST(req: Request) {
  const start = Date.now();

  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { requestId, user } = auth;

  try {
    const body = await req.json();
    const parsed = CreatePostSchema.safeParse(body);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "参数不合法", 400, requestId);
    }

    const post = await prisma.post.create({
      data: {
        title: parsed.data.title,
        slug: parsed.data.slug,
        excerpt: parsed.data.excerpt,
        contentMd: parsed.data.contentMd,
        authorId: user.userId,
        status: "DRAFT",
      },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        createdAt: true,
      },
    });

    logApi({
      requestId,
      path: "/api/admin/posts",
      method: "POST",
      status: 200,
      latencyMs: Date.now() - start,
      userId: user.userId,
    });

    return ok({ post }, requestId);
  } catch (e) {
    console.error(e);
    return fail("INTERNAL_ERROR", "服务器内部错误", 500, requestId);
  }
}
