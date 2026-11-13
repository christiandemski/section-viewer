'use strict';

// Story-Creator: ein Bild oder kurzes Video der Tour oder des Laufs für Beiträge und Stories, wahlweise
// transparent zum Darüberlegen, auf einem eigenen Foto, einer Farbe, einem Farbverlauf oder einer Karte.
// Das Foto bleibt im Browser.
const PC_FORMATS = {story: [1080, 1920], post: [1080, 1350], square: [1080, 1080]};
// Zeiten ab einer Stunde als h:mm, darunter als m:ss
function pcTime(s) {
  s = Math.round(s);
  return s >= 3600 ? [Math.floor(s / 3600) + ':' + pad2(Math.floor(s % 3600 / 60)), 'h'] : [Math.floor(s / 60) + ':' + pad2(s % 60), 'min'];
}
// need: Daten, ohne die der Wert entfällt (siehe d.has in pcData)
const PC_STATS = [
  {id: 'dist', label: 'Distanz', on: true, val: d => [isRun() && d.dist < 100000 ? fmtKm(d.dist, 2) : nf1.format(d.dist / 1000), 'km']},
  {id: 'asc', label: 'Höhenmeter', on: true, need: 'ele', val: d => [nf0.format(d.asc), 'hm']},
  {id: 'moving', label: 'Fahrzeit', on: true, need: 'time', val: d => pcTime(d.moving), run: {label: 'Laufzeit'}, hike: {label: 'Gehzeit'}},
  {id: 'avg', label: 'Ø Tempo', on: true, need: 'time', val: d => [nf1.format(d.dist / d.moving * 3.6), 'km/h'],
    run: {label: 'Ø Pace', val: d => [fmtPace(d.dist / d.moving), '/km']}},
  {id: 'elapsed', label: 'Gesamtzeit', need: 'time', val: d => pcTime(d.elapsed)},
  {id: 'hr', label: 'Ø Puls', need: 'hr', val: d => [nf0.format(d.hr), 'bpm']},
  {id: 'vam', label: 'Ø Aufstieg', need: 'vam', val: d => [nf0.format(d.asc / d.moving * 3600), 'hm/h']},
  {id: 'maxEle', label: 'Höchster Punkt', need: 'ele', val: d => [nf0.format(d.maxEle), 'm']},
];
const PC_PARTS = [['route', 'Strecke', 'gps'], ['profile', 'Höhenprofil', 'ele'], ['date', 'Datum', 'time'], ['places', 'Start → Ziel', 'gps']];
$('pcChecks').innerHTML = PC_PARTS.map(([id, label]) => `<label><input type="checkbox" id="pc_${id}" checked>${label}</label>`).join('') +
  PC_STATS.map(f => `<label><input type="checkbox" id="pcs_${f.id}"${f.on ? ' checked' : ''}>${bySport(f).label}</label>`).join('');
$('pcFont').innerHTML = $('ovFont').innerHTML;

// Gestaltung je Sportart merken, wie beim Overlay
const PC_SAVED = ['pcFormat', 'pcLayout', 'pcBg', 'pcBgCol', 'pcBgCol2', 'pcTileStyle', 'pcDim', 'pcFont', 'pcAccent', 'pcText', 'pcItalic', 'pcUpper',
  'pcAnim', 'pcDur', ...PC_PARTS.map(p => 'pc_' + p[0]), ...PC_STATS.map(f => 'pcs_' + f.id)];
const PC_DEFAULTS = defaultsOf(PC_SAVED);
const PC_SPORT = {ride: {pcFont: 'Montserrat'}, run: {pcFont: 'Barlow Condensed', pcItalic: true, pcUpper: true, pcAccent: '#ff5a3c', pcBgCol2: '#3a1712', pcBgCol: '#0e0f11'},
  hike: {pcFont: 'Barlow', pcAccent: '#9ccc65', pcText: '#f4f1e8', pcBgCol: '#16261b', pcBgCol2: '#3d5f3b', pcTileStyle: 'color', pcs_avg: false, pcs_maxEle: true}};
const pcStore = () => sportKey('sectionviewer.postcard');
const pcSettings = () => Object.fromEntries(PC_SAVED.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]));
const pc = {photo: null, raf: 0, fonts: new Set(), play: 0, busy: false, cancel: false, placeRun: 0, tiles: null};
function pcLoadStored() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(pcStore())); } catch {}
  ovApply({...PC_DEFAULTS, ...PC_SPORT[state.sport]}, PC_SAVED);
  if (saved && typeof saved === 'object') ovApply(saved, PC_SAVED);
  // Ohne gewähltes Foto nicht mit leerem Hintergrund starten
  if ($('pcBg').value === 'photo' && !pc.photo) $('pcBg').value = PC_DEFAULTS.pcBg;
}
pcLoadStored();
function pcSportChanged(design) {
  for (const f of PC_STATS) $('pcs_' + f.id).nextSibling.textContent = bySport(f).label;
  if (design) pcLoadStored();
}

const mercY = lat => { const p = lat * Math.PI / 180; return (1 - Math.log(Math.tan(p) + 1 / Math.cos(p)) / Math.PI) / 2; };

// Kennzahlen, Strecke und Profil für die ganze Tour oder einen Tag
function pcData(sc = $('pcScope').value) {
  const T = state.track, S = state.stages;
  const st = sc === 'tour' ? null : S[+sc] || null;
  const a = st ? st.start : 0, b = st ? st.start + st.track.n - 1 : T.n - 1;
  const d = {dist: T.dist[b] - T.dist[a], asc: state.asc[b] - state.asc[a], moving: 0, elapsed: 0, hr: null};
  if (T.t) {
    d.moving = T.moving[b] - T.moving[a];
    d.elapsed = (st ? [st] : S).reduce((x, s) => x + (s.track.t[s.track.n - 1] - s.track.t[0]) / 1000, 0);
    const f = {day: 'numeric', month: 'long', year: 'numeric'}, d0 = new Date(T.t[a]), d1 = new Date(T.t[b]);
    d.date = d0.toDateString() === d1.toDateString() ? d0.toLocaleDateString('de-DE', {weekday: 'long', ...f})
      : d0.toLocaleDateString('de-DE', f) + ' – ' + d1.toLocaleDateString('de-DE', f);
  }
  let hs = 0, hn = 0;
  for (let i = a; i <= b; i++) if (T.hr[i] != null) { hs += T.hr[i]; hn++; }
  if (hn) d.hr = hs / hn;
  if (T.hasEle) { d.maxEle = -Infinity; for (let i = a; i <= b; i++) if (T.ele[i] > d.maxEle) d.maxEle = T.ele[i]; }
  const idx = [];
  for (let i = a; i <= b; i++) if (T.lat[i] != null && T.lon[i] != null) idx.push(i);
  const stride = Math.max(1, Math.floor(idx.length / 1500));
  d.route = idx.filter((_, n) => n % stride === 0 || n === idx.length - 1).map(i => [(T.lon[i] + 180) / 360, mercY(T.lat[i])]);
  if (T.hasEle) {
    d.prof = [];
    for (let k = 0; k <= 300; k++) {
      const p = locate(T.dist, T.dist[a] + d.dist * k / 300), j = Math.min(p.i + 1, T.n - 1);
      d.prof.push(T.ele[p.i] + p.f * (T.ele[j] - T.ele[p.i]));
    }
  }
  // Start und Ziel aus den Ortsnamen der Tabelle; gleich = Rundtour
  const [p0, p1] = dcEnds(sc), from = p0 ? placeOf(p0) : '', to = p1 ? placeOf(p1) : '';
  d.places = from && to ? (from === to ? 'Rundtour ab ' + from : from + ' – ' + to) : from || to;
  d.placesKnown = !!(from && to);
  d.has = {gps: d.route.length > 1, ele: T.hasEle, time: !!T.t && d.moving > 0, hr: hn > 0, vam: T.hasEle && !!T.t && d.moving > 60};
  return d;
}

// ---------- Animation ----------
// Start und Dauer (s) je Element: erst der Kopf, dann Strecke und Profil, dann die Werte nacheinander
const PC_FPS = 30;
const pcDur = () => +$('pcDur').value || 8;
const pcAnimated = () => $('pcAnim').checked;
const ease = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
function pcTimeline(n, route, profile) {
  const T = {head: [0.2, 0.7], route: [0.8, 2.2], profile: [1.3, 1.8]};
  const s0 = route || profile ? 2.1 : 1.0;
  for (let i = 0; i < n; i++) { T['stat' + i] = [s0 + i * 0.3, 0.6]; T['count' + i] = [s0 + i * 0.3, 1.4]; }
  return T;
}
// Summenwerte zählen hoch; Schnitte und Höchstwerte bleiben, wie sie sind
const pcScaled = (d, f) => f >= 1 ? d : {...d, dist: d.dist * f, asc: d.asc * f, moving: d.moving * f, elapsed: d.elapsed * f};

// Zeichnet das Bild; t: Zeit in der Animation (s) oder null für das fertige Bild;
// safe: die Bereiche zeigen, die Instagram bei Stories verdeckt (nur in der Vorschau)
function pcDraw(cv, d, t = null, safe = false) {
  const fmt = $('pcFormat').value, [W, H] = PC_FORMATS[fmt] || PC_FORMATS.post;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const fam = ovFontStack($('pcFont').value), it = $('pcItalic').checked ? 'italic ' : '';
  const font = (w, px) => `${it}${w} ${Math.round(px)}px ${fam}`;
  const up = s => $('pcUpper').checked ? s.toUpperCase() : s;
  const text = $('pcText').value, dimText = rgba(text, 0.8), accent = $('pcAccent').value, bg = $('pcBg').value;
  const width = (spec, s) => { g.font = spec; return g.measureText(s).width; };
  const dim = ovNum('pcDim', 45, 0, 90) / 100;

  if (bg === 'color') { g.fillStyle = $('pcBgCol').value; g.fillRect(0, 0, W, H); }
  if (bg === 'gradient') {
    // Verlauf von oben nach unten, dazu ein weicher Lichtschein in der Akzentfarbe
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, $('pcBgCol2').value); gr.addColorStop(1, $('pcBgCol').value);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.9, H * 0.08, 0, W * 0.9, H * 0.08, W * 0.95);
    glow.addColorStop(0, rgba(accent, 0.28)); glow.addColorStop(1, rgba(accent, 0));
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
  }
  if (bg === 'photo' && pc.photo) {
    // Foto füllt das Bild, Überstand wird mittig abgeschnitten; oben und unten abgedunkelt, wo die Schrift steht
    const p = pc.photo, sc = Math.max(W / p.width, H / p.height);
    g.drawImage(p, (W - p.width * sc) / 2, (H - p.height * sc) / 2, p.width * sc, p.height * sc);
    if (dim) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `rgba(0,0,0,${dim * 0.7})`); gr.addColorStop(0.3, `rgba(0,0,0,${dim * 0.1})`);
      gr.addColorStop(0.5, `rgba(0,0,0,${dim * 0.2})`); gr.addColorStop(1, `rgba(0,0,0,${dim})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }
  // Auf Foto, Karte und transparent hilft ein Schatten der Lesbarkeit
  const shadow = on => { g.shadowColor = on && bg !== 'color' && bg !== 'gradient' ? 'rgba(0,0,0,.45)' : 'transparent'; g.shadowBlur = 14; g.shadowOffsetY = 2; };
  // Bei Stories verdecken oben und unten Bedienelemente einen Teil des Bilds
  const M = 72, top = fmt === 'story' ? 230 : M, bottom = H - (fmt === 'story' ? 300 : M);
  const on = id => $('pc_' + id).checked && !$('pc_' + id).disabled;
  const stats = PC_STATS.filter(f => $('pcs_' + f.id).checked && !$('pcs_' + f.id).disabled).map(bySport);
  const route = on('route') && d.has.gps, profile = on('profile') && d.prof;
  const TL = pcTimeline(stats.length, route, profile);
  const A = k => { if (t == null) return 1; const e = TL[k]; return e ? (t - e[0]) / e[1] : 1; };
  // Element mit Einblendung: Deckkraft und kleiner Versatz nach oben
  const reveal = (key, fn) => {
    const e = ease(A(key));
    if (e <= 0) return;
    g.save(); g.globalAlpha = e; g.translate(0, (1 - e) * 36); fn(); g.restore();
  };

  // Kopf: Titel, Start → Ziel und Datum
  const title = $('pcTitle').value.trim(), places = on('places') && d.places ? d.places : '', date = on('date') && d.date ? d.date : '';
  const tpx = title ? Math.min(84, 84 * (W - 2 * M) / (width(font(800, 84), title) || 1)) : 0;
  const ppx = places ? Math.min(44, 44 * (W - 2 * M) / (width(font(700, 44), places) || 1)) : 0;
  const lines = [tpx, ppx, date ? 34 : 0].filter(Boolean);
  const headH = lines.reduce((a, b) => a + b, 0) + Math.max(0, lines.length - 1) * 18;
  const drawHead = y => {
    reveal('head', () => {
      shadow(true);
      g.textAlign = 'left';
      let yy = y;
      if (title) { g.font = font(800, tpx); g.fillStyle = text; g.fillText(title, M, yy + tpx * 0.8); yy += tpx + 18; }
      if (places) { g.font = font(700, ppx); g.fillStyle = text; g.fillText(places, M, yy + ppx * 0.8); yy += ppx + 18; }
      if (date) { g.font = font(500, 34); g.fillStyle = dimText; g.fillText(date, M, yy + 28, W - 2 * M); }
    });
    return y + headH;
  };

  // Werte in Spalten: Art klein darüber, Zahl groß mit Einheit; alle Zahlen gleich groß,
  // so dass der breiteste Wert in seine Spalte passt
  const LAB = 28, ROWGAP = 40;
  const gridLayout = (w, cols, vmax) => {
    const cw = w / cols;
    let vpx = vmax;
    for (const f of stats) {
      const [v, u] = f.val(d);
      const at100 = width(font(800, 100), v) + (u ? width(font(600, 42), u) + 10 : 0);
      vpx = Math.min(vpx, 100 * (cw - 24) / at100);
    }
    const rows = Math.ceil(stats.length / cols), rh = LAB + 14 + vpx * 0.86;
    return {cols, cw, vpx, rh, h: rows * rh + (rows - 1) * ROWGAP};
  };
  const drawGrid = (x, y, L) => {
    stats.forEach((f, n) => reveal('stat' + n, () => {
      shadow(true);
      g.textAlign = 'left';
      const cx = x + n % L.cols * L.cw, cy = y + Math.floor(n / L.cols) * (L.rh + ROWGAP);
      const [v, u] = f.val(pcScaled(d, ease(A('count' + n))));
      g.font = font(600, LAB); g.fillStyle = dimText;
      g.fillText(up(f.label), cx, cy + LAB * 0.8);
      const vy = cy + L.rh;
      g.font = font(800, L.vpx); g.fillStyle = text;
      g.fillText(v, cx, vy);
      if (u) {
        const vw = g.measureText(v).width;
        g.font = font(600, L.vpx * 0.42); g.fillStyle = dimText;
        g.fillText(u, cx + vw + L.vpx * 0.1, vy);
      }
    }));
  };

  // Strecke: in die Fläche eingepasst, Start hell, Ziel bzw. aktuelle Stelle in der Akzentfarbe.
  // Die Einpassung wird für den Kartenhintergrund gemerkt (proj).
  let proj = null;
  const fitRoute = (x, y, w, h, m) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of d.route) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const sc = Math.min((w - 2 * m) / Math.max(x1 - x0, 1e-12), (h - 2 * m) / Math.max(y1 - y0, 1e-12), 256 * 2 ** 17);
    const ox = x + (w - (x1 - x0) * sc) / 2, oy = y + (h - (y1 - y0) * sc) / 2;
    return {sc, left: x0 - ox / sc, top: y0 - oy / sc, P: d.route.map(([px, py]) => [ox + (px - x0) * sc, oy + (py - y0) * sc])};
  };
  const drawRoute = (x, y, w, h, lw) => {
    if (w < 40 || h < 40) return;
    proj = fitRoute(x, y, w, h, lw * 2);
    const P = proj.P, p = ease(A('route'));
    if (p <= 0) return;
    g.save();
    g.lineJoin = g.lineCap = 'round';
    const path = k => { g.beginPath(); for (let i = 0; i <= k; i++) g[i ? 'lineTo' : 'moveTo'](P[i][0], P[i][1]); };
    const k = Math.max(1, Math.round(p * (P.length - 1)));
    // Während der Animation steht die ganze Strecke blass dahinter
    if (k < P.length - 1) { path(P.length - 1); g.lineWidth = lw; g.strokeStyle = rgba(text, 0.25 * Math.min(1, p * 3)); g.stroke(); }
    path(k);
    shadow(true);
    g.lineWidth = lw; g.strokeStyle = accent; g.stroke();
    const dot = (q, fill, ring) => {
      g.beginPath(); g.arc(q[0], q[1], lw * 1.3, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill(); g.lineWidth = lw * 0.6; g.strokeStyle = ring; g.stroke();
    };
    dot(P[0], text, accent);
    dot(P[k], accent, text);
    g.restore();
  };

  const drawProfile = (x, y, w, h) => {
    const p = ease(A('profile'));
    if (p <= 0) return;
    const ys = d.prof, n = ys.length - 1;
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 20) hi = lo + 20;
    const X = k => x + k / n * w, Y = e => y + h - (e - lo) / (hi - lo) * h * 0.92;
    const trace = () => { g.beginPath(); ys.forEach((e, k) => g[k ? 'lineTo' : 'moveTo'](X(k), Y(e))); };
    g.save();
    // Profil wächst von links
    g.beginPath(); g.rect(x - 10, y - 20, (w + 20) * p, h + 40); g.clip();
    shadow(false);
    trace(); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
    g.fillStyle = rgba(text, 0.22); g.fill();
    shadow(true);
    trace(); g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = accent; g.stroke();
    g.restore();
  };

  const cols = n => n === 4 ? 2 : Math.min(3, n);
  if ($('pcLayout').value === 'bottom') {
    // Alles in einem Block unten, damit oben das Foto frei bleibt; Strecke links neben den Werten
    const rs = route ? (fmt === 'square' ? 280 : 340) : 0, gap = rs ? 48 : 0;
    const L = stats.length ? gridLayout(W - 2 * M - rs - gap, rs ? Math.min(2, stats.length) : cols(stats.length), rs ? 72 : 96) : null;
    const rowH = Math.max(rs, L ? L.h : 0), ph = profile ? 120 : 0;
    const total = headH + (headH && rowH ? 48 : 0) + rowH + (ph ? (rowH ? 44 : 0) + ph : 0);
    const y = drawHead(bottom - total) + (headH && rowH ? 48 : 0);
    if (rs) drawRoute(M, y + (rowH - rs) / 2, rs, rs, 8);
    if (L) drawGrid(M + rs + gap, y + (rowH - L.h) / 2, L);
    if (ph) drawProfile(M, y + rowH + (rowH ? 44 : 0), W - 2 * M, ph);
  } else {
    // Kopf oben, Werte unten, dazwischen das Profil und die Strecke so groß wie möglich
    const y = drawHead(top) + (headH ? 56 : 0);
    let yb = bottom;
    if (stats.length) {
      const L = gridLayout(W - 2 * M, cols(stats.length), fmt === 'square' ? 84 : 100);
      drawGrid(M, yb - L.h, L);
      yb -= L.h + 56;
    }
    if (profile) {
      const ph = fmt === 'square' ? 110 : 160;
      drawProfile(M, yb - ph, W - 2 * M, ph);
      yb -= ph + 56;
    }
    if (route) drawRoute(M, y, W - 2 * M, yb - y, 12);
  }

  // Kartenhintergrund: passend zur gezeichneten Strecke, sonst um die Strecke zentriert.
  // Er kommt unter das Gezeichnete (destination-over): erst die Abdunklung, darunter die Karte.
  pc.tiles = null;
  if (bg === 'map' && d.has.gps) {
    const fit = proj || fitRoute(M, top, W - 2 * M, bottom - top, 40);
    pc.tiles = tileSpec(fit.left, fit.top, fit.sc, W, H, $('pcTileStyle').value, 1, 0);
    const tiles = tileBg(pc.tiles), base = $('pcBgCol').value;
    g.save();
    g.globalCompositeOperation = 'destination-over';
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, rgba(base, Math.min(1, dim * 1.1))); gr.addColorStop(0.45, rgba(base, dim * 0.8));
    gr.addColorStop(0.75, rgba(base, Math.min(1, dim * 1.4))); gr.addColorStop(1, rgba(base, Math.min(1, dim * 1.7)));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    if (tiles) g.drawImage(tiles, 0, 0);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.restore();
    if (tiles) {
      // Quellenangabe, die OpenStreetMap für die Kartendaten verlangt
      g.font = font(500, 20); g.fillStyle = rgba(text, 0.65); g.textAlign = 'right';
      g.fillText('© OpenStreetMap', W - M, fmt === 'story' ? bottom + 40 : H - 24);
      g.textAlign = 'left';
    }
  }
  if (safe && fmt === 'story') {
    g.fillStyle = 'rgba(255,40,90,.22)';
    g.fillRect(0, 0, W, 230); g.fillRect(0, H - 300, W, 300);
    g.font = '600 28px system-ui'; g.fillStyle = 'rgba(255,255,255,.9)'; g.textAlign = 'center';
    g.fillText('von Instagram verdeckt', W / 2, 125); g.fillText('von Instagram verdeckt', W / 2, H - 140);
    g.textAlign = 'left';
  }
}

// Lädt die Schriftschnitte; true, wenn dabei etwas neu geladen wurde
async function pcFonts(d) {
  const fam = ovFontStack($('pcFont').value), it = $('pcItalic').checked ? 'italic ' : '';
  const sample = '0123456789,:–/ ' + PC_STATS.flatMap(f => [f, f.run || {}, f.hike || {}]).map(f => f.label || '').join('').toUpperCase() +
    $('pcTitle').value + (d && d.places || '') + 'kmhinbpmÖÄÜäöüß©OpenStreetMap';
  let fresh = false;
  for (const w of [500, 600, 700, 800]) {
    const id = it + w + fam + '|' + sample;
    if (pc.fonts.has(id)) continue;
    try { await document.fonts.load(`${it}${w} 40px ${fam}`, sample); } catch {}
    pc.fonts.add(id);
    fresh = true;
  }
  return fresh;
}

function pcRender() {
  pc.raf = 0;
  if (!state.track) return;
  const d = pcData();
  const why = (el, off) => { el.disabled = off; el.parentNode.title = off ? 'In dieser Datei nicht enthalten' : ''; };
  for (const [id, , need] of PC_PARTS) why($('pc_' + id), !d.has[need]);
  for (const f of PC_STATS) why($('pcs_' + f.id), !!f.need && !d.has[f.need]);
  // Bedienelemente nur dort, wo sie gebraucht werden
  const bg = $('pcBg').value, anim = pcAnimated(), story = $('pcFormat').value === 'story';
  $('pcBgColWrap').querySelector('label').textContent = bg === 'gradient' ? 'Verlauf unten' : bg === 'map' ? 'Abdunkeln mit' : 'Farbe';
  $('pcBgColWrap').hidden = bg === 'none' || bg === 'photo';
  $('pcBgCol2Wrap').hidden = bg !== 'gradient';
  $('pcTileWrap').hidden = $('pcMapHint').hidden = bg !== 'map';
  $('pcDimWrap').hidden = bg !== 'photo' && bg !== 'map';
  $('pcPhotoWrap').hidden = bg !== 'photo';
  $('pcPlayer').hidden = $('pcDurWrap').hidden = $('pcMp4').hidden = !anim;
  $('pcSave').classList.toggle('primary', !anim);
  $('pcSafeWrap').hidden = !story;
  $('pcPlaces').hidden = !pc.placeRun && (!state.track.hasGps || !$('pc_places').checked || d.placesKnown);
  const slider = $('pcSlider');
  if (+slider.max !== pcDur()) { slider.max = pcDur(); slider.value = pcDur(); }
  const cv = $('pcCanvas'), t = anim ? Math.min(pcDur(), +slider.value) : null;
  pcDraw(cv, d, t, story && $('pcSafe').checked);
  $('pcTime').textContent = (t ?? 0).toFixed(1).replace('.', ',') + ' s';
  const notes = [`${cv.width} × ${cv.height} px`];
  if (bg === 'photo' && !pc.photo) notes.push('noch kein Foto gewählt');
  if (bg === 'map' && !state.track.hasGps) notes.push('Karte braucht GPS-Daten');
  if (pc.tiles && tileBg(pc.tiles) === false) notes.push('Kartenhintergrund konnte nicht geladen werden');
  else if (pc.tiles && tileBg(pc.tiles) === null) notes.push('Karte wird geladen …');
  $('pcInfo').textContent = notes.join(' · ');
  if (!pc.play) {
    pcFonts(d).then(fresh => { if (fresh) pcRefresh(); });
    if (pc.tiles && tileBg(pc.tiles) === null) buildTileBg(pc.tiles).then(fresh => { if (fresh) pcRefresh(); });
  }
}
function pcRefresh() {
  if (!state.track) return;
  const S = state.stages, sel = $('pcScope');
  if (sel.dataset.n !== String(S.length)) {
    const v = sel.value;
    sel.innerHTML = '<option value="tour">ganze Tour</option>' + S.map((s, k) => `<option value="${k}">Tag ${k + 1}</option>`).join('');
    sel.dataset.n = S.length;
    sel.value = [...sel.options].some(o => o.value === v) ? v : 'tour';
  }
  $('pcScopeWrap').hidden = !multi();
  if (!multi()) sel.value = 'tour';
  try { localStorage.setItem(pcStore(), JSON.stringify(pcSettings())); } catch {}
  if (!pc.raf) pc.raf = requestAnimationFrame(pcRender);
}
$('pcCard').addEventListener('input', ev => {
  if (ev.target.id === 'pcPhoto') return;
  if (ev.target.id === 'pcSlider') { pcStop(); pcRender(); return; }
  pcRefresh();
});

// Vorschau abspielen; endet auf dem fertigen Bild
function pcStop() { cancelAnimationFrame(pc.play); pc.play = 0; $('pcPlay').textContent = '▶'; $('pcPlay').setAttribute('aria-label', 'Animation abspielen'); }
$('pcPlay').addEventListener('click', () => {
  if (pc.play) { pcStop(); return; }
  const slider = $('pcSlider'), from = +slider.value >= pcDur() - 0.05 ? 0 : +slider.value, t0 = performance.now();
  $('pcPlay').textContent = '❚❚';
  $('pcPlay').setAttribute('aria-label', 'Animation anhalten');
  const tick = () => {
    const t = from + (performance.now() - t0) / 1000;
    slider.value = Math.min(t, pcDur());
    pcRender();
    if (t >= pcDur()) { pcStop(); return; }
    pc.play = requestAnimationFrame(tick);
  };
  pc.play = requestAnimationFrame(tick);
});

function pcSetPhoto(file) {
  const img = new Image();
  img.onload = () => {
    if (pc.photo) URL.revokeObjectURL(pc.photo.src);
    pc.photo = img;
    $('pcBg').value = 'photo';
    pcRefresh();
  };
  img.onerror = () => { URL.revokeObjectURL(img.src); $('pcInfo').textContent = `„${file.name}“ konnte nicht geladen werden.`; };
  img.src = URL.createObjectURL(file);
}
$('pcPhotoBtn').addEventListener('click', () => $('pcPhoto').click());
$('pcPhoto').addEventListener('change', ev => { if (ev.target.files[0]) pcSetPhoto(ev.target.files[0]); ev.target.value = ''; });

// Start und Ziel des gewählten Abschnitts über OpenStreetMap; die Namen landen in der Tabelle
$('pcPlaces').addEventListener('click', async ev => {
  const btn = ev.currentTarget, prog = $('pcPlaceProg');
  if (pc.placeRun) { pc.placeRun = 0; return; }
  const todo = [...new Set(dcEnds($('pcScope').value).filter(p => !placeOf(p)).map(placeKey))];
  if (!todo.length) { prog.textContent = 'Start und Ziel sind bereits eingetragen.'; return; }
  const run = pc.placeRun = Date.now(), label = btn.textContent;
  btn.textContent = 'Abbrechen';
  try {
    for (const [n, key] of todo.entries()) {
      prog.textContent = `Ort ${n + 1} von ${todo.length} …`;
      const name = await fetchPlace(key);
      if (pc.placeRun !== run) break;
      if (name && !(key in places)) { setPlace(key, name); ovRefresh(); dcRefresh(); }
    }
    prog.textContent = pc.placeRun !== run ? 'Abgebrochen.' : '';
  } catch (e) {
    console.error(e);
    prog.textContent = 'Ortsabfrage fehlgeschlagen (offline oder Dienst nicht erreichbar).';
  } finally {
    if (pc.placeRun === run) pc.placeRun = 0;
    btn.textContent = label;
    pcRefresh();
  }
});

// Vor dem Speichern müssen Schriften und Kartenhintergrund bereitstehen
async function pcReady(d) {
  await pcFonts(d);
  pcDraw(document.createElement('canvas'), d);
  if (pc.tiles && tileBg(pc.tiles) === null) await buildTileBg(pc.tiles);
}
const pcName = (ext = 'png') => (multi() ? 'tour' : state.stages[0].name.replace(/\.[^.]+$/, '')) + '_' + $('pcFormat').value + '.' + ext;
const pcBlob = async () => {
  const d = pcData(), cv = document.createElement('canvas');
  await pcReady(d);
  pcDraw(cv, d);
  return toPng(cv);
};
$('pcSave').addEventListener('click', async () => { if (state.track) download(await pcBlob(), pcName()); });
// Video: H.264 mit 30 Bildern/s; Instagram nimmt es als Story oder Beitrag an
$('pcMp4').addEventListener('click', async ev => {
  const btn = ev.currentTarget, prog = $('pcProg');
  if (pc.busy) { pc.cancel = true; return; }
  if (!state.track) return;
  pcStop();
  pc.busy = true; pc.cancel = false;
  const label = btn.textContent;
  btn.textContent = 'Abbrechen';
  try {
    const d = pcData();
    await pcReady(d);
    const frames = Math.round(pcDur() * PC_FPS), canvas = document.createElement('canvas');
    pcDraw(canvas, d);
    const blob = await encodeMp4(canvas, {
      fps: PC_FPS, frames,
      draw: (cv, i) => pcDraw(cv, d, i / PC_FPS),
      progress: i => { if (i % 10 === 0) prog.textContent = `Bild ${i + 1} von ${frames} …`; },
      cancelled: () => pc.cancel,
    });
    if (!blob) { prog.textContent = 'Abgebrochen.'; return; }
    download(blob, pcName('mp4'));
    prog.textContent = `Video gespeichert (${nf1.format(blob.size / 1048576)} MB).`;
  } catch (e) {
    console.error(e);
    prog.textContent = e.message || 'Video konnte nicht erstellt werden.';
  } finally {
    pc.busy = false;
    btn.textContent = label;
  }
});
// Teilen (z. B. direkt in die Instagram-Story) gibt es vor allem auf dem Handy
try { $('pcShare').hidden = !(navigator.canShare && navigator.canShare({files: [new File([''], 'x.png', {type: 'image/png'})]})); } catch {}
$('pcShare').addEventListener('click', async () => {
  if (!state.track) return;
  const file = new File([await pcBlob()], pcName(), {type: 'image/png'});
  try { await navigator.share({files: [file]}); }
  catch (e) { if (e.name !== 'AbortError') $('pcInfo').textContent = 'Teilen hat nicht geklappt – bitte als PNG speichern.'; }
});
