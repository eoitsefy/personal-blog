// Explicitly invoked only after independent source and runtime reviews exist.
import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {naturalManifestScope,validateNaturalMotionAssets} from './validate-natural-motion-assets.mjs';
const root=process.cwd(),version='natural-selected-actions-v7';
const base=resolve(root,'docs/assistant/cloud-motion-suite-v1/batch-v3/selected-repair-v1');
const staging=join(base,'staging-v7'),transition=join(base,'transition-v7');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const art=await read(join(transition,'browser-review.json'));
assert.equal(art.status,'PASS_NEW_BOW_THINKING_DESKTOP_RUNTIME_VISUAL_SCOPE');
const technical=await read(join(staging,'review/independent-technical.json'));
assert.equal(technical.status,'PASS', 'Independent technical review is still pending');
const manifest=await read(join(staging,'manifest.json'));
assert.equal(manifest.version,version);
const evidenceRelative=`src/lib/assistant/releases/${version}/review`;
const evidence=join(root,evidenceRelative),release=join(root,`src/lib/assistant/releases/${version}`);
await mkdir(evidence,{recursive:true});await mkdir(release,{recursive:true});
const copies=[
 ['art.json',join(transition,'browser-review.json')],
 ['source-art.json',join(transition,'review-v7.json')],
 ['technical.json',join(staging,'review/independent-technical.json')],
 ['packaging.json',join(staging,'review/technical.json')],
 ['runtime-samples.json',join(transition,'browser/runtime-samples.json')],
 ['thinking-hand-local.json',join(base,'thinking/hand-v7/report.json')],
 ['bow-runtime.png',join(transition,'independent-review/browser-bow-045-089.png')],
 ['thinking-runtime.png',join(transition,'independent-review/browser-thinking-060-119.png')],
 ['bow-mobile.png',join(transition,'browser/bow-mobile-060.png')],
 ['thinking-mobile.png',join(transition,'browser/thinking-mobile-060.png')],
];
for(const [name,path] of copies)await copyFile(path,join(evidence,name));
const now=new Date().toISOString();
const gate=(reviewer,paths)=>({status:'PASS',reviewer,reviewedAt:now,evidence:paths.map(x=>`${evidenceRelative}/${x}`)});
const report={manifestVersion:version,manifestScopeSha256:naturalManifestScope(manifest),
 art:gate('selected_transition_audit',['art.json','source-art.json','bow-runtime.png','thinking-runtime.png']),
 technical:gate('deploy_selected_audit',['technical.json','packaging.json']),
 transitions:gate('root runtime verification + selected_transition_audit',['art.json','runtime-samples.json','bow-mobile.png','thinking-mobile.png']),
 approvedChangeScope:['new bow','new thinking','their entry/exit transitions'],
 unchangedScope:['idle','wave','static anchor','all legacy choices'],
 knownLimitations:['The previously reported wave fringe/color issue is unchanged and is NOT marked repaired by this release.',
 'Fine moving finger and hair textures remain soft at high magnification. New clips passed actual assistant-size review, not a claim of perfect source anatomy.',
 'Optical-flow bridges distribute residual sharpness difference over 320ms; original sources are not pixel-identical.',
 'Local all-tests run had 384 passes, 3 old wave-v9 reparse_path_rejected failures caused by migrated junctions, and 1 skip. Clean Linux CI is required before deploy.'],
 runtimeVerification:{actualComponent:'NaturalMotionCanvas',bowDarkSamples:90,thinkingDarkSamples:120,mobileSizeSamples:180,nativeThinkingSamples:100,
  completionCallbacks:'6 completed plays, once each; returned to idle',reducedMotion:'canvas hidden, common static anchor',simulatedHidden:'canvas hidden, resumes',
  deviceLimit:'Mobile CSS display size tested on desktop browser, not physical mobile hardware.'},
 deploymentStatus:'NOT_DEPLOYED_CI_REQUIRED'};
manifest.review={art:'PASS',technical:'PASS',transitions:'PASS',report:`${evidenceRelative}/release-review.json`};
await writeFile(join(evidence,'release-review.json'),JSON.stringify(report,null,2)+'\n');
const destination=join(root,'public/assistant',version);await mkdir(destination,{recursive:true});
for(const name of await readdir(join(staging,'public/assistant',version)))await copyFile(join(staging,'public/assistant',version,name),join(destination,name));
await writeFile(join(release,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const result=await validateNaturalMotionAssets(manifest,root);
await writeFile(join(evidence,'actual-asset-verification.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(join(evidence,'expected-assets.json'),JSON.stringify({version,assets:[...Object.values(manifest.assets),manifest.still].map(({src,sha256})=>({src,sha256}))},null,2)+'\n');
console.log(JSON.stringify(result));
