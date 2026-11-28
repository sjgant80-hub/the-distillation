import { test } from 'node:test';
import assert from 'node:assert/strict';
import { read, progress } from '../scripts/live.mjs';

test('the live line says how far the stage the round is in has got, and never the training step after training', () => {
  const s = (stage, extra = {}) => ({ stage, train: { step: 204, steps: 204, loss: [] }, harvest: { done: 566, total: 566 }, cold: {}, ...extra });
  assert.equal(progress(s('harvest', { harvest: { done: 40, total: 566 } })), ' · 40/566');
  assert.equal(progress(s('train', { train: { step: 199, steps: 204 } })), ' · step 199/204');
  assert.equal(progress(s('cold-base', { cold: { base: { done: 72, total: 229 } } })), ' · 72 of 229', 'not "step 204/204", which reads as finished');
  assert.equal(progress(s('cold-distilled', { cold: { base: { done: 229, total: 229 }, distilled: { done: 8, total: 229 } } })), ' · 8 of 229');
  assert.equal(progress(s('cold-base')), '', 'a cold step not yet counted says nothing');
  for (const st of ['build', 'judged', 'waiting', undefined]) assert.equal(progress(s(st)), '');
  for (const x of [null, undefined, 7, 'x', {}, []]) assert.equal(progress(x), '');
});

test('read the round log: the cold steps are counted from the model\'s own lines', () => {
  const log = ['$ python -u py/cold.py m data/rounds/2/asks.json data/rounds/2/cold-base.json 256 8', '229 conversations, 0 answered already, 229 to answer', '72 of 229 · 647 s'].join('\n');
  const st = read(log, 2);
  assert.equal(st.stage, 'cold-base');
  assert.deepEqual(st.cold.base, { done: 72, total: 229 });
  assert.equal(progress(st), ' · 72 of 229');
});
