// Read-only registration measurement. Never edits/resizes generated PNG assets.
import sharp from 'sharp';
const path=process.argv[2];
if(!path)throw Error('Pass a sprite sheet path');
const meta=await sharp(path).metadata();
if(!meta.hasAlpha)throw Error('Artwork must have genuine alpha');
const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const poses=[];let transparent=0;
for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
const cuts=[0];
for(let boundary=1;boundary<3;boundary++){
 const expected=boundary*info.height/3;let best=-1,distance=Infinity;
 for(let y=Math.round(expected)-50;y<=Math.round(expected)+50;y++){
  let count=0;
  for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>100)count++;
  if(count===0 && Math.abs(y-expected)<distance){best=y;distance=Math.abs(y-expected);}
 }
 if(best<0)throw Error('No safe transparent row separation');
 cuts.push(best);
}
cuts.push(info.height);
for(let row=0;row<3;row++)for(let col=0;col<4;col++){
 const l=Math.floor(col*info.width/4),r=Math.floor((col+1)*info.width/4),t=cuts[row],b=cuts[row+1];
 let x1=r,y1=b,x2=l,y2=t,count=0;
 for(let y=t;y<b;y++)for(let x=l;x<r;x++)if(data[(y*info.width+x)*4+3]>100){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);count++;}
 if(count<1000)throw Error(`Missing figure ${poses.length}`);
 let sum=0,n=0;
 const footBand=Math.max(10,Math.round((y2-y1+1)*.08));
 for(let y=y2-footBand+1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(data[(y*info.width+x)*4+3]>100){sum+=x;n++;}
 poses.push({rect:[x1,y1,x2,y2,Math.round(sum/n*100)/100],padding:[x1-l,y1-t,r-1-x2,b-1-y2],height:y2-y1+1,pixels:count});
}
console.log(JSON.stringify({width:info.width,height:info.height,alpha:true,transparentFraction:transparent/(info.width*info.height),scale:206/Math.max(...poses.map(p=>p.height)),poses},null,2));
