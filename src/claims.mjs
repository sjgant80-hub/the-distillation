// claims.mjs — the six claims of a round, each a verdict worked out from the round's records and nothing else. A
// claim whose evidence is missing is PENDING (pass: null): never passed, never failed, by default. Every bar is
// fixed in data/settings.json and sealed before the round's model is trained.
//
//   K1 LIFT                     the distilled model's cold accuracy on the held-out block beats the base's by the bar
//   K2 STILL HONEST             it gives no more confident wrong answers than the base
//   K3 THE FAIL-WALL MOVED      held-out problems the base failed cold that the distilled model solves cold,
//                               against the ones it lost: the wall moved outward
//   K4 VERIFY-OR-DISSOLVE       the adoption rule was applied by code and the outcome published, adopt or dissolve;
//                               and the round stood only on weights that were adopted and granted
//   K5 CLEAN TRAINING DATA      every training example is a verified trace, none unverified, and the trainer read
//                               exactly that file
//   K6 HELD-OUT INTEGRITY       no held-out problem is in the training set, and none was ever harvested
// Pure and total.
import { decide } from './adopt.mjs';

const get = (o, k) => { try { return o == null ? undefined : o[k]; } catch { return undefined; } };
const int = (x) => Number.isInteger(x) && x >= 0;
const pct = (x) => `${(100 * x).toFixed(1)}%`;

export const NAMES = {
  K1: 'Lift', K2: 'Still honest', K3: 'The fail-wall moved', K4: 'Verify-or-dissolve at the weights', K5: 'Clean training data', K6: 'Held-out integrity',
};
// bars(settings) → the bar of each claim, in words, with the sealed numbers in it
export function bars(settings) {
  const b = get(settings, 'bars') || {}, lift = get(b, 'liftPoints'), alpha = get(b, 'alpha');
  return {
    K1: `on the held-out block, cold, one try each: the distilled model is right on at least ${lift} points in a hundred more than the base, it solves more of the problems the base failed than it loses of the ones the base solved, and the difference is significant (exact two-sided McNemar test, p < ${alpha})`,
    K2: 'on the same block the distilled model gives no more confident wrong answers than the base',
    K3: 'more held-out problems go from failed (base) to solved (distilled) than the other way',
    K4: 'the outcome published for the round is the one the rule gives (adopted only if K1 and K2 both pass, dissolved otherwise), and the round stands only on weights adopted by the rule and granted by a person',
    K5: 'every training example is a complete crystal\'s verified working, checked again by exact arithmetic; none is unverified; the trainer read that file, byte for byte',
    K6: 'no held-out problem is in the training set, and no held-out problem was harvested',
  };
}

const same = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);

// verdicts(ev, settings) → [{ id, name, bar, pass, result }]
//   ev.cold     cold.compare(): { n, base, distilled, lift, gained, lost, p }
//   ev.train    { examples, verified, unverified, fileSha256, trainerSha256, trainerExamples }
//   ev.held     { n, overlap, harvested }
//   ev.outcome  { adopted, standsOn: [sha…], allowed: [sha…] }
export function verdicts(ev, settings) {
  const B = bars(settings), b = get(settings, 'bars') || {}, lift = get(b, 'liftPoints'), alpha = get(b, 'alpha');
  const c = get(ev, 'cold'), t = get(ev, 'train'), h = get(ev, 'held'), o = get(ev, 'outcome');
  const out = {};
  const measured = c != null && int(get(c, 'n')) && c.n > 0 && Array.isArray(get(c, 'gained')) && Array.isArray(get(c, 'lost')) && typeof get(c, 'p') === 'number' && typeof lift === 'number' && typeof alpha === 'number';
  if (measured) {
    const g = c.gained.length, l = c.lost.length;
    out.K1 = { pass: c.lift * 100 >= lift && c.p < alpha && g > l, result: `base ${pct(c.base.rate)} (${c.base.right} of ${c.n}), distilled ${pct(c.distilled.rate)} (${c.distilled.right} of ${c.n}): ${(100 * c.lift).toFixed(1)} points; p = ${c.p.toExponential(2)}` };
    out.K2 = { pass: c.distilled.wrong <= c.base.wrong, result: `confident wrong answers: base ${c.base.wrong} of ${c.n}, distilled ${c.distilled.wrong} of ${c.n}; no answer: base ${c.base.none}, distilled ${c.distilled.none}` };
    out.K3 = { pass: g > l, result: `${g} held-out problems the base failed are solved by the distilled model; ${l} the base solved are lost` };
  } else for (const k of ['K1', 'K2', 'K3']) out[k] = { pass: null, result: 'the cold test has not been run' };
  if (o != null && typeof get(o, 'adopted') === 'boolean' && Array.isArray(get(o, 'standsOn')) && Array.isArray(get(o, 'allowed')) && measured) {
    const rule = decide(out.K1.pass, out.K2.pass), stood = same(o.standsOn, o.allowed);
    out.K4 = { pass: o.adopted === rule.adopt && stood, result: `the rule gives: ${rule.adopt ? 'ADOPT' : 'DISSOLVE'} (${rule.why}); published: ${o.adopted ? 'adopted' : 'dissolved'}; it stands on ${o.standsOn.length} earlier round${o.standsOn.length === 1 ? '' : 's'}' weights, ${stood ? 'each adopted and granted' : 'NOT all adopted and granted'}` };
  } else out.K4 = { pass: null, result: 'no outcome has been published' };
  if (t != null && int(get(t, 'examples')) && int(get(t, 'verified')) && int(get(t, 'unverified')) && typeof get(t, 'fileSha256') === 'string') {
    const read = typeof get(t, 'trainerSha256') === 'string' ? t.trainerSha256 === t.fileSha256 && get(t, 'trainerExamples') === t.examples : null;
    out.K5 = { pass: read === null ? null : t.examples > 0 && t.unverified === 0 && t.verified === t.examples && read, result: `${t.verified} of ${t.examples} training examples verified by exact arithmetic, ${t.unverified} unverified; ${read === null ? 'the trainer has not run' : read ? 'the trainer read that file, byte for byte' : 'the trainer read ANOTHER file'}` };
  } else out.K5 = { pass: null, result: 'the training set has not been built' };
  if (h != null && int(get(h, 'n')) && int(get(h, 'overlap')) && int(get(h, 'harvested'))) {
    out.K6 = { pass: h.n > 0 && h.overlap === 0 && h.harvested === 0, result: `${h.overlap} of ${h.n} held-out problems are in the training set; ${h.harvested} were harvested` };
  } else out.K6 = { pass: null, result: 'the blocks have not been compared' };
  return Object.keys(NAMES).map((id) => ({ id, name: NAMES[id], bar: B[id], ...out[id] }));
}

export default { NAMES, bars, verdicts };
