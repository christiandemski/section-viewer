'use strict';

// Kartenhintergrund für beliebige Flächen (Story-Creator): OpenStreetMap-Kacheln über ovTile aus dem Overlay,
// je nach Stil entfärbt oder abgedunkelt. Wird je Ausschnitt einmal gebaut; false = Kacheln nicht ladbar.
const TILE_FILTERS = {dark: 'grayscale(1) invert(1)', light: 'grayscale(1)', color: 'none'};

// Kacheln für eine w × h große Fläche, deren linke obere Ecke bei Weltkoordinate (left, top) liegt (Web-Mercator, Welt = 0…1)
function tileSpec(left, top, sc, w, h, style, alpha, rad) {
  // Zoomstufe, bei der eine Kachel möglichst nah an ihrer Originalgröße gezeichnet wird
  const z = Math.max(0, Math.min(18, Math.round(Math.log2(sc / 256)))), n = 2 ** z;
  const filter = TILE_FILTERS[style] || 'none';
  return {
    z, w, h, rad, filter, alpha, px: tx => (tx / n - left) * sc, py: ty => (ty / n - top) * sc,
    tx0: Math.floor(left * n), tx1: Math.floor((left + w / sc) * n), ty0: Math.floor(top * n), ty1: Math.floor((top + h / sc) * n),
    key: [z, left, top, sc, w, h, rad, filter, alpha].join('|'),
  };
}

const tileBgCache = new Map();
// Fertiger Hintergrund: Zeichenfläche, false (nicht ladbar) oder null (noch nicht gebaut)
const tileBg = spec => tileBgCache.has(spec.key) ? tileBgCache.get(spec.key) : null;
// Baut den Hintergrund; true, wenn dabei einer neu entstanden ist
async function buildTileBg(spec) {
  if (tileBg(spec) !== null) return false;
  const t = spec, n = 2 ** t.z, jobs = [];
  const raw = document.createElement('canvas');
  raw.width = t.w; raw.height = t.h;
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
    bg.width = t.w; bg.height = t.h;
    const g = bg.getContext('2d');
    if (t.rad) { g.beginPath(); g.roundRect(0, 0, t.w, t.h, t.rad); g.clip(); }
    g.filter = t.filter;
    g.globalAlpha = t.alpha;
    g.drawImage(raw, 0, 0);
  }
  if (tileBgCache.size > 8) tileBgCache.clear();
  tileBgCache.set(spec.key, bg);
  return true;
}
