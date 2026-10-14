"""Bind native delivered RGBA frame bytes to a lossless web release."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

p=argparse.ArgumentParser()
p.add_argument('--source',type=Path,required=True)
p.add_argument('--manifest',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args()
assert not a.out.exists()
m=json.loads(a.manifest.read_text(encoding='utf-8'))
records={}
for name,clip in m['clips'].items():
    path=a.source/name/(name+'.webp')
    assert hashlib.sha256(path.read_bytes()).hexdigest()==clip['sourceWebpSha256']
    hashes=[]
    with Image.open(path) as im:
        assert im.n_frames==clip['frames']
        for i in range(im.n_frames):
            im.seek(i); im.load()
            hashes.append(hashlib.sha256(im.convert('RGBA').tobytes()).hexdigest())
    records[name]=hashes
a.out.write_text(json.dumps({'version':m['version'],'rgbaSourceFrameHashes':records,
                            'aiArtReview':False,'geometryChanged':False}),encoding='utf-8')
print('Indexed original RGBA frames for',len(records),'clips')
