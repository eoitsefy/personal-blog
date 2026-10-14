import type { CharacterAction } from "./character";
import type { AssistantAnswer } from "./ui";

/** Only complete short social phrases. Mixed factual questions still use retrieval. */
export function socialReply(question: string): { action: CharacterAction; result: AssistantAnswer } | null {
  const text=question.trim().toLowerCase().replace(/[\s，。！？、,.!?～~]+/g, "");
  let action:CharacterAction, answer:string;
  if (/^(?:谢谢(?:你|啦|了|啊|呀|哦|你的帮助|你的解答)?|感谢(?:你|帮助|你的帮助)?|多谢(?:你)?|辛苦(?:了|啦)?|thanks?|thankyou)$/.test(text)) {
    action="bow"; answer="不客气～很高兴能陪你逛逛这个小站！";
  } else if (/^(?:加油(?:呀|啊|吧|哦)?|一起加油|给我加油|鼓励我(?:一下)?|太好了|太棒了|好耶|great|awesome|hooray)$/.test(text)) {
    action="cheer"; answer="一起加油！慢慢来，每一小步都算数。";
  } else if (/^(?:你好(?:呀|啊)?|嗨|哈喽|早上好|下午好|晚上好|hello|hi)$/.test(text)) {
    action="wave"; answer="你好呀！欢迎来坐坐。可以翻翻日志、看看地点，也可以问我公开文章里的事。";
  } else return null;
  return { action,result:{ answer,mode:"conversation",confidence:"high",sources:[] } };
}
