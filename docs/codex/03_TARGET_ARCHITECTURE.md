# Target Architecture

## Principles

- Keep the application deployable as a single Docker Compose stack.
- Keep PostgreSQL and Redis private to the host/container network.
- Treat Nginx as the only public application entry point.
- Separate business logic from provider-specific storage and AI SDKs.
- Build text assistant capability before voice input/output.
- Preserve a non-AI path for all core blog functions.

## Logical components

```text
Browser
  -> Nginx :80/:443
      -> Next.js application :3000
          -> PostgreSQL
          -> Redis
          -> LocalStorageAdapter -> /var/www/personal-blog/uploads
          -> future OssStorageAdapter
          -> AiProviderAdapter
              -> reachable LLM / embedding / STT / TTS services
```

## Next.js application boundaries

Recommended modules, adapted to the existing repository rather than imposed blindly:

```text
src/
  app/
    (public)/
    admin/
    api/
  components/
  features/
    posts/
    taxonomy/
    media/
    search/
    assistant/
  lib/
    auth/
    db/
    redis/
    storage/
    ai/
    validation/
    observability/
  server/
    services/
    repositories/
```

If the repository already uses a different coherent structure, extend it rather than performing a broad reorganization.

## Data model direction

Existing names observed: `User`, `Post`, `Asset`, `PostAssetRef`.

Codex must inspect the Prisma schema before proposing migrations. Expected concepts include:

- `Post`: title, slug, summary, content, status, author, publish timestamps, SEO fields.
- taxonomy: category and tag relations if not already present.
- `Asset`: storage key/path, original name, MIME, size, hash, dimensions, owner, lifecycle status.
- `PostAssetRef`: explicit link between post and asset.
- AI indexing records: post/version, chunk text, chunk order, embedding reference, index status, updated time.
- AI usage records: request ID, anonymous/session identifier, model/provider, latency, token or billing units, result status, source IDs, no raw secret values.

Avoid storing raw audio by default. If temporary files are required, delete them promptly and document retention.

## Caching

Redis can support:

- rate-limit counters;
- short-lived AI response caching keyed by normalized question and content index version;
- session or revocation data if required by the existing auth design;
- lightweight background job coordination.

Do not make page correctness depend on Redis availability without a fallback.

## Search and RAG

MVP search can use PostgreSQL text search or the existing implementation. RAG should index only published, non-deleted content.

Suggested RAG flow:

1. A post is published or updated.
2. A background or deferred task extracts normalized text.
3. Text is split into stable chunks with post and heading metadata.
4. Embeddings are generated through a provider adapter.
5. Query retrieval returns top relevant chunks with thresholds.
6. The answer is generated only from retrieved evidence and includes source links.
7. If evidence is weak, the assistant says it could not find a reliable answer.

The initial implementation can store embeddings in PostgreSQL if the chosen extension/provider is supported. Do not add a separate vector database until scale or operational requirements justify it.

## AI provider abstraction

Use server-only interfaces such as:

```ts
interface TextGenerationProvider {
  answer(input: GroundedAnswerInput): Promise<GroundedAnswerResult>;
}

interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
}

interface SpeechToTextProvider {
  transcribe(audio: AudioInput): Promise<TranscriptResult>;
}

interface TextToSpeechProvider {
  synthesize(text: string, options: VoiceOptions): Promise<AudioResult>;
}
```

Provider selection must come from server-side configuration. Client code must never receive provider API keys.

## Request flow for the assistant

Prefer ordinary HTTPS and streaming responses where supported:

```text
mic/text input
 -> validation and rate limit
 -> transcription when needed
 -> retrieval
 -> grounded generation
 -> response with sources
 -> optional text-to-speech
```

WebSocket support may be added later for realtime experiences, but it should not be required for the first reliable release. The recorded environments have experienced WebSocket fallback and network instability.

## Deployment architecture

- Nginx: TLS, redirect, proxying, body-size limits, static uploads, rate limits, and secure headers.
- App container: non-root runtime where feasible, health endpoint, bounded memory, read-only filesystem except explicit writable paths.
- PostgreSQL: persistent volume, regular dumps, later off-site copy and PITR decision.
- Redis: persistent volume only if required by chosen usage; otherwise document acceptable cache loss.
- Upload directory: explicit host mount with least required ownership and permissions.
- Logs: structured application logs to stdout/stderr, collected by Docker/journald; Nginx logs retained and rotated.

## Health endpoints

Recommended endpoints:

- `/api/health/live`: process is running; no external dependency checks.
- `/api/health/ready`: verifies required database connectivity and optionally Redis with strict timeout.
- `/api/health/ai`: optional internal/admin-only provider connectivity diagnostic; never expose credentials or provider responses.

## Observability

Each request should have a correlation/request ID. Log:

- route and status;
- latency;
- authenticated user ID when appropriate, not sensitive session values;
- AI provider, model alias, duration, usage units, cache hit, retrieval count, and error category;
- upload validation result and asset ID;
- deployment version/commit SHA.
