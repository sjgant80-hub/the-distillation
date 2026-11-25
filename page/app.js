// app.js — the page. The kernels above it are the gated code, inlined byte for byte; this file shows what they
// compute from the published records, and lets a visitor run them: judge a round again, try the training gate, try
// the adoption rule. Every number it writes is a count from a published record, read here by those kernels.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bind = (k, html) => { for (const el of document.querySelectorAll(`[data-bind="${k}"]`)) el.innerHTML = html; };
const getText = async (p) => { try { const r = await fetch(p); return r.ok ? await r.text() : null; } catch { return null; } };
const getJSON = async (p) => { const t = await getText(p); try { return t === null ? null : JSON.parse(t); } catch { return null; } };
const NM = '<span class="pend">not measured yet</span>';
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const prob = (p) => (p < 0.001 ? p.toExponential(1) : p.toFixed(3));
const hrs = (s) => (s >= 5400 ? `${(s / 3600).toFixed(1)} hours` : `${Math.round(s / 60)} minutes`);
const many = (n, one, more) => `${n} ${n === 1 ? one : more}`;
const S = { settings: null, published: null, rounds: {}, shown: null, trace: null, gates: null, parity: null, walk: null, sealSha: null };
const KIND = { gained: 'gained: failed before, right after', lost: 'lost: right before, failed after', kept: 'right both times', still: 'failed both times' };
const FILL = { gained: 'var(--lume)', lost: 'var(--red)', kept: 'var(--kept)', still: 'var(--still)' };
const SAID = { right: 'right', wrong: 'a confident wrong answer', none: 'no answer' };

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
const R = () => (S.shown === null ? null : S.rounds[S.shown]);
const sealedList = () => Object.keys(S.rounds).filter((w) => w !== 'dev').map(Number).sort((a, b) => a - b);
const label = (w) => (w === 'dev' ? 'the development round' : `round ${w}`);

// ── the hero: the status line, the ledger, the fail-wall ──
function renderHero() {
  const r = R(), v = r && r.verdict, c = v && v.cold;
  if (!c) {
    $('status').innerHTML = 'No round is published yet. Every number on this page is filled in from a published record, so there is nothing to show until one is.';
    $('wall').innerHTML = NM;
    return;
  }
  const dev = S.shown === 'dev';
  const out = v.adopted ? `<span class="pass">The rule adopts these weights.</span> ${v.next ? esc(nextLine(v.next)) : ''}` : '<span class="fail">The rule dissolves these weights: the base stays as it was.</span>';
  $('status').innerHTML = dev
    ? `<span class="pend">No sealed round is published yet.</span> What is shown is the development round, which shaped the settings and is not a claim: cold, on ${c.n} held-out problems, the base was right on ${c.base.right} and the distilled model on ${c.distilled.right}.`
    : `Round ${v.round}, sealed: cold, on ${c.n} held-out problems, the base was right on ${c.base.right} and the distilled model on ${c.distilled.right}. ${out}`;
  bind('n.base', pct(c.base.rate)); bind('n.distilled', pct(c.distilled.rate)); bind('n.gained', String(c.gained.length)); bind('n.lost', String(c.lost.length));
  bind('n.wrong', `${c.base.wrong} → ${c.distilled.wrong}`); bind('n.train', v.train ? String(v.train.verified) : '—');
  bind('n.outcome', v.adopted ? '<span class="pass">ADOPT</span>' : '<span class="fail">DISSOLVE</span>');
  $('wall').innerHTML = wallSvg(r);
}
function nextLine(next) {
  return next.act === 'wait' ? `They now wait for a person's grant; round ${next.round + 1} cannot start without it.`
    : next.act === 'run' ? `A person has granted them; round ${next.round} may run.`
    : next.act === 'full' ? 'The loop has stopped: the house is full.'
    : `The loop has stopped: ${next.why}.`;
}
function wallSvg(r) {
  const rows = r.rows;
  if (rows.length === 0) return NM;
  const cols = rows.length > 120 ? 21 : 15, cell = 36, pad = 4, parts = [];
  let y = 0;
  for (const tier of JUDGE.TIERS) {
    const g = rows.filter((x) => x.t.tier === tier);
    if (g.length === 0) continue;
    const right = (m) => g.filter((x) => x[m].outcome === 'right').length;
    parts.push(`<text x="0" y="${y + 14}" class="m">${esc(tier)} · ${g.length} problems · right before ${right('base')}, after ${right('dist')}</text>`);
    y += 22;
    g.forEach((x, i) => { parts.push(`<rect data-id="${esc(x.t.id)}" x="${(i % cols) * cell}" y="${y + Math.floor(i / cols) * cell}" width="${cell - pad}" height="${cell - pad}" fill="${FILL[x.kind]}"><title>${esc(x.t.id)} · ${KIND[x.kind]}</title></rect>`); });
    y += Math.ceil(g.length / cols) * cell + 10;
  }
  const n = (k) => rows.filter((x) => x.kind === k).length;
  return `<svg viewBox="0 0 ${cols * cell} ${y}" role="img" aria-label="${rows.length} held-out problems: ${n('gained')} gained, ${n('kept')} right both times, ${n('still')} failed both times, ${n('lost')} lost."><style>text{font:500 12px 'JetBrains Mono',ui-monospace,monospace;fill:#a3c3cb}</style>${parts.join('')}</svg>`;
}
function openProblem(id) {
  const r = R(), x = r && r.rows.find((y) => y.t.id === id);
  if (!x) return;
  const side = (name, m) => `<div class="box"><h4>${name}, cold: <span class="${m.outcome === 'right' ? 'pass' : m.outcome === 'wrong' ? 'fail' : 'pend'}">${SAID[m.outcome]}</span></h4><pre>${esc(m.text) || '(nothing)'}</pre><p class="small">Read by the sealed checker: ${m.answer === null ? 'no answer given' : `answer ${esc(m.answer)}`}; ${many(m.trueLines, 'true line', 'true lines')} of working, ${m.falseLines} false${m.cut ? '; the reply ran to the length limit, so its last line was not read' : ''}.</p></div>`;
  $('probe').innerHTML = `<p><b>${esc(x.t.id)}</b> · ${esc(x.t.tier)} · <span class="${x.kind === 'gained' ? 'pass' : x.kind === 'lost' ? 'fail' : ''}">${KIND[x.kind]}</span></p><p>${esc(x.t.statement)}</p>${x.t.check && x.t.check.type === 'value' ? `<p class="small">The right answer is ${esc(x.t.check.value)}.</p>` : ''}<div class="two">${side('The base', x.base)}${side('The distilled model', x.dist)}</div>`;
  if ($('open').value !== id) $('open').value = id;
}
function fillOpen() {
  const r = R();
  if (!r || r.rows.length === 0) return;
  const group = (k) => { const g = r.rows.filter((x) => x.kind === k); return g.length ? `<optgroup label="${KIND[k]} (${g.length})">${g.map((x) => `<option value="${esc(x.t.id)}">${esc(x.t.id)} · ${esc(x.t.tier)}</option>`).join('')}</optgroup>` : ''; };
  $('open').innerHTML = `<option value="">Choose a held-out problem…</option>${['gained', 'lost', 'kept', 'still'].map(group).join('')}`;
}

// ── the numbers ──
function renderNumbers() {
  const r = R(), v = r && r.verdict;
  if (!v) { for (const id of ['claimsTable', 'tierTable', 'moved', 'trainTable']) $(id).innerHTML = NM; bind('t.which', NM); }
  else {
    const files = ['verdict.json', 'harvest.json', 'train.jsonl', 'held.json', 'cold-base.json', 'cold-distilled.json', 'train-log.json'].map((f) => `<a href="${r.dir}/${f}">${f}</a>`).join(' · ');
    bind('t.which', `${S.shown === 'dev' ? '<span class="pend">These are the development round\'s numbers. It is not a claim: it shaped the settings.</span>' : `These are round ${v.round}'s numbers, made under the seal.`} Judged ${esc(String(v.at).slice(0, 10))} from its records: ${files}.`);
    $('claimsTable').innerHTML = `<table><thead><tr><th>Claim</th><th>The bar, fixed first</th><th>What happened</th><th>Verdict</th></tr></thead><tbody>${v.verdicts.map((x) => `<tr><td><b>${x.id}</b> ${esc(x.name)}</td><td>${esc(x.bar)}</td><td>${esc(x.result)}</td><td class="${x.pass === true ? 'pass' : x.pass === false ? 'fail' : 'pend'}">${x.pass === true ? 'PASS' : x.pass === false ? 'FAIL' : 'pending'}</td></tr>`).join('')}</tbody></table>${v.notes.length ? `<p class="fail">${v.notes.map(esc).join('; ')}</p>` : ''}`;
    if (v.tiers) {
      const cellOf = (t) => `<td class="num">${t.right} of ${t.n}</td><td class="num">${t.wrong}</td><td class="num">${t.none}</td>`;
      $('tierTable').innerHTML = `<table><thead><tr><th>Tier</th><th>Base right</th><th>wrong</th><th>no answer</th><th>Distilled right</th><th>wrong</th><th>no answer</th></tr></thead><tbody>${JUDGE.TIERS.filter((t) => v.tiers.base[t].n > 0).map((t) => `<tr><td>${t}</td>${cellOf(v.tiers.base[t])}${cellOf(v.tiers.distilled[t])}</tr>`).join('')}<tr><td><b>all</b></td>${cellOf(v.cold.base)}${cellOf(v.cold.distilled)}</tr></tbody></table><p class="small">Easy problems are one step. Climb problems are several. Wall problems are the ones a small model mostly cannot do in one try. "Wrong" is an answer given and wrong; "no answer" is a reply with no answer line, or one cut off before it.</p>`;
      const chips = (ids, cls) => ids.map((id) => `<button type="button" class="chip ${cls}" data-open="${esc(id)}">${esc(id)}</button>`).join('');
      $('moved').innerHTML = `<p><b class="pass">${many(v.cold.gained.length, 'problem', 'problems')} gained</b>: failed by the base, solved by the distilled model.</p><div>${chips(v.cold.gained, '') || '<span class="small">none</span>'}</div><p><b class="${v.cold.lost.length ? 'fail' : ''}">${many(v.cold.lost.length, 'problem', 'problems')} lost</b>: solved by the base, failed by the distilled model.</p><div>${chips(v.cold.lost, 'lost') || '<span class="small">none</span>'}</div><p class="small">Press one to read both replies.</p>`;
    } else { $('tierTable').innerHTML = NM; $('moved').innerHTML = NM; }
    const b = r.build, t = v.train;
    $('trainTable').innerHTML = b && t ? `<table><tbody><tr><td>Problems in the harvest pool</td><td class="num">${b.counts.pool}</td></tr><tr><td>Finished under the checker, with the right answer</td><td class="num">${b.counts.complete}</td></tr><tr><td>Not finished (no training example is made)</td><td class="num">${b.counts.incomplete}</td></tr><tr><td>Finished, but longer than ${S.settings.trace.maxLines} lines (verified, not used)</td><td class="num">${b.counts.long}</td></tr><tr><td>Failed verification when built</td><td class="num">${b.counts.unverified}</td></tr><tr><td><b>Training examples</b></td><td class="num"><b>${t.examples}</b></td></tr><tr><td>Verified again by exact arithmetic when judged</td><td class="num">${t.verified} of ${t.examples}</td></tr><tr><td>Lines of working in an example</td><td class="num">${b.lines.mean.toFixed(1)} on average, ${b.lines.most} at most</td></tr><tr><td>Model calls the harvest took</td><td class="num">${v.harvest ? v.harvest.calls : '—'}</td></tr></tbody></table><p class="small">The training file's SHA-256 is <code>${esc(t.fileSha256.slice(0, 16))}…</code>; the trainer recorded ${t.trainerSha256 === t.fileSha256 ? 'the same hash' : t.trainerSha256 ? '<span class="fail">another hash</span>' : 'no hash yet'}. The adapter it made is <code>${v.adapterSha256 ? esc(v.adapterSha256.slice(0, 16)) + '…' : 'not made yet'}</code>.</p>` : NM;
  }
  const d = S.rounds.dev, dv = d && d.verdict;
  $('devBox').innerHTML = dv && dv.cold ? `<p>Run before the seal, on problems made from other seeds, to shape the token limits, the longest working that is trained on, and the speed of the model's hands. Cold, on ${dv.cold.n} held-out problems: the base right on ${dv.cold.base.right} (${pct(dv.cold.base.rate)}), the distilled model on ${dv.cold.distilled.right} (${pct(dv.cold.distilled.rate)}); ${dv.cold.gained.length} gained, ${dv.cold.lost.length} lost; confident wrong answers ${dv.cold.base.wrong} → ${dv.cold.distilled.wrong}; ${dv.train ? dv.train.examples : 0} training examples. The rule would have ${dv.adopted ? 'adopted' : 'dissolved'} it. It is not a claim, and its weights are not used by any sealed round. <a href="data/dev/verdict.json">Its verdict</a>.</p>` : '<p class="small">The development round is not published yet.</p>';
}

// ── the loop: the fill gauge, what happens next, the grant, the spend wall ──
function renderLoop() {
  const ks = sealedList(), last = ks.length ? S.rounds[ks[ks.length - 1]].verdict : null;
  const caps = S.settings ? S.settings.spend : { hoursPerRound: 0, hoursInAll: 0 }, most = S.settings ? S.settings.rounds.max : 0;
  if (!last || !last.gauge) {
    $('gauge').innerHTML = '<p class="pend">No sealed round is published yet, so the gauge is empty.</p>';
    $('loopState').innerHTML = `The loop has not started. The seal allows at most ${most} rounds, ${caps.hoursPerRound} hours of model work for one round and ${caps.hoursInAll} hours for all of them.`;
    $('grantBox').innerHTML = '<p class="small">There is no adopted round, so there is nothing to grant.</p>';
    $('spendTable').innerHTML = `<p class="small">No sealed round has run yet, so nothing has been spent against the wall. The seal caps one round at ${caps.hoursPerRound} hours of model work and all rounds together at ${caps.hoursInAll}.</p>`;
    return;
  }
  const G = last.gauge, W = 800, H = 250, x0 = 70, x1 = 760, y0 = 200, y1 = 30, yOf = (p) => y0 - (y0 - y1) * p, xOf = (i) => x0 + (G.length === 1 ? (x1 - x0) / 2 : (x1 - x0) * (i / (G.length - 1)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => `<path d="M${x0 - 6} ${yOf(p)}H${x1}" stroke="rgba(94,242,228,.14)"/><text class="m" x="8" y="${yOf(p) + 4}">${Math.round(p * 100)}%</text>`).join('');
  const marks = G.map((g, i) => { const x = xOf(i), col = g.adopted ? '#5ef2e4' : '#ff6470'; return `<path d="M${x} ${yOf(g.base)}V${yOf(g.distilled)}" stroke="${col}" stroke-width="3"/><circle cx="${x}" cy="${yOf(g.base)}" r="5" fill="#02070c" stroke="#a3c3cb" stroke-width="2"/><circle cx="${x}" cy="${yOf(g.distilled)}" r="6" fill="${col}"/><text x="${x + 12}" y="${yOf(g.distilled) + 4}">${pct(g.distilled)}</text><text class="m" x="${x + 12}" y="${yOf(g.base) + 4}">${pct(g.base)}</text><text x="${x - 30}" y="${y0 + 22}">round ${g.round}</text><text class="m" x="${x - 60}" y="${y0 + 38}">${g.adopted ? (g.granted ? 'adopted · granted' : 'adopted · not granted') : 'dissolved'}</text>`; }).join('');
  $('gauge').innerHTML = `<svg class="fig" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cold accuracy on each round's held-out block, before and after training. ${G.map((g) => `Round ${g.round}: ${pct(g.base)} before, ${pct(g.distilled)} after, ${g.adopted ? 'adopted' : 'dissolved'}.`).join(' ')}">${ticks}${marks}</svg><p class="small">Each round is measured on its own fresh held-out block: the hollow dot is the model the round started from, the filled dot is the same model after training. A round's lift is the distance between them. ${G.map((g) => `Round ${g.round}: ${(100 * g.lift).toFixed(1)} points (${g.gained} gained, ${g.lost} lost).`).join(' ')}</p>`;
  const n = last.next;
  $('loopState').innerHTML = `<b>Where the loop stands.</b> ${n.act === 'wait' ? `Round ${n.round} was adopted by the rule. <span class="pend">Its weights wait for a person's grant.</span> Round ${n.round + 1} has not run and cannot run on the loop's own say-so.` : n.act === 'run' ? `Round ${n.round - 1} was adopted and granted. Round ${n.round} may run.` : n.act === 'full' ? `<span class="pass">The house is full.</span> Round ${n.round} did not clear its bar and was dissolved: the gains have flattened, and the loop has stopped. The model in use is ${last.gauge.filter((g) => g.adopted && g.granted).length ? `the one adopted and granted in round ${last.gauge.filter((g) => g.adopted && g.granted).pop().round}` : 'the base it began with'}.` : `The loop has stopped at a cap: ${esc(n.why)}.`} The seal allows at most ${most} rounds.`;
  const gr = S.rounds[last.round].grant;
  $('grantBox').innerHTML = gr ? `<div class="box"><h4>The grant on file for round ${last.round}</h4><p>"${esc(gr.words)}"</p><p class="small">${esc(gr.by)} · ${esc(gr.at)} · for the weights <code>${esc(String(gr.adapterSha256).slice(0, 16))}…</code> · <a href="data/grants/round-${last.round}.json">the record</a></p></div>`
    : last.adopted ? `<div class="box"><h4>No grant is on file for round ${last.round}</h4><p>The rule adopted these weights. They become the base of the next round only when a person writes this record, in their own words, and it is committed as <code>data/grants/round-${last.round}.json</code>:</p><pre>${esc(JSON.stringify({ by: 'human', action: 'adopt-weights', round: last.round, adapterSha256: last.adapterSha256, words: '(the person\'s own words)', at: '(the date and time)' }, null, 1))}</pre><p class="small">One command writes it: <code>node scripts/grant.mjs ${last.round} &quot;your words&quot;</code>. A record that names another round or other weights opens nothing, and the loop cannot write one for itself: the test is in <code>src/adopt.mjs</code>.</p></div>`
    : `<p class="small">Round ${last.round} was dissolved by the rule. There is nothing to grant: a grant cannot adopt what the rule dissolved.</p>`;
  const sp = last.spend;
  $('spendTable').innerHTML = `<table><thead><tr><th>Round</th><th>Harvest</th><th>Training</th><th>Cold test, base</th><th>Cold test, distilled</th><th>All</th><th>Cap</th></tr></thead><tbody>${ks.map((k) => { const s = S.rounds[k].verdict.seconds, h = S.rounds[k].verdict.hours; return `<tr><td>${k}</td><td class="num">${hrs(s.harvest)}</td><td class="num">${hrs(s.train)}</td><td class="num">${hrs(s.coldBase)}</td><td class="num">${hrs(s.coldDistilled)}</td><td class="num ${h > sp.perRound ? 'fail' : ''}">${h.toFixed(1)} hours</td><td class="num">${sp.perRound} hours</td></tr>`; }).join('')}<tr><td><b>all rounds</b></td><td></td><td></td><td></td><td></td><td class="num"><b>${sp.total.toFixed(1)} hours</b></td><td class="num">${sp.inAll} hours</td></tr></tbody></table><p class="small">Hours of model work on one laptop processor, from each record's own clock. When either cap is reached the loop stops, whatever the last round found.</p>`;
}

// ── how it works, traced from a real run ──
function renderTrace() {
  const t = S.trace;
  if (!t || !t.harvested) { $('traceBox').innerHTML = NM; return; }
  const h = t.harvested, line = (e) => (e.kind === 'bond' ? `<li>Asked <code>${esc(e.cell)}</code>. The model wrote <code>${esc(e.said)}</code>. Exact arithmetic agrees. <span class="pass">Kept.</span></li>`
    : e.kind === 'split' ? `<li>Asked <code>${esc(e.cell)}</code>. ${typeof e.said === 'string' ? `The model wrote <code>${esc(e.said)}</code>. <span class="fail">That is not true, so it is not kept.</span>` : 'It was asked this before and got it wrong.'} The engine splits the step into smaller ones: <code>${esc(Array.isArray(e.into) ? e.into.join(' ; ') : String(e.into ?? ''))}</code>.</li>`
    : e.kind === 'set' ? `<li><code>${esc(e.cell)}</code> is already known from an earlier step of this problem: <code>${esc(e.value)}</code>.</li>`
    : `<li>Asked <code>${esc(e.cell)}</code>. ${typeof e.said === 'string' ? `The model wrote <code>${esc(e.said)}</code>. ` : ''}<span class="fail">Not true, and there is nothing smaller to split it into: dissolved.</span></li>`);
  const held = t.held ? `<p><b>Then a held-out problem, cold</b> (${esc(t.held.id)}, ${esc(t.held.tier)}): ${esc(t.held.statement)}</p><div class="two"><div class="box"><h4>The base: ${SAID[t.held.base.outcome]}</h4><pre>${esc(t.held.base.text) || '(nothing)'}</pre></div><div class="box"><h4>The distilled model: ${SAID[t.held.distilled.outcome]}</h4><pre>${esc(t.held.distilled.text) || '(nothing)'}</pre></div></div>` : '';
  $('traceBox').innerHTML = `<p class="small">From ${esc(t.from)}.</p><p><b>A harvested problem</b> (${esc(h.id)}, ${esc(h.tier)}): ${esc(h.statement)}</p><ol>${h.events.map(line).join('')}</ol><p><b>The training example built from it</b> (${many(h.lines, 'verified line', 'verified lines')}, from ${many(h.calls, 'model call', 'model calls')}): the model is shown the problem and learns to write this reply in one go.</p><pre>${esc(h.reply)}</pre>${held}`;
}

// ── how it is built ──
function renderBuilt() {
  const g = S.gates;
  $('gateTable').innerHTML = g && g.files ? `<table><thead><tr><th>Kernel</th><th>Changes made to it</th><th>Caught by its tests</th><th>Gate</th></tr></thead><tbody>${Object.entries(g.files).map(([f, x]) => `<tr><td><code>${esc(f)}</code></td><td class="num">${x.total}</td><td class="num">${x.killed}</td><td class="${x.clean ? 'pass' : 'fail'}">${x.clean ? 'CLEAN' : 'NOT CLEAN'}</td></tr>`).join('')}<tr><td><b>all</b></td><td class="num">${g.total}</td><td class="num">${g.killed}</td><td class="${g.clean ? 'pass' : 'fail'}">${g.clean ? 'CLEAN' : 'NOT CLEAN'}</td></tr></tbody></table><p class="small">The mutation gate changes one small thing in a kernel at a time (a <code>&lt;</code> to a <code>&lt;=</code>, an <code>and</code> to an <code>or</code>) and runs its tests. A change the tests do not notice is a hole in the tests. None is exempted. <a href="data/gates.json">The record</a>.</p>` : NM;
  const ks = sealedList(), last = ks.length ? S.rounds[ks[ks.length - 1]].verdict : null;
  bind('g.seal', S.sealSha ? `The seal on this page hashes to <code>${S.sealSha.slice(0, 16)}…</code>${last ? `; the newest sealed round records ${last.sealSha256 === S.sealSha ? 'the same seal' : '<span class="fail">another seal</span>'}` : '; no sealed round is published yet'}.` : 'The seal has not been made yet.');
}

// ── the sentences that carry a measured number: buyers, limits, white paper ──
function renderWords() {
  const r = R(), v = r && r.verdict, c = v && v.cold, dev = S.shown === 'dev', ks = sealedList();
  const what = dev ? 'the development round (not a claim)' : `round ${S.shown}`;
  const p = S.parity, pn = p ? p.cells.n + p.cold.n + p.grown.n : 0, ps = p ? p.cells.same + p.cold.same + p.grown.same : 0;
  bind('l.parity', p ? `${ps} of ${pn} replies came out identical, across single steps, whole cold replies, and problems grown turn by turn. <a href="data/parity.json">The record</a>.` : NM);
  bind('l.rounds', ks.length ? `${many(ks.length, 'sealed round has', 'sealed rounds have')} been run and published here.` : 'No sealed round is published yet: the numbers shown are the development round\'s, which is not a claim.');
  if (!c) { for (const k of ['l.wrong', 'l.compute', 'b.what', 'b.cost', 'b.ops', 'b.versus', 'b.risk', 'b.held', 'b.wrong', 'b.board', 'p.result', 'p.loop']) bind(k, NM); return; }
  const passed = v.verdicts.filter((x) => x.pass === true).length, failed = v.verdicts.filter((x) => x.pass === false);
  const calls = v.harvest ? (v.harvest.calls / Math.max(1, v.harvest.problems)).toFixed(1) : null;
  bind('l.wrong', `In ${what} the distilled model still gave a confident wrong answer on ${c.distilled.wrong} of ${c.n} held-out problems (the base: ${c.base.wrong}).`);
  bind('l.compute', `${dev ? 'The development round' : `Round ${S.shown}`} took ${v.hours.toFixed(1)} hours of model work on one laptop processor; the seal caps a round at ${S.settings.spend.hoursPerRound} hours and all rounds at ${S.settings.spend.hoursInAll}.`);
  bind('b.what', `In ${what}, the same model went from ${pct(c.base.rate)} to ${pct(c.distilled.rate)} right, cold, on ${c.n} problems it had never seen, after being trained on ${v.train.examples} verified examples of its own working.`);
  bind('b.cost', `${dev ? 'The development round' : `Round ${S.shown}`} took ${v.hours.toFixed(1)} hours on one laptop processor: ${hrs(v.seconds.harvest)} to harvest, ${hrs(v.seconds.train)} to train, ${hrs(v.seconds.coldBase + v.seconds.coldDistilled)} to test both models.`);
  bind('b.ops', calls ? `Under the checker, the model needed ${calls} calls on average to finish a problem of the harvest (${v.harvest.calls} calls for ${v.harvest.problems} problems). Cold, an answer is one call: right on ${pct(c.distilled.rate)} of unseen problems after training, against ${pct(c.base.rate)} before.` : NM);
  bind('b.versus', `Here the model, the data and every change stay on a machine you own; the whole training file is published beside the result (${v.train.examples} examples, ${v.train.unverified} unverified); and the change was decided on ${c.n} unseen problems by a rule fixed in advance.`);
  bind('b.risk', v.adopted ? `In ${what} the weights cleared the bar and the rule adopted them.` : `In ${what} the weights did not clear the bar and were dissolved; that result is published above, in red.`);
  bind('b.held', v.held ? `In ${what}, ${v.held.overlap} of ${v.held.n} held-out problems are in the training set, and ${v.held.harvested} were harvested.` : NM);
  bind('b.wrong', `After training, in ${what}, it gave a confident wrong answer on ${c.distilled.wrong} of ${c.n} unseen problems; before, ${c.base.wrong}.`);
  bind('b.board', `In ${what}, ${passed} of the 6 claims passed${failed.length ? `; <span class="fail">${failed.map((x) => `${x.id} (${esc(x.name.toLowerCase())})`).join(', ')} failed</span>` : ''}.`);
  bind('p.result', `${dev ? 'No sealed round is published yet. In the development round, which is not a claim' : `In round ${S.shown}, under the seal`}: ${v.harvest ? `${v.harvest.complete} of ${v.harvest.problems} harvested problems were finished under the checker; ` : ''}${v.train.examples} verified examples trained the model; cold, on ${c.n} held-out problems, it was right on ${c.distilled.right} where the base was right on ${c.base.right} (${(100 * c.lift).toFixed(1)} points; exact McNemar p = ${prob(c.p)}); ${c.gained.length} problems gained and ${c.lost.length} lost; confident wrong answers went from ${c.base.wrong} to ${c.distilled.wrong}. ${passed} of the 6 claims passed${failed.length ? `, and ${failed.map((x) => x.id).join(', ')} failed` : ''}. The rule: ${v.adopted ? 'adopt' : 'dissolve'}.`);
  const last = ks.length ? S.rounds[ks[ks.length - 1]].verdict : null;
  bind('p.loop', last && last.next ? `So far: ${many(ks.length, 'sealed round', 'sealed rounds')}. ${last.next.act === 'wait' ? 'The newest was adopted by the rule and waits for a person\'s grant.' : last.next.act === 'full' ? 'The newest did not clear its bar: the house is full, and the loop has stopped.' : last.next.act === 'run' ? 'The newest was adopted and granted; the next round may run.' : `The loop stopped at a cap: ${esc(last.next.why)}.`}` : 'The loop has not started: no sealed round is published yet.');
}
function renderWalk() {
  const w = S.walk;
  $('walk').innerHTML = w ? `<h3>A simulated buyer walk</h3><p class="small">${esc(w.note)}</p>${w.personas.map((p) => `<details><summary>${esc(p.who)}: ${esc(p.verdict)}</summary><ul>${p.gaps.map((g) => `<li>${esc(g.gap)} → ${esc(g.fix)}</li>`).join('')}</ul></details>`).join('')}` : '<p class="small">The simulated buyer walk has not been run yet.</p>';
}
function render() { renderHero(); renderNumbers(); renderLoop(); renderTrace(); renderBuilt(); renderWords(); renderWalk(); }

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
    const v = JUDGE.judge({ which: k === 0 ? 'dev' : k, settings: S.settings, set, seal: S.sealSha, history, grants, harvest, log, coldBase: r.cb, coldDistilled: r.cd, train });
    const { files, at, ...was } = r.verdict;
    const identical = JSON.stringify(was) === JSON.stringify(v), grown = same === harvest.records.length;
    out.innerHTML = `${identical && grown ? '<span class="pass">Judged again in this tab: the same verdict.</span>' : '<span class="fail">Judged again in this tab: NOT the published verdict.</span>'} ${same} of ${harvest.records.length} harvested problems grew again identically from the recorded replies; ${v.train ? `${v.train.verified} of ${v.train.examples} training examples verified again by exact arithmetic` : 'the training file was not taken'}; ${v.cold ? `${2 * v.cold.n} cold replies read again` : 'the cold tests were not taken'}; ${v.verdicts.map((x) => `${x.id} ${x.pass === true ? 'pass' : x.pass === false ? 'FAIL' : 'pending'}`).join(', ')}.`;
  } finally { $('rejudge').disabled = false; }
}
function tryTrace() {
  const h = S.trace && S.trace.harvested;
  if (!h || !h.task) { $('tryOut').innerHTML = 'No round is published yet, so there is no example to check.'; return; }
  const v = TRACE.verified({ id: h.task.id, messages: LOOP.opening(h.task.statement, []), reply: $('tryReply').value.replace(/\r\n/g, '\n').replace(/\n+$/, '') }, h.task);
  $('tryOut').innerHTML = v.ok ? `<span class="pass">Verified.</span> ${many(v.lines, 'line', 'lines')} of working, each one a single step and exactly true, and the answer is the problem's own. This example may be trained on.` : `<span class="fail">Refused: ${esc(v.why)}.</span> This example would not be trained on.`;
}
function tryRule() {
  const num = (id) => { const x = Number($(id).value); return Number.isInteger(x) && x >= 0 ? x : null; };
  const n = num('rN'), g = num('rG'), l = num('rL'), wb = num('rWB'), wd = num('rWD');
  if ([n, g, l, wb, wd].includes(null) || n < 1 || g + l > n || wb > n - l || wd > n - g) { $('ruleOut').innerHTML = '<span class="fail">Those numbers cannot all be true of one block of problems.</span> Each must be a whole number; gained and lost together cannot exceed the block; and a problem answered wrongly was not answered rightly.'; return; }
  const tally = (right, wrong) => ({ n, right, wrong, none: n - right - wrong, rate: right / n, silent: wrong / n });
  const cold = { n, base: tally(l, wb), distilled: tally(g, wd), lift: (g - l) / n, gained: Array.from({ length: g }, (_, i) => i), lost: Array.from({ length: l }, (_, i) => i), p: STATS.mcnemar(g, l) };
  const v = CLAIMS.verdicts({ cold }, S.settings), rule = ADOPT.decide(v[0].pass, v[1].pass);
  $('ruleOut').innerHTML = `Lift ${(100 * cold.lift).toFixed(1)} points, p = ${prob(cold.p)}: K1 ${v[0].pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'}. Confident wrong ${wb} → ${wd}: K2 ${v[1].pass ? '<span class="pass">pass</span>' : '<span class="fail">fail</span>'}. The rule: <b class="${rule.adopt ? 'pass' : 'fail'}">${rule.adopt ? 'ADOPT' : 'DISSOLVE'}</b> (${esc(rule.why)}).${rule.adopt ? ' Adopted weights would then wait for a person\'s grant.' : ''}`;
}

async function load() {
  const [settings, published, gates, parity, trace, walk, sealText] = await Promise.all([getJSON('data/settings.json'), getJSON('data/published.json'), getJSON('data/gates.json'), getJSON('data/parity.json'), getJSON('data/trace.json'), getJSON('data/walk.json'), getText('SEAL.json')]);
  Object.assign(S, { settings, published, gates, parity, trace, walk, sealSha: sealText === null ? null : SHA.sha256(sealText) });
  const list = [...(published && published.dev ? ['dev'] : []), ...((published && published.rounds) || []).map(String)];
  for (const w of list) {
    const dir = w === 'dev' ? 'data/dev' : `data/rounds/${w}`;
    const [verdict, held, cb, cd, build] = await Promise.all([getJSON(`${dir}/verdict.json`), getJSON(`${dir}/held.json`), getJSON(`${dir}/cold-base.json`), getJSON(`${dir}/cold-distilled.json`), getJSON(`${dir}/build.json`)]);
    const grant = w !== 'dev' && published.grants.includes(Number(w)) ? await getJSON(`data/grants/round-${w}.json`) : null;
    S.rounds[w] = { which: w, dir, verdict, held, cb, cd, build, grant, rows: paired(held, cb, cd) };
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
  $('wall').addEventListener('click', (e) => { const id = e.target && e.target.getAttribute && e.target.getAttribute('data-id'); if (id) openProblem(id); });
  $('moved').addEventListener('click', (e) => { const id = e.target && e.target.getAttribute && e.target.getAttribute('data-open'); if (id) { openProblem(id); if ($('probe').scrollIntoView) $('probe').scrollIntoView({ block: 'center' }); } });
  $('rejudge').addEventListener('click', rejudge);
  $('tryTrace').addEventListener('click', tryTrace);
  $('tryReset').addEventListener('click', () => { if (h) $('tryReply').value = h.reply; $('tryOut').innerHTML = 'Press the button.'; });
  $('tryRule').addEventListener('click', tryRule);
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && typeof location !== 'undefined' && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
window.__distillation = { ready, S, render, rejudge, tryTrace, tryRule, openProblem, paired };
