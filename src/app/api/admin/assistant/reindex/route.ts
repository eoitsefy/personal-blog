import { fail, logApi, ok } from "@/lib/api";
import { getAssistantConfig } from "@/lib/assistant/config";
import { embedAssistantIndex, rebuildPublishedAssistantIndex } from "@/lib/assistant/indexing";
import { createAssistantProvider } from "@/lib/assistant/provider";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { validateMutationOrigin } from "@/lib/request-security";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const failure = validateMutationOrigin(req);
  if (failure) return fail("FORBIDDEN", failure.message, failure.status, auth.requestId);
  try {
    const rebuilt = await rebuildPublishedAssistantIndex(prisma);
    const config = getAssistantConfig();
    const embedded = config.enabled && config.embeddingModel
      ? await embedAssistantIndex(prisma, createAssistantProvider(config))
      : 0;
    logApi({ requestId: auth.requestId, path: "/api/admin/assistant/reindex", method: "POST", status: 200, latencyMs: Date.now() - startedAt, userId: auth.user.id });
    return ok({ ...rebuilt, embedded }, auth.requestId);
  } catch (error) {
    console.error("[POST /api/admin/assistant/reindex] failed", error);
    return fail("INTERNAL_ERROR", "助手索引重建失败", 500, auth.requestId);
  }
}
