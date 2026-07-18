import type { Metadata } from "next";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { SiteFooter, SiteHeader } from "@/components/site/site-shell";
import { getAssistantConfig } from "@/lib/assistant/config";

export const metadata: Metadata = {
  title: "文本检索助手",
  description: "只根据 EastherPhil 已发布文章检索并生成带来源的回答。",
  alternates: { canonical: "/assistant" },
  robots: { index: false, follow: true },
};
export const dynamic = "force-dynamic";

export default function AssistantPage() {
  const config = getAssistantConfig();
  return <div><SiteHeader tone="light" active="assistant" /><main id="main-content"><AssistantPanel enabled={config.enabled} maxQuestionChars={config.enabled ? config.maxQuestionChars : 1000} /></main><SiteFooter /></div>;
}
