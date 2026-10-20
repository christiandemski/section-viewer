'use strict';

// ---------- Sportart ----------
// Rad und Lauf unterscheiden sich in Abschnitten, Texten, Werten (Tempo/Pace) und im Aussehen (CSS über <html data-sport>)
const SPORT = {
  ride: {intervals: [5, 10, 20, 25, 50, 100], interval: '10', store: 'sectionviewer.interval',
    sub: 'Kilometer und Höhenmeter bis zu einem bestimmten Punkt der Tour betrachten', custom: 'z. B.  12,5  123  157  1:30:00  @14:35'},
  run: {intervals: [1, 2, 5, 10], interval: '1', store: 'sectionviewer.interval.run',
    sub: 'Kilometer, Pace und Höhenmeter bis zu einem bestimmten Punkt des Laufs betrachten', custom: 'z. B.  5  10  21,1  1:30:00  @9:45'},
};
function setSport(sport) {
  const S = SPORT[sport];
  if (!S) return;
  const changed = sport !== state.sport;
  state.sport = sport;
  document.documentElement.dataset.sport = sport;
  for (const b of $('sport').querySelectorAll('button')) b.setAttribute('aria-pressed', b.dataset.sport === sport);
  $('sub').textContent = S.sub;
  $('custom').placeholder = S.custom;
  let v = S.interval;
  try { v = localStorage.getItem(S.store) ?? v; localStorage.setItem('sectionviewer.sport', sport); } catch {}
  const sel = $('interval');
  sel.innerHTML = '<option value="0">keine</option>' + S.intervals.map(k => `<option value="${k}">alle ${k} km</option>`).join('');
  sel.value = [...sel.options].some(o => o.value === v) ? v : S.interval;
  $('raceWrap').hidden = sport !== 'run';
  ovSportChanged(changed);
}
$('sport').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b || b.dataset.sport === state.sport) return;
  setSport(b.dataset.sport);
  update();
});

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
  } else S.splice(+b.dataset.del, 1);
  combine();
  update();
});
$('reset').addEventListener('click', () => {
  state.stages = [];
  state.manualOrder = false;
  $('custom').value = '';
  $('ovStart').value = '';
  combine();
  update();
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
  const parsed = isFit ? parseFit(buf) : parseGpx(new TextDecoder().decode(buf));
  const track = buildTrack(parsed.points);
  if (!state.stages.length) { state.thr = isFit ? 2 : 3; state.auto = true; }
  state.stages.push({key, name, track, device: parsed.device, sport: parsed.sport, buf});
}
const readError = (name, e) => { console.error(e); return name + ': ' + (e.message || 'Die Datei konnte nicht gelesen werden.'); };

async function loadFiles(files) {
  $('status').textContent = '';
  const errors = [], fresh = !state.stages.length;
  for (const file of files) {
    try { addStage(file.name, await file.arrayBuffer()); }
    catch (e) { errors.push(readError(file.name, e)); }
  }
  if (!state.manualOrder) sortStages();
  // Bei einer neuen Tour auf die Sportart umschalten, die die Datei angibt
  const detected = fresh && state.stages.length && state.stages[0].sport;
  if (detected && detected !== state.sport) setSport(detected);
  combine();
  update();
  $('status').textContent = errors.join(' · ');
}

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
    overlay: ovSettings(OV_SAVED), places: along(places), marks: along(marks),
  });
  download(new Blob([json], {type: 'application/json'}), (multi() ? 'tour' : S[0].name.replace(/\.[^.]+$/, '')) + '_session.json');
});

// Ersetzt die geladenen Dateien; unpassende Werte (z. B. von Hand bearbeitet) werden übergangen
async function loadSession(saved, fileName) {
  $('status').textContent = '';
  if (!Array.isArray(saved.files) || !saved.files.length) { $('status').textContent = `„${fileName}“ enthält keine Touren.`; return; }
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
  if (!state.stages.length) { state.stages = before; $('status').textContent = errors.join(' · '); return; }
  // vor den Abschnitten, deren Auswahl von der Sportart abhängt; ältere Sessions haben keine Angabe
  setSport(Object.hasOwn(SPORT, saved.sport) ? saved.sport : state.stages[0].sport || state.sport);
  if (typeof saved.race === 'boolean') $('race').checked = saved.race;
  // gespeicherte Reihenfolge beibehalten
  state.manualOrder = saved.manualOrder === true;
  if (Number.isFinite(saved.thr) && saved.thr >= 0) state.thr = saved.thr;
  if (typeof saved.auto === 'boolean') state.auto = saved.auto;
  for (const id of ['custom', 'ovStart']) $(id).value = typeof saved[id] === 'string' ? saved[id] : '';
  if ([...$('interval').options].some(o => o.value === saved.interval)) {
    $('interval').value = saved.interval;
    try { localStorage.setItem(SPORT[state.sport].store, saved.interval); } catch {}
  }
  if (saved.overlay && typeof saved.overlay === 'object') ovApply(saved.overlay, OV_SAVED);
  // Ortsnamen nur ergänzen; eigene Korrekturen in diesem Browser haben Vorrang
  for (const [k, v] of Object.entries(saved.places || {})) if (typeof v === 'string' && v && !(k in places)) places[k] = v;
  for (const k of Object.keys(saved.marks || {})) marks[k] = 1;
  savePlaces();
  saveMarks();
  combine();
  update();
  $('status').textContent = errors.join(' · ');
}

// Session-Dateien und Gestaltungsvorlagen sind beide .json; unterschieden wird am Inhalt
async function loadJson(file) {
  let saved = null;
  try { saved = JSON.parse(await file.text()); } catch {}
  if (saved && saved.type === SESSION_TYPE) loadSession(saved, file.name);
  else ovLoadDesign(file);
}
function openFiles(files) {
  const jsons = files.filter(f => /\.json$/i.test(f.name)), tracks = files.filter(f => !jsons.includes(f));
  jsons.forEach(loadJson);
  if (tracks.length) loadFiles(tracks);
}

setSport(state.sport);
const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
$('file').addEventListener('change', ev => { openFiles([...ev.target.files]); ev.target.value = ''; });
for (const t of ['dragenter', 'dragover']) window.addEventListener(t, ev => { ev.preventDefault(); if ([...ev.dataTransfer.types].includes('Files')) drop.classList.add('over'); });
for (const t of ['dragleave', 'drop']) window.addEventListener(t, ev => { ev.preventDefault(); drop.classList.remove('over'); });
window.addEventListener('drop', ev => openFiles([...ev.dataTransfer.files]));
