"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
type Recognition = {
  lang:string; continuous:boolean; interimResults:boolean;
  onresult:((event:{ resultIndex:number; results:ArrayLike<{ isFinal:boolean; 0:{ transcript:string } }> })=>void)|null;
  onerror:((event:{ error:string })=>void)|null; onend:(()=>void)|null;
  start:()=>void; abort:()=>void;
};
type VoiceWindow = Window & { SpeechRecognition?:new()=>Recognition; webkitSpeechRecognition?:new()=>Recognition };
const subscribeVoice=() => () => {};
const availableVoice=() => {
  const w=window as VoiceWindow;
  const doc=document as Document & { permissionsPolicy?:{ allowsFeature:(name:string)=>boolean }; featurePolicy?:{ allowsFeature:(name:string)=>boolean } };
  const policy=doc.permissionsPolicy??doc.featurePolicy;
  return !!(w.SpeechRecognition??w.webkitSpeechRecognition) && (!policy || policy.allowsFeature("microphone"));
};
export function useBrowserVoice(open:boolean,onText:(text:string)=>void,onError:(text:string)=>void) {
  const available=useSyncExternalStore(subscribeVoice,availableVoice,()=>false);
  const [listening,setListening]=useState(false);
  const recognition=useRef<Recognition|null>(null),callbacks=useRef({ onText,onError });
  useEffect(() => { callbacks.current={ onText,onError }; },[onText,onError]);
  useEffect(() => {
    if (!open) recognition.current?.abort();
    return () => recognition.current?.abort();
  },[open]);
  const toggle=useCallback(() => {
    if (recognition.current) { recognition.current.abort(); return; }
    const w=window as VoiceWindow, Constructor=w.SpeechRecognition??w.webkitSpeechRecognition;
    if (!Constructor) return;
    const next=new Constructor(); recognition.current=next;
    next.lang="zh-CN"; next.continuous=false; next.interimResults=false;
    next.onresult=e => {
      let text="";
      for (let i=e.resultIndex;i<e.results.length;i++) if (e.results[i].isFinal) text+=e.results[i][0].transcript;
      if (text.trim()) callbacks.current.onText(text.trim());
    };
    next.onerror=e => { if (e.error!=="aborted") callbacks.current.onError(e.error==="not-allowed" ? "未取得麦克风权限，可以继续使用文字输入。" : "没有听清，请再试一次，或使用文字输入。"); };
    next.onend=() => { recognition.current=null; setListening(false); };
    try { next.start(); setListening(true); }
    catch { recognition.current=null; setListening(false); callbacks.current.onError("语音输入暂不可用，请使用文字输入。"); }
  },[]);
  return { available,listening,toggle };
}
