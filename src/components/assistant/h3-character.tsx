"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { H3_MOTION, H3_DECODED_PIXEL_LIMIT, H3MotionClock, type H3Clip } from "@/lib/assistant/h3-motion";
import { NaturalResourceCache } from "@/lib/assistant/natural-motion";
import styles from "./assistant-panel.module.css";

const pages=new NaturalResourceCache<HTMLImageElement>(H3_DECODED_PIXEL_LIMIT);
function load(key: string) {
  const asset=H3_MOTION.assets[key];
  return pages.acquire(key,asset.width*asset.height,() => new Promise<HTMLImageElement>((resolve,reject) => {
    const image=new window.Image();
    const timeout=setTimeout(() => done(new Error("Animation load timed out")),12000);
    let settled=false;
    function done(error?: Error) {
      if (settled) return; settled=true; clearTimeout(timeout); image.onload=null; image.onerror=null;
      if (error) { image.src=""; reject(error); } else resolve(image);
    }
    image.onload=() => {
      if (image.naturalWidth!==asset.width || image.naturalHeight!==asset.height) done(new Error("Animation size mismatch"));
      else done();
    };
    image.onerror=() => done(new Error("Animation unavailable")); image.src=asset.src;
  }));
}
type Props={ clip:H3Clip; playId:number; animate:boolean; once?:boolean; onFinished:(id:number)=>void; onFailed:()=>void };
export function H3Character(props: Props) {
  const canvas=useRef<HTMLCanvasElement>(null), fallback=useRef<HTMLSpanElement>(null);
  const controls=useRef(props), refresh=useRef<(()=>void)|null>(null);
  useEffect(() => { controls.current=props; },[props]);
  useEffect(() => { refresh.current?.(); },[props.clip,props.playId,props.animate,props.once]);
  useEffect(() => {
    const element=canvas.current, context=element?.getContext("2d");
    if (!element || !context) return;
    const clock=new H3MotionClock(H3_MOTION), reduced=matchMedia("(prefers-reduced-motion: reduce)");
    const leases=new Map<string,ReturnType<typeof load>>(), images=new Map<string,HTMLImageElement>();
    let disposed=false, tick=0, revision=0, paused:number|null=null, broken=false;
    let held:ReturnType<H3MotionClock["sample"]>|null=null;
    function retain(keys: Set<string>) {
      for (const [key,lease] of leases) if (!keys.has(key)) { lease.release(); leases.delete(key); images.delete(key); }
    }
    function fail() {
      if (disposed || broken) return; broken=true; cancelAnimationFrame(tick);
      element!.dataset.failed="true"; element!.style.visibility="hidden";
      if (fallback.current) fallback.current.style.visibility="visible";
      controls.current.onFailed(); controls.current.onFinished(controls.current.playId);
    }
    async function prepare(key: string, required: boolean, change: number): Promise<void> {
      if (images.has(key)) return;
      let lease=leases.get(key);
      if (lease && !required) return;
      if (!lease) {
        try { lease=load(key); leases.set(key,lease); }
        catch { if (await pages.settlePending()) { if (!disposed && change===revision) return prepare(key,required,change); } else fail(); return; }
      }
      try {
        const image=await lease.promise;
        if (!disposed && change===revision && leases.get(key)===lease) images.set(key,image);
      } catch { if (!disposed && change===revision) fail(); }
    }
    function paint(now:number) {
      if (disposed || broken) return;
      const sample=held ?? clock.sample(now,id=>controls.current.onFinished(id));
      const keep=new Set([sample.asset,...(sample.nextAsset?[sample.nextAsset]:[])]); retain(keep);
      const image=images.get(sample.asset);
      if (!image) {
        held=sample; paused ??=now; const own=revision;
        void prepare(sample.asset,true,own).then(() => {
          if (disposed || broken || own!==revision) return;
          const resumed=performance.now(); if (paused!==null) clock.delay(resumed-paused); paused=null; paint(resumed);
        }); return;
      }
      held=null; context!.clearRect(0,0,480,480);
      context!.drawImage(image,sample.x,sample.y,480,480,0,0,480,480);
      element!.style.visibility="visible"; if (fallback.current) fallback.current.style.visibility="hidden";
      element!.dataset.ready="true"; element!.dataset.clip=sample.clip; element!.dataset.frame=String(sample.frame);
      element!.dataset.decodedPixels=String(pages.pixels);
      if (sample.nextAsset) void prepare(sample.nextAsset,false,revision);
      tick=requestAnimationFrame(paint);
    }
    function update() {
      revision++; cancelAnimationFrame(tick); const c=controls.current;
      clock.request({ clip:c.clip,playId:c.playId,once:c.once });
      if (!c.animate || reduced.matches || document.hidden) { paused ??=performance.now(); return; }
      const now=performance.now(); if (paused!==null) clock.delay(now-paused); paused=null; paint(now);
    }
    refresh.current=update; update();
    reduced.addEventListener("change",update); document.addEventListener("visibilitychange",update);
    return () => { disposed=true; revision++; cancelAnimationFrame(tick); leases.forEach(l=>l.release());
      reduced.removeEventListener("change",update); document.removeEventListener("visibilitychange",update); refresh.current=null; };
  },[]);
  return <span className={styles.character} data-engine="h3-native-frames" data-character-version={H3_MOTION.version} aria-hidden="true">
    <span ref={fallback}><Image className={styles.fallbackCharacter} src={H3_MOTION.stills[props.clip].src} width={480} height={480} alt="" unoptimized loading="eager" /></span>
    <canvas ref={canvas} className={styles.spriteSheet} width={480} height={480} />
  </span>;
}
