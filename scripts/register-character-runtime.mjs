// Read-only source measurement. Outputs compact registration data, never edits PNGs.
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {CHARACTER_SHEETS, CHARACTER_POSES, CHARACTER_ACTIONS} from '../src/lib/assistant/character.ts';
const pack=JSON.parse(await readFile('docs/assistant/chibi-v5-inbetween-registration.json','utf8'));
const sources={original:{...CHARACTER_SHEETS.idle,poses:CHARACTER_POSES[CHARACTER_ACTIONS.idle.row].map(rect=>({rect}))},...pack.sheets};
const result={};
for(const [key,sheet] of Object.entries(sources)){
  const {data,info}=await sharp('public'+sheet.src).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const poses=sheet.poses.map(({rect})=>{
    const [x,y,right,bottom]=rect,band=Math.round((bottom-y+1)*.13);
    let leftFoot=right,rightFoot=x;
    for(let py=bottom-band+1;py<=bottom;py++)for(let px=x;px<=right;px++)if(data[(py*info.width+px)*4+3]>100){leftFoot=Math.min(leftFoot,px);rightFoot=Math.max(rightFoot,px);}
    // Retain soft edge pixels, while the solid soles define an independent root.
    const left=Math.max(0,x-2),top=Math.max(0,y-2),r=Math.min(info.width-1,right+2),b=Math.min(info.height-1,bottom+2);
    return [left,top,r,b,(leftFoot+rightFoot)/2,bottom+1];
  });
  result[key]={src:sheet.src,width:sheet.width,height:sheet.height,scale:sheet.scale,poses};
}
console.log(JSON.stringify(result));
