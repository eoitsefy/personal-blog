"""Conservative same-frame hand cleanup; isolated candidate, never deployment."""
from pathlib import Path
import json, hashlib
import numpy as np
from PIL import Image, ImageDraw
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'docs/assistant/cloud-motion-suite-v1/batch-v3/selected-repair-v1/thinking'
SRC=BASE/'same-action-v6b/rgba-512'
OUT=BASE/'hand-v7'
BOX=(157,285,210,350)
POLYS={
39:[(165,301),(178,300),(185,304),(185,316),(178,319),(176,325),(166,326),(160,320),(160,309)],
40:[(170,305),(181,306),(188,311),(185,324),(181,327),(177,331),(168,331),(162,323),(162,315),(165,309)],
41:[(172,305),(182,307),(189,311),(187,323),(181,325),(177,332),(167,331),(162,322),(162,313),(166,308)]}

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def rgbclean(old,frame):
    # No geometry synthesis. Correct local yellow/green and purple contamination
    # against a SAME-FRAME warm skin/ink chroma interpolation, retaining luminance.
    region=Image.new('L',(512,512));ImageDraw.Draw(region).polygon(POLYS[frame],fill=255)
    f=old[:,:,:3].astype(float);r,g,b=np.moveaxis(f,-1,0)
    l=f@np.array([.2126,.7152,.0722])
    support=(np.array(region)>0)&(old[:,:,3]>=64)
    ochre=support&(g-b>20)&(r-g<43)&(l>90)
    purple=support&(b-g>2)&(r-g<30)&(l<185)
    pale=support&(l>220)&(r-g<15)&(g-b>10)
    selected=ochre|purple|pale
    # Donors are clean warm skin and finger-outline pixels from this same frame.
    samples={39:[(164,314),(167,307),(174,302)],40:[(164,319),(168,313),(170,310)],41:[(164,315),(169,311),(174,307)]}[frame]
    palette=np.array([f[y,x] for x,y in samples]);order=np.argsort(palette@np.array([.2126,.7152,.0722]));palette=palette[order]
    pl=palette@np.array([.2126,.7152,.0722])
    target=np.stack([np.interp(l,pl,palette[:,c]) for c in range(3)],-1)
    target+= (l-target@np.array([.2126,.7152,.0722]))[:,:,None]
    # Restrict colour correction per channel and avoid turning fine creases into flat skin.
    delta=np.clip(target-f,-18,18)*.75
    new=old.copy();new[:,:,:3][selected]=np.rint(f+delta).clip(0,255).astype('uint8')[selected]
    changed=np.any(new!=old,axis=2)
    mask=np.where(changed,255,0).astype('uint8')
    assert np.array_equal(old[:,:,3],new[:,:,3])
    assert np.array_equal(old[~changed],new[~changed])
    return new,mask,{'cleanSameFrameDonors':samples,'cleanSameFrameDonorColors':palette.tolist(),'changedPixels':int(changed.sum()),'maxRgbChange':int(np.abs(new[:,:,:3].astype(int)-old[:,:,:3]).max()),'alphaChangedPixels':0,'outsideMaskChangedPixels':0}

def run():
    (OUT/'rgba-512').mkdir(parents=True,exist_ok=True);(OUT/'masks').mkdir(exist_ok=True)
    records=[]
    for i in range(49):
        p=SRC/f'frame-{i:03d}.png';old=np.array(Image.open(p).convert('RGBA'));new=old.copy();mask=np.zeros((512,512),np.uint8)
        info={'changedPixels':0,'alphaChangedPixels':0,'outsideMaskChangedPixels':0}
        if i in POLYS:new,mask,info=rgbclean(old,i)
        Image.fromarray(new).save(OUT/'rgba-512'/p.name);Image.fromarray(mask).save(OUT/'masks'/p.name)
        records.append({'frame':i,'sourceSha256':sha(p),'outputSha256':sha(OUT/'rgba-512'/p.name),**info})
    for color,name in [((240,236,229,255),'light'),((21,25,34,255),'dark')]:
        sheet=Image.new('RGB',(318*7,(390+24)*2),color[:3]);d=ImageDraw.Draw(sheet)
        for row,folder in enumerate([SRC,OUT/'rgba-512']):
            for col,i in enumerate(range(37,44)):
                im=Image.open(folder/f'frame-{i:03d}.png').convert('RGBA');bg=Image.new('RGBA',im.size,color);bg.alpha_composite(im)
                sheet.paste(bg.crop(BOX).convert('RGB').resize((318,390),Image.Resampling.NEAREST),(col*318,row*414+24))
                d.text((col*318+8,row*414+4),('SOURCE ' if row==0 else 'V7 ')+f'F{i:03d}',fill='white' if name=='dark' else 'black')
        sheet.save(OUT/f'before-after-{name}.png')
    report={'status':'LOCAL_COLOR_DECONTAMINATION_CANDIDATE_NOT_ART_APPROVED','source':str(SRC),'frameCount':49,'durationsMs':[63 if i%2==0 else 62 for i in range(49)],'noGeometryChanges':True,'noDonorPoseReplacement':True,'productionAllowed':False,'remaining':['Original finger topology and low-resolution blur remain; no claim of reconstructed missing fingers.','Independent visual and encoded temporal review required.'],'records':records}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
    print(json.dumps({r['frame']:r['changedPixels'] for r in records if r['changedPixels']}))

def diagnostic():
    OUT.mkdir(parents=True,exist_ok=True)
    sheet=Image.new('RGB',(53*6*7,65*6+24),'#eee');d=ImageDraw.Draw(sheet)
    for col,i in enumerate(range(37,44)):
        im=Image.open(SRC/f'frame-{i:03d}.png').convert('RGBA')
        bg=Image.new('RGBA',im.size,(240,236,229,255));bg.alpha_composite(im)
        sheet.paste(bg.crop(BOX).convert('RGB').resize((318,390),Image.Resampling.NEAREST),(col*318,24))
        d.text((col*318+8,4),f'F{i:03d}',fill='black')
    sheet.save(OUT/'source-neighborhood.png')
    for i in (39,40,41):
        im=Image.open(SRC/f'frame-{i:03d}.png').convert('RGBA')
        bg=Image.new('RGBA',im.size,(240,236,229,255));bg.alpha_composite(im)
        box=(161,303,194,333); p=bg.crop(box).convert('RGB').resize((660,600),Image.Resampling.NEAREST)
        d=ImageDraw.Draw(p)
        for x in range(33):d.text((x*20,0),str((x+161)%10),fill='blue')
        for y in range(30):d.text((0,y*20),str(y+303),fill='blue')
        p.save(OUT/f'grid-{i}.png')

if __name__=='__main__':diagnostic();run()
