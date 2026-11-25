import { test } from 'node:test';
import assert from 'node:assert/strict';
import S from '../src/split.mjs';
import T from '../vendor/crystal/vendor/climb/src/tasks.mjs';

const SETTINGS = { dev: { harvestSeed: 11, harvestSheets: 6, testSeed: 12, testSheets: 3 }, rounds: { max: 2, harvestSheets: 8, testSheets: 4, seeds: [{ harvest: 21, test: 31 }, { harvest: 22, test: 32 }] } };
const HOSTILE = [null, undefined, 7, 'x', [], {}, () => 1, { get ask() { throw new Error('no'); } }];

test('a problem\'s identity is its calculation, whatever the wording and whichever way round it is written', () => {
  assert.equal(S.identity({ ask: '7 × 8' }), S.identity({ ask: '8 × 7' }));
  assert.equal(S.identity({ ask: '7 × 8', statement: 'A 7 kg mass…' }), S.identity({ ask: '7 × 8', statement: 'A current of 7 A…' }));
  assert.notEqual(S.identity({ ask: '7 × 8' }), S.identity({ ask: '7 × 9' }));
  assert.equal(S.identity({ ask: '7 × 8' }), 'calc:*(7,8)');
  // a problem that carries no calculation is known by its finish line
  assert.equal(S.identity({ ask: null, check: { type: 'factors', n: '10403' } }), 'factors:10403:');
  assert.equal(S.identity({ ask: null, check: { type: 'root', n: '1340', b: '3' } }), 'root:1340:3');
  assert.notEqual(S.identity({ check: { type: 'root', n: '1340', b: '3' } }), S.identity({ check: { type: 'root', n: '1340', b: '4' } }));
  // what is not a problem has no identity
  assert.equal(S.identity({ ask: '7 ×' }), null);
  assert.equal(S.identity({ ask: null, check: { type: 'value', value: '5' } }), null);
  for (const bad of HOSTILE) assert.equal(S.identity(bad), null);
});

test('unique keeps each problem once, the first to appear, and counts the repeats', () => {
  const a = { id: 'a', ask: '7 × 8' }, b = { id: 'b', ask: '8 × 7' }, c = { id: 'c', ask: '2 × 3' };
  assert.deepEqual(S.unique([a, b, c, a]), { tasks: [a, c], repeats: 2 });
  assert.deepEqual(S.unique([a, { id: 'junk' }, null]), { tasks: [a], repeats: 0 }, 'what is not a problem is neither kept nor counted');
  for (const bad of HOSTILE) assert.deepEqual(S.unique(bad), { tasks: [], repeats: 0 });
  // a block is the generator's own sheets, each problem once
  const blk = S.block(21, 8), ids = blk.map(S.identity);
  assert.equal(new Set(ids).size, ids.length); assert.ok(blk.length > 30 && blk.length <= 64);
  assert.deepEqual(blk, S.unique(T.set(21, 8)).tasks);
  assert.deepEqual(S.block(21, 0), []); assert.deepEqual(S.block(null, 3).length > 0, true);
});

test('less strikes every problem that stands among the struck, by identity, not by name', () => {
  const pool = [{ id: 'p1', ask: '7 × 8' }, { id: 'p2', ask: '2 × 3' }, { id: 'p3', ask: '5 + 5' }, { id: 'junk' }];
  assert.deepEqual(S.less(pool, [{ id: 'h', ask: '8 × 7' }]).map((t) => t.id), ['p2', 'p3']);
  assert.deepEqual(S.less(pool, []).map((t) => t.id), ['p1', 'p2', 'p3'], 'what is not a problem is dropped');
  assert.deepEqual(S.less(pool, null).map((t) => t.id), ['p1', 'p2', 'p3']);
  for (const bad of HOSTILE) assert.deepEqual(S.less(bad, pool), []);
});

test('overlap counts the held-out problems that also stand in training: the number that must be nought', () => {
  const tr = [{ ask: '7 × 8' }, { ask: '2 × 3' }], held = [{ ask: '8 × 7' }, { ask: '9 × 9' }, { ask: '8 × 7' }, { id: 'junk' }];
  assert.deepEqual(S.overlap(tr, held), { count: 1, shared: ['calc:*(7,8)'] });
  assert.deepEqual(S.overlap(tr, [{ ask: '9 × 9' }]), { count: 0, shared: [] });
  assert.deepEqual(S.overlap([{ id: 'junk' }], [{ id: 'junk2' }]), { count: 0, shared: [] }, 'two things that are not problems are not the same problem');
  for (const bad of HOSTILE) { assert.deepEqual(S.overlap(bad, held), { count: 0, shared: [] }); assert.deepEqual(S.overlap(tr, bad), { count: 0, shared: [] }); }
});

test('the plan: every held-out block is struck from every pool, the sealed blocks hold no dev problem, and a pool holds only problems with a calculation', () => {
  const P = S.plan(SETTINGS), everyHeld = P.rounds.flatMap((r) => r.held);
  assert.deepEqual(P.rounds.map((r) => r.round), [1, 2]);
  for (const r of P.rounds) {
    assert.ok(r.held.length > 10 && r.pool.length > 20, `${r.held.length} ${r.pool.length}`);
    assert.equal(S.overlap(r.pool, everyHeld).count, 0, 'no pool holds a problem of any round\'s held-out block');
    assert.equal(S.overlap([...P.dev.held, ...P.dev.pool], r.held).count, 0, 'no sealed held-out problem is a dev problem');
    assert.ok(r.pool.every((t) => typeof t.ask === 'string'));
    assert.ok(r.held.some((t) => t.ask === null), 'a held-out block keeps the problems with nothing to grow: they are still asked cold');
  }
  // the struck problems are really gone: the round-1 pool is its harvest block less what was struck, and something was
  const block1 = S.block(21, 8).filter((t) => typeof t.ask === 'string');
  assert.ok(P.rounds[0].pool.length < block1.length);
  assert.deepEqual(P.rounds[0].pool, S.less(block1, everyHeld));
  assert.deepEqual(P.rounds[0].held, S.less(S.block(31, 4), [...S.block(12, 3), ...S.block(11, 6)]));
  assert.equal(S.overlap(P.dev.pool, P.dev.held).count, 0);
  assert.deepEqual(P.dev.held, S.block(12, 3));
  assert.deepEqual(P.dev.pool, S.less(S.block(11, 6), S.block(12, 3)).filter((t) => typeof t.ask === 'string'));
  // sizes that are not whole numbers above nought make empty blocks; hostile settings make an empty plan
  assert.deepEqual(S.plan({ dev: { harvestSeed: 11, harvestSheets: -1, testSeed: 12, testSheets: 1.5 }, rounds: { harvestSheets: 0, testSheets: 0, seeds: [{ harvest: 1, test: 2 }] } }), { dev: { held: [], pool: [] }, rounds: [{ round: 1, held: [], pool: [] }] });
  for (const bad of HOSTILE) assert.deepEqual(S.plan(bad), { dev: { held: [], pool: [] }, rounds: [] });
});
