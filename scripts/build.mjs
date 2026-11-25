// build.mjs — from a harvest to what the model work needs: the training file (only verified traces, src/trace.mjs)
// and the cold questions (the held-out block, src/cold.mjs). Also writes build.json: the counts, the training file's
// hash, and the two integrity counts (held-out problems in training; held-out problems harvested).
//   node scripts/build.mjs <dev | round number>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import SPLIT from '../src/split.mjs';
import TRACE from '../src/trace.mjs';
import COLD from '../src/cold.mjs';

const which = process.argv[2];
const at = (p) => new URL(`../${p}`, import.meta.url);
const settings = JSON.parse(readFileSync(at('data/settings.json'), 'utf8'));
const P = SPLIT.plan(settings), set = which === 'dev' ? P.dev : P.rounds[Number(which) - 1];
if (!set) { console.error('usage: node scripts/build.mjs <dev | round number>'); process.exit(2); }
const dir = which === 'dev' ? 'data/dev' : `data/rounds/${Number(which)}`;
const harvest = JSON.parse(readFileSync(at(`${dir}/harvest.json`), 'utf8'));
if (which !== 'dev' && harvest.complete !== true) { console.error('the harvest is not complete: a sealed round trains on the whole pool or not at all'); process.exit(1); }

const { examples, counts } = TRACE.built(set.pool, harvest.records, settings.trace.maxLines);
const jsonl = examples.map((e) => JSON.stringify(e)).join('\n') + '\n';
writeFileSync(at(`${dir}/train.jsonl`), jsonl);
writeFileSync(at(`${dir}/asks.json`), JSON.stringify(set.held.map((t) => ({ id: t.id, messages: COLD.asking(t) }))));
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
writeFileSync(at(`${dir}/build.json`), JSON.stringify(build, null, 1) + '\n');
console.log(`${which}: pool ${counts.pool}, grown ${counts.grown}, complete ${counts.complete}, too long ${counts.long}, unverified ${counts.unverified} → ${examples.length} training examples (${build.trainFileSha256.slice(0, 12)}); held-out ${build.held}, in training ${build.overlap}, harvested ${build.harvested}`);
