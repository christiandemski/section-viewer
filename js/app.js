'use strict';

$('interval').addEventListener('change', () => {
  try { localStorage.setItem('sectionviewer.interval', $('interval').value); } catch {}
  update();
});
$('custom').addEventListener('input', update);
$('thr').addEventListener('input', () => {
  const v = parseFloat($('thr').value);
  if (!Number.isFinite(v) || v < 0) return;
  state.thr = v; state.auto = false;
  update();
});
$('auto').addEventListener('change', () => { state.auto = $('auto').checked; update(); });
window.addEventListener('resize', () => { if (state.track) renderChart(); });

$('stages').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (!b) return;
  const S = state.stages;
  if (b.dataset.up) {
    const k = +b.dataset.up;
    [S[k - 1], S[k]] = [S[k], S[k - 1]];
    state.manualOrder = true;
  } else S.splice(+b.dataset.del, 1);
  combine();
  update();
});
$('reset').addEventListener('click', () => {
  state.stages = [];
  state.manualOrder = false;
  $('custom').value = '';
  $('ovStart').value = '';
  combine();
  update();
});

// Etappen nach Startzeit ordnen; ohne brauchbare Zeiten (z. B. geplante Touren) nach Dateiname
function sortStages() {
  const S = state.stages;
  const byName = (a, b) => a.name.localeCompare(b.name, 'de', {numeric: true});
  if (!S.every(s => s.track.t)) { S.sort(byName); return; }
  S.sort((a, b) => a.track.t[0] - b.track.t[0]);
  for (let k = 1; k < S.length; k++) {
    const prev = S[k - 1].track;
    if (S[k].track.t[0] < prev.t[prev.n - 1]) { S.sort(byName); return; }
  }
}

async function loadFiles(files) {
  $('status').textContent = '';
  const errors = [];
  for (const file of files) {
    try {
      const key = file.name + '|' + file.size;
      if (state.stages.some(s => s.key === key)) continue;
      const buf = await file.arrayBuffer();
      const head = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
      const isFit = head.length >= 12 && String.fromCharCode(...head.subarray(8, 12)) === '.FIT';
      const parsed = isFit ? parseFit(buf) : parseGpx(new TextDecoder().decode(buf));
      const track = buildTrack(parsed.points);
      if (!state.stages.length) { state.thr = isFit ? 2 : 3; state.auto = true; }
      state.stages.push({key, name: file.name, track, device: parsed.device});
    } catch (e) {
      console.error(e);
      errors.push(file.name + ': ' + (e.message || 'Die Datei konnte nicht gelesen werden.'));
    }
  }
  if (!state.manualOrder) sortStages();
  combine();
  update();
  $('status').textContent = errors.join(' · ');
}

try { const v = localStorage.getItem('sectionviewer.interval'); if (v != null) $('interval').value = v; } catch {}
const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
$('file').addEventListener('change', ev => { loadFiles([...ev.target.files]); ev.target.value = ''; });
for (const t of ['dragenter', 'dragover']) window.addEventListener(t, ev => { ev.preventDefault(); if ([...ev.dataTransfer.types].includes('Files')) drop.classList.add('over'); });
for (const t of ['dragleave', 'drop']) window.addEventListener(t, ev => { ev.preventDefault(); drop.classList.remove('over'); });
window.addEventListener('drop', ev => {
  // Gestaltungsvorlagen (.json) laden, alles andere als Tour
  const files = [...ev.dataTransfer.files], designs = files.filter(f => /\.json$/i.test(f.name)), tracks = files.filter(f => !designs.includes(f));
  designs.forEach(ovLoadDesign);
  if (tracks.length) loadFiles(tracks);
});
