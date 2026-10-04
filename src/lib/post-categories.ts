// Public notebook links and editor options share stable keys; tags stay free-form.
export const POST_CATEGORIES = [
  { name: "技术随记", slug: "development", aliases: ["技术随记", "技术随笔", "技术"] },
  { name: "生活切片", slug: "daily-life", aliases: ["生活切片", "生活", "日常"] },
  { name: "阅读与灵感", slug: "reading", aliases: ["阅读与灵感", "阅读", "灵感"] },
  { name: "其他", slug: "other", aliases: ["其他"] },
] as const;

export function fixedCategory(value: string) {
  const key = value.normalize("NFKC").trim().toLowerCase();
  return POST_CATEGORIES.find(c => c.slug === key || c.aliases.some(alias => alias === key));
}

export function categoryFilterSlugs(value: string): string[] {
  const category = fixedCategory(value);
  return category ? [category.slug, ...category.aliases] : [value];
}
