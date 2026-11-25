// grant.mjs — a person's yes, written down. The loop never runs this: a person does, with their own words.
// It writes data/grants/round-<k>.json for a round the rule adopted, naming that round's exact weights by their
// SHA-256 as the round's verdict records them. It refuses a round that has no verdict, that the rule dissolved, or
// that already has a grant on file. src/adopt.mjs decides whether a grant is valid; this only writes the record.
//   node scripts/grant.mjs <round number> "<the person's own words>"
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import ADOPT from '../src/adopt.mjs';

const at = (p) => new URL(`../${p}`, import.meta.url), has = (p) => existsSync(at(p));
const k = Number(process.argv[2]), words = String(process.argv[3] || '').trim();
const stop = (why) => { console.error(`not granted: ${why}`); process.exit(1); };
if (!Number.isInteger(k) || k < 1 || words === '') stop('usage: node scripts/grant.mjs <round number> "<the person\'s own words>"');
if (!has(`data/rounds/${k}/verdict.json`)) stop(`round ${k} has no verdict`);
const v = JSON.parse(readFileSync(at(`data/rounds/${k}/verdict.json`), 'utf8'));
if (v.adopted !== true) stop(`the rule did not adopt round ${k}: a grant cannot adopt what the rule dissolved`);
if (has(`data/grants/round-${k}.json`)) stop(`round ${k} already has a grant on file`);
const grant = { by: 'human', action: 'adopt-weights', round: k, adapterSha256: v.adapterSha256, words, at: new Date().toISOString() };
if (!ADOPT.validGrant(grant, k, v.adapterSha256)) stop('the record would not be a valid grant');
mkdirSync(at('data/grants/'), { recursive: true });
writeFileSync(at(`data/grants/round-${k}.json`), JSON.stringify(grant, null, 1) + '\n');
console.log(`granted: round ${k}, weights ${v.adapterSha256.slice(0, 12)}…, in these words: "${words}"`);
console.log('now judge the round again (node scripts/judge.mjs ' + k + ') and publish (node scripts/publish.mjs): the loop may then run the next round');
