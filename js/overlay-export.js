'use strict';

const ovName = c => 'overlay_km' + (c.r0.dist / 1000).toFixed(1).replace('.', '-');
const toPng = canvas => new Promise(res => canvas.toBlob(res, 'image/png'));

$('ovPng').addEventListener('click', async () => {
  const c = ov.cfg;
  if (!c || c.error || c.empty) return;
  download(await toPng($('ovCanvas')), ovName(c) + '.png');
});

const CRC_TABLE = Uint32Array.from({length: 256}, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// ZIP ohne Kompression (PNG ist bereits komprimiert)
function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [], crcs = new Map();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), size = f.bytes.length;
    if (!crcs.has(f.bytes)) crcs.set(f.bytes, crc32(f.bytes));
    const crc = crcs.get(f.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint16(12, 0x21, true); // Datum 1980-01-01
    local.setUint32(14, crc, true); local.setUint32(18, size, true); local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true);
    cd.setUint16(14, 0x21, true);
    cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true); cd.setUint32(42, offset, true);
    parts.push(local, name, f.bytes);
    central.push(cd, name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], {type: 'application/zip'});
}

// Rendert die Sequenzen aus list ({c, base}) jeweils in einen eigenen Ordner und speichert alles als ZIP.
// Ein ZIP ohne ZIP64 fasst höchstens 4 GB und 65.535 Dateien, und alles liegt bis zum Speichern im Arbeitsspeicher;
// große Exporte werden deshalb auf mehrere ZIP-Dateien verteilt.
async function ovExport(btn, list, zipName) {
  if (ov.busy) { if (ov.busy === btn) ov.cancel = true; return; }
  const prog = $('ovProg');
  if (list.some(x => x.c.frames > 20000)) {
    prog.textContent = 'Zu viele Bilder (maximal 20.000 je Sequenz) – bitte Dauer oder Bilder/s verringern.';
    return;
  }
  ov.busy = btn; ov.cancel = false;
  const label = btn.textContent;
  btn.textContent = 'Abbrechen';
  try {
    await ovFonts(list[0].c);
    for (const x of list) await ovMapBg(x.c);
    const canvas = document.createElement('canvas'), stem = zipName.replace(/\.zip$/, '');
    let files = [], total = 0, count = 0, part = 0, parts = 0;
    const flush = async last => {
      if (!files.length) return;
      prog.textContent = 'ZIP wird erstellt …';
      await new Promise(res => setTimeout(res));
      parts++;
      download(makeZip(files), last && parts === 1 ? zipName : `${stem}_teil${parts}.zip`);
      files = []; part = 0;
      await new Promise(res => setTimeout(res, 500)); // dem Browser Zeit geben, den Download zu starten
    };
    for (const [n, {c, base}] of list.entries()) {
      if (part > ov.zipMax / 2) await flush(); // möglichst zwischen zwei Sequenzen teilen
      const pre = list.length > 1 ? `Punkt ${n + 1} von ${list.length} · ` : '';
      let lastKey = null, bytes = null;
      for (let f = 0; f < c.frames && !ov.cancel; f++) {
        const r = ovSample(c, f / c.fps), k = ovKey(r, c);
        if (k.key !== lastKey) { // unveränderte Bilder nicht neu rendern
          ovDraw(canvas, r, c, k);
          bytes = new Uint8Array(await (await toPng(canvas)).arrayBuffer());
          lastKey = k.key;
        } else if (f % 50 === 0) await new Promise(res => setTimeout(res));
        if (part + bytes.length > ov.zipMax || files.length >= 60000) await flush();
        part += bytes.length; total += bytes.length; count++;
        files.push({name: `${base}/${base}_${String(f).padStart(5, '0')}.png`, bytes});
        if (f % 10 === 0) prog.textContent = `${pre}Bild ${f + 1} von ${c.frames} …`;
      }
    }
    if (ov.cancel) { prog.textContent = 'Abgebrochen.'; return; }
    await flush(true);
    prog.textContent = (list.length > 1 ? `${list.length} Sequenzen, ` : '') + `${nf0.format(count)} Bilder gespeichert (${nf0.format(total / 1048576)} MB)` +
      (parts > 1 ? ` in ${parts} ZIP-Dateien – alle in denselben Ordner entpacken.` : '.');
  } catch (e) {
    console.error(e);
    prog.textContent = e.message || 'Export fehlgeschlagen.';
  } finally {
    ov.busy = false;
    btn.textContent = label;
  }
}

$('ovZip').addEventListener('click', ev => {
  const c = ov.cfg;
  if (!c || c.error || c.empty) return;
  ovExport(ev.currentTarget, [{c, base: ovName(c)}], ovName(c) + '.zip');
});

// Je eigenem Punkt eine Sequenz, in Tourreihenfolge durchnummeriert
$('ovAll').addEventListener('click', ev => {
  if (ov.busy) { ovExport(ev.currentTarget, []); return; }
  if (!ov.cfg || ov.cfg.empty) return;
  const rows = parseCustom($('custom').value).out.sort((a, b) => a.dist - b.dist);
  if (!rows.length) { $('ovProg').textContent = 'Keine eigenen Punkte eingetragen.'; return; }
  const list = rows.map((r, n) => { const c = ovConfig(r); return {c, base: pad2(n + 1) + '_' + ovName(c)}; });
  ovExport(ev.currentTarget, list, (multi() ? 'tour' : state.stages[0].name.replace(/\.[^.]+$/, '')) + '_overlays.zip');
});

