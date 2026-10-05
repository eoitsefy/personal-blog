// Deterministic single-matte reconstruction for offline RIFE experiments.
// Palette fitting is not a semantic art approval; ghosts still require review.
export const green = [0,255,0];
export function foregroundPalette(frames, isEditable, size) {
  const colors = new Map();
  for (const frame of frames) for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    const p=(y*size+x)*4;
    if (!isEditable(x,y) || frame[p+3]<245) continue;
    const color=[frame[p],frame[p+1],frame[p+2]], code=color.map(c=>Math.floor(c/8)).join(',');
    const sum=colors.get(code)??{count:0,rgb:[0,0,0]};
    sum.count++;color.forEach((c,i)=>{sum.rgb[i]+=c;});colors.set(code,sum);
  }
  return [...colors.values()].sort((a,b)=>b.count-a.count).slice(0,512).map(({count,rgb})=>rgb.map(c=>Math.round(c/count)));
}
export function fitForeground(observed, palette) {
  // Least-squares projection onto each known foreground-to-green segment.
  // This preserves color and alpha from the SAME optical-flow prediction.
  let best=null, error=Infinity;
  for (const fg of palette) {
    const d=fg.map((c,i)=>c-green[i]);
    const denom=d.reduce((s,v)=>s+v*v,0);
    if (!denom) continue;
    const a=Math.max(0,Math.min(1,d.reduce((s,v,i)=>s+v*(observed[i]-green[i]),0)/denom));
    const e=d.reduce((s,v,i)=>s+(green[i]+a*v-observed[i])**2,0);
    if(e<error){error=e;best={foreground:fg,alpha:a,error:e};}
  }
  if(!best)throw Error('empty_foreground_palette');
  return best;
}
export function recoverMatte(observed, foreground) {
  const fit=fitForeground(observed,[foreground]), a=fit.alpha;
  if(a<8/255)return [0,0,0,0];
  return [...observed.map((c,i)=>Math.max(0,Math.min(255,Math.round((c-green[i]*(1-a))/a)))),Math.round(a*255)];
}
