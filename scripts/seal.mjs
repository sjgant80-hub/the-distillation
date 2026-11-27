// seal.mjs — freeze everything that can change a result before a sealed round is run: the kernels, the vendored
// Crystal engine, the model's hands (py/), the scripts that harvest, build and judge, the settings (which hold every
// round's seeds, the bars, the most rounds and the spend wall), and the claims file. Writes SEAL.json (a SHA-256 of
// each file's bytes). test/seal.test.mjs then fails if any sealed byte changes, and a round counts only when its
// harvest and its verdict record the hash of the seal that was in force for it.
//   node scripts/seal.mjs                        the first seal, before round 1
//   node scripts/seal.mjs --next <reasons.json>  a later seal, made only between rounds. The seal before it is kept,
//                                                byte for byte, in seals/<n>.json; the new one names it by its SHA-256,
//                                                says the round it begins from, and gives a written reason for every
//                                                file whose bytes changed. reasons.json: { "why": "…", "files": {
//                                                "<file>": "<reason>" } }. It is refused if a file changed without a
//                                                reason, if a reason names a file that did not change, or if the
//                                                claims, the settings, the vendored engine or a kernel the first seal
//                                                froze has changed at all: a later seal may mend how a round is run,
//                                                never what is asked or how it is judged.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const under = (d, ext) => readdirSync(d).filter((f) => f.endsWith(ext)).sort().map((f) => `${d}/${f}`);
export const sealed = () => [
  ...under('src', '.mjs'),
  ...['vendor/crystal/src', 'vendor/crystal/vendor/climb/src', 'vendor/crystal/vendor/climb/vendor'].flatMap((d) => under(d, '.mjs')),
  'py/llm.py', 'py/serve.py', 'py/train.py', 'py/cold.py',
  'scripts/harvest.mjs', 'scripts/build.mjs', 'scripts/judge.mjs', 'scripts/round.mjs',
  'data/settings.json', 'CLAIMS.md',
];
// what a later seal may never change: what is asked, the bars and seeds, the engine, and any kernel the first seal froze
export const fixed = (file, first) => file === 'CLAIMS.md' || file === 'data/settings.json' || file.startsWith('vendor/') || (file.startsWith('src/') && Object.hasOwn(first, file));
// differs(a, b) → the files whose hash is not the same in both (changed, added or removed), sorted
export const differs = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((f) => a[f] !== b[f]).sort();
export const MIN_REASON = 40;

if (process.argv[1] && process.argv[1].endsWith('seal.mjs')) {
  const stop = (why) => { console.error(`not sealed: ${why}`); process.exit(1); };
  const files = Object.fromEntries(sealed().map((f) => {
    const b = readFileSync(f);
    if (b.includes(13)) throw new Error(`${f} has a carriage return: the seal hashes LF bytes only`);
    return [f, sha(b)];
  }));
  const args = process.argv.slice(2), next = args.indexOf('--next');
  if (!existsSync('SEAL.json')) {
    writeFileSync('SEAL.json', JSON.stringify({ v: 'the-distillation-seal/1', note: 'every file that can change a result, frozen before a sealed round was run; a round counts only when its harvest and its verdict record the SHA-256 of this file', files }, null, 1) + '\n');
  } else {
    if (next < 0 || !args[next + 1]) stop('there is a seal already. A later seal is made only between rounds, with a written reason for every file it changes: node scripts/seal.mjs --next <reasons.json>');
    const reasons = JSON.parse(readFileSync(args[next + 1], 'utf8')), prevBytes = readFileSync('SEAL.json'), prev = JSON.parse(prevBytes.toString('utf8'));
    const kept = existsSync('seals') ? readdirSync('seals').filter((f) => /^\d+\.json$/.test(f)) : [], n = kept.length + 1;
    const first = n === 1 ? prev.files : JSON.parse(readFileSync('seals/1.json', 'utf8')).files;
    // the rounds already begun: a later seal begins after the last of them, and only once that one has its verdict
    let last = 0; while (existsSync(`data/rounds/${last + 1}/harvest.json`)) last++;
    if (last === 0) stop('no sealed round has begun: make the first seal again by removing SEAL.json, not a later one');
    if (!existsSync(`data/rounds/${last}/verdict.json`) || !JSON.parse(readFileSync(`data/rounds/${last}/verdict.json`, 'utf8')).cold) stop(`round ${last} has begun and has no outcome yet: a seal is not changed under a running round`);
    const changed = differs(prev.files, files), given = Object.keys(reasons.files || {}).sort();
    if (changed.length === 0) stop('no sealed file has changed');
    for (const f of changed) if (fixed(f, first)) stop(`${f} may not change in a later seal: it is what is asked, how it is judged, or what it stands on`);
    for (const f of changed) if (!given.includes(f)) stop(`${f} changed and has no written reason`);
    for (const f of given) if (!changed.includes(f)) stop(`a reason is given for ${f}, which did not change`);
    for (const f of given) if (typeof reasons.files[f] !== 'string' || reasons.files[f].trim().length < MIN_REASON) stop(`the reason for ${f} is under ${MIN_REASON} characters`);
    if (typeof reasons.why !== 'string' || reasons.why.trim().length < MIN_REASON) stop(`the reason for the seal itself is under ${MIN_REASON} characters`);
    mkdirSync('seals', { recursive: true });
    writeFileSync(`seals/${n}.json`, prevBytes);
    writeFileSync('SEAL.json', JSON.stringify({ v: 'the-distillation-seal/2', note: 'a later seal, made between rounds: every file that can change a result, frozen again. The seal before it is kept byte for byte and named here by its SHA-256; every file whose bytes changed has its reason below; what is asked, the bars, the seeds, the engine and the kernels the first seal froze have not changed', fromRound: last + 1, follows: { file: `seals/${n}.json`, sha256: sha(prevBytes) }, why: reasons.why.trim(), changed: Object.fromEntries(given.map((f) => [f, reasons.files[f].trim()])), files }, null, 1) + '\n');
    console.log(`seals/${n}.json: the seal before, kept (${sha(prevBytes).slice(0, 12)}); the new seal begins at round ${last + 1} and changes ${changed.length} files, each with its reason`);
  }
  console.log(`SEAL.json: ${Object.keys(files).length} files · seal sha256 ${sha(readFileSync('SEAL.json')).slice(0, 12)}`);
}
