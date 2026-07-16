import { Prisma } from "@prisma/client";
import type { PostListQuery } from "@/lib/validators/post";

export const PUBLIC_POST_PAGE_SIZE = 10;
export const ADMIN_POST_PAGE_SIZE = 20;

export function buildPublicPostWhere(filters: PostListQuery): Prisma.PostWhereInput {
  return {
    status: "PUBLISHED",
    deletedAt: null,
    ...(filters.q
      ? {
          OR: [
            { title: { contains: filters.q, mode: "insensitive" as const } },
            { excerpt: { contains: filters.q, mode: "insensitive" as const } },
            { contentMd: { contains: filters.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(filters.category ? { category: { slug: filters.category } } : {}),
    ...(filters.tag ? { tags: { some: { tag: { slug: filters.tag } } } } : {}),
  };
}

export function listHref(filters: PostListQuery, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.category) params.set("category", filters.category);
  if (filters.tag) params.set("tag", filters.tag);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/posts?${query}` : "/posts";
}
