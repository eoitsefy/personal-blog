import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { readMotionCandidate } from "@/lib/assistant/natural-motion-preview.server";
import { NaturalMotionPreview } from "@/components/assistant/natural-motion-preview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "动画候选验收", robots: { index: false, follow: false } };
export default async function MotionPreviewPage({ searchParams }: { searchParams: Promise<{ assetTest?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) notFound();
  let manifest;
  try { manifest = await readMotionCandidate(); } catch { notFound(); }
  const { assetTest } = await searchParams;
  if (assetTest && !["fail-wave", "delay-1200"].includes(assetTest)) notFound();
  if (assetTest) manifest = { ...manifest, assets: Object.fromEntries(Object.entries(manifest.assets).map(([key, asset]) =>
    [key, { ...asset, src: `${asset.src}?assetTest=${assetTest}` }])) };
  return <NaturalMotionPreview manifest={manifest} />;
}
