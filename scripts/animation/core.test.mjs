import test from 'node:test';
import assert from 'node:assert/strict';
import { Actions, parseAdvice, within, localApi, smokeWorkflow, constrainedWorkflow, validateWorkflow } from './core.mjs';
test('only seven canonical motions can be planned', () => {
  assert.equal(Actions.parse('wave'), 'wave');
  assert.throws(() => Actions.parse('../shell'));
});
test('model advice is bounded data and rejects executable schema fields', () => {
  const advice = { positivePrompt: 'reference figure', negativePrompt: 'cropped', keyframes: [1, 2, 3].map(i => ({ stage: String(i), description: 'pose' })), warnings: [] };
  assert.equal(parseAdvice(advice).keyframes.length, 3);
  assert.throws(() => parseAdvice({ ...advice, command: 'anything' }));
  assert.throws(() => parseAdvice({ ...advice, positivePrompt: 'x'.repeat(1201) }));
});
test('jobs are restricted to the workspace and API is loopback only', () => {
  assert.ok(within('D:/workbench', 'jobs/wave').endsWith('wave'));
  assert.throws(() => within('D:/workbench', '../../secret'));
  assert.equal(localApi(), 'http://127.0.0.1:8188');
  for (const u of ['http://example.com:8188', 'http://127.0.0.1:8188@evil.test', 'http://127.0.0.1:8188/private', 'https://127.0.0.1:8188']) assert.throws(() => localApi(u));
});
test('only approved local nodes and bounded output names may execute', () => {
  assert.equal(validateWorkflow(smokeWorkflow())['4'].inputs.batch_size, 1);
  assert.throws(() => validateWorkflow({ '1': { class_type: 'ExecuteShell', inputs: {} } }));
  assert.throws(() => validateWorkflow({ '1': { class_type: 'SaveImage', inputs: { filename_prefix: '../../escape' } } }));
  const graph = smokeWorkflow(); graph['4'].inputs.batch_size = 20;
  assert.throws(() => validateWorkflow(graph));
});
test('reference workflow keeps model, constraints, seed and motion names fixed', () => {
  const graph = constrainedWorkflow('wave');
  assert.equal(graph['9'].inputs.weight, 0.7);
  assert.equal(graph['12'].inputs.strength, 0.85);
  assert.equal(graph['15'].inputs.strength, 0.9);
  assert.equal(graph['5'].inputs.denoise, 0.3);
  assert.equal(graph['5'].inputs.seed, 20261005);
  assert.equal(graph['10'].inputs.image, 'wave-pose.png');
  assert.throws(() => constrainedWorkflow('../wave'));
});
