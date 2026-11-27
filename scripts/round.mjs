// round.mjs — one round, end to end, on this machine: harvest → build → train → cold test (base, then distilled) →
// judge. Each step writes its own record; a step whose record is already whole is not run again, so a stopped round
// carries on. It decides nothing itself: what may run is src/rounds.mjs's answer, the weights a round stands on are
// src/adopt.mjs's chain (adopted by the rule AND granted by a person), and the verdict is scripts/judge.mjs's.
//   node scripts/round.mjs <dev | round number> --model <model folder> [--python <python>] [--side 12] [--port 8850]
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ADOPT from '../src/adopt.mjs';
import ROUNDS from '../src/rounds.mjs';
import STEPS from '../src/steps.mjs';
import { before, where } from './judge.mjs';

const args = process.argv.slice(2), which = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const model = opt('--model', process.env.DISTILLATION_MODEL), python = opt('--python', process.env.DISTILLATION_PYTHON || 'python');
const side = opt('--side', '12'), port = opt('--port', '8850');
const at = (p) => new URL(`../${p}`, import.meta.url), has = (p) => existsSync(at(p)), json = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const sha = (p) => createHash('sha256').update(readFileSync(at(p))).digest('hex');
const stop = (why) => { console.error(`round ${which}: ${why}`); process.exit(1); };
if (!which || !model) stop('usage: node scripts/round.mjs <dev | round number> --model <model folder> [--python <python>] [--side 12]');
const settings = json('data/settings.json'), k = which === 'dev' ? 0 : Number(which), dir = where(which);
if (which !== 'dev' && !(Number.isInteger(k) && k >= 1 && k <= settings.rounds.seeds.length)) stop('there is no such round');

// what may run: a sealed round only when the loop's own rule says so, and only on granted weights
let chain = [];
if (k > 0) {
  if (!has('SEAL.json')) stop('there is no seal: a sealed round does not start before SEAL.json exists');
  const { history, grants } = before(k), next = ROUNDS.next(history, grants, settings);
  if (!(next.act === 'run' && next.round === k)) stop(`it may not run: ${next.act} — ${next.why}`);
  chain = ADOPT.chain(history, grants);
  for (const c of chain) { const f = `adapters/round-${c.round}/adapter_model.safetensors`; if (!has(f) || sha(f) !== c.adapterSha256) stop(`the adopted weights of round ${c.round} are not on this machine as granted`); }
}
const stands = chain.map((c) => `adapters/round-${c.round}`), out = which === 'dev' ? 'adapters/dev' : `adapters/round-${k}`;
mkdirSync(at(`${dir}/`), { recursive: true });

// Every step's exit is written down in the round's run record (data/…/run.json), one sitting after another. What a
// step says on its error stream is kept in a file while it runs, shown when it ends, and its last lines go in the
// record if it ended badly (with this machine's folder names taken out). src/steps.mjs settles each step: a step
// that ended badly is carried on from only if it is one whose record can be checked whole, and `check` (made from
// the files after the process ended) says it is. Anything else stops the round.
const RUN = `${dir}/run.json`, sitting = { started: new Date().toISOString(), steps: [] };
const wrote = (row) => { sitting.steps.push(row); const rec = has(RUN) ? json(RUN) : { v: 'the-distillation-run/1', note: 'how each step of this round ended, sitting by sitting; written by scripts/round.mjs as the round runs', sittings: [] }; const i = rec.sittings.findIndex((s) => s.started === sitting.started); if (i < 0) rec.sittings.push(sitting); else rec.sittings[i] = sitting; writeFileSync(at(RUN), JSON.stringify(rec, null, 1) + '\n'); };
const here = fileURLToPath(at('.')).replace(/[\\/]+$/, '');
const scrub = (s) => [[model, '<the model folder>'], [python, '<python>'], [here, '.'], [homedir(), '~']].reduce((t, [a, b]) => t.split(a).join(b).split(a.replace(/\\/g, '/')).join(b), s);
const run = (step, cmd, argv, check) => {
  console.log(`\n$ ${cmd} ${argv.join(' ')}`);
  const errFile = `${tmpdir()}/the-distillation-${which}-${step}-${Date.now()}.stderr.txt`, fd = openSync(errFile, 'w'), t = Date.now();
  const r = spawnSync(cmd, argv, { cwd: at('.'), stdio: ['inherit', 'inherit', fd] });
  closeSync(fd);
  const said = readFileSync(errFile, 'utf8'); if (said) process.stderr.write(said);
  const s = STEPS.settle(step, { status: r.status, signal: r.signal, error: r.error ? String(r.error.message) : null, seconds: (Date.now() - t) / 1000, stderr: scrub(said) }, r.status === 0 ? false : check ? check() : false);
  wrote(s.row);
  if (!s.go) stop(`a step failed (${step}: exit ${s.row.exit}${s.row.signal ? `, signal ${s.row.signal}` : ''}): ${s.row.why}`);
  if (s.row.carriedOn) console.log(`\n${step} ended with exit ${s.row.exit}${s.row.signal ? `, signal ${s.row.signal}` : ''}; ${s.row.why}. ${RUN} says so.`);
};
const kill = (child) => { if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGTERM'); };
const whole = (f) => has(`${dir}/${f}`) && json(`${dir}/${f}`).complete === true;
const t0 = Date.now();

// 1 · harvest (the model behind a local door; several problems side by side)
if (!whole('harvest.json')) {
  const door = spawn(python, ['-u', 'py/serve.py', model, port, ...stands], { cwd: at('.'), stdio: ['ignore', 'pipe', 'ignore'] });
  let up = false; door.stdout.on('data', (d) => { if (String(d).includes('serving')) up = true; });
  try {
    for (let i = 0; i < 600 && !up; i++) { if (door.exitCode !== null) stop('the model did not start'); await new Promise((ok) => setTimeout(ok, 500)); }
    if (!up) stop('the model did not start in time');
    run('harvest', process.execPath, ['scripts/harvest.mjs', which, '--side', side, '--port', port]);
  } finally { kill(door); }
  await new Promise((ok) => setTimeout(ok, 3000));           // the model's memory is given back before the trainer loads it
}
// 2 · build: only verified traces, and the held-out questions
run('build', process.execPath, ['scripts/build.mjs', which]);
// 3 · train on that file and nothing else. The trainer's work is whole when a log names this training file and the
// adapter on this machine, each by its SHA-256 (the trainer writes the adapter's hash only after saving it). Whole
// work is not trained again: not when the round's own copy of the log says so, and not when the trainer's copy does
// (it saved, and then its process ended badly, in this sitting or an earlier one).
const trained = (f) => has(f) && has(`${out}/adapter_model.safetensors`) && json(f).trainFileSha256 === sha(`${dir}/train.jsonl`) && typeof json(f).adapterSha256 === 'string' && json(f).adapterSha256 === sha(`${out}/adapter_model.safetensors`);
if (!trained(`${dir}/train-log.json`)) {
  if (trained(`${out}/train-log.json`)) wrote({ step: 'train', skipped: true, why: 'an earlier sitting left the adapter and its log whole: the log names this training file and this adapter, each by its SHA-256' });
  else run('train', python, ['-u', 'py/train.py', model, `${dir}/train.jsonl`, out, 'data/settings.json', ...stands], () => trained(`${out}/train-log.json`));
  copyFileSync(at(`${out}/train-log.json`), at(`${dir}/train-log.json`));
}
// 4 · the cold test: the base, then the distilled model, on the same held-out questions
const cold = [String(settings.cold.maxTokens), String(settings.cold.batch)];
if (!whole('cold-base.json')) run('cold-base', python, ['-u', 'py/cold.py', model, `${dir}/asks.json`, `${dir}/cold-base.json`, ...cold, ...stands], () => whole('cold-base.json'));
if (!whole('cold-distilled.json')) run('cold-distilled', python, ['-u', 'py/cold.py', model, `${dir}/asks.json`, `${dir}/cold-distilled.json`, ...cold, ...stands, out], () => whole('cold-distilled.json'));
// 5 · the verdict
run('judge', process.execPath, ['scripts/judge.mjs', which]);
console.log(`\nround ${which}: done in ${Math.round((Date.now() - t0) / 60000)} minutes of this sitting`);
