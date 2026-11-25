import { test } from 'node:test';
import assert from 'node:assert/strict';
import A from '../src/adopt.mjs';

const SHA1 = 'a'.repeat(64), SHA2 = 'b'.repeat(64);
const grant = (round, sha, over) => ({ by: 'human', action: 'adopt-weights', round, adapterSha256: sha, words: 'yes, adopt round ' + round, at: '2026-11-26T09:00:00Z', ...over });
const HOSTILE = [null, undefined, 7, 'x', [], {}, () => 1];

test('the rule: adopted only when the lift cleared its bar AND it is no less honest; anything else dissolves', () => {
  assert.deepEqual(A.decide(true, true), { adopt: true, why: 'the cold lift cleared its bar and it is no less honest' });
  assert.deepEqual(A.decide(false, true), { adopt: false, why: 'the cold lift did not clear its bar' });
  assert.deepEqual(A.decide(true, false), { adopt: false, why: 'it got more answers right and more confidently wrong: not adopted' });
  assert.equal(A.decide(false, false).adopt, false); assert.equal(A.decide(false, false).why, 'the cold lift did not clear its bar');
  // a claim that was not measured adopts nothing: no verdict is not a pass
  assert.deepEqual(A.decide(null, true), { adopt: false, why: 'the lift was not measured: nothing is adopted on faith' });
  assert.deepEqual(A.decide(true, null), { adopt: false, why: 'honesty was not measured: nothing is adopted on faith' });
  for (const bad of [undefined, 1, 'true', {}]) { assert.equal(A.decide(bad, true).adopt, false); assert.equal(A.decide(true, bad).adopt, false); }
});

test('the grant: a person\'s, for exactly this round and exactly these weights; nothing else opens the gate', () => {
  assert.equal(A.validGrant(grant(1, SHA1), 1, SHA1), true);
  assert.equal(A.validGrant(grant(1, SHA1, { by: 'the-loop' }), 1, SHA1), false, 'the loop cannot write its own grant');
  assert.equal(A.validGrant(grant(1, SHA1, { action: 'publish' }), 1, SHA1), false);
  assert.equal(A.validGrant(grant(2, SHA1), 1, SHA1), false, 'a grant for another round');
  assert.equal(A.validGrant(grant(1, SHA2), 1, SHA1), false, 'a grant for other weights');
  assert.equal(A.validGrant(grant(1, SHA1, { words: '   ' }), 1, SHA1), false, 'the person\'s own words are kept, and must be there');
  assert.equal(A.validGrant(grant(1, SHA1, { at: '' }), 1, SHA1), false);
  assert.equal(A.validGrant(grant(1, 'short', {}), 1, 'short'), false, 'the weights are named by a whole SHA-256');
  assert.equal(A.validGrant(grant(1.5, SHA1), 1.5, SHA1), false);
  assert.equal(A.validGrant(grant('1', SHA1), '1', SHA1), false);
  for (const bad of HOSTILE) assert.equal(A.validGrant(bad, 1, SHA1), false);
});

test('the chain a new round may stand on: every earlier round adopted by the rule AND granted, in order, no gap', () => {
  const h = [{ round: 1, adopted: true, adapterSha256: SHA1 }, { round: 2, adopted: true, adapterSha256: SHA2 }];
  assert.deepEqual(A.chain(h, { 1: grant(1, SHA1), 2: grant(2, SHA2) }), [{ round: 1, adapterSha256: SHA1 }, { round: 2, adapterSha256: SHA2 }]);
  assert.deepEqual(A.chain(h, { 1: grant(1, SHA1) }), [{ round: 1, adapterSha256: SHA1 }], 'round 2 is adopted but not granted: the chain ends before it');
  assert.deepEqual(A.chain(h, { 2: grant(2, SHA2) }), [], 'a gap at round 1 ends the chain at once: round 2 cannot stand alone');
  assert.deepEqual(A.chain([{ round: 1, adopted: false, adapterSha256: SHA1 }], { 1: grant(1, SHA1) }), [], 'a grant does not adopt what the rule dissolved');
  assert.deepEqual(A.chain([{ round: 2, adopted: true, adapterSha256: SHA2 }], { 2: grant(2, SHA2) }), [], 'the rounds must be 1, 2, 3 in order');
  assert.deepEqual(A.chain([], {}), []);
  for (const bad of HOSTILE) { assert.deepEqual(A.chain(bad, {}), []); assert.deepEqual(A.chain(h, bad), []); }
});
