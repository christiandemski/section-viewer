'use strict';

const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z
const BT_SIZE = [1, 1, 1, 2, 2, 4, 4, 1, 4, 8, 1, 2, 4, 1, 8, 8, 8];

function fitValue(dv, p, bt, le) {
  let v;
  switch (bt) {
    case 0: case 2: case 13: v = dv.getUint8(p); return v === 0xFF ? null : v;
    case 10: v = dv.getUint8(p); return v === 0 ? null : v;
    case 1: v = dv.getInt8(p); return v === 0x7F ? null : v;
    case 3: v = dv.getInt16(p, le); return v === 0x7FFF ? null : v;
    case 4: v = dv.getUint16(p, le); return v === 0xFFFF ? null : v;
    case 11: v = dv.getUint16(p, le); return v === 0 ? null : v;
    case 5: v = dv.getInt32(p, le); return v === 0x7FFFFFFF ? null : v;
    case 6: v = dv.getUint32(p, le); return v === 0xFFFFFFFF ? null : v;
    case 12: v = dv.getUint32(p, le); return v === 0 ? null : v;
    case 8: v = dv.getFloat32(p, le); return Number.isNaN(v) ? null : v;
    default: return null;
  }
}

function parseFit(buf) {
  const dv = new DataView(buf);
  const points = [];
  const device = {ascent: null, descent: null, distance: null};
  let sessions = 0, start = 0;

  while (start + 12 <= buf.byteLength) {
    const headerSize = dv.getUint8(start);
    if (String.fromCharCode(dv.getUint8(start + 8), dv.getUint8(start + 9), dv.getUint8(start + 10), dv.getUint8(start + 11)) !== '.FIT') {
      if (start === 0) throw new Error('Keine gültige FIT-Datei.');
      break;
    }
    const dataSize = dv.getUint32(start + 4, true);
    let p = start + headerSize;
    const end = dataSize ? Math.min(p + dataSize, buf.byteLength) : buf.byteLength - 2;
    const defs = {};
    let lastTs = 0;

    const readMessage = (def, tsOverride) => {
      const wanted = def.global === 20 || def.global === 18;
      if (!wanted) { p += def.size; return; }
      const m = {};
      for (const f of def.fields) {
        if (f.size === BT_SIZE[f.bt]) m[f.num] = fitValue(dv, p, f.bt, def.le);
        p += f.size;
      }
      p += def.devSize;
      if (m[253] != null) lastTs = m[253];
      if (def.global === 20) {
        const ts = tsOverride != null ? tsOverride : m[253];
        const alt = m[78] != null ? m[78] : m[2];
        const spd = m[73] != null ? m[73] : m[6];
        points.push({
          t: ts != null ? (ts + FIT_EPOCH) * 1000 : null,
          lat: m[0] != null ? m[0] * 180 / 2147483648 : null,
          lon: m[1] != null ? m[1] * 180 / 2147483648 : null,
          ele: alt != null ? alt / 5 - 500 : null,
          dist: m[5] != null ? m[5] / 100 : null,
          speed: spd != null ? spd / 1000 : null,
          hr: m[3] ?? null, cad: m[4] ?? null, power: m[7] ?? null, temp: m[13] ?? null,
        });
      } else {
        sessions++;
        if (m[22] != null) device.ascent = (device.ascent || 0) + m[22];
        if (m[23] != null) device.descent = (device.descent || 0) + m[23];
        if (m[9] != null) device.distance = (device.distance || 0) + m[9] / 100;
      }
    };

    while (p < end) {
      const h = dv.getUint8(p++);
      if (h & 0x80) { // compressed timestamp header
        const def = defs[(h >> 5) & 3];
        if (!def) throw new Error('FIT-Datei ist beschädigt.');
        const off = h & 0x1F;
        lastTs = (lastTs & ~0x1F) + off + (off < (lastTs & 0x1F) ? 32 : 0);
        readMessage(def, lastTs);
      } else if (h & 0x40) { // definition message
        const le = dv.getUint8(p + 1) === 0;
        const global = dv.getUint16(p + 2, le);
        const n = dv.getUint8(p + 4);
        p += 5;
        const fields = [];
        let size = 0;
        for (let i = 0; i < n; i++, p += 3) {
          const f = {num: dv.getUint8(p), size: dv.getUint8(p + 1), bt: dv.getUint8(p + 2) & 0x1F};
          fields.push(f);
          size += f.size;
        }
        let devSize = 0;
        if (h & 0x20) {
          const nd = dv.getUint8(p++);
          for (let i = 0; i < nd; i++, p += 3) devSize += dv.getUint8(p + 1);
        }
        defs[h & 0x0F] = {global, le, fields, devSize, size: size + devSize};
      } else {
        const def = defs[h & 0x0F];
        if (!def) throw new Error('FIT-Datei ist beschädigt.');
        readMessage(def, null);
      }
    }
    start = end + 2; // CRC, then possibly a chained file
  }
  return {points, device: sessions ? device : null};
}

// ---------- GPX ----------
function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('GPX-Datei konnte nicht gelesen werden.');
  let nodes = doc.getElementsByTagNameNS('*', 'trkpt');
  if (!nodes.length) nodes = doc.getElementsByTagNameNS('*', 'rtept');
  const num = s => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
  const points = [];
  for (const n of nodes) {
    const pt = {t: null, lat: num(n.getAttribute('lat')), lon: num(n.getAttribute('lon')), ele: null, dist: null, speed: null, hr: null, cad: null, power: null, temp: null};
    for (const el of n.getElementsByTagName('*')) {
      const v = el.textContent.trim();
      switch (el.localName.toLowerCase()) {
        case 'ele': pt.ele = num(v); break;
        case 'time': { const t = Date.parse(v); pt.t = Number.isNaN(t) ? null : t; break; }
        case 'hr': pt.hr = num(v); break;
        case 'cad': case 'cadence': pt.cad = num(v); break;
        case 'power': case 'powerinwatts': pt.power = num(v); break;
        case 'atemp': pt.temp = num(v); break;
      }
    }
    points.push(pt);
  }
  return {points, device: null};
}

