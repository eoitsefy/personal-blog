// Record completed visual review and independently generated browser evidence.
// This recorder cannot substitute for looking at all light/dark review boards.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const folder=resolve(process.argv[2]||''),root='docs/assistant/sleep-bed-v2',out=root+'/review';
assert.equal(process.argv[3],'--all-314-frames-visually-reviewed');
const hash=b=>createHash('sha256').update(b).digest('hex');
const codeScope=async inputs=>hash((await Promise.all(inputs.map(async p=>p+':'+hash((await readFile(p,'utf8')).replace(/\r\n/g,'\n'))))).sort().join('\n'));
const sleepInputs=['src/lib/assistant/presence.ts','src/lib/assistant/sleep-sheets.ts','src/components/assistant/use-assistant-presence.ts','src/components/assistant/sleep-scene.tsx','src/components/assistant/chibi-assistant.tsx','src/components/assistant/assistant-panel.module.css','src/components/assistant/use-assistant-behavior.ts','src/lib/assistant/behavior.ts'];
const standingInputs=['src/lib/assistant/behavior.ts','src/components/assistant/use-assistant-behavior.ts','src/components/assistant/chibi-assistant.tsx','src/components/assistant/assistant-panel.module.css'];
const manifest=JSON.parse(await readFile(root+'/manifest.json','utf8'));
await mkdir(out+'/boards',{recursive:true});
const boards=[];
for(const[action,count]of[['enter',193],['wake',121]])for(let start=0;start<count;start+=24)for(const theme of['light','dark']){
  const name=`${action}-${String(start).padStart(3,'0')}-${theme}.png`,path='boards/'+name;
  const bytes=await readFile(resolve(folder,'review-v2',name));
  await copyFile(resolve(folder,'review-v2',name),out+'/'+path);
  boards.push({path,sha256:hash(bytes),action,theme,firstFrame:start,lastFrame:Math.min(count-1,start+23)});
}
for(const[name,destination]of[['browser-local','browser-local'],['standing-regression-local','standing-regression-local']]){
  await mkdir(out+'/'+destination,{recursive:true});
  const report=JSON.parse(await readFile(resolve(folder,name,'report.json'),'utf8'));
  assert.equal(report.accepted,true);assert.equal(report.realModelQueries,0);
  if(name==='browser-local'){
    assert.deepEqual(report.inputs,sleepInputs);assert.equal(report.codeScopeSha256,await codeScope(sleepInputs),'Sleep report must bind the exact normalized runtime code');
    assert.equal(report.assetScopeSha256,manifest.assetScopeSha256);assert.equal(report.frameScopeSha256,manifest.frameScopeSha256);
    assert.deepEqual(report.results.map(r=>r.positions),[410,410,410,410]);assert.ok(report.fallback);assert.equal(report.mediaNotificationFallback,true);
  }else{
    assert.equal(report.behaviorCodeScopeSha256,await codeScope(standingInputs),'Standing regression must bind the exact normalized runtime code');
    assert.deepEqual(report.results.map(r=>r.poses),[578,578,578,578]);
  }
  await copyFile(resolve(folder,name,'report.json'),out+'/'+destination+'/report.json');
}
for(const name of['loop-wake-seam.png','enter-preview.webp','wake-preview.webp','sleep-loop-preview.webp'])await copyFile(resolve(folder,'review-v2',name),out+'/'+name);
for(const width of[1280,390,320])await copyFile(resolve(folder,'browser-local',`sleeping-${width}.png`),out+`/sleeping-${width}.png`);
const art={status:'ART_AND_LOCAL_BROWSER_GATES_PASSED',reviewer:'primary_agent_visual_review',independentAgentReview:false,
  assetScopeSha256:manifest.assetScopeSha256,frameScopeSha256:manifest.frameScopeSha256,
  nativeFramesReviewed:{enter:193,wake:121},themes:['light','dark'],allFramesViewed:true,boards,
  sourceVideoSha256:{enter:manifest.clips.enter.sourceVideoSha256,wake:manifest.clips.wake.sourceVideoSha256},
  checks:{wholeFigureIdentity:true,thinClosedEyes:true,bedContactAndOcclusion:true,propEdgesRestored:true,noLargeGroundShadowBlocks:true,
    fixedCanvas:true,noPerFrameRecentering:true,noDetachedLimbCompositing:true,noNewInterpolatedPoses:true,loopSeamViewed:true,mobileSleepBoundsViewed:true},
  rejectedTrials:[{version:'sleep-bed-v1',reason:'U2net-only alpha retained large black ground-shadow blocks in transition frames.'},
    {revision:11,reason:'BiRefNet-only alpha omitted the right bed edge during wake; color-supported whole-frame alpha refinement restored it.'}],
  limitations:['Native provider motion blur remains during a few fast head turns; no face redraw was applied.',
    'The bed intentionally enters and exits through the source canvas right edge.',
    'Browser evidence is deterministic headless Edge testing, not a physical mobile-device FPS benchmark.'],
  authorization:{scope:['sleep-enter','sleep-loop','wake','existing-yawn-recovery'],basis:'Requested sleep/wake workflow and standing instruction to deploy completed changes directly.',additionalGenerationAuthorized:false,additionalSpend:0}};
await writeFile(out+'/art-review.json',JSON.stringify(art,null,2)+'\n');
console.log('Recorded 314-frame light/dark visual review, 30 boards and both local browser reports');
