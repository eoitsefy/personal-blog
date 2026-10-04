"use client";
import { useState } from "react";

export function LocalVideo({ url, mime, title }: { url: string; mime: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="my-6 block min-w-0 overflow-hidden rounded-xl border border-neutral-300 dark:border-neutral-700">
    <video controls playsInline preload="none" aria-label={title} onError={() => setFailed(true)} className="block max-h-[75svh] w-full bg-black">
      <source src={url} type={mime} onError={() => setFailed(true)} />浏览器不支持视频播放。
    </video>
    <span className="block px-3 py-2 text-sm">{failed ? "此浏览器无法播放该视频编码。" : title} <a href={url} download>下载视频</a></span>
  </span>;
}
