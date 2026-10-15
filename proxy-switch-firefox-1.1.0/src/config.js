// Shared by the popup (and the Chromium service worker).
import { api } from './api.js';

export const DEFAULTS = {
  enabled: false,
  scheme: 'http', // 'http' | 'socks5'
  profiles: {
    http: { host: '127.0.0.1', port: '8085' },
    socks5: { host: '127.0.0.1', port: '1080' },
  },
};

export const isValidHost = (h) =>
  /^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)$/i.test(String(h).trim());

export const isValidPort = (p) => {
  const s = String(p).trim();
  return /^\d{1,5}$/.test(s) && +s >= 1 && +s <= 65535;
};

export async function getConfig() {
  const { config } = await api.storage.local.get('config');
  return {
    ...DEFAULTS,
    ...config,
    profiles: {
      http: { ...DEFAULTS.profiles.http, ...config?.profiles?.http },
      socks5: { ...DEFAULTS.profiles.socks5, ...config?.profiles?.socks5 },
    },
  };
}

export const saveConfig = (config) => api.storage.local.set({ config });
