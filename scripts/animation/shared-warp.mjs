// Offline full-frame deformation, not runtime layers or anatomical rigging.
// Both color and alpha sample the identical inverse spatial map. Bad landmark
// correspondences can still fold geometry: every whole sequence needs art review.
const radial = r2 => r2 < 1e-12 ? 0 : r2 * Math.log(r2);
function solve(matrix, vector) {
  const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
  for(let c=0;c<n;c++) {
    let pivot=c;for(let r=c+1;r<n;r++)if(Math.abs(a[r][c])>Math.abs(a[pivot][c]))pivot=r;
    if(Math.abs(a[pivot][c])<1e-10)throw Error('warp_degenerate_landmarks');
    [a[c],a[pivot]]=[a[pivot],a[c]];const scale=a[c][c];for(let j=c;j<=n;j++)a[c][j]/=scale;
    for(let r=0;r<n;r++)if(r!==c){const w=a[r][c];for(let j=c;j<=n;j++)a[r][j]-=w*a[c][j];}
  }
  return a.map(row=>row[n]);
}
export function inverseMap(target,source,width,height) {
  if(!Array.isArray(target)||target.length<3||target.length!==source.length||target.length>32)throw Error('warp_landmark_count');
  for(const points of [target,source])for(const point of points)if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<0||point[1]<0||point[0]>=width||point[1]>=height)throw Error('warp_landmark_out_of_canvas');
  const normal=target.map(([x,y])=>[x/width,y/height]),n=normal.length,matrix=Array.from({length:n+3},()=>Array(n+3).fill(0));
  for(let i=0;i<n;i++) {
    for(let j=0;j<n;j++)matrix[i][j]=radial((normal[i][0]-normal[j][0])**2+(normal[i][1]-normal[j][1])**2);
    matrix[i][n]=matrix[n][i]=1;matrix[i][n+1]=matrix[n+1][i]=normal[i][0];matrix[i][n+2]=matrix[n+2][i]=normal[i][1];
  }
  const x=solve(matrix,[...source.map(p=>p[0]/width),0,0,0]),y=solve(matrix,[...source.map(p=>p[1]/height),0,0,0]);
  return (px,py)=>{
    const nx=px/width,ny=py/height;
    let sx=x[n]+x[n+1]*nx+x[n+2]*ny,sy=y[n]+y[n+1]*nx+y[n+2]*ny;
    for(let i=0;i<n;i++){const weight=radial((nx-normal[i][0])**2+(ny-normal[i][1])**2);sx+=x[i]*weight;sy+=y[i]*weight;}
    return [sx*width,sy*height];
  };
}
function premultipliedSample(data,mask,width,height,x,y) {
  const result=[0,0,0,0],left=Math.floor(x),top=Math.floor(y),fx=x-left,fy=y-top;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
    const px=left+dx,py=top+dy;if(px<0||py<0||px>=width||py>=height)continue;
    const p=(py*width+px)*4;if(mask[p+3]<128)continue;
    const weight=(dx?fx:1-fx)*(dy?fy:1-fy),alpha=data[p+3]/255;
    for(let c=0;c<3;c++)result[c]+=data[p+c]*alpha*weight;result[3]+=alpha*weight;
  }
  return result;
}
export function warpBetween(from,to,mask,width,height,fromPoints,toPoints,t) {
  if(!Number.isFinite(t)||t<0||t>1)throw Error('warp_fraction_out_of_range');
  if(from.length!==width*height*4||to.length!==from.length||mask.length!==from.length)throw Error('warp_buffer_size');
  if(t===0)return Buffer.from(from);if(t===1)return Buffer.from(to);
  if(!Array.isArray(fromPoints)||fromPoints.length!==toPoints.length)throw Error('warp_landmark_count');
  const middle=fromPoints.map(([x,y],i)=>[x*(1-t)+toPoints[i][0]*t,y*(1-t)+toPoints[i][1]*t]);
  const mapA=inverseMap(middle,fromPoints,width,height),mapB=inverseMap(middle,toPoints,width,height),out=Buffer.from(from);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const p=(y*width+x)*4;if(mask[p+3]<128)continue;
    const a=premultipliedSample(from,mask,width,height,...mapA(x,y)),b=premultipliedSample(to,mask,width,height,...mapB(x,y));
    const alpha=a[3]*(1-t)+b[3]*t;
    for(let c=0;c<3;c++)out[p+c]=alpha?Math.max(0,Math.min(255,Math.round((a[c]*(1-t)+b[c]*t)/alpha))):0;
    out[p+3]=Math.round(alpha*255);
  }
  return out;
}
