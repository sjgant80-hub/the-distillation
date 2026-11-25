// judge.mjs — the verdict of a round: read the round's files and hand them to src/judge.mjs, which decides everything
// (and is mutation-gated). This script only reads and writes. It adds two things to the kernel's verdict: the SHA-256
// of each of the round's files as they are on disk, and the date the verdict was first reached.
//   node scripts/judge.mjs <dev | round number>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import SPLIT from '../src/split.mjs';
import JUDGE from '../src/judge.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url), has = (p) => existsSync(at(p)), json = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
export const where = (which) => (which === 'dev' ? 'data/dev' : `data/rounds/${Number(which)}`);
export const FILES = ['harvest.json', 'train.jsonl', 'asks.json', 'held.json', 'train-log.json', 'cold-base.json', 'cold-distilled.json'];

// what earlier rounds published and what a person granted, up to (not including) round k
export function before(k) {
  const history = [], grants = {};
  for (let r = 1; r < k; r++) {
    if (has(`data/rounds/${r}/verdict.json`)) { const v = json(`data/rounds/${r}/verdict.json`); if (v.cold) history.push(JUDGE.row(v)); }
    if (has(`data/grants/round-${r}.json`)) grants[r] = json(`data/grants/round-${r}.json`);
  }
  return { history, grants };
}

// judged(which, plan) → the verdict (without its date); nothing is written
export function judged(which, plan) {
  const settings = json('data/settings.json'), k = which === 'dev' ? 0 : Number(which);
  const P = plan || SPLIT.plan(settings), set = which === 'dev' ? P.dev : P.rounds[k - 1];
  if (!set) throw new Error('usage: node scripts/judge.mjs <dev | round number>');
  const dir = where(which), opt = (f) => (has(`${dir}/${f}`) ? json(`${dir}/${f}`) : null);
  const { history, grants } = before(k);
  if (k > 0 && has(`data/grants/round-${k}.json`)) grants[k] = json(`data/grants/round-${k}.json`);
  const verdict = JUDGE.judge({
    which: k === 0 ? 'dev' : k, settings, set, seal: has('SEAL.json') ? sha(readFileSync(at('SEAL.json'))) : null, history, grants,
    harvest: opt('harvest.json'), log: opt('train-log.json'), coldBase: opt('cold-base.json'), coldDistilled: opt('cold-distilled.json'),
    train: has(`${dir}/train.jsonl`) ? readFileSync(at(`${dir}/train.jsonl`), 'utf8') : null,
  });
  return { ...verdict, files: Object.fromEntries(FILES.filter((f) => has(`${dir}/${f}`)).map((f) => [f, sha(readFileSync(at(`${dir}/${f}`)))])) };
}

if (process.argv[1] && process.argv[1].endsWith('judge.mjs')) {
  const which = process.argv[2];
  let v;
  try { v = judged(which); } catch (e) { console.error(e.message); process.exit(2); }
  // the date is the first time this verdict was reached: judging the same files again does not move it
  const was = has(`${where(which)}/verdict.json`) ? json(`${where(which)}/verdict.json`) : null;
  const same = was && JSON.stringify({ ...was, at: undefined }) === JSON.stringify({ ...v, at: undefined });
  writeFileSync(at(`${where(which)}/verdict.json`), JSON.stringify({ ...v, at: same ? was.at : new Date().toISOString() }, null, 1) + '\n');
  for (const x of v.verdicts) console.log(`${x.pass === true ? 'PASS   ' : x.pass === false ? 'FAIL   ' : 'PENDING'} ${x.id} ${x.name}: ${x.result}`);
  for (const n of v.notes) console.log(`note: ${n}`);
  console.log(v.cold ? `→ ${v.adopted ? 'ADOPT (the loop proposes; a person grants)' : 'DISSOLVE'}: ${v.why}` : '→ no outcome yet');
  if (v.next) console.log(`next: ${v.next.act} — ${v.next.why}`);
}
