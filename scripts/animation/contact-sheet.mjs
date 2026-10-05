import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
// Deterministic inspection output; never supplies art approval.
export async function contactSheets(frames, canvas, directory, detail) {
  await mkdir(directory,{recursive:true});const artifacts=[];
  for(const theme of ['light','dark'])for(const crop of [null,detail]) {
    if(!crop&&detail===null&&artifacts.some(a=>a.theme===theme))continue;
    const width=crop?218:192,height=crop?284:192,label=24,cols=9,rows=Math.ceil(frames.length/cols),background=theme==='light'?'#f4f1e9':'#181e25';
    const tiles=[];
    for(const [i,file]of frames.entries()) {
      const input=sharp(await readFile(file));if(crop)input.extract(crop);
      tiles.push({input:await input.resize(width,height,{fit:'contain'}).png().toBuffer(),left:(i%cols)*width,top:Math.floor(i/cols)*(height+label)});
      const text=`<svg width="${width}" height="${label}"><text x="8" y="18" fill="${theme==='light'?'#181e25':'#f4f1e9'}" font-size="16">${i}</text></svg>`;
      tiles.push({input:Buffer.from(text),left:(i%cols)*width,top:Math.floor(i/cols)*(height+label)+height});
    }
    const file=resolve(directory,`${crop?'arm':'whole'}-${theme}.png`);
    const output=await sharp({create:{width:cols*width,height:rows*(height+label),channels:4,background}}).composite(tiles).png().toBuffer();
    try {if(!(await readFile(file)).equals(output))throw Error('contact_sheet_output_conflict');}
    catch(error){if(error.code!=='ENOENT')throw error;await writeFile(file,output,{flag:'wx'});}
    artifacts.push({file,theme,detail:!!crop,canvas});
  }
  return artifacts;
}
