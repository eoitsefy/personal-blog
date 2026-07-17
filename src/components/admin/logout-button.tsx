"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ redirectTo = "/admin/login" }: { redirectTo?: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  async function logout() {
    setSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } finally {
      router.replace(redirectTo);
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={submitting}
      className="text-sm text-neutral-600 underline-offset-4 hover:underline disabled:opacity-60 dark:text-neutral-300"
    >
      {submitting ? "退出中…" : "退出登录"}
    </button>
  );
}
