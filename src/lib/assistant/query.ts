import type { AiUsageStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AssistantConfig } from "./config";
import { createAssistantProvider, ASSISTANT_PROMPT_VERSION } from "./provider";
import { rankEvidence, type RetrievalCandidate } from "./retrieval";

type EnabledConfig = Extract<AssistantConfig, { enabled: true }>;

export function answerLocalConversation(question: string) {
  const normalized = question.trim().toLocaleLowerCase().replace(/[\s，。！？!?,.]+/gu, "");
  if (/^(你好|您好|嗨|哈喽|hello|hi)$/.test(normalized)) {
    return "你好，我可以帮你从已发布的博客文章中寻找答案。你可以直接问一件记录过的事。";
  }
  if (/^(谢谢|感谢|多谢|thankyou|thanks)$/.test(normalized)) {
    return "不客气。想继续查找博客里的内容时，直接告诉我关键词就好。";
  }
  if (/^(再见|拜拜|下次见|bye|goodbye)$/.test(normalized)) {
    return "再见，祝你今天顺利。";
  }
  return null;
}

function asEmbedding(value: Prisma.JsonValue | null): number[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "number") ? value : null;
}

export async function retrieveAssistantEvidence(question: string, config: EnabledConfig) {
  const provider = createAssistantProvider(config);
  const rows = await prisma.aiContentChunk.findMany({
    where: { post: { status: "PUBLISHED", deletedAt: null } },
    orderBy: [{ postId: "asc" }, { chunkIndex: "asc" }],
    take: 1_000,
    select: {
      id: true,
      heading: true,
      content: true,
      embedding: true,
      embeddingModel: true,
      post: { select: { id: true, slug: true, title: true, excerpt: true } },
    },
  });
  let queryEmbedding: number[] | undefined;
  if (config.embeddingModel && rows.some(({ embeddingModel }) => embeddingModel === config.embeddingModel)) {
    queryEmbedding = (await provider.embed([question]))[0];
  }
  const candidates: RetrievalCandidate[] = rows.map((row) => ({
    id: row.id,
    heading: row.heading,
    content: row.content,
    embedding: row.embeddingModel === config.embeddingModel ? asEmbedding(row.embedding) : null,
    post: row.post,
  }));
  return rankEvidence(question, candidates, {
    limit: config.retrievalLimit,
    minScore: config.minRelevance,
    queryEmbedding,
  });
}

export async function answerAssistantQuestion(question: string, config: EnabledConfig) {
  const localAnswer = answerLocalConversation(question);
  if (localAnswer) {
    return {
      answer: localAnswer,
      sources: [],
      confidence: "high" as const,
      usage: { inputUnits: 0, outputUnits: 0 },
      retrievalCount: 0,
      mode: "conversation" as const,
    };
  }
  const evidence = await retrieveAssistantEvidence(question, config);
  if (!evidence.length) {
    return {
      answer: "暂时无法从已发布的博客内容中可靠确认这个问题。可以换一个更具体的关键词再试。",
      sources: [],
      confidence: "low" as const,
      usage: { inputUnits: 0, outputUnits: 0 },
      retrievalCount: 0,
      mode: "no_evidence" as const,
    };
  }
  const provider = createAssistantProvider(config);
  const generated = await provider.answer(question, evidence.map((item) => ({
    id: item.id,
    title: item.post.title,
    url: `/posts/${item.post.slug}`,
    heading: item.heading,
    content: item.content,
  })));
  const used = evidence.filter(({ id }) => generated.sourceIds.includes(id));
  const unique = new Map<string, typeof used[number]>();
  for (const item of used) if (!unique.has(item.post.id)) unique.set(item.post.id, item);
  const topScore = used[0]?.score ?? 0;
  return {
    answer: generated.answer,
    sources: [...unique.values()].map((item) => ({
      postId: item.post.id,
      title: item.post.title,
      url: `/posts/${item.post.slug}`,
      excerpt: item.content.slice(0, 240),
    })),
    confidence: topScore >= 0.65 ? "high" as const : topScore >= 0.3 ? "medium" as const : "low" as const,
    usage: { inputUnits: generated.inputUnits, outputUnits: generated.outputUnits },
    retrievalCount: evidence.length,
    mode: "grounded" as const,
  };
}

export async function recordAssistantUsage(input: {
  requestId: string;
  actorKeyHash: string;
  config: EnabledConfig;
  status: AiUsageStatus;
  latencyMs: number;
  inputUnits?: number;
  outputUnits?: number;
  retrievalCount?: number;
  sourcePostIds?: string[];
  errorCategory?: string;
}) {
  await prisma.aiUsage.create({ data: {
    requestId: input.requestId,
    actorKeyHash: input.actorKeyHash,
    provider: input.config.provider,
    model: input.config.generationModel,
    promptVersion: ASSISTANT_PROMPT_VERSION,
    status: input.status,
    latencyMs: input.latencyMs,
    inputUnits: input.inputUnits ?? 0,
    outputUnits: input.outputUnits ?? 0,
    retrievalCount: input.retrievalCount ?? 0,
    sourcePostIds: input.sourcePostIds ?? [],
    errorCategory: input.errorCategory ?? null,
  } });
}
