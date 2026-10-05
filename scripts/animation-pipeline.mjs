// This CLI never generates approval files and never deploys to the website.
import { resolve, isAbsolute } from 'node:path';
import { AnimationPipeline, safeError } from './animation/pipeline.mjs';
const [command = 'help', manifestFile, ...options] = process.argv.slice(2);
const commands = ['doctor', 'prepare', 'interpolate', 'check', 'preview', 'package', 'run', 'status'];
try {
  if (command === 'help') {
    console.log('node scripts/animation-pipeline.mjs <doctor|prepare|interpolate|check|preview|package|run|status> <manifest.json> [--dry-run]');
    console.log('All work is local. Prepared whole PNG inputs + hash-bound manual approvals are required. No paid API or automatic approval.');
  } else {
    if (!commands.includes(command) || !manifestFile || options.some(option => option !== '--dry-run')) throw Error('unknown_pipeline_arguments');
    const pipeline = await AnimationPipeline.load(isAbsolute(manifestFile) ? manifestFile : resolve(manifestFile), process.env.ANIMATION_TOOL_ROOT ? { toolRoot: process.env.ANIMATION_TOOL_ROOT } : {});
    if (options.includes('--dry-run')) console.log(JSON.stringify({ command, manifestScopeSha256: pipeline.manifestScopeSha256, keyScopeSha256: pipeline.keyScopeSha256, outputRoot: pipeline.outputRoot, wroteArtifacts: false, paidRequests: 0, productionChanged: false }, null, 2));
    else console.log(JSON.stringify(await pipeline[command](), null, 2));
  }
} catch (error) { console.error(JSON.stringify({ ok: false, reason: safeError(error), productionChanged: false })); process.exitCode = 1; }
