// Measure page UI (plain JS, HTML strings): one MeasureDoc per job, saved and synced through the tracker's PouchDB.
// Geometry lives in src/tracker/measure.ts; this file only draws and edits. Types: ./ui.d.ts.
import { parseLen, fmt, computeFlight, settings as toSettings, DEFAULT_SETTINGS } from '../tracker/measure';

let store, docs = [], jobs = [], tab = 'guide', pending = false;
let saving = 0, stale = false, queue = Promise.resolve(); // saves waiting; a reload arrived during one
let curId = localStorage.getItem('measure-cur') || '';
const P = () => docs.find(d => d._id === curId);
const settings = p => toSettings(p.settings);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const blankStep = () => ({ rise: '', run: '', post: null, note: '' });
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const setCur = id => { curId = id; localStorage.setItem('measure-cur', id); };

/** Applies `fn` to the doc on screen now, then again to the freshest saved copy, so a sync that landed meanwhile is kept. */
function edit(fn, full = true) {
  const p = P(); if (!p) return;
  fn(p);
  full ? render() : (renderResults(), renderProjList());
  track(() => store.save(p._id, cur => { if (!cur) return undefined; const next = structuredClone(cur); fn(next); return next; }));
}
/**
 * Saves run one at a time: parallel saves of one doc keep hitting 409 and re-reading, so a fast run of edits was
 * still unsaved seconds later. While saves wait, a reload can hold an older copy than the screen, so it reads again after the last one.
 */
function track(job) {
  saving++;
  queue = queue.then(job).catch(err => alert('Not saved: ' + err.message))
    .finally(() => { if (--saving === 0 && stale) { stale = false; store.refresh(); } });
}
function create(fields) {
  const doc = { name: 'New handrail job', site: '', date: today(), jobId: '', width: '', inset: '', notes: '', flights: [],
                ...fields, settings: { ...DEFAULT_SETTINGS, ...fields.settings },
                _id: `measure:${crypto.randomUUID()}`, type: 'measure', createdAt: new Date().toISOString() };
  delete doc._rev; delete doc.updatedAt; delete doc._conflicts;
  docs.push(doc); setCur(doc._id); render();
  track(() => store.save(doc._id, () => doc));
}
function newProject() { const name = prompt('Job name', 'New handrail job'); if (name) create({ name }); }
function dupProject() { const c = structuredClone(P()); c.name += ' (copy)'; create(c); }
function delProject() {
  const p = P(); if (!p || !confirm(`Delete "${p.name}" on every device?`)) return;
  docs = docs.filter(d => d !== p); setCur(docs[0]?._id || ''); render(); track(() => store.remove(p._id));
}
function exportJSON() {
  const p = P(), a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' }));
  a.download = p.name.replace(/[^\w-]+/g, '_') + '.json'; a.click();
}
function importJSON(file) {
  file.text().then(t => {
    const p = JSON.parse(t);
    if (!Array.isArray(p.flights)) throw new Error('That file is not a measure job.');
    create(p);
  });
}
function set(path, v) {   // path like "flights.2.steps.3.rise"
  const ks = path.split('.'), last = ks.pop();
  edit(p => { let o = p; for (const k of ks) o = o[k]; o[last] = v; }, false);
}
function addFlight() {
  const n = +prompt('How many riser timbers (steps) in this flight?', '5'); if (!(n > 1)) return;
  edit(p => p.flights.push({ name: `Flight ${p.flights.length + 1}`, steps: [...Array(n)].map(blankStep), totRise: '', totRun: '', notes: '' }));
}
function stepCount(fi, d) { edit(p => { const s = p.flights[fi].steps; d > 0 ? s.push(blankStep()) : s.length > 2 && s.pop(); }); }
function delFlight(fi) { if (confirm('Delete ' + P().flights[fi].name + '?')) edit(p => p.flights.splice(fi, 1)); }
function togglePost(fi, si, on) {
  const f = P().flights[fi], r = computeFlight(f, settings(P()));
  // freeze the auto layout first, so ticking one box keeps the others
  const frozen = !f.steps.some(s => s.post === true) && !r.missing ? r.posts.map(q => q.riser - 1) : [];
  edit(p => { const st = p.flights[fi].steps; frozen.forEach(i => st[i].post = true); st[si].post = on; });
}
function autoPosts(fi) { edit(p => p.flights[fi].steps.forEach(s => s.post = null)); }

const inp = (path, val, cls = '') => `<input class="${cls}${isNaN(parseLen(val)) && !/name|site|date|note/.test(path) ? ' badin' : ''}" value="${esc(val)}"
  onchange="this.classList.toggle('badin', isNaN(parseLen(this.value)) && !/name|site|date|note/.test('${path}')); set('${path}', this.value)">`;

function guide() {
  return `<section><h2>Before you go</h2><ol>
<li>Tape (with 1/16" marks), 4 ft level, torpedo level or speed square, digital angle finder if you have one, awl, chalk or paint pen, phone for photos.</li>
<li>Set the job up on tab 2: add one flight for every straight run of steps between landings, with the right number of riser timbers.</li>
<li>Check the settings on tab 2 match the rail and post you plan to build (rail height, rail size, plate, bracket).</li></ol></section>
<section><h2>At each flight</h2>
<svg viewBox="0 0 420 210" font-size="11">
<path d="M10 190 H110 V160 H170 V130 H230 V100 H290 V70 H410" fill="none" stroke="#7a5a3a" stroke-width="3"/>
<line x1="92" y1="127" x2="232" y2="127" stroke="#1a6" stroke-width="4"/><text x="180" y="120" fill="#1a6">4 ft level on upper timber</text>
<line x1="110" y1="129" x2="110" y2="160" stroke="#c00" stroke-width="2" stroke-dasharray="4 2"/><text x="78" y="150" fill="#c00">RISE</text>
<line x1="110" y1="137" x2="170" y2="137" stroke="#00c" stroke-width="2"/><text x="125" y="150" fill="#00c">RUN</text>
<circle cx="110" cy="160" r="4" fill="#c00"/><circle cx="170" cy="130" r="4" fill="#00c"/>
<text x="176" y="146">upper nosing</text><text x="60" y="178">lower nosing</text>
<line x1="20" y1="70" x2="400" y2="70" stroke="#999" stroke-dasharray="2 3"/>
<text x="12" y="18">Nosing = the top front edge of each 6x6 riser</text><text x="12" y="32">timber, on the side the rail goes.</text>
<text x="12" y="50">Measure on the rail side, ${esc(P().settings.back)} back from the front edge.</text></svg>
<ol>
<li><b>Mark the post line.</b> Decide which side gets the rail. Measure in from the end of the timbers to where the post centres go and write it in "Post line in from timber end". Keep the 5" plate fully on the timber.</li>
<li><b>Riser 1 (bottom timber):</b> RISE = from the landing or ground up to the top of timber 1 at its nosing. No run.</li>
<li><b>Every next timber:</b> lay the 4 ft level on top of the upper timber, bubble centred, sticking out over the lower one.
  RISE = plumb from the underside of the level down to the lower nosing. RUN = along the level from the upper nosing back out to the point straight above the lower nosing (hold the tape plumb with the torpedo level or square). Enter both on that timber's row.</li>
<li><b>Check the flight in one shot:</b> from the bottom nosing to the top nosing, measure total rise (level or laser) and total run. Enter them under "Check". The app flags any gap over 1/4" between the check and the sum of the steps, so a bad reading shows up while you're still there.</li>
<li><b>At every timber that gets a post</b> (tab 2 shows which): put the torpedo level on top where the plate sits, front to back and side to side. More than about 1/8" over the plate width means a shim or a ground plate. Push an awl in where the 4 lags go; soft or split wood means move the post or replace the timber. Note it on that row.</li>
<li><b>Loose timbers:</b> push on each one with your foot. Note any that rock so they get pinned with rebar before the posts go on.</li>
<li><b>Ends of the rail:</b> look at the top and bottom of each flight for anything the rail end would hit (deck rim, wall, tree, door swing, a mower path).</li>
<li><b>Photos:</b> one of each flight from the side, one close-up of every post spot with the tape in view.</li>
</ol></section>
<section><h2>Back at the shop</h2><ol>
<li>Tab 3 has the cut list: post tube lengths, rail lengths and angles, and the hardware count.</li>
<li>Posts are cut ${esc(P().settings.trim || '0')} long (the trim setting) so each can be trimmed to the string line on site. Set trim to 0 to cut exact.</li>
<li>Jobs save on this phone and sync to KAMO Services like hours, so the laptop in the shop has them too. Copy a job to start the next similar one.</li></ol></section>`;
}

function data() {
  const p = P(), s = p.settings;
  const jobOpts = jobs.filter(j => j.status === 'open' || j._id === p.jobId)
    .map(j => `<option value="${esc(j._id)}" ${j._id === p.jobId ? 'selected' : ''}>${esc(j.customer ? `${j.customer}: ${j.name}` : j.name)}</option>`).join('');
  let h = `<section><h2>Job</h2>
<label>Name ${inp('name', p.name, 'wide')}</label><label>Site ${inp('site', p.site, 'wide')}</label><label>Date ${inp('date', p.date)}</label><br>
<label>KAMO Services job <select onchange="set('jobId', this.value)"><option value="">Not linked</option>${jobOpts}</select></label><br>
<label>Stair width ${inp('width', p.width)}</label><label>Post line in from timber end ${inp('inset', p.inset)}</label><br>
<label>Notes ${inp('notes', p.notes, 'wide')}</label></section>
<section><h2>Design settings</h2><span class="muted">Inches. Fractions like 2-3/4 or 2 3/4 are fine.</span><br>
<label>Rail height above nosing (to top of rail) ${inp('settings.H', s.H)}</label>
<label>Allowed ${inp('settings.lo', s.lo)} to ${inp('settings.hi', s.hi)}</label><br>
<label>Longest post span ${inp('settings.span', s.span)}</label>
<label>Post centre behind nosing ${inp('settings.back', s.back)}</label>
<label>Rail past top post ${inp('settings.tail', s.tail)}</label><br>
<label>Rail height (tube size, vertical) ${inp('settings.railH', s.railH)}</label>
<label>Base plate thickness ${inp('settings.plate', s.plate)}</label>
<label>Post trim allowance ${inp('settings.trim', s.trim)}</label><br>
<label><input type="checkbox" ${s.bracket ? 'checked' : ''} onchange="set('settings.bracket', this.checked)"> Rail sits on a post-top bracket</label>
<label>Bracket height, post top to rail underside ${inp('settings.stack', s.stack)}</label>
<span class="muted">Measure it on the real bracket at the stair angle.</span></section>
<div class="noprint"><button onclick="addFlight()">+ Add flight</button></div>`;
  p.flights.forEach((f, fi) => {
    h += `<section><h2>${inp(`flights.${fi}.name`, f.name, 'wide')}</h2>
<div style="overflow-x:auto"><table><tr><th>Timber</th><th>Rise</th><th>Run</th><th>Post</th><th>Notes (level, rot, loose)</th></tr>
${f.steps.map((st, si) => `<tr><td>${si + 1}${si === 0 ? ' (bottom)' : si === f.steps.length - 1 ? ' (top)' : ''}</td>
<td>${inp(`flights.${fi}.steps.${si}.rise`, st.rise)}</td>
<td>${si ? inp(`flights.${fi}.steps.${si}.run`, st.run) : '<span class="muted">none</span>'}</td>
<td><input type="checkbox" id="pc-${fi}-${si}" onchange="togglePost(${fi},${si},this.checked)"></td>
<td>${inp(`flights.${fi}.steps.${si}.note`, st.note)}</td></tr>`).join('')}</table></div>
<label>Check: total rise bottom to top nosing ${inp(`flights.${fi}.totRise`, f.totRise)}</label>
<label>total run ${inp(`flights.${fi}.totRun`, f.totRun)}</label><br>
<label>Notes ${inp(`flights.${fi}.notes`, f.notes, 'wide')}</label>
<div id="res-${fi}"></div>
<div class="noprint"><button onclick="stepCount(${fi},1)">+ timber</button> <button onclick="stepCount(${fi},-1)">- timber</button>
<button onclick="autoPosts(${fi})">Auto posts</button> <button class="del" onclick="delFlight(${fi})">Delete flight</button></div></section>`;
  });
  return h;
}

function check(f, r) {
  const S = settings(P()), out = [];
  const tr = parseLen(f.totRise), tn = parseLen(f.totRun);
  if (tr != null) out.push(Math.abs(tr - r.sumRise) > 0.25 ? `<span class="bad">Check rise ${fmt(tr)} vs steps ${fmt(r.sumRise)}: re-measure</span>` : `<span class="ok">Rise check OK</span>`);
  if (tn != null) out.push(Math.abs(tn - r.sumRun) > 0.25 ? `<span class="bad">Check run ${fmt(tn)} vs steps ${fmt(r.sumRun)}: re-measure</span>` : `<span class="ok">Run check OK</span>`);
  const badH = r.heights.map((v, i) => [i + 1, v]).filter(([, v]) => v < S.lo - 1e-6 || v > S.hi + 1e-6);
  out.push(badH.length ? `<span class="bad">Rail out of ${fmt(S.lo)}-${fmt(S.hi)} at timber ${badH.map(([i, v]) => `${i} (${fmt(v)})`).join(', ')}</span>` : `<span class="ok">Rail height OK at every nosing</span>`);
  const longS = r.spans.filter(v => v > S.span + 1e-6);
  if (longS.length) out.push(`<span class="bad">Span over ${fmt(S.span)}: ${longS.map(fmt).join(', ')}</span>`);
  if (r.posts.length < 2) out.push('<span class="bad">A rail needs at least 2 posts</span>');
  return out.join(' · ');
}

function elevation(r, S) {
  const xs = r.noses.map(n => n[0]), W = Math.max(...xs) + S.back + S.tail + 10, Hh = r.sumRise + S.H + 10;
  const sc = 400 / Math.max(W, Hh * 2), X = x => 10 + x * sc, Y = y => 10 + (Hh - y) * sc;
  let g = r.noses.map(([x, y], i) => i ? `L${X(x)} ${Y(r.noses[i - 1][1])} L${X(x)} ${Y(y)}` : `M${X(x) - 20} ${Y(y - 5.5)} L${X(x)} ${Y(y - 5.5)} L${X(x)} ${Y(y)}`).join(' ');
  g += ` L${X(Math.max(...xs) + 30)} ${Y(r.noses.at(-1)[1])}`;
  const [x0, y0] = r.noses[0];
  return `<svg viewBox="0 0 420 ${Y(-6) + 10}"><path d="${g}" fill="none" stroke="#a1887f" stroke-width="2"/>
<line x1="${X(x0)}" y1="${Y(y0 + S.H)}" x2="${X(r.railEnd[0])}" y2="${Y(r.railEnd[1])}" stroke="#00e5a0" stroke-width="3"/>
${r.posts.map(p => `<line x1="${X(p.px)}" y1="${Y(r.noses[p.riser - 1][1])}" x2="${X(p.px)}" y2="${Y(r.noses[p.riser - 1][1] + p.top)}" stroke="#b0bec5" stroke-width="2"/>
<text x="${X(p.px) + 2}" y="${Y(r.noses[p.riser - 1][1]) + 11}" font-size="9">${p.riser}</text>`).join('')}</svg>`;
}

function cut() {
  const p = P(), S = settings(p); let h = `<section><h2>${esc(p.name)}: shop cut list</h2><p class="muted">${esc(p.site)} · measured ${esc(p.date)} · rail ${fmt(S.H)} to top above nosings · post tube = timber top to rail underside, minus ${fmt(S.plate)} plate${S.bracket ? `, minus ${fmt(S.stack)} bracket` : ''}, plus ${fmt(S.trim)} trim</p>`;
  let nPosts = 0, railTot = 0, postTot = 0, bad = [];
  p.flights.forEach(f => {
    const r = computeFlight(f, S);
    if (r.missing) { bad.push(f.name); return; }
    nPosts += r.posts.length; railTot += r.rail;
    h += `<h3>${esc(f.name)}: ${r.deg.toFixed(1)}°, rail cut ${fmt(r.rail)} (before end plates)</h3>
<div style="overflow-x:auto"><table><tr><th>Post</th><th>Timber</th><th>Along rail from bottom end</th><th>Span to next</th><th>Timber top to rail top</th><th>Cut tube</th><th>Top cut</th></tr>
${r.posts.map((q, i) => { const c = q.tube + S.trim; postTot += c;
  return `<tr><td>P${i + 1}</td><td>${q.riser}</td><td>${fmt(q.along)}</td><td>${r.spans[i] != null ? fmt(r.spans[i]) : ''}</td><td>${fmt(q.top)}</td><td><b>${fmt(c)}</b></td><td>${S.bracket ? 'square' : r.deg.toFixed(1) + '°'}</td></tr>`; }).join('')}</table></div>`;
  });
  if (S.bracket && !(S.stack > 0)) h = h.replace('</h2>', '</h2><p class="bad">Bracket height is not set: post lengths below are too long by the bracket height.</p>');
  if (bad.length) h += `<p class="bad">Not measured yet: ${bad.map(esc).join(', ')}</p>`;
  h += `<h3>Totals</h3><table>
<tr><td>Posts</td><td>${nPosts}</td></tr><tr><td>Post tube, total of cut lengths</td><td>${fmt(postTot)} (${(postTot / 12).toFixed(1)} ft)</td></tr>
<tr><td>Rail tube, total of cut lengths</td><td>${fmt(railTot)} (${(railTot / 12).toFixed(1)} ft)</td></tr>
<tr><td>Base plates</td><td>${nPosts}</td></tr><tr><td>Gussets (4 per post)</td><td>${4 * nPosts}</td></tr>
<tr><td>Lag screws + flat washers (4 per plate + 4 spare)</td><td>${4 * nPosts + 4} each</td></tr>
${S.bracket ? `<tr><td>Post-top brackets</td><td>${nPosts}</td></tr>` : ''}
<tr><td>Rail end caps / end plates</td><td>${2 * p.flights.length}</td></tr></table></section>`;
  return h;
}

function renderResults() {
  if (tab !== 'data' || !P()) return;
  const S = settings(P());
  P().flights.forEach((f, fi) => {
    const r = computeFlight(f, S), el = document.getElementById('res-' + fi);
    if (!el) return;
    f.steps.forEach((st, si) => {
      const c = document.getElementById(`pc-${fi}-${si}`);
      if (c) c.checked = r.missing ? st.post === true : r.posts.some(q => q.riser === si + 1);
    });
    el.innerHTML = r.missing ? '<p class="muted">Fill in every rise and run to see the rail and posts.</p>' :
      `<p>Slope ${r.deg.toFixed(1)}°, rail ${fmt(r.rail)} long, ${r.posts.length} posts (${r.manual ? 'set by hand' : 'auto'}), timbers ${r.posts.map(q => q.riser).join(', ')}<br>${check(f, r)}</p>${elevation(r, S)}`;
  });
}

function renderProjList() {
  document.getElementById('proj').innerHTML = docs.map(q => `<option value="${esc(q._id)}" ${q._id === curId ? 'selected' : ''}>${esc(q.name)}</option>`).join('');
}

function render() {
  pending = false;
  if (!P() && docs.length) setCur(docs[0]._id);
  renderProjList();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  document.querySelectorAll('.needjob').forEach(b => b.disabled = !P());
  document.getElementById('app').innerHTML = P() ? { guide, data, cut }[tab]()
    : '<section><h2>No measure jobs yet</h2><p>Tap New to start one, or Import a job file.</p></section>';
  renderResults();
}

/** Called by main.ts on load and whenever the database changes (this device or a sync). */
export function update(nextDocs, nextJobs) {
  if (saving) { stale = true; return; }
  docs = nextDocs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  jobs = nextJobs;
  // Redrawing would throw away what is being typed; draw once the field is left.
  if (document.activeElement?.matches('input, select')) pending = true; else render();
}

export function start(s) {
  store = s;
  Object.assign(window, { parseLen, newProject, dupProject, delProject, exportJSON, importJSON, set, addFlight, stepCount, delFlight, togglePost, autoPosts });
  document.getElementById('proj').onchange = e => { setCur(e.target.value); render(); };
  document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); });
  document.addEventListener('focusout', () => setTimeout(() => {
    if (pending && !document.activeElement?.matches('input, select')) render();
  }));
  s.onSyncStatus(t => { document.getElementById('sync').textContent = t; });
  importOldJobs();
}

/** The page before sync kept its jobs in this phone's localStorage; move them into the database once. */
function importOldJobs() {
  const KEY = 'handrail-measure-v1', raw = localStorage.getItem(KEY);
  if (!raw) return;
  for (const p of JSON.parse(raw).projects ?? []) {
    if (p.name === 'Example job' && !p.flights?.length) continue;
    create(p);
  }
  localStorage.setItem(`${KEY}-imported`, raw);
  localStorage.removeItem(KEY);
}
