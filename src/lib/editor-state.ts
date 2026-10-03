import { z } from "zod";
import type { CreatePostInput } from "@/lib/validators/post";

// Working copies intentionally accept incomplete titles, slugs and Markdown.
export const EditorStateSchema = z.object({
  form: z.object({
    title: z.string().max(120),
    slug: z.string().max(160),
    excerpt: z.string().max(300),
    contentMd: z.string().max(200_000),
    status: z.enum(["DRAFT", "PUBLISHED"]),
    category: z.string().max(50),
    tags: z.array(z.string().max(40)).max(10),
    assetIds: z.array(z.string().min(1).max(64)).max(20),
    placeIds: z.array(z.string().min(1).max(64)).max(10),
  }).strict(),
  tagsText: z.string().max(500),
}).strict();
export type EditorState = z.infer<typeof EditorStateSchema>;
export const DraftKeySchema = z.string().regex(/^(new|[a-z0-9]{10,64})$/);
export const SaveWorkingCopySchema = z.object({
  state: EditorStateSchema,
  version: z.number().int().min(0),
  baseUpdatedAt: z.string().datetime().nullable(),
}).strict();

export function editorState(form: CreatePostInput, tagsText = form.tags.join(", ")): EditorState {
  return { form: { title: form.title, slug: form.slug, excerpt: form.excerpt ?? "", contentMd: form.contentMd,
    status: form.status, category: form.category, tags: form.tags, assetIds: form.assetIds, placeIds: form.placeIds }, tagsText };
}

export function parseLocalWorkingCopy(raw: string | null, now = Date.now()) {
  if (!raw || raw.length > 300_000) return null;
  try {
    const parsed = z.object({
      state: EditorStateSchema,
      savedAt: z.number(),
      version: z.number().int().nonnegative(),
      baseUpdatedAt: z.string().datetime().nullable(),
    }).safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.savedAt > now || now - parsed.data.savedAt > 7 * 86400_000) return null;
    return parsed.data;
  } catch { return null; }
}

export function insertMarkdownAtSelection(content: string, markdown: string, start: number, end = start) {
  const from = Math.max(0, Math.min(start, content.length));
  const to = Math.max(from, Math.min(end, content.length));
  return content.slice(0, from) + markdown + content.slice(to);
}
