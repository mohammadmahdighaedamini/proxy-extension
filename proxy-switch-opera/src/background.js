import { getConfig, saveConfig, isValidHost, isValidPort } from './config.js';

const ICON_SIZES = [16, 32, 48, 128];

// In a service worker, relative paths resolve against src/, not the extension
// root, so build absolute URLs.
async function setIcon(on) {
  const state = on ? 'on' : 'off';
  const path = Object.fromEntries(
    ICON_SIZES.map((s) => [s, chrome.runtime.getURL(`icons/${state}-${s}.png`)])
  );
  try {
    await chrome.action.setIcon({ path });
    await chrome.action.setTitle({ title: `Proxy Switch (${on ? 'on' : 'off'})` });
  } catch (e) {
    console.warn('Could not update the toolbar icon:', e);
  }
}

// Pushes the config to Chrome. Returns { ok, error? }.
async function apply(cfg) {
  try {
    if (!cfg.enabled) {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      return { ok: true };
    }

    const { host, port } = cfg.profiles[cfg.scheme];
    if (!isValidHost(host) || !isValidPort(port)) {
      return { ok: false, error: 'Enter a valid host and port.' };
    }

    await chrome.proxy.settings.set({
      scope: 'regular',
      value: {
        mode: 'fixed_servers',
        rules: {
          singleProxy: { scheme: cfg.scheme, host: host.trim(), port: Number(port) },
          bypassList: ['<local>'],
        },
      },
    });

    const { levelOfControl } = await chrome.proxy.settings.get({ incognito: false });
    if (levelOfControl === 'controlled_by_other_extensions') {
      return { ok: false, error: 'Another extension is controlling the proxy.' };
    }
    if (levelOfControl === 'not_controllable') {
      return { ok: false, error: 'Proxy settings are locked by your administrator.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || 'Could not change the proxy.' };
  }
}

// The popup sends the full new config; we apply it and report back.
async function update(next) {
  const result = await apply(next);
  const cfg = result.ok ? next : { ...next, enabled: false };
  if (!result.ok) await chrome.proxy.settings.clear({ scope: 'regular' }).catch(() => {});
  await saveConfig(cfg);
  await setIcon(cfg.enabled);
  return { cfg, ...result };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'update') return false;
  update(msg.cfg).then(sendResponse);
  return true; // async response
});

async function restore() {
  const cfg = await getConfig();
  const result = await apply(cfg);
  await setIcon(cfg.enabled && result.ok);
}

chrome.runtime.onStartup.addListener(restore);
chrome.runtime.onInstalled.addListener(restore);
