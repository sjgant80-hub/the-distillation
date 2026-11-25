// publish.mjs — what the page reads. First every round on file is decided again from its own files (scripts/check.mjs);
// only if that holds does it write:
//   data/published.json   which rounds are on file, and which carry a person's grant
//   data/trace.json       one real harvested problem (every reply the model gave, what bonded, what was dissolved, and
//                         the training example built from it) and one real held-out problem (what each model said,
//                         cold), taken from the newest round on file, for the page's "how it works"
// Nothing is edited: both files are derived from the round's records, and --check derives them again and compares.
//   node scripts/publish.mjs            write them
//   node scripts/publish.mjs --check    CI: the files on disk are exactly what the records give
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import SPLIT from '../src/split.mjs';
import TRACE from '../src/trace.mjs';
import COLD from '../src/cold.mjs';
import { checked } from './check.mjs';
import { where } from './judge.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url), has = (p) => existsSync(at(p)), json = (p) => JSON.parse(readFileSync(at(p), 'utf8'));

export async function derived() {
  const { lines, rounds } = await checked();
  const sealed = rounds.filter((r) => r !== 'dev').map(Number);
  const published = { v: 'the-distillation-published/1', dev: rounds.includes('dev'), rounds: sealed, grants: sealed.filter((k) => has(`data/grants/round-${k}.json`)) };
  let trace = null;
  const which = sealed.length ? String(sealed[sealed.length - 1]) : rounds.includes('dev') ? 'dev' : null;
  if (which !== null) {
    const dir = where(which), settings = json('data/settings.json'), P = SPLIT.plan(settings), set = which === 'dev' ? P.dev : P.rounds[Number(which) - 1];
    const harvest = json(`${dir}/harvest.json`), byId = new Map(set.pool.map((t) => [t.id, t]));
    // a harvested problem where the model got a step wrong and the engine split it smaller: short enough to read
    const complete = harvest.records.filter((r) => r.complete && r.home && TRACE.example(byId.get(r.id), r) !== null);
    const rec = complete.find((r) => r.events.some((e) => e.kind === 'split') && r.events.length >= 3 && r.events.length <= 9) || complete.find((r) => r.events.filter((e) => e.kind === 'bond').length >= 2) || complete[0] || null;
    const ex = rec ? TRACE.example(byId.get(rec.id), rec) : null;
    trace = { v: 'the-distillation-trace/1', from: which === 'dev' ? 'the development round' : `round ${which}`, harvested: rec ? { id: rec.id, tier: rec.tier, statement: byId.get(rec.id).statement, task: byId.get(rec.id), calls: rec.calls, events: rec.events.map((e) => ({ kind: e.kind, cell: e.cell, said: e.said, value: e.value, into: e.into })), reply: ex.reply, lines: ex.lines } : null, held: null };
    if (has(`${dir}/cold-base.json`) && has(`${dir}/cold-distilled.json`)) {
      const cb = json(`${dir}/cold-base.json`), cd = json(`${dir}/cold-distilled.json`), heldById = new Map(set.held.map((t) => [t.id, t]));
      const b = new Map(cb.rows.map((r) => [r.id, r])), rows = cd.rows.filter((r) => heldById.has(r.id) && b.has(r.id)).map((r) => ({ t: heldById.get(r.id), base: { text: b.get(r.id).text, ...COLD.read(b.get(r.id).text, heldById.get(r.id), b.get(r.id).cut) }, distilled: { text: r.text, ...COLD.read(r.text, heldById.get(r.id), r.cut) } }));
      const gained = rows.filter((r) => r.base.outcome !== 'right' && r.distilled.outcome === 'right');
      const pick = gained.find((r) => r.t.tier !== 'easy' && r.distilled.text.length <= 320 && r.base.text.length <= 320) || gained[0] || rows[0] || null;
      if (pick) trace.held = { id: pick.t.id, tier: pick.t.tier, statement: pick.t.statement, base: { text: pick.base.text, outcome: pick.base.outcome }, distilled: { text: pick.distilled.text, outcome: pick.distilled.outcome } };
    }
  }
  return { lines, published: JSON.stringify(published, null, 1) + '\n', trace: JSON.stringify(trace, null, 1) + '\n' };
}

if (process.argv[1] && process.argv[1].endsWith('publish.mjs')) {
  let d;
  try { d = await derived(); } catch (e) { console.error(`not published: ${e.message}`); process.exit(1); }
  for (const l of d.lines) console.log(l);
  if (process.argv[2] === '--check') {
    const same = has('data/published.json') && readFileSync(at('data/published.json'), 'utf8') === d.published && has('data/trace.json') && readFileSync(at('data/trace.json'), 'utf8') === d.trace;
    console.log(same ? 'data/published.json and data/trace.json are exactly what the records give' : 'data/published.json or data/trace.json is not what the records give');
    process.exit(same ? 0 : 1);
  }
  writeFileSync(at('data/published.json'), d.published); writeFileSync(at('data/trace.json'), d.trace);
  console.log('published: data/published.json, data/trace.json');
}
