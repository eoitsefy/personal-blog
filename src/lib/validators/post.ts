import { z } from "zod";

export const PostStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);

export const CreatePostInputSchema = z.object({
  title: z.string().trim().min(1, "标题不能为空").max(120, "标题最多120字符"),
  slug: z
    .string()
    .trim()
    .min(1, "slug不能为空")
    .max(160, "slug最多160字符")
    .regex(/^[a-z0-9-]+$/, "slug 仅允许小写字母、数字和中划线"),
  contentMd: z.string().trim().min(1, "内容不能为空"),
  status: PostStatusSchema,
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;
