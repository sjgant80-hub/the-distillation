// cell.mjs — The Distillation's three answers for the estate genome's birth check (seed.json, genome/).
//
// judge  the training gate's own ruling on one example { ask, reply }: verified when the reply is working that may be
//        trained on for that calculation (every line one step and exactly true, the answer the calculation's own, and
//        The Climb's sealed checker reading it the same way: src/trace.mjs); unverified when it is not; refused when
//        what is asked is not a calculation at all.
// lane   in lane when what is asked is an exact calculation: that is all this build ever harvests or trains on.
// health the repository cannot see its page's visitors or callers from inside it, so it says so.
import { verified } from '../src/trace.mjs';
import { own } from '../vendor/crystal/vendor/climb/src/tasks.mjs';
import LOOP from '../vendor/crystal/vendor/climb/src/loop.mjs';

const task = (input) => (input !== null && typeof input === 'object' ? own(input.ask) : null);

export async function judge(input) {
  const t = task(input);
  if (t === null || typeof input.reply !== 'string') return 'refused';
  return verified({ id: t.id, messages: LOOP.opening(t.statement, []), reply: input.reply }, t).ok ? 'verified' : 'unverified';
}

export async function inLane(input) {
  return task(input) !== null;
}

export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
