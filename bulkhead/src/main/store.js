'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'bulkhead-state.json');

const DEFAULTS = {
  groups: [],
  active: 0,
  settings: {
    theme: 'system', themeResolved: 'light',
    sidebar: 'expanded',        // expanded | rail | autohide
    chip: true, density: 'comfortable', motion: 'system',
    badges: true, dockBadge: true, notifications: true,
    askPerms: true, devtools: false, hw: true, updates: true,
    defaultGroup: '', startup: 'restore', links: 'ask', tpDefault: true, proxy: 'system', ua: 'default',
    shortcuts: {
      palette: 'CmdOrCtrl+K', newGroup: 'CmdOrCtrl+N', toggleSidebar: 'CmdOrCtrl+Alt+S', nextGroup: 'CmdOrCtrl+Alt+Down', prevGroup: 'CmdOrCtrl+Alt+Up',
      newTab: 'CmdOrCtrl+T', closeTab: 'CmdOrCtrl+W', reopenTab: 'CmdOrCtrl+Shift+T', nextTab: 'Ctrl+Tab', reload: 'CmdOrCtrl+R'
    }
  }
};

let timer = null;

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    return { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}), shortcuts: { ...DEFAULTS.settings.shortcuts, ...((raw.settings || {}).shortcuts || {}) } } };
  } catch (_) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function write(state) {
  const clean = { ...state, groups: state.groups.map((g) => ({ ...g, tabs: g.tabs.map((t) => ({ id: t.id, title: t.title, url: t.url })) })) };
  try { fs.writeFileSync(file(), JSON.stringify(clean, null, 2)); } catch (_) { /* disk full etc: non-fatal */ }
}

function save(state, now) {
  clearTimeout(timer);
  if (now) return write(state);
  timer = setTimeout(() => write(state), 400);
}

module.exports = { load, save, DEFAULTS };
