'use strict';

function haversine(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function buildTrack(raw) {
  const hasDist = raw.some(p => p.dist != null);
  const pts = hasDist ? raw : raw.filter(p => p.lat != null && p.lon != null);
  const n = pts.length;
  if (n < 2) throw new Error('Die Datei enthält keine auswertbaren Trackpunkte.');

  const dist = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    dist[i] = hasDist ? Math.max(dist[i - 1], pts[i].dist ?? 0) : dist[i - 1] + haversine(pts[i - 1], pts[i]);
  }
  if (hasDist) dist[0] = Math.min(pts[0].dist ?? 0, dist[1]);

  const hasEle = pts.some(p => p.ele != null);
  const ele = new Float64Array(n);
  if (hasEle) {
    let last = pts.find(p => p.ele != null).ele;
    for (let i = 0; i < n; i++) { if (pts[i].ele != null) last = pts[i].ele; ele[i] = last; }
  }

  let t = null, moving = null;
  if (pts.every(p => p.t != null)) {
    t = Float64Array.from(pts, p => p.t);
    for (let i = 1; i < n; i++) if (t[i] < t[i - 1]) t[i] = t[i - 1];
    // Pausen: Lücken in der Aufzeichnung oder Stillstand zählen nicht zur Fahrzeit
    const dts = [];
    for (let i = 1; i < n; i++) dts.push(t[i] - t[i - 1]);
    const gap = Math.max(10000, dts.slice().sort((a, b) => a - b)[dts.length >> 1] * 5);
    moving = new Float64Array(n);
    for (let i = 1; i < n; i++) {
      const dt = t[i] - t[i - 1];
      const isMoving = dt > 0 && dt <= gap && (dist[i] - dist[i - 1]) / (dt / 1000) >= 0.5;
      moving[i] = moving[i - 1] + (isMoving ? dt / 1000 : 0);
    }
  }

  const col = k => pts.map(p => p[k]);
  const speed = col('speed');
  if (t && speed.every(v => v == null)) {
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      if (t[b] > t[a]) speed[i] = (dist[b] - dist[a]) / ((t[b] - t[a]) / 1000);
    }
  }
  return {n, dist, ele, hasEle, t, moving, speed, lat: col('lat'), lon: col('lon'), hr: col('hr'), cad: col('cad'), power: col('power'), temp: col('temp')};
}

// Kumulierter Auf-/Abstieg mit Hysterese: gezählt wird erst, wenn sich die Höhe
// um mindestens `thr` Meter vom letzten Referenzpunkt entfernt hat.
function cumulate(ele, thr) {
  const n = ele.length, asc = new Float64Array(n), desc = new Float64Array(n);
  let ref = ele[0];
  for (let i = 1; i < n; i++) {
    const d = ele[i] - ref;
    asc[i] = asc[i - 1]; desc[i] = desc[i - 1];
    if (d > 0 && d >= thr) { asc[i] += d; ref = ele[i]; }
    else if (d < 0 && -d >= thr) { desc[i] -= d; ref = ele[i]; }
  }
  return {asc, desc};
}

function calibrate(ele, target) {
  let best = 0, bestDiff = Infinity;
  for (let k = 0; k <= 150; k++) {
    const {asc} = cumulate(ele, k / 10);
    const diff = Math.abs(asc[asc.length - 1] - target);
    if (diff < bestDiff) { bestDiff = diff; best = k / 10; }
  }
  return best;
}

// Position von v im aufsteigend sortierten Array: Index i und Anteil f bis i+1
function locate(arr, v) {
  const last = arr.length - 1;
  if (v <= arr[0]) return {i: 0, f: 0};
  if (v >= arr[last]) return {i: last, f: 0};
  let lo = 0, hi = last;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < v) lo = m + 1; else hi = m; }
  const a = arr[lo - 1], b = arr[lo];
  return {i: lo - 1, f: b > a ? (v - a) / (b - a) : 0};
}

// ---------- State ----------
// stages: je Datei eine Etappe; track: alle Etappen aneinandergehängt
// sport: 'ride' oder 'run'; das Skript im <head> hat die gemerkte Sportart schon an <html> gesetzt
const state = {stages: [], manualOrder: false, track: null, thr: 2, auto: true, asc: null, desc: null, rows: [],
  sport: document.documentElement.dataset.sport === 'run' ? 'run' : 'ride'};
const multi = () => state.stages.length > 1;
const isRun = () => state.sport === 'run';
// Spalten und Overlay-Werte mit Abweichungen fürs Laufen unter `run`
const bySport = o => isRun() && o.run ? {...o, ...o.run} : o;
const hasDeviceAscent = s => !!(s.device && s.device.ascent != null && s.track.hasEle);

function combine() {
  const S = state.stages;
  if (!S.length) { state.track = null; return; }
  const n = S.reduce((a, s) => a + s.track.n, 0);
  const hasTime = S.every(s => s.track.t);
  const T = {
    n, dist: new Float64Array(n), ele: new Float64Array(n), hasEle: S.some(s => s.track.hasEle),
    t: hasTime ? new Float64Array(n) : null, moving: hasTime ? new Float64Array(n) : null,
    stageOf: new Uint16Array(n), speed: [], hr: [], cad: [], power: [], temp: [], lat: [], lon: [],
  };
  let o = 0, distOff = 0, movOff = 0;
  S.forEach((s, k) => {
    const A = s.track;
    s.start = o; s.distOff = distOff;
    for (let i = 0; i < A.n; i++) {
      T.dist[o + i] = distOff + A.dist[i] - A.dist[0];
      T.stageOf[o + i] = k;
      if (hasTime) { T.t[o + i] = A.t[i]; T.moving[o + i] = movOff + A.moving[i]; }
    }
    T.ele.set(A.ele, o);
    for (const key of ['speed', 'hr', 'cad', 'power', 'temp', 'lat', 'lon']) T[key] = T[key].concat(A[key]);
    o += A.n;
    distOff = T.dist[o - 1];
    if (hasTime) movOff = T.moving[o - 1];
  });
  T.hasGps = T.lat.some(v => v != null);
  // Garmin speichert beim Laufen Doppelschritte pro Minute; am Median erkennbar
  const cads = T.cad.filter(v => v > 0).sort((a, b) => a - b);
  T.cadMed = cads.length ? cads[cads.length >> 1] : null;
  state.track = T;
}

// Nächster Trackpunkt mit Koordinaten (FIT-Dateien haben Lücken ohne GPS-Empfang)
function gpsNear(T, k) {
  for (let d = 0; d < 300; d++) for (const m of [k - d, k + d]) if (T.lat[m] != null && T.lon[m] != null) return m;
  return -1;
}

function rowAt(pos, label) {
  const T = state.track, {i, f} = pos, j = Math.min(i + 1, T.n - 1);
  const lerp = a => a[i] + f * (a[j] - a[i]);
  const k = f < 0.5 ? i : j;
  const s = state.stages[T.stageOf[k]];
  const dist = lerp(T.dist), asc = lerp(state.asc), gp = gpsNear(T, k);
  return {
    label, dist, asc, desc: lerp(state.desc),
    lat: gp < 0 ? null : T.lat[gp], lon: gp < 0 ? null : T.lon[gp],
    stage: T.stageOf[k] + 1, sDist: dist - s.distOff, sAsc: asc - s.ascOff,
    ele: T.hasEle ? lerp(T.ele) : null,
    elapsed: T.t ? (lerp(T.t) - T.t[s.start]) / 1000 : null,
    moving: T.t ? lerp(T.moving) : null,
    clock: T.t ? lerp(T.t) : null,
    hr: T.hr[k], speed: T.speed[k], power: T.power[k], cad: T.cad[k], temp: T.temp[k],
  };
}

function parseCustom(text) {
  const T = state.track, S = state.stages, out = [], bad = [];
  for (let tok of text.split(/[\s;]+/)) {
    tok = tok.replace(/,+$/, '');
    if (!tok) continue;
    // optionales Präfix "3/" bezieht den Punkt auf Etappe 3
    const pm = /^(\d+)\/(.+)$/.exec(tok);
    const body = pm ? pm[2] : tok;
    let s = pm ? S[+pm[1] - 1] : null;
    if (pm && !s) { bad.push(tok); continue; }
    const tag = pm && multi() ? 'Tag ' + pm[1] + ' · ' : '';
    const clock = /^@(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(body);
    const dur = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(body);
    if (clock || dur) {
      if (!s && !multi()) s = S[0];
      const A = s && s.track;
      if (!A || !A.t) { bad.push(tok); continue; }
      const m = clock || dur;
      const sec = +m[1] * 3600 + +m[2] * 60 + +(m[3] || 0);
      let ms = A.t[0] + sec * 1000;
      if (clock) {
        const d = new Date(A.t[0]);
        d.setHours(+m[1], +m[2], +(m[3] || 0), 0);
        ms = d.getTime();
        if (ms < A.t[0] - 1000) ms += 86400000;
      }
      if (ms > A.t[A.n - 1]) { bad.push(tok); continue; }
      const p = locate(A.t, ms);
      out.push(rowAt({i: s.start + p.i, f: p.f}, tag + (clock ? body.slice(1) + ' Uhr' : 'nach ' + fmtDur(sec))));
    } else if (/^\d+([.,]\d+)?$/.test(body)) {
      const m = parseFloat(body.replace(',', '.')) * 1000;
      const len = s ? s.track.dist[s.track.n - 1] - s.track.dist[0] : T.dist[T.n - 1];
      if (m > len + 50) { bad.push(tok); continue; }
      const label = tag + 'km ' + body.replace('.', ',');
      if (s) {
        const p = locate(s.track.dist, s.track.dist[0] + m);
        out.push(rowAt({i: s.start + p.i, f: p.f}, label));
      } else out.push(rowAt(locate(T.dist, m), label));
    } else bad.push(tok);
  }
  return {out, bad};
}

// Feste Punkte im Laufmodus; offizielle Streckenlängen
const RACE_MARKS = [[5000, '5 km'], [10000, '10 km'], [21097.5, 'Halbmarathon'], [42195, 'Marathon']];

function update() {
  const T = state.track, S = state.stages;
  $('app').hidden = !T;
  if (!T) return;
  const anyDevice = S.some(hasDeviceAscent);
  const auto = state.auto && anyDevice;
  $('autoWrap').hidden = !anyDevice;
  $('auto').checked = auto;
  $('multiHint').hidden = !multi();
  $('places').hidden = $('placeHint').hidden = !T.hasGps;

  // Auf-/Abstieg je Etappe berechnen und fortlaufend aufaddieren
  state.asc = new Float64Array(T.n);
  state.desc = new Float64Array(T.n);
  let ascOff = 0, descOff = 0;
  for (const s of S) {
    const dev = auto && hasDeviceAscent(s) ? s.device : null;
    if (dev && s.autoThr == null) s.autoThr = calibrate(s.track.ele, dev.ascent);
    s.thr = dev ? s.autoThr : state.thr;
    const c = cumulate(s.track.ele, s.thr), last = s.track.n - 1;
    if (dev) {
      // Die Schwelle trifft den Gerätewert nur ungefähr; den Rest gleichmäßig verteilen,
      // damit am Etappenende exakt die Garmin-Summe steht.
      for (const [arr, target] of [[c.asc, dev.ascent], [c.desc, dev.descent]]) {
        const f = target != null && arr[last] > 0 ? target / arr[last] : 1;
        if (f > 0.8 && f < 1.25) for (let i = 0; i <= last; i++) arr[i] *= f;
      }
    }
    s.ascOff = ascOff;
    for (let i = 0; i <= last; i++) { state.asc[s.start + i] = ascOff + c.asc[i]; state.desc[s.start + i] = descOff + c.desc[i]; }
    s.asc = c.asc[last];
    ascOff += c.asc[last]; descOff += c.desc[last];
  }
  const thrField = $('thr');
  thrField.placeholder = 'auto';
  thrField.value = auto ? (multi() ? '' : S[0].thr) : state.thr;

  // Feste Punkte zuerst, dann eigene, dann Intervall: bei gleicher Stelle gewinnt der frühere
  const total = T.dist[T.n - 1];
  const rows = [];
  const add = r => { if (!rows.some(x => Math.abs(x.dist - r.dist) < 1)) rows.push(r); };
  for (let k = 0; k < S.length - 1; k++) add(rowAt({i: S[k + 1].start - 1, f: 0}, 'Ende Tag ' + (k + 1)));
  add(rowAt({i: T.n - 1, f: 0}, 'Ziel'));
  if (isRun() && $('race').checked) for (const [d, label] of RACE_MARKS) if (d < total - 1) add(rowAt(locate(T.dist, d), label));
  const {out, bad} = parseCustom($('custom').value);
  out.forEach(add);
  const step = +$('interval').value * 1000;
  if (step) for (let d = step; d < total - 1; d += step) add(rowAt(locate(T.dist, d), 'km ' + nf0.format(d / 1000)));
  rows.sort((a, b) => a.dist - b.dist);
  // Split: Schnitt seit dem vorigen Tabellenpunkt über die Laufzeit (in m/s, angezeigt als Pace)
  if (isRun() && T.t) rows.forEach((r, k) => {
    const p = rows[k - 1] || {dist: 0, moving: 0}, dt = r.moving - p.moving;
    r.split = dt > 0 ? (r.dist - p.dist) / dt : null;
  });
  state.rows = rows;
  $('customErr').textContent = bad.length ? 'Nicht erkannt oder außerhalb der Tour: ' + bad.join('  ') : '';

  renderSummary();
  renderChart();
  renderTable();
  ovRefresh();
}

