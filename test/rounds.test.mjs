import { test } from 'node:test';
import assert from 'node:assert/strict';
import R from '../src/rounds.mjs';

const SHA = (c) => c.repeat(64);
const grant = (round, sha) => ({ by: 'human', action: 'adopt-weights', round, adapterSha256: sha, words: 'adopt it', at: '2026-11-26T09:00:00Z' });
const SETTINGS = { rounds: { max: 3 }, spend: { hoursPerRound: 12, hoursInAll: 30 } };
const h = (round, adopted, hours = 8, more = {}) => ({ round, adopted, adapterSha256: SHA(String(round)), base: 0.3, distilled: 0.45, lift: 0.15, gained: 20, lost: 4, hours, ...more });
const HOSTILE = [null, undefined, 7, 'x', {}, () => 1];

test('what the loop may do next: run, wait for a person, stop because the house is full, or stop at a cap', () => {
  assert.deepEqual(R.next([], {}, SETTINGS), { act: 'run', round: 1, why: 'the first round' });
  // adopted by the rule, not yet granted: it waits. It does not run on its own say-so.
  assert.equal(R.next([h(1, true)], {}, SETTINGS).act, 'wait');
  assert.equal(R.next([h(1, true)], { 1: grant(1, SHA('9')) }, SETTINGS).act, 'wait', 'a grant for other weights opens nothing');
  // adopted and granted: the next round may run
  assert.deepEqual(R.next([h(1, true)], { 1: grant(1, SHA('1')) }, SETTINGS), { act: 'run', round: 2, why: 'round 1 was adopted and granted' });
  // the last round dissolved: the gains have flattened. Full, and it halts, whatever was granted.
  const full = R.next([h(1, true), h(2, false)], { 1: grant(1, SHA('1')), 2: grant(2, SHA('2')) }, SETTINGS);
  assert.deepEqual([full.act, full.round], ['full', 2]); assert.match(full.why, /the house is full/);
  assert.equal(R.next([h(1, false)], {}, SETTINGS).act, 'full', 'a first round that does not clear its bar fills the house at once');
  // the most rounds the seal allows
  const three = [h(1, true), h(2, true), h(3, true)], g3 = { 1: grant(1, SHA('1')), 2: grant(2, SHA('2')), 3: grant(3, SHA('3')) };
  assert.deepEqual([R.next(three, g3, SETTINGS).act, R.next(three, g3, SETTINGS).why], ['capped', 'the most rounds the seal allows have run']);
  assert.equal(R.next(three.slice(0, 2), g3, SETTINGS).act, 'run', 'two of three run: the third may');
  assert.equal(R.next([h(1, true)], { 1: grant(1, SHA('1')) }, { ...SETTINGS, rounds: {} }).act, 'capped', 'no limit named is no leave to run');
  // the spend wall: the hours in all, or one round over its own cap
  assert.deepEqual([R.next([h(1, true, 30)], { 1: grant(1, SHA('1')) }, SETTINGS).act, R.next([h(1, true, 30)], { 1: grant(1, SHA('1')) }, SETTINGS).why], ['capped', 'the spend wall is reached']);
  assert.equal(R.next([h(1, true, 12.5)], { 1: grant(1, SHA('1')) }, SETTINGS).act, 'capped', 'one round over its own cap stops the loop');
  assert.equal(R.next([h(1, true, 12)], { 1: grant(1, SHA('1')) }, SETTINGS).act, 'run', 'exactly at the round cap is within it');
  for (const bad of HOSTILE) { assert.equal(R.next(bad, {}, SETTINGS).act, 'run'); assert.equal(R.next([h(1, true)], bad, SETTINGS).act, 'wait'); assert.equal(R.next([h(1, true)], { 1: grant(1, SHA('1')) }, bad).act, 'capped'); }
});

test('the spend wall: hours of model work, each round and in all, against the two caps', () => {
  const s = R.spend([h(1, true, 8), h(2, true, 12.5)], SETTINGS);
  assert.deepEqual(s, { rounds: [{ round: 1, hours: 8, over: false }, { round: 2, hours: 12.5, over: true }], total: 20.5, perRound: 12, inAll: 30, left: 9.5, capped: true });
  assert.deepEqual([R.spend([h(1, true, 12)], SETTINGS).capped, R.spend([h(1, true, 12)], SETTINGS).left], [false, 18]);
  assert.equal(R.spend([h(1, true, 10), h(2, true, 10), h(3, true, 10)], SETTINGS).capped, true, 'exactly at the cap in all is the cap reached');
  assert.equal(R.spend([h(1, true, 10), h(2, true, 10), h(3, true, 9.9)], SETTINGS).capped, false);
  assert.equal(R.spend([h(1, true, 40)], SETTINGS).left, 0, 'never less than nothing left');
  // hours that are not numbers count as none; caps that are not numbers above nought allow nothing
  assert.equal(R.spend([h(1, true, 'x'), h(2, true, NaN)], SETTINGS).total, 0);
  assert.deepEqual([R.spend([], {}).capped, R.spend([], {}).inAll, R.spend([], { spend: { hoursPerRound: -1, hoursInAll: 'x' } }).perRound], [true, 0, 0]);
  for (const bad of HOSTILE) assert.deepEqual(R.spend(bad, SETTINGS).rounds, []);
});

test('the fill gauge: each round\'s cold accuracy before and after, its lift, what moved, adopted and granted', () => {
  const g = R.gauge([h(1, true), h(2, false, 8, { base: 0.45, distilled: 0.46, lift: 0.01, gained: 5, lost: 4 })], { 1: grant(1, SHA('1')) });
  assert.deepEqual(g, [
    { round: 1, base: 0.3, distilled: 0.45, lift: 0.15, gained: 20, lost: 4, adopted: true, granted: true },
    { round: 2, base: 0.45, distilled: 0.46, lift: 0.01, gained: 5, lost: 4, adopted: false, granted: false },
  ]);
  assert.deepEqual(R.gauge([{ round: 1 }], {}), [{ round: 1, base: 0, distilled: 0, lift: 0, gained: 0, lost: 0, adopted: false, granted: false }]);
  assert.equal(R.gauge([h(1, 'yes')], { 1: grant(1, SHA('1')) })[0].adopted, false, 'only true is adopted');
  for (const bad of HOSTILE) assert.deepEqual(R.gauge(bad, {}), []);
});
