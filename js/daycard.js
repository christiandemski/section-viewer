'use strict';

// Tageskarte: bildfüllende Zwischenkarte (16:9) für Videos, je Tag oder für die ganze Tour, mit Start → Ziel,
// Kennzahlen, Strecke und Höhenprofil. Daten und Kennzahlen kommen aus dem Story-Creator (pcData, PC_STATS).
const DC_RES = {'4k': [3840, 2160], hd: [1920, 1080]};
// Start → Ziel braucht keine GPS-Daten, wenn die Orte von Hand eingetragen sind
const DC_PARTS = [['route', 'Strecke', 'gps'], ['profile', 'Höhenprofil', 'ele'], ['date', 'Datum', 'time'], ['places', 'Start → Ziel']];
const DC_ON = ['dist', 'asc', 'moving'];
$('dcChecks').innerHTML = DC_PARTS.map(([id, label]) => `<label><input type="checkbox" id="dc_${id}" checked>${label}</label>`).join('') +
  PC_STATS.map(f => `<label><input type="checkbox" id="dcs_${f.id}"${DC_ON.includes(f.id) ? ' checked' : ''}>${bySport(f).label}</label>`).join('');
$('dcFont').innerHTML = $('ovFont').innerHTML;

// Gestaltung je Sportart merken; Titel, Untertitel, Start und Ziel gehören zur Tour und stehen nur in der Session
const DC_SAVED = ['dcLayout', 'dcRes', 'dcBg', 'dcBgCol', 'dcDim', 'dcFont', 'dcAccent', 'dcText', 'dcItalic', 'dcUpper', 'dcAnim', 'dcDur',
  ...DC_PARTS.map(p => 'dc_' + p[0]), ...PC_STATS.map(f => 'dcs_' + f.id)];
const DC_TEXTS = ['dcTitle', 'dcSub', 'dcFrom', 'dcTo'];
const DC_DEFAULTS = defaultsOf(DC_SAVED);
const DC_SPORT = {ride: {dcFont: 'Open Sans'}, run: {dcFont: 'Barlow Condensed', dcItalic: true, dcUpper: true, dcAccent: '#ff5a3c'},
  hike: {dcFont: 'Barlow', dcAccent: '#9ccc65', dcText: '#f4f1e8', dcBgCol: '#16261b'}};
const dcStore = () => sportKey('sectionviewer.daycard');
const dcSettings = () => Object.fromEntries(DC_SAVED.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]));
function dcLoadStored() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(dcStore())); } catch {}
  ovApply({...DC_DEFAULTS, ...DC_SPORT[state.sport]}, DC_SAVED);
  if (saved && typeof saved === 'object') ovApply(saved, DC_SAVED);
}
dcLoadStored();
function dcSportChanged(design) {
  for (const f of PC_STATS) $('dcs_' + f.id).nextSibling.textContent = bySport(f).label;
  if (design) dcLoadStored();
}

const dc = {photo: null, raf: 0, fonts: new Set(), busy: false, placeRun: 0, play: 0, cancel: false, animEnd: 0};
const dcDur = () => +$('dcDur').value || 6;
const dcAnimated = () => $('dcAnim').checked;
// Start und Dauer (s) je Element: Titel, Orte, Datum, dann Strecke und Profil, dann die Werte nacheinander
function dcTimeline(n, route, profile) {
  const T = {title: [0.2, 0.6], place: [0.45, 0.7], date: [0.7, 0.6], route: [0.8, 2.2], profile: [1.2, 1.6]};
  const s0 = route || profile ? 1.8 : 1.1;
  for (let i = 0; i < n; i++) { T['stat' + i] = [s0 + i * 0.3, 0.6]; T['count' + i] = [s0 + i * 0.3, 1.4]; }
  return T;
}

// Erster und letzter Punkt mit Koordinaten im Abschnitt ('tour' oder Index der Etappe)
function dcEnds(sc) {
  const T = state.track, st = sc === 'tour' ? null : state.stages[+sc];
  const a = st ? st.start : 0, b = st ? st.start + st.track.n - 1 : T.n - 1, gps = i => T.lat[i] != null && T.lon[i] != null;
  let i = a, j = b;
  while (i <= b && !gps(i)) i++;
  while (j >= a && !gps(j)) j--;
  return i > b ? [] : [{lat: T.lat[i], lon: T.lon[i]}, {lat: T.lat[j], lon: T.lon[j]}];
}

// Daten des Story-Creators, dazu Titel und Orte; own: Titel, Start und Ziel aus den Eingabefeldern übernehmen
function dcData(sc, own = true) {
  const d = pcData(sc), [p0, p1] = dcEnds(sc), field = id => own ? $(id).value.trim() : '';
  d.auto = {title: multi() && sc !== 'tour' ? 'Tag ' + (+sc + 1) : 'Tour', from: p0 ? placeOf(p0) : '', to: p1 ? placeOf(p1) : ''};
  d.title = field('dcTitle') || d.auto.title;
  d.from = field('dcFrom') || d.auto.from;
  d.to = field('dcTo') || d.auto.to;
  d.sub = $('dcSub').value.trim();
  return d;
}
// Alle Texte einer Karte, damit die Schrift die nötigen Zeichen vorab lädt
const dcChars = d => { const t = [d.title, d.from, d.to, d.sub, d.date || ''].join(''); return t + t.toUpperCase(); };

// Zeichnet in einem Raster von 1920 × 1080; bei 4K wird nur skaliert, damit beide Größen gleich aussehen
// t: Zeit in der Animation (s) oder null für die fertige Karte
function dcDraw(cv, d, res = $('dcRes').value, t = null) {
  const [W, H] = DC_RES[res] || DC_RES['4k'], u = W / 1920, GW = 1920, GH = 1080;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.setTransform(u, 0, 0, u, 0, 0);
  // Ziffern und Ortsnamen im schmalen Schnitt; den gibt es nur bei Open Sans
  const fam = ovFontStack($('dcFont').value), it = $('dcItalic').checked ? 'italic ' : '', nar = $('dcFont').value === 'Open Sans' ? 'condensed ' : '';
  const font = (w, px, narrow) => `${it}${narrow ? nar : ''}${w} ${px.toFixed(1)}px ${fam}`;
  const up = t => $('dcUpper').checked ? t.toUpperCase() : t;
  const text = $('dcText').value, accent = $('dcAccent').value, bg = $('dcBg').value, layout = $('dcLayout').value;
  const width = (spec, t) => { g.font = spec; return g.measureText(t).width; };
  // Schriftgröße, bei der t höchstens max breit ist
  const fit = (w, px, narrow, t, max) => Math.min(px, px * max / (width(font(w, px, narrow), t) || 1));

  if (bg === 'color') { g.fillStyle = $('dcBgCol').value; g.fillRect(0, 0, GW, GH); }
  if (bg === 'photo' && dc.photo) {
    // Foto füllt das Bild, Überstand wird mittig abgeschnitten; gleichmäßig abgedunkelt, weil die Schrift überall stehen kann
    const p = dc.photo, sc = Math.max(GW / p.width, GH / p.height);
    g.drawImage(p, (GW - p.width * sc) / 2, (GH - p.height * sc) / 2, p.width * sc, p.height * sc);
    const dim = ovNum('dcDim', 45, 0, 90) / 100;
    if (dim) { g.fillStyle = `rgba(0,0,0,${dim})`; g.fillRect(0, 0, GW, GH); }
  }
  // Auf Foto und transparent hilft ein Schatten der Lesbarkeit; Schatten werden nicht mitskaliert
  const shadow = on => { g.shadowColor = on && bg !== 'color' ? 'rgba(0,0,0,.45)' : 'transparent'; g.shadowBlur = 16 * u; g.shadowOffsetY = 2 * u; };
  // Teile ohne Daten entfallen; unabhängig vom gerade gewählten Abschnitt, damit es auch für den ZIP-Export stimmt
  const on = ([id, , need]) => $('dc_' + id).checked && (!need || d.has[need]);
  const [route, profile, date, places] = DC_PARTS.map(on);
  const stats = PC_STATS.filter(f => $('dcs_' + f.id).checked && (!f.need || d.has[f.need])).map(bySport).slice(0, 4);
  const title = d.title.toUpperCase(), from = places ? up(d.from) : '', to = places ? up(d.to) : '';
  const line2 = [date && d.date, d.sub].filter(Boolean).join(' · ');
  // Animation: Fortschritt je Element; Einblenden mit Deckkraft und kleinem Versatz nach oben
  const TL = dcTimeline(stats.length, route, profile);
  dc.animEnd = Math.max(...Object.values(TL).map(([s, l]) => s + l));
  const A = k => { if (t == null) return 1; const e = TL[k]; return e ? (t - e[0]) / e[1] : 1; };
  const reveal = (key, fn) => {
    const e = ease(A(key));
    if (e <= 0) return;
    g.save(); g.globalAlpha = e; g.translate(0, (1 - e) * 30); fn(); g.restore();
  };

  // Bausteine für einen senkrechten Stapel: asc/desc = Ausdehnung über und unter der Grundlinie
  const textItem = (k, t, w, px, color, max, x, align = 'left') => {
    const p = fit(w, px, false, t, max);
    return {k, asc: p * 0.72, desc: p * 0.22, draw: y => { g.font = font(w, p); g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y); }};
  };
  // Ortszeile: Namen im schmalen Schnitt, davor bzw. dazwischen ein gezeichneter Pfeil (nicht jede Schrift hat →)
  const placeW = (a, b, px) => (a ? width(font(800, px, true), a) : 0) + (b ? px * (a ? 0.95 : 0.75) + width(font(800, px, true), b) : 0);
  const placeItem = (a, b, px, max, x, align = 'left') => {
    const p = Math.min(px, px * max / (placeW(a, b, px) || 1)), w = placeW(a, b, p);
    return {k: 'place', asc: p * 0.72, desc: p * 0.22, draw: y => {
      let cx = align === 'center' ? x - w / 2 : x;
      g.textAlign = 'left'; g.font = font(800, p, true); g.fillStyle = text;
      if (a) { g.fillText(a, cx, y); cx += g.measureText(a).width + (b ? p * 0.2 : 0); }
      if (!b) return;
      const m = y - p * 0.36, l = p * 0.55, h = p * 0.17;
      g.beginPath(); g.moveTo(cx, m); g.lineTo(cx + l, m); g.moveTo(cx + l - h, m - h); g.lineTo(cx + l, m); g.lineTo(cx + l - h, m + h);
      g.lineWidth = p * 0.08; g.lineCap = g.lineJoin = 'round'; g.strokeStyle = accent; g.stroke();
      g.fillText(b, cx + p * 0.75, y);
    }};
  };
  // Kennzahlen nebeneinander: Wert groß, Einheit in der Akzentfarbe, Art klein darunter; alle Werte gleich groß,
  // so dass der breiteste in seine Spalte passt
  const statsItem = (x, w, vmax, cmax, center) => {
    const cw = Math.min(cmax, w / stats.length);
    let vpx = vmax;
    for (const f of stats) {
      const [v, un] = f.val(d), at = width(font(800, vmax, true), v) + (un ? vmax * 0.08 + width(font(600, vmax * 0.4), un) : 0);
      vpx = Math.min(vpx, vmax * (cw - 40) / (at || 1));
    }
    const lab = vpx * 0.28, x0 = center ? GW / 2 - stats.length * cw / 2 : x;
    return {k: 'stats', own: true, asc: vpx * 0.72, desc: vpx * 0.2 + lab * 1.22, draw: y => stats.forEach((f, n) => reveal('stat' + n, () => {
      const [v, un] = f.val(pcScaled(d, ease(A('count' + n)))), cx = x0 + n * cw;
      const vw = width(font(800, vpx, true), v), uw = un ? vpx * 0.08 + width(font(600, vpx * 0.4), un) : 0;
      const vx = center ? cx + (cw - vw - uw) / 2 : cx;
      g.textAlign = 'left';
      g.font = font(800, vpx, true); g.fillStyle = text; g.fillText(v, vx, y);
      if (un) { g.font = font(600, vpx * 0.4); g.fillStyle = accent; g.fillText(un, vx + vw + vpx * 0.08, y); }
      g.font = font(400, lab); g.fillStyle = rgba(text, 0.7); g.textAlign = center ? 'center' : 'left';
      g.fillText(up(f.label), center ? cx + cw / 2 : cx, y + vpx * 0.2 + lab, cw - 20);
    }))};
  };
  const profileItem = (x, w, h) => ({k: 'profile', own: true, asc: 0, desc: h, draw: y => {
    const p = ease(A('profile'));
    if (p <= 0) return;
    g.save();
    g.beginPath(); g.rect(x - 10, y - 20, (w + 20) * p, h + 40); g.clip();
    const ys = d.prof, n = ys.length - 1;
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 20) hi = lo + 20;
    const X = k => x + k / n * w, Y = e => y + h - (e - lo) / (hi - lo) * h;
    const trace = () => { g.beginPath(); ys.forEach((e, k) => g[k ? 'lineTo' : 'moveTo'](X(k), Y(e))); };
    shadow(false);
    trace(); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
    g.fillStyle = rgba(accent, 0.28); g.fill();
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.lineWidth = 2; g.strokeStyle = rgba(text, 0.4); g.stroke();
    shadow(true);
    trace(); g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = accent; g.stroke();
    g.restore();
  }});
  // Stapelt die Bausteine mittig um mid; Abstände je nach Nachbar aus G (vorher>nachher, sonst nach dem Baustein)
  const stack = (items, mid, G) => {
    if (!items.length) return;
    const adv = items.map((it, k) => k ? items[k - 1].desc + (G[items[k - 1].k + '>' + it.k] ?? G[it.k] ?? 40) + it.asc : 0);
    let y = mid - (items[0].asc + adv.reduce((a, b) => a + b, 0) + items.at(-1).desc) / 2 + items[0].asc;
    items.forEach((it, k) => {
      y += adv[k];
      shadow(true);
      // Werte und Profil steuern ihre Animation selbst
      if (it.own) it.draw(y); else { const yy = y; reveal(it.k, () => it.draw(yy)); }
    });
  };

  // Strecke: Seitenverhältnis beibehalten und im Feld zentriert; dunkle Kontur unter der Linie
  const drawRoute = (x, y, w, h, lw) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of d.route) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const m = lw * 2, sc = Math.min((w - 2 * m) / Math.max(x1 - x0, 1e-12), (h - 2 * m) / Math.max(y1 - y0, 1e-12));
    const ox = x + (w - (x1 - x0) * sc) / 2, oy = y + (h - (y1 - y0) * sc) / 2;
    const P = d.route.map(([px, py]) => [ox + (px - x0) * sc, oy + (py - y0) * sc]);
    const pr = ease(A('route'));
    if (pr <= 0) return;
    const k = Math.max(1, Math.round(pr * (P.length - 1)));
    const path = j => { g.beginPath(); for (let i = 0; i <= j; i++) g[i ? 'lineTo' : 'moveTo'](P[i][0], P[i][1]); };
    g.save();
    g.lineJoin = g.lineCap = 'round';
    if (k < P.length - 1) { shadow(false); path(P.length - 1); g.lineWidth = lw; g.strokeStyle = rgba(text, 0.22 * Math.min(1, pr * 3)); g.stroke(); }
    path(k);
    shadow(true);
    g.lineWidth = lw * 1.9; g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
    shadow(false);
    g.lineWidth = lw; g.strokeStyle = accent; g.stroke();
    const dot = (p, fill, ring) => {
      g.beginPath(); g.arc(p[0], p[1], lw * 1.3, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill(); g.lineWidth = lw * 0.6; g.strokeStyle = ring; g.stroke();
    };
    dot(P[0], '#ffffff', accent);
    dot(P[k], accent, '#ffffff');
    g.restore();
  };

  // Ränder mindestens 150 links und rechts, 120 oben und unten (Title-Safe)
  if (layout === 'center') {
    const items = [textItem('title', title, 700, 48, accent, 1620, GW / 2, 'center')];
    if (from || to) items.push(placeItem(from, to, 150, 1620, GW / 2, 'center'));
    if (line2) items.push(textItem('date', line2, 500, 42, rgba(text, 0.85), 1620, GW / 2, 'center'));
    if (stats.length) items.push(statsItem(150, 1620, 110, 420, true));
    if (profile) items.push(profileItem(360, 1200, 90));
    stack(items, 618, {'title>place': 51, 'place>date': 17, 'title>date': 28, 'date>stats': 162, 'place>stats': 140, 'title>stats': 120, profile: 60});
  } else if (layout === 'map') {
    // Ohne Strecke rückt die Leiste in die Mitte
    const mid = route ? 876 : GH / 2, lw = stats.length ? 870 : 1620;
    if (route) drawRoute(180, 120, 1560, 600, 10);
    const items = [textItem('title', title, 700, 40, accent, lw, 150)];
    if (from || to) items.push(placeItem(from, to, 84, lw, 150));
    if (line2) items.push(textItem('date', line2, 500, 34, rgba(text, 0.85), lw, 150));
    stack(items, mid, {'title>place': 12, 'place>date': 12, 'title>date': 14});
    if (stats.length) {
      const S = statsItem(1060, 710, 76, 240, false);
      shadow(true);
      S.draw(mid - (S.asc + S.desc) / 2 + S.asc);
    }
  } else {
    // Ohne Strecke nutzt die linke Spalte die ganze Breite
    const x = 150, w = route ? 860 : 1620, items = [textItem('title', title, 700, 44, accent, w, x)];
    if (from) items.push(placeItem(from, '', 104, w, x));
    if (to) items.push(placeItem('', to, 104, w, x));
    if (line2) items.push(textItem('date', line2, 500, 38, rgba(text, 0.85), w, x));
    if (stats.length) items.push(statsItem(x, route ? 900 : 1620, 96, 300, false));
    if (profile) items.push(profileItem(x, w, 130));
    stack(items, 579, {'title>place': 35, 'place>place': 12, 'place>date': 20, 'title>date': 24, 'date>stats': 93, 'place>stats': 80, 'title>stats': 70,
      'stats>profile': 78, profile: 60});
    if (route) drawRoute(1130, 170, 640, 740, 9);
  }
}

// Lädt die Schriftschnitte; true, wenn dabei etwas neu geladen wurde
async function dcFonts(chars) {
  const fam = ovFontStack($('dcFont').value), it = $('dcItalic').checked ? 'italic ' : '', nar = $('dcFont').value === 'Open Sans' ? 'condensed ' : '';
  const labels = PC_STATS.flatMap(f => [f, f.run || {}]).map(f => f.label || '').join('');
  const sample = '0123456789,.:–/· TAGOUR' + labels + labels.toUpperCase() + 'kmhinbpmÖÄÜäöüß' + chars;
  let fresh = false;
  for (const spec of [...[400, 500, 600, 700, 800].map(w => `${it}${w} 40px ${fam}`), `${it}${nar}800 40px ${fam}`]) {
    const id = spec + '|' + sample;
    if (dc.fonts.has(id)) continue;
    try { await document.fonts.load(spec, sample); } catch {}
    dc.fonts.add(id);
    fresh = true;
  }
  return fresh;
}

function dcRender() {
  dc.raf = 0;
  if (!state.track) return;
  const d = dcData($('dcScope').value);
  const why = (el, off) => { el.disabled = off; el.parentNode.title = off ? 'In dieser Datei nicht enthalten' : ''; };
  for (const [id, , need] of DC_PARTS) why($('dc_' + id), !!need && !d.has[need]);
  for (const f of PC_STATS) why($('dcs_' + f.id), !!f.need && !d.has[f.need]);
  // Vorschläge aus Tabelle und Abschnitt als Platzhalter
  $('dcTitle').placeholder = d.auto.title;
  $('dcFrom').placeholder = d.auto.from || 'Ort';
  $('dcTo').placeholder = d.auto.to || 'Ort';
  $('dcPlaces').hidden = !dc.placeRun && (!state.track.hasGps || !!(d.from && d.to));
  const anim = dcAnimated(), slider = $('dcSlider');
  $('dcPlayer').hidden = $('dcDurWrap').hidden = $('dcAnimSave').hidden = !anim;
  $('dcSave').classList.toggle('primary', !anim);
  // MP4 kennt keine Transparenz; transparent gibt es die Animation als PNG-Sequenz
  if (!dc.busy) $('dcAnimSave').textContent = $('dcBg').value === 'none' ? 'PNG-Sequenz speichern (ZIP)' : 'Video speichern (MP4)';
  if (+slider.max !== dcDur()) { slider.max = dcDur(); slider.value = dcDur(); }
  const t = anim ? Math.min(dcDur(), +slider.value) : null;
  $('dcTime').textContent = (t ?? 0).toFixed(1).replace('.', ',') + ' s';
  const cv = $('dcCanvas');
  dcDraw(cv, d, undefined, t);
  $('dcInfo').textContent = `${cv.width} × ${cv.height} px` + ($('dcBg').value === 'photo' && !dc.photo ? ' · noch kein Foto gewählt' : '');
  if (!dc.play) dcFonts(dcChars(d)).then(fresh => { if (fresh) dcRefresh(); });
}
function dcRefresh() {
  if (!state.track) return;
  const S = state.stages, sel = $('dcScope');
  if (sel.dataset.n !== String(S.length)) {
    const v = sel.value;
    sel.innerHTML = '<option value="tour">ganze Tour</option>' + S.map((s, k) => `<option value="${k}">Tag ${k + 1}</option>`).join('');
    sel.dataset.n = S.length;
    sel.value = [...sel.options].some(o => o.value === v) ? v : 'tour';
  }
  $('dcScopeWrap').hidden = $('dcZip').hidden = !multi();
  if (!multi()) sel.value = 'tour';
  try { localStorage.setItem(dcStore(), JSON.stringify(dcSettings())); } catch {}
  if (!dc.raf) dc.raf = requestAnimationFrame(dcRender);
}
$('dcCard').addEventListener('input', ev => {
  if (ev.target.id === 'dcPhoto') return;
  if (ev.target.id === 'dcSlider') { dcStop(); dcRender(); return; }
  dcRefresh();
});

// Vorschau abspielen; endet auf der fertigen Karte
function dcStop() { cancelAnimationFrame(dc.play); dc.play = 0; $('dcPlay').textContent = '▶'; $('dcPlay').setAttribute('aria-label', 'Animation abspielen'); }
$('dcPlay').addEventListener('click', () => {
  if (dc.play) { dcStop(); return; }
  const slider = $('dcSlider'), from = +slider.value >= dcDur() - 0.05 ? 0 : +slider.value, t0 = performance.now();
  $('dcPlay').textContent = '❚❚';
  $('dcPlay').setAttribute('aria-label', 'Animation anhalten');
  const tick = () => {
    const t = from + (performance.now() - t0) / 1000;
    slider.value = Math.min(t, dcDur());
    dcRender();
    if (t >= dcDur()) { dcStop(); return; }
    dc.play = requestAnimationFrame(tick);
  };
  dc.play = requestAnimationFrame(tick);
});

// Holt nur die Orte an Start und Ziel jeder Etappe (die der ganzen Tour sind darin enthalten)
$('dcPlaces').addEventListener('click', async ev => {
  const btn = ev.currentTarget, prog = $('dcPlaceProg');
  if (dc.placeRun) { dc.placeRun = 0; return; }
  const todo = [...new Set(state.stages.flatMap((s, k) => dcEnds(String(k))).filter(p => !placeOf(p)).map(placeKey))];
  if (!todo.length) { prog.textContent = 'Start und Ziel sind bereits eingetragen.'; return; }
  const run = dc.placeRun = Date.now(), label = btn.textContent;
  btn.textContent = 'Abbrechen';
  let found = 0;
  try {
    for (const [n, key] of todo.entries()) {
      prog.textContent = `Ort ${n + 1} von ${todo.length} …`;
      const name = await fetchPlace(key);
      if (dc.placeRun !== run) break;
      if (name && !(key in places)) { setPlace(key, name); found++; ovRefresh(); dcRefresh(); }
    }
    prog.textContent = dc.placeRun !== run ? 'Abgebrochen.' : `${found} von ${todo.length} Orten gefunden.`;
  } catch (e) {
    console.error(e);
    prog.textContent = 'Ortsabfrage fehlgeschlagen (offline oder Dienst nicht erreichbar).';
  } finally {
    if (dc.placeRun === run) dc.placeRun = 0;
    btn.textContent = label;
    dcRefresh();
  }
});

function dcSetPhoto(file) {
  const img = new Image();
  img.onload = () => {
    if (dc.photo) URL.revokeObjectURL(dc.photo.src);
    dc.photo = img;
    $('dcBg').value = 'photo';
    dcRefresh();
  };
  img.onerror = () => { URL.revokeObjectURL(img.src); $('dcInfo').textContent = `„${file.name}“ konnte nicht geladen werden.`; };
  img.src = URL.createObjectURL(file);
}
$('dcPhotoBtn').addEventListener('click', () => $('dcPhoto').click());
$('dcPhoto').addEventListener('change', ev => { if (ev.target.files[0]) dcSetPhoto(ev.target.files[0]); ev.target.value = ''; });

const dcName = sc => multi() ? 'tageskarte_' + (sc === 'tour' ? 'tour' : 'tag' + pad2(+sc + 1)) + '.png'
  : state.stages[0].name.replace(/\.[^.]+$/, '') + '_tageskarte.png';
$('dcSave').addEventListener('click', async () => {
  if (!state.track) return;
  const sc = $('dcScope').value, d = dcData(sc), cv = document.createElement('canvas');
  await dcFonts(dcChars(d));
  dcDraw(cv, d);
  download(await toPng(cv), dcName(sc));
});
// Jede Etappe in ein eigenes Bild; Titel, Start und Ziel aus den Feldern gelten nur für den gewählten Tag
$('dcZip').addEventListener('click', async ev => {
  if (!state.track || dc.busy) return;
  const btn = ev.currentTarget, label = btn.textContent, sel = $('dcScope').value, n = state.stages.length;
  dc.busy = btn.disabled = true;
  try {
    const list = state.stages.map((s, k) => dcData(String(k), String(k) === sel));
    btn.textContent = 'Schriften laden …';
    await dcFonts(list.map(dcChars).join(''));
    const cv = document.createElement('canvas'), files = [];
    for (const [k, d] of list.entries()) {
      btn.textContent = `Tag ${k + 1} von ${n} …`;
      dcDraw(cv, d);
      files.push({name: `tag${pad2(k + 1)}.png`, bytes: new Uint8Array(await (await toPng(cv)).arrayBuffer())});
    }
    download(makeZip(files), 'tageskarten.zip');
  } catch (e) {
    console.error(e);
    $('dcInfo').textContent = e.message || 'Export fehlgeschlagen.';
  } finally {
    dc.busy = btn.disabled = false;
    btn.textContent = label;
  }
});

// Animierte Karte des gewählten Abschnitts: MP4 bei Farbe oder Foto, PNG-Sequenz (mit Transparenz) bei transparentem Hintergrund
$('dcAnimSave').addEventListener('click', async ev => {
  const btn = ev.currentTarget, prog = $('dcProg');
  if (dc.busy) { if (dc.busy === btn) dc.cancel = true; return; }
  if (!state.track) return;
  dcStop();
  dc.busy = btn; dc.cancel = false;
  const label = btn.textContent;
  btn.textContent = 'Abbrechen';
  try {
    const sc = $('dcScope').value, d = dcData(sc), stem = dcName(sc).replace(/\.png$/, '');
    await dcFonts(dcChars(d));
    const frames = Math.round(dcDur() * PC_FPS), canvas = document.createElement('canvas');
    dcDraw(canvas, d);
    const step = i => { if (i % 10 === 0) prog.textContent = `Bild ${i + 1} von ${frames} …`; };
    if ($('dcBg').value === 'none') {
      // Nach dem Ende der Animation ändert sich nichts mehr; diese Bilder nicht neu rendern
      const files = [];
      let bytes = null;
      for (let i = 0; i < frames; i++) {
        if (dc.cancel) { prog.textContent = 'Abgebrochen.'; return; }
        const t = i / PC_FPS;
        if (!bytes || t <= dc.animEnd + 0.05) {
          dcDraw(canvas, d, undefined, t);
          bytes = new Uint8Array(await (await toPng(canvas)).arrayBuffer());
        } else if (i % 25 === 0) await new Promise(r => setTimeout(r));
        files.push({name: `${stem}/${stem}_${String(i).padStart(5, '0')}.png`, bytes});
        step(i);
      }
      prog.textContent = 'ZIP wird erstellt …';
      await new Promise(r => setTimeout(r));
      const zip = makeZip(files);
      download(zip, stem + '_sequenz.zip');
      prog.textContent = `${frames} Bilder gespeichert (${nf1.format(zip.size / 1048576)} MB).`;
    } else {
      const blob = await encodeMp4(canvas, {fps: PC_FPS, frames, draw: (cv, i) => dcDraw(cv, d, undefined, i / PC_FPS), progress: step, cancelled: () => dc.cancel});
      if (!blob) { prog.textContent = 'Abgebrochen.'; return; }
      download(blob, stem + '.mp4');
      prog.textContent = `Video gespeichert (${nf1.format(blob.size / 1048576)} MB).`;
    }
  } catch (e) {
    console.error(e);
    prog.textContent = e.message || 'Export fehlgeschlagen.';
  } finally {
    dc.busy = false;
    btn.textContent = label;
    dcRefresh();
  }
});
