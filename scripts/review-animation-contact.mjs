import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { resolve } from 'node:path';
import { contactSheets } from './animation/contact-sheet.mjs';
import { AnimationPipeline, resolveArtifactPath, sha256 } from './animation/pipeline.mjs';
const [manifest,engine] = process.argv.slice(2);
if(!manifest||!engine||!/^[a-f0-9]{64}$/.test(engine))throw Error('manifest_and_engine_sha_required');
const pipeline=await AnimationPipeline.load(resolve(manifest));
const runRoot=resolveArtifactPath(pipeline.toolRoot,`jobs/pipeline/${pipeline.manifest.id}/${pipeline.manifestScopeSha256}/${engine}`);
pipeline.outputRoot=runRoot;
const report=JSON.parse(await readFile(await pipeline.output('interpolation.json'),'utf8'));
if(report.manifestScopeSha256!==pipeline.manifestScopeSha256||report.keyScopeSha256!==pipeline.keyScopeSha256)throw Error('inspection_scope_mismatch');
const frames=await Promise.all(Array.from({length:report.frameCount},(_,i)=>pipeline.output('frames/'+String(i).padStart(3,'0')+'.png')));
const rgbaHashes=await Promise.all(frames.map(async file=>sha256(await sharp(file).ensureAlpha().raw().toBuffer())));
if(sha256(Buffer.from(rgbaHashes.join('')))!==report.frameScopeSha256)throw Error('inspection_frame_scope_mismatch');
// v9 hand-only detail. Other characters can use the full-frame sheets.
const detail=pipeline.manifest.id==='wave-v9'?{left:208,top:342,width:145,height:189}:null;
console.log(JSON.stringify(await contactSheets(frames,pipeline.manifest.canvas,await pipeline.output('contact'),detail),null,2));
