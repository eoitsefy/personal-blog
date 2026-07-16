export type PostVisibility = { status: "DRAFT" | "PUBLISHED"; deletedAt?: Date | null };

export function isPublishedPost<T extends PostVisibility>(post: T | null): post is T {
  return post?.status === "PUBLISHED" && !post.deletedAt;
}
