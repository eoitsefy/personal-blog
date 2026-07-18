# AI Voice Assistant Specification

## Goal

Provide an optional assistant that helps visitors explore the author's published blog content using text or voice. It must not present ungrounded general knowledge as if it came from the blog.

## User experience

### Entry point

- A clearly labeled assistant button, not an ambiguous microphone-only icon.
- Keyboard accessible and usable on mobile.
- Opening the assistant must not immediately request microphone permission.

### Interaction states

1. `idle`: input box and optional microphone button.
2. `requesting_permission`: browser permission prompt is pending.
3. `listening`: visible timer, waveform/indicator, stop and cancel controls.
4. `transcribing`: audio upload/processing in progress.
5. `thinking`: retrieval and answer generation in progress.
6. `answer_ready`: text answer and source links are visible.
7. `speaking`: audio playback with pause/stop.
8. `error`: concise explanation and retry/text fallback.

### Required behavior

- Text input always remains available.
- The visitor can stop recording and playback.
- Never autoplay voice on page load.
- Show that answers are generated and may be incomplete.
- Cite the blog posts used, linking to canonical post URLs.
- If retrieval confidence is insufficient, state that no reliable answer was found.
- Do not answer questions about unpublished drafts or admin-only content.

## MVP limits

Suggested defaults, configurable server-side:

- audio duration: maximum 60 seconds;
- accepted input: browser-recorded audio formats explicitly supported by the selected STT provider;
- text question length: maximum 1,000 characters;
- answer length: bounded for cost and usability;
- per-IP/session rate limits with stricter anonymous limits;
- hard provider timeout and one controlled retry for transient failures;
- circuit breaker or temporary disable flag after repeated provider failures.

Codex must verify provider limits rather than copying these values into code without configuration.

## API boundaries

Exact routes should follow existing repository conventions. A simple design is:

### `POST /api/assistant/query`

Input:

```json
{
  "question": "这篇博客如何部署？",
  "conversationId": "optional-client-session-id",
  "responseMode": "text"
}
```

Output:

```json
{
  "requestId": "uuid",
  "answer": "...",
  "sources": [
    {
      "postId": "...",
      "title": "...",
      "url": "/posts/example",
      "excerpt": "..."
    }
  ],
  "confidence": "high|medium|low",
  "cached": false,
  "usage": {
    "provider": "configured-provider",
    "inputUnits": 0,
    "outputUnits": 0
  }
}
```

### `POST /api/assistant/transcribe`

- Multipart audio upload.
- Validate content type, size, duration, and request limits.
- Return transcript and detected language if available.
- Use temporary storage only when required; delete it after processing.

### `POST /api/assistant/speech`

- Accept only assistant-generated or bounded text.
- Return audio bytes or a short-lived URL.
- Do not allow arbitrary large text-to-speech jobs.

A unified endpoint is acceptable if it remains testable and does not mix client secrets with server logic.

## Retrieval requirements

- Index only `PUBLISHED` content.
- Store post ID, slug, title, heading, chunk order, and content version with each chunk.
- Re-index on publish and meaningful content changes.
- Remove or deactivate chunks when a post is unpublished or deleted.
- Apply a similarity threshold and maximum number of chunks.
- Avoid passing entire posts when a small evidence set is sufficient.
- Return sources actually used in the answer, not merely retrieved candidates.

## Grounding rules for the generation prompt

The server-side prompt should instruct the model to:

- answer from supplied context only;
- distinguish quoted blog facts from general suggestions;
- avoid inventing URLs, titles, commands, or author opinions;
- respond in the user's language when supported;
- say when evidence is absent or contradictory;
- keep output appropriate for speech playback;
- include machine-readable source identifiers outside the prose answer.

Version the prompt and record the prompt version in usage logs.

## Privacy and consent

- Explain why microphone access is requested.
- Do not record until the visitor explicitly starts.
- Do not retain raw audio by default.
- Document any third-party processing and retention policy.
- Avoid sending cookies, authentication tokens, IP addresses, or unrelated page data to AI providers.
- Provide a visible way to clear the local conversation.
- Do not place full conversation content in ordinary access logs.

## Security

- Keep all provider keys server-side.
- Validate multipart boundaries, MIME type, file signature, size, and duration.
- Use CSRF protections where applicable to the auth/session architecture.
- Rate-limit by IP and anonymous session; protect against distributed abuse with global budget controls.
- Sanitize rendered Markdown/HTML in answers.
- Prevent prompt injection in blog content from changing system instructions; treat indexed content as untrusted data.
- Never allow the model to execute tools, shell commands, database writes, or admin actions for public visitors.
- Enforce published-content authorization in retrieval, not only in the prompt.

## Resilience and fallback

- If STT fails, preserve the UI and invite text input.
- If retrieval fails, do not call generation with empty context unless the product explicitly supports general chat.
- If generation fails, show a non-technical message and request ID.
- If TTS fails, retain the text answer.
- If the provider is disabled or unreachable, hide/disable voice controls while leaving the blog fully functional.

## Cost controls

- Configurable daily and monthly budgets.
- Per-session request caps.
- Cache safe, repeated public questions against a content-index version.
- Use smaller/cheaper models for classification, rewriting, or TTS when quality is adequate.
- Limit retrieved chunks, input context, output tokens, audio duration, and speech length.
- Log usage by anonymous/session bucket without storing unnecessary personal data.

## Connectivity gate

The current ECS could not reach OpenAI endpoints during the recorded sessions. DeepSeek text generation was subsequently connected, enabled and accepted in production on 2026-07-19, while STT and TTS remain undecided. The voice assistant is `[BLOCKED]` until the complete selected STT/LLM/TTS path is reachable and tested from the deployment environment.

Required pre-production check:

1. DNS resolution works.
2. TLS connection succeeds.
3. Provider authentication succeeds using a server-side secret.
4. End-to-end transcription, retrieval, generation, and speech fit within configured timeouts.
5. Failure behavior is tested with the provider unavailable.

## Acceptance criteria

- Visitor can ask a text question and receive a grounded answer with valid post links.
- Voice recording requires explicit action and can be canceled.
- Transcript is shown before or with the answer.
- Raw audio is not retained after processing under the default configuration.
- Unpublished content cannot be retrieved.
- Weak evidence produces an explicit “not found reliably” response.
- Provider outage does not break blog browsing.
- Abuse limits return a controlled 429 response.
- All API responses include a request ID and stable error shape.
- Integration tests cover successful text flow, no-evidence flow, invalid audio, limits, and provider timeout.
