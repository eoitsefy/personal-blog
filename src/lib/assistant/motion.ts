// Skin-neutral drawing brief and timing. No sprite paths, crops or rig joints.
// 15 fps is the target for FUTURE genuine drawings, not the count of v4 assets.
export const MOTION_AUTHORING_FPS = 15;
const actionTimes = [...Array.from({ length: 12 }, (_, i) => i / 12), .975];
export const CHARACTER_MOTION_TEMPLATES = {
  idle: { label: "待机", duration: 6000, loop: true,
    offsets: [0, .8, .816, .832, .848, .864, .88, .896, .912, .928, .944, .96, .985],
    stages: ["双臂下垂、睁眼", "眼神放松", "眼睑下降15%", "眼睑下降30%", "半闭眼", "闭眼70%", "闭眼", "睁开30%", "睁开50%", "睁开70%", "睁开85%", "完全睁眼"] },
  wave: { label: "挥手", duration: 1800, loop: false, offsets: actionTimes,
    stages: ["双臂下垂", "手臂稍抬", "前臂抬起", "屈肘至胸前", "手掌至肩部", "张掌至脸侧", "手掌轻转向外", "手掌轻转向内", "脸侧放松", "放手至胸前", "手臂接近垂下", "双臂下垂"] },
  nod: { label: "点头", duration: 1500, loop: false, offsets: actionTimes,
    stages: ["正面中立", "下巴稍低", "低头5度", "低头10度", "低头15度", "低头18度", "保持低头、柔和闭眼", "抬至15度", "抬至10度", "抬至5度", "接近中立", "正面中立"] },
  thinking: { label: "思考", duration: 2400, loop: true, offsets: actionTimes,
    stages: ["双臂下垂", "前臂稍抬", "抬起前臂", "弯肘", "指尖至胸前", "指尖接近下巴", "触碰下巴", "托腮思考", "手离开下巴", "前臂降至中段", "手臂接近垂下", "双臂下垂"] },
  bow: { label: "鞠躬", duration: 2000, loop: false, offsets: actionTimes,
    stages: ["直立中立", "上身前倾3度", "前倾6度", "前倾9度", "前倾12度", "前倾15度", "前倾18度", "起身至15度", "起身至12度", "起身至9度", "起身至4度", "直立中立"] },
  cheer: { label: "开心", duration: 1800, loop: false, offsets: actionTimes,
    stages: ["双臂下垂", "双肘稍弯", "前臂稍抬", "双手至腰前", "双手至胸下", "小拳头至胸前", "微笑轻抬双手", "柔和笑眼", "放松微笑、手开始落下", "前臂至腰前", "双手接近垂下", "下垂中立微笑"] },
  yawn: { label: "打哈欠", duration: 2600, loop: false, offsets: actionTimes,
    stages: ["双臂下垂", "困倦眼睑、微张嘴", "一只前臂抬起", "手接近嘴", "手掩嘴、眼睛收窄", "掩嘴开始哈欠", "闭眼、掩嘴完整哈欠", "哈欠放松", "闭嘴半睁眼、手稍离开", "前臂下降一半", "手臂几乎垂下、睁眼", "双臂下垂中立"] },
} as const;
export type MotionAction = keyof typeof CHARACTER_MOTION_TEMPLATES;

export function motionDrawingPlan(action: MotionAction) {
  const template = CHARACTER_MOTION_TEMPLATES[action];
  return {
    fps: MOTION_AUTHORING_FPS,
    frameCount: Math.ceil(template.duration * MOTION_AUTHORING_FPS / 1000),
    // Exact time points are portable across character designs. Resting holds are
    // intentional; repeated held drawings must never be counted as new poses.
    keyPoses: template.stages.map((stage, i) => ({
      stage, offset: template.offsets[i], timeMs: template.offsets[i] * template.duration,
    })),
    end: { stage: "回到双臂自然下垂的中立姿态", offset: template.offsets[12] },
  };
}
