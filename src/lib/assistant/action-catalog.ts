import { H3_CLIPS, H3_MOTION, type H3Clip } from "./h3-motion";
import { BEHAVIOR_TIMING } from "./behavior";

export type ActionGroup="basic";
export const ACTION_GROUPS:{id:ActionGroup;label:string}[]=[{id:"basic",label:"基础动作"}];
export const ACTION_GROUP_CLIPS:Record<ActionGroup,readonly H3Clip[]>={
  basic:H3_CLIPS,
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
export function actionInfo(clip:H3Clip) {
  const group=ACTION_GROUPS.find(g=>ACTION_GROUP_CLIPS[g.id].includes(clip))!.id;
  const motion=H3_MOTION.clips[clip];
  const trigger=basicTriggers[clip]!;
  return {clip,group,label:motion.label,trigger,before:"自然站姿",after:"返回自然站姿",frames:motion.frames,durationMs:motion.durationMs,loop:motion.loop,files:motion.pages.map(key=>H3_MOTION.assets[key]),still:H3_MOTION.stills[clip],sourceRun:motion.sourceRun};
}
/** Preview loops are finite and retain each full original cycle. */
export function actionPreviewPlan(clip:H3Clip,withIdle:boolean):H3Clip[] {
  return withIdle && ACTION_GROUP_CLIPS.basic.includes(clip) && clip!=="idle-blink" ? ["idle-blink",clip,"idle-blink"] : [clip];
}
