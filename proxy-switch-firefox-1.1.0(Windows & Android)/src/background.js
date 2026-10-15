// Firefox version. Firefox's proxy.settings API is not available on Android and
// needs private-window access on desktop, so we route requests ourselves with
// proxy.onRequest, which works on both.
'use strict';

const DEFAULTS = {
  enabled: false,
  scheme: 'http', // 'http' | 'socks5'
  profiles: {
    http: { host: '127.0.0.1', port: '8085' },
    socks5: { host: '127.0.0.1', port: '1080' },
  },
};

const isValidHost = (h) => /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)$/i.test(String(h).trim());
const isValidPort = (p) => {
  const s = String(p).trim();
  return /^\d{1,5}$/.test(s) && +s >= 1 && +s <= 65535;
};

function normalize(config) {
  return {
    ...DEFAULTS,
    ...config,
    profiles: {
      http: { ...DEFAULTS.profiles.http, ...(config && config.profiles && config.profiles.http) },
      socks5: { ...DEFAULTS.profiles.socks5, ...(config && config.profiles && config.profiles.socks5) },
    },
  };
}

let cfg = normalize(null);
const ready = browser.storage.local.get('config').then(({ config }) => {
  cfg = normalize(config);
  return setIcon(cfg.enabled && settingsValid(cfg));
});

function settingsValid(c) {
  const { host, port } = c.profiles[c.scheme];
  return isValidHost(host) && isValidPort(port);
}

// Same idea as Chrome's "<local>": simple hostnames and loopback skip the proxy.
function isLocal(url) {
  let h;
  try { h = new URL(url).hostname; } catch (e) { return false; }
  h = h.replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127\./.test(h) || (!h.includes('.') && !h.includes(':'));
}

browser.proxy.onRequest.addListener(
  async (details) => {
    await ready;
    if (!cfg.enabled || !settingsValid(cfg) || isLocal(details.url)) return { type: 'direct' };
    const { host, port } = cfg.profiles[cfg.scheme];
    const socks = cfg.scheme === 'socks5';
    return {
      type: socks ? 'socks' : 'http',
      host: host.trim().replace(/^\[|\]$/g, ''),
      port: Number(port),
      proxyDNS: socks,
    };
  },
  { urls: ['<all_urls>'] }
);

async function setIcon(on) {
  const state = on ? 'on' : 'off';
  const path = {};
  for (const s of [16, 32, 48, 128]) path[s] = browser.runtime.getURL(`icons/${state}-${s}.png`);
  try {
    await browser.browserAction.setIcon({ path });
    await browser.browserAction.setTitle({ title: `Proxy Switch (${on ? 'on' : 'off'})` });
  } catch (e) {
    console.warn('Could not update the toolbar icon:', e);
  }
}

// The popup sends the full new config; we store it, apply it and report back.
async function update(next) {
  await ready;
  next = normalize(next);
  if (next.enabled && !settingsValid(next)) {
    next.enabled = false;
    cfg = next;
    await browser.storage.local.set({ config: cfg });
    await setIcon(false);
    return { ok: false, error: 'Enter a valid host and port.', cfg };
  }
  cfg = next;
  await browser.storage.local.set({ config: cfg });
  await setIcon(cfg.enabled);
  return { ok: true, cfg };
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'update') return undefined;
  return update(msg.cfg); // a returned Promise is the response
});
