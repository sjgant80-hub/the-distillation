import { test } from 'node:test';
import assert from 'node:assert/strict';
import TR from '../src/trace.mjs';
import G from '../vendor/crystal/src/grow.mjs';
import T from '../vendor/crystal/vendor/climb/src/tasks.mjs';
import LOOP from '../vendor/crystal/vendor/climb/src/loop.mjs';
import { evaluate, show } from '../vendor/crystal/vendor/climb/src/exact.mjs';

// a model that states every cell exactly right, and one that gets named cells wrong the first time it meets them
const right = async (messages) => { const cell = messages[messages.length - 1].content; return { text: `${cell} = ${show(evaluate(cell).value)}` }; };
const slips = (wrong) => async (messages) => { const cell = messages[messages.length - 1].content; return { text: wrong[cell] ? `${cell} = ${wrong[cell]}` : `${cell} = ${show(evaluate(cell).value)}` }; };
const task = (ask, extra) => ({ id: `t:${ask}`, family: 'own', tier: 'climb', statement: `Work out ${ask}.`, ask, check: { type: 'value', value: show(evaluate(ask).value) }, ...extra });
const tank = task('13 × 12 × 26'), HOSTILE = [null, undefined, 7, 'x', [], {}, () => 1];

test('lines: the verified working of a complete crystal is every cell that bonded, once, in the order it joined', async () => {
  const rec = await G.grow(tank, right, {});
  assert.equal(rec.complete && rec.home, true);
  assert.deepEqual(TR.lines(rec), ['13 × 12 = 156', '156 × 26 = 4056']);
  // a wrong reply is split smaller: the wrong line never appears, the smaller true lines do
  const slipped = await G.grow(tank, slips({ '156 × 26': '4000' }), {});
  assert.equal(slipped.complete && slipped.home, true);
  const ls = TR.lines(slipped);
  assert.ok(!ls.some((l) => l.includes('4000')) && ls.length > 2 && ls[0] === '13 × 12 = 156', JSON.stringify(ls));
  assert.ok(slipped.events.some((e) => e.kind === 'split') && !ls.some((l) => /= .*[×+].*/.test(l.split(' = ')[1])), 'split working is the planner\'s, and is not a line');
  // a cell met twice joins once
  const twice = await G.grow(task('12 × 12 + 12 × 12'), right, {});
  assert.deepEqual(TR.lines(twice), ['12 × 12 = 144', '144 + 144 = 288']);
  assert.ok(twice.events.some((e) => e.kind === 'set') || twice.events.filter((e) => e.kind === 'bond').length === 2);
  // a crystal that did not complete, or did not come home, has no lines at all
  const dead = await G.grow(tank, async () => ({ text: 'no idea' }), {});
  assert.equal(dead.complete, false); assert.equal(TR.lines(dead), null);
  assert.equal(TR.lines({ ...rec, home: false }), null); assert.equal(TR.lines({ ...rec, complete: false }), null);
  // events that are not bonds, or are not whole, are not lines
  assert.deepEqual(TR.lines({ complete: true, home: true, events: [{ kind: 'split', cell: '1 + 1', value: '2', canon: 'a' }, { kind: 'dissolve', cell: '1 + 2', value: '3', canon: 'b' }, { kind: 'bond', cell: 5, value: '3', canon: 'c' }, { kind: 'bond', cell: '2 + 2', value: 4, canon: 'd' }, { kind: 'set', cell: '3 + 3', value: '6', canon: 'e' }, { kind: 'bond', cell: '3 + 3', value: '6', canon: 'e' }] }), ['3 + 3 = 6']);
  assert.deepEqual(TR.lines({ complete: true, home: true, events: null }), []);
  for (const bad of HOSTILE) assert.equal(TR.lines(bad), null);
});

test('example: The Climb\'s own one-try conversation, and the reply to learn: the lines, then the answer', async () => {
  const rec = await G.grow(tank, right, {}), ex = TR.example(tank, rec);
  assert.deepEqual(ex, { id: tank.id, family: 'own', tier: 'climb', messages: LOOP.opening(tank.statement, []), reply: '13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056', lines: 2 });
  assert.equal(ex.messages[ex.messages.length - 1].content, tank.statement);
  // none for a crystal that did not complete, a record of another problem, or a crystal with nothing bonded
  assert.equal(TR.example(tank, await G.grow(tank, async () => ({ text: '?' }), {})), null);
  assert.equal(TR.example(task('2 + 2'), rec), null, 'the record is another problem\'s');
  assert.equal(TR.example(tank, { ...rec, events: [] }), null);
  assert.equal(TR.example({ ...tank, id: undefined }, { ...rec, id: undefined }), null);
  for (const bad of HOSTILE) { assert.equal(TR.example(bad, rec), null); assert.equal(TR.example(tank, bad), null); }
});

test('verified: an example is only-true by arithmetic alone, and every way of spoiling one is caught', async () => {
  const rec = await G.grow(tank, right, {}), ex = TR.example(tank, rec);
  assert.deepEqual(TR.verified(ex, tank), { ok: true, why: 'verified', lines: 2 });
  const spoil = (reply, why) => { const r = TR.verified({ ...ex, reply }, tank); assert.equal(r.ok, false, reply); assert.equal(r.why, why, reply); assert.equal(r.lines, 0); };
  spoil('13 × 12 = 157\n156 × 26 = 4056\nANSWER: 4056', 'line 1 is not a true step');
  spoil('13 × 12 = 156\n156 × 26 = 4057\nANSWER: 4057', 'line 2 is not a true step');
  spoil('13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4057', 'the answer is not the problem\'s');
  spoil('13 × 12 = 156\n13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056', 'a line is written twice');
  spoil('ANSWER: 4056', 'no working');
  spoil('13 × 12 = 156\n156 × 26 = 4056', 'no answer line');
  spoil('13 × 12 = 156\n156 × 26 = 4056\nanswer: 4056', 'no answer line');
  spoil('156 = 156\n156 × 26 = 4056\nANSWER: 4056', 'line 1 is not a true step');           // no operation: not a step
  spoil('13 × 12 = 156 = 156\n156 × 26 = 4056\nANSWER: 4056', 'line 1 is not a true step');   // two equals signs
  spoil('13 × 12 = 150 + 6\n156 × 26 = 4056\nANSWER: 4056', 'line 1 is not a true step');     // the right side is not a plain number
  spoil('I think 13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056', 'line 1 is not a true step');
  spoil('13 × 12 = 156\n\n156 × 26 = 4056\nANSWER: 4056', 'line 2 is not a true step');
  // the second opinion: lines this file's own check would pass, that The Climb's sealed checker reads otherwise
  spoil('13 × 12 = +156\n156 × 26 = 4056\nANSWER: 4056', 'the sealed checker reads it otherwise');   // it does not read the first line as a step
  spoil('13 × 12 = 156\n156 × 26 = 4056\nANSWER: +4056', 'the sealed checker reads it otherwise');   // it does not take that as the answer
  // true steps, the right answer, but of another problem's conversation
  assert.equal(TR.verified({ ...ex, messages: LOOP.opening('Work out something else.', []) }, tank).why, 'the conversation is not the problem\'s');
  assert.equal(TR.verified({ ...ex, messages: null }, tank).ok, false);
  // true lines and the right answer for THIS task but not for the task it is checked against
  assert.equal(TR.verified(ex, task('2 + 2')).ok, false);
  // a true line that is not a step of anything is still a true step; the answer and the conversation are what tie it to the problem
  assert.equal(TR.verified({ ...ex, reply: '2 + 2 = 4\n13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056' }, tank).ok, true);
  for (const bad of HOSTILE) { assert.equal(TR.verified(bad, tank).ok, false); assert.equal(TR.verified(ex, bad).ok, false); }
});

test('built: the training set of a harvest holds only complete crystals that fit and verify, and says why the rest are not in it', async () => {
  const tasks = [tank, task('7 × 8'), task('25 × 25 × 25'), task('9 + 9'), task('31 × 3')];
  const records = [await G.grow(tasks[0], right, {}), await G.grow(tasks[1], right, {}), await G.grow(tasks[2], async () => ({ text: '?' }), {}), await G.grow(tasks[3], right, {})];
  const all = TR.built(tasks, records, 10);
  assert.deepEqual(all.counts, { pool: 5, grown: 4, complete: 3, used: 3, incomplete: 1, long: 0, unverified: 0 });
  assert.deepEqual(all.examples.map((e) => e.id), [tasks[0].id, tasks[1].id, tasks[3].id]);
  // the limit on lines: a trace of exactly the limit is kept, one line longer is left out and counted
  assert.equal(TR.built(tasks, records, 2).counts.used, 3); assert.deepEqual([TR.built(tasks, records, 1).counts.used, TR.built(tasks, records, 1).counts.long], [2, 1]);
  for (const none of [0, -1, 1.5, null, undefined, 'x']) assert.equal(TR.built(tasks, records, none).counts.used, 3, 'no limit given: none applied');
  // nothing is taken on the record's word: a record that says it is complete with a false line in it is not trained on
  const lying = { ...records[1], events: records[1].events.map((e) => (e.kind === 'bond' ? { ...e, value: '57' } : e)), answer: '57' };
  const caught = TR.built(tasks, [records[0], lying], 10);
  assert.deepEqual([caught.counts.used, caught.counts.unverified, caught.examples.map((e) => e.id)], [1, 1, [tasks[0].id]]);
  for (const bad of HOSTILE) { assert.deepEqual(TR.built(bad, records, 10).examples, []); assert.equal(TR.built(tasks, bad, 10).counts.grown, 0); }
  // on the generator's own problems: every example verifies, and the answer line is the task's own finish line
  const real = T.set(5, 2).filter((t) => t.ask !== null), recs = [];
  for (const t of real) recs.push(await G.grow(t, right, {}));
  const b = TR.built(real, recs, 100);
  assert.equal(b.counts.used, real.length); assert.equal(b.counts.unverified, 0);
  for (const e of b.examples) assert.equal(e.reply.split('\n').pop(), `ANSWER: ${real.find((t) => t.id === e.id).check.value}`);
});
