import { CHARACTER_ACTIONS, type CharacterAction } from "./character";

export type RigSkinId = "gold" | "mist";
export type Rect = readonly [number, number, number, number];
export type Point = { x: number; y: number };
export const RIG_PARTS = ["head", "torso", "upperLeft", "upperRight", "lowerLeft", "lowerRight", "legLeft", "legRight", "eyeLeft", "eyeRight", "closedLeft", "closedRight", "handLeft", "handRight", "smile", "mouth", "waveLeft", "waveRight"] as const;
export type RigPart = typeof RIG_PARTS[number];
type ArmPart = "upperLeft" | "upperRight" | "lowerLeft" | "lowerRight";
// Normalized source anchors and cloth-only crop. Skin-coloured cut faces are
// construction guides, not exposed elbow/shoulder artwork.
export type RigJoint = { from: Point; to: Point; cloth: Rect };
export type RigGeometry = {
  version: "identity-v2"; rootY: number; headWidth: number; headBottom: number;
  torsoWidth: number; torsoTop: number; legHeight: number; legSeparation: number;
  shoulder: Point; upper: number; lower: number; eyeX: number; eyeY: number;
  eyeWidth: number; closedY: number; handHeight: number; waveHeight: number;
};
export type RigSkin = {
  label: string; src: string; width: number; height: number; parts: readonly Rect[];
  geometry: RigGeometry; joints: Record<ArmPart, RigJoint>;
};
export const RIG_STAGE = { size: 224, rootX: 112, baseline: 216, upper: 24, lower: 23 } as const;
// Calibrated against the original idle-v4 first frame: ~128px head, round eyes,
// relaxed small hands and a ~206px total silhouette. These are skin geometry,
// not motion-template parameters; a new body proportion must be calibrated here.
export const RIG_GEOMETRY: RigGeometry = {
  version: "identity-v2", rootY: 174, headWidth: 128, headBottom: -57,
  torsoWidth: 58, torsoTop: -65, legHeight: 48, legSeparation: 14.5,
  shoulder: { x: 27, y: -47 }, upper: 20.5, lower: 19.5,
  eyeX: 18, eyeY: -36, eyeWidth: 26, closedY: -25,
  handHeight: 9.5, waveHeight: 19,
};
const joints: Record<ArmPart, RigJoint> = {
  upperLeft: { from: { x: .65, y: .21 }, to: { x: .39, y: .82 }, cloth: [0, .19, 1, .66] },
  upperRight: { from: { x: .35, y: .21 }, to: { x: .61, y: .82 }, cloth: [0, .19, 1, .66] },
  lowerLeft: { from: { x: .70, y: .24 }, to: { x: .49, y: .88 }, cloth: [0, .21, 1, .71] },
  lowerRight: { from: { x: .30, y: .24 }, to: { x: .51, y: .88 }, cloth: [0, .21, 1, .71] },
};
// Independently measured alpha bounds, NOT blindly divided grid cells.
export const RIG_SKINS: Record<RigSkinId, RigSkin> = {
  gold: { label: "黑金", src: "/assistant/rig-gold-v2.png", width: 1199, height: 1312,
    parts: [[24,25,390,319],[454,89,200,260],[729,130,114,172],[1064,130,114,172],[88,438,109,178],[421,439,110,178],[681,412,110,226],[1013,413,110,225],[64,721,185,136],[383,721,180,134],[645,792,154,44],[974,787,157,46],[96,931,110,128],[395,928,109,130],[706,997,88,22],[1024,966,83,66],[71,1119,143,148],[379,1120,146,144]], geometry: RIG_GEOMETRY, joints },
  mist: { label: "雾蓝", src: "/assistant/rig-mist-v2.png", width: 1199, height: 1312,
    parts: [[22,24,397,322],[454,89,200,261],[728,129,115,175],[1064,129,116,174],[86,436,113,181],[420,437,113,180],[681,411,112,229],[1012,412,112,228],[63,720,188,135],[380,720,184,134],[644,791,157,45],[973,787,158,47],[96,930,112,129],[394,928,111,130],[705,996,88,25],[1024,965,84,70],[70,1119,146,148],[377,1119,148,147]], geometry: RIG_GEOMETRY, joints },
};
export type RigPose = {
  head: number; torso: number; breath: number; blink: number; mouth: number;
  left: Point; right: Point; wristLeft: number; wristRight: number;
  leftGesture: number; rightGesture: number; playing: CharacterAction;
};
const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x*x*(3-2*x); };
const pulse = (t: number, start: number, peak: number, end: number) => t < peak ? ease((t-start)/(peak-start)) : 1-ease((t-peak)/(end-peak));
const mix = (a: Point, b: Point, t: number): Point => ({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t});
export function rigSample(action: CharacterAction, elapsed: number, still = false): RigPose {
  const config = CHARACTER_ACTIONS[action];
  const finite = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const playing = !config.loop && finite >= config.duration ? "idle" : action;
  const time = playing === action ? finite : finite-config.duration;
  const t = (time % CHARACTER_ACTIONS[playing].duration) / CHARACTER_ACTIONS[playing].duration;
  const p: RigPose = {head:0,torso:0,breath:0,blink:0,mouth:0,left:{x:-34,y:-8},right:{x:34,y:-8},wristLeft:0,wristRight:0,leftGesture:0,rightGesture:0,playing};
  if(still) return {...p,playing:"idle"};
  p.breath = .65*Math.sin(time/1100);
  p.blink = pulse(t,.84,.88,.92);
  if(playing === "wave") {
    const amount = pulse(t,0,.25,1);
    const sway = Math.sin(t*Math.PI*8)*4*amount;
    p.left = mix(p.left,{x:-46+sway,y:-91},amount);
    p.wristLeft = Math.PI*amount + Math.sin(t*Math.PI*8)*.16*amount;
    p.leftGesture = amount; p.head = -.035*amount;
  } else if(playing === "yawn") {
    // Hold the raised hand through the open-mouth phase, then lower it.
    const amount = ease((t-.02)/.22)*(1-ease((t-.75)/.23)), hold = pulse(t,.18,.48,.83);
    p.left = mix(p.left,{x:0,y:-63},amount);
    p.wristLeft = Math.PI*amount; p.leftGesture = amount;
    p.mouth = hold; p.blink = Math.max(p.blink,hold); p.head = -.045*hold;
  } else if(playing === "nod") {
    p.head = .07*Math.sin(t*Math.PI*4)*Math.sin(t*Math.PI);
  } else if(playing === "thinking") {
    const amount = pulse(t,0,.25,1);
    p.left = mix(p.left,{x:-8,y:-58},amount); p.wristLeft=Math.PI*amount; p.head=.065*amount;
  } else if(playing === "bow") {
    const amount = pulse(t,0,.4,1); p.torso=.12*amount; p.head=.15*amount; p.blink=amount;
  } else if(playing === "cheer") {
    const amount = pulse(t,0,.35,1);
    p.left=mix(p.left,{x:-42,y:-78},amount); p.right=mix(p.right,{x:42,y:-78},amount);
    p.wristLeft=p.wristRight=Math.PI*amount;
    p.leftGesture=p.rightGesture=amount; p.blink=amount;
  }
  return p;
}

// Two-bone inverse kinematics. Only arm segments rotate; feet/root never move.
export function solveArm(shoulder: Point, target: Point, side: -1 | 1, upper: number = RIG_STAGE.upper, lower: number = RIG_STAGE.lower) {
  const dx=target.x-shoulder.x,dy=target.y-shoulder.y,raw=Math.hypot(dx,dy);
  const distance=Math.max(Math.abs(upper-lower)+.01,Math.min(upper+lower-.01,raw));
  const ux=raw ? dx/raw : 0,uy=raw ? dy/raw : 1;
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  const height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const elbow={x:shoulder.x+ux*along+side*uy*height,y:shoulder.y+uy*along-side*ux*height};
  const wrist={x:shoulder.x+ux*distance,y:shoulder.y+uy*distance};
  return {elbow,wrist,upperAngle:Math.atan2(elbow.x-shoulder.x,elbow.y-shoulder.y),lowerAngle:Math.atan2(wrist.x-elbow.x,wrist.y-elbow.y)};
}

// Eyelids conceal the original, fully opaque eye without squeezing its iris or
// fading two complete eye paintings over one another (the "sunglasses" state).
export function rigEyeMask(geometry: RigGeometry, rect: Rect, amount: number) {
  const blink=Math.max(0,Math.min(1,Number.isFinite(amount)?amount:0));
  const height=rect[3]*geometry.eyeWidth/rect[2];
  return {openTop:geometry.eyeY+height*blink,openHeight:height*(1-blink),
    lidTop:geometry.closedY-height*(1-blink),lidReveal:ease(blink/.2)};
}

export function drawRig(ctx: CanvasRenderingContext2D, image: CanvasImageSource, skin: RigSkin, pose: RigPose) {
  const g=skin.geometry;
  const rectFor=(name: RigPart)=>skin.parts[RIG_PARTS.indexOf(name)];
  // Exactly one scale for both axes: artwork is never independently stretched.
  const part=(name: RigPart,x: number,y: number,size: number,byHeight=false,angle=0,pivotX=.5,pivotY=0,alpha=1) => {
    const rect=rectFor(name); if(!rect || alpha<=0) return;
    const scale=size/rect[byHeight?3:2],w=rect[2]*scale,h=rect[3]*scale;
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.globalAlpha=alpha;
    ctx.drawImage(image,...rect,-w*pivotX,-h*pivotY,w,h); ctx.restore();
  };
  const segment=(name: ArmPart,from: Point,to: Point)=>{
    const rect=rectFor(name),mount=skin.joints[name];
    const a={x:mount.from.x*rect[2],y:mount.from.y*rect[3]},b={x:mount.to.x*rect[2],y:mount.to.y*rect[3]};
    const scale=Math.hypot(to.x-from.x,to.y-from.y)/Math.hypot(b.x-a.x,b.y-a.y);
    const angle=Math.atan2(to.y-from.y,to.x-from.x)-Math.atan2(b.y-a.y,b.x-a.x);
    ctx.save();ctx.translate(from.x,from.y);ctx.rotate(angle);
    const [cx,cy,cw,ch]=mount.cloth;
    ctx.beginPath();ctx.rect((cx*rect[2]-a.x)*scale,(cy*rect[3]-a.y)*scale,cw*rect[2]*scale,ch*rect[3]*scale);ctx.clip();
    ctx.drawImage(image,...rect,-a.x*scale,-a.y*scale,rect[2]*scale,rect[3]*scale);ctx.restore();
  };
  ctx.clearRect(0,0,RIG_STAGE.size,RIG_STAGE.size);
  part("legLeft",RIG_STAGE.rootX-g.legSeparation,RIG_STAGE.baseline,g.legHeight,true,0,.5,1);
  part("legRight",RIG_STAGE.rootX+g.legSeparation,RIG_STAGE.baseline,g.legHeight,true,0,.5,1);
  ctx.save();ctx.translate(RIG_STAGE.rootX,g.rootY);ctx.rotate(pose.torso);
  // Upper-body breathing never moves the fixed feet.
  ctx.translate(0,pose.breath);
  const arm=(side:-1|1,target:Point)=>{
    const shoulder={x:side*g.shoulder.x,y:g.shoulder.y};
    const joint=solveArm(shoulder,target,side,g.upper,g.lower),name=side<0?"Left":"Right";
    segment(`upper${name}`,shoulder,joint.elbow);segment(`lower${name}`,joint.elbow,joint.wrist);
    return joint.wrist;
  };
  // Sleeves behind the sleeveless torso; hands in front can cover the mouth.
  const left=arm(-1,pose.left),right=arm(1,pose.right);
  part("torso",0,g.torsoTop,g.torsoWidth);
  ctx.save();ctx.translate(0,g.headBottom);ctx.rotate(pose.head);
  part("head",0,0,g.headWidth,false,0,.5,1);
  for(const side of ["Left","Right"] as const) {
    const x=side==="Left"?-g.eyeX:g.eyeX;
    const eye=rectFor(`eye${side}`),lid=rectFor(`closed${side}`),mask=rigEyeMask(g,eye,pose.blink);
    if(mask.openHeight>.01){
      ctx.save();ctx.beginPath();ctx.rect(x-g.eyeWidth/2,mask.openTop,g.eyeWidth,mask.openHeight);ctx.clip();
      part(`eye${side}`,x,g.eyeY,g.eyeWidth);ctx.restore();
    }
    if(mask.lidReveal>0){
      // Reveal the eyelid from its centre in the very first closing phase;
      // the source is always drawn at its unmodified aspect ratio and opacity.
      const lidHeight=lid[3]*g.eyeWidth/lid[2],width=g.eyeWidth*mask.lidReveal;
      ctx.save();ctx.beginPath();ctx.rect(x-width/2,mask.lidTop,width,lidHeight);ctx.clip();
      part(`closed${side}`,x,mask.lidTop,g.eyeWidth);ctx.restore();
    }
  }
  part("smile",0,-12,11,false,0,.5,0,1-pose.mouth);
  part("mouth",0,-16,7+4*pose.mouth,false,0,.5,0,pose.mouth);
  ctx.restore();
  const hand=(name:"Left"|"Right",at:Point,angle:number,gesture:number)=>{
    part(`hand${name}`,at.x,at.y,g.handHeight,true,angle,.5,.04,1-gesture);
    part(`wave${name}`,at.x,at.y,g.waveHeight,true,angle,.5,.04,gesture);
  };
  hand("Left",left,pose.wristLeft,pose.leftGesture);hand("Right",right,pose.wristRight,pose.rightGesture);
  ctx.restore();
}
