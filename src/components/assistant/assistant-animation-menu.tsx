"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ANIMATION_CHOICES } from "@/lib/assistant/manual-playback";
import type { CharacterAction } from "@/lib/assistant/character";
import styles from "./assistant-panel.module.css";

export function AssistantAnimationMenu({ trigger, onSelect, onAutomatic, onOpenChange }: {
  trigger: RefObject<HTMLButtonElement | null>;
  onSelect: (action: CharacterAction) => void;
  onAutomatic: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null);
  const items = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const button = trigger.current;
    if (!button) return;
    function show(x: number, y: number) { setPosition({ x, y }); onOpenChange(true); }
    let lastPointerType = "";
    function pointer(event: PointerEvent) { lastPointerType = event.pointerType; }
    function context(event: MouseEvent) {
      event.preventDefault();
      const pointerType = (event as PointerEvent).pointerType || lastPointerType;
      if (pointerType === "touch" || pointerType === "pen" || (!pointerType && matchMedia("(pointer: coarse)").matches)) return;
      show(event.clientX, event.clientY);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
      event.preventDefault();
      const rect = button!.getBoundingClientRect();
      show(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
    button.addEventListener("contextmenu", context);
    button.addEventListener("pointerdown", pointer);
    button.addEventListener("keydown", keyboard);
    return () => { button.removeEventListener("contextmenu", context); button.removeEventListener("pointerdown", pointer); button.removeEventListener("keydown", keyboard); };
  }, [trigger, onOpenChange]);

  useLayoutEffect(() => {
    if (!position || !menu.current) return;
    const rect = menu.current.getBoundingClientRect();
    menu.current.style.left = `${Math.max(8, Math.min(position.x, innerWidth - rect.width - 8))}px`;
    menu.current.style.top = `${Math.max(8, Math.min(position.y, innerHeight - rect.height - 8))}px`;
    items.current[0]?.focus({ preventScroll: true });
  }, [position]);

  useEffect(() => {
    if (!position) return;
    function close() { setPosition(null); onOpenChange(false); }
    function outside(event: PointerEvent) { if (!menu.current?.contains(event.target as Node)) close(); }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus({ preventScroll: true });
      } else if (event.key === "Tab") close();
    }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [position, onOpenChange, trigger]);

  function choose(action?: CharacterAction) {
    setPosition(null); onOpenChange(false);
    if (action) onSelect(action); else onAutomatic();
    trigger.current?.focus({ preventScroll: true });
  }
  if (!position) return null;
  return createPortal(<div ref={menu} role="menu" aria-label="选择小助手动画" className={styles.animationMenu}
    style={{ left: position.x, top: position.y }} onKeyDown={event => {
      const current = items.current.indexOf(document.activeElement as HTMLButtonElement);
      const count = ANIMATION_CHOICES.length + 1;
      const index = event.key === "ArrowDown" ? (current + 1) % count : event.key === "ArrowUp" ? (current - 1 + count) % count : event.key === "Home" ? 0 : event.key === "End" ? count - 1 : null;
      if (index !== null) { event.preventDefault(); items.current[index]?.focus(); }
    }}>
    <p aria-hidden="true">选择动画</p>
    {ANIMATION_CHOICES.map(({ action, label }, index) => <button key={action} ref={node => { items.current[index] = node; }} type="button" role="menuitem" tabIndex={-1} onClick={() => choose(action)}>{label}</button>)}
    <div role="separator" />
    <button ref={node => { items.current[ANIMATION_CHOICES.length] = node; }} type="button" role="menuitem" tabIndex={-1} onClick={() => choose()}>恢复自动</button>
  </div>, document.body);
}

export function AssistantTouchAnimationPicker({ onSelect, onAutomatic }: {
  onSelect: (action: CharacterAction) => void;
  onAutomatic: () => void;
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null), choices = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!choices.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus({ preventScroll: true });
    }
    function resize() { setOpen(false); }
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  function choose(action?: CharacterAction) {
    setOpen(false);
    if (action) onSelect(action); else onAutomatic();
    button.current?.focus({ preventScroll: true });
  }

  return <>
    <button ref={button} type="button" className={styles.touchActionTrigger} aria-label="选择小助手动画" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>动作</button>
    {open ? <div ref={choices} id={id} role="group" aria-label="小助手动作" className={`${styles.animationMenu} ${styles.touchAnimationMenu}`}>
      {ANIMATION_CHOICES.map(({ action, label }) => <button key={action} type="button" onClick={() => choose(action)}>{label}</button>)}
      <div role="separator" />
      <button type="button" onClick={() => choose()}>恢复自动</button>
    </div> : null}
  </>;
}
