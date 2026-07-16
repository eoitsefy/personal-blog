"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type PostActionsProps = {
  id: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  deleted?: boolean;
};

export function PostActions({ id, title, status, deleted = false }: PostActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function updateStatus(nextStatus: "DRAFT" | "PUBLISHED") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: nextStatus }),
      });

      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        setError(body.error?.message ?? "状态更新失败");
        return;
      }
      router.refresh();
    } catch {
      setError("无法连接服务器，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`确定将《${title}》移入回收站吗？之后可以恢复。`)) return;

    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/posts/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        setError(body.error?.message ?? "删除失败");
        return;
      }
      router.refresh();
    } catch {
      setError("无法连接服务器，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/posts/${id}/restore`, {
        method: "POST",
        credentials: "include",
      });
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        setError(body.error?.message ?? "恢复失败");
        return;
      }
      router.refresh();
    } catch {
      setError("无法连接服务器，请稍后重试");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {deleted ? (
        <button
          type="button"
          disabled={busy}
          onClick={restore}
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:underline disabled:opacity-50"
        >
          恢复
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => updateStatus(status === "PUBLISHED" ? "DRAFT" : "PUBLISHED")}
            className="text-sm font-medium underline-offset-4 hover:underline disabled:opacity-50"
          >
            {status === "PUBLISHED" ? "撤回" : "发布"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="text-sm font-medium text-red-600 underline-offset-4 hover:underline disabled:opacity-50"
          >
            移入回收站
          </button>
        </>
      )}
      {error ? <span role="alert" className="text-sm text-red-600">{error}</span> : null}
    </div>
  );
}
