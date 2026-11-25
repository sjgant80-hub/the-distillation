// cold.mjs — the cold test: one try, no climb, no checker helping. The conversation is The Climb's own sealed one-try
// opening; the reply is read by The Climb's own sealed checker, and by nothing else.
//
// Every reply is one of three things:
//   right   it ends with an answer and the answer is the problem's finish line
//   wrong   it ends with an answer and the answer is not right: a SILENT FAILURE, a confident wrong answer
//   none    it gives no answer (it ran out of room, or never wrote an ANSWER line): a failure that shows
// A reply cut off at the length limit loses its last line before it is read, as The Climb does: the line may be half
// a number.
//
//   asking(task)                 the conversation
//   read(reply, task, cut)       { outcome: 'right' | 'wrong' | 'none', answer, trueLines, falseLines }
//   tally(rows)                  { n, right, wrong, none, rate, silent }   rows: [{ outcome }]
//   compare(base, distilled)     the two models on the same problems: both tallies, the fail-wall (problems the base
//                                failed and the distilled model solved, and the other way), and the exact McNemar p
//   made(file, want)             true only for a whole cold record made as it had to be: on these base weights, with
//                                these adapters in this order, at this token limit. A record made any other way is
//                                not evidence.
// Pure and total.
import { rule } from '../vendor/crystal/vendor/climb/src/checker.mjs';
import LOOP from '../vendor/crystal/vendor/climb/src/loop.mjs';
import { mcnemar } from '../vendor/crystal/vendor/climb/vendor/stats.mjs';

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const str = (x) => (typeof x === 'string' ? x : '');
export const OUTCOMES = ['right', 'wrong', 'none'];

export const asking = (task) => LOOP.opening(str(get(task, 'statement')), []);

export function read(reply, task, cut) {
  const text = cut === true ? str(reply).split('\n').slice(0, -1).join('\n') : str(reply);
  const r = rule(text, task);
  const outcome = r.home === true ? 'right' : r.answer !== null ? 'wrong' : 'none';
  return { outcome, answer: r.answer, trueLines: r.kept.length, falseLines: r.dropped.length };
}

export function tally(rows) {
  const t = { n: 0, right: 0, wrong: 0, none: 0, rate: 0, silent: 0 };
  for (const row of Array.isArray(rows) ? rows : []) {
    const o = get(row, 'outcome');
    if (!OUTCOMES.includes(o)) continue;
    t.n++; t[o]++;
  }
  t.rate = t.n === 0 ? 0 : t.right / t.n;
  t.silent = t.n === 0 ? 0 : t.wrong / t.n;
  return t;
}

// compare(base, distilled) → rows are matched by problem id; a problem only one model was asked is left out, and counted
export function compare(base, distilled) {
  const B = new Map((Array.isArray(base) ? base : []).map((r) => [get(r, 'id'), r])), both = [], gained = [], lost = [];
  let unmatched = 0;
  for (const d of Array.isArray(distilled) ? distilled : []) {
    const b = B.get(get(d, 'id'));
    if (b === undefined || !OUTCOMES.includes(get(b, 'outcome')) || !OUTCOMES.includes(get(d, 'outcome'))) { unmatched++; continue; }
    both.push([b, d]);
    if (b.outcome !== 'right' && d.outcome === 'right') gained.push(d.id);
    if (b.outcome === 'right' && d.outcome !== 'right') lost.push(d.id);
  }
  unmatched += (Array.isArray(base) ? base.length : 0) - both.length;
  const tb = tally(both.map(([b]) => b)), td = tally(both.map(([, d]) => d));
  return { n: both.length, unmatched, base: tb, distilled: td, lift: td.rate - tb.rate, gained, lost, p: mcnemar(gained.length, lost.length) };
}

// made(file, want) → boolean. file: a cold record ({ complete, weightsSha256, adapters, maxTokens }); want: { weightsSha256, adapters, maxTokens }
export function made(file, want) {
  const have = get(file, 'adapters'), need = get(want, 'adapters');
  if (get(file, 'complete') !== true || !Array.isArray(have) || !Array.isArray(need) || have.length !== need.length) return false;
  if (str(get(want, 'weightsSha256')) === '' || get(file, 'weightsSha256') !== get(want, 'weightsSha256')) return false;
  if (!Number.isInteger(get(want, 'maxTokens')) || get(file, 'maxTokens') !== get(want, 'maxTokens')) return false;
  return have.every((s, i) => str(s) !== '' && s === need[i]);
}

export default { OUTCOMES, asking, read, tally, compare, made };
