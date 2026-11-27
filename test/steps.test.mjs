import { test } from 'node:test';
import assert from 'node:assert/strict';
import S from '../src/steps.mjs';

const HOSTILE = [null, undefined, 7, 'x', {}, [], () => 1, NaN];
const ended = (over) => ({ status: 0, signal: null, seconds: 12.4, stderr: '', ...over });

test('a step that ended well goes on, and its exit is written down', () => {
  assert.deepEqual(S.settle('harvest', ended(), false), { go: true, row: { step: 'harvest', exit: 0, signal: null, seconds: 12, carriedOn: false } });
  assert.deepEqual(S.settle('train', ended({ seconds: 20999.5 }), true).row, { step: 'train', exit: 0, signal: null, seconds: 21000, carriedOn: false }, 'a good exit is never called carried on, whole or not');
  assert.deepEqual(Object.keys(S.settle('judge', ended({ stderr: 'a warning', error: 'x' }), false).row), ['step', 'exit', 'signal', 'seconds', 'carriedOn'], 'a good exit keeps no error text');
});

test('a step that ended badly is carried on from only when its own record was checked whole', () => {
  const t = S.settle('train', ended({ status: 3221225477, stderr: '  Windows fatal exception: access violation\n' }), true);
  assert.deepEqual(t, { go: true, row: { step: 'train', exit: 3221225477, signal: null, seconds: 12, error: null, stderrTail: 'Windows fatal exception: access violation', carriedOn: true, why: S.WHOLE } });
  // the same exit with no whole record stops the round
  const f = S.settle('train', ended({ status: 1 }), false);
  assert.deepEqual([f.go, f.row.exit, f.row.carriedOn, f.row.why], [false, 1, false, S.BROKEN]);
  // "whole" is the runner's own check and nothing looser: a truthy word is not a check
  for (const w of [1, 'true', {}, [], undefined, null, 'yes']) assert.equal(S.settle('train', ended({ status: 1 }), w).go, false, `whole = ${JSON.stringify(w)} is not a check`);
  // only the steps whose record says by itself that it is whole
  assert.deepEqual(S.CARRY, ['train', 'cold-base', 'cold-distilled']);
  for (const step of S.CARRY) assert.equal(S.settle(step, ended({ status: 1 }), true).go, true, step);
  for (const step of ['harvest', 'build', 'judge', 'Train', 'train ', '', 'cold']) {
    const r = S.settle(step, ended({ status: 1 }), true);
    assert.deepEqual([r.go, r.row.carriedOn, r.row.why], [false, false, S.BROKEN], `${step} is not carried on from, whatever is on disk`);
  }
  assert.notEqual(S.WHOLE, S.BROKEN);
  assert.match(S.WHOLE, /checked whole/); assert.match(S.BROKEN, /stops/);
});

test('what is written down: the exit, the signal, the seconds, the error and the last of what the process said', () => {
  // a process a signal ended has no exit number: that is not a good exit
  const k = S.settle('cold-base', { status: null, signal: 'SIGTERM', seconds: 3, stderr: 'x' }, false);
  assert.deepEqual([k.go, k.row.exit, k.row.signal], [false, null, 'SIGTERM']);
  assert.equal(S.settle('cold-base', { status: null, signal: 'SIGTERM' }, true).go, true, 'carried on from only because the record was whole');
  for (const status of [undefined, '0', 0.5, NaN, true, [], {}]) { const r = S.settle('train', ended({ status }), false); assert.deepEqual([r.go, r.row.exit], [false, null], `status ${String(status)} is not a good exit`); }
  assert.equal(S.settle('train', ended({ status: -1 }), false).row.exit, -1);
  assert.equal(S.settle('train', ended({ status: 1, signal: 7 }), false).row.signal, null);
  // seconds: a whole number, never negative, never a non-number
  assert.deepEqual([S.settle('x', ended({ seconds: 0.4 })).row.seconds, S.settle('x', ended({ seconds: 0.5 })).row.seconds, S.settle('x', ended({ seconds: 0 })).row.seconds, S.settle('x', ended({ seconds: -5 })).row.seconds], [0, 1, 0, 0]);
  for (const seconds of ['9', NaN, Infinity, null, undefined, {}]) assert.equal(S.settle('x', ended({ seconds })).row.seconds, 0);
  assert.ok(Object.is(S.settle('x', ended({ seconds: -0 })).row.seconds, 0), 'nought seconds is plain nought');
  // the error, if the process could not be run at all
  assert.equal(S.settle('train', ended({ status: 1, error: 'spawn python ENOENT' }), false).row.error, 'spawn python ENOENT');
  assert.equal(S.settle('train', ended({ status: 1, error: 7 }), false).row.error, null);
  // the last of what it said: trimmed, and no more than the tail
  assert.equal(S.TAIL, 2000);
  const long = 'A' + 'b'.repeat(S.TAIL) + '  \n';
  assert.equal(S.settle('train', ended({ status: 1, stderr: long }), false).row.stderrTail, 'b'.repeat(S.TAIL));
  assert.equal(S.settle('train', ended({ status: 1, stderr: 'A' + 'b'.repeat(S.TAIL - 1) }), false).row.stderrTail, 'A' + 'b'.repeat(S.TAIL - 1));
  assert.equal(S.settle('train', ended({ status: 1, stderr: 7 }), false).row.stderrTail, '');
  assert.equal(S.settle(7, ended()).row.step, '7');
});

test('the rows of a run record that ended badly, for the page', () => {
  const run = { v: 'the-distillation-run/1', sittings: [
    { started: 'a', steps: [{ step: 'harvest', exit: 0, carriedOn: false }, { step: 'train', exit: 3221225477, signal: null, carriedOn: true, why: S.WHOLE }] },
    { started: 'b', steps: [{ step: 'train', skipped: true, why: 'whole already' }, { step: 'cold-base', exit: null, signal: 'SIGTERM', carriedOn: false }, { step: 'judge', exit: 0 }] },
  ] };
  assert.deepEqual(S.bad(run), [{ sitting: 1, step: 'train', exit: 3221225477, signal: null, carriedOn: true }, { sitting: 2, step: 'cold-base', exit: null, signal: 'SIGTERM', carriedOn: false }]);
  assert.deepEqual(S.bad({ sittings: [{ steps: [{ step: 'train', exit: 1, signal: 9, carriedOn: 'yes' }, { step: 'x', exit: '0' }] }] }), [{ sitting: 1, step: 'train', exit: 1, signal: null, carriedOn: false }, { sitting: 1, step: 'x', exit: null, signal: null, carriedOn: false }]);
  assert.deepEqual(S.bad({ sittings: [{ steps: [{ step: 'train', exit: 1, skipped: 'true' }] }] }).length, 1, 'only a step marked skipped is left out');
  assert.deepEqual(S.bad({ sittings: [{ steps: [{ step: 'a', exit: 0 }] }, { steps: 7 }, null, 7] }), []);
});

test('pure and total: garbage in, a settled answer out, and nothing thrown', () => {
  for (const a of HOSTILE) for (const b of HOSTILE) for (const c of HOSTILE) {
    const r = S.settle(a, b, c);
    assert.equal(r.go, false, 'nothing that is not a real good exit or a checked-whole record goes on');
    assert.equal(r.row.carriedOn, false);
  }
  for (const a of HOSTILE) assert.deepEqual(S.bad(a), []);
  const trap = new Proxy({}, { get() { throw new Error('trap'); } });
  assert.equal(S.settle('train', trap, true).row.exit, null);
  assert.deepEqual([S.settle(trap, ended({ status: 1 }), true).go, S.settle(trap, ended()).row.step], [false, ''], 'a name that cannot be read is no name');
  assert.deepEqual(S.bad({ sittings: [{ steps: [{ step: trap, exit: 1 }] }] }), [{ sitting: 1, step: '', exit: 1, signal: null, carriedOn: false }]);
  assert.deepEqual(S.bad(trap), []);
  assert.deepEqual(S.bad({ sittings: [trap, { steps: [trap] }] }), [{ sitting: 2, step: 'undefined', exit: null, signal: null, carriedOn: false }]);
});
