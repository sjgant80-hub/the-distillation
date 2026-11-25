// trace.mjs — from a crystal's record to a training example, and the proof that the example is only-true.
//
// This file is the whole safety of the loop. A model trained on its own raw output rots; this one is trained only on
// lines that BONDED: each a single step the model wrote and exact arithmetic confirmed, inside a crystal that was
// completed and came home. Wrong replies, split working and dissolved cells never reach a training example.
//
//   lines(record)            the verified working of a complete crystal: every cell that bonded, once, in the order
//                            it joined, as "cell = value". null for a crystal that did not complete.
//   example(task, record)    the training example: The Climb's own one-try conversation for the problem, and the
//                            reply to learn, which is those lines and then ANSWER: n. null when there is none.
//   verified(example, task)  the check, from the example alone, with no record and no model: every line is one step
//                            and exactly true, the answer is the problem's own finish line, the conversation is the
//                            problem's own, and The Climb's sealed checker reads the reply the same way.
//   built(tasks, records, limit)   the training set of a harvest, and why each problem that is not in it is not.
//
// Pure and total. The arithmetic and the reading are The Climb's sealed kernels (vendored).
import { evaluate, num, same } from '../vendor/crystal/vendor/climb/src/exact.mjs';
import { rule, home } from '../vendor/crystal/vendor/climb/src/checker.mjs';
import LOOP from '../vendor/crystal/vendor/climb/src/loop.mjs';

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const str = (x) => (typeof x === 'string' ? x : '');
const ANSWER = 'ANSWER: ';

export function lines(record) {
  if (get(record, 'complete') !== true || get(record, 'home') !== true) return null;
  const seen = new Set(), out = [];
  for (const e of Array.isArray(get(record, 'events')) ? record.events : []) {
    const kind = get(e, 'kind'), cell = get(e, 'cell'), value = get(e, 'value'), canon = get(e, 'canon');
    if ((kind !== 'bond' && kind !== 'set') || typeof cell !== 'string' || typeof value !== 'string' || seen.has(canon)) continue;
    seen.add(canon);
    out.push(`${cell} = ${value}`);
  }
  return out;
}

export function example(task, record) {
  const ls = lines(record);
  if (ls === null || ls.length === 0 || get(task, 'id') === undefined || get(task, 'id') !== get(record, 'id')) return null;
  return { id: task.id, family: get(task, 'family'), tier: get(task, 'tier'), messages: LOOP.opening(str(get(task, 'statement')), []), reply: [...ls, `${ANSWER}${str(get(record, 'answer'))}`].join('\n'), lines: ls.length };
}

// one line of working: "left = right" with one equals sign, at least one operation on the left, a plain number on the
// right, and the two exactly the same value
const step = (line) => {
  const parts = str(line).split(' = ');
  if (parts.length !== 2) return false;
  const e = evaluate(parts[0]), v = num(parts[1]);
  return e !== null && e.ops >= 1 && v !== null && same(e.value, v);
};

export function verified(ex, task) {
  const no = (why) => ({ ok: false, why, lines: 0 });
  const all = str(get(ex, 'reply')).split('\n'), last = all[all.length - 1], work = all.slice(0, -1);
  if (work.length === 0) return no('no working');
  if (!last.startsWith(ANSWER)) return no('no answer line');
  const bad = work.findIndex((l) => !step(l));
  if (bad !== -1) return no(`line ${bad + 1} is not a true step`);
  if (new Set(work).size !== work.length) return no('a line is written twice');
  if (!home(task, { value: num(last.slice(ANSWER.length)), numbers: [] })) return no('the answer is not the problem\'s');
  if (JSON.stringify(get(ex, 'messages')) !== JSON.stringify(LOOP.opening(str(get(task, 'statement')), []))) return no('the conversation is not the problem\'s');
  // the second opinion: The Climb's own sealed checker reads the same reply, keeps every line, drops none, and rules it home
  const r = rule(all.join('\n'), task);
  if (r.home !== true || r.dropped.length !== 0 || r.kept.length !== work.length) return no('the sealed checker reads it otherwise');
  return { ok: true, why: 'verified', lines: work.length };
}

// built(tasks, records, limit) → { examples, counts: { pool, grown, complete, used, incomplete, long, unverified } }
// limit: the most lines a trace may have and still be written in one reply (longer ones are verified but not used).
export function built(tasks, records, limit) {
  const byId = new Map((Array.isArray(records) ? records : []).map((r) => [get(r, 'id'), r]));
  const most = Number.isInteger(limit) && limit > 0 ? limit : Infinity;
  const examples = [], counts = { pool: 0, grown: 0, complete: 0, used: 0, incomplete: 0, long: 0, unverified: 0 };
  for (const task of Array.isArray(tasks) ? tasks : []) {
    counts.pool++;
    const rec = byId.get(get(task, 'id'));
    if (rec === undefined) continue;
    counts.grown++;
    const ex = example(task, rec);
    if (ex === null) { counts.incomplete++; continue; }
    counts.complete++;
    if (ex.lines > most) { counts.long++; continue; }
    // nothing is taken on the record's word: the example is checked again, by arithmetic alone, before it is kept
    if (!verified(ex, task).ok) { counts.unverified++; continue; }
    counts.used++;
    examples.push(ex);
  }
  return { examples, counts };
}

export default { lines, example, verified, built };
