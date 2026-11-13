'use strict';

// Minimaler MP4-Muxer für eine H.264-Videospur mit fester Bildrate (ISO/IEC 14496-12/-15).
// samples: [{data: Uint8Array (AVCC, Längenpräfix), key: bool}] in Dekodierreihenfolge
// avcC: AVCDecoderConfigurationRecord (decoderConfig.description des VideoEncoder)
function muxMp4({width, height, fps, avcC, samples}) {
  const enc = new TextEncoder();
  const u8 = v => Uint8Array.of(v & 255);
  const u16 = v => Uint8Array.of(v >> 8 & 255, v & 255);
  const u32 = v => Uint8Array.of(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
  const str = s => enc.encode(s);
  const zeros = n => new Uint8Array(n);
  const cat = parts => {
    const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const box = (type, ...parts) => { const body = cat(parts); return cat([u32(body.length + 8), str(type), body]); };
  const full = (type, version, flags, ...parts) => box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...parts);
  const matrix = cat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

  // Zeitbasis so gewählt, dass jedes Bild genau 1000 Einheiten dauert
  const timescale = fps * 1000, delta = 1000, n = samples.length, duration = n * delta;

  const ftyp = box('ftyp', str('isom'), u32(512), str('isom'), str('iso2'), str('avc1'), str('mp41'));
  const dataSize = samples.reduce((a, s) => a + s.data.length, 0);
  const mdatHead = cat([u32(dataSize + 8), str('mdat')]);
  const chunkOffset = ftyp.length + mdatHead.length;

  const avc1 = box('avc1',
    zeros(6), u16(1),                       // reserviert, data_reference_index
    zeros(16),                              // pre_defined, reserviert
    u16(width), u16(height),
    u32(0x00480000), u32(0x00480000),       // 72 dpi
    u32(0), u16(1),                         // reserviert, frame_count
    zeros(32),                              // compressorname
    u16(0x0018), u16(0xffff),               // Farbtiefe, pre_defined
    box('avcC', avcC));
  const keys = samples.map((s, i) => s.key ? i + 1 : 0).filter(Boolean);
  const stbl = box('stbl',
    full('stsd', 0, 0, u32(1), avc1),
    full('stts', 0, 0, u32(1), u32(n), u32(delta)),
    full('stss', 0, 0, u32(keys.length), ...keys.map(u32)),
    full('stsc', 0, 0, u32(1), u32(1), u32(n), u32(1)),
    full('stsz', 0, 0, u32(0), u32(n), ...samples.map(s => u32(s.data.length))),
    full('stco', 0, 0, u32(1), u32(chunkOffset)));
  const minf = box('minf',
    full('vmhd', 0, 1, u16(0), u16(0), u16(0), u16(0)),
    box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
    stbl);
  const mdia = box('mdia',
    full('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u16(0x55c4), u16(0)), // Sprache „und“
    full('hdlr', 0, 0, u32(0), str('vide'), zeros(12), str('VideoHandler\0')),
    minf);
  const trak = box('trak',
    full('tkhd', 0, 3, u32(0), u32(0), u32(1), u32(0), u32(duration), zeros(8), u16(0), u16(0), u16(0), u16(0), matrix, u32(width << 16), u32(height << 16)),
    mdia);
  const moov = box('moov',
    full('mvhd', 0, 0, u32(0), u32(0), u32(timescale), u32(duration), u32(0x00010000), u16(0x0100), zeros(10), matrix, zeros(24), u32(2)),
    trak);
  return new Blob([ftyp, mdatHead, ...samples.map(s => s.data), moov], {type: 'video/mp4'});
}

// Kodiert n Bilder, die draw(canvas, i) zeichnet, als H.264 und liefert ein MP4.
// progress(i) meldet den Fortschritt; cancelled() bricht ab (Ergebnis null).
async function encodeMp4(canvas, {fps, frames, draw, progress = () => {}, cancelled = () => false, bitrate = 10e6}) {
  if (typeof VideoEncoder === 'undefined') throw new Error('Dieser Browser kann keine Videos erzeugen. Bitte eine aktuelle Version von Chrome, Edge oder Safari verwenden.');
  const width = canvas.width, height = canvas.height;
  // High, Main oder Baseline Profile, jeweils Level 4.0 (bis 1080 × 1920 bei 30 Bildern/s)
  let config = null;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.420028']) {
    const c = {codec, width, height, bitrate, framerate: fps, avc: {format: 'avc'}, latencyMode: 'quality'};
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) { config = c; break; } } catch {}
  }
  if (!config) throw new Error('Dieser Browser kann kein H.264-Video (MP4) kodieren. Bitte eine aktuelle Version von Chrome, Edge oder Safari verwenden.');

  const samples = [];
  let avcC = null, failure = null, lastTs = -1;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d) avcC = d instanceof ArrayBuffer ? new Uint8Array(d.slice(0)) : new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
      // Ohne B-Frames kommen die Bilder in Abspielreihenfolge; sonst bräuchte das MP4 Zeitversätze (ctts)
      if (chunk.timestamp < lastTs) failure = new Error('Der Video-Encoder liefert Bilder in umgestellter Reihenfolge; das wird nicht unterstützt.');
      lastTs = chunk.timestamp;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({data, key: chunk.type === 'key'});
    },
    error: e => { failure = e; },
  });
  encoder.configure(config);
  const us = 1e6 / fps;
  try {
    for (let i = 0; i < frames; i++) {
      if (cancelled()) return null;
      if (failure) throw failure;
      draw(canvas, i);
      const frame = new VideoFrame(canvas, {timestamp: Math.round(i * us), duration: Math.round(us)});
      // alle zwei Sekunden ein Schlüsselbild, damit sich das Video gut spulen lässt
      encoder.encode(frame, {keyFrame: i % (fps * 2) === 0});
      frame.close();
      progress(i);
      // nicht mehr Bilder vorausschicken, als der Encoder verarbeitet
      while (encoder.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5));
      if (i % 10 === 0) await new Promise(r => setTimeout(r));
    }
    await encoder.flush();
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (failure) throw failure;
  if (!avcC || !samples.length) throw new Error('Der Video-Encoder hat keine Daten geliefert.');
  return muxMp4({width, height, fps, avcC, samples});
}
