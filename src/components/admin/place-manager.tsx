"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreatePlaceInputSchema, type CreatePlaceInput } from "@/lib/validators/place";

export type AdminPlace = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  locationLabel: string;
  latitude: number;
  longitude: number;
  publicLatitude: number | null;
  publicLongitude: number | null;
  privacy: CreatePlaceInput["privacy"];
  coordinateSystem: CreatePlaceInput["coordinateSystem"];
  coordinateSource: string;
  occurredAt: string | null;
  coverAssetId: string | null;
  deletedAt: string | null;
  postCount: number;
};

type ImageOption = { id: string; url: string; originalName: string | null };

const EMPTY: CreatePlaceInput = {
  name: "",
  slug: "",
  summary: "",
  locationLabel: "",
  latitude: 0,
  longitude: 0,
  publicLatitude: "",
  publicLongitude: "",
  privacy: "HIDDEN",
  coordinateSystem: "GCJ02",
  coordinateSource: "手工记录",
  occurredAt: "",
  coverAssetId: "",
};

const privacyNames = {
  EXACT: "公开精确坐标",
  APPROXIMATE: "公开模糊坐标",
  CITY_ONLY: "仅公开城市/地区",
  HIDDEN: "完全隐藏",
};

function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PlaceManager({ places, imageOptions, showForm = true }: { places: AdminPlace[]; imageOptions: ImageOption[]; showForm?: boolean }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CreatePlaceInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const fieldClass = "rounded-lg border border-neutral-300 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-950";

  function update<K extends keyof CreatePlaceInput>(key: K, value: CreatePlaceInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function slugify(input: string) {
    return input.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }

  function edit(place: AdminPlace) {
    setEditingId(place.id);
    setForm({
      name: place.name,
      slug: place.slug,
      summary: place.summary ?? "",
      locationLabel: place.locationLabel,
      latitude: place.latitude,
      longitude: place.longitude,
      publicLatitude: place.publicLatitude ?? "",
      publicLongitude: place.publicLongitude ?? "",
      privacy: place.privacy,
      coordinateSystem: place.coordinateSystem,
      coordinateSource: place.coordinateSource,
      occurredAt: toLocalDateTimeInput(place.occurredAt),
      coverAssetId: place.coverAssetId ?? "",
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
    setMessage("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    const normalized = {
      ...form,
      occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : "",
    };
    const parsed = CreatePlaceInputSchema.safeParse(normalized);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? "请检查地点信息");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(editingId ? `/api/admin/places/${editingId}` : "/api/admin/places", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(parsed.data),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (response.status === 401) return router.replace("/admin/login");
      if (!response.ok) setMessage(body.error?.message ?? "保存失败");
      else { reset(); router.refresh(); }
    } catch {
      setMessage("无法连接服务器");
    } finally {
      setBusy(false);
    }
  }

  async function action(place: AdminPlace, kind: "delete" | "restore" | "purge") {
    const prompt = kind === "purge" ? `永久删除地点“${place.name}”吗？此操作无法撤销。` : kind === "delete" ? `将地点“${place.name}”移入回收站吗？` : null;
    if (prompt && !window.confirm(prompt)) return;
    setBusy(true);
    setMessage("");
    const url = kind === "delete" ? `/api/admin/places/${place.id}` : `/api/admin/places/${place.id}/${kind}`;
    try {
      const response = await fetch(url, { method: kind === "restore" ? "POST" : "DELETE", credentials: "include" });
      const body = await response.json() as { error?: { message?: string } };
      if (response.status === 401) return router.replace("/admin/login");
      if (!response.ok) setMessage(body.error?.message ?? "操作失败");
      else router.refresh();
    } catch {
      setMessage("无法连接服务器");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showForm ? <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900" aria-label={editingId ? "编辑地点" : "新建地点"}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{editingId ? "编辑地点" : "新建地点"}</h2>
          {editingId ? <button type="button" onClick={reset} className="text-sm underline">取消编辑</button> : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm"><span>地点名称</span><input value={form.name} onChange={(event) => update("name", event.target.value)} onBlur={() => !form.slug && update("slug", slugify(form.name))} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>Slug</span><input value={form.slug} onChange={(event) => update("slug", slugify(event.target.value))} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>公开地区名称</span><input value={form.locationLabel} onChange={(event) => update("locationLabel", event.target.value)} placeholder="例如：杭州市西湖区" className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>发生时间（可选）</span><input type="datetime-local" value={form.occurredAt ? String(form.occurredAt).slice(0, 16) : ""} onChange={(event) => update("occurredAt", event.target.value)} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>内部纬度</span><input type="number" step="0.000001" value={form.latitude} onChange={(event) => update("latitude", Number(event.target.value))} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>内部经度</span><input type="number" step="0.000001" value={form.longitude} onChange={(event) => update("longitude", Number(event.target.value))} className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>隐私精度</span><select value={form.privacy} onChange={(event) => update("privacy", event.target.value as CreatePlaceInput["privacy"])} className={fieldClass}>{Object.entries(privacyNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-1 text-sm"><span>坐标系</span><select value={form.coordinateSystem} onChange={(event) => update("coordinateSystem", event.target.value as CreatePlaceInput["coordinateSystem"])} className={fieldClass}><option value="GCJ02">GCJ-02（中国大陆常用）</option><option value="WGS84">WGS84（GPS）</option><option value="BD09">BD-09（百度）</option></select></label>
          {form.privacy === "APPROXIMATE" ? <>
            <label className="grid gap-1 text-sm"><span>公开纬度</span><input type="number" step="0.000001" value={form.publicLatitude ?? ""} onChange={(event) => update("publicLatitude", event.target.value ? Number(event.target.value) : "")} className={fieldClass} /></label>
            <label className="grid gap-1 text-sm"><span>公开经度</span><input type="number" step="0.000001" value={form.publicLongitude ?? ""} onChange={(event) => update("publicLongitude", event.target.value ? Number(event.target.value) : "")} className={fieldClass} /></label>
          </> : null}
          <label className="grid gap-1 text-sm"><span>坐标来源（仅后台）</span><input required value={form.coordinateSource} onChange={(event) => update("coordinateSource", event.target.value)} placeholder="设备、服务商或手工记录" className={fieldClass} /></label>
          <label className="grid gap-1 text-sm"><span>封面图片</span><select value={form.coverAssetId ?? ""} onChange={(event) => update("coverAssetId", event.target.value)} className={fieldClass}><option value="">无封面</option>{imageOptions.map((image) => <option key={image.id} value={image.id}>{image.originalName ?? image.id}</option>)}</select></label>
        </div>
        <label className="grid gap-1 text-sm"><span>地点说明</span><textarea rows={3} value={form.summary ?? ""} onChange={(event) => update("summary", event.target.value)} className={fieldClass} /></label>
        <p className="text-sm text-neutral-500">内部坐标只在后台保存。“模糊”需要另填公开坐标；“仅城市”与“隐藏”不会向公开接口返回坐标。</p>
        {message ? <p role="alert" className="text-sm text-red-600">{message}</p> : null}
        <button type="submit" disabled={busy} className="w-fit rounded-xl bg-neutral-900 px-5 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900">{busy ? "处理中…" : editingId ? "保存地点" : "创建地点"}</button>
      </form> : null}

      <ul className="mt-8 grid gap-4">
        {places.map((place) => (
          <li key={place.id} className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex flex-wrap justify-between gap-4">
              <div className="flex min-w-0 gap-4">
                {place.coverAssetId ? <div className="relative h-20 w-28 overflow-hidden rounded-lg bg-neutral-100"><Image src={imageOptions.find(({ id }) => id === place.coverAssetId)?.url ?? ""} alt="" fill className="object-cover" unoptimized /></div> : null}
                <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{place.name}</h2><span className="rounded-full bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800">{place.deletedAt ? "回收站" : privacyNames[place.privacy]}</span></div><p className="mt-1 text-sm text-neutral-500">{place.locationLabel} · {place.coordinateSystem} · {place.postCount} 篇文章</p><p className="mt-1 text-xs text-neutral-400">内部坐标 {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}</p></div>
              </div>
              <div className="flex flex-wrap items-start gap-3 text-sm">
                {place.deletedAt ? <><button disabled={busy} onClick={() => action(place, "restore")} className="text-emerald-700 underline">恢复</button><button disabled={busy} onClick={() => action(place, "purge")} className="text-red-700 underline">永久删除</button></> : <><button disabled={busy} onClick={() => edit(place)} className="underline">编辑</button><button disabled={busy} onClick={() => action(place, "delete")} className="text-red-600 underline">移入回收站</button></>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
