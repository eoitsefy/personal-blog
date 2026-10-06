// Deterministic edits to the established SVG eyelid curves, not new character art.
import sharp from 'sharp';
export const EYE_POLYGONS = [
  [[308,334],[313,321],[325,312],[352,313],[371,330],[373,354],[365,364],[338,368],[312,352]],
  [[394,326],[400,311],[413,303],[438,303],[456,319],[458,348],[448,356],[425,362],[398,346]],
];
export const BLINK_INDICES = [...new Set([...Array.from({length:61},(_,i)=>i*2),37,39,41,43,45,47,49])].sort((a,b)=>a-b);
export function insideEye(x,y) {return EYE_POLYGONS.some(points=>{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const[xi,yi]=points[i],[xj,yj]=points[j];if(((yi>y)!==(yj>y))&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;});}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function closureAt(frame){if(frame<=36||frame>=49)return 0;if(frame<=41)return smooth((frame-36)/5);if(frame<=43)return 1;return 1-smooth((frame-43)/6);}
const lids=[{x0:317,x1:363,open:[336,321,318,336],closed:[350,358,358,348]},
  {x0:403,x1:450,open:[322,307,307,324],closed:[343,350,348,340]}];
const cubic=(v,t)=>(1-t)**3*v[0]+3*(1-t)**2*t*v[1]+3*(1-t)*t*t*v[2]+t**3*v[3];
export function lineStyle(closure){
  const rgb=[36,27,25].map((c,i)=>Math.round(c+([73,53,44][i]-c)*closure));
  return {width:3.8-1.8*closure,opacity:1,color:'#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join('')};
}
export async function refineEye(source,open,skin,frame){
  const closure=closureAt(frame);
  if(!closure)return Buffer.from(source);
  const pixels=Buffer.from(source),paths=[],style=lineStyle(closure);
  for(const lid of lids){
    const v=lid.open.map((n,i)=>n+(lid.closed[i]-n)*closure);
    for(let y=300;y<369;y++)for(let x=305;x<460;x++)if(insideEye(x+.5,y+.5)&&x>=lid.x0-10&&x<=lid.x1+10){
      const n=(y*768+x)*4,t=Math.max(0,Math.min(1,(x+.5-lid.x0)/(lid.x1-lid.x0)));
      const edge=cubic(v,t),upper=Math.max(0,Math.min(1,edge+style.width*.5-y+.5));
      // Near closure, cover the last lower iris/white fragment as well. A
      // continuous fade avoids a one-frame gold sliver or a second lower line.
      const lower=smooth((closure-.65)/.22),cover=Math.max(upper,lower);
      for(let c=0;c<3;c++)pixels[n+c]=Math.round(open[n+c]*(1-cover)+skin[n+c]*cover);
    }
    paths.push(`<path d="M${lid.x0} ${v[0]} C${lid.x0+18} ${v[1]} ${lid.x1-18} ${v[2]} ${lid.x1} ${v[3]}"/>`);
  }
  const svg=Buffer.from(`<svg width="768" height="768"><g fill="none" stroke="${style.color}" stroke-width="${style.width}" stroke-opacity="${style.opacity}" stroke-linecap="round">${paths.join('')}</g></svg>`);
  const result=await sharp(pixels,{raw:{width:768,height:768,channels:4}}).composite([{input:svg}]).raw().toBuffer();
  // Preserve the original tapered open-eye ink at the start/end. Only the
  // eye-local finish is eased in, not the whole figure or its registration.
  const finishMix=smooth(closure/.18);
  for(let y=0;y<768;y++)for(let x=0;x<768;x++){
    const n=(y*768+x)*4;
    if(!insideEye(x+.5,y+.5))source.copy(result,n,n,n+4);
    else for(let c=0;c<3;c++)result[n+c]=Math.round(open[n+c]*(1-finishMix)+result[n+c]*finishMix);
    result[n+3]=source[n+3];
  }
  return result;
}
