// app.js — the page. The kernels above it are the gated code, inlined byte for byte; the house kit (CRYSTAL, HOUSE)
// draws. This file shows what the kernels compute from the published records, as receipts, a stack and a glass, and
// lets a visitor run them: judge a round again, try the training gate, ask the rule. Every number it writes is a
// count from a published record. Where no sealed round has landed yet it says "sealing now", and claims nothing.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bind = (k, html) => { for (const el of document.querySelectorAll(`[data-bind="${k}"]`)) el.innerHTML = html; };
const getText = async (p) => { try { const r = await fetch(p); return r.ok ? await r.text() : null; } catch { return null; } };
const getJSON = async (p) => { const t = await getText(p); try { return t === null ? null : JSON.parse(t); } catch { return null; } };
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const prob = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(3));
const hrs = (s) => (s >= 5400 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);
const many = (n, one, more) => `${n} ${n === 1 ? one : more}`;
const SEALING = '<span class="tag gd">sealing now</span>';
const S = { settings: null, published: null, rounds: {}, shown: null, trace: null, gates: null, parity: null, weights: null, walk: null, machine: null, sealSha: null, seals: [], crystal: null, faces: [] };
// the seal a round was made under: the newest seal that begins at or before it (the practice round takes none)
const sealFor = (k) => { const mine = k === 0 ? S.seals.slice(-1) : S.seals.filter((s) => s.from <= k).slice(-1); return mine.length ? mine[0].sha : null; };
const KIND = { gained: 'gained: failed before, right after', lost: 'lost: right before, failed after', kept: 'right both times', still: 'failed both times' };
const FILL = { gained: '#49e8c8', lost: '#ff6b6b', kept: '#2f8f96', still: '#1c3a45' };
const SAID = { right: 'right', wrong: 'a confident wrong answer', none: 'no answer' };
const TIER = { easy: 'one-step problems', climb: 'several-step problems', wall: 'the hardest problems' };
// the tiers where the trained model gave more confident wrong answers than the base did
const worse = (v) => (v && v.tiers ? JUDGE.TIERS.filter((t) => v.tiers.distilled[t].wrong > v.tiers.base[t].wrong) : []);
const ORGANS = { 'src/split.mjs': 'which problems are held out, by calculation', 'src/trace.mjs': 'what may be trained on: verified working only', 'src/cold.mjs': 'how a cold reply is read: right, wrong, or no answer', 'src/adopt.mjs': 'adopt or dissolve, and the test of a person\'s grant', 'src/rounds.mjs': 'what the loop may do next', 'src/steps.mjs': 'what happens when a step ends badly', 'src/claims.mjs': 'the six claims, ruled on from the evidence', 'src/judge.mjs': 'a round\'s verdict from its records; this page runs it', 'genome/cell.mjs': 'the estate\'s birth check: its judge is the training gate' };

// every held-out problem with what each model said, cold, read here by the sealed checker (src/cold.mjs)
function paired(held, cb, cd) {
  if (!Array.isArray(held) || !cb || !cd || !Array.isArray(cb.rows) || !Array.isArray(cd.rows)) return [];
  const b = new Map(cb.rows.map((r) => [r.id, r])), d = new Map(cd.rows.map((r) => [r.id, r]));
  return held.filter((t) => b.has(t.id) && d.has(t.id)).map((t) => {
    const base = { text: b.get(t.id).text, cut: b.get(t.id).cut === true, ...COLD.read(b.get(t.id).text, t, b.get(t.id).cut) };
    const dist = { text: d.get(t.id).text, cut: d.get(t.id).cut === true, ...COLD.read(d.get(t.id).text, t, d.get(t.id).cut) };
    const kind = base.outcome === 'right' ? (dist.outcome === 'right' ? 'kept' : 'lost') : dist.outcome === 'right' ? 'gained' : 'still';
    return { t, base, dist, kind };
  });
}
const sealedList = () => Object.keys(S.rounds).filter((w) => w !== 'dev').map(Number).sort((a, b) => a - b);
const newest = () => { const ks = sealedList(); return ks.length ? S.rounds[ks[ks.length - 1]] : null; };
const R = () => (S.shown === null ? null : S.rounds[S.shown]);   // the round the glass shows: the newest sealed one, else the development round

// the steps of a round that ended badly, from the runner's own record (src/steps.mjs reads it), in a plain line
const ended = (r) => (r && r.run ? STEPS.bad(r.run) : []);
const STEP = { harvest: 'working', build: 'building the study file', train: 'studying', 'cold-base': 'the test before', 'cold-distilled': 'the test after', judge: 'judging' };
const endedLine = (r) => ended(r).map((b) => `The step “${esc(STEP[b.step] || b.step)}” ended with ${b.exit === null ? `no exit number${b.signal ? ` (signal ${esc(b.signal)})` : ''}` : `exit ${b.exit}`}: ${b.carriedOn ? 'its saved work was checked whole, so the round carried on' : 'the round stopped there'}.`).join(' ');

// ── the result: three receipts, or "sealing now" ──
function renderResult() {
  const r = newest(), v = r && r.verdict, c = v && v.cold;
  if (!c) {
    bind('k.result', 'Round 1 · sealing now');
    const wait = (lab) => `<div class="stat reveal"><div class="n"><span class="was">—</span><span class="arrow">→</span><span class="wait">—</span></div><div class="lab">${lab} ${SEALING}</div></div>`;
    $('receipts').innerHTML = wait('<b>Right, cold, on problems it never trained on.</b> Before and after one round.') + wait('<b>Confident wrong answers.</b> The rule requires this not to rise.') + wait('<b>Problems gained and lost.</b> The fail-wall, both ways.');
    $('verdictLine').innerHTML = 'No sealed round has landed. <b>Nothing is claimed until one has.</b> The number replaces the tag when it does, pass or fail.';
    $('facet').innerHTML = 'Round 1 · sealing now · the gold faces are its six claims';
    return;
  }
  const src = `<a class="src" href="${r.dir}/verdict.json">receipt: round ${v.round} verdict ↗</a>`;
  bind('k.result', `The result · round ${v.round}, sealed`);
  $('receipts').innerHTML = `<div class="stat reveal"><div class="n"><span class="was">${pct(c.base.rate)}</span><span class="arrow">→</span><span class="${c.lift > 0 ? 'now' : 'bad'}" data-count="${pct(c.distilled.rate)}">${pct(c.distilled.rate)}</span></div><div class="lab"><b>Right, cold, on ${c.n} problems it never trained on.</b> The same model, before and after training on ${v.train ? v.train.examples : 0} verified examples of its own working.</div>${src}</div>`
    + `<div class="stat reveal"><div class="n"><span class="was">${c.base.wrong}</span><span class="arrow">→</span><span class="${c.distilled.wrong <= c.base.wrong ? 'now' : 'bad'}" data-count="${c.distilled.wrong}">${c.distilled.wrong}</span></div><div class="lab"><b>Confident wrong answers.</b> An answer given, and wrong. The rule requires this not to rise.${worse(v).map((t) => ` <span class="fail">On ${TIER[t]} it rose: ${v.tiers.base[t].wrong} → ${v.tiers.distilled[t].wrong}.</span>`).join('')}</div>${src}</div>`
    + `<div class="stat reveal"><div class="n"><span class="now" data-count="+${c.gained.length}">+${c.gained.length}</span> <span class="bad">−${c.lost.length}</span></div><div class="lab"><b>Problems gained and lost.</b> Failed before and right after, against the other way. p = ${prob(c.p)}.</div>${src}</div>`;
  const next = v.next || {};
  $('verdictLine').innerHTML = v.adopted
    ? `<b class="pass">The rule: adopt.</b> It did better on unseen problems and was no more often sure of a wrong answer, so it is kept. ${next.act === 'wait' ? `It now waits for a person's recorded yes.` : next.act === 'run' ? `A person has said yes. Round ${next.round} may run.` : `The loop has stopped: ${esc(next.why || '')}.`}`
    : '<b class="fail">The rule: dissolve.</b> It did not clear both pass marks, so the new version is dropped. The AI stays as it was. The gains have flattened: the house is full.';
  $('facet').innerHTML = `Round ${v.round} · sealed · <b>${pct(c.base.rate)} → ${pct(c.distilled.rate)}</b> right, cold · point at a face`;
}

// ── how it works, traced from a real run ──
function renderTrace() {
  const t = S.trace, h = t && t.harvested;
  if (!h) { $('traceStack').innerHTML = `<div class="srow gold"><div class="d">—</div><div class="nm"><b>No run yet</b><span>a real harvested problem is traced here once one is published</span>${SEALING}</div></div>`; return; }
  const row = (e, i) => { const d = String(i + 1).padStart(2, '0'), said = typeof e.said === 'string' ? `wrote <code>${esc(e.said)}</code>` : 'already known';
    return e.kind === 'bond' ? `<div class="srow"><div class="d">${d}</div><div class="nm"><b>${esc(e.cell)}</b><span>${said}</span><span class="tag cy">true · kept</span></div></div>`
      : e.kind === 'set' ? `<div class="srow"><div class="d">${d}</div><div class="nm"><b>${esc(e.cell)}</b><span>already held: <code>${esc(e.value)}</code></span><span class="tag cy">kept</span></div></div>`
      : `<div class="srow red"><div class="d">${d}</div><div class="nm"><b>${esc(e.cell)}</b><span>${said}</span><span class="tag rd">${e.kind === 'split' ? 'false · split smaller' : 'false · dissolved'}</span></div></div>`; };
  const held = t.held ? `<div class="srow gold"><div class="d">cold</div><div class="nm"><b>A held-out problem</b><span>before: ${SAID[t.held.base.outcome]} · after: ${SAID[t.held.distilled.outcome]}</span><span class="tag ${t.held.distilled.outcome === 'right' ? 'cy' : 'rd'}">${esc(t.held.id)}</span></div></div>` : '';
  $('traceStack').innerHTML = `<div class="srow"><div class="d">ask</div><div class="nm"><span>${esc(h.statement)}</span></div></div>${h.events.map(row).join('')}<div class="srow"><div class="d">learn</div><div class="nm"><b>The training example</b><span>${many(h.lines, 'verified line', 'verified lines')} from ${many(h.calls, 'model call', 'model calls')}, ending <code>${esc(h.reply.split('\n').pop())}</code></span><span class="tag cy">${esc(t.from)}</span></div></div>${held}`;
}

// ── the fail-wall: the glass ──
function wallSvg(r) {
  const rows = r.rows, cols = rows.length > 120 ? 33 : 21, cell = 30, pad = 4, parts = [];
  let y = 0;
  for (const tier of JUDGE.TIERS) {
    const g = rows.filter((x) => x.t.tier === tier);
    if (g.length === 0) continue;
    const right = (m) => g.filter((x) => x[m].outcome === 'right').length;
    parts.push(`<text x="0" y="${y + 13}">${esc(tier)} · ${g.length} problems · right ${right('base')} → ${right('dist')}</text>`);
    y += 22;
    g.forEach((x, i) => { parts.push(`<rect data-id="${esc(x.t.id)}" x="${(i % cols) * cell}" y="${y + Math.floor(i / cols) * cell}" width="${cell - pad}" height="${cell - pad}" rx="3" fill="${FILL[x.kind]}"><title>${esc(x.t.id)} · ${KIND[x.kind]}</title></rect>`); });
    y += Math.ceil(g.length / cols) * cell + 12;
  }
  const n = (k) => rows.filter((x) => x.kind === k).length;
  return `<svg viewBox="0 0 ${cols * cell} ${y}" role="img" aria-label="${rows.length} held-out problems: ${n('gained')} gained, ${n('kept')} right both times, ${n('still')} failed both times, ${n('lost')} lost."><style>text{font:500 12px 'JetBrains Mono',ui-monospace,monospace;fill:#6f8698}</style>${parts.join('')}</svg>`;
}
function renderWall() {
  const r = R();
  if (!r || r.rows.length === 0) { $('wallBox').innerHTML = `<p class="mono dim" style="margin:0">No cold test is published yet. ${SEALING}</p>`; return; }
  $('wallBox').innerHTML = `${S.shown === 'dev' ? `<p class="mono pend" style="margin:0 0 12px;font-size:12px">Showing the practice round (not a claim). Round 1: sealing now.</p>` : ''}${wallSvg(r)}`;
}
function openProblem(id) {
  const r = R(), x = r && r.rows.find((y) => y.t.id === id);
  if (!x) return;
  const side = (name, m) => `<div class="box"><h4>${name}: <span class="${m.outcome === 'right' ? 'pass' : m.outcome === 'wrong' ? 'fail' : 'pend'}">${SAID[m.outcome]}</span></h4><pre>${esc(m.text) || '(nothing)'}</pre><p class="dim" style="font-size:12px;margin:8px 0 0">${m.answer === null ? 'no answer given' : `answer ${esc(m.answer)}`} · ${many(m.trueLines, 'true line', 'true lines')}, ${m.falseLines} false${m.cut ? ' · cut at the length limit' : ''}</p></div>`;
  $('probe').innerHTML = `<p style="color:var(--ink);margin:0 0 6px"><b>${esc(x.t.id)}</b> · ${esc(x.t.tier)} · <span class="${x.kind === 'gained' ? 'pass' : x.kind === 'lost' ? 'fail' : 'dim'}">${KIND[x.kind]}</span></p><p style="color:var(--soft);font-family:var(--sans);font-size:14.5px;margin:0 0 12px">${esc(x.t.statement)}${x.t.check && x.t.check.type === 'value' ? ` <span class="dim">Right answer: ${esc(x.t.check.value)}.</span>` : ''}</p><div class="two">${side('Before', x.base)}${side('After', x.dist)}</div>`;
  if ($('open').value !== id) $('open').value = id;
}
function fillOpen() {
  const r = R();
  if (!r || r.rows.length === 0) return;
  const group = (k) => { const g = r.rows.filter((x) => x.kind === k); return g.length ? `<optgroup label="${KIND[k]} (${g.length})">${g.map((x) => `<option value="${esc(x.t.id)}">${esc(x.t.id)} · ${esc(x.t.tier)}</option>`).join('')}</optgroup>` : ''; };
  $('open').innerHTML = `<option value="">Choose one, or press a square…</option>${['gained', 'lost', 'kept', 'still'].map(group).join('')}`;
}

// ── the six claims ──
const PLAIN = { K1: 'It got better', K2: 'Still honest', K3: 'More gained than lost', K4: 'The rule was followed', K5: 'It studied only checked work', K6: 'The test was kept apart' };
// one plain line for a claim, built from the verdict's own counts (the sealed wording is in the expander below)
function plainly(x, v) {
  const c = v.cold, t = v.train, h = v.held;
  if (x.id === 'K1' && c) return `Right on ${c.distilled.right} of ${c.n} unseen problems. Before it studied: ${c.base.right}.`;
  if (x.id === 'K2' && c) return `Sure of a wrong answer ${c.distilled.wrong} times. Before: ${c.base.wrong}.`;
  if (x.id === 'K3' && c) return `${c.gained.length} problems newly solved. ${c.lost.length} lost.`;
  if (x.id === 'K4' && c) return `The rule says ${v.adopted ? 'keep it' : 'drop it'}. That is what is published.`;
  if (x.id === 'K5' && t) return `${t.verified} of ${t.examples} examples it studied were checked by exact sums.`;
  if (x.id === 'K6' && h) return `${h.overlap} of ${h.n} test problems were in what it studied, and ${h.harvested} were in the first step.`;
  return 'Not measured for this round.';
}
function renderClaims() {
  const r = newest(), v = r && r.verdict, bars = CLAIMS.bars(S.settings || {});
  const rows = v ? v.verdicts : Object.keys(CLAIMS.NAMES).map((id) => ({ id, name: CLAIMS.NAMES[id], pass: null, result: 'round 1 has not run' }));
  $('claimStack').innerHTML = rows.map((x) => `<div class="srow ${x.pass === false ? 'red' : x.pass === null ? 'gold' : ''}"><div class="d">${x.id}</div><div class="nm"><b>${esc(v ? PLAIN[x.id] || x.name : x.name)}</b><span>${esc(v ? plainly(x, v) : x.result)}</span>${x.pass === true ? '<span class="tag cy">pass</span>' : x.pass === false ? '<span class="tag rd">fail · kept</span>' : SEALING}</div></div>`).join('') + (v && v.notes.length ? `<div class="srow red"><div class="d">note</div><div class="nm"><span>${v.notes.map(esc).join('; ')}</span></div></div>` : '')
    + (r && r.note ? `<div class="srow gold"><div class="d">run</div><div class="nm"><b>${esc(r.note.title)}</b><span>${esc(r.note.short)} <a href="${r.dir}/run-note.json">The note ↗</a></span></div></div>` : '')
    + (r && ended(r).length ? `<div class="srow gold"><div class="d">run</div><div class="nm"><b>A step ended badly</b><span>${endedLine(r)} <a href="${r.dir}/run.json">The record ↗</a></span></div></div>` : '');
  const res = (id) => { const x = v && v.verdicts.find((y) => y.id === id); return x ? ` <span class="dim">Result: ${esc(x.result)}.</span>` : ''; };
  $('bars').innerHTML = Object.keys(CLAIMS.NAMES).map((id) => `<p><b>${id} · ${esc(CLAIMS.NAMES[id])}.</b> ${esc(bars[id][0].toUpperCase() + bars[id].slice(1))}.${res(id)}</p>`).join('') + `<p>Registered in <a href="CLAIMS.md">CLAIMS.md</a> and frozen by <a href="${S.seals.length > 1 ? S.seals[0].file : 'SEAL.json'}">the ${S.seals.length > 1 ? 'first seal' : 'seal'}</a> before round 1 ran${S.seals.length > 1 ? '. No later seal has changed them: <a href="SEAL.md">what a later seal changed, and why</a>' : ''}.</p>`;
}

// ── the loop ──
function renderLoop() {
  const ks = sealedList(), last = ks.length ? S.rounds[ks[ks.length - 1]].verdict : null;
  const caps = S.settings ? S.settings.spend : { hoursPerRound: 0, hoursInAll: 0 }, most = S.settings ? S.settings.rounds.max : 0;
  const win = (n, l) => `<div class="win reveal"><div class="wn">${n}</div><div class="wl">${l}</div></div>`;
  if (!last || !last.gauge) {
    $('loopState').innerHTML = `The loop has not started. Round 1 is ${SEALING}`;
    $('gauge').innerHTML = '';
    $('loopWins').innerHTML = win(`0<span class="of">/${most}</span>`, 'sealed rounds run, of the most the seal allows') + win(`0<span class="of">/${caps.hoursInAll}</span>`, 'hours of model work spent, of the cap for all rounds') + win('0', 'grants on file: no weights have been adopted') + win('—', 'where the loop stands: not started');
    $('grantBox').innerHTML = '<p>There is no adopted round, so there is nothing to grant.</p>';
    return;
  }
  const G = last.gauge, W = 1000, H = 250, x0 = 70, x1 = 940, y0 = 190, y1 = 26, yOf = (p) => y0 - (y0 - y1) * p, xOf = (i) => x0 + (G.length === 1 ? (x1 - x0) / 2 : (x1 - x0) * (i / (G.length - 1)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => `<path d="M${x0 - 6} ${yOf(p)}H${x1}" stroke="rgba(255,255,255,.06)"/><text fill="#6f8698" x="8" y="${yOf(p) + 4}">${Math.round(p * 100)}%</text>`).join('');
  const marks = G.map((g, i) => { const x = xOf(i), col = g.adopted ? '#49e8c8' : '#ff6b6b'; return `<path d="M${x} ${yOf(g.base)}V${yOf(g.distilled)}" stroke="${col}" stroke-width="3"/><circle cx="${x}" cy="${yOf(g.base)}" r="5" fill="#02070c" stroke="#aebecb" stroke-width="2"/><circle cx="${x}" cy="${yOf(g.distilled)}" r="7" fill="${col}"/><text fill="#e9f2f6" x="${x + 14}" y="${yOf(g.distilled) + 4}">${pct(g.distilled)}</text><text fill="#6f8698" x="${x + 14}" y="${yOf(g.base) + 4}">${pct(g.base)}</text><text fill="#e9f2f6" x="${x - 30}" y="${y0 + 26}">round ${g.round}</text><text fill="${g.adopted ? (g.granted ? '#49e8c8' : '#ffcf6a') : '#ff6b6b'}" x="${x - 62}" y="${y0 + 44}">${g.adopted ? (g.granted ? 'adopted · granted' : 'adopted · awaiting grant') : 'dissolved'}</text>`; }).join('');
  $('gauge').innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;margin-top:36px" role="img" aria-label="${G.map((g) => `Round ${g.round}: ${pct(g.base)} before, ${pct(g.distilled)} after, ${g.adopted ? 'adopted' : 'dissolved'}.`).join(' ')}"><style>text{font:500 12px 'JetBrains Mono',ui-monospace,monospace}</style>${ticks}${marks}</svg>`;
  const n = last.next, granted = G.filter((g) => g.adopted && g.granted).length;
  $('loopState').innerHTML = n.act === 'wait' ? `Round ${n.round} was adopted by the rule. <b class="pend">Its weights wait for a person's grant:</b> a recorded yes, in their own words. Round ${n.round + 1} cannot run on the loop's own say-so.` : n.act === 'run' ? `Round ${n.round - 1} was adopted and granted. <b>Round ${n.round} may run.</b>` : n.act === 'full' ? `<b class="pass">The house is full.</b> Round ${n.round} did not clear its bar and was dissolved. The loop has stopped.` : `The loop has stopped at a cap: ${esc(n.why)}.`;
  const sp = last.spend;
  $('loopWins').innerHTML = win(`${ks.length}<span class="of">/${most}</span>`, 'sealed rounds run, of the most the seal allows') + win(`${sp.total.toFixed(1)}<span class="of">/${sp.inAll}</span>`, `hours of model work spent, of the cap: ${hrs(last.seconds.harvest)} harvest, ${hrs(last.seconds.train)} training, ${hrs(last.seconds.coldBase + last.seconds.coldDistilled)} tests`) + win(String(granted), 'grants on file: weights a person has allowed to stand') + win(n.act === 'wait' ? '<span class="pend">waiting</span>' : n.act === 'full' ? 'full' : n.act === 'run' ? 'ready' : 'capped', 'where the loop stands');
  const gr = S.rounds[last.round].grant;
  $('grantBox').innerHTML = gr ? `<p><b>Granted.</b> "${esc(gr.words)}"</p><p class="dim">${esc(gr.at)} · weights <code>${esc(String(gr.adapterSha256).slice(0, 16))}…</code> · <a href="data/grants/round-${last.round}.json">the record</a></p>`
    : last.adopted ? `<p><b>No grant is on file for round ${last.round}.</b> The weights become the next round's base only when a person writes a record naming this round and these exact weights:</p><pre>node scripts/grant.mjs ${last.round} "your own words"</pre><p class="dim" style="margin-top:10px">Weights <code>${esc(String(last.adapterSha256).slice(0, 16))}…</code>. A record for another round or other weights opens nothing; the test is <code>src/adopt.mjs</code>.</p>`
    : `<p>Round ${last.round} was dissolved by the rule. A grant cannot adopt what the rule dissolved.</p>`;
}

// ── under the hood ──
function renderBuilt() {
  const g = S.gates, p = S.parity, w = S.weights, last = newest();
  $('kernelStack').innerHTML = g && g.files ? Object.entries(g.files).map(([f, x], i) => `<div class="srow ${x.clean ? '' : 'red'}"><div class="d">${String(i + 1).padStart(2, '0')}</div><div class="nm"><b>${esc(f.split('/').pop().replace('.mjs', ''))}</b><span>${esc(ORGANS[f] || f)}</span><span class="tag ${x.clean ? 'cy' : 'rd'}">${x.killed}/${x.total} caught</span></div></div>`).join('') : `<div class="srow gold"><div class="d">—</div><div class="nm"><span>the gate record is not published yet</span></div></div>`;
  const win = (n, l, href) => `<div class="win reveal"><div class="wn">${n}</div><div class="wl">${l}${href ? ` <a class="src" href="${href}">receipt ↗</a>` : ''}</div></div>`;
  const pn = p ? p.cells.n + p.cold.n + p.grown.n : 0, ps = p ? p.cells.same + p.cold.same + p.grown.same : 0;
  $('builtWins').innerHTML = win(g ? `${g.killed}<span class="of">/${g.total}</span>` : '—', 'planted bugs caught by the tests, nothing exempted', 'data/gates.json')
    + win(p ? `${ps}<span class="of">/${pn}</span>` : '—', 'replies identical to plain generation', 'data/parity.json')
    + win(w ? `${w.tensorsCompared}<span class="of">/${w.tensorsInTheOtherCopy}</span>` : '—', 'weight tensors matched to a separate copy', 'data/weights.json')
    + win(S.sealSha ? `<span style="font-size:.62em">${S.sealSha.slice(0, 10)}…</span>` : '—', S.sealSha ? `the seal${S.seals.length > 1 ? `, ${S.seals.length} in a chain` : ''}: every result-changing file, frozen${last && last.verdict ? (last.verdict.sealSha256 === sealFor(last.verdict.round) ? `; round ${last.verdict.round} records ${S.seals.length > 1 ? 'the seal it ran under' : 'this seal'}` : '; <span class="fail">the newest round records another seal</span>') : ''}` : 'the seal has not been made yet', S.sealSha ? (S.seals.length > 1 ? 'SEAL.md' : 'SEAL.json') : '');
}

// ── for your business, the honest lines, the buyer walk, the development round ──
function renderWords() {
  const r = newest(), v = r && r.verdict, c = v && v.cold, ks = sealedList();
  const p = S.parity, pn = p ? p.cells.n + p.cold.n + p.grown.n : 0, ps = p ? p.cells.same + p.cold.same + p.grown.same : 0;
  const card = (who, h, body) => `<div class="act reveal"><span class="num">${who}</span><h3>${h}</h3><p>${body}</p></div>`;
  const calls = v && v.harvest ? (v.harvest.calls / Math.max(1, v.harvest.problems)).toFixed(1) : null;
  $('roleCards').innerHTML = card('CHIEF EXECUTIVE', 'It changes when you say.', 'Better at your own work, on your own hardware. No change stands without a measurement and a named yes.')
    + card('FINANCE', 'No seat. No meter.', c ? `Round ${v.round} took ${v.hours.toFixed(1)} hours on one laptop processor${S.machine ? ` (${esc(S.machine.cpu)})` : ''}: ${hrs(v.seconds.harvest)} working, ${hrs(v.seconds.train)} studying, ${hrs(v.seconds.coldBase + v.seconds.coldDistilled)} on tests. The cost is a machine you already own.` : `The cost is a machine you already own and the hours it runs. Round 1's hours: ${SEALING}`)
    + card('OPERATIONS', 'One call, not many.', c && calls ? `Checked, a problem took ${calls} model calls. Cold it is one, right on ${pct(c.distilled.rate)} of unseen problems (before: ${pct(c.base.rate)}).` : `Checked work takes many model calls a problem. Cold it is one. The cold number: ${SEALING}`)
    + card('TECHNOLOGY', 'One machine. Plain files.', 'Everything runs locally. The training file is text anyone can verify with a calculator.')
    + card('RISK AND AUDIT', 'Every change, on record.', 'Test set and pass mark fixed first. Full training data. Before and after. Decided by code, signed off by a person.')
    + card('THE BOARD', 'Nothing unmeasured.', c ? `Round ${v.round}: ${v.verdicts.filter((x) => x.pass === true).length} of 6 claims passed${v.verdicts.some((x) => x.pass === false) ? `; ${v.verdicts.filter((x) => x.pass === false).map((x) => x.id).join(', ')} failed and stay on the page` : ''}.` : `A change that fails its bar is thrown away and published. Round 1: ${SEALING}`);
  bind('l.parity', p ? `Checked: ${ps} of ${pn} replies identical to plain generation.` : 'The generation check is not published yet.');
  bind('l.rounds', ks.length ? `${many(ks.length, 'sealed round has', 'sealed rounds have')} run.` : 'No sealed round has run yet.');
  const T = v && v.tiers, note = r && r.note;
  bind('l.tiers', T ? `Right, before → after: ${JUDGE.TIERS.filter((t) => T.base[t].n > 0).map((t) => `${TIER[t]} ${T.base[t].right} → ${T.distilled[t].right} of ${T.base[t].n}`).join('; ')}.${worse(v).map((t) => ` <span class="fail">On ${TIER[t]} it gave more confident wrong answers: ${T.base[t].wrong} → ${T.distilled[t].wrong}, and left fewer blank (${T.base[t].none} → ${T.distilled[t].none}).</span>`).join('')} The hardest problems are ones like finding the two primes that multiply to a number, or a sum over a three-by-three grid.` : 'Each kind of problem is counted apart when round 1 lands.');
  bind('l.run', note ? `${esc(note.short)} ${esc(note.means || '')} ${note.unknown.map(esc).join(' ')} <a href="${r.dir}/run-note.json">The note.</a>` : r && r.run ? `Round ${v.round} ran in ${many(r.run.sittings.length, 'sitting', 'sittings')}. ${ended(r).length ? endedLine(r) : 'Every step ended well.'} <a href="${r.dir}/run.json">The record.</a>` : c ? `Round ${v.round} ran start to finish in one sitting.` : 'Anything that goes wrong in a run is written here.');
  bind('l.wrong', c ? `After training it still gave a confident wrong answer on ${c.distilled.wrong} of ${c.n} unseen problems.` : 'How often it is still confidently wrong is measured in round 1.');
  bind('l.compute', c ? `Round ${v.round} took ${v.hours.toFixed(1)} hours of a laptop processor. The seal caps a round at ${S.settings.spend.hoursPerRound} hours and all rounds at ${S.settings.spend.hoursInAll}. If a round runs over, no further round may start.` : `A round is hours of a laptop processor; the seal caps one at ${S.settings ? S.settings.spend.hoursPerRound : '—'}.`);
  bind('b.risk', c ? (v.adopted ? `In round ${v.round} the weights cleared the bar.` : `In round ${v.round} they did not, and were dropped.`) : '');
  bind('b.held', v && v.held ? `In round ${v.round}, ${v.held.overlap} of ${v.held.n} held-out problems are in the training set and ${v.held.harvested} were harvested.` : 'The claims are measured only on problems never harvested and never trained on, and the page counts any overlap.');
  bind('b.wrong', c ? `In round ${v.round}: ${c.distilled.wrong} of ${c.n} after, ${c.base.wrong} before.` : '');
  const w = S.walk;
  $('walk').innerHTML = w ? `<p>${esc(w.note)}</p>${w.personas.map((q) => `<p><b>${esc(q.who)}:</b> ${esc(q.verdict)}${q.gaps.map((g) => `<br>· ${esc(g.gap)} → ${esc(g.fix)}`).join('')}</p>`).join('')}` : '<p>The simulated buyer walk has not been run yet.</p>';
  const d = S.rounds.dev, dv = d && d.verdict;
  $('devBox').innerHTML = dv && dv.cold ? `<p>A practice run, made before the seal, on different problems. It set the length limits and tuned the speed. Cold, on ${dv.cold.n} held-out problems: ${dv.cold.base.right} right before, ${dv.cold.distilled.right} after (${dv.cold.gained.length} gained, ${dv.cold.lost.length} lost); confident wrong ${dv.cold.base.wrong} → ${dv.cold.distilled.wrong}; ${dv.train ? dv.train.examples : 0} training examples. The rule would have ${dv.adopted ? 'adopted' : 'dissolved'} it. Its weights are used by no sealed round. <a href="data/dev/verdict.json">Its verdict.</a></p>` : '<p>The practice round is not published yet.</p>';
}

// ── the crystal: 24 faces are the six claims of each of four rounds; four more are the organ ──
function faces() {
  const out = [], names = Object.keys(CLAIMS.NAMES), ks = sealedList(), most = S.settings ? S.settings.rounds.max : 4;
  const nextUp = ks.length === 0 ? 1 : (S.rounds[ks[ks.length - 1]].verdict.next || {}).act === 'run' ? ks[ks.length - 1] + 1 : 0;
  for (let k = 1; k <= 4; k++) for (let i = 0; i < 6; i++) {
    const v = S.rounds[k] && S.rounds[k].verdict, x = v ? v.verdicts[i] : null;
    out.push(x ? { state: x.pass === true ? 1 : x.pass === false ? 3 : 2, text: `<b>Round ${k} · ${x.id} ${esc(x.name)}</b> · ${x.pass === true ? 'pass' : x.pass === false ? 'FAIL, kept' : 'sealing now'} · ${esc(x.result)}` }
      : { state: k === nextUp ? 2 : 0, text: k === nextUp ? `<b>Round ${k} · ${names[i]} ${esc(CLAIMS.NAMES[names[i]])}</b> · sealing now` : k <= most ? `Round ${k} · ${names[i]} · not run: it needs the round before it adopted and granted` : '' });
  }
  const g = S.gates, p = S.parity, w = S.weights;
  out.push({ state: g ? (g.clean ? 1 : 3) : 0, text: g ? `<b>The mutation gate</b> · ${g.killed} of ${g.total} planted bugs caught` : 'The mutation gate' });
  out.push({ state: S.sealSha ? 1 : 2, text: S.sealSha ? `<b>The seal</b> · ${S.sealSha.slice(0, 12)}…` : '<b>The seal</b> · sealing now' });
  out.push({ state: p ? (p.cells.same + p.cold.same + p.grown.same === p.cells.n + p.cold.n + p.grown.n ? 1 : 3) : 0, text: '<b>The generation check</b> · batched replies against plain ones' });
  out.push({ state: w ? (w.verdict.startsWith('same') ? 1 : 3) : 0, text: w ? `<b>The weights</b> · ${w.tensorsCompared} of ${w.tensorsInTheOtherCopy} tensors matched a separate copy` : 'The weights' });
  while (out.length < 32) out.push({ state: 0, text: '' });
  return out;
}
// ── the loop, live: the round as it runs, from its own log (scripts/live.mjs). Telemetry, never a verdict ──
const STAGES = [['harvest', 'Harvest'], ['build', 'Build'], ['train', 'Train'], ['cold-base', 'Test cold: before'], ['cold-distilled', 'Test cold: after'], ['judged', 'Verdict']];
function renderLive(l) {
  if (!l || !l.stage || l.stage === 'idle') { $('liveBox').innerHTML = 'No round is running right now.'; return; }
  const at = STAGES.findIndex(([k]) => k === l.stage), what = l.round === 'dev' ? 'The development round' : `Round ${l.round}`;
  const chips = STAGES.map(([, name], i) => `<span class="tag ${l.done || i < at ? 'cy' : i === at ? 'gd' : 'off'}">${name}</span>`).join('');
  const t = l.train, h = l.harvest, c = l.stage === 'cold-distilled' ? l.cold.distilled : l.cold.base;
  let line = `${what} is starting.`, spark = '';
  if (l.stage === 'harvest' && h) line = `${what}: <b>${h.done} of ${h.total}</b> problems worked under the checker · ${h.complete} finished · ${h.calls} model calls.`;
  if (l.stage === 'build') line = `${what}: <b>${l.examples}</b> verified examples built. Training starts next.`;
  if (l.stage === 'train' && t) line = `${what}: training on its own verified working · <b>step ${t.step} of ${t.steps}</b>${t.loss.length ? ` · training loss ${t.loss[0].toFixed(3)} → ${t.loss[t.loss.length - 1].toFixed(3)}` : ''}.`;
  if ((l.stage === 'cold-base' || l.stage === 'cold-distilled') && c) line = `${what}: asking held-out problems cold, ${l.stage === 'cold-base' ? 'before' : 'after'} training · <b>${c.done} of ${c.total}</b>.`;
  if (l.stage === 'judged') line = `${what}: judged. ${(l.verdict || []).map((x) => `<span class="${x.pass === true ? 'pass' : x.pass === false ? 'fail' : 'pend'}">${x.id}</span>`).join(' ')} · the numbers are published once every record has been checked again.`;
  if (l.failed) line += ' <span class="fail">The run stopped on an error; it carries on from its records.</span>';
  const out = l.done && l.round !== 'dev' && S.rounds[l.round] ? S.rounds[l.round].verdict : null;
  if (out && out.cold) line = `${what} has finished and is published: <b>the result is just below.</b> ${out.next && out.next.act === 'wait' ? `Round ${out.round + 1} cannot start until a person grants these weights.` : 'No round is running right now.'}`;
  if (t && t.loss.length > 1) { const top = Math.max(...t.loss, 0.001), pts = t.loss.map((y, i) => `${(i / (t.loss.length - 1) * 300).toFixed(1)},${(58 - 54 * Math.min(1, y / top)).toFixed(1)}`).join(' '); spark = `<svg class="spark" viewBox="0 0 300 60" preserveAspectRatio="none" role="img" aria-label="Training loss on its own verified working, falling from ${t.loss[0].toFixed(3)} to ${t.loss[t.loss.length - 1].toFixed(3)}."><polyline points="${pts}" fill="none" stroke="#49e8c8" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><span class="dim" style="font-size:11.5px">training loss on its own verified working, step by step</span>`; }
  $('liveBox').innerHTML = `<div class="chips">${chips}</div>${line}${spark}<br><span class="dim" style="font-size:11.5px">as of ${esc(String(l.at || '').replace('T', ' ').slice(0, 16))} UTC</span>`;
  if (S.crystal && !l.done && !l.failed) S.crystal.setEnergy(1.15);
}

function render() { renderResult(); renderTrace(); renderWall(); renderClaims(); renderLoop(); renderBuilt(); renderWords(); S.faces = faces(); }

// ── what a visitor can run ──
// a call that hands back a record's own replies in order, in place of a model
const recorded = (rec) => { const said = rec.events.filter((e) => typeof e.said === 'string'); let i = 0; return async () => { const e = said[i++] || {}; return { text: typeof e.said === 'string' ? e.said : '', ms: e.ms, prompt: e.prompt, reply: e.reply }; }; };
const breathe = () => new Promise((ok) => setTimeout(ok, 0));
async function rejudge() {
  const r = R(), out = $('rejudgeOut');
  if (!r || !r.verdict) { out.innerHTML = 'No round is published yet.'; return; }
  $('rejudge').disabled = true;
  try {
    out.innerHTML = 'Fetching the records…';
    const [harvest, log, train] = await Promise.all([getJSON(`${r.dir}/harvest.json`), getJSON(`${r.dir}/train-log.json`), getText(`${r.dir}/train.jsonl`)]);
    if (!harvest || !log || train === null) { out.innerHTML = '<span class="fail">The records could not be fetched.</span>'; return; }
    out.innerHTML = 'Making every block of problems again from its seed…'; await breathe();
    const P = SPLIT.plan(S.settings), k = S.shown === 'dev' ? 0 : Number(S.shown), set = k === 0 ? P.dev : P.rounds[k - 1], byId = new Map(set.pool.map((t) => [t.id, t]));
    let same = 0;
    for (const [i, rec] of harvest.records.entries()) {
      if (i % 40 === 0) { out.innerHTML = `Growing harvested problem ${i + 1} of ${harvest.records.length} again from its recorded replies…`; await breathe(); }
      const again = await GROW.grow(byId.get(rec.id), recorded(rec), { maxTicks: S.settings.harvest.maxTicks, maxTokens: S.settings.harvest.maxTokens });
      if (JSON.stringify(again) === JSON.stringify(rec)) same++;
    }
    out.innerHTML = 'Verifying every training line and reading every cold reply again…'; await breathe();
    const history = [], grants = {};
    for (let q = 1; q < k; q++) if (S.rounds[q]) { if (S.rounds[q].verdict && S.rounds[q].verdict.cold) history.push(JUDGE.row(S.rounds[q].verdict)); if (S.rounds[q].grant) grants[q] = S.rounds[q].grant; }
    if (k > 0 && r.grant) grants[k] = r.grant;
    const v = JUDGE.judge({ which: k === 0 ? 'dev' : k, settings: S.settings, set, seal: sealFor(k), history, grants, harvest, log, coldBase: r.cb, coldDistilled: r.cd, train });
    const { files, at, ...was } = r.verdict;
    const identical = JSON.stringify(was) === JSON.stringify(v) && same === harvest.records.length;
    out.innerHTML = `${identical ? '<span class="pass">Judged again here: the same verdict.</span>' : '<span class="fail">Judged again here: NOT the published verdict.</span>'} ${same} of ${harvest.records.length} harvested problems grew again identically · ${v.train ? `${v.train.verified} of ${v.train.examples} training examples verified again` : 'no training file taken'} · ${v.cold ? `${2 * v.cold.n} cold replies read again` : 'no cold test taken'} · ${v.verdicts.map((x) => `${x.id} ${x.pass === true ? 'pass' : x.pass === false ? 'FAIL' : 'pending'}`).join(', ')}${S.shown === 'dev' ? ' · (the development round: not a claim)' : ''}`;
    if (S.crystal) S.crystal.setEnergy(identical ? 1.3 : 0.4);
  } finally { $('rejudge').disabled = false; }
}
function tryTrace() {
  const h = S.trace && S.trace.harvested;
  if (!h || !h.task) { $('tryOut').innerHTML = 'No round is published yet, so there is no example to check.'; return; }
  const v = TRACE.verified({ id: h.task.id, messages: LOOP.opening(h.task.statement, []), reply: $('tryReply').value.replace(/\r\n/g, '\n').replace(/\n+$/, '') }, h.task);
  $('tryOut').innerHTML = v.ok ? `<span class="pass">Verified.</span> ${many(v.lines, 'line', 'lines')}, each a single true step, and the answer is the problem's own. It may be trained on.` : `<span class="fail">Refused: ${esc(v.why)}.</span> It would not be trained on.`;
}
function tryRule() {
  const num = (id) => { const x = Number($(id).value); return Number.isInteger(x) && x >= 0 ? x : null; };
  const n = num('rN'), g = num('rG'), l = num('rL'), wb = num('rWB'), wd = num('rWD');
  if ([n, g, l, wb, wd].includes(null) || n < 1 || g + l > n || wb > n - l || wd > n - g) { $('ruleOut').innerHTML = '<span class="fail">Those numbers cannot all be true of one block of problems.</span>'; return; }
  const tally = (right, wrong) => ({ n, right, wrong, none: n - right - wrong, rate: right / n, silent: wrong / n });
  const cold = { n, base: tally(l, wb), distilled: tally(g, wd), lift: (g - l) / n, gained: Array.from({ length: g }, (_, i) => i), lost: Array.from({ length: l }, (_, i) => i), p: STATS.mcnemar(g, l) };
  const v = CLAIMS.verdicts({ cold }, S.settings), rule = ADOPT.decide(v[0].pass, v[1].pass);
  $('ruleOut').innerHTML = `Lift ${(100 * cold.lift).toFixed(1)} points, p = ${prob(cold.p)}: K1 ${v[0].pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'} · wrong ${wb} → ${wd}: K2 ${v[1].pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'} · <b class="${rule.adopt ? 'pass' : 'fail'}">${rule.adopt ? 'ADOPT' : 'DISSOLVE'}</b> (${esc(rule.why)})`;
}

async function load() {
  const [settings, published, gates, parity, weights, trace, sealText] = await Promise.all([getJSON('data/settings.json'), getJSON('data/published.json'), getJSON('data/gates.json'), getJSON('data/parity.json'), getJSON('data/weights.json'), getJSON('data/trace.json'), getText('SEAL.json')]);
  const walk = published && published.walk ? await getJSON('data/walk.json') : null;   // asked for only when it is on file
  S.machine = published && published.machine ? await getJSON('data/machine.json') : null;
  Object.assign(S, { settings, published, gates, parity, weights, trace, walk, sealSha: sealText === null ? null : SHA.sha256(sealText) });
  // the seals in order, each hashed here from its own bytes; the last is SEAL.json
  for (const s of (published && published.seals) || (sealText === null ? [] : [{ file: 'SEAL.json', from: 1 }])) { const t = s.file === 'SEAL.json' ? sealText : await getText(s.file); if (t !== null) S.seals.push({ file: s.file, from: s.from, sha: SHA.sha256(t) }); }
  const list = [...(published && published.dev ? ['dev'] : []), ...((published && published.rounds) || []).map(String)];
  for (const w of list) {
    const dir = w === 'dev' ? 'data/dev' : `data/rounds/${w}`;
    const [verdict, held, cb, cd, build] = await Promise.all([getJSON(`${dir}/verdict.json`), getJSON(`${dir}/held.json`), getJSON(`${dir}/cold-base.json`), getJSON(`${dir}/cold-distilled.json`), getJSON(`${dir}/build.json`)]);
    const grant = w !== 'dev' && published.grants.includes(Number(w)) ? await getJSON(`data/grants/round-${w}.json`) : null;
    const note = w !== 'dev' && (published.runNotes || []).includes(Number(w)) ? await getJSON(`${dir}/run-note.json`) : null;   // asked for only when it is on file
    const run = w !== 'dev' && (published.runs || []).includes(Number(w)) ? await getJSON(`${dir}/run.json`) : null;      // the runner's own record, when there is one
    S.rounds[w] = { which: w, dir, verdict, held, cb, cd, build, grant, note, run, rows: paired(held, cb, cd) };
  }
  const sealed = list.filter((w) => w !== 'dev');
  S.shown = sealed.length ? sealed[sealed.length - 1] : list.includes('dev') ? 'dev' : null;
}
const ready = (async () => {
  await load();
  render();
  fillOpen();
  const h = S.trace && S.trace.harvested;
  if (h) $('tryReply').value = h.reply;
  $('open').addEventListener('change', (e) => openProblem(e.target.value));
  $('wallBox').addEventListener('click', (e) => { const id = e.target && e.target.getAttribute && e.target.getAttribute('data-id'); if (id) openProblem(id); });
  $('rejudge').addEventListener('click', rejudge);
  $('tryTrace').addEventListener('click', tryTrace);
  $('tryReset').addEventListener('click', () => { if (h) $('tryReply').value = h.reply; $('tryOut').innerHTML = 'Press Check it.'; });
  $('tryRule').addEventListener('click', tryRule);
  const live = async () => renderLive(await getJSON(`data/live.json?${typeof Date === 'function' && typeof location !== 'undefined' ? Date.now() : ''}`));
  await live();
  if (typeof location !== 'undefined' && typeof setInterval === 'function') setInterval(live, 60000);   // the loop, as it runs
  // the living part: the crystal bound to the claims, the numbers running up, sections rising
  const idle = $('facet').innerHTML;
  S.crystal = CRYSTAL.mount($('crystal'), { energy: 0.9 });
  if (S.crystal) {
    S.crystal.setFaces(S.faces.map((f) => f.state));
    S.crystal.onHover((i) => { $('facet').innerHTML = i >= 0 && S.faces[i] && S.faces[i].text ? S.faces[i].text : idle; });
    S.crystal.onPick((i) => { const el = i < 24 ? $('claims') : $('built'); if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth' }); });
    HOUSE.bindScroll(S.crystal, 0.9);
  }
  if (typeof document.querySelectorAll === 'function') { for (const el of document.querySelectorAll('[data-count]')) HOUSE.count(el, el.getAttribute('data-count')); }
  HOUSE.reveal(document); HOUSE.light(document);
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined' && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
window.__distillation = { ready, S, render, rejudge, tryTrace, tryRule, openProblem, paired, faces };
