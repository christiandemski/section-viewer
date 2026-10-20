'use strict';

// Postkarte: ein Bild der Tour oder des Laufs für Beiträge und Stories, wahlweise transparent
// zum Darüberlegen, auf einem eigenen Foto oder auf einer Farbe. Das Foto bleibt im Browser.
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
  {id: 'moving', label: 'Fahrzeit', on: true, need: 'time', val: d => pcTime(d.moving), run: {label: 'Laufzeit'}},
  {id: 'avg', label: 'Ø Tempo', on: true, need: 'time', val: d => [nf1.format(d.dist / d.moving * 3.6), 'km/h'],
    run: {label: 'Ø Pace', val: d => [fmtPace(d.dist / d.moving), '/km']}},
  {id: 'elapsed', label: 'Gesamtzeit', need: 'time', val: d => pcTime(d.elapsed)},
  {id: 'hr', label: 'Ø Puls', need: 'hr', val: d => [nf0.format(d.hr), 'bpm']},
];
const PC_PARTS = [['route', 'Strecke', 'gps'], ['profile', 'Höhenprofil', 'ele'], ['date', 'Datum', 'time']];
$('pcChecks').innerHTML = PC_PARTS.map(([id, label]) => `<label><input type="checkbox" id="pc_${id}" checked>${label}</label>`).join('') +
  PC_STATS.map(f => `<label><input type="checkbox" id="pcs_${f.id}"${f.on ? ' checked' : ''}>${bySport(f).label}</label>`).join('');
$('pcFont').innerHTML = $('ovFont').innerHTML;

// Gestaltung je Sportart merken, wie beim Overlay
const PC_SAVED = ['pcFormat', 'pcLayout', 'pcBg', 'pcBgCol', 'pcDim', 'pcFont', 'pcAccent', 'pcText', 'pcItalic', 'pcUpper',
  ...PC_PARTS.map(p => 'pc_' + p[0]), ...PC_STATS.map(f => 'pcs_' + f.id)];
const PC_DEFAULTS = defaultsOf(PC_SAVED);
const PC_SPORT = {ride: {pcFont: 'Montserrat'}, run: {pcFont: 'Barlow Condensed', pcItalic: true, pcUpper: true, pcAccent: '#ff5a3c'}};
const pcStore = () => 'sectionviewer.postcard' + (isRun() ? '.run' : '');
const pcSettings = () => Object.fromEntries(PC_SAVED.map(id => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value]));
function pcLoadStored() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(pcStore())); } catch {}
  ovApply({...PC_DEFAULTS, ...PC_SPORT[state.sport]}, PC_SAVED);
  if (saved && typeof saved === 'object') ovApply(saved, PC_SAVED);
}
pcLoadStored();
function pcSportChanged(design) {
  for (const f of PC_STATS) $('pcs_' + f.id).nextSibling.textContent = bySport(f).label;
  if (design) pcLoadStored();
}

const pc = {photo: null, raf: 0, fonts: new Set()};
const mercY = lat => { const p = lat * Math.PI / 180; return (1 - Math.log(Math.tan(p) + 1 / Math.cos(p)) / Math.PI) / 2; };

// Kennzahlen, Strecke und Profil für die ganze Tour oder einen Tag
function pcData() {
  const T = state.track, S = state.stages, sc = $('pcScope').value;
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
  d.has = {gps: d.route.length > 1, ele: T.hasEle, time: !!T.t && d.moving > 0, hr: hn > 0};
  return d;
}

function pcDraw(cv, d) {
  const fmt = $('pcFormat').value, [W, H] = PC_FORMATS[fmt] || PC_FORMATS.post;
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const fam = ovFontStack($('pcFont').value), it = $('pcItalic').checked ? 'italic ' : '';
  const font = (w, px) => `${it}${w} ${Math.round(px)}px ${fam}`;
  const up = t => $('pcUpper').checked ? t.toUpperCase() : t;
  const text = $('pcText').value, dimText = rgba(text, 0.8), accent = $('pcAccent').value, bg = $('pcBg').value;
  const width = (spec, t) => { g.font = spec; return g.measureText(t).width; };

  if (bg === 'color') { g.fillStyle = $('pcBgCol').value; g.fillRect(0, 0, W, H); }
  if (bg === 'photo' && pc.photo) {
    // Foto füllt das Bild, Überstand wird mittig abgeschnitten; oben und unten abgedunkelt, wo die Schrift steht
    const p = pc.photo, sc = Math.max(W / p.width, H / p.height);
    g.drawImage(p, (W - p.width * sc) / 2, (H - p.height * sc) / 2, p.width * sc, p.height * sc);
    const dim = ovNum('pcDim', 45, 0, 90) / 100;
    if (dim) {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `rgba(0,0,0,${dim * 0.7})`); gr.addColorStop(0.3, `rgba(0,0,0,${dim * 0.1})`);
      gr.addColorStop(0.5, `rgba(0,0,0,${dim * 0.2})`); gr.addColorStop(1, `rgba(0,0,0,${dim})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }
  // Auf Foto und transparent hilft ein Schatten der Lesbarkeit
  const shadow = on => { g.shadowColor = on && bg !== 'color' ? 'rgba(0,0,0,.45)' : 'transparent'; g.shadowBlur = 14; g.shadowOffsetY = 2; };
  // Bei Stories verdecken oben und unten Bedienelemente einen Teil des Bilds
  const M = 72, top = fmt === 'story' ? 230 : M, bottom = H - (fmt === 'story' ? 300 : M);
  const on = id => $('pc_' + id).checked && !$('pc_' + id).disabled;
  const stats = PC_STATS.filter(f => $('pcs_' + f.id).checked && !$('pcs_' + f.id).disabled).map(bySport);
  const route = on('route') && d.has.gps, profile = on('profile') && d.prof;

  // Kopf: Titel und Datum
  const title = $('pcTitle').value.trim(), date = on('date') && d.date ? d.date : '';
  const tpx = title ? Math.min(84, 84 * (W - 2 * M) / (width(font(800, 84), title) || 1)) : 0;
  const headH = (title ? tpx : 0) + (title && date ? 20 : 0) + (date ? 34 : 0);
  const drawHead = y => {
    shadow(true);
    g.textAlign = 'left';
    if (title) { g.font = font(800, tpx); g.fillStyle = text; g.fillText(title, M, y + tpx * 0.8); y += tpx + (date ? 20 : 0); }
    if (date) { g.font = font(500, 34); g.fillStyle = dimText; g.fillText(date, M, y + 28, W - 2 * M); y += 34; }
    return y;
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
    shadow(true);
    g.textAlign = 'left';
    stats.forEach((f, n) => {
      const cx = x + n % L.cols * L.cw, cy = y + Math.floor(n / L.cols) * (L.rh + ROWGAP);
      const [v, u] = f.val(d);
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
    });
  };

  // Strecke: in die Fläche eingepasst, Start hell, Ziel in der Akzentfarbe
  const drawRoute = (x, y, w, h, lw) => {
    if (w < 40 || h < 40) return;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of d.route) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    const m = lw * 2, sc = Math.min((w - 2 * m) / Math.max(x1 - x0, 1e-12), (h - 2 * m) / Math.max(y1 - y0, 1e-12));
    const ox = x + (w - (x1 - x0) * sc) / 2, oy = y + (h - (y1 - y0) * sc) / 2;
    const P = d.route.map(([px, py]) => [ox + (px - x0) * sc, oy + (py - y0) * sc]);
    g.lineJoin = g.lineCap = 'round';
    g.beginPath();
    P.forEach((p, i) => g[i ? 'lineTo' : 'moveTo'](p[0], p[1]));
    shadow(true);
    g.lineWidth = lw; g.strokeStyle = accent; g.stroke();
    const dot = (p, fill, ring) => {
      g.beginPath(); g.arc(p[0], p[1], lw * 1.3, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill(); g.lineWidth = lw * 0.6; g.strokeStyle = ring; g.stroke();
    };
    dot(P[0], text, accent);
    dot(P[P.length - 1], accent, text);
  };

  const drawProfile = (x, y, w, h) => {
    const ys = d.prof, n = ys.length - 1;
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 20) hi = lo + 20;
    const X = k => x + k / n * w, Y = e => y + h - (e - lo) / (hi - lo) * h * 0.92;
    const trace = () => { g.beginPath(); ys.forEach((e, k) => g[k ? 'lineTo' : 'moveTo'](X(k), Y(e))); };
    shadow(false);
    trace(); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath();
    g.fillStyle = rgba(text, 0.22); g.fill();
    shadow(true);
    trace(); g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = accent; g.stroke();
  };

  const cols = n => n === 4 ? 2 : Math.min(3, n);
  if ($('pcLayout').value === 'bottom') {
    // Alles in einem Block unten, damit oben das Foto frei bleibt; Strecke links neben den Werten
    const rs = route ? (fmt === 'square' ? 280 : 340) : 0, gap = rs ? 48 : 0;
    const L = stats.length ? gridLayout(W - 2 * M - rs - gap, rs ? Math.min(2, stats.length) : cols(stats.length), rs ? 72 : 96) : null;
    const rowH = Math.max(rs, L ? L.h : 0), ph = profile ? 120 : 0;
    const total = headH + (headH && rowH ? 48 : 0) + rowH + (ph ? (rowH ? 44 : 0) + ph : 0);
    let y = drawHead(bottom - total) + (headH && rowH ? 48 : 0);
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
}

// Lädt die Schriftschnitte; true, wenn dabei etwas neu geladen wurde
async function pcFonts() {
  const fam = ovFontStack($('pcFont').value), it = $('pcItalic').checked ? 'italic ' : '';
  const sample = '0123456789,:–/ ' + PC_STATS.flatMap(f => [f, f.run || {}]).map(f => f.label || '').join('').toUpperCase() + $('pcTitle').value + 'kmhinbpmÖÄÜäöüß';
  let fresh = false;
  for (const w of [500, 600, 800]) {
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
  for (const [id, , need] of PC_PARTS) $('pc_' + id).disabled = !d.has[need];
  for (const f of PC_STATS) $('pcs_' + f.id).disabled = !!f.need && !d.has[f.need];
  const cv = $('pcCanvas');
  pcDraw(cv, d);
  $('pcInfo').textContent = `${cv.width} × ${cv.height} px` + ($('pcBg').value === 'photo' && !pc.photo ? ' · noch kein Foto gewählt' : '');
  pcFonts().then(fresh => { if (fresh) pcRefresh(); });
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
$('pcCard').addEventListener('input', ev => { if (ev.target.id !== 'pcPhoto') pcRefresh(); });

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

const pcName = () => (multi() ? 'tour' : state.stages[0].name.replace(/\.[^.]+$/, '')) + '_' + $('pcFormat').value + '.png';
const pcBlob = () => { pcRender(); return toPng($('pcCanvas')); };
$('pcSave').addEventListener('click', async () => { if (state.track) download(await pcBlob(), pcName()); });
// Teilen (z. B. direkt in die Instagram-Story) gibt es vor allem auf dem Handy
try { $('pcShare').hidden = !(navigator.canShare && navigator.canShare({files: [new File([''], 'x.png', {type: 'image/png'})]})); } catch {}
$('pcShare').addEventListener('click', async () => {
  if (!state.track) return;
  const file = new File([await pcBlob()], pcName(), {type: 'image/png'});
  try { await navigator.share({files: [file]}); }
  catch (e) { if (e.name !== 'AbortError') $('pcInfo').textContent = 'Teilen hat nicht geklappt – bitte als PNG speichern.'; }
});
