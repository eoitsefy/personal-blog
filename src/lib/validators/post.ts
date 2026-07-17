import { z } from "zod";
import { extractVideoDirectives, parseTrustedVideoUrl } from "@/lib/media/video";

export const postListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(80).default(""),
  category: z.string().trim().max(80).default(""),
  tag: z.string().trim().max(80).default(""),
});

export type PostListQuery = z.infer<typeof postListQuerySchema>;

const AssetIdsSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(20, "每篇文章最多关联20个媒体文件")
  .refine((ids) => new Set(ids).size === ids.length, "媒体引用不能重复");

const PostInputFieldsSchema = z.object({
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
  contentMd: z.string().min(1, "内容不能为空").superRefine((markdown, context) => {
    for (const directive of extractVideoDirectives(markdown)) {
      if (!parseTrustedVideoUrl(directive.url)) {
        context.addIssue({
          code: "custom",
          message: "视频仅支持哔哩哔哩或 YouTube 的 HTTPS 正式链接",
        });
      }
    }
  }),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  category: z.string().trim().max(50, "分类名称不能超过50个字符").optional().or(z.literal("")),
  tags: z.array(z.string().trim().min(1).max(40)).max(10, "每篇文章最多添加10个标签"),
  assetIds: AssetIdsSchema,
});

export const CreatePostInputSchema = PostInputFieldsSchema.extend({
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  category: z.string().trim().max(50).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  assetIds: AssetIdsSchema.default([]),
});

export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;

export const UpdatePostInputSchema = PostInputFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "至少需要修改一个字段",
);

export type UpdatePostInput = z.infer<typeof UpdatePostInputSchema>;

export const adminPostListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  q: z.string().trim().max(80).default(""),
  status: z.enum(["ALL", "DRAFT", "PUBLISHED"]).default("ALL"),
  deleted: z.enum(["active", "trash"]).default("active"),
});

export type AdminPostListQuery = z.infer<typeof adminPostListQuerySchema>;
