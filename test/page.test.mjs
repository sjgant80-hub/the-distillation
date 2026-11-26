import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, page, KERNELS, BAKED, rewrite, body } from '../scripts/make-page.mjs';

const root = new URL('..', import.meta.url);
const ROOT = fileURLToPath(root).replace(/[\\/]$/, '');
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const LF = (s) => s.split('\r\n').join('\n');
const html = LF(read('index.html')), template = LF(read('page/template.html')), app = LF(read('page/app.js'));
const visible = html.slice(html.indexOf('<body>'), html.indexOf('<script type="module">'));
const published = existsSync(new URL('data/published.json', root)) ? JSON.parse(read('data/published.json')) : { dev: false, rounds: [] };

test('index.html is exactly the build of page/ and the kernels, baked from the published rounds', async () => {
  const built = await page(ROOT);
  let i = 0; while (i < html.length && html[i] === built[i]) i++;
  assert.equal(html.length === built.length && i === html.length, true, `index.html and the build first differ at character ${i} of ${html.length} (built ${built.length}):\nINDEX: ${JSON.stringify(html.slice(Math.max(0, i - 160), i + 240))}\nBUILT: ${JSON.stringify(built.slice(Math.max(0, i - 160), i + 240))}`);
});

test('every kernel is inlined byte for byte, its imports read from the scopes above it', () => {
  for (const [ns, file] of KERNELS) {
    const { code } = body(read(file), file);
    assert.ok(html.includes(`const ${ns} = (() => {\n${code}\n`), `${file} is not inlined as built`);
    for (const line of LF(read(file)).split('\n')) {
      if (line.startsWith('import ')) assert.ok(rewrite(line, file), `${file}: an import the page cannot inline: ${line}`);
      else if (!line.startsWith('export default ')) assert.ok(code.includes(line.replace(/^export /, '')), `${file}: a line changed: ${line}`);
    }
  }
  assert.equal(new Set(KERNELS.map(([, f]) => f.split('/').pop())).size, KERNELS.length, 'no two kernels share a file name');
  // what is vendored comes first, as vendored; this repository's own kernels follow, and every one of them is on the page
  const own = KERNELS.findIndex(([, f]) => f.startsWith('src/'));
  assert.ok(KERNELS.slice(0, own).every(([, f]) => f.startsWith('vendor/'))); assert.ok(KERNELS.slice(own).every(([, f]) => f.startsWith('src/')));
  assert.deepEqual(readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.mjs')).sort(), KERNELS.filter(([, f]) => f.startsWith('src/')).map(([, f]) => f.slice(4)).sort());
});

test('the page code runs: the inlined kernels decide as the modules do', async () => {
  const built = build(ROOT), code = built.slice(built.indexOf('<script type="module">') + 22, built.lastIndexOf('</script>'));
  const kernels = code.slice(0, code.indexOf('// app.js'));
  const mod = await import('data:text/javascript;base64,' + Buffer.from(`${kernels}\nexport { SPLIT, TRACE, COLD, ADOPT, ROUNDS, CLAIMS, JUDGE, GROW, LOOP, SHA, STATS };`).toString('base64'));
  const T = (await import('../src/trace.mjs')).default, A = (await import('../src/adopt.mjs')).default, C = (await import('../src/cold.mjs')).default, S = (await import('../src/split.mjs')).default;
  const task = { id: 'tank', statement: 'Work out 13 × 12 × 26.', ask: '13 × 12 × 26', check: { type: 'value', value: '4056' } };
  const ex = (reply) => ({ id: 'tank', messages: mod.LOOP.opening(task.statement, []), reply });
  for (const reply of ['13 × 12 = 156\n156 × 26 = 4056\nANSWER: 4056', '13 × 12 = 157\n156 × 26 = 4056\nANSWER: 4056', 'ANSWER: 4056']) { assert.deepEqual(mod.TRACE.verified(ex(reply), task), T.verified(ex(reply), task)); assert.deepEqual(mod.COLD.read(reply, task, false), C.read(reply, task, false)); }
  for (const [a, b] of [[true, true], [true, false], [false, true], [null, true]]) assert.deepEqual(mod.ADOPT.decide(a, b), A.decide(a, b));
  assert.equal(mod.SPLIT.identity({ ask: '8 × 7' }), S.identity({ ask: '7 × 8' })); assert.equal(mod.STATS.mcnemar(8, 0), 2 / 256);
  assert.equal(mod.SHA.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.deepEqual(mod.JUDGE.judge({}).notes, ['there is no such round']);
});

test('nothing on the page is dead: every control is wired, every number has a writer, every link on the page has somewhere to go', () => {
  const ids = [...template.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'an id is used twice');
  for (const m of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(m[1]), `the script reaches for #${m[1]}, which is not on the page`);
  for (const id of BAKED) assert.ok(ids.includes(id), `#${id} is baked and is not on the page`);
  for (const m of template.matchAll(/<button[^>]*\sid="([^"]+)"/g)) assert.ok(new RegExp(`\\$\\('${m[1]}'\\)\\.addEventListener\\('click'`).test(app), `the button #${m[1]} does nothing`);
  const binds = [...new Set([...template.matchAll(/data-bind="([^"]+)"/g)].map((m) => m[1]))];
  for (const k of binds) assert.ok(app.includes(`'${k}'`), `nothing writes data-bind="${k}"`);
  for (const m of app.matchAll(/bind\('([^']+)'/g)) assert.ok(binds.includes(m[1]), `the script writes data-bind="${m[1]}", which is not on the page`);
  for (const m of template.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(m[1]), `a link goes to #${m[1]}, which is not on the page`);
  for (const m of visible.matchAll(/href="([^"#][^"]*)"/g)) { const h = m[1]; if (/^https?:/.test(h)) continue; assert.ok(existsSync(new URL(h, root)), `a link goes to ${h}, which is not in the repository`); }
  for (const m of template.matchAll(/url\('([^']+)'\)/g)) assert.ok(existsSync(new URL(m[1], root)), `a font is not in the repository: ${m[1]}`);
  for (const id of ['live', 'result', 'how', 'wall', 'claims', 'glass', 'loop', 'built', 'buyers', 'limits']) assert.ok(new RegExp(`<section[^>]*id="${id}"`).test(template), `the page has no ${id} section`);
});

test('the page says what it must and nothing it must not', () => {
  const text = visible.replace(/<[^>]+>/g, ' ');
  assert.ok(visible.includes('Powered by the Konomi architecture, created by Thomas Frumkin.'));
  assert.ok(visible.includes('Built by Kar')); assert.ok(visible.includes('AI Native Solutions')); assert.ok(visible.includes('support is agreed per deployment, in each deployment\'s agreement'));
  assert.ok(!/[£$€]\s?\d|\d\s?(?:pounds|dollars|euros) (?:a|per) (?:month|year|seat|user)|per seat per|pricing/i.test(text), 'no price is put on a product page');
  assert.ok(!new RegExp('[\\u03ba\\u03c6\\u25ca]|\\b' + ['to', 'rus'].join('') + '\\b', 'i').test(html.slice(0, html.indexOf('<script type="module">'))), 'no private shorthand on a public page');
  assert.ok(!/claude|anthropic/i.test(text), 'the public name is Kar');
  for (const w of ['held-out', 'cold', 'fail-wall', 'grant', 'dissolve']) assert.ok(text.includes(w), `the page never says "${w}"`);
  // the model is named, with its licence, and is not claimed to be in the repository
  assert.match(text, /Llama 3\.2 1B Instruct/); assert.match(text, /Llama 3\.2 Community Licence/);
});

test('no number on the page is left unmeasured; what has not landed says "sealing now"; a failed claim is shown as failed', () => {
  const left = [...visible.matchAll(/not measured yet/g)].length;
  assert.equal(left, 0, `${left} places on the page still read "not measured yet"`);
  if (published.rounds.length === 0) { assert.ok(visible.includes('sealing now'), 'with no sealed round the page says sealing now'); assert.ok(!/class="(now|bad)" data-count/.test(visible), 'and shows no result as if it had landed'); return; }
  const v = JSON.parse(read(`data/rounds/${published.rounds[published.rounds.length - 1]}/verdict.json`));
  const stack = visible.slice(visible.indexOf('id="claimStack"'), visible.indexOf('id="bars"'));
  for (const x of v.verdicts) assert.ok(stack.includes(`<div class="d">${x.id}</div>`), `${x.id} is not on the page`);
  assert.equal([...stack.matchAll(/<span class="tag rd">fail · kept<\/span>/g)].length, v.verdicts.filter((x) => x.pass === false).length, 'every failed claim is shown as failed, in red, and only those');
  assert.ok(visible.includes(v.adopted ? 'The rule: adopt.' : 'The rule: dissolve.'));
  // every receipt has its source one click away
  const receipts = visible.slice(visible.indexOf('id="receipts"'), visible.indexOf('id="verdictLine"'));
  assert.equal([...receipts.matchAll(/class="stat /g)].length, 3); assert.equal([...receipts.matchAll(/class="src" href="data\/rounds\/\d\/verdict\.json"/g)].length, 3);
});

test('the house standard: crystal hero, receipts, stack, glass, honest expander, and no wall of text', () => {
  for (const [what, re] of [['the crystal hero', /<canvas id="crystal"/], ['receipts', /class="stats" id="receipts"/], ['the stack', /class="stack /], ['the glass', /class="glass /], ['the honest expander', /<details class="honest /]]) assert.ok(re.test(template), `the page has no ${what}`);
  // the law of the page: what greets a visitor is numbers and short lines. Prose waits behind a click.
  const open = visible.replace(/<details[\s\S]*?<\/details>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<select[\s\S]*?<\/select>/g, ' ');
  const words = (s) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  for (const m of open.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) assert.ok(words(m[1]) <= 45, `a paragraph of ${words(m[1])} words greets the visitor: "${m[1].replace(/<[^>]+>/g, ' ').slice(0, 80)}…"`);
  assert.ok(words(open) <= 1250, `${words(open)} words on the page before any click: a wall of text`);
  assert.ok([...template.matchAll(/class="claim /g)].length >= 6, 'every section leads with one claim');
});

test('no private repository name is in anything this repository ships (checked by hash: the names are not listed here)', async () => {
  const { createHash } = await import('node:crypto');
  const banned = new Set(JSON.parse(read('data/private-names.sha256.json')).sha256);
  assert.ok(banned.size >= 50);
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const files = ['index.html', 'README.md', 'CLAIMS.md', 'NOTICE', 'seed.json', 'sw.js', 'manifest.webmanifest', 'data/settings.json', 'vendor/PROVENANCE.json', ...['SEAL.md', 'data/published.json', 'data/trace.json', 'data/walk.json'].filter((f) => existsSync(new URL(f, root)))];
  for (const dir of ['src', 'scripts', 'test', 'page', 'py', 'genome', 'vendor/crystal/src', 'vendor/crystal/vendor/climb/src', 'vendor/crystal/vendor/climb/vendor', '.github/workflows']) for (const f of readdirSync(new URL(`${dir}/`, root))) if (!f.endsWith('.pyc') && f !== '__pycache__') files.push(`${dir}/${f}`);
  const seen = new Set();
  for (const f of files) for (const tok of read(f).toLowerCase().match(/[a-z0-9_]+(?:-[a-z0-9_]*)*/g) || []) {
    if (seen.has(tok)) continue;
    seen.add(tok);
    const parts = tok.split('-');
    for (let i = 0; i < parts.length; i++) for (let k = i + 1; k <= parts.length; k++) { const run = parts.slice(i, k).join('-'); if (run.length >= 5) assert.ok(!banned.has(sha(run)), `${f} carries a private repository name (a ${run.length}-letter run in "${tok.slice(0, 4)}…")`); }
  }
});

test('the README opens with the live page, and says what the page says about the rules', () => {
  const readme = read('README.md');
  assert.ok(readme.startsWith('**Live page: https://sjgant80-hub.github.io/the-distillation/**'));
  assert.ok(readme.includes('Powered by the Konomi architecture, created by Thomas Frumkin.')); assert.ok(readme.includes('## Run it yourself'));
  // the README's figures are the records' figures
  const g = JSON.parse(read('data/gates.json')), p = JSON.parse(read('data/parity.json'));
  assert.ok(readme.includes('**' + g.killed + ' / ' + g.total + '**'), 'the mutation gate, as its record has it'); assert.equal(g.clean, true);
  assert.ok(readme.includes('**' + (p.cells.same + p.cold.same + p.grown.same) + ' / ' + (p.cells.n + p.cold.n + p.grown.n) + '**'), 'the generation check, as its record has it');
  if (published.rounds.length === 0) { assert.ok(readme.includes('**sealing now**')); return; }
  const k = published.rounds[published.rounds.length - 1], v = JSON.parse(read(`data/rounds/${k}/verdict.json`)), c = v.cold, pc = (x) => `${(100 * x).toFixed(1)}%`;
  assert.ok(!readme.includes('sealing now'), 'a round has landed: the README no longer says sealing now');
  assert.ok(readme.includes(`**${pc(c.base.rate)} → ${pc(c.distilled.rate)}**`) && readme.includes(`on ${c.n} held-out problems`) && readme.includes(`training on ${v.train.examples} verified examples`), 'the result, as the verdict has it');
  assert.ok(readme.includes(`**${v.verdicts.filter((x) => x.pass === true).length} of 6**`), 'the claims passed, as the verdict has them');
  assert.ok(readme.includes(`${c.base.wrong} → ${c.distilled.wrong} of ${c.n}`) && readme.includes(`**${c.gained.length} problems gained, ${c.lost.length} lost**`), 'confident wrong answers and what moved, as the verdict has them');
  for (const [t, name] of [['easy', 'one-step problems'], ['climb', 'several-step problems'], ['wall', 'the hardest problems']]) assert.ok(readme.includes(`${name} ${v.tiers.base[t].right} → ${v.tiers.distilled[t].right} of`), `${name}, as the verdict has them`);
  for (const t of ['easy', 'climb', 'wall']) if (v.tiers.distilled[t].wrong > v.tiers.base[t].wrong) assert.ok(readme.includes(`they rose, ${v.tiers.base[t].wrong} → ${v.tiers.distilled[t].wrong} of ${v.tiers.base[t].n}`), 'where confident wrong answers rose, the README says so');
});

test('what went wrong in a run is on the page: a hand-written run note states the records\' own hashes and is shown beside the verdict', async () => {
  const { createHash } = await import('node:crypto');
  const sha = (p) => createHash('sha256').update(readFileSync(new URL(p, root))).digest('hex');
  // every note in the repository is listed, and every listed note is there
  const onFile = readdirSync(new URL('data/rounds/', root)).filter((k) => existsSync(new URL(`data/rounds/${k}/run-note.json`, root))).map(Number).sort((a, b) => a - b);
  assert.deepEqual(published.runNotes, onFile);
  for (const k of onFile) {
    const n = JSON.parse(read(`data/rounds/${k}/run-note.json`)), v = JSON.parse(read(`data/rounds/${k}/verdict.json`));
    assert.equal(n.round, k); assert.ok(n.short.length > 40 && n.unknown.length > 0 && n.did.length > 0);
    assert.equal(n.hashes.adapterSha256, v.adapterSha256, 'the note names the adapter the verdict names');
    assert.equal(n.hashes.trainFileSha256, v.train.fileSha256); assert.equal(n.hashes.trainFileSha256, sha(`data/rounds/${k}/train.jsonl`));
    assert.equal(n.hashes.trainLogSha256, sha(`data/rounds/${k}/train-log.json`), 'the training log on file is the one the note hashed');
    assert.equal(n.hashes.trainLogSha256, v.files['train-log.json']);
    // the after-training cold test loaded that adapter, by its own record
    assert.equal(JSON.parse(read(`data/rounds/${k}/cold-distilled.json`)).adapters.at(-1), n.hashes.adapterSha256);
  }
  const last = published.rounds[published.rounds.length - 1];
  if (onFile.includes(last)) {
    const n = JSON.parse(read(`data/rounds/${last}/run-note.json`)), stack = visible.slice(visible.indexOf('id="claimStack"'), visible.indexOf('id="bars"'));
    assert.ok(stack.includes('<div class="d">run</div>') && stack.includes(n.title) && stack.includes(`href="data/rounds/${last}/run-note.json"`), 'the note is beside the verdict, before any click');
    assert.ok(visible.includes('How the round was run.') && visible.includes(n.unknown[0]), 'and what is not known is said');
  }
});

test('where the trained model got more confidently wrong, the page says so in red, from the verdict', () => {
  if (published.rounds.length === 0) return;
  const v = JSON.parse(read(`data/rounds/${published.rounds[published.rounds.length - 1]}/verdict.json`));
  const rose = ['easy', 'climb', 'wall'].filter((t) => v.tiers.distilled[t].wrong > v.tiers.base[t].wrong);
  const receipts = visible.slice(visible.indexOf('id="receipts"'), visible.indexOf('id="verdictLine"'));
  assert.equal([...receipts.matchAll(/<span class="fail">On [a-z -]+ it rose: (\d+) → (\d+)\.<\/span>/g)].length, rose.length, 'one red line on the receipt for each tier where it rose, and only those');
  for (const t of rose) assert.ok(receipts.includes(`it rose: ${v.tiers.base[t].wrong} → ${v.tiers.distilled[t].wrong}.`));
  for (const t of ['easy', 'climb', 'wall']) assert.ok(visible.includes(`${v.tiers.base[t].right} → ${v.tiers.distilled[t].right} of ${v.tiers.base[t].n}`), `the ${t} tier is counted apart on the page`);
});
