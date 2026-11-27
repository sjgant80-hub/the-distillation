// steps.mjs — how a step of a round is settled once its process has ended, and what is written down about it.
//
// A step's process can end badly after its work is already whole on disk. Round 1's trainer did: it saved its adapter
// and its log, and then its process ended with an error and no message. The runner stopped, and the round was carried
// on by hand. This kernel is the rule that replaces the hand:
//   · the exit of every step is written down, good or bad, with what the process said last;
//   · a step that ended badly is carried on from ONLY if it is one of the steps whose record says by itself that it
//     is whole, and the runner checked that record whole, from the files, after the process ended;
//   · anything else that ends badly stops the round. A bad exit is never hidden and never forgiven on trust.
//
//   settle(step, ended, whole)   → { go, row }: whether the round goes on, and the row for the round's run record
//       step    the step's name
//       ended   { status, signal, error, seconds, stderr } as the process left it (status is not a whole number
//               when a signal ended it)
//       whole   true only when the step's own record was checked whole after the process ended
//   bad(run)                     → the rows of a run record that ended badly, each with the sitting it belongs to
// Pure and total.
const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const name = (x) => { try { return String(x); } catch { return ''; } };

export const CARRY = ['train', 'cold-base', 'cold-distilled'];    // the steps whose record can be checked whole from the files
export const TAIL = 2000;                                         // how much of what the process said last is kept
export const WHOLE = 'its record was checked whole after its process ended, so the round carries on from that record';
export const BROKEN = 'it ended badly and left no record that could be checked whole, so the round stops';

export function settle(step, ended, whole) {
  const status = get(ended, 'status'), signal = get(ended, 'signal'), seconds = get(ended, 'seconds'), error = get(ended, 'error'), stderr = get(ended, 'stderr');
  const row = { step: name(step), exit: Number.isInteger(status) ? status : null, signal: typeof signal === 'string' ? signal : null, seconds: typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0 };
  if (row.exit === 0) return { go: true, row: { ...row, carriedOn: false } };
  const carry = CARRY.includes(row.step) && whole === true;
  return { go: carry, row: { ...row, error: typeof error === 'string' ? error : null, stderrTail: typeof stderr === 'string' ? stderr.trim().slice(-TAIL) : '', carriedOn: carry, why: carry ? WHOLE : BROKEN } };
}

export function bad(run) {
  const sittings = get(run, 'sittings'), out = [];
  for (const [i, s] of (Array.isArray(sittings) ? sittings : []).entries()) {
    const steps = get(s, 'steps');
    for (const r of Array.isArray(steps) ? steps : []) if (get(r, 'exit') !== 0 && get(r, 'skipped') !== true) out.push({ sitting: i + 1, step: name(get(r, 'step')), exit: Number.isInteger(get(r, 'exit')) ? r.exit : null, signal: typeof get(r, 'signal') === 'string' ? r.signal : null, carriedOn: get(r, 'carriedOn') === true });
  }
  return out;
}

export default { CARRY, TAIL, WHOLE, BROKEN, settle, bad };
