// gates.mjs (the-distillation) — run the witness mutation gate on every gated file and record the result in data/gates.json.
//   node scripts/gates.mjs --witness <path to witness.mjs> [--check] [--only <file>]
// --check (CI): every gate must be CLEAN and match the committed counts, or this exits 1. Nothing is exempted:
// a file listed under "nothing to mutate" is listed with its reason, and is never counted as a pass.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const GATED = [
  ['src/split.mjs', ['test/split.test.mjs']],
  ['src/trace.mjs', ['test/trace.test.mjs']],
  ['src/cold.mjs', ['test/cold.test.mjs']],
  ['src/adopt.mjs', ['test/adopt.test.mjs']],
  ['src/rounds.mjs', ['test/rounds.test.mjs']],
  ['src/claims.mjs', ['test/claims.test.mjs']],
  ['src/judge.mjs', ['test/judge.test.mjs']],
  ['genome/cell.mjs', ['test/genome.test.mjs']],
];
export const NOTHING_TO_MUTATE = {
  'genome/io.mjs, judge.mjs, lane.mjs, health.mjs, tombstone.mjs': "the estate genome's hook template, byte for byte; gated in estate-genome (template/genome), exercised here by the birth check in CI",
  'vendor/crystal/**': "The Crystal's kernels (and The Climb's inside them), byte for byte as each seal froze them; gated in the-crystal and the-climb (data/gates.json there) and compared with The Crystal's repository on every push (scripts/vendor.mjs --check)",
  'py/llm.py, py/serve.py, py/cold.py, py/train.py': "the model's hands: they load the weights, write replies and train the adapter, and decide nothing. Every reply and every training line is judged from the records by the gated kernels above. The generation path is checked against the library's own plain generation (py/parity.py, recorded in data/parity.json); the trainer's loss is checked against the whole-example loss on every step it runs",
  'page/*.js': 'the glass: it draws the published records and decides nothing; every verdict on the page is made again in the tab by the gated kernels',
};

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i < 0 ? null : args[i + 1]; };
const witness = opt('--witness'), only = opt('--only'), checkMode = args.includes('--check');
// --list: the gated files as JSON, so CI can gate each in a job of its own (one job for all would run for hours)
if (args.includes('--list')) { console.log(JSON.stringify(GATED.map(([f]) => f))); process.exit(0); }
// --record: the committed record lists exactly the gated files, each CLEAN, and its totals are theirs
if (args.includes('--record')) {
  const g = existsSync('data/gates.json') ? JSON.parse(readFileSync('data/gates.json', 'utf8')) : { files: {} }, rows = Object.values(g.files || {});
  const same = JSON.stringify(Object.keys(g.files || {}).sort()) === JSON.stringify(GATED.map(([f]) => f).sort());
  const ok = same && g.clean === true && rows.every((f) => f.clean === true) && g.total === rows.reduce((a, f) => a + f.total, 0) && g.killed === rows.reduce((a, f) => a + f.killed, 0);
  console.log(ok ? `the gate record lists all ${rows.length} gated files, each CLEAN: ${g.killed}/${g.total}` : 'the gate record is incomplete, not clean, or its totals are not its files\'');
  process.exit(ok ? 0 : 1);
}
if (!witness || !existsSync(witness)) { console.error('usage: node scripts/gates.mjs --witness <witness.mjs> [--check] [--only <file>]'); process.exit(2); }

const committed = existsSync('data/gates.json') ? JSON.parse(readFileSync('data/gates.json', 'utf8')) : { files: {} };
// a file that is no longer gated (renamed or removed) is dropped from the record, never kept as a pass or a fail
const files = Object.fromEntries(Object.entries(committed.files).filter(([f]) => GATED.some(([g]) => g === f)));
let bad = 0;
for (const [file, tests] of GATED) {
  if (only && only !== file) continue;
  const r = spawnSync(process.execPath, [witness, 'mutate', file, '--cap', '100000', '--timeout', '120000', '--test', 'node', '--test', ...tests], { encoding: 'utf8', maxBuffer: 64 << 20 });
  const out = r.stdout || '';
  let j = null;
  try { j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch { j = null; }
  const got = j ? { total: j.total, killed: j.killed, ignored: (j.ignored || []).length, clean: j.clean === true } : { total: 0, killed: 0, ignored: 0, clean: false };
  const was = committed.files[file];
  const drift = checkMode && (!was || was.total !== got.total || was.killed !== got.killed || (was.ignored || 0) !== got.ignored);
  if (!got.clean || drift) bad++;
  console.log(`${got.clean ? 'CLEAN' : 'NOT CLEAN'} ${got.killed}/${got.total}  ${file}${drift ? '  (differs from data/gates.json)' : ''}`);
  if (j && !got.clean) for (const s of j.survived || []) console.log('  survivor: ' + JSON.stringify(s).slice(0, 200));
  files[file] = got;
}
if (!checkMode) {
  const total = Object.values(files).reduce((a, f) => a + f.total, 0), killed = Object.values(files).reduce((a, f) => a + f.killed, 0);
  writeFileSync('data/gates.json', JSON.stringify({ witness: 'v0.6', total, killed, clean: Object.values(files).every((f) => f.clean), files, nothingToMutate: NOTHING_TO_MUTATE }, null, 1) + '\n');
}
process.exit(bad ? 1 : 0);
