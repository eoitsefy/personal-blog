import { ChibiAssistant } from "./chibi-assistant";

export function AssistantPanel(props: { enabled: boolean; maxQuestionChars: number }) {
  return <ChibiAssistant settings={props} />;
}
