// live.mjs — the round, shown while it runs. It reads the round's own log and writes data/live.json: where the round
// is (harvest, build, train, cold tests, judged), how far, and the training loss so far. The page draws it, so a
// visitor can watch the loop work. It is telemetry, not a result: it decides nothing and claims nothing. The verdict
// is scripts/judge.mjs's, from the finished records, and appears only when the round is published.
//   node scripts/live.mjs <dev | round number> <the round's log file> [--push] [--every 240]
// With --push it commits and pushes data/live.json (that one file) each time it changes. It stops when the round does.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [which, log] = process.argv.slice(2), push = process.argv.includes('--push');
const every = process.argv.includes('--every') ? Number(process.argv[process.argv.indexOf('--every') + 1]) : 240;
const at = (p) => new URL(`../${p}`, import.meta.url);

// progress(state) → how far the stage the round is in has got, for the commit line: the training step only while it
// trains, the conversations answered while a model is tested cold, the problems grown while it harvests; else nothing
export function progress(s) {
  const x = s || {}, c = x.cold || {};
  if (x.stage === 'train' && x.train) return ` · step ${x.train.step}/${x.train.steps}`;
  if (x.stage === 'cold-base' && c.base) return ` · ${c.base.done} of ${c.base.total}`;
  if (x.stage === 'cold-distilled' && c.distilled) return ` · ${c.distilled.done} of ${c.distilled.total}`;
  if (x.stage === 'harvest' && x.harvest) return ` · ${x.harvest.done}/${x.harvest.total}`;
  return '';
}

// read(text) → the state of the round, from its log alone
export function read(text, round) {
  const lines = String(text).split('\n'), last = (re) => { for (let i = lines.length - 1; i >= 0; i--) { const m = lines[i].match(re); if (m) return m; } return null; };
  const s = { v: 'the-distillation-live/1', round, stage: 'starting', harvest: null, train: null, cold: { base: null, distilled: null }, verdict: null, done: false, failed: false };
  const h = last(/^(\d+) of (\d+) · (\d+) complete · (\d+) calls/), hd = last(/^done: (\d+) grown, (\d+) complete, (\d+) calls/), pool = last(/: (\d+) problems in the pool/);
  if (pool || h || hd) { s.stage = 'harvest'; s.harvest = hd ? { done: Number(hd[1]), total: Number(hd[1]), complete: Number(hd[2]), calls: Number(hd[3]) } : { done: h ? Number(h[1]) : 0, total: pool ? Number(pool[1]) : h ? Number(h[2]) : 0, complete: h ? Number(h[3]) : 0, calls: h ? Number(h[4]) : 0 }; }
  const b = last(/→ (\d+) training examples/);
  if (b) { s.stage = 'build'; s.examples = Number(b[1]); }
  const t0 = last(/^(\d+) examples, shared opening \d+ tokens, (\d+) steps/), steps = lines.map((l) => l.match(/^epoch \d+ step (\d+)\/(\d+) loss ([\d.]+)/)).filter(Boolean);
  if (t0 || steps.length) {
    const loss = steps.map((m) => Number(m[3])), n = 48, pick = loss.length <= n ? loss : Array.from({ length: n }, (_, i) => { const a = Math.floor(i * loss.length / n), z = Math.floor((i + 1) * loss.length / n); const part = loss.slice(a, Math.max(z, a + 1)); return part.reduce((x, y) => x + y, 0) / part.length; });
    s.stage = 'train'; s.train = { step: steps.length ? Number(steps[steps.length - 1][1]) : 0, steps: t0 ? Number(t0[2]) : steps.length ? Number(steps[0][2]) : 0, loss: pick.map((x) => Math.round(x * 10000) / 10000) };
  }
  // the cold tests: the command line names which model is answering
  let model = null;
  for (const l of lines) {
    if (/py\/cold\.py/.test(l)) model = /cold-distilled\.json/.test(l) ? 'distilled' : 'base';
    // the model's hands write their own separator character, so the line is matched round it, whatever it is
    const c = l.match(/^(\d+) of (\d+) \S{1,3} \d+ s\s*$/), d = l.match(/^done: (\d+) replies/), a = l.match(/^(\d+) conversations, (\d+) answered already/);
    if (model && a) s.cold[model] = { done: Number(a[2]), total: Number(a[1]) };
    if (model && c && !/complete/.test(l)) s.cold[model] = { done: Number(c[1]), total: Number(c[2]) };
    if (model && d && s.cold[model]) s.cold[model].done = s.cold[model].total;
    if (model && (a || c || d)) s.stage = model === 'base' ? 'cold-base' : 'cold-distilled';
  }
  const v = lines.filter((l) => /^(PASS|FAIL|PENDING)\s+K\d/.test(l));
  if (v.length) { s.stage = 'judged'; s.verdict = v.map((l) => { const m = l.match(/^(PASS|FAIL|PENDING)\s+(K\d)/); return { id: m[2], pass: m[1] === 'PASS' ? true : m[1] === 'FAIL' ? false : null }; }); }
  s.done = lines.some((l) => /^round \S+: done in/.test(l));
  s.failed = lines.some((l) => /a step failed|Traceback|it may not run/.test(l));
  return s;
}

if (process.argv[1] && process.argv[1].endsWith('live.mjs')) {
  if (!which || !log) { console.error('usage: node scripts/live.mjs <dev | round number> <log file> [--push] [--every 240]'); process.exit(2); }
  const round = which === 'dev' ? 'dev' : Number(which);
  let was = '';
  for (;;) {
    const s = read(existsSync(log) ? readFileSync(log, 'utf8') : '', round), body = JSON.stringify(s);
    if (body !== was) {
      was = body;
      writeFileSync(at('data/live.json'), JSON.stringify({ ...s, at: new Date().toISOString() }, null, 1) + '\n');
      if (push) { const g = (a) => spawnSync('git', a, { cwd: at('.'), encoding: 'utf8' }); g(['add', 'data/live.json']); g(['-c', 'user.name=Simon Gant', '-c', 'user.email=sjgant80-hub@users.noreply.github.com', 'commit', '-q', '-m', `live: round ${round} · ${s.stage}${progress(s)}`, '--', 'data/live.json']); g(['push', '-q']); }
      console.log(`${new Date().toISOString().slice(11, 19)} ${s.stage}${progress(s)}`);
    }
    if (s.done || s.failed) break;
    await new Promise((ok) => setTimeout(ok, every * 1000));
  }
}
