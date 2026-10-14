"""Versioned web atlases from the selected H3 delivery, not new artwork.

Fixed 480px whole frames, original durations/order, exact decoded alpha.
No crop, geometry edits, interpolation, review fabrication or source mutation.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--manifest',type=Path,required=True)
p.add_argument('--quality',type=int,default=94)
a=p.parse_args()
assert not a.manifest.exists(), 'Use a new release version; preserve existing releases'
a.out.mkdir(parents=True,exist_ok=True)
delivery=json.loads((a.source/'delivery.json').read_text(encoding='utf-8'))
assert len(delivery['clips'])==24
version='h3-motion-'+a.out.name.removeprefix('h3-')
asset_prefix='/assistant/'+a.out.name+'/'
manifest={'version':version,'width':480,'height':480,'columns':4,'pageFrames':8,
          'assets':{},'stills':{},'clips':{},'review':{'aiArtReview':False,'userAuthorizedRelease':True},
          'provenance':{'workflow':'MiniMax H3 + trained character LoRA','sourceDelivery':'delivery-candidate-v4',
                        'loraSha256':'37bbdc88fc512f8c263ad1807776f5ebbc1932f6e0ddac16fb725b99aec49ce2',
                        'knownLimitations':['Small fine edge specks remain in some frames on dark backgrounds']}}
total_bytes=0
for clip in delivery['clips']:
    name=clip['id']
    source=a.source/name/(name+'.webp')
    source_sha=hashlib.sha256(source.read_bytes()).hexdigest()
    frames,durations=[],[]
    with Image.open(source) as im:
        for i in range(im.n_frames):
            im.seek(i); im.load()
            assert im.size==(480,480)
            frames.append(im.convert('RGBA').copy())
            durations.append(im.info['duration'])
    assert len(frames)==clip['frames'] and sum(durations)==clip['ms']
    pages=[]
    rgb_error_sum=0.0; rgb_count=0
    for start in range(0,len(frames),8):
        key=f'{name}-{start//8:03d}'
        target=a.out/(key+'.webp')
        assert not target.exists()
        sheet=Image.new('RGBA',(1920,960))
        batch=frames[start:start+8]
        for k,frame in enumerate(batch):
            sheet.paste(frame,((k%4)*480,(k//4)*480))
        sheet.save(target,lossless=True,method=4,exact=True)
        with Image.open(target) as decoded:
            decoded=np.asarray(decoded.convert('RGBA'))
        original=np.asarray(sheet)
        assert np.array_equal(original[...,3],decoded[...,3]), 'Alpha must remain exact'
        use=original[...,3]>240
        error=np.abs(original[...,:3].astype(float)-decoded[...,:3].astype(float))[use]
        rgb_error_sum+=float(error.sum()); rgb_count+=error.size
        asset={'src':asset_prefix+target.name,'width':1920,'height':960,
               'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'alpha':True}
        manifest['assets'][key]=asset; pages.append(key)
        total_bytes+=target.stat().st_size
    mean_error=rgb_error_sum/max(1,rgb_count)
    assert mean_error<1.5, f'{name}: compression colour error too large: {mean_error}'
    still=a.out/(name+'-still.webp')
    assert not still.exists()
    frames[0].save(still,lossless=True,method=4,exact=True)
    manifest['stills'][name]={'src':asset_prefix+still.name,'sha256':hashlib.sha256(still.read_bytes()).hexdigest()}
    total_bytes+=still.stat().st_size
    original_manifest=json.loads((a.source/name/'manifest.json').read_text(encoding='utf-8'))
    manifest['clips'][name]={'pages':pages,'durations':durations,'frames':len(frames),
                             'durationMs':sum(durations),'loop':clip['loop'],'label':clip['label'],
                             'sourceRun':original_manifest['run_id'],'sourceWebpSha256':source_sha,
                             'opaqueRgbMeanCompressionError':mean_error,'alphaExact':True}
    assert hashlib.sha256(source.read_bytes()).hexdigest()==source_sha
    print(json.dumps({'clip':name,'frames':len(frames),'pages':len(pages),'rgb_mean_error':mean_error}),flush=True)
a.manifest.parent.mkdir(parents=True,exist_ok=True)
a.manifest.write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
expected={'kind':'h3','version':version,'assets':[{'src':x['src'],'sha256':x['sha256']}
          for x in [*manifest['assets'].values(),*manifest['stills'].values()]]}
a.manifest.with_name('expected-assets.json').write_text(json.dumps(expected,indent=2),encoding='utf-8')
print(json.dumps({'clips':len(manifest['clips']),'assets':len(expected['assets']),'bytes':total_bytes,
                  'source_unchanged':True,'art_review':False}),flush=True)
