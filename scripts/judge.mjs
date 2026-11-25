// judge.mjs — the verdict of a round, worked out from its files and nothing else: the training file is verified
// again line by line, every cold reply of both models is read again, the six claims are ruled on, and the adoption
// rule is applied. Writes verdict.json. It trusts no count another script wrote down.
//   node scripts/judge.mjs <dev | round number>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import SPLIT from '../src/split.mjs';
import TRACE from '../src/trace.mjs';
import COLD from '../src/cold.mjs';
import CLAIMS from '../src/claims.mjs';
import ADOPT from '../src/adopt.mjs';
import ROUNDS from '../src/rounds.mjs';

const which = process.argv[2];
const at = (p) => new URL(`../${p}`, import.meta.url), has = (p) => existsSync(at(p)), json = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const settings = json('data/settings.json');
const P = SPLIT.plan(settings), k = which === 'dev' ? 0 : Number(which), set = which === 'dev' ? P.dev : P.rounds[k - 1];
if (!set) { console.error('usage: node scripts/judge.mjs <dev | round number>'); process.exit(2); }
const dir = which === 'dev' ? 'data/dev' : `data/rounds/${k}`;

// what earlier rounds published, and what a person granted: the chain this round may stand on
const history = [], grants = {};
for (let r = 1; r < k; r++) { if (has(`data/rounds/${r}/verdict.json`)) { const v = json(`data/rounds/${r}/verdict.json`); history.push({ round: r, adopted: v.adopted, adapterSha256: v.adapterSha256, base: v.cold.base.rate, distilled: v.cold.distilled.rate, lift: v.cold.lift, gained: v.cold.gained.length, lost: v.cold.lost.length, hours: v.hours }); } if (has(`data/grants/round-${r}.json`)) grants[r] = json(`data/grants/round-${r}.json`); }
const allowed = ADOPT.chain(history, grants).map((c) => c.adapterSha256);

const ev = {};
// K5: the training file, verified again from its own bytes
if (has(`${dir}/train.jsonl`)) {
  const raw = readFileSync(at(`${dir}/train.jsonl`)), byId = new Map(set.pool.map((t) => [t.id, t]));
  const examples = raw.toString('utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const ok = examples.filter((e) => byId.has(e.id) && TRACE.verified(e, byId.get(e.id)).ok).length;
  const log = has(`${dir}/train-log.json`) ? json(`${dir}/train-log.json`) : null;
  ev.train = { examples: examples.length, verified: ok, unverified: examples.length - ok, fileSha256: createHash('sha256').update(raw).digest('hex'), ...(log ? { trainerSha256: log.trainFileSha256, trainerExamples: log.examples } : {}) };
  ev.log = log;
  // K6: from the files themselves
  const harvest = has(`${dir}/harvest.json`) ? json(`${dir}/harvest.json`) : { records: [] };
  ev.held = { n: set.held.length, overlap: SPLIT.overlap(examples.map((e) => byId.get(e.id)).filter(Boolean), set.held).count + examples.filter((e) => !byId.has(e.id)).length, harvested: SPLIT.overlap(harvest.records.map((r) => ({ ask: r.ask })), set.held).count };
  ev.harvest = harvest;
}
// K1–K3: every cold reply read again
const heldById = new Map(set.held.map((t) => [t.id, t]));
const rowsOf = (file) => { if (!has(file)) return null; const c = json(file); if (c.complete !== true) return null; return { file: c, rows: c.rows.filter((r) => heldById.has(r.id)).map((r) => ({ id: r.id, tier: heldById.get(r.id).tier, family: heldById.get(r.id).family, ...COLD.read(r.text, heldById.get(r.id), r.cut) })) }; };
const base = rowsOf(`${dir}/cold-base.json`), dist = rowsOf(`${dir}/cold-distilled.json`);
if (base && dist && base.rows.length === set.held.length && dist.rows.length === set.held.length) ev.cold = COLD.compare(base.rows, dist.rows);

// the rule, then the published outcome (K4 checks the one against the other)
const first = CLAIMS.verdicts({ ...ev, outcome: undefined }, settings), rule = ADOPT.decide(first.find((v) => v.id === 'K1').pass, first.find((v) => v.id === 'K2').pass);
const standsOn = ev.log ? ev.log.standsOn : [];
if (ev.cold) ev.outcome = { adopted: rule.adopt, standsOn, allowed };
const verdicts = CLAIMS.verdicts(ev, settings);
const hours = ((ev.harvest ? ev.harvest.seconds || 0 : 0) + (ev.log ? ev.log.seconds || 0 : 0) + (base ? base.file.seconds || 0 : 0) + (dist ? dist.file.seconds || 0 : 0)) / 3600;
const byTier = (rows) => Object.fromEntries(['easy', 'climb', 'wall'].map((t) => [t, COLD.tally(rows.filter((r) => r.tier === t))]));
const verdict = {
  v: 'the-distillation-verdict/1', set: which, round: k, at: new Date().toISOString(),
  verdicts, adopted: ev.cold ? rule.adopt : null, why: rule.why,
  adapterSha256: ev.log ? ev.log.adapterSha256 : null, standsOn, hours,
  cold: ev.cold || null, tiers: base && dist ? { base: byTier(base.rows), distilled: byTier(dist.rows) } : null,
  train: ev.train || null, held: ev.held || null,
};
if (k > 0 && ev.cold) {
  const now = [...history, { round: k, adopted: verdict.adopted, adapterSha256: verdict.adapterSha256, base: ev.cold.base.rate, distilled: ev.cold.distilled.rate, lift: ev.cold.lift, gained: ev.cold.gained.length, lost: ev.cold.lost.length, hours }];
  if (has(`data/grants/round-${k}.json`)) grants[k] = json(`data/grants/round-${k}.json`);
  verdict.next = ROUNDS.next(now, grants, settings); verdict.spend = ROUNDS.spend(now, settings); verdict.gauge = ROUNDS.gauge(now, grants);
}
writeFileSync(at(`${dir}/verdict.json`), JSON.stringify(verdict, null, 1) + '\n');
for (const v of verdicts) console.log(`${v.pass === true ? 'PASS   ' : v.pass === false ? 'FAIL   ' : 'PENDING'} ${v.id} ${v.name}: ${v.result}`);
console.log(ev.cold ? `→ ${rule.adopt ? 'ADOPT (the loop proposes; a person grants)' : 'DISSOLVE'}: ${rule.why}` : '→ no outcome yet');
if (verdict.next) console.log(`next: ${verdict.next.act} — ${verdict.next.why}`);
