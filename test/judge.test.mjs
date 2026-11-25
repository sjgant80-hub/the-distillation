import { test } from 'node:test';
import assert from 'node:assert/strict';
import J from '../src/judge.mjs';
import TR from '../src/trace.mjs';
import G from '../vendor/crystal/src/grow.mjs';
import { sha256 } from '../vendor/crystal/vendor/climb/src/sha256.mjs';
import { evaluate, show } from '../vendor/crystal/vendor/climb/src/exact.mjs';

const W = 'a'.repeat(64), SEAL = 'e'.repeat(64), AD = 'd'.repeat(64), A1 = 'b'.repeat(64), OTHER = 'c'.repeat(64);
const SETTINGS = { model: { weightsSha256: W }, harvest: { maxTokens: 24, maxTicks: 256 }, cold: { maxTokens: 256, batch: 8 }, train: { rank: 16, epochs: 3 }, bars: { liftPoints: 5, alpha: 0.05 }, rounds: { max: 4 }, spend: { hoursPerRound: 12, hoursInAll: 48 } };
const right = async (messages) => { const cell = messages[messages.length - 1].content; return { text: `${cell} = ${show(evaluate(cell).value)}` }; };
const task = (ask, tier) => ({ id: `t:${ask}`, family: 'own', tier, statement: `Work out ${ask}.`, ask, check: { type: 'value', value: show(evaluate(ask).value) } });
const POOL = ['13 × 12 × 26', '7 × 8', '9 + 9', '31 × 3'].map((a, i) => task(a, i < 2 ? 'climb' : 'easy'));
const HELD = ['11 × 11', '12 × 12', '14 × 3', '15 × 4', '16 × 5', '17 × 6', '18 × 7', '19 × 8'].map((a, i) => task(a, i < 4 ? 'climb' : 'wall'));
const RECORDS = []; for (const t of POOL) RECORDS.push(await G.grow(t, right, {}));
const TRAIN = TR.built(POOL, RECORDS, 24).examples.map((e) => JSON.stringify(e)).join('\n') + '\n';
const reply = (t, how) => (how === 'right' ? `${t.ask} = ${t.check.value}\nANSWER: ${t.check.value}` : how === 'wrong' ? `ANSWER: ${Number(t.check.value) + 1}` : 'I cannot tell.');
const cold = (hows, adapters, over) => ({ complete: true, weightsSha256: W, adapters, maxTokens: 256, seconds: 900, rows: HELD.map((t, i) => ({ id: t.id, text: reply(t, hows[i]), cut: false })), ...over });
const BASE = ['right', 'wrong', 'wrong', 'none', 'wrong', 'none', 'wrong', 'wrong'], DIST = ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'wrong'];
const harvest = (over) => ({ complete: true, sealSha256: SEAL, weightsSha256: W, adapters: [], settings: { maxTokens: 24, maxTicks: 256 }, seconds: 3600, records: RECORDS, ...over });
const log = (over) => ({ weightsSha256: W, settings: { rank: 16, epochs: 3 }, standsOn: [], trainFileSha256: sha256(TRAIN), examples: 4, adapterSha256: AD, seconds: 1800, ...over });
// a round that passes everything: 8 held out, the base right on 1, the distilled model on 7 (6 gained, none lost)
const round = (over) => ({ which: 1, settings: SETTINGS, set: { held: HELD, pool: POOL }, seal: SEAL, history: [], grants: {}, harvest: harvest(), train: TRAIN, log: log(), coldBase: cold(BASE, []), coldDistilled: cold(DIST, [AD]), ...over });
const grant = (r, sha) => ({ by: 'human', action: 'adopt-weights', round: r, adapterSha256: sha, words: 'adopt it', at: '2026-11-26T09:00:00Z' });
const passes = (v) => v.verdicts.map((x) => x.pass);
const pending = (v, note) => { assert.deepEqual(passes(v).slice(0, 4), [null, null, null, null]); assert.deepEqual([v.cold, v.tiers, v.adopted, v.why, v.next], [null, null, null, 'no outcome yet', undefined]); assert.deepEqual(v.notes, [note]); };

test('a clean round: every record taken as evidence, all six claims ruled on, the rule applied, and what the loop may do next', () => {
  const v = J.judge(round());
  assert.deepEqual(v.verdicts.map((x) => x.id), ['K1', 'K2', 'K3', 'K4', 'K5', 'K6']); assert.deepEqual(passes(v), [true, true, true, true, true, true]);
  assert.deepEqual([v.v, v.set, v.round, v.sealSha256, v.adopted, v.why, v.adapterSha256], ['the-distillation-verdict/1', '1', 1, SEAL, true, 'the cold lift cleared its bar and it is no less honest', AD]);
  assert.deepEqual(v.standsOn, []); assert.deepEqual(v.notes, []);
  assert.deepEqual([v.cold.n, v.cold.base.right, v.cold.base.wrong, v.cold.base.none, v.cold.distilled.right, v.cold.distilled.wrong, v.cold.gained.length, v.cold.lost.length, v.cold.p], [8, 1, 5, 2, 7, 1, 6, 0, 2 / 64]);
  // an hour of harvest, half an hour of training, a quarter of an hour for each cold test
  assert.equal(v.hours, 2); assert.deepEqual(v.seconds, { harvest: 3600, train: 1800, coldBase: 900, coldDistilled: 900 });
  assert.deepEqual(v.harvest, { problems: 4, complete: 4, calls: RECORDS.reduce((a, r) => a + r.calls, 0) }); assert.ok(v.harvest.calls >= 5);
  assert.deepEqual(v.tiers.base, { easy: { n: 0, right: 0, wrong: 0, none: 0, rate: 0, silent: 0 }, climb: { n: 4, right: 1, wrong: 2, none: 1, rate: 0.25, silent: 0.5 }, wall: { n: 4, right: 0, wrong: 3, none: 1, rate: 0, silent: 0.75 } });
  assert.deepEqual([v.tiers.distilled.climb.right, v.tiers.distilled.wall.right, v.tiers.distilled.wall.wrong], [4, 3, 1]);
  assert.deepEqual(v.train, { examples: 4, verified: 4, unverified: 0, fileSha256: sha256(TRAIN), trainerSha256: sha256(TRAIN), trainerExamples: 4 }); assert.deepEqual(v.held, { n: 8, overlap: 0, harvested: 0 });
  // adopted by the rule, not yet granted: the loop waits for a person
  assert.deepEqual([v.next.act, v.next.round], ['wait', 1]); assert.deepEqual([v.spend.total, v.spend.capped], [2, false]);
  assert.deepEqual(v.gauge, [{ round: 1, base: 0.125, distilled: 0.875, lift: 0.75, gained: 6, lost: 0, adopted: true, granted: false }]);
  const g = J.judge(round({ grants: { 1: grant(1, AD) } }));
  assert.deepEqual([g.next.act, g.next.round, g.gauge[0].granted], ['run', 2, true]);
  assert.deepEqual(J.row(v), { round: 1, adopted: true, adapterSha256: AD, base: 0.125, distilled: 0.875, lift: 0.75, gained: 6, lost: 0, hours: 2 });
  assert.deepEqual(J.TIERS, ['easy', 'climb', 'wall']);
  // a crystal counts as finished only when it is complete AND came home to the problem's answer
  const half = J.judge(round({ harvest: harvest({ records: [...RECORDS, { id: 'x', complete: true, home: false, calls: 2 }, { id: 'y', complete: false, home: true, calls: 3 }] }) }));
  assert.deepEqual(half.harvest, { problems: 6, complete: 4, calls: v.harvest.calls + 5 });
});

test('the development round is judged the same way, outside the seal and outside the loop', () => {
  const v = J.judge(round({ which: 'dev', seal: null, harvest: harvest({ sealSha256: null }) }));
  assert.deepEqual(passes(v), [true, true, true, true, true, true]);
  assert.deepEqual([v.set, v.round, v.sealSha256, v.adopted, v.next, v.spend, v.gauge], ['dev', 0, null, true, undefined, undefined, undefined]);
  assert.equal(J.judge(round({ which: 'dev', harvest: harvest({ sealSha256: OTHER }) })).sealSha256, null, 'the development round is under no seal, whatever seal there is');
});

test('a harvest is evidence only when whole, on the sealed weights, with the sealed settings, under this seal', () => {
  const none = (v, note) => { assert.deepEqual(passes(v), [null, null, null, null, null, null]); assert.deepEqual([v.harvest, v.train, v.held, v.cold, v.adopted, v.standsOn], [null, null, null, null, null, null]); assert.deepEqual(v.notes, [note]); assert.equal(v.seconds.harvest, 0); };
  none(J.judge(round({ harvest: harvest({ complete: false }) })), 'the harvest is not complete');
  none(J.judge(round({ harvest: harvest({ records: null }) })), 'the harvest is not complete');
  none(J.judge(round({ harvest: harvest({ weightsSha256: OTHER }) })), 'the harvest was not made on the sealed weights');
  none(J.judge(round({ harvest: harvest({ weightsSha256: undefined }), log: null, settings: { ...SETTINGS, model: {} } })), 'the harvest was not made on the sealed weights');
  assert.deepEqual(J.judge(round({ harvest: harvest({ weightsSha256: undefined }), log: log({ weightsSha256: undefined }), settings: { ...SETTINGS, model: {} } })).notes, ['the harvest was not made on the sealed weights', 'the trainer did not start from the sealed weights'], 'no weights named is no match');
  none(J.judge(round({ harvest: harvest({ settings: { maxTokens: 48, maxTicks: 256 } }) })), 'the harvest was not made with the sealed settings');
  none(J.judge(round({ harvest: harvest({ settings: undefined }), settings: { ...SETTINGS, harvest: undefined } })), 'the harvest was not made with the sealed settings');
  none(J.judge(round({ harvest: harvest({ sealSha256: OTHER }) })), 'the harvest was not made under this seal');
  none(J.judge(round({ seal: null, harvest: harvest({ sealSha256: null }) })), 'the harvest was not made under this seal');
  none(J.judge(round({ seal: 7, harvest: harvest({ sealSha256: 7 }) })), 'the harvest was not made under this seal');
  // with no harvest at all there is nothing to note, and nothing is ruled on
  const v = J.judge(round({ harvest: null })); assert.deepEqual(passes(v), [null, null, null, null, null, null]); assert.deepEqual(v.notes, []); assert.equal(v.hours, 0.5 , 'only the records that were taken count their hours');
  assert.equal(J.judge(round({ harvest: undefined })).harvest, null);
});

test('the trainer\'s record is evidence only from the sealed weights with the sealed settings; without it K5 waits', () => {
  for (const [over, note] of [[{ weightsSha256: OTHER }, 'the trainer did not start from the sealed weights'], [{ settings: { rank: 8, epochs: 3 } }, 'the trainer did not use the sealed settings']]) {
    const v = J.judge(round({ log: log(over) }));
    assert.deepEqual(passes(v), [null, null, null, null, null, true]); assert.deepEqual(v.notes, [note]);
    assert.deepEqual([v.adapterSha256, v.cold, v.adopted, v.seconds.train, v.hours], [null, null, null, 0, 1]);
    assert.deepEqual(v.train, { examples: 4, verified: 4, unverified: 0, fileSha256: sha256(TRAIN) }); assert.match(v.verdicts[4].result, /the trainer has not run/);
  }
  const v = J.judge(round({ log: null })); assert.deepEqual(passes(v), [null, null, null, null, null, true]); assert.deepEqual(v.notes, []);
  assert.equal(J.judge(round({ log: log({ adapterSha256: 7 }) })).adapterSha256, null);
});

test('the cold tests are evidence only when every part of the round was made on the same weights, as sealed, one reply for every held-out problem', () => {
  pending(J.judge(round({ coldBase: cold(BASE, [A1]) })), 'the parts of the round were not all made on the same weights');
  pending(J.judge(round({ harvest: harvest({ adapters: [A1] }) })), 'the parts of the round were not all made on the same weights');
  pending(J.judge(round({ log: log({ standsOn: [A1] }) })), 'the parts of the round were not all made on the same weights');
  pending(J.judge(round({ coldDistilled: cold(DIST, [A1, AD]) })), 'the parts of the round were not all made on the same weights');
  pending(J.judge(round({ coldDistilled: cold(DIST, null) })), 'the parts of the round were not all made on the same weights');
  pending(J.judge(round({ coldBase: cold(BASE, [], { maxTokens: 128 }) })), 'the base cold test was not made as sealed');
  pending(J.judge(round({ coldBase: cold(BASE, [], { complete: false }) })), 'the base cold test was not made as sealed');
  pending(J.judge(round({ coldBase: cold(BASE, [], { weightsSha256: OTHER }) })), 'the base cold test was not made as sealed');
  // the distilled test must be the base's weights plus THIS round's adapter
  pending(J.judge(round({ coldDistilled: cold(DIST, [OTHER]) })), 'the distilled cold test was not made as sealed');
  pending(J.judge(round({ coldDistilled: cold(DIST, [AD], { maxTokens: 128 }) })), 'the distilled cold test was not made as sealed');
  pending(J.judge(round({ coldDistilled: cold(DIST, []) })), 'the distilled cold test was not made as sealed');
  // one reply for every held-out problem: none missing, none twice, none from elsewhere
  const rows = cold(BASE, []).rows;
  pending(J.judge(round({ coldBase: cold(BASE, [], { rows: rows.slice(1) }) })), 'a cold test does not hold one reply for every held-out problem');
  pending(J.judge(round({ coldBase: cold(BASE, [], { rows: [...rows.slice(1), rows[1]] }) })), 'a cold test does not hold one reply for every held-out problem');
  pending(J.judge(round({ coldBase: cold(BASE, [], { rows: [...rows.slice(1), { id: 'elsewhere', text: 'ANSWER: 1', cut: false }] }) })), 'a cold test does not hold one reply for every held-out problem');
  pending(J.judge(round({ coldDistilled: cold(DIST, [AD], { rows: cold(DIST, [AD]).rows.slice(0, 7) }) })), 'a cold test does not hold one reply for every held-out problem');
  pending(J.judge(round({ coldBase: cold(BASE, [], { rows: null }) })), 'a cold test does not hold one reply for every held-out problem');
  // a cold test that was not taken does not count its hours; one missing altogether is no note, only a wait
  assert.deepEqual(J.judge(round({ coldBase: cold(BASE, [], { maxTokens: 128 }) })).seconds, { harvest: 3600, train: 1800, coldBase: 0, coldDistilled: 0 });
  for (const over of [{ coldBase: null }, { coldDistilled: null }, { coldBase: undefined }]) { const v = J.judge(round(over)); assert.deepEqual(passes(v), [null, null, null, null, true, true]); assert.deepEqual(v.notes, []); assert.equal(v.standsOn, null); assert.equal(v.hours, 1.5); }
  // a reply that was cut off loses its last line before it is read
  const cut = cold(DIST, [AD]); cut.rows[0] = { ...cut.rows[0], cut: true };
  assert.equal(J.judge(round({ coldDistilled: cut })).cold.distilled.right, 6, 'the cut line was the answer line');
});

test('the training file is verified again from its own text, and set against the held-out block', async () => {
  const spoiled = TRAIN.replace('7 × 8 = 56', '7 × 8 = 57');
  let v = J.judge(round({ train: spoiled, log: log({ trainFileSha256: sha256(spoiled) }) }));
  assert.deepEqual([v.train.examples, v.train.verified, v.train.unverified, v.verdicts[4].pass], [4, 3, 1, false]); assert.equal(v.adopted, true, 'the rule is K1 and K2; K5 failing is published beside it, in red');
  // the trainer read another file than the one published
  v = J.judge(round({ train: spoiled })); assert.deepEqual([v.train.fileSha256 === sha256(spoiled), v.verdicts[4].pass], [true, false]); assert.match(v.verdicts[4].result, /ANOTHER file/);
  // a line that is not an example at all is an unverified example
  v = J.judge(round({ train: TRAIN + 'not json\n' })); assert.deepEqual([v.train.examples, v.train.verified, v.train.unverified], [5, 4, 1]); assert.equal(v.held.overlap, 1, 'and it is not a pool problem');
  // an example of a problem that is not in the pool: unverified, and counted against the held-out claim
  const stray = JSON.stringify(TR.example(HELD[0], { id: HELD[0].id, complete: true, home: true, answer: '121', events: [{ kind: 'bond', cell: '11 × 11', value: '121', canon: 'x' }] }));
  v = J.judge(round({ train: TRAIN + stray + '\n' })); assert.deepEqual([v.train.unverified, v.held.overlap, v.verdicts[5].pass], [1, 1, false]);
  // a pool problem that is the same calculation as a held-out one, worded another way
  const twin = { ...task('11 × 11', 'climb'), id: 'twin', statement: 'Eleven rows of eleven. How many?' }, rec = await G.grow(twin, right, {});
  const leaked = TR.built([...POOL, twin], [...RECORDS, rec], 24).examples.map((e) => JSON.stringify(e)).join('\n') + '\n';
  v = J.judge(round({ set: { held: HELD, pool: [...POOL, twin] }, harvest: harvest({ records: [...RECORDS, rec] }), train: leaked, log: log({ trainFileSha256: sha256(leaked), examples: 5 }) }));
  assert.deepEqual([v.train.verified, v.held.overlap, v.held.harvested, v.verdicts[4].pass, v.verdicts[5].pass], [5, 1, 1, true, false]);
  // harvested but not trained on is still a breach
  v = J.judge(round({ harvest: harvest({ records: [...RECORDS, rec] }) })); assert.deepEqual([v.held.overlap, v.held.harvested, v.verdicts[5].pass], [0, 1, false]);
  // no text, no K5 and no K6; blank lines are not examples
  v = J.judge(round({ train: null })); assert.deepEqual([v.train, v.held, v.verdicts[4].pass, v.verdicts[5].pass], [null, null, null, null]);
  assert.equal(J.judge(round({ train: '\n' + TRAIN + '\n  \n' })).train.examples, 4);
  assert.equal(J.judge(round({ train: '' })).train.examples, 0); assert.equal(J.judge(round({ train: '' })).verdicts[4].pass, false);
});

test('the rule decides and the outcome is published either way: a lift that misses dissolves, and the house is full', () => {
  // the distilled model no better than the base
  let v = J.judge(round({ coldDistilled: cold(BASE, [AD]) }));
  assert.deepEqual(passes(v), [false, true, false, true, true, true]); assert.deepEqual([v.adopted, v.why, v.next.act], [false, 'the cold lift did not clear its bar', 'full']);
  assert.match(v.verdicts[3].result, /the rule gives: DISSOLVE .*published: dissolved/);
  // more right, and more confidently wrong: not adopted
  const liar = ['right', 'right', 'right', 'right', 'right', 'right', 'right', 'wrong'], meek = ['right', 'none', 'none', 'none', 'none', 'none', 'none', 'none'];
  v = J.judge(round({ coldBase: cold(meek, []), coldDistilled: cold(liar, [AD]) }));
  assert.deepEqual(passes(v), [true, false, true, true, true, true]); assert.deepEqual([v.adopted, v.why], [false, 'it got more answers right and more confidently wrong: not adopted']);
  // the bars are the settings': with a bar no round could reach, the same records dissolve
  v = J.judge(round({ settings: { ...SETTINGS, bars: { liftPoints: 80, alpha: 0.05 } } })); assert.deepEqual([v.verdicts[0].pass, v.adopted], [false, false]);
  v = J.judge(round({ settings: { ...SETTINGS, bars: undefined } })); assert.deepEqual([passes(v).slice(0, 4), v.adopted, v.why], [[null, null, null, null], false, 'the lift was not measured: nothing is adopted on faith']);
});

test('a later round stands only on weights the rule adopted and a person granted', () => {
  const r1 = J.row(J.judge(round())), on = { which: 2, history: [r1], harvest: harvest({ adapters: [AD] }), log: log({ standsOn: [AD], adapterSha256: A1 }), coldBase: cold(BASE, [AD]), coldDistilled: cold(DIST, [AD, A1]) };
  let v = J.judge(round({ ...on, grants: { 1: grant(1, AD) } }));
  assert.deepEqual(passes(v), [true, true, true, true, true, true]); assert.deepEqual([v.standsOn, v.adapterSha256, v.round, v.set], [[AD], A1, 2, '2']);
  assert.deepEqual(v.gauge.map((g) => [g.round, g.adopted, g.granted]), [[1, true, true], [2, true, false]]); assert.deepEqual([v.next.act, v.next.round, v.spend.total], ['wait', 2, 4]);
  // the same records with no grant on file: it stood on weights nobody granted
  v = J.judge(round({ ...on, grants: {} })); assert.deepEqual([v.verdicts[3].pass, v.adopted], [false, true]); assert.match(v.verdicts[3].result, /NOT all adopted and granted/);
  // a first round that stood on something is standing on weights nobody adopted
  v = J.judge(round({ harvest: harvest({ adapters: [OTHER] }), log: log({ standsOn: [OTHER] }), coldBase: cold(BASE, [OTHER]), coldDistilled: cold(DIST, [OTHER, AD]) })); assert.equal(v.verdicts[3].pass, false);
  // the round's own grant opens the next round
  v = J.judge(round({ ...on, grants: { 1: grant(1, AD), 2: grant(2, A1) } })); assert.deepEqual([v.next.act, v.next.round], ['run', 3]);
});

test('what is not a round has no verdict, and nothing thrown at it breaks it', () => {
  const blank = J.judge({});
  assert.deepEqual([blank.set, blank.round, blank.adopted, blank.why, blank.hours, blank.cold, blank.train, blank.held, blank.harvest, blank.tiers, blank.standsOn, blank.adapterSha256, blank.sealSha256], [null, null, null, 'no outcome yet', 0, null, null, null, null, null, null, null, null]);
  assert.deepEqual(blank.notes, ['there is no such round']); assert.deepEqual(passes(blank), [null, null, null, null, null, null]); assert.deepEqual(blank.seconds, { harvest: 0, train: 0, coldBase: 0, coldDistilled: 0 });
  for (const which of [0, -1, 1.5, '1', null, undefined, {}, 'sealed']) assert.deepEqual(J.judge(round({ which })).notes, ['there is no such round'], String(which));
  for (const bad of [null, undefined, 7, 'x', [], () => 1]) { assert.doesNotThrow(() => J.judge(bad)); assert.deepEqual(J.judge(bad).notes, ['there is no such round']); }
  // a record with a hole in it is not evidence, and is not an error
  const holed = [null, ...cold(BASE, []).rows.slice(1)];
  pending(J.judge(round({ coldBase: cold(BASE, [], { rows: holed }) })), 'a cold test does not hold one reply for every held-out problem');
  const trap = { get id() { throw new Error('no'); }, get rows() { throw new Error('no'); }, get records() { throw new Error('no'); }, get adapters() { throw new Error('no'); }, get complete() { throw new Error('no'); } };
  for (const bad of [7, 'x', [], {}, () => 1, trap, [trap], { rows: [trap], records: [trap], held: [trap, 7], pool: [trap, 7], complete: true }]) for (const key of ['settings', 'set', 'history', 'grants', 'harvest', 'log', 'coldBase', 'coldDistilled', 'train']) assert.doesNotThrow(() => J.judge(round({ [key]: bad })), key + ' = ' + String(bad));
  // a pool with things in it that are not problems, and training lines that are not examples
  const odd = J.judge(round({ set: { held: [...HELD, 7, null], pool: [...POOL, 7, null, trap] }, train: TRAIN + 'null\n7\n' }));
  assert.deepEqual([odd.train.examples, odd.train.verified, odd.train.unverified, odd.held.overlap], [6, 4, 2, 2]);
  assert.equal(J.judge(round({ harvest: harvest({ records: [...RECORDS, null, trap, { calls: 'x', complete: true, home: true }] }) })).harvest.calls, RECORDS.reduce((x, r) => x + r.calls, 0));
  assert.equal(J.judge(round({ harvest: harvest({ seconds: 'x' }) })).seconds.harvest, 0); assert.equal(J.judge(round({ harvest: harvest({ seconds: 0 }) })).seconds.harvest, 0); assert.equal(J.judge(round({ harvest: harvest({ seconds: 0.5 }) })).seconds.harvest, 0.5); assert.equal(J.judge(round({ harvest: harvest({ seconds: Infinity }) })).seconds.harvest, 0); assert.equal(J.judge(round({ harvest: harvest({ seconds: -5 }) })).hours, 1);
  assert.deepEqual(J.row(null), { round: undefined, adopted: undefined, adapterSha256: undefined, base: undefined, distilled: undefined, lift: undefined, gained: 0, lost: 0, hours: undefined });
});
