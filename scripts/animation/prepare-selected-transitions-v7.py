"""Isolated optical-flow transition trial; no release approval or publication."""
import importlib.util
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'docs/assistant/cloud-motion-suite-v1/batch-v3/selected-repair-v1'
OUT = BASE / 'transition-v7'

def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/'scripts/animation'/filename)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

finish = module('finish', 'finish-selected-repair.py')
flow = module('flow', 'r3-prepare-transition-candidate.py')

def read(path):
    a = np.array(Image.open(path).convert('RGBA'))
    a[a[:, :, 3] == 0] = 0
    return a

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    anchor = read(ROOT/'public/assistant/chibi-natural-idle-v2-still.webp')
    assert anchor.shape == (480, 480, 4)
    report = {'status':'PENDING_VISUAL_REVIEW', 'productionAllowed':False,
              'method':'Bidirectional measured optical flow, premultiplied aligned interpolation; not guaranteed anatomy preservation',
              'bridgeIntervals':8, 'bridgeDurationMs':320, 'motions':{}}
    for action, src in [('bow', BASE/'thanks/same-action-v6b'), ('thinking', BASE/'thinking/hand-v7')]:
        dest = OUT/action
        frames = [finish.mapped(read(src/'rgba-512'/f'frame-{i:03d}.png')) for i in range(49)]
        entry, em = flow.flow_bridge(anchor, frames[0], segments=8)
        leave, lm = flow.flow_bridge(frames[-1], anchor, segments=8)
        sequence = entry[:-1] + frames + leave[1:]
        durations = [40]*8 + finish.DURATIONS + [40]*8
        assert len(sequence) == len(durations) == 65
        assert np.array_equal(sequence[0], anchor) and np.array_equal(sequence[-1], anchor)
        (dest/'frames').mkdir(parents=True, exist_ok=True)
        for i, a in enumerate(sequence):
            Image.fromarray(a).save(dest/'frames'/f'frame-{i:03d}.png')
        for bgname, bg in [('dark',(23,27,35)), ('light',(245,242,235))]:
            board = Image.new('RGB',(9*240,2*270),bg)
            draw = ImageDraw.Draw(board)
            for row, seq in enumerate([entry, leave]):
                for col,a in enumerate(seq):
                    im = Image.fromarray(flow.rgb_on(a,bg)).resize((240,240),Image.Resampling.LANCZOS)
                    board.paste(im,(col*240,row*270))
                    draw.text((col*240+5,row*270+242),f'{"IN" if row==0 else "OUT"} {col}',fill=(150,150,150))
            board.save(dest/f'bridge-{bgname}.png')
        report['motions'][action] = {'source':str(src), 'frames':65, 'durationsMs':durations,
                                    'entry':em,'exit':lm, 'anchorExact':True}
    (OUT/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report))

if __name__ == '__main__': main()
