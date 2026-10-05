// Read-only loopback viewer. It serves only the hash-bound preview and PNGs,
// never repository contents, approvals, credentials, APIs or directory indexes.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { sha256, deriveMotion, validatePlaybackReport } from './pipeline.mjs';

export async function startReviewServer(pipeline) {
  pipeline.state = await pipeline.status();
  if (!(await pipeline.receiptValid('preview'))) throw Error('browser_playback_not_completed');
  const playback = await pipeline.readJson('playback.json');
  const interpolation = await pipeline.readJson('interpolation.json');
  const technical = await pipeline.readJson('technical.json');
  const motion = deriveMotion(pipeline.manifest);
  if (playback.status !== 'PASSED_PLAYBACK_ONLY'
    || playback.manifestScopeSha256 !== pipeline.manifestScopeSha256
    || playback.keyScopeSha256 !== pipeline.keyScopeSha256
    || playback.frameScopeSha256 !== interpolation.frameScopeSha256
    || !Array.isArray(playback.sourcePngSha256)
    || playback.sourcePngSha256.length !== motion.frameCount) throw Error('stale_browser_playback');
  const sourcePngSha256 = await Promise.all(Array.from({ length: motion.frameCount }, async (_, i) =>
    sha256(await readFile(await pipeline.output(`frames/${String(i).padStart(3, '0')}.png`)))));
  validatePlaybackReport(playback, { manifestScopeSha256: pipeline.manifestScopeSha256,
    keyScopeSha256: pipeline.keyScopeSha256, frameScopeSha256: interpolation.frameScopeSha256,
    frameCount: motion.frameCount, sourcePngSha256, technicalStatus: technical.status });
  const files = new Map([['/', {
    file: 'preview.html', type: 'text/html; charset=utf-8',
    hash: pipeline.state.stages.preview.artifacts.find(a => a.file === 'preview.html')?.sha256,
  }]]);
  for (let i = 0; i < motion.frameCount; i++) {
    const file = `frames/${String(i).padStart(3, '0')}.png`;
    files.set('/' + file, { file, type: 'image/png', hash: playback.sourcePngSha256[i] });
  }
  for (const entry of files.values()) {
    if (!entry.hash || sha256(await readFile(await pipeline.output(entry.file))) !== entry.hash) throw Error('review_artifact_hash_mismatch');
  }
  let origin;
  const server = createServer(async (request, response) => {
    try {
      if (request.headers.host !== new URL(origin).host
        || (request.headers.origin && request.headers.origin !== origin)) {
        response.writeHead(403).end(); return;
      }
      if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
      const url = new URL(request.url, origin);
      const entry = !url.search && files.get(url.pathname);
      if (!entry) { response.writeHead(404).end(); return; }
      const bytes = await readFile(await pipeline.output(entry.file));
      if (sha256(bytes) !== entry.hash) { response.writeHead(409).end('review_artifact_changed'); return; }
      response.setHeader('Content-Type', entry.type);
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      response.setHeader('Content-Length', bytes.length);
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { if (!response.headersSent) response.writeHead(404); response.end(); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, server, close: () => new Promise(resolve => server.close(resolve)),
    technicalStatus: playback.technicalStatus, releaseAllowed: false };
}
