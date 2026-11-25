// harvest.mjs — the sealed Crystal engine, run wide. Every problem of a harvest pool is grown by The Crystal's own
// grow() (vendored, byte for byte), each on its own with no shared memory, so each record stands alone and every
// bonded line in it was written by the model for that very problem. The model is the one behind py/serve.py.
// Several problems are grown side by side; the record is written as it goes, and a stopped harvest carries on.
//   node scripts/harvest.mjs <dev | round number> [--port 8850] [--side 8] [--limit N]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import G from '../vendor/crystal/src/grow.mjs';
import SPLIT from '../src/split.mjs';

const args = process.argv.slice(2), which = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : Number(args[i + 1]); };
const port = opt('--port', 8850), side = opt('--side', 8), limit = opt('--limit', Infinity);
const settings = JSON.parse(readFileSync(new URL('../data/settings.json', import.meta.url), 'utf8'));
const P = SPLIT.plan(settings);
const set = which === 'dev' ? P.dev : P.rounds[Number(which) - 1];
if (!set) { console.error('usage: node scripts/harvest.mjs <dev | round number> [--port 8850] [--side 8] [--limit N]'); process.exit(2); }
const dir = which === 'dev' ? 'data/dev' : `data/rounds/${Number(which)}`, path = `${dir}/harvest.json`;
mkdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true });
const at = (p) => new URL(`../${p}`, import.meta.url);

// a sealed round is harvested under the seal, and says which: the seal is every file that can change a result
const seal = which === 'dev' ? null : existsSync(at('SEAL.json')) ? createHash('sha256').update(readFileSync(at('SEAL.json'))).digest('hex') : undefined;
if (seal === undefined) { console.error('there is no seal: a sealed round is not harvested before SEAL.json exists'); process.exit(1); }
const info = await (await fetch(`http://127.0.0.1:${port}/info`)).json();
if (info.weights_sha256 !== settings.model.weightsSha256) { console.error('the model behind the door is not the one the settings name'); process.exit(1); }
// a dropped connection is tried again: the same conversation always gets the same greedy reply, so asking twice
// changes nothing. An answer from the door that says the model failed is not retried: it stops the harvest.
const call = async (messages, maxTokens) => {
  const body = JSON.stringify({ messages, max_tokens: maxTokens });
  for (let attempt = 1; ; attempt++) {
    let r;
    try { r = await fetch(`http://127.0.0.1:${port}/ask`, { method: 'POST', headers: { 'content-type': 'application/json' }, body }); } catch (e) { if (attempt >= 5) throw e; await new Promise((ok) => setTimeout(ok, 500 * attempt)); continue; }
    if (!r.ok) throw new Error(`the model's door answered ${r.status}: ${await r.text()}`);
    const j = await r.json();
    return { text: j.text, ms: j.ms, prompt: j.prompt, reply: j.reply, cut: j.cut };
  }
};

const prior = existsSync(at(path)) ? JSON.parse(readFileSync(at(path), 'utf8')) : null;
const out = prior && prior.set === which ? prior : { v: 'the-distillation-harvest/1', set: which, sealSha256: seal, model: info.model, weightsSha256: info.weights_sha256, adapters: info.adapters, settings: settings.harvest, started: new Date().toISOString(), seconds: 0, records: [], complete: false };
if (JSON.stringify(out.adapters) !== JSON.stringify(info.adapters) || out.weightsSha256 !== info.weights_sha256) { console.error('a harvest begun on other weights cannot be carried on'); process.exit(1); }
if ((out.sealSha256 ?? null) !== seal) { console.error('a harvest begun under another seal cannot be carried on'); process.exit(1); }
const done = new Set(out.records.map((r) => r.id)), todo = set.pool.filter((t) => !done.has(t.id)).slice(0, limit);
const save = () => writeFileSync(at(path), JSON.stringify(out));
const t0 = Date.now(), base = out.seconds;
let next = 0, since = 0;
console.log(`${which}: ${set.pool.length} problems in the pool, ${done.size} grown already, ${todo.length} to grow, ${side} side by side`);
await Promise.all(Array.from({ length: Math.max(1, side) }, async () => {
  while (next < todo.length) {
    const task = todo[next++];
    const rec = await G.grow(task, call, { maxTicks: settings.harvest.maxTicks, maxTokens: settings.harvest.maxTokens });
    out.records.push(rec);
    out.seconds = base + Math.round((Date.now() - t0) / 1000);
    if (++since % 10 === 0) { save(); console.log(`${out.records.length} of ${set.pool.length} · ${out.records.filter((r) => r.complete && r.home).length} complete · ${out.records.reduce((a, r) => a + r.calls, 0)} calls · ${out.seconds} s`); }
  }
}));
// the record is kept in the pool's own order, whatever order the problems finished in
const order = new Map(set.pool.map((t, i) => [t.id, i]));
out.records.sort((a, b) => order.get(a.id) - order.get(b.id));
out.complete = out.records.length === set.pool.length;
out.finished = new Date().toISOString();
save();
console.log(`done: ${out.records.length} grown, ${out.records.filter((r) => r.complete && r.home).length} complete, ${out.records.reduce((a, r) => a + r.calls, 0)} calls, ${out.seconds} s`);
