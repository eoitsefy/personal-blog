"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorStateSchema, parseLocalWorkingCopy, type EditorState } from "@/lib/editor-state";

type Recovery = { state: EditorState; baseUpdatedAt: string | null; label: string };
type Options = { userId: string; postId?: string; initialUpdatedAt?: string };

export function usePostWorkingCopy(value: EditorState, options: Options) {
  const { userId, postId, initialUpdatedAt } = options;
  const key = postId ?? "new";
  const storageKey = `blog-editor:${userId}:${key}`;
  const endpoint = `/api/admin/working-copies/${key}`;
  const serialized = JSON.stringify(value);
  const initial = useRef(serialized);
  const saved = useRef(serialized);
  const version = useRef(0);
  const base = useRef(initialUpdatedAt ?? null);
  const inFlight = useRef<Promise<number> | null>(null);
  const stopped = useRef(false);
  const conflicted = useRef(false);
  const [ready, setReady] = useState(false);
  const [recoveries, setRecoveries] = useState<Recovery[]>([]);
  const [message, setMessage] = useState("正在检查工作副本…");
  const [retry, setRetry] = useState(0);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let local = null;
      try { local = parseLocalWorkingCopy(sessionStorage.getItem(storageKey)); } catch { /* storage may be blocked */ }
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "无法读取工作副本");
        if (cancelled) return;
        const copy = body.data.copy;
        version.current = copy?.version ?? 0;
        const server = copy && !copy.cleared ? EditorStateSchema.safeParse(copy.payload) : null;
        const choices: Recovery[] = [];
        if (local && JSON.stringify(local.state) !== initial.current) {
          choices.push({ state: local.state, baseUpdatedAt: local.baseUpdatedAt, label: "恢复此窗口暂存" });
        }
        if (server?.success && JSON.stringify(server.data) !== initial.current
          && (!local || JSON.stringify(local.state) !== JSON.stringify(server.data))) {
          choices.push({ state: server.data, baseUpdatedAt: copy.baseUpdatedAt, label: "恢复服务器工作副本" });
        }
        setRecoveries(choices);
        setReady(true);
        setMessage(choices.length ? "发现未提交的工作副本，请选择恢复或使用当前文章。" : "自动保存已就绪（不会发布文章）");
      } catch (error) {
        if (!cancelled) {
          setMessage(`${error instanceof Error ? error.message : "读取失败"}；请重试，当前输入可保留在此窗口。`);
          if (local) setRecoveries([{ state: local.state, baseUpdatedAt: local.baseUpdatedAt, label: "恢复此窗口暂存" }]);
        }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [endpoint, storageKey, retry]);

  const save = useCallback(async (state: EditorState): Promise<number> => {
    if (!ready) throw new Error("尚未连接自动保存服务，请重试后保存");
    if (conflicted.current) throw new Error("工作副本冲突，请复制当前内容后重新打开编辑器");
    if (stopped.current) throw new Error("文章已保存");
    while (inFlight.current) await inFlight.current;
    const snapshot = JSON.stringify(state);
    if (saved.current === snapshot) return version.current;
    const task = (async () => {
      setMessage("正在自动保存…");
      try {
        const response = await fetch(endpoint, { method: "PUT", headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10_000), body: JSON.stringify({ state, version: version.current, baseUpdatedAt: base.current }) });
        const body = await response.json();
        if (response.status === 409) conflicted.current = true;
        if (!response.ok) throw new Error(body.error?.message ?? "自动保存失败");
        version.current = body.data.copy.version;
        saved.current = snapshot;
        setDirty(false);
        setMessage("工作副本已自动保存 · 尚未提交文章");
        return version.current;
      } catch (error) {
        setMessage(error instanceof Error ? `${error.message}；请保留页面并重试。` : "自动保存失败，请保留页面并重试。");
        throw error;
      }
    })();
    inFlight.current = task;
    try { return await task; } finally { inFlight.current = null; }
  }, [endpoint, ready]);

  useEffect(() => {
    if (stopped.current || recoveries.length || serialized === saved.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ state: JSON.parse(serialized), savedAt: Date.now(),
        version: version.current, baseUpdatedAt: base.current }));
    } catch { /* Server autosave and unload warning still protect the draft. */ }
    const timer = setTimeout(() => {
      setDirty(saved.current !== serialized);
      if (ready) void save(JSON.parse(serialized)).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [serialized, storageKey, ready, recoveries.length, save]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!stopped.current && serialized !== saved.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const warnLink = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (anchor && anchor.target !== "_blank" && !event.ctrlKey && !event.metaKey && !stopped.current
        && serialized !== saved.current && !window.confirm("仍有内容尚未同步到服务器，确定离开编辑器吗？")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", warnLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", warnLink, true); };
  }, [serialized]);

  function choose(recovery?: Recovery) {
    if (recovery) base.current = recovery.baseUpdatedAt;
    // Choosing the current article explicitly replaces an older working copy too.
    saved.current = "";
    initial.current = "";
    setRecoveries([]);
    return recovery?.state;
  }

  return { ready, recoveries, message, dirty, save, choose,
    mayLeave: () => stopped.current || serialized === saved.current || window.confirm("仍有内容尚未同步到服务器，确定离开编辑器吗？"),
    expectedUpdatedAt: () => base.current,
    retry: () => { if (!ready) setRetry((n) => n + 1); else void save(value).catch(() => undefined); },
    finish: () => { stopped.current = true; try { sessionStorage.removeItem(storageKey); } catch { /* ignored */ } },
  };
}
