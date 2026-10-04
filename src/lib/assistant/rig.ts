import { CHARACTER_ACTIONS, type CharacterAction } from "./character";

export type RigSkinId = "gold" | "mist";
export type Rect = readonly [number, number, number, number];
export const RIG_PARTS = ["head", "torso", "upperLeft", "upperRight", "lowerLeft", "lowerRight", "legLeft", "legRight", "eyeLeft", "eyeRight", "closedLeft", "closedRight", "handLeft", "handRight", "smile", "mouth"] as const;
export type RigPart = typeof RIG_PARTS[number];
export type RigSkin = { label: string; src: string; width: number; height: number; parts: readonly Rect[] };
// Independently measured alpha bounds, NOT blindly divided grid cells.
export const RIG_SKINS: Record<RigSkinId, RigSkin> = {
  gold: { label: "黑金", src: "/assistant/rig-gold-v1.png", width: 1254, height: 1254, parts: [[9,27,382,327],[416,81,245,272],[748,113,108,227],[1049,114,108,224],[121,463,98,203],[450,463,97,203],[724,410,112,279],[1048,409,113,280],[68,789,167,102],[398,788,166,102],[706,832,137,44],[1039,833,137,43],[80,1003,159,196],[395,1002,158,197],[733,1092,99,19],[1058,1066,68,66]] },
  mist: { label: "雾蓝", src: "/assistant/rig-mist-v1.png", width: 1254, height: 1254, parts: [[9,26,384,328],[416,81,246,274],[742,113,114,229],[1049,113,115,229],[118,464,103,205],[449,464,102,205],[721,408,117,285],[1046,408,118,285],[67,788,169,106],[397,788,169,106],[704,831,140,46],[1038,831,139,46],[79,1003,161,198],[394,1003,160,198],[732,1091,100,21],[1056,1065,72,68]] },
};
export const RIG_STAGE = { size: 224, rootX: 112, baseline: 216, upper: 24, lower: 23 } as const;
export type Point = { x: number; y: number };
export type RigPose = { head: number; torso: number; breath: number; blink: number; mouth: number; left: Point; right: Point; wristLeft: number; wristRight: number; playing: CharacterAction };
const ease = (t: number) => { const x = Math.max(0, Math.min(1, t)); return x*x*(3-2*x); };
const pulse = (t: number, start: number, peak: number, end: number) => t < peak ? ease((t-start)/(peak-start)) : 1-ease((t-peak)/(end-peak));
const mix = (a: Point, b: Point, t: number): Point => ({x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t});
export function rigSample(action: CharacterAction, elapsed: number, still = false): RigPose {
  const config = CHARACTER_ACTIONS[action];
  const finite = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const playing = !config.loop && finite >= config.duration ? "idle" : action;
  const time = playing === action ? finite : finite-config.duration;
  const t = (time % CHARACTER_ACTIONS[playing].duration) / CHARACTER_ACTIONS[playing].duration;
  const p: RigPose = {head:0,torso:0,breath:0,blink:0,mouth:0,left:{x:-33,y:-3},right:{x:33,y:-3},wristLeft:Math.PI,wristRight:Math.PI,playing};
  if(still) return {...p,playing:"idle"};
  p.breath = .65*Math.sin(time/1100);
  p.blink = pulse(t,.84,.88,.92);
  if(playing === "wave") {
    const amount = pulse(t,0,.25,1);
    const sway = Math.sin(t*Math.PI*8)*4*amount;
    p.left = mix(p.left,{x:-46+sway,y:-91},amount);
    p.wristLeft = Math.PI*(1-amount) + Math.sin(t*Math.PI*8)*.16*amount;
    p.head = -.035*amount;
  } else if(playing === "yawn") {
    const amount = pulse(t,.02,.32,.98), hold = pulse(t,.18,.48,.83);
    p.left = mix(p.left,{x:-1,y:-63},amount);
    p.wristLeft = Math.PI*(1-amount);
    p.mouth = hold; p.blink = Math.max(p.blink,hold); p.head = -.045*hold;
  } else if(playing === "nod") {
    p.head = .07*Math.sin(t*Math.PI*4)*Math.sin(t*Math.PI);
  } else if(playing === "thinking") {
    const amount = pulse(t,0,.25,1);
    p.left = mix(p.left,{x:-8,y:-58},amount); p.wristLeft=Math.PI*(1-amount); p.head=.065*amount;
  } else if(playing === "bow") {
    const amount = pulse(t,0,.4,1); p.torso=.12*amount; p.head=.15*amount; p.blink=amount;
  } else if(playing === "cheer") {
    const amount = pulse(t,0,.35,1);
    p.left=mix(p.left,{x:-42,y:-78},amount); p.right=mix(p.right,{x:42,y:-78},amount);
    p.wristLeft=p.wristRight=Math.PI*(1-amount); p.blink=amount;
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

export function drawRig(ctx: CanvasRenderingContext2D, image: CanvasImageSource, skin: RigSkin, pose: RigPose) {
  const part=(name: RigPart,x: number,y: number,w: number,h: number,angle=0,pivotX=.5,pivotY=0,alpha=1) => {
    const rect=skin.parts[RIG_PARTS.indexOf(name)]; if(!rect || alpha<=0) return;
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle); ctx.globalAlpha=alpha;
    ctx.drawImage(image,...rect,-w*pivotX,-h*pivotY,w,h); ctx.restore();
  };
  ctx.clearRect(0,0,RIG_STAGE.size,RIG_STAGE.size);
  part("legLeft",101,170,18,46); part("legRight",123,170,18,46);
  ctx.save(); ctx.translate(112,174); ctx.rotate(pose.torso);
  // Breathing affects upper body only, never the fixed feet.
  ctx.translate(0,pose.breath);
  part("torso",0,-60,68,76);
  const arm=(side:-1|1,target:Point,wristAngle:number) => {
    const s={x:side*29,y:-47}, joints=solveArm(s,target,side),name=side<0?"Left":"Right";
    part(`upper${name}`,s.x,s.y,16,28,-joints.upperAngle,.5,.12);
    part(`lower${name}`,joints.elbow.x,joints.elbow.y,14,27,-joints.lowerAngle,.5,.1);
    part(`hand${name}`,joints.wrist.x,joints.wrist.y,15,19,wristAngle,.5,.93);
  };
  // Arms below the head on neutral pose, but hands must cover the mouth when raised.
  ctx.save(); ctx.translate(0,-54); ctx.rotate(pose.head);
  part("head",0,0,132,113,0,.5,1);
  for(const side of ["Left","Right"] as const) {
    const x=side==="Left"?-14:14;
    part(`eye${side}`,x,-34,24,14*Math.max(.04,1-pose.blink),0,.5,0,1-pose.blink);
    part(`closed${side}`,x,-29,24,7,0,.5,0,pose.blink);
  }
  part("smile",0,-16,11,2,0,.5,0,1-pose.mouth);
  part("mouth",0,-19,11,4+pose.mouth*9,0,.5,0,pose.mouth);
  ctx.restore();
  arm(-1,pose.left,pose.wristLeft); arm(1,pose.right,pose.wristRight);
  ctx.restore();
}
