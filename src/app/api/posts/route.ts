import { fail, getRequestId, ok } from "@/lib/api";
import { buildPublicPostWhere, PUBLIC_POST_PAGE_SIZE } from "@/lib/post-query";
import { prisma } from "@/lib/prisma";
import { postListQuerySchema } from "@/lib/validators/post";

export async function GET(req: Request) {
  const requestId = getRequestId(req);

  try {
    const url = new URL(req.url);
    const parsed = postListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return fail("BAD_REQUEST", "查询参数无效", 400, requestId);

    const query = parsed.data;
    const where = buildPublicPostWhere(query);
    const [total, posts, categories, tags] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * PUBLIC_POST_PAGE_SIZE,
        take: PUBLIC_POST_PAGE_SIZE,
        select: {
          id: true,
          title: true,
          slug: true,
          excerpt: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { name: true, slug: true } },
          tags: { select: { tag: { select: { name: true, slug: true } } } },
        },
      }),
      prisma.category.findMany({
        where: { posts: { some: { status: "PUBLISHED", deletedAt: null } } },
        orderBy: { name: "asc" },
        select: { name: true, slug: true },
      }),
      prisma.tag.findMany({
        where: { posts: { some: { post: { status: "PUBLISHED", deletedAt: null } } } },
        orderBy: { name: "asc" },
        select: { name: true, slug: true },
      }),
    ]);

    return ok({
      posts,
      categories,
      tags,
      pagination: {
        page: query.page,
        pageSize: PUBLIC_POST_PAGE_SIZE,
        total,
        totalPages: Math.max(1, Math.ceil(total / PUBLIC_POST_PAGE_SIZE)),
      },
    }, requestId);
  } catch (error) {
    console.error("[GET /api/posts] failed", error);
    return fail("INTERNAL_ERROR", "文章列表加载失败", 500, requestId);
  }
}
