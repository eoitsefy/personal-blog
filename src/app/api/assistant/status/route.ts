import { getAssistantHealthSummary } from "@/lib/assistant/config";

export async function GET() {
  return Response.json({ ok: true, feature: getAssistantHealthSummary() }, { headers: { "Cache-Control": "no-store" } });
}
