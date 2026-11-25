// seal.mjs — freeze everything that can change a result before a sealed round is run: the kernels, the vendored
// Crystal engine, the model's hands (py/), the scripts that harvest, build and judge, the settings (which hold every
// round's seeds, the bars, the most rounds and the spend wall), and the claims file. Writes SEAL.json (a SHA-256 of
// each file's bytes). test/seal.test.mjs then fails if any sealed byte changes, and a round counts only when its
// harvest and its verdict record this seal's own hash.
//   node scripts/seal.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
if (process.argv[1] && process.argv[1].endsWith('seal.mjs')) {
  const files = Object.fromEntries(sealed().map((f) => {
    const b = readFileSync(f);
    if (b.includes(13)) throw new Error(`${f} has a carriage return: the seal hashes LF bytes only`);
    return [f, sha(b)];
  }));
  writeFileSync('SEAL.json', JSON.stringify({ v: 'the-distillation-seal/1', note: 'every file that can change a result, frozen before a sealed round was run; a round counts only when its harvest and its verdict record the SHA-256 of this file', files }, null, 1) + '\n');
  console.log(`SEAL.json: ${Object.keys(files).length} files · seal sha256 ${sha(readFileSync('SEAL.json')).slice(0, 12)}`);
}
