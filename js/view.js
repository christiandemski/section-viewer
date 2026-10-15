'use strict';

function renderSummary() {
  const T = state.track, last = T.n - 1;
  const tiles = [
    ['Distanz', nf1.format(T.dist[last] / 1000), 'km'],
    ['Aufstieg', nf0.format(state.asc[last]), 'hm'],
    ['Abstieg', nf0.format(state.desc[last]), 'hm'],
  ];
  const S = state.stages;
  if (T.t) {
    const elapsed = S.reduce((a, s) => a + (s.track.t[s.track.n - 1] - s.track.t[0]) / 1000, 0);
    tiles.push(['Fahrzeit', fmtDur(T.moving[last]), ''], ['Gesamtzeit', fmtDur(elapsed), '']);
  }
  if (multi()) tiles.unshift(['Etappen', S.length, '']);
  $('tiles').innerHTML = tiles.map(([k, v, u]) => `<div class="tile"><div class="k">${k}</div><div class="v">${v} <small>${u}</small></div></div>`).join('');

  $('stages').innerHTML = S.map((s, k) => {
    const A = s.track, d = s.device;
    let val = nf1.format((A.dist[A.n - 1] - A.dist[0]) / 1000) + ' km · ' + (A.hasEle ? nf0.format(s.asc) + ' hm' : 'keine Höhendaten');
    if (d && d.ascent != null) val += ` · Garmin: ${nf0.format(d.ascent)} hm`;
    return `<div class="stage">${multi() ? `<b>Tag ${k + 1}</b>` : ''}<span class="nm" title="${esc(s.name)}">${esc(s.name)}</span><span class="val">${val}</span>` +
      (k > 0 ? `<button data-up="${k}" title="Etappe nach vorne schieben">↑</button>` : '') +
      `<button data-del="${k}" title="Datei entfernen">×</button></div>`;
  }).join('');
}

const COLS = [
  {key: 'stage', multi: true, head: 'Tag', csv: 'Tag', fmt: String, raw: String},
  {key: 'sDist', multi: true, head: 'Tages-km', csv: 'Tages-km', fmt: v => nf1.format(v / 1000) + ' km', raw: v => (v / 1000).toFixed(2)},
  {key: 'sAsc', multi: true, head: 'Tages-hm', csv: 'Tages-hm', fmt: v => nf0.format(v) + ' hm', raw: v => v.toFixed(0)},
  {key: 'dist', head: 'Distanz', csv: 'Distanz (km)', fmt: v => nf1.format(v / 1000) + ' km', raw: v => (v / 1000).toFixed(2), main: true},
  {key: 'asc', head: 'Aufstieg', csv: 'Aufstieg (hm)', fmt: v => nf0.format(v) + ' hm', raw: v => v.toFixed(0), main: true},
  {key: 'desc', head: 'Abstieg', csv: 'Abstieg (hm)', fmt: v => nf0.format(v) + ' hm', raw: v => v.toFixed(0)},
  {key: 'ele', head: 'Höhe', csv: 'Höhe (m)', fmt: v => nf0.format(v) + ' m', raw: v => v.toFixed(0)},
  {key: 'moving', head: 'Fahrzeit', csv: 'Fahrzeit', fmt: fmtDur, raw: fmtDur},
  {key: 'elapsed', head: 'Zeit seit Start', csv: 'Zeit seit Start', fmt: fmtDur, raw: fmtDur},
  {key: 'clock', head: 'Uhrzeit', csv: 'Uhrzeit', fmt: fmtClock, raw: fmtClock},
  {key: 'speed', head: 'Tempo', csv: 'Tempo (km/h)', fmt: v => nf1.format(v * 3.6) + ' km/h', raw: v => (v * 3.6).toFixed(1)},
  {key: 'hr', head: 'Puls', csv: 'Puls (bpm)', fmt: v => nf0.format(v), raw: v => v.toFixed(0)},
  {key: 'power', head: 'Leistung', csv: 'Leistung (W)', fmt: v => nf0.format(v) + ' W', raw: v => v.toFixed(0)},
  {key: 'cad', head: 'Kadenz', csv: 'Kadenz (rpm)', fmt: v => nf0.format(v), raw: v => v.toFixed(0)},
  {key: 'temp', head: 'Temp.', csv: 'Temperatur (°C)', fmt: v => nf0.format(v) + ' °C', raw: v => v.toFixed(0)},
];
// Spalten, für die die Datei überhaupt Daten enthält
const activeCols = () => COLS.filter(c => (!c.multi || multi()) && state.rows.some(r => r[c.key] != null) &&
  (Array.isArray(state.track[c.key]) ? state.track[c.key].some(v => v != null) : true));

// ---------- Orte ----------
// Ortsnamen je Punkt, auf rund 100 m gerundet gemerkt; eigene Korrekturen überschreiben den abgerufenen Namen
let places = {};
try { places = JSON.parse(localStorage.getItem('sectionviewer.places') || '{}'); } catch {}
// Punkte, deren Ort klein in der Overlay-Karte erscheinen soll
let marks = {};
try { marks = JSON.parse(localStorage.getItem('sectionviewer.marks') || '{}'); } catch {}
const savePlaces = () => { try { localStorage.setItem('sectionviewer.places', JSON.stringify(places)); } catch {} };
const placeKey = r => r.lat == null ? null : r.lat.toFixed(3) + ',' + r.lon.toFixed(3);
// Sucht auch in den Nachbarfeldern, damit ein Punkt knapp neben der Rundungsgrenze seinen Namen behält
function placeOf(r) {
  const key = placeKey(r);
  if (!key) return '';
  if (places[key]) return places[key];
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
    const v = places[(r.lat + dy * 0.001).toFixed(3) + ',' + (r.lon + dx * 0.001).toFixed(3)];
    if (v) return v;
  }
  return '';
}
function setPlace(key, name, except) {
  if (name) places[key] = name; else delete places[key]; // geleert: beim nächsten Abruf neu holen
  savePlaces();
  for (const el of $('tbody').querySelectorAll('input[data-place]')) if (el !== except && el !== document.activeElement && el.dataset.place === key) el.value = name;
}

$('tbody').addEventListener('change', ev => {
  const key = ev.target.dataset.place, mark = ev.target.dataset.mark;
  if (mark) {
    if (ev.target.checked) marks[mark] = 1; else delete marks[mark];
    try { localStorage.setItem('sectionviewer.marks', JSON.stringify(marks)); } catch {}
  } else if (key) setPlace(key, ev.target.value.trim(), ev.target);
  else return;
  ovRefresh();
});

let placeRun = 0;
$('places').addEventListener('click', async ev => {
  const btn = ev.currentTarget, prog = $('placeProg');
  if (placeRun) { placeRun = 0; return; }
  const todo = [...new Set(state.rows.filter(r => placeKey(r) && !placeOf(r)).map(placeKey))];
  if (!todo.length) { prog.textContent = 'Alle Orte sind bereits eingetragen.'; return; }
  const run = placeRun = Date.now(), label = btn.textContent;
  btn.textContent = 'Abbrechen';
  let found = 0;
  try {
    for (const [n, key] of todo.entries()) {
      prog.textContent = `Ort ${n + 1} von ${todo.length} …`;
      const [lat, lon] = key.split(',');
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=de&lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const a = (await res.json()).address || {};
      const name = a.village || a.town || a.city || a.hamlet || a.suburb || a.municipality || a.county || '';
      if (placeRun !== run) break;
      if (name && !(key in places)) { setPlace(key, name); found++; ovRefresh(); }
      // Nominatim erlaubt höchstens eine Anfrage pro Sekunde
      if (n < todo.length - 1) await new Promise(r => setTimeout(r, 1100));
    }
    prog.textContent = placeRun !== run ? 'Abgebrochen.' : `${found} von ${todo.length} Orten gefunden.`;
  } catch (e) {
    console.error(e);
    prog.textContent = 'Ortsabfrage fehlgeschlagen (offline oder Dienst nicht erreichbar).';
  } finally {
    if (placeRun === run) placeRun = 0;
    btn.textContent = label;
  }
});

const overlayText = r => nf1.format(r.dist / 1000) + ' km · ' + nf0.format(r.asc) + ' hm';

function renderTable() {
  const cols = activeCols();
  const head = c => multi() && c.key === 'elapsed' ? 'Zeit seit Tagesstart' : multi() && (c.key === 'dist' || c.key === 'asc' || c.key === 'desc') ? c.head + ' ges.' : c.head;
  const gps = state.track.hasGps;
  $('thead').innerHTML = '<tr><th>Punkt</th>' + (gps ? '<th class="l">Ort</th><th class="c" title="Ort klein in der Overlay-Karte zeigen">in Karte</th>' : '') + cols.map(c => `<th>${head(c)}</th>`).join('') + '<th></th></tr>';
  $('tbody').innerHTML = state.rows.map((r, i) =>
    `<tr data-i="${i}"><td>${esc(r.label)}</td>` +
    (gps ? `<td class="l">${placeKey(r) ? `<input type="text" data-place="${placeKey(r)}" value="${esc(placeOf(r))}" autocomplete="off">` : ''}</td>` +
      `<td class="c">${placeKey(r) ? `<input type="checkbox" data-mark="${placeKey(r)}"${marks[placeKey(r)] ? ' checked' : ''} title="Ort klein in der Overlay-Karte zeigen">` : ''}</td>` : '') +
    cols.map(c => `<td${c.main ? ' class="main"' : ''}>${r[c.key] == null ? '–' : c.fmt(r[c.key])}</td>`).join('') +
    `<td><button data-copy="${i}" title="${esc(overlayText(r))}">Kopieren</button> <button data-ov="${i}" title="Overlay ab diesem Punkt">Overlay</button></td></tr>`).join('');
}

function niceStep(range, count) {
  const raw = range / count, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * mag;
}

let chartGeo = null;
function renderChart() {
  const T = state.track, svg = $('chart');
  const W = svg.clientWidth || 800, H = 260, m = {l: 46, r: 12, t: 20, b: 24};
  const pw = W - m.l - m.r, ph = H - m.t - m.b, total = T.dist[T.n - 1];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < T.n; i++) { if (T.ele[i] < lo) lo = T.ele[i]; if (T.ele[i] > hi) hi = T.ele[i]; }
  if (hi - lo < 20) { hi += 10; lo -= 10; }
  const ys = niceStep(hi - lo, 4);
  lo = Math.floor(lo / ys) * ys; hi = Math.ceil(hi / ys) * ys;
  const x = d => m.l + d / total * pw, y = e => m.t + (hi - e) / (hi - lo) * ph;
  chartGeo = {m, pw, total, x, y};

  const stride = Math.max(1, Math.floor(T.n / (pw * 2)));
  let line = '';
  for (let i = 0; i < T.n; i += stride) line += (i ? 'L' : 'M') + x(T.dist[i]).toFixed(1) + ' ' + y(T.ele[i]).toFixed(1);
  line += 'L' + x(total).toFixed(1) + ' ' + y(T.ele[T.n - 1]).toFixed(1);
  const base = m.t + ph;

  let s = '';
  for (let e = lo; e <= hi + 1e-6; e += ys) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(e)}" y2="${y(e)}" stroke="var(--line)"/>` +
         `<text x="${m.l - 6}" y="${y(e) + 4}" text-anchor="end">${nf0.format(e)} m</text>`;
  }
  const xs = niceStep(total / 1000, Math.max(3, Math.floor(pw / 90)));
  for (let k = 0; k * 1000 <= total; k += xs) {
    s += `<text x="${x(k * 1000)}" y="${H - 6}" text-anchor="middle">${nf0.format(k)}${k === 0 ? ' km' : ''}</text>`;
  }
  s += `<path d="${line}L${x(total).toFixed(1)} ${base}L${m.l} ${base}Z" fill="var(--accent-soft)"/>` +
       `<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  let lastLabel = -1e9;
  state.rows.forEach((r, i) => {
    const px = x(r.dist);
    let label = '';
    if (px - lastLabel > 34) { label = `<text x="${px}" y="${m.t - 6}" text-anchor="middle">${nf0.format(r.dist / 1000)}</text>`; lastLabel = px; }
    s += `<g class="mk" data-i="${i}"><line x1="${px}" x2="${px}" y1="${m.t}" y2="${base}"/><circle cx="${px}" cy="${y(r.ele ?? lo)}" r="4"/>${label}</g>`;
  });
  s += `<g id="cross" style="display:none"><line y1="${m.t}" y2="${base}" stroke="var(--ink2)"/><circle r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/></g>`;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = s;
}

function chartDist(ev) {
  const g = chartGeo, rect = $('chart').getBoundingClientRect();
  const px = ev.clientX - rect.left;
  if (!g || px < g.m.l || px > g.m.l + g.pw) return null;
  return (px - g.m.l) / g.pw * g.total;
}

$('chart').addEventListener('pointermove', ev => {
  const d = chartDist(ev), cross = $('chart').querySelector('#cross'), tip = $('tip');
  if (d == null || !cross) { tip.style.display = 'none'; if (cross) cross.style.display = 'none'; return; }
  const r = rowAt(locate(state.track.dist, d), ''), g = chartGeo, px = g.x(r.dist);
  cross.style.display = '';
  cross.firstChild.setAttribute('x1', px); cross.firstChild.setAttribute('x2', px);
  cross.lastChild.setAttribute('cx', px); cross.lastChild.setAttribute('cy', g.y(r.ele ?? 0));
  tip.innerHTML = `<b>km ${nf1.format(r.dist / 1000)}</b> · ↑ ${nf0.format(r.asc)} hm<br>` +
    (multi() ? `Tag ${r.stage}: km ${nf1.format(r.sDist / 1000)} · ↑ ${nf0.format(r.sAsc)} hm<br>` : '') +
    `Höhe ${nf0.format(r.ele ?? 0)} m` +
    (r.elapsed != null ? ` · ${fmtDur(r.elapsed)} · ${fmtClock(r.clock)}` : '');
  tip.style.display = 'block';
  const w = tip.offsetWidth, wrap = $('chartWrap').clientWidth;
  tip.style.left = (px + 12 + w > wrap ? px - 12 - w : px + 12) + 'px';
});
$('chart').addEventListener('pointerleave', () => {
  $('tip').style.display = 'none';
  const cross = $('chart').querySelector('#cross');
  if (cross) cross.style.display = 'none';
});
$('chart').addEventListener('click', ev => {
  const d = chartDist(ev);
  if (d == null) return;
  const c = $('custom');
  c.value = (c.value.trim() + ' ' + (d / 1000).toFixed(1).replace('.', ',')).trim();
  update();
});

// Tabelle <-> Marker im Profil
$('tbody').addEventListener('mouseover', ev => {
  const tr = ev.target.closest('tr');
  for (const g of $('chart').querySelectorAll('.mk')) g.classList.toggle('hot', !!tr && g.dataset.i === tr.dataset.i);
});
$('tbody').addEventListener('mouseleave', () => {
  for (const g of $('chart').querySelectorAll('.mk.hot')) g.classList.remove('hot');
});

$('tbody').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.ov) {
    const r = state.rows[+b.dataset.ov];
    $('ovStart').value = r.stage + '/' + (r.elapsed != null ? fmtDur(Math.floor(r.elapsed)) : (r.sDist / 1000).toFixed(3));
    $('ovSlider').value = 0;
    ovRefresh();
    $('ovCard').scrollIntoView({behavior: 'smooth'});
    return;
  }
  copyText(overlayText(state.rows[+b.dataset.copy]));
  flash(b, 'Kopiert');
});

function exportRows(sep) {
  const cols = activeCols();
  const gps = state.track.hasGps ? 1 : 0;
  const lines = [['Punkt', ...['Ort'].slice(0, gps), ...cols.map(c => c.csv)].join(sep)];
  for (const r of state.rows) {
    lines.push([r.label, ...[placeOf(r)].slice(0, gps), ...cols.map(c => r[c.key] == null ? '' : c.raw(r[c.key]).replace('.', ','))].join(sep));
  }
  return lines.join('\r\n');
}
$('copyAll').addEventListener('click', ev => { copyText(exportRows('\t')); flash(ev.target, 'Kopiert'); });
$('csv').addEventListener('click', () => {
  download(new Blob(['﻿' + exportRows(';')], {type: 'text/csv'}),
    (multi() ? 'tour' : state.stages[0].name.replace(/\.[^.]+$/, '')) + '_abschnitte.csv');
});

