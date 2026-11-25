import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, inLane, health } from '../genome/cell.mjs';

const seed = JSON.parse(readFileSync(new URL('../seed.json', import.meta.url), 'utf8'));
const ask = '13 × 12 × 26';

test('the judge tells the seed\'s good case from its bad one: working may be trained on only when every line is true', async () => {
  assert.equal(await judge(seed.judge.cases.good), 'verified');
  assert.equal(await judge(seed.judge.cases.bad), 'unverified', 'one false line, and an answer that follows from it');
  assert.equal(await judge({ ask, reply: '13 × 12 = 156\n156 × 20 = 3120\n156 × 6 = 936\n3120 + 936 = 4056\nANSWER: 4056' }), 'verified', 'another true way to the same answer');
  for (const reply of ['ANSWER: 4056', '13 × 12 = 156\n156 × 26 = 4056', '13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4057', '13 × 12 = 156\n13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056', '', 'four thousand and fifty-six']) assert.equal(await judge({ ask, reply }), 'unverified', reply);
  // what is not a calculation is refused, whatever is offered for it
  for (const bad of [{ ask: 'the best pizza topping', reply: 'cheese' }, { ask: '4056', reply: 'ANSWER: 4056' }, { ask: '13 ×', reply: 'x' }, { ask, reply: 4056 }, { ask }, { reply: 'ANSWER: 1' }, { ask: 7, reply: 'x' }, null, 'x', 7]) assert.equal(await judge(bad), 'refused', JSON.stringify(bad));
});

test('the lane takes an exact calculation and refuses anything else', async () => {
  assert.equal(await inLane(seed.boundary.inLane), true); assert.equal(await inLane(seed.boundary.outOfLane), false);
  assert.equal(await inLane({ ask }), true); assert.equal(await inLane({ ask: '2 + 2' }), true);
  for (const bad of [{ ask: '4056' }, { ask: 'twelve times three' }, { ask: '' }, { reply: 'x' }, { ask: 7 }, null, {}, 7, 'x']) assert.equal(await inLane(bad), false, JSON.stringify(bad));
});

test('health says what the repository cannot see from inside itself', async () => {
  assert.deepEqual(await health(), { used: null, dependedOn: null, lastEarned: null });
  assert.equal(seed.name, 'the-distillation'); assert.equal(seed.genome, '1'); assert.equal(seed.provenance.repo, 'sjgant80-hub/the-distillation'); assert.ok(seed.purpose.length <= 400, 'the birth check admits a purpose of at most 400 characters');
});
