// check.mjs — every round on file, decided again from its own files, with no model (CI runs this on every push):
//   · every harvested crystal is grown again by the sealed engine from its recorded replies, and comes out identical;
//   · the training file and the cold questions are built again from the harvest, and are the same bytes;
//   · the verdict is judged again from the files, and is the verdict on file, claim for claim;
//   · a sealed round was made under the seal in force for it (the newest of this repository's seals that begins at or
//     before that round); every grant on file is a valid grant of that round's weights.
//   node scripts/check.mjs
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import G from '../vendor/crystal/src/grow.mjs';
import SPLIT from '../src/split.mjs';
import ADOPT from '../src/adopt.mjs';
import { built } from './build.mjs';
import { judged, where, sealOf } from './judge.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url), has = (p) => existsSync(at(p)), json = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
// a call that hands back a record's own replies in order, in place of a model
const recorded = (rec) => { const said = rec.events.filter((e) => typeof e.said === 'string'); let i = 0; return async () => { const e = said[i++] || {}; return { text: typeof e.said === 'string' ? e.said : '', ms: e.ms, prompt: e.prompt, reply: e.reply }; }; };

// checked() → { lines: one per round on file, rounds: ['dev', '1', …] }; throws with the reason if anything is wrong
export async function checked() {
  const settings = json('data/settings.json'), P = SPLIT.plan(settings), lines = [], rounds = [];
  const fail = (why) => { throw new Error(why); };
  for (const which of ['dev', ...settings.rounds.seeds.map((_, i) => String(i + 1))]) {
    const dir = where(which);
    if (!has(`${dir}/verdict.json`)) continue;
    const set = which === 'dev' ? P.dev : P.rounds[Number(which) - 1], byId = new Map(set.pool.map((t) => [t.id, t]));
    const harvest = json(`${dir}/harvest.json`);
    if (harvest.complete !== true || harvest.records.length !== set.pool.length || !harvest.records.every((r, i) => r.id === set.pool[i].id)) fail(`${which}: the harvest does not hold every problem of its pool once, in order`);
    let differ = 0;
    for (const rec of harvest.records) { const again = await G.grow(byId.get(rec.id), recorded(rec), { maxTicks: settings.harvest.maxTicks, maxTokens: settings.harvest.maxTokens }); if (JSON.stringify(again) !== JSON.stringify(rec)) differ++; }
    if (differ) fail(`${which}: ${differ} crystals do not come out identically from their recorded replies`);
    const b = built(which);
    if (b.jsonl !== readFileSync(at(`${dir}/train.jsonl`), 'utf8')) fail(`${which}: the training file is not the one the harvest builds`);
    if (b.asks !== readFileSync(at(`${dir}/asks.json`), 'utf8') || b.held !== readFileSync(at(`${dir}/held.json`), 'utf8')) fail(`${which}: the cold questions are not the held-out block's`);
    const was = json(`${dir}/verdict.json`), now = judged(which, P);
    if (JSON.stringify({ ...was, at: undefined }) !== JSON.stringify({ ...now, at: undefined })) fail(`${which}: judged again from its files, the verdict is not the one on file`);
    if (which !== 'dev' && !(typeof was.sealSha256 === 'string' && was.sealSha256 === sealOf(Number(which)) && harvest.sealSha256 === was.sealSha256)) fail(`${which}: the round was not made under the seal that was in force for it`);
    const grant = which !== 'dev' && has(`data/grants/round-${which}.json`) ? json(`data/grants/round-${which}.json`) : null;
    if (grant && !(was.adopted === true && ADOPT.validGrant(grant, Number(which), was.adapterSha256))) fail(`${which}: the grant on file is not a valid grant of this round's adopted weights`);
    const v = was.verdicts.map((x) => `${x.id} ${x.pass === true ? 'pass' : x.pass === false ? 'FAIL' : 'pending'}`).join(', ');
    lines.push(`${which === 'dev' ? 'dev' : `round ${which}`}: ${harvest.records.length} crystals grown again identically; ${b.build.examples} training examples built again, the same bytes; verdict judged again identically (${v}); ${was.adopted === true ? 'ADOPTED by the rule' : was.adopted === false ? 'DISSOLVED' : 'no outcome'}${grant ? ', granted' : ''}`);
    rounds.push(which);
  }
  return { lines, rounds };
}

if (process.argv[1] && process.argv[1].endsWith('check.mjs')) {
  try { const c = await checked(); for (const l of c.lines) console.log(l); if (c.rounds.length === 0) console.log('no round is on file yet'); } catch (e) { console.error(`CHECK FAILED: ${e.message}`); process.exit(1); }
}
