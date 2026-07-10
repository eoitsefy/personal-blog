import { z } from "zod";

export const postListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

export type PostListQuery = z.infer<typeof postListQuerySchema>;

export const CreatePostInputSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题不能超过120字符"),
  slug: z
    .string()
    .trim()
    .min(1, "slug不能为空")
    .max(160, "slug不能超过160字符")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug 仅支持小写字母、数字和中划线"),
  excerpt: z
    .string()
    .trim()
    .max(300, "摘要不能超过300字符")
    .optional()
    .or(z.literal("")),
  contentMd: z.string().min(1, "内容不能为空"),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;
