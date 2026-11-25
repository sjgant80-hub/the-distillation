import { test } from 'node:test';
import assert from 'node:assert/strict';
import C from '../src/cold.mjs';
import LOOP from '../vendor/crystal/vendor/climb/src/loop.mjs';

const task = { id: 'tank', statement: 'A tank is 13 cm long, 12 cm wide and 26 cm deep. Volume = length × width × depth. How many cubic centimetres?', ask: '13 × 12 × 26', check: { type: 'value', value: '4056' } };
const HOSTILE = [null, undefined, 7, 'x', [], {}, () => 1];
const row = (id, outcome) => ({ id, outcome });

test('the cold conversation is The Climb\'s own sealed one-try opening for the problem', () => {
  assert.deepEqual(C.asking(task), LOOP.opening(task.statement, []));
  assert.equal(C.asking(task)[0].role, 'system'); assert.equal(C.asking(task).at(-1).content, task.statement);
  for (const bad of HOSTILE) assert.doesNotThrow(() => C.asking(bad));
});

test('a reply is right, confidently wrong, or gives no answer: read by the sealed checker and nothing else', () => {
  assert.deepEqual(C.read('13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056', task, false), { outcome: 'right', answer: '4056', trueLines: 2, falseLines: 0 });
  // a wrong answer, given: a silent failure. Its false line is counted.
  assert.deepEqual(C.read('13 × 12 = 156\n156 × 26 = 4000\nANSWER: 4000', task, false), { outcome: 'wrong', answer: '4000', trueLines: 1, falseLines: 1 });
  // the right working with no ANSWER line is no answer
  assert.deepEqual(C.read('13 × 12 = 156\n156 × 26 = 4056', task, false), { outcome: 'none', answer: null, trueLines: 2, falseLines: 0 });
  assert.equal(C.read('', task, false).outcome, 'none'); assert.equal(C.read('I cannot tell.', task, false).outcome, 'none');
  // cut off at the length limit: the last line is dropped before reading, since it may be half a number
  assert.equal(C.read('13 × 12 = 156\nANSWER: 40', task, true).outcome, 'none', 'the cut line was the answer line');
  assert.equal(C.read('13 × 12 = 156\nANSWER: 4056\n156 × 2', task, true).outcome, 'right', 'the answer line was whole; only the line after it was cut');
  assert.equal(C.read('13 × 12 = 156\nANSWER: 40', task, false).outcome, 'wrong', 'not cut: the same text is a wrong answer');
  assert.equal(C.read('ANSWER: 4056', task, 'yes').outcome, 'right', 'only true is a cut');
  for (const bad of HOSTILE) { assert.equal(C.read(bad, task, false).outcome, 'none'); assert.doesNotThrow(() => C.read('ANSWER: 1', bad, false)); }
});

test('tally counts the three outcomes; accuracy and the silent-failure rate are shares of all problems', () => {
  const t = C.tally([row('a', 'right'), row('b', 'right'), row('c', 'wrong'), row('d', 'none'), row('e', 'junk'), null]);
  assert.deepEqual(t, { n: 4, right: 2, wrong: 1, none: 1, rate: 0.5, silent: 0.25 });
  assert.deepEqual(C.tally([]), { n: 0, right: 0, wrong: 0, none: 0, rate: 0, silent: 0 });
  assert.deepEqual(C.OUTCOMES, ['right', 'wrong', 'none']);
  for (const bad of HOSTILE) assert.equal(C.tally(bad).n, 0);
});

test('compare: the two models on the same problems, the fail-wall both ways, and the exact test', () => {
  const base = [row('a', 'right'), row('b', 'wrong'), row('c', 'none'), row('d', 'wrong'), row('e', 'right')];
  const dist = [row('a', 'right'), row('b', 'right'), row('c', 'right'), row('d', 'wrong'), row('e', 'none')];
  const r = C.compare(base, dist);
  assert.deepEqual([r.n, r.unmatched, r.gained, r.lost], [5, 0, ['b', 'c'], ['e']]);
  assert.deepEqual(r.base, { n: 5, right: 2, wrong: 2, none: 1, rate: 0.4, silent: 0.4 });
  assert.deepEqual(r.distilled, { n: 5, right: 3, wrong: 1, none: 1, rate: 0.6, silent: 0.2 });
  assert.ok(Math.abs(r.lift - 0.2) < 1e-12); assert.equal(r.p, 1, '2 against 1: nothing can be said');
  // 8 gained and none lost: the exact two-sided p is 2 × (1/2)^8
  const g = C.compare(Array.from({ length: 8 }, (_, i) => row(i, 'wrong')), Array.from({ length: 8 }, (_, i) => row(i, 'right')));
  assert.equal(g.p, 2 / 256); assert.equal(g.lift, 1); assert.deepEqual([g.gained.length, g.lost.length], [8, 0]);
  // a problem only one model was asked, or with an outcome that is not one, is left out and counted
  const u = C.compare([row('a', 'right'), row('x', 'right'), row('j', 'junk')], [row('a', 'wrong'), row('y', 'right'), row('j', 'right')]);
  assert.deepEqual([u.n, u.unmatched, u.lost, u.gained], [1, 4, ['a'], []]);
  // going from one failure to the other is neither gained nor lost
  const s = C.compare([row('a', 'wrong'), row('b', 'none')], [row('a', 'none'), row('b', 'wrong')]);
  assert.deepEqual([s.gained, s.lost, s.lift], [[], [], 0]);
  for (const bad of HOSTILE) { assert.equal(C.compare(bad, dist).n, 0); assert.equal(C.compare(base, bad).n, 0); assert.equal(C.compare(base, bad).unmatched, 5); }
});

test('made: a cold record is evidence only when it is whole and was made on the right weights at the right limit', () => {
  const W = 'a'.repeat(64), A1 = 'b'.repeat(64), A2 = 'c'.repeat(64);
  const file = (over) => ({ complete: true, weightsSha256: W, adapters: [A1, A2], maxTokens: 256, ...over });
  const want = (over) => ({ weightsSha256: W, adapters: [A1, A2], maxTokens: 256, ...over });
  assert.equal(C.made(file(), want()), true);
  assert.equal(C.made(file({ adapters: [] }), want({ adapters: [] })), true, 'the model as published: no adapters');
  assert.equal(C.made(file({ complete: false }), want()), false); assert.equal(C.made(file({ complete: 'yes' }), want()), false);
  assert.equal(C.made(file({ weightsSha256: 'd'.repeat(64) }), want()), false, 'other base weights');
  assert.equal(C.made(file({ weightsSha256: undefined }), want({ weightsSha256: undefined })), false, 'no weights named is not a match');
  assert.equal(C.made(file({ weightsSha256: '' }), want({ weightsSha256: '' })), false);
  assert.equal(C.made(file({ adapters: [A2, A1] }), want()), false, 'the order of the adapters is part of it');
  assert.equal(C.made(file({ adapters: [A1] }), want()), false); assert.equal(C.made(file(), want({ adapters: [A1] })), false);
  assert.equal(C.made(file({ adapters: [A1, 'd'.repeat(64)] }), want()), false, 'the last adapter is another');
  assert.equal(C.made(file({ adapters: ['', ''] }), want({ adapters: ['', ''] })), false, 'an adapter with no name is not a match');
  assert.equal(C.made(file({ adapters: null }), want()), false); assert.equal(C.made(file(), want({ adapters: null })), false);
  assert.equal(C.made(file({ maxTokens: 128 }), want()), false, 'another token limit');
  assert.equal(C.made(file({ maxTokens: '256' }), want({ maxTokens: '256' })), false);
  for (const bad of HOSTILE) { assert.equal(C.made(bad, want()), false); assert.equal(C.made(file(), bad), false); }
});
