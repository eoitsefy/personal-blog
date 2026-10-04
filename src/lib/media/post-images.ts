import { imagePreviewUrl } from "./preview";

type PostImage = { url: string; kind: string; originalName: string | null };

// Referenced body images keep their authored position; only unplaced attachments follow the body.
export function unplacedPostImages<T extends PostImage>(markdown: string, assets: T[]): T[] {
  const seen = new Set<string>();
  return assets.filter(asset => {
    if (asset.kind !== "IMAGE" || !imagePreviewUrl(asset.url) || markdown.includes(asset.url) || seen.has(asset.url)) return false;
    seen.add(asset.url);
    return true;
  });
}
