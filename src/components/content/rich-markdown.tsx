import { Children } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseTrustedVideoUrl } from "@/lib/media/video";

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
      if (href && label.toLowerCase().startsWith("video:")) {
        const video = parseTrustedVideoUrl(href);
        if (video) {
          const title = label.slice("video:".length).trim() || "视频";
          return (
            <span className="my-8 block overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
              <span className="block px-4 py-3 text-sm font-medium">{title}</span>
              <span className="relative block aspect-video bg-black">
                <iframe
                  src={video.embedUrl}
                  title={`${title}（${video.provider === "BILIBILI" ? "哔哩哔哩" : "YouTube"}）`}
                  loading="lazy"
                  allow="accelerometer; autoplay; encrypted-media; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-presentation"
                  className="absolute inset-0 h-full w-full border-0"
                />
              </span>
              <span className="block px-4 py-3 text-xs text-neutral-500">
                无法加载播放器时，<a href={video.sourceUrl}>前往原始视频页面</a>。
              </span>
            </span>
          );
        }
      }
      return <a href={href}>{children}</a>;
    },
  };

  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown>;
}
