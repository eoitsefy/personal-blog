// Local authoring only. Never imported by Next.js or the public assistant.
import { z } from 'zod';
import { resolve, sep } from 'node:path';
export const Actions = z.enum(['idle', 'wave', 'nod', 'thinking', 'bow', 'cheer', 'yawn']);
const brief = z.string().min(1).max(400);
export const PlanAdvice = z.object({
  positivePrompt: z.string().min(1).max(1200),
  negativePrompt: z.string().min(1).max(800),
  keyframes: z.array(z.object({ stage: brief, description: brief }).strict()).min(3).max(12),
  warnings: z.array(brief).max(6),
}).strict();
export function parseAdvice(value) { return PlanAdvice.parse(value); }
export function within(root, relative) {
  const base = resolve(root), target = resolve(base, relative);
  if (target !== base && !target.startsWith(base + sep)) throw Error('path_outside_workspace');
  return target;
}
export function localApi(value = 'http://127.0.0.1:8188') {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port !== '8188' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('non_local_comfy_api');
  return url.origin;
}
export function smokeWorkflow() {
  // Synthetic test, not a replacement character or a production asset.
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'v1-5-pruned-emaonly.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: 'a single simple red circle on a plain white background, flat illustration', clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'text, watermark, photograph, complex background', clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: { model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0], seed: 20261005, steps: 8, cfg: 6, sampler_name: 'euler', scheduler: 'normal', denoise: 1 } },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { images: ['6', 0], filename_prefix: 'workbench-smoke' } },
  };
}
export function constrainedWorkflow(action, advice = null) {
  const motion = Actions.parse(action);
  const brief = advice ? parseAdvice(advice) : null;
  // Manually prepared full-canvas guides. Export only; never auto-queued.
  // DeepSeek text cannot choose nodes, paths, seed, weights or execution policy.
  const graph = smokeWorkflow();
  graph['2'].inputs.text = 'same original chibi identity as reference, black hair with gold streak, amber eyes, black gold jacket, headset, fixed feet, full body, 20 percent margin, flat illustration, solid magenta background. ' + (brief?.positivePrompt ?? motion);
  graph['3'].inputs.text = 'cropped, cut off, deformed, extra limbs, changed face, changed costume, text, watermark, blurry edges, halo, realistic. ' + (brief?.negativePrompt ?? '');
  graph['4'] = { class_type: 'LoadImage', inputs: { image: 'reference-neutral.png' } };
  graph['8'] = { class_type: 'IPAdapterUnifiedLoader', inputs: { model: ['1', 0], preset: 'PLUS (high strength)' } };
  graph['9'] = { class_type: 'IPAdapterAdvanced', inputs: { model: ['8', 0], ipadapter: ['8', 1], image: ['4', 0], weight: 0.7, weight_type: 'linear', combine_embeds: 'concat', start_at: 0, end_at: 1, embeds_scaling: 'V only' } };
  graph['10'] = { class_type: 'LoadImage', inputs: { image: `${motion}-pose.png` } };
  graph['11'] = { class_type: 'ControlNetLoader', inputs: { control_net_name: 'control_v11p_sd15_openpose_fp16.safetensors' } };
  graph['12'] = { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['2', 0], negative: ['3', 0], control_net: ['11', 0], image: ['10', 0], strength: 0.85, start_percent: 0, end_percent: 1, vae: ['1', 2] } };
  graph['13'] = { class_type: 'LoadImage', inputs: { image: `${motion}-lineart.png` } };
  graph['14'] = { class_type: 'ControlNetLoader', inputs: { control_net_name: 'control_v11p_sd15_lineart_fp16.safetensors' } };
  graph['15'] = { class_type: 'ControlNetApplyAdvanced', inputs: { positive: ['12', 0], negative: ['12', 1], control_net: ['14', 0], image: ['13', 0], strength: 0.9, start_percent: 0, end_percent: 1, vae: ['1', 2] } };
  graph['16'] = { class_type: 'VAEEncode', inputs: { pixels: ['4', 0], vae: ['1', 2] } };
  Object.assign(graph['5'].inputs, { model: ['9', 0], positive: ['15', 0], negative: ['15', 1], latent_image: ['16', 0], steps: 20, denoise: 0.3 });
  graph['7'].inputs.filename_prefix = `candidate-${motion}`;
  return validateWorkflow(graph);
}
export const SafeNodes = new Set(['CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage', 'LoadImage', 'VAEEncode', 'ControlNetLoader', 'ControlNetApplyAdvanced', 'IPAdapterUnifiedLoader', 'IPAdapterAdvanced']);
export function validateWorkflow(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph) || Object.keys(graph).length > 30) throw Error('invalid_graph');
  for (const [id, node] of Object.entries(graph)) {
    if (!/^\d+$/.test(id) || !node || !SafeNodes.has(node.class_type) || !node.inputs || typeof node.inputs !== 'object') throw Error('unapproved_node');
    if (node.class_type === 'SaveImage' && !/^[a-z0-9_-]{1,64}$/i.test(node.inputs.filename_prefix)) throw Error('invalid_output_prefix');
    if (node.class_type === 'LoadImage' && !/^[a-z0-9_-]+\.png$/i.test(node.inputs.image)) throw Error('invalid_input_filename');
    if (node.class_type === 'EmptyLatentImage' && (node.inputs.batch_size !== 1 || ![512, 768].includes(node.inputs.width) || node.inputs.width !== node.inputs.height)) throw Error('invalid_canvas');
    if (node.class_type === 'KSampler' && (!Number.isInteger(node.inputs.steps) || node.inputs.steps < 1 || node.inputs.steps > 30)) throw Error('invalid_steps');
    if (['CheckpointLoaderSimple', 'ControlNetLoader'].includes(node.class_type)) {
      const name = node.inputs.ckpt_name ?? node.inputs.control_net_name;
      if (typeof name !== 'string' || !/^[a-z0-9_.-]+\.safetensors$/i.test(name)) throw Error('invalid_model_filename');
    }
  }
  return graph;
}
