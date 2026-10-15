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
const fmtClock = ms => new Date(ms).toLocaleTimeString('de-DE');
const fmtClockShort = ms => new Date(ms).toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});

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

