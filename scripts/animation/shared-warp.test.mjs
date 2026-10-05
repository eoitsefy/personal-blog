import test from 'node:test';
import assert from 'node:assert/strict';
import { inverseMap,warpBetween } from './shared-warp.mjs';
test('shared spatial map maps anchors exactly and rejects degenerate or out-of-canvas control points',()=>{
  const target=[[2,2],[20,2],[2,20],[20,20]],source=target.map(([x,y])=>[x+2,y+3]);
  const map=inverseMap(target,source,32,32);for(let i=0;i<target.length;i++){const value=map(...target[i]);assert.ok(Math.abs(value[0]-source[i][0])<1e-8);assert.ok(Math.abs(value[1]-source[i][1])<1e-8);}
  assert.throws(()=>inverseMap([[1,1],[1,1],[1,1]],[[1,1],[1,1],[1,1]],32,32),/degenerate/);
  assert.throws(()=>inverseMap([[1,1],[2,2],[100,3]],[[1,1],[2,2],[3,3]],32,32),/out_of_canvas/);
});
test('offline shared RGBA deformation preserves static pixels and keeps opaque interiors opaque',()=>{
  const width=32,height=32,a=Buffer.alloc(width*height*4),b=Buffer.alloc(a.length),mask=Buffer.alloc(a.length);
  for(let y=4;y<28;y++)for(let x=4;x<28;x++){const p=(y*width+x)*4;mask.fill(255,p,p+4);a.set([230,180,145,255],p);b.set([230,180,145,255],p);}
  const controls=[[4,4],[27,4],[4,27],[27,27]];
  const out=warpBetween(a,b,mask,width,height,controls,controls,.5);
  for(let y=5;y<27;y++)for(let x=5;x<27;x++)assert.deepEqual(out.subarray((y*width+x)*4,(y*width+x)*4+4),Buffer.from([230,180,145,255]));
  for(let p=0;p<a.length;p+=4)if(!mask[p+3])assert.deepEqual(out.subarray(p,p+4),a.subarray(p,p+4));
  assert.deepEqual(warpBetween(a,b,mask,width,height,controls,controls,0),a);
  assert.deepEqual(warpBetween(a,b,mask,width,height,controls,controls,1),b);
  assert.throws(()=>warpBetween(a,b,mask,width,height,controls,controls,2),/fraction/);
});
