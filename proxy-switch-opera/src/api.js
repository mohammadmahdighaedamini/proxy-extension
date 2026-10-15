// Firefox exposes promise-based `browser`; Chromium browsers expose `chrome`.
export const api = globalThis.browser ?? globalThis.chrome;
