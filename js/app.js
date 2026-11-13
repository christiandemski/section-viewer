'use strict';

// ---------- Sportart ----------
// Rad und Lauf unterscheiden sich in Abschnitten, Texten, Werten (Tempo/Pace) und im Aussehen (CSS über <html data-sport>)
const SPORT = {
  ride: {intervals: [5, 10, 20, 25, 50, 100], interval: '10', store: 'sectionviewer.interval',
    sub: 'Kilometer und Höhenmeter bis zu einem bestimmten Punkt der Tour betrachten', custom: 'z. B.  12,5  123  157  1:30:00  @14:35'},
  run: {intervals: [1, 2, 5, 10], interval: '1', store: 'sectionviewer.interval.run',
    sub: 'Kilometer, Pace und Höhenmeter bis zu einem bestimmten Punkt des Laufs betrachten', custom: 'z. B.  5  10  21,1  1:30:00  @9:45'},
  hike: {intervals: [1, 2, 5, 10, 20], interval: '2', store: 'sectionviewer.interval.hike',
    sub: 'Kilometer, Höhenmeter und Gehzeit bis zu einem bestimmten Punkt der Wanderung betrachten', custom: 'z. B.  4,5  12  2:30:00  @13:15'},
};
function setSport(sport) {
  const S = SPORT[sport];
  if (!S) return;
  const changed = sport !== state.sport;
  state.sport = sport;
  document.documentElement.dataset.sport = sport;
  for (const b of document.querySelectorAll('#sport button, #sportPick button')) b.setAttribute('aria-pressed', b.dataset.sport === sport);
  $('sub').textContent = S.sub;
  $('custom').placeholder = S.custom;
  let v = S.interval;
  try { v = localStorage.getItem(S.store) ?? v; localStorage.setItem('sectionviewer.sport', sport); } catch {}
  const sel = $('interval');
  sel.innerHTML = '<option value="0">keine</option>' + S.intervals.map(k => `<option value="${k}">alle ${k} km</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === v) ? v : S.interval;
  $('raceWrap').hidden = sport !== 'run';
  // Die Bewegungszeit hängt von der Sportart ab (Pausenschwelle beim Wandern)
  if (changed && state.stages.length) combine();
  ovSportChanged(changed);
  pcSportChanged(changed);
  dcSportChanged(changed);
}
for (const box of [$('sport'), $('sportPick')]) box.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b || b.dataset.sport === state.sport) return;
  setSport(b.dataset.sport);
  if ($('status').dataset.sportNote) notify('');
  update();
});

// ---------- Reiter ----------
const TABS = [...document.querySelectorAll('#tabs [role=tab]')];
function showTab(name, focus) {
  if (!TABS.some(b => b.dataset.tab === name)) name = TABS[0].dataset.tab;
  for (const b of TABS) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', on);
    b.tabIndex = on ? 0 : -1;
    $('panel-' + b.dataset.tab).hidden = !on;
    if (on && focus) b.focus();
  }
  try { localStorage.setItem('sectionviewer.tab', name); } catch {}
  // Diagramm und Vorschauen kennen ihre Breite erst, wenn sie sichtbar sind
  if (state.track) { if (name === 'sections') renderChart(); if (name === 'story') pcRefresh(); if (name === 'daycard') dcRefresh(); }
}
$('tabs').addEventListener('click', ev => { const b = ev.target.closest('[role=tab]'); if (b) showTab(b.dataset.tab); });
$('tabs').addEventListener('keydown', ev => {
  const k = TABS.indexOf(document.activeElement), d = {ArrowRight: 1, ArrowLeft: -1}[ev.key];
  if (k < 0 || !d) return;
  ev.preventDefault();
  showTab(TABS[(k + d + TABS.length) % TABS.length].dataset.tab, true);
});
{ let t = null; try { t = localStorage.getItem('sectionviewer.tab'); } catch {} showTab(t); }

// Infoknöpfe „?“ blenden die zugehörige Erklärung ein und aus
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-help]');
  if (!b) return;
  ev.preventDefault();
  const el = $(b.dataset.help);
  el.hidden = !el.hidden;
  b.setAttribute('aria-expanded', !el.hidden);
});

// ---------- Meldungen ----------
// kind: 'error' (wird sofort angesagt), 'info' oder '' (ausblenden); actions: zusätzliche Knöpfe
function notify(kind, html, actions = '') {
  const el = $('status');
  delete el.dataset.sportNote;
  el.className = 'status' + (kind ? ' ' + kind : '');
  if (!kind) { el.innerHTML = ''; return; }
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="msg">${html}</span>${actions}<button class="close" data-close aria-label="Meldung schließen" title="Schließen">×</button>`;
}
$('status').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.sportBack) { setSport(b.dataset.sportBack); update(); notify(''); }
  else if ('undo' in b.dataset) undo();
  else if ('close' in b.dataset) notify('');
});

// Entfernen lässt sich kurz rückgängig machen
const UNDO_FIELDS = ['custom', 'ovStart', 'pcTitle', ...DC_TEXTS];
let undoState = null, undoTimer = 0;
function withUndo(text) {
  undoState = {stages: [...state.stages], manualOrder: state.manualOrder, fields: Object.fromEntries(UNDO_FIELDS.map(id => [id, $(id).value]))};
  clearTimeout(undoTimer);
  // nach 10 s verschwindet das Angebot
  undoTimer = setTimeout(() => { if (undoState && $('status').querySelector('[data-undo]')) notify(''); undoState = null; }, 10000);
  return () => notify('info', text, '<button data-undo>Rückgängig</button>');
}
function undo() {
  if (!undoState) return;
  state.stages = undoState.stages;
  state.manualOrder = undoState.manualOrder;
  for (const [id, v] of Object.entries(undoState.fields)) $(id).value = v;
  undoState = null;
  combine();
  update();
  notify('');
}

try { $('race').checked = localStorage.getItem('sectionviewer.race') !== '0'; } catch {}
$('race').addEventListener('change', () => {
  try { localStorage.setItem('sectionviewer.race', $('race').checked ? '1' : '0'); } catch {}
  update();
});
$('interval').addEventListener('change', () => {
  try { localStorage.setItem(SPORT[state.sport].store, $('interval').value); } catch {}
  update();
});
$('custom').addEventListener('input', update);
$('thr').addEventListener('input', () => {
  const v = parseFloat($('thr').value);
  if (!Number.isFinite(v) || v < 0) return;
  state.thr = v; state.auto = false;
  update();
});
$('auto').addEventListener('change', () => { state.auto = $('auto').checked; update(); });
window.addEventListener('resize', () => { if (state.track) renderChart(); });

$('stages').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  const S = state.stages;
  if (b.dataset.up) {
    const k = +b.dataset.up;
    [S[k - 1], S[k]] = [S[k], S[k - 1]];
    state.manualOrder = true;
    combine();
    update();
    return;
  }
  const show = withUndo(`„${esc(S[+b.dataset.del].name)}“ entfernt.`);
  S.splice(+b.dataset.del, 1);
  combine();
  update();
  show();
});
$('reset').addEventListener('click', () => {
  const show = withUndo('Tour entfernt.');
  state.stages = [];
  state.manualOrder = false;
  $('custom').value = '';
  $('ovStart').value = '';
  for (const id of ['pcTitle', ...DC_TEXTS]) $(id).value = '';
  combine();
  update();
  show();
});

// Etappen nach Startzeit ordnen; ohne brauchbare Zeiten (z. B. geplante Touren) nach Dateiname
function sortStages() {
  const S = state.stages;
  const byName = (a, b) => a.name.localeCompare(b.name, 'de', {numeric: true});
  if (!S.every(s => s.track.t)) { S.sort(byName); return; }
  S.sort((a, b) => a.track.t[0] - b.track.t[0]);
  for (let k = 1; k < S.length; k++) {
    const prev = S[k - 1].track;
    if (S[k].track.t[0] < prev.t[prev.n - 1]) { S.sort(byName); return; }
  }
}

// Wertet eine FIT- oder GPX-Datei aus und hängt sie als Etappe an; die Rohdaten
// bleiben für „Session speichern“ erhalten
function addStage(name, buf) {
  const key = name + '|' + buf.byteLength;
  if (state.stages.some(s => s.key === key)) return;
  const head = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
  const isFit = head.length >= 12 && String.fromCharCode(...head.subarray(8, 12)) === '.FIT';
  // Verständliche Meldung statt „GPX-Datei konnte nicht gelesen werden“ bei Fotos o. Ä.
  const ext = (/\.([^.]+)$/.exec(name) || [])[1]?.toLowerCase();
  if (!isFit && ext === 'fit') throw new Error('Keine gültige FIT-Datei – womöglich unvollständig übertragen.');
  if (!isFit && ext !== 'gpx' && !/^\s*<(\?xml|gpx)/i.test(new TextDecoder().decode(buf.slice(0, 200)))) throw new Error('Keine FIT- oder GPX-Datei. Unterstützt werden .fit und .gpx, z. B. aus Garmin Connect, Strava oder Komoot.');
  const parsed = isFit ? parseFit(buf) : parseGpx(new TextDecoder().decode(buf));
  const track = buildTrack(parsed.points);
  if (!state.stages.length) { state.thr = isFit ? 2 : 3; state.auto = true; }
  state.stages.push({key, name, track, device: parsed.device, sport: parsed.sport || sportFromName(name), buf});
}
const readError = (name, e) => { console.error(e); return name + ': ' + (e.message || 'Die Datei konnte nicht gelesen werden.'); };

async function loadFiles(files) {
  notify('');
  const errors = [], fresh = !state.stages.length;
  for (const file of files) {
    try { addStage(file.name, await file.arrayBuffer()); }
    catch (e) { errors.push(readError(file.name, e)); }
  }
  if (!state.manualOrder) sortStages();
  // Bei einer neuen Tour auf die Sportart umschalten, die die Datei angibt
  const detected = fresh && state.stages.length && state.stages[0].sport, before = state.sport;
  if (detected && detected !== state.sport) setSport(detected);
  combine();
  update();
  if (errors.length) notify('error', errors.map(esc).join('<br>'));
  else if (detected && detected !== before) {
    // Umschalten ist sichtbar und lässt sich zurücknehmen
    notify('info', `Die Datei ist als <b>${SPORT_LABEL[detected]}</b> aufgezeichnet – die Auswertung ist darauf umgestellt.`,
      `<button data-sport-back="${before}">Doch ${SPORT_LABEL[before]}</button>`);
    $('status').dataset.sportNote = '1';
  }
}
const SPORT_LABEL = {ride: 'Radfahren', run: 'Laufen', hike: 'Wandern'};

// ---------- Session ----------
// Eine Session-Datei enthält die Original-Dateien, damit sie beim Laden genauso
// ausgewertet werden wie beim ersten Mal, dazu Eingaben, Einstellungen und die
// Ortsnamen entlang der Tour (für andere Geräte, deren Browser sie nicht kennt)
const SESSION_TYPE = 'section-viewer-session';
const toBase64 = buf => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result.slice(r.result.indexOf(',') + 1));
  r.onerror = () => rej(r.error);
  r.readAsDataURL(new Blob([buf]));
});

$('sessionSave').addEventListener('click', async () => {
  const S = state.stages, keys = new Set();
  for (const s of S) for (let i = 0; i < s.track.n; i++) {
    const k = placeKey({lat: s.track.lat[i], lon: s.track.lon[i]});
    if (k) keys.add(k);
  }
  const along = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => keys.has(k)));
  const json = JSON.stringify({
    type: SESSION_TYPE, version: 1,
    files: await Promise.all(S.map(async s => ({name: s.name, data: await toBase64(s.buf)}))),
    sport: state.sport, race: $('race').checked, manualOrder: state.manualOrder, thr: state.thr, auto: state.auto,
    interval: $('interval').value, custom: $('custom').value, ovStart: $('ovStart').value,
    overlay: ovSettings(OV_SAVED), postcard: pcSettings(), pcTitle: $('pcTitle').value,
    daycard: dcSettings(), ...Object.fromEntries(DC_TEXTS.map(id => [id, $(id).value])), places: along(places), marks: along(marks),
  });
  download(new Blob([json], {type: 'application/json'}), (multi() ? 'tour' : S[0].name.replace(/\.[^.]+$/, '')) + '_session.json');
});

// Ersetzt die geladenen Dateien; unpassende Werte (z. B. von Hand bearbeitet) werden übergangen
async function loadSession(saved, fileName) {
  notify('');
  if (!Array.isArray(saved.files) || !saved.files.length) { notify('error', `„${esc(fileName)}“ enthält keine Touren.`); return; }
  const errors = [], before = state.stages;
  state.stages = [];
  for (const f of saved.files) {
    const name = String(f && f.name);
    try {
      let bytes;
      try { bytes = Uint8Array.from(atob(f.data), c => c.charCodeAt(0)); }
      catch { throw new Error('Die Daten in der Session-Datei sind beschädigt.'); }
      addStage(name, bytes.buffer);
    } catch (e) { errors.push(readError(name, e)); }
  }
  // Ist nichts lesbar, bleibt die bisherige Tour offen
  if (!state.stages.length) { state.stages = before; notify('error', errors.map(esc).join('<br>')); return; }
  // vor den Abschnitten, deren Auswahl von der Sportart abhängt; ältere Sessions haben keine Angabe
  setSport(Object.hasOwn(SPORT, saved.sport) ? saved.sport : state.stages[0].sport || state.sport);
  if (typeof saved.race === 'boolean') $('race').checked = saved.race;
  // gespeicherte Reihenfolge beibehalten
  state.manualOrder = saved.manualOrder === true;
  if (Number.isFinite(saved.thr) && saved.thr >= 0) state.thr = saved.thr;
  if (typeof saved.auto === 'boolean') state.auto = saved.auto;
  for (const id of ['custom', 'ovStart', 'pcTitle', ...DC_TEXTS]) $(id).value = typeof saved[id] === 'string' ? saved[id] : '';
  if ([...$('interval').options].some(o => o.value === saved.interval)) {
    $('interval').value = saved.interval;
    try { localStorage.setItem(SPORT[state.sport].store, saved.interval); } catch {}
  }
  if (saved.overlay && typeof saved.overlay === 'object') ovApply(saved.overlay, OV_SAVED);
  if (saved.postcard && typeof saved.postcard === 'object') ovApply(saved.postcard, PC_SAVED);
  if (saved.daycard && typeof saved.daycard === 'object') ovApply(saved.daycard, DC_SAVED);
  // Ortsnamen nur ergänzen; eigene Korrekturen in diesem Browser haben Vorrang
  for (const [k, v] of Object.entries(saved.places || {})) if (typeof v === 'string' && v && !(k in places)) places[k] = v;
  for (const k of Object.keys(saved.marks || {})) marks[k] = 1;
  savePlaces();
  saveMarks();
  combine();
  update();
  if (errors.length) notify('error', errors.map(esc).join('<br>'));
}

// Session-Dateien und Gestaltungsvorlagen sind beide .json; unterschieden wird am Inhalt
async function loadJson(file) {
  let saved = null;
  try { saved = JSON.parse(await file.text()); } catch {}
  if (saved && saved.type === SESSION_TYPE) loadSession(saved, file.name);
  else ovLoadDesign(file);
}
// Bilder sind Fotos für den Story-Creator; die Tageskarte wählt ihr Foto über den eigenen Knopf
function openFiles(files) {
  const images = files.filter(f => /^image\//.test(f.type));
  const jsons = files.filter(f => /\.json$/i.test(f.name)), tracks = files.filter(f => !jsons.includes(f) && !images.includes(f));
  images.slice(-1).forEach(pcSetPhoto);
  jsons.forEach(loadJson);
  if (tracks.length) loadFiles(tracks);
}

setSport(state.sport);
const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
drop.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('file').click(); } });
$('addFiles').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', ev => { openFiles([...ev.target.files]); ev.target.value = ''; });
// Dateien lassen sich überall auf der Seite ablegen
let dragDepth = 0;
const dragging = on => { drop.classList.toggle('over', on); document.body.classList.toggle('dragging', on); };
const hasFiles = ev => [...ev.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', ev => { if (!hasFiles(ev)) return; ev.preventDefault(); dragDepth++; dragging(true); });
window.addEventListener('dragover', ev => { if (hasFiles(ev)) ev.preventDefault(); });
window.addEventListener('dragleave', ev => { if (hasFiles(ev) && --dragDepth <= 0) { dragDepth = 0; dragging(false); } });
window.addEventListener('drop', ev => { ev.preventDefault(); dragDepth = 0; dragging(false); openFiles([...ev.dataTransfer.files]); });
