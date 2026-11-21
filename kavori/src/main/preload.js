'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const listeners = {};
for (const ch of ['state', 'cmd', 'overlay', 'pane']) {
  listeners[ch] = new Set();
  ipcRenderer.on(ch, (_e, ...args) => listeners[ch].forEach((fn) => fn(...args)));
}

contextBridge.exposeInMainWorld('bh', {
  // KAVORI_FAKE_PLATFORM lets the store-screenshot script render the Windows layout on any OS.
  platform: process.env.KAVORI_FAKE_PLATFORM || process.platform,
  call: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, fn) => { listeners[channel].add(fn); return () => listeners[channel].delete(fn); }
});
