// rounds.mjs — the iterated loop: one sealed round is the unit, and this says what may happen next. It fills the
// house; it does not knock down a wall.
//
//   next(history, grants, settings)   the one thing the loop may do now:
//       run            the first round, or the round after one that was adopted AND granted
//       wait           the last round was adopted by the rule; a person has not granted its weights yet
//       full           the last round's lift fell below the bar and dissolved: the gains have flattened. The house
//                      is full, and the loop halts. This is the finish, not a failure.
//       capped         the most rounds the seal allows have run, or the spend wall is reached
//   spend(history, settings)          hours of model work, each round and in all, against the two caps
//   gauge(history, grants)            the fill gauge: each round's cold accuracy before and after, its lift, what
//                                     moved, and whether it was adopted and granted
// history: [{ round, adopted, adapterSha256, base, distilled, lift, gained, lost, hours }] in round order.
// Pure and total.
import { validGrant } from './adopt.mjs';

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const pos = (x) => (Number.isFinite(x) ? Math.max(0, x) : 0);

export function spend(history, settings) {
  const perRound = pos(get(get(settings, 'spend'), 'hoursPerRound')), inAll = pos(get(get(settings, 'spend'), 'hoursInAll'));
  const rounds = (Array.isArray(history) ? history : []).map((h) => ({ round: get(h, 'round'), hours: num(get(h, 'hours')), over: num(get(h, 'hours')) > perRound }));
  const total = rounds.reduce((a, r) => a + r.hours, 0);
  return { rounds, total, perRound, inAll, left: Math.max(0, inAll - total), capped: total >= inAll || rounds.some((r) => r.over) };
}

export function next(history, grants, settings) {
  const H = Array.isArray(history) ? history : [], most = get(get(settings, 'rounds'), 'max');
  if (H.length === 0) return { act: 'run', round: 1, why: 'the first round' };
  const last = H[H.length - 1], round = get(last, 'round');
  if (get(last, 'adopted') !== true) return { act: 'full', round, why: `round ${round} did not clear its bar and dissolved: the gains have flattened and the house is full` };
  if (!validGrant(get(grants, round), round, get(last, 'adapterSha256'))) return { act: 'wait', round, why: `round ${round} was adopted by the rule; its weights wait for a person's grant` };
  if (!(Number.isInteger(most) && H.length < most)) return { act: 'capped', round, why: 'the most rounds the seal allows have run' };
  const s = spend(H, settings);
  if (s.capped) return { act: 'capped', round, why: 'the spend wall is reached' };
  return { act: 'run', round: round + 1, why: `round ${round} was adopted and granted` };
}

export function gauge(history, grants) {
  return (Array.isArray(history) ? history : []).map((h) => {
    const round = get(h, 'round');
    return { round, base: num(get(h, 'base')), distilled: num(get(h, 'distilled')), lift: num(get(h, 'lift')), gained: num(get(h, 'gained')), lost: num(get(h, 'lost')), adopted: get(h, 'adopted') === true, granted: validGrant(get(grants, round), round, get(h, 'adapterSha256')) };
  });
}

export default { spend, next, gauge };
