export type PostVisibility = { status: "DRAFT" | "PUBLISHED" };

export function isPublishedPost<T extends PostVisibility>(post: T | null): post is T {
  return post?.status === "PUBLISHED";
}
