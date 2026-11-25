import { test } from 'node:test';
import assert from 'node:assert/strict';
import K from '../src/claims.mjs';

const SETTINGS = { bars: { liftPoints: 5, alpha: 0.05 } };
const tally = (n, right, wrong) => ({ n, right, wrong, none: n - right - wrong, rate: right / n, silent: wrong / n });
const ids = (n, p) => Array.from({ length: n }, (_, i) => `${p}${i}`);
// a round that passes everything: 200 held-out, base 60 right, distilled 90 right (40 gained, 10 lost)
const cold = (over) => ({ n: 200, base: tally(200, 60, 120), distilled: tally(200, 90, 100), lift: 0.15, gained: ids(40, 'g'), lost: ids(10, 'l'), p: 2e-5, ...over });
const SHA = 'a'.repeat(64);
const good = () => ({ cold: cold(), train: { examples: 400, verified: 400, unverified: 0, fileSha256: SHA, trainerSha256: SHA, trainerExamples: 400 }, held: { n: 200, overlap: 0, harvested: 0 }, outcome: { adopted: true, standsOn: [], allowed: [] } });
const pass = (ev, id) => K.verdicts(ev, SETTINGS).find((v) => v.id === id).pass;
const all = (ev) => K.verdicts(ev, SETTINGS).map((v) => v.pass);

test('six claims, each with its name, its sealed bar and a verdict; with every piece of evidence in, a clean round passes all six', () => {
  const v = K.verdicts(good(), SETTINGS);
  assert.deepEqual(v.map((x) => x.id), ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']);
  assert.deepEqual(v.map((x) => x.pass), [true, true, true, true, true, true]);
  for (const x of v) { assert.equal(x.name, K.NAMES[x.id]); assert.equal(x.bar, K.bars(SETTINGS)[x.id]); assert.equal(typeof x.result, 'string'); }
  assert.match(K.bars(SETTINGS).K1, /at least 5 points/); assert.match(K.bars(SETTINGS).K1, /p < 0\.05/);
  assert.equal(v[0].result, 'base 30.0% (60 of 200), distilled 45.0% (90 of 200): 15.0 points; p = 2.00e-5');
  assert.equal(v[2].result, '40 held-out problems the base failed are solved by the distilled model; 10 the base solved are lost');
});

test('with no evidence every claim is pending: never passed, never failed, by default', () => {
  assert.deepEqual(all({}), [null, null, null, null, null, null]);
  for (const bad of [null, undefined, 7, 'x', []]) assert.deepEqual(all(bad), [null, null, null, null, null, null]);
  // each piece on its own decides only its own claims
  assert.deepEqual(all({ cold: cold() }), [true, true, true, null, null, null]);
  assert.deepEqual(all({ train: good().train }), [null, null, null, null, true, null]);
  assert.deepEqual(all({ held: good().held }), [null, null, null, null, null, true]);
  assert.deepEqual(all({ outcome: good().outcome }), [null, null, null, null, null, null], 'an outcome with no cold test behind it is not a verdict');
  // bars that are not sealed numbers leave the cold claims pending
  assert.deepEqual(K.verdicts({ cold: cold() }, {}).slice(0, 3).map((v) => v.pass), [null, null, null]);
});

test('K1 lift: the bar in points, the exact test, and more gained than lost — all three', () => {
  assert.equal(pass({ cold: cold({ lift: 0.05 }) }, 'K1'), true, 'exactly the bar is the bar met');
  assert.equal(pass({ cold: cold({ lift: 0.049 }) }, 'K1'), false);
  assert.equal(pass({ cold: cold({ p: 0.05 }) }, 'K1'), false, 'p must be below alpha, not at it');
  assert.equal(pass({ cold: cold({ p: 0.0499 }) }, 'K1'), true);
  assert.equal(pass({ cold: cold({ gained: ids(10, 'g'), lost: ids(10, 'l') }) }, 'K1'), false);
  assert.equal(pass({ cold: cold({ lift: -0.2, gained: ids(2, 'g'), lost: ids(40, 'l') }) }, 'K1'), false, 'a significant difference the wrong way is not a lift');
});

test('K2 still honest: no more confident wrong answers than the base; K3 the wall moved outward', () => {
  assert.equal(pass({ cold: cold({ distilled: tally(200, 90, 120) }) }, 'K2'), true, 'as many is not more');
  assert.equal(pass({ cold: cold({ distilled: tally(200, 90, 121) }) }, 'K2'), false);
  assert.match(K.verdicts({ cold: cold() }, SETTINGS)[1].result, /base 120 of 200, distilled 100 of 200; no answer: base 20, distilled 10/);
  assert.equal(pass({ cold: cold({ gained: ids(11, 'g'), lost: ids(10, 'l') }) }, 'K3'), true);
  assert.equal(pass({ cold: cold({ gained: ids(10, 'g'), lost: ids(10, 'l') }) }, 'K3'), false, 'as many lost as gained: the wall did not move outward');
  // a cold test with nothing in it, or not whole, is not measured
  assert.deepEqual(all({ cold: cold({ n: 0 }) }).slice(0, 3), [null, null, null]);
  assert.deepEqual(all({ cold: cold({ gained: null }) }).slice(0, 3), [null, null, null]);
  assert.deepEqual(all({ cold: cold({ p: undefined }) }).slice(0, 3), [null, null, null]);
});

test('K4 verify-or-dissolve: the published outcome is the rule\'s, adopt or dissolve, and the round stood only on granted weights', () => {
  const ev = (outcome, c) => ({ ...good(), cold: c || cold(), outcome });
  assert.equal(pass(ev({ adopted: true, standsOn: [], allowed: [] }), 'K4'), true);
  assert.equal(pass(ev({ adopted: false, standsOn: [], allowed: [] }), 'K4'), false, 'the rule adopts; publishing a dissolve is not the rule\'s outcome');
  // a round that fails its lift must be published as dissolved: that passes K4, and adopting it anyway fails
  const flat = cold({ lift: 0.01 });
  assert.equal(pass(ev({ adopted: false, standsOn: [], allowed: [] }, flat), 'K4'), true);
  assert.equal(pass(ev({ adopted: true, standsOn: [], allowed: [] }, flat), 'K4'), false);
  assert.match(K.verdicts(ev({ adopted: false, standsOn: [], allowed: [] }, flat), SETTINGS)[3].result, /the rule gives: DISSOLVE .*published: dissolved/);
  // it may stand only on the weights the chain allows, in that order
  assert.equal(pass(ev({ adopted: true, standsOn: [SHA], allowed: [SHA] }), 'K4'), true);
  assert.equal(pass(ev({ adopted: true, standsOn: [SHA], allowed: [] }), 'K4'), false, 'it stood on weights nobody granted');
  assert.equal(pass(ev({ adopted: true, standsOn: [], allowed: [SHA] }), 'K4'), false);
  assert.equal(pass(ev({ adopted: true, standsOn: [SHA, 'b'.repeat(64)], allowed: ['b'.repeat(64), SHA] }), 'K4'), false, 'the order is part of it');
  assert.equal(pass(ev({ adopted: 'yes', standsOn: [], allowed: [] }), 'K4'), null); assert.equal(pass(ev({ adopted: true, standsOn: null, allowed: [] }), 'K4'), null);
});

test('K5 clean training data: every example verified, none unverified, and the trainer read exactly that file', () => {
  const ev = (t) => ({ train: { ...good().train, ...t } });
  assert.equal(pass(ev({}), 'K5'), true);
  assert.equal(pass(ev({ unverified: 1, verified: 399 }), 'K5'), false);
  assert.equal(pass(ev({ verified: 399 }), 'K5'), false, 'the counts must add up');
  assert.equal(pass(ev({ examples: 0, verified: 0, trainerExamples: 0 }), 'K5'), false, 'no examples is not clean data');
  assert.equal(pass(ev({ trainerSha256: 'b'.repeat(64) }), 'K5'), false, 'the trainer read another file');
  assert.equal(pass(ev({ trainerExamples: 399 }), 'K5'), false);
  assert.equal(pass(ev({ trainerSha256: undefined }), 'K5'), null, 'built but not trained yet: pending');
  assert.match(K.verdicts(ev({ trainerSha256: undefined }), SETTINGS)[4].result, /the trainer has not run/);
  assert.equal(pass(ev({ fileSha256: undefined }), 'K5'), null); assert.equal(pass(ev({ examples: -1 }), 'K5'), null);
});

test('K6 held-out integrity: no held-out problem trained on, none harvested', () => {
  const ev = (h) => ({ held: { ...good().held, ...h } });
  assert.equal(pass(ev({}), 'K6'), true);
  assert.equal(pass(ev({ overlap: 1 }), 'K6'), false);
  assert.equal(pass(ev({ harvested: 1 }), 'K6'), false);
  assert.equal(pass(ev({ n: 0 }), 'K6'), false, 'an empty held-out block holds nothing out');
  assert.equal(pass(ev({ overlap: undefined }), 'K6'), null); assert.equal(pass(ev({ harvested: 1.5 }), 'K6'), null);
  assert.equal(K.verdicts(ev({ overlap: 2 }), SETTINGS)[5].result, '2 of 200 held-out problems are in the training set; 0 were harvested');
});
