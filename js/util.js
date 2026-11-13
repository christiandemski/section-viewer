'use strict';
const $ = id => document.getElementById(id);
const nf0 = new Intl.NumberFormat('de-DE', {maximumFractionDigits: 0});
const nf1 = new Intl.NumberFormat('de-DE', {minimumFractionDigits: 1, maximumFractionDigits: 1});
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const pad2 = n => String(n).padStart(2, '0');
function fmtDur(s) {
  s = Math.round(s);
  return Math.floor(s / 3600) + ':' + pad2(Math.floor(s % 3600 / 60)) + ':' + pad2(s % 60);
}
// Pace in Minuten pro Kilometer aus m/s; langsamer als 20:50 /km gilt als Stehen
const paceSec = mps => mps == null || mps < 0.8 ? null : 1000 / mps;
function fmtPace(mps) {
  const p = paceSec(mps);
  if (p == null) return '–';
  const s = Math.round(p);
  return Math.floor(s / 60) + ':' + pad2(s % 60);
}
const fmtClock = ms => new Date(ms).toLocaleTimeString('de-DE');
const fmtClockShort = ms => new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});

// Vorbelegung der Formularfelder aus dem HTML, für „Standard“
const defaultsOf = ids => Object.fromEntries(ids.map(id => {
  const el = $(id);
  return [id, el.type === 'checkbox' ? el.defaultChecked : el.tagName === 'SELECT' ? ([...el.options].find(o => o.defaultSelected) || el.options[0]).value : el.defaultValue];
}));

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
  }
}
function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1200);
}

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}


// Elemente (sel) in box per Ziehen oder Alt + Pfeiltaste umordnen; done läuft danach
function makeSortable(box, sel, done) {
  let drag = null;
  box.addEventListener('dragstart', ev => {
    drag = ev.target.closest(sel);
    if (!drag) return;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', drag.dataset.f || '');
    setTimeout(() => drag && drag.classList.add('drag'));
  });
  box.addEventListener('dragover', ev => {
    const over = ev.target.closest(sel);
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
    done();
  });
  box.addEventListener('keydown', ev => {
    const d = {ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1}[ev.key], item = ev.target.closest(sel);
    if (!ev.altKey || !d || !item) return;
    ev.preventDefault();
    const sib = d < 0 ? item.previousElementSibling : item.nextElementSibling;
    if (!sib || !sib.matches(sel)) return;
    box.insertBefore(item, d < 0 ? sib : sib.nextSibling);
    ev.target.focus();
    const all = [...box.querySelectorAll(sel)];
    announce(`${item.textContent.trim()}: Position ${all.indexOf(item) + 1} von ${all.length}`);
    done();
  });
}

// Kurze Ansage für Bildschirmleser
function announce(text) {
  const el = document.getElementById('live');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 30);
}
