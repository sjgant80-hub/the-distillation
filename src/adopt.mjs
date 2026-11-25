// adopt.mjs — verify-or-dissolve, at the weights. Two gates stand between a trained model and the next round, and
// they are different gates on purpose:
//
//   THE RULE (code)    decide(): the new weights are adopted only when the cold lift cleared its bar AND the model
//                      did not get less honest. Anything else — a miss, a tie, a claim not measured — DISSOLVES:
//                      the base stays, and the outcome is published either way.
//   THE GRANT (person) validGrant(): weights the rule adopted still become the base of a later round only under a
//                      person's grant for exactly those weights. The loop proposes; it cannot write its own grant,
//                      and a grant for other weights, or another round, opens nothing.
//
//   chain(history, grants)  the adapters a new round may stand on: each earlier round the rule adopted AND a person
//                           granted, in order, with no gap. One round without both ends the chain there.
//   stood(parts)            the one chain of weights every part of a round was made on (its harvest, its training,
//                           its two cold tests), or null when a part is missing or they differ: a round whose parts
//                           were made on different weights stands on nothing.
// Pure and total.

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const str = (x) => (typeof x === 'string' ? x : '');
const SHA = /^[0-9a-f]{64}$/;

// decide(k1, k2) → { adopt, why }. k1: the lift claim's verdict; k2: the still-honest claim's (true, false, or null)
export function decide(k1, k2) {
  if (k1 !== true && k1 !== false) return { adopt: false, why: 'the lift was not measured: nothing is adopted on faith' };
  if (k2 !== true && k2 !== false) return { adopt: false, why: 'honesty was not measured: nothing is adopted on faith' };
  if (!k1) return { adopt: false, why: 'the cold lift did not clear its bar' };
  if (!k2) return { adopt: false, why: 'it got more answers right and more confidently wrong: not adopted' };
  return { adopt: true, why: 'the cold lift cleared its bar and it is no less honest' };
}

// validGrant(grant, round, adapterSha256) → true for a person's grant of exactly this round's weights
export function validGrant(grant, round, adapterSha256) {
  return grant != null && get(grant, 'by') === 'human' && get(grant, 'action') === 'adopt-weights'
    && Number.isInteger(round) && get(grant, 'round') === round
    && SHA.test(str(adapterSha256)) && get(grant, 'adapterSha256') === adapterSha256
    && str(get(grant, 'words')).trim().length > 0 && str(get(grant, 'at')).length > 0;
}

// chain(history, grants) → [{ round, adapterSha256 }]. history: [{ round, adopted, adapterSha256 }] in round order;
// grants: { [round]: grant }.
export function chain(history, grants) {
  const out = [];
  for (const [i, h] of (Array.isArray(history) ? history : []).entries()) {
    const round = get(h, 'round'), sha = get(h, 'adapterSha256');
    if (round !== i + 1 || get(h, 'adopted') !== true || !validGrant(get(grants, round), round, sha)) break;
    out.push({ round, adapterSha256: sha });
  }
  return out;
}

// stood(parts) → [sha…] (the chain they all name, in order) or null. parts: one list of adapter SHA-256s for each
// part of the round.
export function stood(parts) {
  const P = Array.isArray(parts) ? parts : [];
  if (P.length === 0) return null;
  for (const p of P) {
    if (!Array.isArray(p) || p.length !== get(P[0], 'length')) return null;
    for (const [i, s] of p.entries()) if (!SHA.test(str(s)) || s !== P[0][i]) return null;
  }
  return [...P[0]];
}

export default { decide, validGrant, chain, stood };
