// split.mjs — what is trained on, what is held out, and the guard that keeps them apart.
//
// Two problems are the SAME problem when they ask for the same calculation (7 × 8 and 8 × 7 are one, whatever the
// wording round them), or, for a problem that carries no calculation, when they have the same finish line. A held-out
// block is drawn first; every problem in ANY held-out block (every round's, and the dev block) is struck from every
// harvest pool, so nothing the model is ever tested on can be trained on, in this round or a later one. overlap()
// counts what slipped through: it must be nought, and K6 is that count, taken from the files themselves.
//
// The problems come from The Climb's sealed generator (vendored), from seeds fixed in data/settings.json. Pure and
// total: hostile input makes an empty block, never a throw.
import T from '../vendor/crystal/vendor/climb/src/tasks.mjs';
import { evaluate } from '../vendor/crystal/vendor/climb/src/exact.mjs';

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const str = (x) => (typeof x === 'string' ? x : '');

// identity(task) → the problem's identity, or null for what is not a problem
export function identity(task) {
  const ask = get(task, 'ask');
  if (typeof ask === 'string') { const e = evaluate(ask); return e === null ? null : `calc:${e.canon}`; }
  const c = get(task, 'check'), type = str(get(c, 'type'));
  return type === 'factors' || type === 'root' ? `${type}:${str(get(c, 'n'))}:${str(get(c, 'b'))}` : null;
}

// unique(tasks) → { tasks: each problem once (the first to appear, in order), repeats: how many were struck }
export function unique(tasks) {
  const seen = new Set(), out = [];
  let repeats = 0;
  for (const t of Array.isArray(tasks) ? tasks : []) {
    const id = identity(t);
    if (id === null) continue;
    if (seen.has(id)) { repeats++; continue; }
    seen.add(id); out.push(t);
  }
  return { tasks: out, repeats };
}

// block(seed, sheets) → the unique problems of that many sheets of the generator
export const block = (seed, sheets) => unique(T.set(seed, sheets)).tasks;

// less(tasks, struck) → the tasks whose identity is not among the struck tasks' identities
export function less(tasks, struck) {
  const out = new Set((Array.isArray(struck) ? struck : []).map(identity));
  return (Array.isArray(tasks) ? tasks : []).filter((t) => { const id = identity(t); return id !== null && !out.has(id); });
}

// overlap(training, held) → the held-out problems that also stand in training: { count, shared: [identity…] }
export function overlap(training, held) {
  const tr = new Set((Array.isArray(training) ? training : []).map(identity).filter((x) => x !== null));
  const shared = [...new Set((Array.isArray(held) ? held : []).map(identity).filter((x) => x !== null && tr.has(x)))];
  return { count: shared.length, shared };
}

// plan(settings) → every block the settings fix, struck as the law says:
//   dev    { held, pool }                       the builder's own round, on its own seeds
//   rounds [{ round, held, pool }]              held: that round's sealed test block, less every dev problem
//                                               pool: that round's harvest block, less EVERY round's held block
// A pool keeps only problems that carry a calculation: the engine has nothing to grow on the others.
export function plan(settings) {
  const int = (v) => (Number.isInteger(v) && v > 0 ? v : 0), grows = (t) => typeof get(t, 'ask') === 'string';
  const dev = get(settings, 'dev'), R = get(settings, 'rounds'), seeds = Array.isArray(get(R, 'seeds')) ? R.seeds : [];
  const devHeld = block(get(dev, 'testSeed'), int(get(dev, 'testSheets'))), devHarvest = block(get(dev, 'harvestSeed'), int(get(dev, 'harvestSheets')));
  const helds = seeds.map((s) => less(block(get(s, 'test'), int(get(R, 'testSheets'))), [...devHeld, ...devHarvest]));
  const every = helds.flat();
  return {
    dev: { held: devHeld, pool: less(devHarvest, devHeld).filter(grows) },
    rounds: seeds.map((s, i) => ({ round: i + 1, held: helds[i], pool: less(block(get(s, 'harvest'), int(get(R, 'harvestSheets'))), every).filter(grows) })),
  };
}

export default { identity, unique, block, less, overlap, plan };
