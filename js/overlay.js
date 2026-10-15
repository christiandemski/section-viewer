'use strict';

// Rendert Zähler und Mini-Höhenprofil Bild für Bild auf eine transparente Zeichenfläche.
const fmtKm = (m, dec) => (m / 1000).toLocaleString('de-DE', {minimumFractionDigits: dec, maximumFractionDigits: dec});
const OV_FIELDS = [
  // Ort des Startpunkts; wird ohne Beschriftung mit einem Ortssymbol gezeichnet
  {id: 'place', label: 'Ort', unit: '', val: (r, c) => c.place},
  {id: 'dist', label: 'Distanz', unit: 'km', on: true, val: (r, c) => fmtKm(c.scope === 'stage' ? r.sDist : r.dist, c.dec)},
  {id: 'asc', label: 'Aufstieg', unit: 'hm', on: true, val: (r, c) => nf0.format(c.scope === 'stage' ? r.sAsc : r.asc)},
  {id: 'moving', label: 'Fahrzeit', unit: 'Std.', val: (r, c) => fmtDur(ovMoving(r, c))},
  {id: 'elapsed', label: 'Gesamtzeit', unit: 'Std.', val: (r, c) => fmtDur(r.elapsed + (c.scope === 'stage' ? 0 : elapsedBefore(r.stage - 1)))},
  {id: 'clock', label: 'Uhrzeit', unit: 'Uhr', val: (r, c) => (c.clockSec ? fmtClock : fmtClockShort)(r.clock)},
  // wide: breitester zu erwartender Wert, damit die Spalten der Leiste nicht springen
  {id: 'speed', label: 'Tempo', unit: 'km/h', wide: '00,0', val: r => r.speed == null ? '–' : nf1.format(r.speed * 3.6)},
  // Schnitt über die Fahrzeit; in den ersten Sekunden wäre der Wert noch reines Rauschen
  {id: 'avg', label: 'Ø Tempo', unit: 'km/h', wide: '00,0', val: (r, c) => { const m = ovMoving(r, c); return m < 5 ? '–' : nf1.format((c.scope === 'stage' ? r.sDist : r.dist) / m * 3.6); }},
  {id: 'hr', label: 'Puls', unit: 'bpm', wide: '000', val: r => r.hr == null ? '–' : nf0.format(r.hr)},
  {id: 'grade', label: 'Steigung', unit: '%', wide: '-00', val: r => nf0.format(Math.round(r.grade) || 0)},
  {id: 'ele', label: 'Höhe', unit: 'm', wide: '0000', val: r => r.ele == null ? '–' : nf0.format(r.ele)},
  {id: 'temp', label: 'Temperatur', unit: '°C', wide: '-00', val: r => r.temp == null ? '–' : nf0.format(r.temp)},
];
$('ovChecks').innerHTML = OV_FIELDS.map(f => `<label class="ovf" draggable="true" data-f="${f.id}"><input type="checkbox" id="ovf_${f.id}"${f.on ? ' checked' : ''}>${f.label}</label>`).join('') +
  '<label><input type="checkbox" id="ovMap" checked>Karte</label><label><input type="checkbox" id="ovTiles">Kartenhintergrund</label><label><input type="checkbox" id="ovAttr" checked>© in der Karte</label><label><input type="checkbox" id="ovProfile" checked>Höhenprofil</label><label><input type="checkbox" id="ovBox" checked>Hintergrund</label>';

// Einstellungen merken
const OV_SAVED = ['ovDur', 'ovFps', 'ovSpeed', 'ovSize', 'ovWeight', 'ovDec', 'ovClock', 'ovScope', 'ovAccent', 'ovMap', 'ovTiles', 'ovAttr', 'ovProfile', 'ovBox',
  'ovLayout', 'ovWidth', 'ovMapPos', 'ovFont', 'ovScale', 'ovLabels', 'ovUpper', 'ovText', 'ovBase', 'ovBgCol', 'ovBgAlpha', 'ovRadius', 'ovShadow',
  'ovTileStyle', 'ovTileAlpha', 'ovMapH', 'ovLine', ...OV_FIELDS.map(f => 'ovf_' + f.id)];
// Gestaltungsvorlage: alles, was das Aussehen bestimmt, ohne die Angaben zum einzelnen Clip
const OV_CLIP = ['ovDur', 'ovFps', 'ovSpeed', 'ovSize', 'ovScope'];
const OV_DESIGN = OV_SAVED.filter(id => !OV_CLIP.includes(id));
const ovSettings = ids => ({
  ...Object.fromEntries(ids.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])),
  order: [...$('ovChecks').querySelectorAll('.ovf')].map(el => el.dataset.f),
});
// Übernimmt gespeicherte Werte; unpassende (z. B. aus einer fremden Datei) werden übergangen
function ovApply(saved, ids) {
  for (const id of ids) {
    if (!(id in saved)) continue;
    const el = $(id), v = saved[id];
    if (el.type === 'checkbox') { if (typeof v === 'boolean') el.checked = v; continue; }
    if (typeof v !== 'string') continue;
    if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === v)) continue;
    if (el.type === 'color' && !/^#[0-9a-f]{6}$/i.test(v)) continue;
    el.value = v;
  }
  if (!Array.isArray(saved.order)) return;
  // gemerkte Reihenfolge herstellen; neu hinzugekommene Werte stehen dahinter
  const labels = [...$('ovChecks').querySelectorAll('.ovf')], rank = id => { const n = saved.order.indexOf(id); return n < 0 ? 1e9 : n; };
  labels.sort((a, b) => rank(a.dataset.f) - rank(b.dataset.f)).forEach(el => $('ovChecks').insertBefore(el, $('ovMap').parentNode));
}
try { ovApply(JSON.parse(localStorage.getItem('sectionviewer.overlay') || '{}'), OV_SAVED); } catch {}

const OV_DESIGN_TYPE = 'section-viewer-gestaltung';
$('ovDesignSave').addEventListener('click', () => {
  const name = $('ovDesignName').value.trim();
  const json = JSON.stringify({type: OV_DESIGN_TYPE, version: 1, name, ...ovSettings(OV_DESIGN)}, null, 2);
  download(new Blob([json], {type: 'application/json'}), 'gestaltung_' + (name.replace(/[\\/:*?"<>|]+/g, '_') || 'overlay') + '.json');
  $('ovDesignMsg').textContent = '';
});
async function ovLoadDesign(file) {
  const msg = $('ovDesignMsg');
  try {
    const saved = JSON.parse(await file.text());
    if (!saved || saved.type !== OV_DESIGN_TYPE) throw new Error();
    ovApply(saved, OV_DESIGN);
    $('ovDesignName').value = typeof saved.name === 'string' ? saved.name : '';
    $('ovDesign').open = true;
    msg.textContent = `„${file.name}“ geladen.`;
    ovRefresh();
  } catch {
    msg.textContent = `„${file.name}“ ist keine Gestaltungsvorlage.`;
  }
}
$('ovDesignLoad').addEventListener('click', () => $('ovDesignFile').click());
// Ausgangswerte: was im HTML vorbelegt ist, Werte in der Reihenfolge von OV_FIELDS
$('ovDesignReset').addEventListener('click', () => {
  const def = el => el.type === 'checkbox' ? el.defaultChecked
    : el.tagName === 'SELECT' ? ([...el.options].find(o => o.defaultSelected) || el.options[0]).value : el.defaultValue;
  ovApply({...Object.fromEntries(OV_DESIGN.map(id => [id, def($(id))])), order: OV_FIELDS.map(f => f.id)}, OV_DESIGN);
  $('ovDesignName').value = '';
  $('ovDesignMsg').textContent = 'Auf Standard zurückgesetzt.';
  ovRefresh();
});
$('ovDesignFile').addEventListener('change', ev => { if (ev.target.files[0]) ovLoadDesign(ev.target.files[0]); ev.target.value = ''; });

// Reihenfolge der Werte durch Ziehen der Häkchen ändern
{
  const box = $('ovChecks');
  let drag = null;
  box.addEventListener('dragstart', ev => {
    drag = ev.target.closest('.ovf');
    if (!drag) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', drag.dataset.f);
    setTimeout(() => drag && drag.classList.add('drag'));
  });
  box.addEventListener('dragover', ev => {
    const over = ev.target.closest('.ovf');
    if (!drag) return;
    ev.preventDefault();
    ev.stopPropagation(); // sonst hält die Seite das für eine abgelegte Datei
    if (!over || over === drag) return;
    const rect = over.getBoundingClientRect();
    box.insertBefore(drag, ev.clientX < rect.left + rect.width / 2 ? over : over.nextSibling);
  });
  box.addEventListener('drop', ev => { if (drag) { ev.preventDefault(); ev.stopPropagation(); } });
  box.addEventListener('dragend', () => {
    if (!drag) return;
    drag.classList.remove('drag');
    drag = null;
    ovRefresh();
  });
}

const ov = {cfg: null, raf: 0, busy: false, cancel: false, fonts: new Set(), zipMax: 2e9};
const ovMeasure = document.createElement('canvas').getContext('2d');
const ovFontStack = fam => `"${fam}", "Segoe UI", system-ui, sans-serif`;
// Die Schrift kommt von Google Fonts oder aus den installierten Schriften; sonst greift die Ersatzschrift
function fontAvailable(fam) {
  const w = f => { ovMeasure.font = '40px ' + f; return ovMeasure.measureText('Rgae0123').width; };
  return w(`"${fam}", monospace`) !== w('monospace');
}
// #rrggbb aus dem Farbwähler mit Deckkraft
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };
const TILE_FILTER = {dark: 'grayscale(1) invert(1)', light: 'grayscale(1)', color: 'none'};
const ovNum = (id, def, lo, hi) => { const v = parseFloat($(id).value); return Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : def)); };

// Summe der Gesamtzeiten aller Etappen vor Etappe si (Nächte dazwischen zählen nicht mit)
const elapsedBefore = si => state.stages.slice(0, si).reduce((a, s) => a + (s.track.t[s.track.n - 1] - s.track.t[0]) / 1000, 0);
// Fahrzeit bis zum Punkt, je nach Bezug seit Tourstart oder seit Tagesstart
const ovMoving = (r, c) => r.moving - (c.scope === 'stage' ? state.track.moving[state.stages[r.stage - 1].start] : 0);

// Steigung in Prozent, gemittelt über 100 m um den Punkt
function gradeAt(si, sDist) {
  const A = state.stages[si].track, d0 = A.dist[0], len = A.dist[A.n - 1] - d0;
  const a = Math.max(0, sDist - 50), b = Math.min(len, sDist + 50);
  if (!A.hasEle || b - a < 20) return 0;
  const e = d => { const p = locate(A.dist, d0 + d), j = Math.min(p.i + 1, A.n - 1); return A.ele[p.i] + p.f * (A.ele[j] - A.ele[p.i]); };
  return (e(b) - e(a)) / (b - a) * 100;
}

// Werte zur Videozeit tau (Sekunden nach Clipstart)
function ovSample(c, tau) {
  const T = state.track;
  let r = c.r0;
  if (T.t) {
    const s = state.stages[c.si], A = s.track, p = locate(A.t, c.t0 + tau * 1000 * c.speed);
    const i = s.start + p.i, j = Math.min(i + 1, s.start + A.n - 1);
    r = rowAt({i, f: p.f}, '');
    if (T.speed[i] != null && T.speed[j] != null) r.speed = T.speed[i] + p.f * (T.speed[j] - T.speed[i]);
    if (T.lat[i] != null && T.lat[j] != null && T.lon[i] != null && T.lon[j] != null) {
      r.lat = T.lat[i] + p.f * (T.lat[j] - T.lat[i]);
      r.lon = T.lon[i] + p.f * (T.lon[j] - T.lon[i]);
    }
  }
  r.grade = gradeAt(r.stage - 1, r.sDist);
  return r;
}

// Ohne Angabe gilt der Startpunkt aus dem Feld „Start des Clips“
function ovConfig(r0) {
  const T = state.track;
  if (!T) return null;
  if (!r0) {
    const tok = $('ovStart').value.trim().split(/\s+/)[0];
    r0 = tok ? parseCustom(tok).out[0] : rowAt({i: 0, f: 0}, '');
  }
  if (!r0) return {error: 'Startpunkt nicht erkannt oder außerhalb der Tour.'};
  const s = +$('ovSize').value, si = r0.stage - 1;
  const c = {
    r0, si, t0: r0.clock, s, fps: +$('ovFps').value, speed: Math.max(0.01, parseFloat($('ovSpeed').value) || 1),
    scope: multi() ? $('ovScope').value : 'tour', dec: +$('ovDec').value, clockSec: $('ovClock').value === '1', accent: $('ovAccent').value,
    profile: $('ovProfile').checked && T.hasEle,
  };
  const A = state.stages[si].track;
  const want = Math.max(0, parseFloat($('ovDur').value) || 0);
  c.dur = T.t ? Math.min(want, (A.t[A.n - 1] - c.t0) / 1000 / c.speed) : 0;
  c.clamped = !!T.t && c.dur < want;
  c.frames = Math.max(1, Math.round(c.dur * c.fps));

  // Gestaltung; Größen in px bei 1080p, s skaliert auf 4K, u zusätzlich mit der Textgröße
  const pad = 20 * s, u = s * ovNum('ovScale', 100, 50, 300) / 100;
  const fam = $('ovFont').value, font = ovFontStack(fam);
  const wv = $('ovWeight').value, wght = +wv.replace('c', ''), light = wght >= 700 ? 600 : wght >= 500 ? 400 : wght;
  c.pad = pad; c.u = u; c.fam = fam;
  c.box = $('ovBox').checked;
  c.rad = ovNum('ovRadius', 14, 0, 60) * s;
  c.bgFill = rgba($('ovBgCol').value, ovNum('ovBgAlpha', 55, 0, 100) / 100);
  c.text = $('ovText').value; c.textDim = rgba(c.text, 0.85);
  c.base = $('ovBase').value;
  c.shadow = $('ovShadow').checked;
  c.line = ovNum('ovLine', 3, 1, 12) * s;
  c.labels = $('ovLabels').checked;
  c.lab = f => $('ovUpper').checked ? f.label.toUpperCase() : f.label;
  c.bar = $('ovLayout').value === 'bar';
  const wantW = $('ovWidth').value.trim() ? ovNum('ovWidth', 440, 120, 3840) * s : 0;
  // Die Breite muss im font-Kürzel stehen: Setzen von ctx.font setzt ctx.fontStretch zurück. Schmale Schnitte gibt es nur bei Open Sans.
  const st = wv[0] === 'c' && fam === 'Open Sans' ? 'condensed ' : '';
  c.fontV = `${st}${wght} ${34 * u}px ${font}`; c.fontU = `${st}${light} ${19 * u}px ${font}`; c.fontL = `${st}${light} ${22 * u}px ${font}`;
  c.place = placeOf(r0);
  // Nächster Ort: der nächste Tabellenpunkt mit einem anderen Ortsnamen; bekommt eine kleinere Zeile beim Ort
  const nx = c.place && state.rows.find(x => x.dist > r0.dist + 50 && placeOf(x) && placeOf(x) !== c.place);
  c.next = nx ? {name: placeOf(nx), dist: nx.dist} : null;
  // Reihenfolge wie die Häkchen; der Ort entfällt, solange kein Name bekannt ist
  const fields = [...$('ovChecks').querySelectorAll('.ovf input')].filter(el => el.checked && !el.disabled)
    .map(el => OV_FIELDS.find(f => 'ovf_' + f.id === el.id)).filter(f => f.id !== 'place' || c.place);
  const width = (spec, t) => { ovMeasure.font = spec; return ovMeasure.measureText(t).width; };
  // Lange Ortsnamen verkleinern, bis sie in placeW passen
  const fitPlace = () => { c.fontP = `${st}${wght} ${Math.floor(34 * u * Math.min(1, c.placeW / (width(c.fontV, c.place) || 1)))}px ${font}`; };
  let blocksH = 0;
  if (!c.bar) {
    // Liste: Zeilen mit Art links und Wert rechts, darunter das Profil.
    // 440 px Breite bei 1080p bzw. 880 px bei 4K, also knapp ein Viertel der Bildbreite.
    c.BW = wantW || 440 * s;
    c.placeW = c.BW - 2 * pad - 26 * u;
    if (c.place) fitPlace();
    let rowY = pad;
    c.blocks = fields.map(f => {
      const b = {f, x: pad, y: rowY + 33 * u, ly: rowY + 33 * u};
      b.ny = b.y + 30 * u; // Zeile für den nächsten Ort
      rowY += 46 * u + (f.id === 'place' && c.next ? 28 * u : 0);
      return b;
    });
    // Einheiten stehen linksbündig in einer eigenen Spalte, die Zahlen rechtsbündig davor
    const uw = Math.max(0, ...c.blocks.map(b => width(c.fontU, b.f.unit)));
    for (const b of c.blocks) { b.ux = c.BW - pad - uw; b.vx = b.ux - 7 * u; }
    blocksH = rowY - pad;
  } else {
    // Leiste: Spalten nebeneinander, die Art klein über dem Wert, darunter das Profil über die ganze Breite
    const yL = pad + 21 * u, yV = c.labels ? yL + 40 * u : pad + 33 * u;
    // Breite der Werte aus Anfang und Ende des Clips und dem breitesten erwarteten Wert, damit die Spalten nicht springen
    const ends = [ovSample(c, 0), ovSample(c, c.dur)];
    const zero = t => String(t).replace(/\d/g, '0');
    c.placeW = 360 * u;
    c.blocks = fields.map(f => {
      const b = {f, y: yV, ly: yL};
      if (f.id === 'place') {
        b.ny = c.labels ? yL : yV + 30 * u;
        b.w = 26 * u + Math.max(Math.min(c.placeW, width(c.fontV, c.place)), c.next ? width(c.fontL, `${c.next.name} · 00,0 km`) : 0);
      } else {
        b.vw = Math.max(...ends.map(r => width(c.fontV, zero(f.val(r, c)))), f.wide ? width(c.fontV, f.wide) : 0);
        b.w = Math.max(c.labels ? width(c.fontL, c.lab(f)) : 0, b.vw + 6 * u + width(c.fontU, f.unit));
      }
      return b;
    });
    if (c.place) fitPlace();
    const n = c.blocks.length, content = c.blocks.reduce((a, b) => a + b.w, 0);
    c.BW = Math.max(wantW, Math.ceil(content + 28 * u * Math.max(0, n - 1) + 2 * pad), c.profile && !n ? 440 * s : 0);
    // übrige Breite gleichmäßig zwischen die Spalten verteilen
    const step = n > 1 ? (c.BW - 2 * pad - content) / (n - 1) : 0;
    let x = pad;
    for (const b of c.blocks) { b.x = x; b.vx = x + (b.vw || 0); b.ux = b.vx + 6 * u; x += b.w + step; }
    blocksH = n ? Math.max(yV, ...c.blocks.map(b => b.f.id === 'place' && c.next ? b.ny : 0)) - pad + 13 * u : 0;
  }
  c.pw = c.profile ? c.BW - 2 * pad : 0;
  c.ph = c.profile ? 110 * s : 0;
  c.py = pad + blocksH + (blocksH && c.profile ? 12 * s : 0);
  // bh: Höhe des Kastens mit den Werten; die Karte steht in einem eigenen Kasten
  c.bh = c.blocks.length || c.profile ? Math.ceil(c.profile ? c.py + c.ph + pad : pad + blocksH + pad * 0.6) : 0;
  if (!c.bh) c.BW = 0;
  c.mapPos = $('ovMapPos').value;
  c.map = $('ovMap').checked && T.hasGps;
  if (c.map) {
    const st = state.stages[si], stage = c.scope === 'stage';
    const a = stage ? st.start : 0, b = stage ? st.start + st.track.n - 1 : T.n - 1;
    const idx = [];
    for (let i = a; i <= b; i++) if (T.lat[i] != null && T.lon[i] != null) idx.push(i);
    if (idx.length < 2) c.map = false;
    else {
      const stride = Math.max(1, Math.floor(idx.length / 800));
      const pick = idx.filter((_, n) => n % stride === 0 || n === idx.length - 1);
      // Web-Mercator (Welt = 0…1), damit der Track auf die Kartenkacheln passt
      const wx = lon => (lon + 180) / 360;
      const wy = lat => { const p = lat * Math.PI / 180; return (1 - Math.log(Math.tan(p) + 1 / Math.cos(p)) / Math.PI) / 2; };
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const i of pick) { const x = wx(T.lon[i]), y = wy(T.lat[i]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      // Über oder unter den Werten so breit wie deren Kasten, daneben bzw. allein in fester Breite
      const m = 18 * s, side = c.mapPos === 'side' && c.bh;
      c.mw = c.bh && !side ? c.BW : !c.bh && wantW ? wantW : 440 * s;
      // Daneben genau so hoch wie der Kasten mit den Werten
      const maxH = side ? c.bh - 2 * m : ovNum('ovMapH', 220, 60, 1000) * s;
      const sc = Math.min((c.mw - 2 * m) / Math.max(x1 - x0, 1e-9), maxH / Math.max(y1 - y0, 1e-9), 256 * 2 ** 17);
      c.mh = side ? c.bh : Math.max(Math.ceil((y1 - y0) * sc + 2 * m), Math.min(120 * s, maxH + 2 * m));
      const ox = (c.mw - (x1 - x0) * sc) / 2, oy = (c.mh - (y1 - y0) * sc) / 2;
      const at = (lat, lon) => [ox + (wx(lon) - x0) * sc, oy + (wy(lat) - y0) * sc];
      c.mp = {at, pts: pick.map(i => at(T.lat[i], T.lon[i])), ds: pick.map(i => T.dist[i])};
      // In der Tabelle angehakte Orte, jeder Name nur einmal
      const seen = new Set();
      c.mp.labels = state.rows.filter(x => marks[placeKey(x)] && placeOf(x) && x.dist >= T.dist[a] - 1 && x.dist <= T.dist[b] + 1 && !seen.has(placeOf(x)) && seen.add(placeOf(x)))
        .map(x => ({name: placeOf(x), p: at(x.lat, x.lon)}));
      // Name auf die Seite des Punkts, auf der weniger Track verläuft, damit die Position ihn nicht verdeckt
      ovMeasure.font = c.fontM = c.fontU.replace(/[\d.]+px/, 14 * u + 'px');
      for (const l of c.mp.labels) {
        const w = ovMeasure.measureText(l.name).width + 14 * s;
        const near = dir => c.mp.pts.filter(q => Math.abs(q[1] - l.p[1]) < 14 * u && (q[0] - l.p[0]) * dir > 2 * s && (q[0] - l.p[0]) * dir < w).length;
        const fits = dir => dir > 0 ? l.p[0] + w <= c.mw - 6 * s : l.p[0] - w >= 6 * s;
        l.left = !fits(1) || (fits(-1) && near(-1) < near(1));
      }
      if ($('ovTiles').checked) {
        // Zoomstufe, bei der eine Kachel möglichst nah an ihrer Originalgröße gezeichnet wird
        const z = Math.max(0, Math.min(18, Math.round(Math.log2(sc / 256)))), n = 2 ** z;
        const left = x0 - ox / sc, top = y0 - oy / sc;
        c.tiles = {
          z, px: tx => (tx / n - left) * sc, py: ty => (ty / n - top) * sc,
          tx0: Math.floor(left * n), tx1: Math.floor((left + c.mw / sc) * n), ty0: Math.floor(top * n), ty1: Math.floor((top + c.mh / sc) * n),
          filter: TILE_FILTER[$('ovTileStyle').value] || 'none', alpha: ovNum('ovTileAlpha', 45, 0, 100) / 100,
        };
        c.bgKey = [z, left, top, sc, c.mw, c.mh, c.rad, c.tiles.filter, c.tiles.alpha].join('|');
        c.bg = ovBgCache.has(c.bgKey) ? ovBgCache.get(c.bgKey) : null;
      }
    }
  }
  // Lage der beiden Kästen: Karte bei (mx0, my0), Werte bei (bx0, by0)
  if (!c.map) c.mw = c.mh = 0;
  const gap = c.map && c.bh ? 12 * s : 0;
  c.mx0 = c.my0 = c.bx0 = c.by0 = 0;
  if (c.mapPos === 'side') c.bx0 = c.mw + gap;
  else if (c.mapPos === 'bottom') c.my0 = c.bh + gap;
  else c.by0 = c.mh + gap;
  c.W = c.mapPos === 'side' ? c.bx0 + c.BW : Math.max(c.mw, c.BW);
  c.H = c.mapPos === 'side' ? Math.max(c.mh, c.bh) : c.mh + gap + c.bh;
  c.empty = !c.bh && !c.map;

  if (c.profile) {
    const st = state.stages[si], stage = c.scope === 'stage';
    const d0 = T.dist[stage ? st.start : 0], d1 = T.dist[stage ? st.start + st.track.n - 1 : T.n - 1];
    const n = Math.round(c.pw / s), ys = new Float64Array(n + 1);
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k <= n; k++) {
      const p = locate(T.dist, d0 + (d1 - d0) * k / n), j = Math.min(p.i + 1, T.n - 1);
      ys[k] = T.ele[p.i] + p.f * (T.ele[j] - T.ele[p.i]);
      lo = Math.min(lo, ys[k]); hi = Math.max(hi, ys[k]);
    }
    if (hi - lo < 20) hi = lo + 20;
    c.prof = {d0, d1, ys, lo, hi};
  }
  return c;
}

// Kartenhintergrund: OpenStreetMap-Kacheln, je nach Stil entfärbt oder abgedunkelt, blass in den Kasten der Karte gelegt.
// Wird je Ausschnitt einmal gebaut; false = Kacheln nicht ladbar.
const ovBgCache = new Map(), ovTileCache = new Map();
function ovTile(path) {
  if (!ovTileCache.has(path)) {
    ovTileCache.set(path, new Promise((res, rej) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // sonst lässt sich die Zeichenfläche nicht mehr als PNG speichern
      img.onload = () => res(img);
      img.onerror = () => { ovTileCache.delete(path); rej(new Error('Kachel ' + path)); };
      img.src = 'https://tile.openstreetmap.org/' + path + '.png';
    }));
  }
  return ovTileCache.get(path);
}
// true, wenn dabei ein Hintergrund neu entstanden ist
async function ovMapBg(c) {
  if (!c || !c.map || !c.tiles || c.bg !== null) return false;
  const t = c.tiles, n = 2 ** t.z, jobs = [];
  const raw = document.createElement('canvas');
  raw.width = c.mw; raw.height = c.mh;
  const rg = raw.getContext('2d');
  for (let ty = t.ty0; ty <= t.ty1; ty++) for (let tx = t.tx0; tx <= t.tx1; tx++) {
    if (ty < 0 || ty >= n) continue;
    // auf ganze Pixel legen, damit zwischen den Kacheln keine Nähte entstehen
    const x = Math.round(t.px(tx)), y = Math.round(t.py(ty));
    jobs.push(ovTile(`${t.z}/${((tx % n) + n) % n}/${ty}`).then(
      img => { rg.drawImage(img, x, y, Math.round(t.px(tx + 1)) - x, Math.round(t.py(ty + 1)) - y); return 1; }, () => 0));
  }
  const ok = (await Promise.all(jobs)).reduce((a, b) => a + b, 0);
  let bg = false;
  if (ok) {
    bg = document.createElement('canvas');
    bg.width = c.mw; bg.height = c.mh;
    const g = bg.getContext('2d');
    g.beginPath(); g.roundRect(0, 0, c.mw, c.mh, c.rad); g.clip();
    g.filter = t.filter;
    g.globalAlpha = t.alpha;
    g.drawImage(raw, 0, 0);
  }
  if (ovBgCache.size > 12) ovBgCache.clear();
  ovBgCache.set(c.bgKey, bg);
  c.bg = bg;
  return true;
}

// Zeichnet ein Bild; gibt eine Signatur zurück, an der gleiche Bilder erkannt werden
function ovKey(r, c) {
  const texts = c.blocks.map(b => b.f.val(r, c));
  const mx = c.profile ? Math.round(Math.min(1, Math.max(0, (r.dist - c.prof.d0) / (c.prof.d1 - c.prof.d0 || 1))) * c.pw * 2) / 2 : 0;
  const mp = c.map ? (r.lat == null ? c.mp.pts[0] : c.mp.at(r.lat, r.lon)).map(v => Math.round(v * 2) / 2) : [0, 0];
  const nx = c.next ? nf1.format(Math.max(0, c.next.dist - r.dist) / 1000) : '';
  return {texts, mx, mp, nx, md: r.dist, key: texts.join('|') + '|' + mx + '|' + mp + '|' + nx};
}

function ovDraw(canvas, r, c, k = ovKey(r, c)) {
  const s = c.s, u = c.u, pad = c.pad;
  canvas.width = c.W; canvas.height = c.H;
  const g = canvas.getContext('2d');
  const shadow = on => { g.shadowColor = on && c.shadow ? 'rgba(0,0,0,.55)' : 'transparent'; g.shadowBlur = 5 * s; g.shadowOffsetY = s; };
  const panel = (w, h) => { if (c.box) { g.beginPath(); g.roundRect(0, 0, w, h, c.rad); g.fillStyle = c.bgFill; g.fill(); } };
  if (c.map) {
    // Karte: ganzer Track in der Streckenfarbe, der gefahrene Teil in der Akzentfarbe, Punkt an der aktuellen Stelle
    const {pts, ds} = c.mp, [px, py] = k.mp;
    g.save();
    g.translate(c.mx0, c.my0);
    panel(c.mw, c.mh);
    if (c.bg) {
      g.drawImage(c.bg, 0, 0);
    }
    if (c.bg && $('ovAttr').checked) {
      // Quellenangabe, die OpenStreetMap für die Kartendaten verlangt
      g.font = c.fontU.replace(/[\d.]+px/, 10 * s + 'px'); g.textAlign = 'right'; g.fillStyle = rgba(c.text, 0.6);
      g.fillText('© OpenStreetMap', c.mw - 8 * s, c.mh - 7 * s);
    }
    g.lineWidth = c.line; g.lineJoin = g.lineCap = 'round';
    shadow(true);
    g.beginPath();
    pts.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1]));
    g.strokeStyle = rgba(c.base, 0.9); g.stroke();
    shadow(false);
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length && ds[i] <= k.md; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineTo(px, py);
    g.strokeStyle = c.accent; g.stroke();
    shadow(true);
    g.font = c.fontM; g.fillStyle = c.text;
    for (const l of c.mp.labels) {
      g.beginPath(); g.arc(l.p[0], l.p[1], 3.5 * s, 0, Math.PI * 2); g.fill();
      g.textAlign = l.left ? 'right' : 'left';
      g.fillText(l.name, l.p[0] + (l.left ? -14 : 14) * s, Math.max(14 * u, Math.min(c.mh - 6 * s, l.p[1] + 5 * u)));
    }
    g.beginPath(); g.arc(px, py, 7 * s, 0, Math.PI * 2);
    g.fillStyle = c.accent; g.fill();
    g.lineWidth = 3 * s; g.strokeStyle = c.base; g.stroke();
    g.restore();
  }
  if (!c.bh) return;
  g.translate(c.bx0, c.by0);
  shadow(false);
  panel(c.BW, c.bh);
  shadow(true);
  c.blocks.forEach((b, n) => {
    g.textAlign = 'left';
    if (b.f.id === 'place') {
      // Ortssymbol: Tropfen mit Loch, daneben der Name
      const R = 8 * u, cx = b.x + R, cy = b.y - 17 * u;
      g.beginPath();
      g.arc(cx, cy, R, Math.PI - 0.5, 0.5); g.lineTo(cx, cy + 2.3 * R); g.closePath();
      g.moveTo(cx + R * 0.4, cy); g.arc(cx, cy, R * 0.4, 0, Math.PI * 2);
      g.fillStyle = c.accent; g.fill('evenodd');
      g.font = c.fontP; g.fillStyle = c.text;
      g.fillText(k.texts[n], b.x + 26 * u, b.y, c.placeW);
      if (c.next) {
        // kleiner Pfeil beim Ortssymbol, daneben nächster Ort und Entfernung
        const ay = b.ny - 7 * u, ax = b.x + 16 * u;
        g.beginPath(); g.moveTo(b.x + 2 * u, ay); g.lineTo(ax, ay); g.moveTo(ax - 5 * u, ay - 5 * u); g.lineTo(ax, ay); g.lineTo(ax - 5 * u, ay + 5 * u);
        g.strokeStyle = g.fillStyle = c.textDim; g.lineWidth = 2 * u; g.stroke();
        g.font = c.fontL;
        g.fillText(`${c.next.name} · ${k.nx} km`, b.x + 26 * u, b.ny, c.placeW);
      }
      return;
    }
    g.fillStyle = c.textDim;
    if (c.labels) {
      g.font = c.fontL;
      g.fillText(c.lab(b.f), b.x, b.ly);
    }
    g.font = c.fontU;
    g.fillText(b.f.unit, b.ux, b.y);
    g.textAlign = 'right';
    g.font = c.fontV; g.fillStyle = c.text;
    g.fillText(k.texts[n], b.vx, b.y);
  });
  if (!c.profile) return;

  const {ys, lo, hi} = c.prof, n = ys.length - 1, base = c.py + c.ph;
  const X = i => pad + i / n * c.pw, Y = e => base - 3 * s - (e - lo) / (hi - lo) * (c.ph - 14 * s);
  const trace = close => {
    g.beginPath();
    for (let i = 0; i <= n; i++) g[i ? 'lineTo' : 'moveTo'](X(i), Y(ys[i]));
    if (close) { g.lineTo(pad + c.pw, base); g.lineTo(pad, base); g.closePath(); }
  };
  trace(true); g.fillStyle = rgba(c.base, 0.32); g.fill();
  shadow(false);
  g.save();
  g.beginPath(); g.rect(pad, c.py - 20 * s, k.mx, c.ph + 40 * s); g.clip();
  trace(true); g.fillStyle = c.accent; g.fill();
  g.restore();
  shadow(true);
  trace(false); g.strokeStyle = c.base; g.lineWidth = 2 * s; g.lineJoin = 'round'; g.stroke();
  // Position: auf der Profillinie, nicht auf dem Messwert, damit der Punkt nicht neben der Kurve sitzt
  const fi = k.mx / c.pw * n, i0 = Math.min(n - 1, Math.floor(fi));
  const my = Y(ys[i0] + (fi - i0) * (ys[i0 + 1] - ys[i0]));
  g.beginPath(); g.arc(pad + k.mx, my, 7 * s, 0, Math.PI * 2);
  g.fillStyle = c.accent; g.fill();
  g.lineWidth = 3 * s; g.stroke();
}

function ovRender() {
  const c = ov.cfg, canvas = $('ovCanvas');
  if (!c || c.error || c.empty) { canvas.width = 300; canvas.height = 40; $('ovTime').textContent = ''; return; }
  const tau = Math.min(c.dur, +$('ovSlider').value);
  ovDraw(canvas, ovSample(c, tau), c);
  // Vorschau in 1080p-Größe anzeigen, auch wenn für 4K gerendert wird
  canvas.style.width = c.W / c.s + 'px';
  $('ovTime').textContent = tau.toFixed(1).replace('.', ',') + ' s';
}

function ovRefresh() {
  $('ovScopeWrap').hidden = !multi();
  // Werte, die die Datei nicht enthält, lassen sich nicht einblenden
  const T = state.track;
  if (T) {
    const has = {place: T.hasGps, moving: !!T.t, elapsed: !!T.t, clock: !!T.t, avg: !!T.t, speed: T.speed.some(v => v != null), hr: T.hr.some(v => v != null), temp: T.temp.some(v => v != null), grade: T.hasEle, ele: T.hasEle, asc: T.hasEle};
    for (const f of OV_FIELDS) $('ovf_' + f.id).disabled = has[f.id] === false;
    $('ovProfile').disabled = !T.hasEle;
    $('ovMap').disabled = $('ovTiles').disabled = $('ovAttr').disabled = !T.hasGps;
  }
  // Schmale Schnitte gibt es nur bei Open Sans; sonst auf den gleich starken normalen Schnitt ausweichen
  const os = $('ovFont').value === 'Open Sans', wsel = $('ovWeight');
  for (const o of wsel.options) if (o.value[0] === 'c') o.disabled = !os;
  if (!os && wsel.value[0] === 'c') wsel.value = wsel.value.slice(1);
  try {
    localStorage.setItem('sectionviewer.overlay', JSON.stringify(ovSettings(OV_SAVED)));
  } catch {}
  const c = ov.cfg = ovConfig();
  if (!c) return;
  const place = $('ovPlace');
  place.disabled = !!c.error || !placeKey(c.r0);
  if (place !== document.activeElement) place.value = c.error ? '' : c.place;
  if (!c.error) ovFonts(c).then(fresh => { if (fresh && ov.cfg === c) ovRefresh(); });
  if (!c.error) ovMapBg(c).then(fresh => { if (fresh && ov.cfg === c) ovRefresh(); });
  const slider = $('ovSlider');
  if (c.error) $('ovInfo').textContent = c.error;
  else if (c.empty) $('ovInfo').textContent = 'Nichts ausgewählt.';
  else {
    slider.max = c.dur;
    if (+slider.value > c.dur) slider.value = c.dur;
    const r = c.r0;
    $('ovInfo').textContent = `Start bei km ${nf1.format(r.dist / 1000)}` + (multi() ? ` (Tag ${r.stage})` : '') + (r.clock != null ? `, ${fmtClock(r.clock)} Uhr` : '') +
      ` · ${nf0.format(c.frames)} ${c.frames === 1 ? 'Bild' : 'Bilder'} · ${c.W} × ${c.H} px` +
      (!state.track.t ? ' · Datei ohne Zeitangaben: nur Einzelbild möglich' : c.clamped ? ` · auf ${c.dur.toFixed(1).replace('.', ',')} s gekürzt (Etappenende)` : '') +
      (c.bg === false ? ' · Kartenhintergrund konnte nicht geladen werden' : '') +
      (fontAvailable(c.fam) ? '' : ` · ${c.fam} nicht verfügbar (offline und nicht installiert) – Ersatzschrift wird verwendet`);
  }
  ovRender();
}

// Lädt die benötigten Schriftschnitte; true, wenn dabei etwas neu geladen wurde
async function ovFonts(c) {
  let fresh = false;
  const words = OV_FIELDS.map(f => f.label + f.unit).join('');
  const base = '0123456789,:–- ' + words + words.toUpperCase();
  // Der Ortsname kann Zeichen aus einem weiteren Teil der Schrift brauchen (z. B. ł, č)
  for (const [spec, text] of [[c.fontV, base], [c.fontL, base], [c.fontU, base], ...(c.place ? [[c.fontP, c.place]] : []), ...(c.next ? [[c.fontL, c.next.name]] : []),
    ...(c.map && c.mp.labels.length ? [[c.fontU, c.mp.labels.map(l => l.name).join('')]] : [])]) {
    const id = spec + '|' + text;
    if (ov.fonts.has(id)) continue;
    try { await document.fonts.load(spec, text); } catch {}
    ov.fonts.add(id);
    fresh = true;
  }
  return fresh;
}
// Läuft vor dem Auffrischen unten, weil das Ereignis erst danach zur Karte aufsteigt
$('ovPlace').addEventListener('input', ev => {
  const c = ov.cfg, key = c && !c.error && placeKey(c.r0);
  if (key) setPlace(key, ev.target.value.trim());
});
$('ovCard').addEventListener('input', ev => { if (ev.target.id === 'ovSlider') ovRender(); else ovRefresh(); });

$('ovPlay').addEventListener('click', () => {
  const btn = $('ovPlay'), slider = $('ovSlider'), c = ov.cfg;
  const stop = () => { cancelAnimationFrame(ov.raf); ov.raf = 0; btn.textContent = '▶'; };
  if (ov.raf) { stop(); return; }
  if (!c || c.error || !c.dur) return;
  const from = +slider.value >= c.dur ? 0 : +slider.value, t0 = performance.now();
  btn.textContent = '❚❚';
  const tick = () => {
    const cur = ov.cfg, tau = from + (performance.now() - t0) / 1000;
    if (!cur || cur.error || tau >= cur.dur) { if (cur && !cur.error) { slider.value = cur.dur; ovRender(); } stop(); return; }
    slider.value = tau;
    ovRender();
    ov.raf = requestAnimationFrame(tick);
  };
  ov.raf = requestAnimationFrame(tick);
});

