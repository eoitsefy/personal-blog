import type { MetadataRoute } from "next";
import { buildSitemap, type PublicPostSeoRecord } from "@/lib/seo";
import { prisma } from "@/lib/prisma";
import { getUiPreviewPostList, isUiPreviewEnabled } from "@/lib/ui-preview";
import { postListQuerySchema } from "@/lib/validators/post";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let posts: PublicPostSeoRecord[];

  if (isUiPreviewEnabled()) {
    posts = getUiPreviewPostList(postListQuerySchema.parse({}), 50_000).posts.map((post) => ({
      ...post,
      excerpt: post.excerpt ?? null,
      updatedAt: post.publishedAt,
    }));
  } else {
    posts = await prisma.post.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 50_000,
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

  return buildSitemap(posts);
}
