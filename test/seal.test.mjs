import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import S from '../src/split.mjs';
import K from '../src/claims.mjs';
import G from '../vendor/crystal/src/grow.mjs';
import CLIMB from '../vendor/crystal/vendor/climb/src/loop.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const at = (p) => new URL(`../${p}`, import.meta.url);
const rd = (p) => JSON.parse(readFileSync(at(p), 'utf8'));
const under = (dir, ext) => readdirSync(at(`${dir}/`)).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`);
const settings = rd('data/settings.json');

test('what it stands on is The Crystal as its seal froze it: every vendored file has its recorded hash, and nothing else is there', () => {
  const p = rd('vendor/PROVENANCE.json');
  assert.equal(p.crystal.repo, 'sjgant80-hub/the-crystal'); assert.match(p.crystal.commit, /^[0-9a-f]{40}$/); assert.match(p.crystal.sealSha256, /^[0-9a-f]{64}$/);
  const have = [...under('vendor/crystal/src', '.mjs'), ...under('vendor/crystal/vendor/climb/src', '.mjs'), ...under('vendor/crystal/vendor/climb/vendor', '.mjs')].map((f) => f.replace('vendor/crystal/', '')).sort();
  assert.deepEqual(p.crystal.files.map((f) => f.path).sort(), have); assert.ok(p.crystal.files.length >= 18);
  for (const f of p.crystal.files) assert.equal(sha(readFileSync(at(`vendor/crystal/${f.path}`))), f.sha256, f.path);
});

test('the sealed numbers: one model, the harvest as The Crystal is sealed, the bars, four rounds, the spend wall', () => {
  assert.equal(settings.model.name, 'Llama-3.2-1B-Instruct'); assert.match(settings.model.weightsSha256, /^[0-9a-f]{64}$/); assert.equal(settings.model.precision, 'float32');
  // the harvest asks each cell exactly as The Crystal's sealed run did
  assert.deepEqual(settings.harvest, { maxTokens: G.SETTINGS.maxTokens, maxTicks: G.SETTINGS.maxTicks });
  assert.deepEqual(settings.cold, { maxTokens: 256, batch: 8 }); assert.ok(settings.cold.maxTokens >= CLIMB.SETTINGS.maxTokens, 'the cold test gives no less room than The Climb\'s one try');
  assert.deepEqual(settings.trace, { maxLines: 24 });
  assert.deepEqual(settings.bars, { liftPoints: 5, alpha: 0.05 });
  assert.deepEqual(settings.train, { rank: 16, alpha: 32, targets: ['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'], epochs: 3, learningRate: 0.0002, batch: 8, seed: 20261125 });
  assert.deepEqual([settings.rounds.max, settings.rounds.seeds.length, settings.rounds.harvestSheets, settings.rounds.testSheets], [4, 4, 120, 40]);
  assert.deepEqual(settings.spend, { hoursPerRound: 12, hoursInAll: 48 });
  const seeds = [settings.dev.harvestSeed, settings.dev.testSeed, ...settings.rounds.seeds.flatMap((s) => [s.harvest, s.test])];
  assert.equal(new Set(seeds).size, seeds.length, 'every block is made from a seed of its own');
});

test('held out means held out: no round\'s held-out problem is in any round\'s harvest pool, and no dev problem is in a sealed block', () => {
  const P = S.plan(settings);
  assert.equal(P.rounds.length, 4);
  const held = P.rounds.flatMap((r) => r.held);
  for (const r of P.rounds) {
    assert.ok(r.pool.length >= 400 && r.held.length >= 150, `round ${r.round}: ${r.pool.length} to harvest, ${r.held.length} held out`);
    assert.equal(S.overlap(r.pool, held).count, 0, `round ${r.round}'s pool holds a held-out problem`);
    assert.equal(S.overlap(r.held, [...P.dev.pool, ...P.dev.held]).count, 0, `round ${r.round}'s held-out block holds a development problem`);
    assert.ok(r.pool.every((t) => t.ask !== null), 'every harvested problem is a calculation the engine can grow');
    assert.equal(S.unique(r.held).repeats, 0); assert.equal(S.unique(r.pool).repeats, 0);
  }
  assert.equal(S.overlap(P.dev.pool, P.dev.held).count, 0);
});

test('the claims file states each bar word for word as the code rules on it', () => {
  const text = readFileSync(at('CLAIMS.md'), 'utf8').replace(/\s+/g, ' ');
  const bars = K.bars(settings);
  for (const id of Object.keys(K.NAMES)) {
    const cap = (s) => s[0].toUpperCase() + s.slice(1);
    assert.ok(text.includes(`**${id} · ${K.NAMES[id]}.** ${cap(bars[id])}.`), `${id}: CLAIMS.md does not state the bar as src/claims.mjs has it`);
  }
});

test('once the seal is made, every sealed file still has the bytes it froze, and every sealed round was made under it', async () => {
  const { sealed } = await import('../scripts/seal.mjs');
  for (const f of sealed()) assert.ok(existsSync(at(f)), `${f} is to be sealed and is not there`);
  if (!existsSync(at('SEAL.json'))) { assert.ok(!existsSync(at('data/rounds/1/harvest.json')), 'a sealed round cannot begin before the seal exists'); return; }
  const seal = rd('SEAL.json');
  assert.equal(seal.v, 'the-distillation-seal/1');
  for (const [f, h] of Object.entries(seal.files)) { assert.equal(sha(readFileSync(at(f))), h, `${f} changed after the seal`); assert.ok(!readFileSync(at(f)).includes(13), `${f} holds a carriage return`); }
  assert.deepEqual(Object.keys(seal.files).sort(), sealed().sort());
  const own = sha(readFileSync(at('SEAL.json')));
  for (let k = 1; k <= settings.rounds.seeds.length; k++) for (const f of ['harvest.json', 'verdict.json']) if (existsSync(at(`data/rounds/${k}/${f}`))) assert.equal(rd(`data/rounds/${k}/${f}`).sealSha256, own, `round ${k}'s ${f} was not made under this seal`);
});
