import { Prisma, type PrismaClient } from "@prisma/client";
import { chunkPost, contentVersion } from "./chunking";
import type { EmbeddingProvider } from "./provider";

type Database = Prisma.TransactionClient | PrismaClient;

export async function syncPostAssistantIndex(database: Database, postId: string) {
  const post = await database.post.findUnique({
    where: { id: postId },
    select: { id: true, title: true, slug: true, contentMd: true, status: true, deletedAt: true },
  });
  await database.aiContentChunk.deleteMany({ where: { postId } });
  if (!post || post.status !== "PUBLISHED" || post.deletedAt) return 0;
  const chunks = chunkPost(post.contentMd);
  if (!chunks.length) return 0;
  const version = contentVersion(post);
  await database.aiContentChunk.createMany({
    data: chunks.map((chunk) => ({ ...chunk, postId, contentVersion: version })),
  });
  return chunks.length;
}

export async function rebuildPublishedAssistantIndex(database: PrismaClient) {
  const posts = await database.post.findMany({ where: { status: "PUBLISHED", deletedAt: null }, select: { id: true } });
  let chunks = 0;
  for (const post of posts) chunks += await database.$transaction((tx) => syncPostAssistantIndex(tx, post.id));
  await database.aiContentChunk.deleteMany({ where: { post: { OR: [{ status: "DRAFT" }, { deletedAt: { not: null } }] } } });
  return { posts: posts.length, chunks };
}

export async function embedAssistantIndex(database: PrismaClient, provider: EmbeddingProvider, batchSize = 32) {
  const chunks = await database.aiContentChunk.findMany({
    where: { OR: [{ embedding: { equals: Prisma.DbNull } }, { embeddingModel: { not: provider.embeddingModel } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, content: true },
  });
  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize);
    const vectors = await provider.embed(batch.map(({ content }) => content));
    await database.$transaction(batch.map((chunk, offset) => database.aiContentChunk.update({
      where: { id: chunk.id },
      data: { embedding: vectors[offset], embeddingModel: provider.embeddingModel },
    })));
  }
  return chunks.length;
}
