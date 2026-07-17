import { Children } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

export type RichMarkdownAsset = {
  url: string;
  kind: "IMAGE" | "AUDIO" | "DOCUMENT" | "VIDEO" | "OTHER";
  originalName: string | null;
  mime: string;
};

type RichMarkdownProps = {
  markdown: string;
  assets?: RichMarkdownAsset[];
};

export function RichMarkdown({ markdown, assets = [] }: RichMarkdownProps) {
  const assetsByUrl = new Map(assets.map((asset) => [asset.url, asset]));
  const components: Components = {
    a({ href, children }) {
      const label = Children.toArray(children).join("").trim();
      const asset = href ? assetsByUrl.get(href) : undefined;
      if (asset?.kind === "AUDIO" && label.toLowerCase().startsWith("audio:")) {
        const title = label.slice("audio:".length).trim() || asset.originalName || "音频";
        return (
          <span className="my-8 block rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-950">
            <span className="mb-3 block text-sm font-medium">{title}</span>
            <audio controls preload="metadata" className="w-full">
              <source src={asset.url} type={asset.mime} />
              浏览器不支持音频播放。你可以<a href={asset.url}>下载音频文件</a>。
            </audio>
          </span>
        );
      }
      return <a href={href}>{children}</a>;
    },
  };

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown>;
}
