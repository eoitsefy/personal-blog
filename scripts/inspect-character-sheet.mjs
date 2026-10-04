// Read-only registration measurement. Never edits/resizes generated PNG assets.
import sharp from 'sharp';
const path=process.argv[2];
if(!path)throw Error('Pass a sprite sheet path');
const columns=Number(process.argv[3] || 4), rows=Number(process.argv[4] || 3);
if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns*rows>100)throw Error('Invalid grid');
const meta=await sharp(path).metadata();
if(!meta.hasAlpha)throw Error('Artwork must have genuine alpha');
const {data,info}=await sharp(path).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const poses=[];let transparent=0;
for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
const cuts=[0];
for(let boundary=1;boundary<rows;boundary++){
 const expected=boundary*info.height/rows;let best=-1,distance=Infinity;
 const radius=Math.min(150,Math.floor(info.height/rows*.45));
 for(let y=Math.max(0,Math.round(expected)-radius);y<Math.min(info.height,Math.round(expected)+radius);y++){
  let count=0;
  for(let x=0;x<info.width;x++)if(data[(y*info.width+x)*4+3]>100)count++;
  if(count===0 && Math.abs(y-expected)<distance){best=y;distance=Math.abs(y-expected);}
 }
 if(best<0)throw Error('No safe transparent row separation');
 cuts.push(best);
}
cuts.push(info.height);
const columnCuts=[0];
for(let boundary=1;boundary<columns;boundary++){
 const expected=boundary*info.width/columns;let best=-1,distance=Infinity;
 const radius=Math.min(100,Math.floor(info.width/columns*.4));
 for(let x=Math.max(0,Math.round(expected)-radius);x<Math.min(info.width,Math.round(expected)+radius);x++){
  let count=0;
  for(let y=0;y<info.height;y++)if(data[(y*info.width+x)*4+3]>100)count++;
  if(count===0 && Math.abs(x-expected)<distance){best=x;distance=Math.abs(x-expected);}
 }
 if(best<0)throw Error('No safe transparent column separation');
 columnCuts.push(best);
}
columnCuts.push(info.width);
for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
 const l=columnCuts[col],r=columnCuts[col+1],t=cuts[row],b=cuts[row+1];
 let x1=r,y1=b,x2=l,y2=t,count=0;
 for(let y=t;y<b;y++)for(let x=l;x<r;x++)if(data[(y*info.width+x)*4+3]>100){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);count++;}
 if(count<1000)throw Error(`Missing figure ${poses.length}`);
 let sum=0,n=0;
 const footBand=Math.max(10,Math.round((y2-y1+1)*.08));
 for(let y=y2-footBand+1;y<=y2;y++)for(let x=x1;x<=x2;x++)if(data[(y*info.width+x)*4+3]>100){sum+=x;n++;}
 poses.push({rect:[x1,y1,x2,y2,Math.round(sum/n*100)/100],padding:[x1-l,y1-t,r-1-x2,b-1-y2],height:y2-y1+1,pixels:count});
}
console.log(JSON.stringify({width:info.width,height:info.height,columns,rows,alpha:true,transparentFraction:transparent/(info.width*info.height),scale:206/Math.max(...poses.map(p=>p.height)),poses},null,2));
