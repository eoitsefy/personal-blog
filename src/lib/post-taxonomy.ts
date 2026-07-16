export type TaxonomyTerm = { name: string; slug: string };

export function taxonomySlug(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function normalizeTaxonomyTerm(name: string): TaxonomyTerm | null {
  const normalizedName = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const slug = taxonomySlug(normalizedName);
  if (!normalizedName || !slug) return null;
  return { name: normalizedName, slug };
}

export function normalizeTags(names: string[]): TaxonomyTerm[] {
  const unique = new Map<string, TaxonomyTerm>();
  for (const name of names) {
    const term = normalizeTaxonomyTerm(name);
    if (term && !unique.has(term.slug)) unique.set(term.slug, term);
  }
  return [...unique.values()].slice(0, 10);
}
