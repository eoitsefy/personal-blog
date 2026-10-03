"use client";

/* eslint-disable @next/next/no-img-element -- Original Markdown/media images can have unknown dimensions and external URLs. */
import { createContext, useContext, useEffect, useId, useRef, useState, type AnchorHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { fitImage, imagePreviewUrl } from "@/lib/media/preview";
import styles from "./image-preview.module.css";

const InsideImageLink = createContext(false);

// Preserve authored image links; never nest a preview button inside an anchor.
export function ImagePreviewLink({ children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <InsideImageLink.Provider value={true}><a {...props}>{children}</a></InsideImageLink.Provider>;
}

type PreviewProps = { src: string; alt: string; title?: string; className?: string; children?: ReactNode };

export function ImagePreview({ src, alt, title, className, children }: PreviewProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const linked = useContext(InsideImageLink);
  const url = imagePreviewUrl(src);
  const thumbnail = children ?? <img src={url ?? undefined} alt={alt} title={title} loading="lazy" decoding="async" />;
  if (!url || linked) return thumbnail;
  return <>
    <button ref={trigger} type="button" className={`${styles.trigger} ${className ?? ""}`}
      aria-label={`放大查看：${alt || "图片"}`} aria-haspopup="dialog" title="放大查看"
      onClick={() => setOpen(true)}>{thumbnail}</button>
    {open ? createPortal(<ImageViewer key={url} src={url} alt={alt} onClose={() => setOpen(false)} returnFocus={() => trigger.current?.focus({ preventScroll: true })} />, document.body) : null}
  </>;
}

function ImageViewer({ src, alt, onClose, returnFocus }: { src: string; alt: string; onClose: () => void; returnFocus: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(returnFocus);
  const titleId = useId();
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const fit = fitImage(natural.width, natural.height, viewport.width, viewport.height);

  useEffect(() => {
    const element = dialog.current!;
    const body = document.body;
    const previous = { overflow: body.style.overflow, position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width };
    const { scrollX, scrollY } = window;
    Object.assign(body.style, { overflow: "hidden", position: "fixed", top: `-${scrollY}px`, left: `-${scrollX}px`, width: "100%" });
    element.showModal();
    close.current?.focus();
    const container = stage.current!;
    const resize = () => setViewport({ width: Math.max(1, container.clientWidth - 32), height: Math.max(1, container.clientHeight - 32) });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const focus = restoreFocus.current;
    return () => {
      observer.disconnect();
      element.close();
      Object.assign(body.style, previous);
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      focus();
    };
  }, []);

  function changeZoom(next: number) {
    setZoom(Math.max(1, Math.min(4, next)));
    if (next <= 1) stage.current?.scrollTo({ top: 0, left: 0 });
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const controls = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={styles.header}>
      <span id={titleId} className={styles.title}>{alt || "图片预览"}</span>
      <button ref={close} type="button" className={styles.control} onClick={onClose} aria-label="关闭图片预览">关闭 ×</button>
    </div>
    <div className={styles.toolbar} aria-label="图片缩放">
      <button type="button" className={styles.control} disabled={!fit || failed || zoom <= 1} onClick={() => changeZoom(zoom - 0.5)} aria-label="缩小图片">−</button>
      <button type="button" className={styles.control} disabled={!fit || failed || zoom >= 4} onClick={() => changeZoom(zoom + 0.5)} aria-label="放大图片">＋</button>
      <button type="button" className={styles.control} onClick={() => changeZoom(1)}>适应屏幕</button>
      <output className={styles.zoom} aria-live="polite" aria-label="相对适应屏幕的放大倍数">{zoom}×</output>
      <a className={styles.control} href={src} target="_blank" rel="noopener noreferrer">查看原图 ↗</a>
    </div>
    <div ref={stage} className={styles.stage} tabIndex={0} aria-label="图片查看区域，可滚动查看放大后的图片">
      <div className={styles.canvas}>
        {failed ? <p role="alert" className={styles.message}>图片加载失败，可尝试查看原图。</p> : <>
          {!natural.width ? <span role="status" className={styles.message}>正在加载图片…</span> : null}
          <img className={styles.image} src={src} alt={alt} decoding="async" draggable={false}
            style={fit ? { width: fit.width * zoom, height: fit.height * zoom } : { visibility: "hidden", width: 1, height: 1 }}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => setFailed(true)} />
        </>}
      </div>
    </div>
  </dialog>;
}
