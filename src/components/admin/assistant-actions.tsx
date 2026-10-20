"use client";
import Image from "next/image";
import { useState } from "react";
import { H3Character } from "@/components/assistant/h3-character";
import { H3_MOTION,type H3Clip } from "@/lib/assistant/h3-motion";
import { ACTION_GROUPS,ACTION_GROUP_CLIPS,actionInfo,actionPreviewPlan,type ActionGroup } from "@/lib/assistant/action-catalog";
import styles from "./assistant-actions.module.css";

type Playback={run:number;plan:H3Clip[];index:number;playing:boolean;paused:boolean;complete:boolean;error:boolean};
const initial:Playback={run:0,plan:["idle-blink"],index:0,playing:false,paused:false,complete:false,error:false};
export function AssistantActions() {
  const [group,setGroup]=useState<ActionGroup>("basic"),[query,setQuery]=useState(""),[selected,setSelected]=useState<H3Clip>("idle-blink");
  const [play,setPlay]=useState(initial),[withIdle,setWithIdle]=useState(true),[background,setBackground]=useState("light");
  const clip=play.plan[play.index],info=actionInfo(selected),current=actionInfo(clip),playId=play.run*32+play.index;
  const start=(plan:H3Clip[])=>setPlay(p=>({run:p.run+1,plan,index:0,playing:true,paused:false,complete:false,error:false}));
  const choose=(next:H3Clip)=>{ setSelected(next); setPlay(p=>({...initial,run:p.run+1,plan:[next]})); };
  const finished=(id:number)=>setPlay(p=>{
    if (!p.playing || id!==p.run*32+p.index) return p;
    return p.index+1<p.plan.length ? {...p,index:p.index+1} : {...p,playing:false,complete:true};
  });
  const fail=()=>setPlay(p=>({...p,playing:false,error:true}));
  const visible=ACTION_GROUP_CLIPS[group].filter(c=>`${actionInfo(c).label} ${c}`.toLowerCase().includes(query.toLowerCase()));
  return <main className={styles.page}>
    <header><p className={styles.eyebrow}>博客后台 · 小助手</p><h1>动作资源</h1><p className={styles.subtitle}>7 个动作 · {Object.keys(H3_MOTION.assets).length+Object.keys(H3_MOTION.stills).length} 张动画资源 · 480 × 480 固定画布 · {H3_MOTION.version}</p></header>
    <section className={styles.studio} aria-label="动作预览工作台">
      <div className={`${styles.stage} ${background==="dark"?styles.dark:background==="check"?styles.check:""}`}>
        <div className={styles.actor}><H3Character key={play.run} clip={clip} playId={playId} once animate={play.playing&&!play.paused} onFinished={finished} onFailed={fail}/></div>
        <p role="status" className={styles.playStatus}>{play.error?"资源加载失败，请重新播放重试。":play.complete?"播放完成":play.playing?`${play.paused?"已暂停":"播放中"} · ${current.label} · ${play.index+1}/${play.plan.length}`:`已选择 · ${info.label}`}</p>
      </div>
      <div className={styles.details}>
        <h2>{info.label}</h2><p className={styles.identifier}>{selected}</p>
        <dl className={styles.facts}><div><dt>时长</dt><dd>{(info.durationMs/1000).toFixed(2)} 秒</dd></div><div><dt>原生帧数</dt><dd>{info.frames} 帧</dd></div><div><dt>素材类型</dt><dd>{info.loop?"循环动作":"单次动作"}</dd></div><div><dt>图集数量</dt><dd>{info.files.length} 张</dd></div></dl>
        <div className={styles.controls}><button onClick={()=>start(actionPreviewPlan(selected,withIdle))}>播放所选动作</button><button disabled={!play.playing} onClick={()=>setPlay(p=>({...p,paused:!p.paused}))}>{play.paused?"继续":"暂停"}</button><button disabled={!play.playing} onClick={()=>setPlay(p=>({...p,playing:false}))}>停止</button></div>
        <label className={styles.option}><input type="checkbox" checked={withIdle} onChange={e=>setWithIdle(e.target.checked)}/>基础动作前后连上完整待机周期</label>
        <label className={styles.option}>检查背景<select value={background} onChange={e=>setBackground(e.target.value)}><option value="light">浅色</option><option value="dark">深色</option><option value="check">透明棋盘</option></select></label>
      </div>
    </section>
    <section aria-label="动作资源列表">
      <div className={styles.toolbar}><div className={styles.tabs}>{ACTION_GROUPS.map(g=><button key={g.id} aria-pressed={group===g.id} onClick={()=>setGroup(g.id)}>{g.label} ({ACTION_GROUP_CLIPS[g.id].length})</button>)}</div><label>查找动作<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="名称或动作编号" type="search"/></label></div>
      <div className={styles.grid}>{visible.map(c=>{const a=actionInfo(c);return <button key={c} className={styles.card} aria-pressed={selected===c} onClick={()=>choose(c)}><Image src={a.still.src} alt="" width={80} height={80} unoptimized loading="lazy"/><span><strong>{a.label}</strong><small>{c}</small><small>{(a.durationMs/1000).toFixed(2)} 秒 · {a.frames} 帧 · {a.loop?"循环":"单次"}</small></span></button>;})}</div>
      {!visible.length?<p className={styles.hint}>这个分组中没有匹配的动作。</p>:null}
    </section>
    <details className={styles.resources}><summary>查看与下载“{info.label}”资源文件</summary><a href={info.still.src} download>下载静态首帧</a><ul>{info.files.map(file=><li key={file.src}><a href={file.src} download>{file.src.split("/").at(-1)}</a><code title={file.sha256}>SHA256 {file.sha256.slice(0,16)}…</code></li>)}</ul></details>
  </main>;
}
