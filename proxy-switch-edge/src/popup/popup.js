import { api } from '../api.js';
import { getConfig, isValidHost, isValidPort } from '../config.js';

const $ = (s) => document.querySelector(s);
const power = $('#power');
const powerWrap = $('#powerWrap');
const seg = $('#seg');
const hostEl = $('#host');
const portEl = $('#port');
const status = $('#status');
const statusText = $('#statusText');
const hostLabel = $('#hostLabel');

const NAMES = { http: 'HTTP', socks5: 'SOCKS5' };
let cfg;
let saveTimer;
let error = '';

/* ---------- rendering ---------- */

function renderStatus() {
  const p = cfg.profiles[cfg.scheme];
  if (error) {
    status.dataset.state = 'error';
    statusText.textContent = error;
  } else if (cfg.enabled) {
    status.dataset.state = 'on';
    statusText.textContent = `${NAMES[cfg.scheme]} · ${p.host}:${p.port}`;
  } else {
    status.dataset.state = 'off';
    statusText.textContent = 'Direct connection';
  }
}

function renderFields() {
  const p = cfg.profiles[cfg.scheme];
  hostEl.value = p.host;
  portEl.value = p.port;
  hostEl.removeAttribute('aria-invalid');
  portEl.removeAttribute('aria-invalid');
  hostLabel.textContent = `${NAMES[cfg.scheme]} Proxy`;
  portEl.placeholder = cfg.scheme === 'http' ? '8085' : '1080';
}

function render({ fields = false } = {}) {
  power.setAttribute('aria-checked', String(cfg.enabled));
  powerWrap.dataset.on = String(cfg.enabled);
  seg.dataset.scheme = cfg.scheme;
  seg.querySelectorAll('button').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.scheme === cfg.scheme)));
  if (fields) renderFields();
  renderStatus();
}

/* ---------- talking to the service worker ---------- */

async function push(next) {
  const res = await api.runtime.sendMessage({ type: 'update', cfg: next });
  cfg = res.cfg;
  error = res.ok ? '' : res.error;
  render();
}

const shake = (el) => {
  el.classList.remove('nope');
  void el.offsetWidth;
  el.classList.add('nope');
};

/* ---------- events ---------- */

power.addEventListener('click', () => {
  const next = structuredClone(cfg);
  next.enabled = !cfg.enabled;

  if (next.enabled && !fieldsValid()) {
    error = 'Enter a valid host and port first.';
    renderStatus();
    shake(power);
    return;
  }
  // Optimistic: flip right away, the worker confirms (or reverts) a moment later.
  cfg = next;
  error = '';
  render();
  push(next);
});

seg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-scheme]');
  if (!btn || btn.dataset.scheme === cfg.scheme) return;
  const next = structuredClone(cfg);
  next.scheme = btn.dataset.scheme;
  cfg = next;
  error = '';
  render({ fields: true });
  if (cfg.enabled) push(next);
  else api.runtime.sendMessage({ type: 'update', cfg: next });
});

function fieldsValid() {
  const okHost = isValidHost(hostEl.value);
  const okPort = isValidPort(portEl.value);
  hostEl.setAttribute('aria-invalid', String(!okHost));
  portEl.setAttribute('aria-invalid', String(!okPort));
  return okHost && okPort;
}

function onFieldInput() {
  // Allow pasting "host:port" into the host field.
  const m = hostEl.value.trim().match(/^([^:\s]+):(\d{1,5})$/);
  if (m) { hostEl.value = m[1]; portEl.value = m[2]; }
  portEl.value = portEl.value.replace(/\D/g, '');

  if (!fieldsValid()) return;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const next = structuredClone(cfg);
    next.profiles[next.scheme] = { host: hostEl.value.trim(), port: portEl.value.trim() };
    cfg = next;
    error = '';
    renderStatus();
    push(next);
  }, 250);
}

hostEl.addEventListener('input', onFieldInput);
portEl.addEventListener('input', onFieldInput);

/* ---------- init ---------- */

// Phones show the popup full-width: let the layout stretch.
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('android');

// Focus rings only for keyboard users (Chrome focuses the first control on open).
addEventListener('keydown', (e) => {
  if (e.key === 'Tab') document.documentElement.classList.add('kbd');
});

(async () => {
  cfg = await getConfig();
  render({ fields: true });
  const root = document.documentElement;
  root.classList.replace('boot', 'settle'); // visible, still no transitions
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('settle')));
})();
