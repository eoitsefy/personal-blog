import { z } from "zod";

export const ASSISTANT_GREETINGS = [
  "你好，欢迎来到 EastherPhil！这里有技术随记、生活切片和阅读灵感。想找哪一段记录？我来帮你。",
  "嗨，很高兴见到你！这里是 EastherPhil 的个人手记。你可以翻翻日志、看看地点，也可以问我文章里的事。",
  "欢迎来坐坐！技术、日常和阅读的片段，都收在这个小站里。告诉我一个关键词，一起找找看。",
  "你好呀！我是这里的小助手。日志里有沿途的记录，地图里有留下的坐标；想了解公开文章，随时问我。",
] as const;

export function pickAssistantGreeting(random: number) {
  const value = Number.isFinite(random) ? Math.max(0, Math.min(random, 0.999999)) : 0;
  return ASSISTANT_GREETINGS[Math.floor(value * ASSISTANT_GREETINGS.length)];
}

const AnswerSchema = z.object({
  answer: z.string().min(1).max(20_000),
  sources: z.array(z.object({
    postId: z.string().min(1).max(100), title: z.string().min(1).max(240),
    url: z.string().regex(/^\/posts\/[a-z0-9]+(?:-[a-z0-9]+)*$/), excerpt: z.string().max(1000),
  })).max(12),
  confidence: z.enum(["high", "medium", "low"]),
  mode: z.enum(["grounded", "conversation", "no_evidence"]),
});
export type AssistantAnswer = z.infer<typeof AnswerSchema>;
export function parseAssistantAnswer(value: unknown): AssistantAnswer {
  const result = AnswerSchema.safeParse(value);
  if (!result.success) throw new Error("助手返回的内容暂时无法显示，请稍后再试。");
  return result.data;
}
