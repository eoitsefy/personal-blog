import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { H3MobilePreview } from "@/components/assistant/h3-mobile-preview";
import { H3_CLIPS, type H3Clip } from "@/lib/assistant/h3-motion";

export const dynamic = "force-dynamic";
export const metadata = { title: "手机七动作预览", robots: { index: false, follow: false } };

export default async function MobilePreviewPage({ searchParams }: {
  searchParams: Promise<{ clip?: string; mode?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const host = (await headers()).get("host") ?? "";
  if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) notFound();
  const query = await searchParams;
  const clip = query.clip ?? "wave";
  const mode = query.mode ?? "mobile";
  if (!H3_CLIPS.includes(clip as H3Clip) || !["mobile", "native", "auto"].includes(mode)) notFound();
  return <H3MobilePreview initialClip={clip as H3Clip} initialMode={mode as "mobile" | "native" | "auto"} />;
}
