import { getAssistantConfig, getAssistantHealthSummary } from "@/lib/assistant/config";

export async function GET() {
  const config = getAssistantConfig();
  return Response.json({ ok: true, feature: getAssistantHealthSummary(), limits: { maxQuestionChars: config.enabled ? config.maxQuestionChars : 500 } }, { headers: { "Cache-Control": "no-store" } });
}
