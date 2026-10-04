// Twelve real intermediate drawings per action; versioned 4 × 3 sheets.
import { CHARACTER_MOTION_TEMPLATES } from "./motion";
export const CHARACTER_ACTIONS = {
  idle: { ...CHARACTER_MOTION_TEMPLATES.idle, row: 0 },
  wave: { ...CHARACTER_MOTION_TEMPLATES.wave, row: 1 },
  nod: { ...CHARACTER_MOTION_TEMPLATES.nod, row: 2 },
  thinking: { ...CHARACTER_MOTION_TEMPLATES.thinking, row: 3 },
  bow: { ...CHARACTER_MOTION_TEMPLATES.bow, row: 4 },
  cheer: { ...CHARACTER_MOTION_TEMPLATES.cheer, row: 5 },
  yawn: { ...CHARACTER_MOTION_TEMPLATES.yawn, row: 6 },
} as const;
export type CharacterAction = keyof typeof CHARACTER_ACTIONS;
export const PLAYFUL_ACTIONS: CharacterAction[] = ["wave", "nod", "thinking", "bow", "cheer", "yawn"];
export const CHARACTER_FRAME_COUNT = 12;
export const CHARACTER_STAGE = { size: 224, centre: 112, baseline: 216, blendMs: 45 } as const;
// Measured alpha bounds; constant action scale and fixed boot-centre anchors.
export const CHARACTER_SHEETS = {
  idle: { src: "/assistant/chibi-idle-v4.png", width: 1254, height: 1254, scale: 0.553763440860215 },
  wave: { src: "/assistant/chibi-wave-v4.png", width: 1448, height: 1086, scale: 0.6023391812865497 },
  nod: { src: "/assistant/chibi-nod-v4.png", width: 1448, height: 1086, scale: 0.5971014492753624 },
  thinking: { src: "/assistant/chibi-thinking-v4.png", width: 1254, height: 1254, scale: 0.5643835616438356 },
  bow: { src: "/assistant/chibi-bow-v4.png", width: 1254, height: 1254, scale: 0.5868945868945868 },
  cheer: { src: "/assistant/chibi-cheer-v4.png", width: 1254, height: 1254, scale: 0.569060773480663 },
  yawn: { src: "/assistant/chibi-yawn-v4.png", width: 1254, height: 1254, scale: 0.5508021390374331 },
} as const;
export const CHARACTER_POSES = [
  [[48,27,278,398,167.49],[362,27,592,398,481.58],[676,27,905,398,794.58],[989,27,1218,398,1107.87],[49,446,278,816,167.41],[363,446,592,816,481.43],[676,446,905,816,794.59],[990,446,1219,816,1108.1],[48,864,278,1234,167.46],[363,864,592,1234,481.41],[676,864,905,1234,794.54],[990,864,1219,1234,1107.98]],
  [[106,15,312,353,212.99],[455,15,661,353,562.42],[805,15,1010,353,911.31],[1158,15,1364,353,1265.9],[106,370,313,706,213.16],[455,370,661,707,562.42],[805,370,1011,707,912.19],[1159,370,1364,707,1266.06],[105,721,312,1062,212.64],[454,723,661,1062,562.3],[805,723,1011,1062,911.59],[1159,722,1365,1062,1265.99]],
  [[117,21,325,365,224.97],[452,26,658,365,558.6],[788,27,993,365,892.79],[1122,31,1328,365,1227.6],[120,391,325,725,224.88],[454,399,657,725,558.58],[788,398,992,725,892.88],[1123,394,1327,725,1227.57],[119,737,325,1066,224.95],[453,737,658,1066,558.86],[787,737,992,1066,892.64],[1122,737,1327,1066,1227.19]],
  [[56,40,278,404,173.45],[370,41,590,404,486.39],[681,40,903,404,798.75],[994,40,1215,404,1111.44],[56,442,278,806,173.55],[370,442,590,806,486.53],[681,442,903,806,798.83],[994,442,1215,806,1111.61],[56,843,278,1207,173.48],[370,843,590,1207,486.42],[681,843,903,1207,798.86],[994,843,1215,1207,1111.66]],
  [[51,49,263,399,161.03],[363,57,572,399,472.25],[673,60,881,399,783.03],[983,72,1192,399,1094.12],[51,481,263,805,160.55],[362,491,576,805,472.44],[672,507,886,805,783.24],[983,493,1195,805,1095.55],[49,882,263,1205,160.77],[361,878,576,1205,472.68],[673,875,884,1205,783.41],[983,863,1194,1205,1094.64]],
  [[67,39,280,398,176.23],[368,38,580,398,477.63],[664,38,878,398,776.12],[967,38,1182,398,1078.57],[66,439,283,798,177.32],[367,438,582,798,477.46],[661,438,880,798,776.63],[967,438,1182,798,1079],[66,839,283,1200,177.64],[368,840,583,1200,479.56],[664,841,879,1200,776.49],[966,841,1182,1200,1078.37]],
  [[49,27,279,400,167.9],[362,27,593,400,482.2],[676,27,906,400,794.88],[989,27,1219,400,1108.86],[48,446,279,819,168.09],[362,446,593,819,482.17],[676,446,906,819,795.27],[989,446,1220,819,1109.29],[48,864,279,1237,168.14],[362,864,593,1237,482.14],[676,864,906,1237,795.07],[989,864,1219,1237,1108.54]],
] as const;

export function characterPose(index: number) {
  const row = Math.floor(index / CHARACTER_FRAME_COUNT);
  const [x, y, right, bottom, anchor] = CHARACTER_POSES[row][index % CHARACTER_FRAME_COUNT];
  const action = (Object.keys(CHARACTER_ACTIONS) as CharacterAction[])[row];
  const scale = CHARACTER_SHEETS[action].scale;
  const width = right - x + 1, height = bottom - y + 1;
  return { x, y, width, height, drawWidth: width * scale, drawHeight: height * scale,
    left: CHARACTER_STAGE.centre - (anchor - x) * scale, top: CHARACTER_STAGE.baseline - height * scale };
}

export function characterOffsets(action: CharacterAction) {
  return CHARACTER_MOTION_TEMPLATES[action].offsets;
}

export function characterSample(action: CharacterAction, elapsed: number) {
  const config = CHARACTER_ACTIONS[action];
  const time = config.loop ? Math.max(0, elapsed) % config.duration : Math.min(config.duration, Math.max(0, elapsed));
  const offsets = characterOffsets(action);
  if (!config.loop && time === config.duration) return { from: 0, to: 0, mix: 1 };
  const sequence = offsets.map((_, frame) => frame === CHARACTER_FRAME_COUNT ? 0 : config.row * CHARACTER_FRAME_COUNT + frame);
  const step = Math.max(0, offsets.findLastIndex(offset => time >= offset * config.duration));
  if (step === 0) return { from: sequence[0], to: sequence[0], mix: 1 };
  const transition = Math.min(CHARACTER_STAGE.blendMs, ((offsets[step + 1] ?? 1) - offsets[step]) * config.duration);
  const progress = Math.min(1, (time - offsets[step] * config.duration) / transition);
  return { from: sequence[step - 1], to: sequence[step], mix: progress * progress * (3 - 2 * progress) };
}
