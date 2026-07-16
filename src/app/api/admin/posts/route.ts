import { Prisma } from "@prisma/client";
import { fail, logApi, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { ADMIN_POST_PAGE_SIZE } from "@/lib/post-query";
import { normalizeTags, normalizeTaxonomyTerm } from "@/lib/post-taxonomy";
import { readJsonMutation } from "@/lib/request-security";
import { adminPostListQuerySchema, CreatePostInputSchema } from "@/lib/validators/post";

export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const parsed = adminPostListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return fail("BAD_REQUEST", "查询参数无效", 400, auth.requestId);

  const query = parsed.data;
  const where: Prisma.PostWhereInput = {
    deletedAt: query.deleted === "trash" ? { not: null } : null,
    ...(query.status !== "ALL" ? { status: query.status } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { slug: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * ADMIN_POST_PAGE_SIZE,
      take: ADMIN_POST_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        status: true,
        publishedAt: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { name: true, slug: true } },
        tags: { select: { tag: { select: { name: true, slug: true } } } },
      },
    }),
  ]);

  return ok({
    posts,
    pagination: {
      page: query.page,
      pageSize: ADMIN_POST_PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / ADMIN_POST_PAGE_SIZE)),
    },
  }, auth.requestId);
}

export async function POST(req: Request) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await readJsonMutation(req);
    if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);

    const parsed = CreatePostInputSchema.safeParse(body.value);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "文章内容不符合要求", 400, auth.requestId);
    }

    const input = parsed.data;
    const category = normalizeTaxonomyTerm(input.category);
    const tags = normalizeTags(input.tags);
    const post = await prisma.post.create({
      data: {
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt || null,
        contentMd: input.contentMd,
        status: input.status,
        publishedAt: input.status === "PUBLISHED" ? new Date() : null,
        author: { connect: { id: auth.user.id } },
        ...(category
          ? {
              category: {
                connectOrCreate: {
                  where: { slug: category.slug },
                  create: category,
                },
              },
            }
          : {}),
        tags: {
          create: tags.map((tag) => ({
            tag: { connectOrCreate: { where: { slug: tag.slug }, create: tag } },
          })),
        },
      },
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
        category: { select: { name: true, slug: true } },
        tags: { select: { tag: { select: { name: true, slug: true } } } },
      },
    });

    logApi({
      requestId: auth.requestId,
      path: "/api/admin/posts",
      method: "POST",
      status: 201,
      latencyMs: Date.now() - start,
      userId: auth.user.id,
    });
    return ok({ post }, auth.requestId, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("CONFLICT", "文章 slug 已存在", 409, auth.requestId);
    }

    console.error("[POST /api/admin/posts] failed", error);
    return fail("INTERNAL_ERROR", "文章创建失败", 500, auth.requestId);
  }
}
