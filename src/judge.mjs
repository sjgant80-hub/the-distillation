// judge.mjs — the verdict of a round, worked out from its records and nothing else. It trusts no count another
// program wrote down: the training file is verified again line by line from its own text, every cold reply of both
// models is read again, the six claims are ruled on, and the adoption rule is applied.
//
// A record is taken as evidence only when the record itself says it was made the way the seal requires:
//   the harvest    whole, on the sealed weights, with the sealed settings, and (a sealed round) under this seal
//   the trainer    from the sealed weights, with the sealed training settings
//   the cold tests each whole, at the sealed token limit, the base on the weights the round stands on and the
//                  distilled model on those weights plus this round's adapter, one reply for every held-out problem
//   the round      every part made on the same chain of earlier weights
// Anything else is not evidence: its claims stay PENDING and the reason is written in the verdict's notes.
//
//   judge(input) → the verdict
//     input.which          'dev', or the round's number
//     input.settings       data/settings.json
//     input.set            { held, pool }: the round's held-out block and harvest pool (src/split.mjs)
//     input.seal           the SHA-256 of this repository's SEAL.json, or null when there is none
//     input.history        the rounds before this one, as row() gives them, in order
//     input.grants         { [round]: grant }: what a person granted (this round's own grant too, if there is one)
//     input.harvest, input.log, input.coldBase, input.coldDistilled     the round's records, or null
//     input.train          the training file's text, or null
//   row(verdict) → the round as the loop's history holds it
// Pure and total: every reading of a record goes through a guard, so a broken record is not evidence, and is never
// an error.
import { sha256 } from '../vendor/crystal/vendor/climb/src/sha256.mjs';
import SPLIT from './split.mjs';
import TRACE from './trace.mjs';
import COLD from './cold.mjs';
import CLAIMS from './claims.mjs';
import ADOPT from './adopt.mjs';
import ROUNDS from './rounds.mjs';

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const arr = (x) => (Array.isArray(x) ? x : []);
const alike = (a, b) => a !== undefined && JSON.stringify(a) === JSON.stringify(b);
const secs = (x) => { const s = get(x, 'seconds'); return Number.isFinite(s) ? Math.max(0, s) : 0; };
export const TIERS = ['easy', 'climb', 'wall'];

export function row(v) {
  const c = get(v, 'cold');
  return { round: get(v, 'round'), adopted: get(v, 'adopted'), adapterSha256: get(v, 'adapterSha256'), base: get(get(c, 'base'), 'rate'), distilled: get(get(c, 'distilled'), 'rate'), lift: get(c, 'lift'), gained: arr(get(c, 'gained')).length, lost: arr(get(c, 'lost')).length, hours: get(v, 'hours') };
}

function core(input) {
  const settings = get(input, 'settings'), which = get(input, 'which'), k = which === 'dev' ? 0 : which;
  const held = arr(get(get(input, 'set'), 'held')), pool = arr(get(get(input, 'set'), 'pool'));
  const seal = typeof get(input, 'seal') === 'string' ? input.seal : null, weights = get(get(settings, 'model'), 'weightsSha256');
  const history = arr(get(input, 'history')), grants = get(input, 'grants');
  const notes = [], ev = {};

  let harvest = get(input, 'harvest') ?? null;
  const records = arr(get(harvest, 'records'));
  if (harvest !== null) {
    const why = get(harvest, 'complete') !== true || !Array.isArray(get(harvest, 'records')) ? 'the harvest is not complete'
      : typeof weights !== 'string' || get(harvest, 'weightsSha256') !== weights ? 'the harvest was not made on the sealed weights'
      : !alike(get(harvest, 'settings'), get(settings, 'harvest')) ? 'the harvest was not made with the sealed settings'
      : k !== 0 && (seal === null || get(harvest, 'sealSha256') !== seal) ? 'the harvest was not made under this seal' : null;
    if (why !== null) { notes.push(why); harvest = null; }
  }
  let log = get(input, 'log') ?? null;
  if (log !== null) {
    const why = typeof weights !== 'string' || get(log, 'weightsSha256') !== weights ? 'the trainer did not start from the sealed weights'
      : !alike(get(log, 'settings'), get(settings, 'train')) ? 'the trainer did not use the sealed settings' : null;
    if (why !== null) { notes.push(why); log = null; }
  }

  // K5 and K6: the training file, verified again from its own text, and set against the held-out block
  const text = get(input, 'train');
  if (harvest !== null && typeof text === 'string') {
    const byId = new Map(pool.filter((t) => typeof get(t, 'id') === 'string').map((t) => [get(t, 'id'), t]));
    const examples = text.split('\n').filter((l) => l.trim() !== '').map((l) => { try { return JSON.parse(l); } catch { return null; } });
    const mine = examples.filter((e) => e !== null && byId.has(get(e, 'id')));
    const ok = mine.filter((e) => TRACE.verified(e, byId.get(get(e, 'id'))).ok).length;
    ev.train = { examples: examples.length, verified: ok, unverified: examples.length - ok, fileSha256: sha256(text), ...(log !== null ? { trainerSha256: get(log, 'trainFileSha256'), trainerExamples: get(log, 'examples') } : {}) };
    // an example of a problem that is not in the pool counts against the held-out claim as well: it came from somewhere else
    ev.held = { n: held.length, overlap: SPLIT.overlap(mine.map((e) => byId.get(get(e, 'id'))), held).count + (examples.length - mine.length), harvested: SPLIT.overlap(records.map((r) => ({ ask: get(r, 'ask') })), held).count };
  }

  // K1–K3: the two cold records, each made as it had to be, and every reply read again
  const cb = get(input, 'coldBase') ?? null, cd = get(input, 'coldDistilled') ?? null;
  const all = harvest !== null && log !== null && cb !== null && cd !== null;
  const mixed = get(cd, 'adapters');
  const standsOn = all ? ADOPT.stood([get(harvest, 'adapters'), get(log, 'standsOn'), get(cb, 'adapters'), Array.isArray(mixed) ? mixed.slice(0, -1) : null]) : null;
  const heldById = new Map(held.filter((t) => typeof get(t, 'id') === 'string').map((t) => [get(t, 'id'), t]));
  const read = (c) => arr(get(c, 'rows')).map((r) => ({ id: get(r, 'id'), tier: get(heldById.get(get(r, 'id')), 'tier'), ...COLD.read(get(r, 'text'), heldById.get(get(r, 'id')), get(r, 'cut')) }));
  let base = null, dist = null;
  if (all) {
    const want = { weightsSha256: weights, maxTokens: get(get(settings, 'cold'), 'maxTokens') };
    const whole = (c) => { const rows = get(c, 'rows'); return Array.isArray(rows) && rows.length === held.length && new Set(rows.map((r) => get(r, 'id'))).size === held.length && rows.every((r) => r != null && heldById.has(get(r, 'id'))); };
    const why = standsOn === null ? 'the parts of the round were not all made on the same weights'
      : !COLD.made(cb, { ...want, adapters: standsOn }) ? 'the base cold test was not made as sealed'
      : !COLD.made(cd, { ...want, adapters: [...standsOn, get(log, 'adapterSha256')] }) ? 'the distilled cold test was not made as sealed'
      : !whole(cb) || !whole(cd) ? 'a cold test does not hold one reply for every held-out problem' : null;
    if (why !== null) notes.push(why); else { base = read(cb); dist = read(cd); ev.cold = COLD.compare(base, dist); }
  }

  // the rule, and then the outcome (K4 checks the one against the other, and the weights the round stood on)
  const first = CLAIMS.verdicts(ev, settings), rule = ADOPT.decide(first[0].pass, first[1].pass);
  const allowed = ADOPT.chain(history, grants).map((c) => c.adapterSha256);
  if (ev.cold !== undefined) ev.outcome = { adopted: rule.adopt, standsOn, allowed };
  const seconds = { harvest: secs(harvest), train: secs(log), coldBase: base === null ? 0 : secs(cb), coldDistilled: base === null ? 0 : secs(cd) };
  const hours = (seconds.harvest + seconds.train + seconds.coldBase + seconds.coldDistilled) / 3600;
  const tiers = (rows) => Object.fromEntries(TIERS.map((t) => [t, COLD.tally(rows.filter((r) => r.tier === t))]));
  const verdict = {
    v: 'the-distillation-verdict/1', set: k === 0 ? 'dev' : String(k), round: k, sealSha256: k === 0 ? null : seal,
    verdicts: CLAIMS.verdicts(ev, settings), adopted: ev.cold !== undefined ? rule.adopt : null, why: ev.cold !== undefined ? rule.why : 'no outcome yet',
    adapterSha256: log !== null && typeof get(log, 'adapterSha256') === 'string' ? log.adapterSha256 : null, standsOn, hours,
    seconds,
    harvest: harvest === null ? null : { problems: records.length, complete: records.filter((r) => get(r, 'complete') === true && get(r, 'home') === true).length, calls: records.reduce((a, r) => a + (Number.isInteger(get(r, 'calls')) ? get(r, 'calls') : 0), 0) },
    cold: ev.cold ?? null, tiers: base === null ? null : { base: tiers(base), distilled: tiers(dist) },
    train: ev.train ?? null, held: ev.held ?? null, notes,
  };
  if (k !== 0 && ev.cold !== undefined) {
    const now = [...history, row(verdict)];
    verdict.next = ROUNDS.next(now, grants, settings); verdict.spend = ROUNDS.spend(now, settings); verdict.gauge = ROUNDS.gauge(now, grants);
  }
  return verdict;
}

export function judge(input) {
  const which = get(input, 'which');
  if (!(which === 'dev' || (Number.isInteger(which) && which >= 1))) return { v: 'the-distillation-verdict/1', set: null, round: null, sealSha256: null, verdicts: CLAIMS.verdicts({}, get(input, 'settings')), adopted: null, why: 'no outcome yet', adapterSha256: null, standsOn: null, hours: 0, seconds: { harvest: 0, train: 0, coldBase: 0, coldDistilled: 0 }, harvest: null, cold: null, tiers: null, train: null, held: null, notes: ['there is no such round'] };
  return core(input);
}

export default { TIERS, row, judge };
