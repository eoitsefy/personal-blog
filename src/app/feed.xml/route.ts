import { buildRssFeed, type PublicPostSeoRecord } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { getUiPreviewPostList, isUiPreviewEnabled } from "@/lib/ui-preview";
import { postListQuerySchema } from "@/lib/validators/post";

export const dynamic = "force-dynamic";

export async function GET() {
  let posts: PublicPostSeoRecord[];

  if (isUiPreviewEnabled()) {
    posts = getUiPreviewPostList(postListQuerySchema.parse({}), 100).posts.map((post) => ({
      ...post,
      excerpt: post.excerpt ?? null,
      updatedAt: post.publishedAt,
    }));
  } else {
    posts = await prisma.post.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      select: {
        slug: true,
        title: true,
        excerpt: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  return new Response(buildRssFeed(posts), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
    },
  });
}
