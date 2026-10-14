import { H3_CLIPS, H3_MOTION, type H3Clip } from "./h3-motion";
import { H3_REST_AFTER_MS, H3_SCENES, H3_SIP_AFTER_MS } from "./h3-presence";
import { BEHAVIOR_TIMING } from "./behavior";

export type ActionGroup="basic"|"night"|"day";
export const ACTION_GROUPS:{id:ActionGroup;label:string}[]=[{id:"basic",label:"基础动作"},{id:"night",label:"夜间睡眠"},{id:"day",label:"日间休闲"}];
export const ACTION_GROUP_CLIPS:Record<ActionGroup,readonly H3Clip[]>={
  basic:H3_CLIPS.slice(0,7),night:H3_CLIPS.slice(7,16),day:H3_CLIPS.slice(16),
};
const seconds=(ms:number)=>`${ms/1000} 秒`;
const basicTriggers:Partial<Record<H3Clip,string>>={
  "idle-blink":"无其他动作时自动呼吸、眨眼。",
  wave:`进入网站自动挥手；打开聊天或说“你好”时回应。打开聊天的问候间隔 ${seconds(BEHAVIOR_TIMING.greetingCooldown)}。`,
  nod:`浏览时停留 ${seconds(BEHAVIOR_TIMING.readingDwell)} 并向下滚动后轻点头；有依据的问答也可触发。阅读反馈间隔 ${seconds(BEHAVIOR_TIMING.readingCooldown)}。`,
  thanks:"在聊天中单独说“谢谢”“感谢你”“辛苦了”，本地致谢回应，不依赖 AI 检索。",
  thinking:`提交需检索的问题，等待超过 ${seconds(BEHAVIOR_TIMING.thinkingDelay)} 后排入思考；回复很快时会跳过，不故意拖慢回答。`,
  cheer:"在聊天中单独说“加油”“鼓励我一下”“太好了”，本地鼓励回应，不依赖 AI 检索。",
  yawn:`与助手无互动 ${seconds(BEHAVIOR_TIMING.idleDelay)} 后打哈欠；不在等待回复时触发。`,
};
const contexts:Partial<Record<H3Clip,[string,string]>>={
  "bed-pull":["原装站立","床已拉入"],"bed-change":["床旁原装","床旁睡衣"],
  "headset-off":["睡衣戴耳麦","耳麦放到一旁"],"bed-enter":["床侧站立、已摘耳麦","躺下准备睡眠"],
  "sleep-loop":["睡衣、耳麦放旁、躺床","保持睡眠"],"bed-wake":["躺床睡眠","从床侧起身"],
  "headset-on":["睡衣、已起床","重新戴上耳麦"],"bed-change-back":["床旁睡衣、已戴耳麦","换回原装"],
  "bed-remove":["原装、床在旁","移走床并回站姿"],
  "beach-props":["原装站立","布置遮阳伞与躺椅"],"beach-change":["原装、道具就绪","休闲装站立"],
  "beach-sit":["休闲装、椅旁站立","坐入躺椅"],"beach-loop":["休闲装躺椅休息","保持休闲"],
  "coconut-sip":["休闲装躺椅休息","喝椰子后继续休闲"],"beach-stand":["休闲装躺椅休息","站到椅旁"],
  "beach-change-back":["休闲装站立","换回原装"],"beach-remove":["原装、道具在旁","道具移出后回站姿"],
};
export function actionInfo(clip:H3Clip) {
  const group=ACTION_GROUPS.find(g=>ACTION_GROUP_CLIPS[g.id].includes(clip))!.id;
  const motion=H3_MOTION.clips[clip];
  const trigger=basicTriggers[clip] ?? (group==="night" ?
    `当地时间 20:00–08:00，收起气泡且 ${seconds(H3_REST_AFTER_MS)} 不与助手互动后按夜间流程触发；点击人物时按顺序起床、戴耳麦、换回原装。` :
    `当地时间 08:00–20:00，收起气泡且 ${seconds(H3_REST_AFTER_MS)} 不与助手互动后按日间流程触发；休闲中约每 ${seconds(H3_SIP_AFTER_MS)} 喝椰子，点击人物后完整退出。`);
  return {clip,group,label:motion.label,trigger,before:contexts[clip]?.[0]??"自然站姿",after:contexts[clip]?.[1]??"返回自然站姿",frames:motion.frames,durationMs:motion.durationMs,loop:motion.loop,files:motion.pages.map(key=>H3_MOTION.assets[key]),still:H3_MOTION.stills[clip],sourceRun:motion.sourceRun};
}
/** Preview loops are finite. Live sleeping stays unlimited until clicked. */
export function actionPreviewPlan(clip:H3Clip,withIdle:boolean):H3Clip[] {
  return withIdle && ACTION_GROUP_CLIPS.basic.includes(clip) && clip!=="idle-blink" ? ["idle-blink",clip,"idle-blink"] : [clip];
}
export function scenePreviewPlan(scene:"night"|"day"):H3Clip[] {
  const s=H3_SCENES[scene];
  return ["idle-blink",...s.enter,s.loop,...(scene==="day"?["coconut-sip","beach-loop"] as H3Clip[]:[s.loop]),...s.leave,"idle-blink"];
}
