"""Isolated matte/coordinate/flow experiment. Never publishes or grants art approval.

User-authorized deterministic pixel post-processing, not an image generator.
All source frames remain untouched. No hand correction, RIFE or whole-image fade.
The bridge warps each endpoint along measured bidirectional dense correspondence,
then interpolates aligned premultiplied samples. It can still produce morphing and
must be rejected if the visual review detects identity/shape/edge artifacts.
"""
from pathlib import Path
import sys
sys.path.insert(0, 'D:/CodexTools/assistant-animation/tools/sleep-matte-extra')
import cv2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
import hashlib
import json
import subprocess
import argparse

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT/'docs/assistant/cloud-wave-trial-v1/r3'
IDLE = ROOT/'docs/assistant/live2d-restart-v1/review/idle-contour-study-v2-natural-hands/frames'
OUT = ROOT/'docs/assistant/cloud-motion-suite-v1/wave-transition-v1'
SIZE = 480
BG = np.array([245, 242, 235], np.float32)

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def rgba_sha(a): return hashlib.sha256(a.tobytes()).hexdigest()
def save(a, p): Image.fromarray(a).save(p)

def matte(rgb, clear_head_holes=False, frame_index=None):
    h, w = rgb.shape[:2]
    yy, xx = np.indices((h, w))
    features = np.stack([np.ones_like(xx), xx/w, yy/h, xx*yy/(w*h)], axis=2).astype(float)
    edge = (xx<18)|(xx>w-19)|(yy<18)|(yy>h-19)
    plane = features @ np.linalg.lstsq(features[edge], rgb[edge], rcond=None)[0]
    difference = np.linalg.norm(rgb.astype(float)-plane, axis=2)
    strong = difference > 28
    labels, count = ndi.label(strong)
    areas = ndi.sum(strong, labels, range(1, count+1))
    silhouette = ndi.binary_fill_holes(labels == int(np.argmax(areas)+1))
    holes=np.zeros_like(silhouette)
    if clear_head_holes:
        # Viewer-right raised hand/headset gap only. This ROI excludes both eyes
        # and the white shirt; warm skin is excluded by chroma and plane distance.
        safe=(xx>=295)&(xx<=385)&(yy>=85)&(yy<=215)
        safe|=(xx>=275)&(xx<=370)&(yy>=65)&(yy<=142)
        if frame_index is not None and 12<=frame_index<=32:
            # Eyes are closed in this verified source interval. Thin neck/headset
            # background pockets lie farther left than the raised-palm ROI.
            safe|=(xx>=278)&(xx<=320)&(yy>=180)&(yy<=235)
        else:
            safe|=(xx>=305)&(xx<=340)&(yy>=195)&(yy<=235)
        r,g,b=[rgb[:,:,c].astype(float) for c in range(3)]
        similar=(difference<40)&(r>210)&(g>210)&(b>200)&(np.abs(r-g)<10)&(np.abs(g-b)<18)
        holes=safe&similar&silhouette
        silhouette[holes]=False
    core = ndi.binary_erosion(silhouette, iterations=2)
    distance, nearest = ndi.distance_transform_edt(~core, return_indices=True)
    foreground = rgb[nearest[0], nearest[1]].astype(float)
    direction = foreground-plane
    alpha = np.clip(np.sum((rgb-plane)*direction, axis=2)/np.maximum(1, np.sum(direction**2, axis=2)), 0, 1)
    alpha[core] = 1
    alpha[distance > 4] = 0
    if clear_head_holes:
        # Protected background must not be reintroduced by nearest-core alpha
        # reconstruction. Only the adjacent one-pixel ring receives attenuation.
        ring=ndi.binary_dilation(holes,iterations=1)&~holes
        alpha[ring]*=.65
        alpha[holes]=0
    # Suppress only very faint outer matte noise, not opaque internal details.
    alpha[alpha < .035] = 0
    decontaminated = (rgb-(1-alpha[...,None])*plane)/np.maximum(alpha[...,None], .035)
    rgba = np.dstack([np.clip(decontaminated,0,255), alpha*255]).round().astype(np.uint8)
    rgba[rgba[:,:,3]==0] = 0
    return rgba, {'backgroundResidualP95':float(np.percentile(difference[edge],95)),
                  'headHandBackgroundPixelsCleared':int(holes.sum()),
                  'visiblePixels':int((alpha>.05).sum()), 'softPixels':int(((alpha>.05)&(alpha<.95)).sum())}

def premult(a):
    a = a.astype(np.float32)/255
    a[:,:,:3] *= a[:,:,3:4]
    return a

def unpremult(a):
    a = np.clip(a,0,1)
    rgb = np.clip(a[:,:,:3]/np.maximum(a[:,:,3:4],1/255),0,1)
    result = np.dstack([rgb,a[:,:,3]] )
    result = np.round(result*255).astype(np.uint8)
    result[result[:,:,3]==0] = 0
    return result

def mapped(a):
    scale = 3*SIZE/1254
    transform = np.array([[scale,0,-141*SIZE/1254],[0,scale,-141*SIZE/1254]],np.float32)
    return unpremult(cv2.warpAffine(premult(a),transform,(SIZE,SIZE),flags=cv2.INTER_LANCZOS4,
                                  borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0)))

def refine_outer_edge(a):
    """Fixed one-pixel contour contraction and nearest dark-ink cleanup only."""
    alpha=a[:,:,3].copy()
    labels,count=ndi.label(alpha>16)
    areas=ndi.sum(alpha>16,labels,range(1,count+1))
    connected=labels==int(np.argmax(areas)+1)
    # No independent per-frame crop or per-frame tuned thresholds.
    alpha[~ndi.binary_dilation(connected,iterations=1)]=0
    distance=ndi.distance_transform_edt(alpha>16)
    contracted=ndi.minimum_filter(alpha,size=3)
    contracted[contracted<12]=0
    result=a.copy();result[:,:,3]=contracted
    # Search only a 3x3 neighborhood for existing opaque dark outline colour.
    # This does not recolour the white shirt or opaque skin inside the figure.
    rgb=a[:,:,:3].astype(float)
    lum=rgb@np.array([.2126,.7152,.0722])
    best=np.full(alpha.shape,np.inf)
    colors=rgb.copy()
    padded=np.pad(rgb,((1,1),(1,1),(0,0)),mode='edge')
    la=np.pad(lum,1,mode='edge'); aa=np.pad(a[:,:,3],1,mode='edge')
    for dy in range(3):
        for dx in range(3):
            l=la[dy:dy+SIZE,dx:dx+SIZE]
            eligible=(aa[dy:dy+SIZE,dx:dx+SIZE]>220)&(l<best)
            colors[eligible]=padded[dy:dy+SIZE,dx:dx+SIZE][eligible]
            best[eligible]=l[eligible]
    rim=(contracted>0)&(distance<=2.5)&np.isfinite(best)
    result[:,:,:3][rim]=colors[rim].astype(np.uint8)
    result[result[:,:,3]==0]=0
    protected=distance>3
    result[protected]=a[protected]
    labels,count=ndi.label(result[:,:,3]>12)
    areas=ndi.sum(result[:,:,3]>12,labels,range(1,count+1))
    main=labels==int(np.argmax(areas)+1)
    isolated=(result[:,:,3]>0)&~main
    # After contraction, do not retain the former 1px dilation around tiny islands.
    result[isolated]=0
    protected=protected&main
    assert np.array_equal(result[protected],a[protected]),'Interior colours or alpha changed'
    return result,{'changedPixels':int(np.any(result!=a,axis=2).sum()),
                  'protectedInteriorPixels':int(protected.sum()),'interiorExact':True,
                  'outerIsolatedPixelsCleared':int(isolated.sum()),
                  'silhouetteContractionPx':1,'colourNeighborhoodPx':1}

def rgb_on(a, color):
    alpha = a[:,:,3:4].astype(float)/255
    return np.round(a[:,:,:3]*alpha+np.array(color)*(1-alpha)).astype(np.uint8)

def restore_hand_overlay(frame, directory, index):
    """Restore independently authored hand coverage after generic edge cleanup.

    Both payload and support use original 512px coordinates. Support is not a
    difference mask: it includes transparent finger gaps and the erasure margin.
    No erosion, brightness key, or dark-neighbour substitution touches this patch.
    """
    name=f'frame-{index:03d}.png'
    patch_path=directory/'hand-rgba'/name
    support_path=directory/'hand-support'/name
    patch=np.array(Image.open(patch_path).convert('RGBA'))
    support=np.array(Image.open(support_path).convert('L')).astype(np.float32)/255
    assert patch.shape==(512,512,4) and support.shape==(512,512)
    if not np.any(support):
        return frame,{'supportPixels':0,'changedPixels':0,'sourceRgbaSha256':sha(patch_path)}
    scale=3*SIZE/1254
    transform=np.array([[scale,0,-141*SIZE/1254],[0,scale,-141*SIZE/1254]],np.float32)
    weight=np.clip(cv2.warpAffine(support,transform,(SIZE,SIZE),flags=cv2.INTER_LINEAR,
                                  borderMode=cv2.BORDER_CONSTANT,borderValue=0),0,1)
    restored=mapped(patch)
    mixed=unpremult(premult(frame)*(1-weight[:,:,None])+premult(restored)*weight[:,:,None])
    # Exact original bytes outside mapped support, including invisible RGB.
    outside=weight==0
    mixed[outside]=frame[outside]
    assert np.array_equal(mixed[outside],frame[outside])
    return mixed,{'supportPixels':int((weight>0).sum()),
      'changedPixels':int(np.any(mixed!=frame,axis=2).sum()),'outsideSupportExact':True,
      'sourceRgbaSha256':sha(patch_path),'sourceSupportSha256':sha(support_path),
      'noErosion':True,'noBrightnessKey':True}

def flow_bridge(a,b,segments=12):
    aa = cv2.cvtColor(rgb_on(a,BG),cv2.COLOR_RGB2GRAY)
    bb = cv2.cvtColor(rgb_on(b,BG),cv2.COLOR_RGB2GRAY)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    forward = dis.calc(aa,bb,None)
    backward = dis.calc(bb,aa,None)
    visible = (a[:,:,3]>32)|(b[:,:,3]>32)
    magnitude = np.linalg.norm(forward,axis=2)[visible]
    yy,xx = np.indices(aa.shape,dtype=np.float32)
    warped_back = cv2.remap(backward,xx+forward[:,:,0],yy+forward[:,:,1],cv2.INTER_LINEAR)
    residual = np.linalg.norm(forward+warped_back,axis=2)[visible]
    out = [a.copy()]
    pa,pb = premult(a),premult(b)
    for i in range(1,segments):
        t=i/segments
        t=t*t*(3-2*t)
        wa = cv2.remap(pa,xx-t*forward[:,:,0],yy-t*forward[:,:,1],cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0))
        wb = cv2.remap(pb,xx-(1-t)*backward[:,:,0],yy-(1-t)*backward[:,:,1],cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0))
        out.append(unpremult(wa*(1-t)+wb*t))
    out.append(b.copy())
    return out, {'flowMagnitudeMedian':float(np.median(magnitude)),
                 'flowMagnitudeP95':float(np.percentile(magnitude,95)),
                 'flowMagnitudeMax':float(magnitude.max()),
                 'forwardBackwardResidualP95':float(np.percentile(residual,95)),
                 'warning':'Optical correspondence is not proof of correct anatomy. Morphing may remain.'}

def board(frames,names,path,size=240):
    result = Image.new('RGB',(4*size,((len(frames)+3)//4)*(size+28)), '#dedad2')
    draw = ImageDraw.Draw(result)
    for i,(frame,name) in enumerate(zip(frames,names)):
        x,y=i%4*size,i//4*(size+28)
        result.paste(Image.fromarray(frame).resize((size,size),Image.Resampling.NEAREST),(x,y))
        draw.text((x+4,y+size+5),name,fill='black')
    result.save(path)

def detail_board(crops,names,path):
    """Exactly 2x, nearest-neighbour; never stretch rectangular crops to squares."""
    width=max(a.shape[1] for a in crops)*2
    height=max(a.shape[0] for a in crops)*2
    result=Image.new('RGB',(4*width,((len(crops)+3)//4)*(height+28)),'#dedad2')
    draw=ImageDraw.Draw(result)
    for i,(crop,name) in enumerate(zip(crops,names)):
        x,y=i%4*width,i//4*(height+28)
        result.paste(Image.fromarray(crop).resize((crop.shape[1]*2,crop.shape[0]*2),Image.Resampling.NEAREST),(x,y))
        draw.text((x+4,y+height+5),name,fill='black')
    result.save(path)

def main():
    global OUT,SRC
    parser=argparse.ArgumentParser()
    parser.add_argument('--refine',action='store_true')
    parser.add_argument('--clean-holes',action='store_true')
    parser.add_argument('--source',type=Path)
    parser.add_argument('--output',type=Path)
    parser.add_argument('--hand-overrides',type=Path)
    parser.add_argument('--skip-previews',action='store_true',help='Emit actual PNGs and review boards before expensive animation encoding')
    args=parser.parse_args()
    if args.source:
        SRC=args.source.resolve(strict=True)
        assert SRC.is_relative_to((ROOT/'docs/assistant').resolve()),'Candidate source must stay in assistant workspace'
    if args.output:
        OUT=args.output.resolve()
        assert OUT.is_relative_to((ROOT/'docs/assistant/cloud-motion-suite-v1').resolve()),'Output must stay isolated from production'
    elif args.refine: OUT=OUT/('matte-v4' if args.clean_holes else 'matte-v2')
    if args.hand_overrides:
        args.hand_overrides=args.hand_overrides.resolve(strict=True)
        assert args.hand_overrides.is_relative_to((ROOT/'docs/assistant/cloud-motion-suite-v1').resolve())
    for directory in ['idle-480','mapped-frames','entry-bridge','exit-bridge','review']:
        (OUT/directory).mkdir(parents=True,exist_ok=True)
    # Exact same approved resize implementation as the production packager.
    node_code = """import sharp from 'sharp';import {join} from 'node:path';
const [source,out]=process.argv.slice(1);for(let i=0;i<120;i++){
await sharp(join(source,'idle_'+String(i).padStart(3,'0')+'.png')).resize(480,480).png().toFile(join(out,'idle_'+String(i).padStart(3,'0')+'.png'));}
"""
    subprocess.run(['node','--input-type=module','-e',node_code,str(IDLE),str(OUT/'idle-480')],cwd=ROOT,check=True)
    idle = [np.array(Image.open(OUT/'idle-480'/f'idle_{i:03d}.png').convert('RGBA')) for i in range(120)]
    for i,frame in enumerate(idle):
        frame[frame[:,:,3]==0]=0
        save(frame,OUT/'idle-480'/f'idle_{i:03d}.png')
    anchor = idle[0]
    approved = np.array(Image.open(ROOT/'public/assistant/chibi-natural-idle-v2-still.webp').convert('RGBA'))
    approved[approved[:,:,3]==0]=0
    assert np.array_equal(anchor,approved), 'Anchor must decode identically to approved static idle'
    frames=[]; matte_report=[]
    for i in range(49):
        original = np.array(Image.open(SRC/f'frame-{i:03d}.png').convert('RGB'))
        m,metrics=matte(original,args.clean_holes,i)
        frame=mapped(m)
        if args.refine:
            frame,edge_metrics=refine_outer_edge(frame)
            metrics['edgeRefinement']=edge_metrics
        if args.hand_overrides:
            frame,hand_metrics=restore_hand_overlay(frame,args.hand_overrides,i)
            metrics['independentHandCoverage']=hand_metrics
        save(frame,OUT/'mapped-frames'/f'frame-{i:03d}.png')
        frames.append(frame);matte_report.append(metrics)
    entry,entry_report=flow_bridge(anchor,frames[0])
    exit_frames,exit_report=flow_bridge(frames[-1],anchor)
    for label,seq in [('entry-bridge',entry),('exit-bridge',exit_frames)]:
        for i,frame in enumerate(seq): save(frame,OUT/label/f'frame-{i:03d}.png')
    # Full accepted idle cycle, measured bridge, unchanged action, return bridge,
    # then a complete idle cycle. Shared endpoints appear only once at joins.
    full=idle+entry+frames[1:]+exit_frames[1:]+idle[1:]
    bridge_times=[17,17,16]*4
    wave_times=bridge_times+[63 if i%2==0 else 62 for i in range(49)]+bridge_times
    durations=[33 if i%3!=2 else 34 for i in range(120)]+wave_times+[33 if i%3!=2 else 34 for i in range(1,120)]
    assert len(full)==len(durations)
    if not args.skip_previews:
        for name,color in [('white',(255,255,255)),('black',(20,22,28))]:
            ims=[Image.fromarray(rgb_on(a,color)) for a in full]
            ims[0].save(OUT/f'preview-{name}.webp',save_all=True,append_images=ims[1:],duration=durations,loop=0,lossless=True,method=1)
        rgba=[Image.fromarray(a) for a in full]
        rgba[0].save(OUT/'preview-transparent.webp',save_all=True,append_images=rgba[1:],duration=durations,loop=0,lossless=True,method=1)
    anchors=[anchor,frames[0],frames[-1],anchor]
    board([rgb_on(a,(255,255,255)) for a in anchors],['Approved idle','R3 start mapped','R3 end mapped','Approved idle'],OUT/'review'/'endpoints-white.png',480)
    board([rgb_on(a,(20,22,28)) for a in anchors],['Approved idle','R3 start mapped','R3 end mapped','Approved idle'],OUT/'review'/'endpoints-black.png',480)
    selection=entry[::2]+exit_frames[::2]
    board([rgb_on(a,(20,22,28)) for a in selection], [f'Entry {i}' for i in range(0,13,2)]+[f'Exit {i}' for i in range(0,13,2)],OUT/'review'/'bridge-contact.png',240)
    for region,box in [('head',(120,5,365,245)),('torso',(135,185,335,355))]:
        crops=[rgb_on(a,(20,22,28))[box[1]:box[3],box[0]:box[2]] for a in anchors]
        detail_board(crops,['Idle','R3 start','R3 end','Idle'],OUT/'review'/f'{region}-endpoints-2x.png')
    if args.refine:
        for name,color in [('white',(255,255,255)),('black',(20,22,28))]:
            crops=[];names=[]
            for i in [0,12,20,32,48]:
                for label,box in [('hair',(125,5,365,185)),('hand',(320,70,400,180)),('leg',(170,340,320,455))]:
                    crops.append(rgb_on(frames[i],color)[box[1]:box[3],box[0]:box[2]])
                    names.append(f'F{i:02d} {label} edge')
            detail_board(crops,names,OUT/'review'/f'edge-2x-{name}.png')
    if args.hand_overrides:
        for name,color in [('white',(255,255,255)),('black',(20,22,28))]:
            indices=[12,13,14,15,16,20,25,26,27,28,31,32]
            crops=[rgb_on(frames[i],color)[65:175,280:405] for i in indices]
            detail_board(crops,[f'F{i:02d} raised-hand continuity' for i in indices],OUT/'review'/f'hand-continuity-2x-{name}.png')
    def metrics(a,b):
        mask=(a[:,:,3]>32)|(b[:,:,3]>32)
        aa,bb=rgb_on(a,BG).astype(float),rgb_on(b,BG).astype(float)
        return {'visibleRGB_MAE':float(np.abs(aa-bb)[mask].mean()),
                'alphaIoU':float(((a[:,:,3]>128)&(b[:,:,3]>128)).sum()/((a[:,:,3]>128)|(b[:,:,3]>128)).sum())}
    report={'status':'CANDIDATE_PENDING_INDEPENDENT_VISUAL_REVIEW','productionAllowed':False,'productionChanged':False,
      'sourceFrames':[{'path':f'frame-{i:03d}.png','sha256':sha(SRC/f'frame-{i:03d}.png')} for i in range(49)],
      'sourceDirectory':str(SRC),'outputDirectory':str(OUT),'scopedHeadHandHoleCleanup':args.clean_holes,
      'handCoverageOverrides':str(args.hand_overrides) if args.hand_overrides else None,
      'animationPreviewsEncoded':not args.skip_previews,
      'anchorRgbaSha256':rgba_sha(anchor),'approvedStillVisibleRGBAExact':True,'zeroAlphaRGBNormalized':True,
      'geometry':{'baselineSize':1254,'approvedIdleSourceSize':768,'cloudPaddedSize':1536,'cloudSize':512,'outputSize':480,
                  'scale':3*480/1254,'translation':-141*480/1254,'anisotropicStretch':False,'perFrameCrop':False},
      'matteMethod':'Border-fitted RGB background plane, dominant connected silhouette, alpha unmixing; no AI matte model',
      'edgeRefinement': 'One pixel contour contraction; 3x3 local opaque ink selection; alpha>16 connected silhouette cleanup; interior farther than 3px exact' if args.refine else None,
      'matteFrameMetrics':matte_report,'entry':entry_report,'exit':exit_report,
      'inputEndpointDifference':{'start':metrics(anchor,frames[0]),'end':metrics(frames[-1],anchor)},
      'finalCount':len(full),'durationMs':sum(durations),'handRepairApplied':bool(args.source),
      'bridgeTiming':{'intervals':12,'intervalDurationsMs':bridge_times,'durationPerSideMs':sum(bridge_times),'waveClipDurationMs':sum(wave_times)},
      'limitations':['Bidirectional optical-flow bridge is experimental, not pixel identity preservation.',
                     'Generated first/end faces and costume differ from approved anchor.',
                     'Matte may retain enclosed background holes; dark/white visual check required.',
                     'No whole-body anisotropic scaling, simple crossfade, single-frame substitution or RIFE.']}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['status','finalCount','durationMs','entry','exit','inputEndpointDifference']}))

if __name__=='__main__': main()
