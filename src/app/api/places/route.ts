import { fail, getRequestId, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { publicPlaceSelect, publicPlaceWhere, serializePublicPlace } from "@/lib/places";
import { publicPlaceListQuerySchema } from "@/lib/validators/place";

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  try {
    const parsed = publicPlaceListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return fail("BAD_REQUEST", "查询参数无效", 400, requestId);
    const query = parsed.data;
    const places = await prisma.place.findMany({
      where: {
        ...publicPlaceWhere,
        ...(query.q ? { OR: [
          { name: { contains: query.q, mode: "insensitive" } },
          { locationLabel: { contains: query.q, mode: "insensitive" } },
          { summary: { contains: query.q, mode: "insensitive" } },
        ] } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: {
        ...publicPlaceSelect,
        posts: {
          where: { post: { status: "PUBLISHED", deletedAt: null } },
          orderBy: { post: { publishedAt: "desc" } },
          select: { post: { select: { slug: true, title: true, excerpt: true, publishedAt: true } } },
        },
      },
    });
    return ok({ places: places.map((place) => ({ ...serializePublicPlace(place), posts: place.posts.map(({ post }) => post) })) }, requestId);
  } catch (error) {
    console.error("[GET /api/places] failed", error);
    return fail("INTERNAL_ERROR", "地点列表加载失败", 500, requestId);
  }
}
