"use client";

import {useEffect,useRef,useState,type ReactNode} from "react";
import {CHARACTER_ACTIONS,type CharacterAction} from "@/lib/assistant/character";
import {RIG_SKINS,RIG_STAGE,drawRig,rigSample,type RigSkinId} from "@/lib/assistant/rig";
import styles from "./assistant-panel.module.css";

export function RigCharacter({action="idle",skin="gold",animate=true,active=true,fallback}: {
  action?:CharacterAction;skin?:RigSkinId;animate?:boolean;active?:boolean;fallback:ReactNode;
}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    const el=canvas.current,ctx=el?.getContext("2d");
    if(!el||!ctx||failed)return;
    delete el.dataset.ready;
    let disposed=false,tick=0,clock:Animation|undefined;
    const image=new window.Image(),reduced=matchMedia("(prefers-reduced-motion: reduce)");
    const attachment=RIG_SKINS[skin];
    let playing:CharacterAction=action;
    const draw=(next:CharacterAction,time:number,still=false)=>{
      const pose=rigSample(next,time,still);drawRig(ctx,image,attachment,pose);
      el.dataset.playing=pose.playing;el.dataset.time=String(time);
      el.dataset.leftX=pose.left.x.toFixed(6);el.dataset.leftY=pose.left.y.toFixed(6);
      el.dataset.mouth=pose.mouth.toFixed(6);el.dataset.blink=pose.blink.toFixed(6);
    };
    const play=(next:CharacterAction)=>{
      playing=next;const config=CHARACTER_ACTIONS[next];
      clock=el.animate([{opacity:1},{opacity:1}],{duration:config.duration,iterations:config.loop?Infinity:1});
      if(!config.loop)clock.onfinish=()=>{if(!disposed)play("idle");};
    };
    const paint=()=>{if(disposed)return;if(clock)draw(playing,Number(clock.currentTime??0));tick=requestAnimationFrame(paint);};
    const refresh=()=>{
      cancelAnimationFrame(tick);if(clock){clock.onfinish=null;clock.cancel();}clock=undefined;
      draw("idle",0,true);
      if(animate&&active&&el.getClientRects().length&&!reduced.matches&&!document.hidden&&typeof el.animate==="function"){
        play(action);tick=requestAnimationFrame(paint);
      }
    };
    image.onload=()=>{
      if(disposed)return;
      if(image.naturalWidth!==attachment.width||image.naturalHeight!==attachment.height){setFailed(true);return;}
      el.dataset.ready="true";refresh();
      reduced.addEventListener("change",refresh);document.addEventListener("visibilitychange",refresh);window.addEventListener("resize",refresh);
    };
    image.onerror=()=>{if(!disposed)setFailed(true);};image.src=attachment.src;
    return()=>{disposed=true;image.onload=null;image.onerror=null;cancelAnimationFrame(tick);if(clock){clock.onfinish=null;clock.cancel();}
      reduced.removeEventListener("change",refresh);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("resize",refresh);};
  },[action,skin,animate,active,failed]);
  if(failed)return fallback;
  return <span className={styles.character} data-action={action} data-engine="rig" data-skin={skin} data-rig-version={RIG_SKINS[skin].geometry.version} aria-hidden="true">
    <canvas ref={canvas} className={styles.spriteSheet} width={RIG_STAGE.size} height={RIG_STAGE.size}/>
  </span>;
}
