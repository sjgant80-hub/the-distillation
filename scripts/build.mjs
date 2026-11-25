// build.mjs — from a harvest to what the model work needs: the training file (only verified traces, src/trace.mjs)
// and the cold questions (the held-out block, src/cold.mjs), with the held-out problems themselves beside them for a
// reader. Also writes build.json: the counts, the training file's hash, and the two integrity counts (held-out
// problems in training; held-out problems harvested).
//   node scripts/build.mjs <dev | round number>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import SPLIT from '../src/split.mjs';
import TRACE from '../src/trace.mjs';
import COLD from '../src/cold.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url);
export const where = (which) => (which === 'dev' ? 'data/dev' : `data/rounds/${Number(which)}`);

// built(which) → { jsonl, asks, held, build } from the harvest on disk; nothing is written
export function built(which) {
  const settings = JSON.parse(readFileSync(at('data/settings.json'), 'utf8'));
  const P = SPLIT.plan(settings), set = which === 'dev' ? P.dev : P.rounds[Number(which) - 1];
  if (!set) throw new Error('usage: node scripts/build.mjs <dev | round number>');
  const harvest = JSON.parse(readFileSync(at(`${where(which)}/harvest.json`), 'utf8'));
  if (harvest.complete !== true) throw new Error('the harvest is not complete: a round trains on the whole pool or not at all');
  const { examples, counts } = TRACE.built(set.pool, harvest.records, settings.trace.maxLines);
  const jsonl = examples.map((e) => JSON.stringify(e)).join('\n') + '\n';
  const asks = JSON.stringify(set.held.map((t) => ({ id: t.id, messages: COLD.asking(t) })));
  const byId = new Map(set.pool.map((t) => [t.id, t])), trained = examples.map((e) => byId.get(e.id));
  const build = {
    v: 'the-distillation-build/1', set: which, counts, examples: examples.length,
    trainFileSha256: createHash('sha256').update(jsonl).digest('hex'),
    held: set.held.length,
    overlap: SPLIT.overlap(trained, set.held).count,
    // a harvest record names its own calculation, so this count does not take the pool's word for what was harvested
    harvested: SPLIT.overlap(harvest.records.map((r) => ({ ask: r.ask })), set.held).count,
    lines: { most: Math.max(0, ...examples.map((e) => e.lines)), mean: examples.length ? examples.reduce((a, e) => a + e.lines, 0) / examples.length : 0 },
  };
  return { jsonl, asks, held: JSON.stringify(set.held), build };
}

if (process.argv[1] && process.argv[1].endsWith('build.mjs')) {
  const which = process.argv[2], dir = where(which);
  let b;
  try { b = built(which); } catch (e) { console.error(e.message); process.exit(1); }
  writeFileSync(at(`${dir}/train.jsonl`), b.jsonl);
  writeFileSync(at(`${dir}/asks.json`), b.asks);
  writeFileSync(at(`${dir}/held.json`), b.held);
  writeFileSync(at(`${dir}/build.json`), JSON.stringify(b.build, null, 1) + '\n');
  const c = b.build.counts;
  console.log(`${which}: pool ${c.pool}, grown ${c.grown}, complete ${c.complete}, too long ${c.long}, unverified ${c.unverified} → ${b.build.examples} training examples (${b.build.trainFileSha256.slice(0, 12)}); held-out ${b.build.held}, in training ${b.build.overlap}, harvested ${b.build.harvested}`);
}
