import { Prisma } from "@prisma/client";
import { fail, logApi, ok } from "@/lib/api";
import { syncPostAssistantIndex } from "@/lib/assistant/indexing";
import { InvalidAssetReferenceError, syncPostAssets } from "@/lib/media/references";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { normalizeTags, normalizeTaxonomyTerm } from "@/lib/post-taxonomy";
import { InvalidPlaceReferenceError, syncPostPlaces } from "@/lib/places";
import { readJsonMutation, validateMutationOrigin } from "@/lib/request-security";
import { UpdatePostInputSchema } from "@/lib/validators/post";

type RouteParams = { params: Promise<{ id: string }> };

const postSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  contentMd: true,
  status: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  category: { select: { name: true, slug: true } },
  tags: { select: { tag: { select: { name: true, slug: true } } } },
  assets: { select: { assetId: true } },
  places: { select: { placeId: true } },
} satisfies Prisma.PostSelect;

export async function GET(req: Request, { params }: RouteParams) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id }, select: postSelect });
  if (!post) return fail("NOT_FOUND", "文章不存在", 404, auth.requestId);
  return ok({ post }, auth.requestId);
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await readJsonMutation(req);
    if (!body.ok) return fail("BAD_REQUEST", body.failure.message, body.failure.status, auth.requestId);

    const parsed = UpdatePostInputSchema.safeParse(body.value);
    if (!parsed.success) {
      return fail("BAD_REQUEST", "文章内容不符合要求", 400, auth.requestId);
    }

    const existing = await prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        deletedAt: true,
        contentMd: true,
        assets: { select: { assetId: true } },
        places: { select: { placeId: true } },
      },
    });
    if (!existing) return fail("NOT_FOUND", "文章不存在", 404, auth.requestId);
    if (existing.deletedAt) return fail("CONFLICT", "请先从回收站恢复文章", 409, auth.requestId);

    const input = parsed.data;
    const data: Prisma.PostUpdateInput = {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.excerpt !== undefined ? { excerpt: input.excerpt || null } : {}),
      ...(input.contentMd !== undefined ? { contentMd: input.contentMd } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };

    if (input.category !== undefined) {
      const category = normalizeTaxonomyTerm(input.category);
      data.category = category
        ? { connectOrCreate: { where: { slug: category.slug }, create: category } }
        : { disconnect: true };
    }

    if (input.tags !== undefined) {
      const tags = normalizeTags(input.tags);
      data.tags = {
        deleteMany: {},
        create: tags.map((tag) => ({
          tag: { connectOrCreate: { where: { slug: tag.slug }, create: tag } },
        })),
      };
    }

    if (input.status === "PUBLISHED") {
      data.publishedAt = existing.publishedAt ?? new Date();
    } else if (input.status === "DRAFT") {
      data.publishedAt = null;
    }

    const post = await prisma.$transaction(async (tx) => {
      await tx.post.update({ where: { id }, data });
      if (input.assetIds !== undefined || input.contentMd !== undefined) {
        await syncPostAssets(
          tx,
          id,
          input.assetIds ?? existing.assets.map(({ assetId }) => assetId),
          input.contentMd ?? existing.contentMd,
        );
      }
      if (input.placeIds !== undefined) {
        await syncPostPlaces(tx, id, input.placeIds);
      }
      await syncPostAssistantIndex(tx, id);
      return tx.post.findUniqueOrThrow({ where: { id }, select: postSelect });
    });
    logApi({
      requestId: auth.requestId,
      path: `/api/admin/posts/${id}`,
      method: "PATCH",
      status: 200,
      latencyMs: Date.now() - start,
      userId: auth.user.id,
    });
    return ok({ post }, auth.requestId);
  } catch (error) {
    if (error instanceof InvalidAssetReferenceError || error instanceof InvalidPlaceReferenceError) {
      return fail("BAD_REQUEST", error.message, 400, auth.requestId);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail("CONFLICT", "文章 slug 已存在", 409, auth.requestId);
    }

    console.error(`[PATCH /api/admin/posts/${id}] failed`, error);
    return fail("INTERNAL_ERROR", "文章更新失败", 500, auth.requestId);
  }
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const start = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const guardFailure = validateMutationOrigin(req);
  if (guardFailure) return fail("FORBIDDEN", guardFailure.message, guardFailure.status, auth.requestId);

  const { id } = await params;
  const existing = await prisma.post.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!existing) return fail("NOT_FOUND", "文章不存在", 404, auth.requestId);

  if (!existing.deletedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.post.update({
        where: { id },
        data: { deletedAt: new Date(), status: "DRAFT", publishedAt: null },
      });
      await syncPostAssistantIndex(tx, id);
    });
  }
  logApi({
    requestId: auth.requestId,
    path: `/api/admin/posts/${id}`,
    method: "DELETE",
    status: 200,
    latencyMs: Date.now() - start,
    userId: auth.user.id,
  });
  return ok({ id, deleted: true }, auth.requestId);
}
