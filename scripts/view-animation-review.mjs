import { resolve } from 'node:path';
import { AnimationPipeline, safeError } from './animation/pipeline.mjs';
import { startReviewServer } from './animation/review-server.mjs';

try {
  const [file, ...extra] = process.argv.slice(2);
  if (!file || extra.length) throw Error('manifest_argument_required');
  const pipeline = await AnimationPipeline.load(resolve(file), process.env.ANIMATION_TOOL_ROOT ? { toolRoot: process.env.ANIMATION_TOOL_ROOT } : {});
  const viewer = await startReviewServer(pipeline);
  console.log(JSON.stringify({ url: viewer.origin, technicalStatus: viewer.technicalStatus,
    releaseAllowed: false, paidRequests: 0, productionChanged: false,
    note: 'Open the local URL. Ctrl+C closes this read-only preview. Playback is not art approval.' }, null, 2));
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => {
    if (stopping) return; stopping = true; await viewer.close();
  });
} catch (error) {
  console.error(JSON.stringify({ ok: false, reason: safeError(error), productionChanged: false }));
  process.exitCode = 1;
}
