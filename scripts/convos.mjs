// convos.mjs — sample conversations of the two kinds the model is asked: a Crystal cell (with a few bonded turns before
// it, of varying length), a cold one-try, and whole problems grown call by call (the conversation the harvest really
// has: it only grows, and a wrong reply is not carried). For py/parity.py, which checks the batched generation against
// plain one-at-a-time generation.   node scripts/convos.mjs <seed> <sheets> > convos.json
import T from '../vendor/crystal/vendor/climb/src/tasks.mjs';
import G from '../vendor/crystal/src/grow.mjs';
import LOOP from '../vendor/crystal/vendor/climb/src/loop.mjs';
import LEFT from '../vendor/crystal/vendor/climb/src/left.mjs';

const [seed, sheets] = process.argv.slice(2).map(Number);
const tasks = T.set(seed || 7, sheets || 3);
const cells = [], cold = [];
for (const t of tasks) {
  cold.push({ kind: 'cold', id: t.id, messages: LOOP.opening(t.statement, []), max: 128 });
  if (t.ask === null) continue;
  const x = LEFT.start(t.ask), ready = G.frontier(x, new Set());
  // each ready cell, asked after none, one, or two invented bonded turns, so the conversations differ in length
  ready.forEach((cell, i) => {
    const bonded = [['12 × 3', '12 × 3 = 36'], ['40 + 9', '40 + 9 = 49']].slice(0, i % 3);
    cells.push({ kind: 'cell', id: `${t.id}#${i}`, messages: G.asking(bonded, cell), max: 24 });
  });
}
// whole problems, grown by the sealed engine against a stand-in that answers each cell exactly (and, for every other
// problem, gets every fourth cell wrong the first time, so that some turns are not carried): every call it was asked
const { evaluate, show } = await import('../vendor/crystal/vendor/climb/src/exact.mjs');
const grown = [];
let k = 0;
for (const t of tasks.filter((x) => x.ask !== null).slice(0, 16)) {
  const calls = [], slip = k++ % 2 === 1;
  await G.grow(t, async (messages) => {
    calls.push(messages);
    const cell = messages[messages.length - 1].content, v = evaluate(cell).value;
    return { text: slip && calls.length % 4 === 0 ? `${cell} = ${show(v)}1` : `${cell} = ${show(v)}` };
  }, {});
  grown.push({ id: t.id, calls: calls.slice(0, 12) });
}
process.stdout.write(JSON.stringify({ cells, cold, grown }));
