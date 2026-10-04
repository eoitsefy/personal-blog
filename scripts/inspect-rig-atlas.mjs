// Read-only alpha measurement. Never edits bitmap art.
import sharp from 'sharp';
const path=process.argv[2];if(!path)throw Error('Pass a rig atlas path');
const meta=await sharp(path).metadata();if(!meta.hasAlpha)throw Error('Real RGBA alpha required');
const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
// These search regions fit the generated v1 layout. New layouts need new regions.
const v1=[[0,0,.315,.29],[.315,0,.55,.29],[.55,0,.75,.29],[.75,0,1,.29],
 ...[0,1,2,3].map(c=>[c/4,.29,(c+1)/4,.59]),
 ...[0,1,2,3].map(c=>[c/4,.59,(c+1)/4,.76]),
 ...[0,1,2,3].map(c=>[c/4,.76,(c+1)/4,1])];
// v2 has 18 semantic pieces, not 20 equal crops. The first head is wider.
const v2=[[0,0,.36,.27],[.36,0,.57,.27],[.57,0,.8,.27],[.8,0,1,.27],
 ...[0,1,2,3].map(c=>[c/4,.27,(c+1)/4,.5]),
 ...[0,1,2,3].map(c=>[c/4,.5,(c+1)/4,.695]),
 ...[0,1,2,3].map(c=>[c/4,.695,(c+1)/4,.84]),
 ...[0,1].map(c=>[c/4,.84,(c+1)/4,1])];
const regions=path.endsWith('-v2.png')?v2:v1;
const parts=regions.map(r=>{
 let x1=info.width,y1=info.height,x2=0,y2=0,count=0;
 for(let y=Math.floor(r[1]*info.height);y<r[3]*info.height;y++)for(let x=Math.floor(r[0]*info.width);x<r[2]*info.width;x++)if(data[(y*info.width+x)*4+3]>100){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);count++;}
 if(count<50)throw Error('Missing attachment');return [x1,y1,x2-x1+1,y2-y1+1];
});
console.log(JSON.stringify({width:info.width,height:info.height,alpha:true,parts},null,2));
