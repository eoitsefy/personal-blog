import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {verifyBlinkTechnical,verifyBlinkApproval} from './verify-blink-refinement.mjs';
import {BLINK_SOURCE_INDICES,BLINK_DRAWING_TIMES,BLINK_REFINEMENT_SHEETS} from '../../src/lib/assistant/blink-refinement-sheets.ts';
import {DRAWING_SEQUENCES,drawingTimes,RUNTIME_SHEETS} from '../../src/lib/assistant/frame-timeline.ts';
const base='docs/assistant/blink-refinement-v1/',json=async p=>JSON.parse(await readFile(base+p,'utf8'));
test('refined blink retains all source provenance, exact non-eye pixels, alpha and lossless fixed slots',async()=>{
 const result=await verifyBlinkTechnical();assert.equal(result.changedFrames,12);assert.equal(result.nonEyePixelChanges,0);assert.equal(result.alphaChanges,0);
});
test('reopening 48/49/50 uses consecutive 30fps samples while keeping historical actions intact',async()=>{
 const m=await json('candidate.json');assert.deepEqual(m.indices,BLINK_SOURCE_INDICES);assert.deepEqual(m.times,BLINK_DRAWING_TIMES);assert.deepEqual(drawingTimes('idle'),BLINK_DRAWING_TIMES);
 assert.equal(RUNTIME_SHEETS['pilot-blink'].src,BLINK_REFINEMENT_SHEETS['pilot-blink'].src);
 assert.equal(Object.values(DRAWING_SEQUENCES).reduce((n,s)=>n+s.length,0),355);
 for(const n of[48,49])assert.ok(Math.abs(BLINK_DRAWING_TIMES[BLINK_SOURCE_INDICES.indexOf(n+1)]-BLINK_DRAWING_TIMES[BLINK_SOURCE_INDICES.indexOf(n)]-1000/30)<1e-8);
});
test('scoped independent reviews and actual browser bytes are required; old approvals cannot transfer',async()=>{
 const m=await json('candidate.json'),a=await json('review/art-review.json'),b=await json('review/browser-local.json');verifyBlinkApproval(a,b,m);
 assert.throws(()=>verifyBlinkApproval({...a,assetScopeSha256:'old-scope'},b,m));
 assert.throws(()=>verifyBlinkApproval({...a,reviewers:a.reviewers.slice(1)},b,m));
 assert.throws(()=>verifyBlinkApproval(a,{...b,actualAssetHashesVerified:false},m));
 assert.throws(()=>verifyBlinkApproval(a,{...b,playback:b.playback.map(p=>({...p,changes:[]}))},m));
 const slot=m.indices.indexOf(49);assert.throws(()=>verifyBlinkApproval(a,{...b,playback:b.playback.map(p=>({...p,changes:p.changes.filter(c=>c.pose!==`pilot-blink:${slot}`)}))},m));
 assert.throws(()=>verifyBlinkApproval(a,{...b,fallbackDecoded:false},m));
});
