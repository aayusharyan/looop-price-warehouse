'use strict';
const { app, BrowserWindow, WebContentsView, Menu, ipcMain, nativeTheme, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');

const R = (f) => path.join(__dirname, '..', 'renderer', f);
const PRELOAD = path.join(__dirname, 'preload.js');
const SIDE_RAIL = 56, SIDE_FULL = 244, HOT = 6;
const CHROME_UA = (ua) => ua.replace(/\sElectron\/\S+/, '').replace(/\sbulkhead\/\S+/i, '').replace(/\sBulkhead\/\S+/, '');

let win = null, overlay = null, settingsWin = null;
let S = null;                       // persisted state
const tabs = new Map();             // tabId -> { view, groupId, loading, title, url, canBack, canFwd }
const closed = [];                  // recently closed tabs for ⌘⇧T
let contentRect = { x: 56, y: 45, width: 800, height: 600 };
let overlayMode = 'none';           // none | palette | sheet | tip | toast
let toastTimer = null;

/* ------------------------------------------------------------------ state */
const uid = () => Math.random().toString(36).slice(2, 10);
const groupById = (id) => S.groups.find((g) => g.id === id);
const activeGroup = () => S.groups[S.active];
const partitionOf = (g) => (g.persistent ? 'persist:g-' + g.id : 'g-' + g.id);
const registrable = (h) => h.split('.').slice(-2).join('.');

function unreadOf(g) {
  let n = 0;
  for (const t of g.tabs) { const m = /^\((\d{1,3})\+?\)/.exec((tabs.get(t.id) || t).title || ''); if (m) n += +m[1]; }
  return n;
}

function snapshot() {
  return {
    settings: S.settings,
    active: S.active,
    groups: S.groups.map((g) => ({
      id: g.id, name: g.name, color: g.color, persistent: g.persistent, blockTP: g.blockTP, suspend: g.suspend,
      startPage: g.startPage || '', activeTab: g.activeTab, unread: S.settings.badges ? unreadOf(g) : 0,
      tabs: g.tabs.map((t) => {
        const rt = tabs.get(t.id);
        return { id: t.id, title: (rt && rt.title) || t.title || 'New tab', url: (rt && rt.url) || t.url || '',
          loading: !!(rt && rt.loading), canBack: !!(rt && rt.canBack), canFwd: !!(rt && rt.canFwd) };
      })
    }))
  };
}

let pushQueued = false;
function push() {
  if (pushQueued) return;
  pushQueued = true;
  setImmediate(() => {
    pushQueued = false;
    const snap = snapshot();
    for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('state', snap);
    if (overlay && !overlay.webContents.isDestroyed()) overlay.webContents.send('state', snap);
    if (process.platform === 'darwin') {
      const total = S.groups.reduce((a, g) => a + unreadOf(g), 0);
      app.dock && app.dock.setBadge(S.settings.dockBadge && total ? String(total) : '');
    }
    store.save(S);
  });
}

/* --------------------------------------------------------------- sessions */
const readySessions = new Set();
const UAS = {
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:128.0) Gecko/20100101 Firefox/128.0'
};
function applyNet(ses) {
  ses.setUserAgent(UAS[S.settings.ua] || CHROME_UA(app.userAgentFallback));
  ses.setProxy({ mode: S.settings.proxy === 'direct' ? 'direct' : 'system' });
}
function prepareSession(g) {
  const ses = session.fromPartition(partitionOf(g));
  if (readySessions.has(ses)) return ses;
  readySessions.add(ses);
  applyNet(ses);
  // Per-group third-party cookie blocking (read live from the group so the toggle applies at once).
  ses.webRequest.onHeadersReceived((d, cb) => {
    const gr = groupById(g.id);
    if (gr && gr.blockTP && d.resourceType !== 'mainFrame' && d.webContents) {
      try {
        const top = new URL(d.webContents.getURL()).hostname, host = new URL(d.url).hostname;
        if (top && registrable(top) !== registrable(host)) {
          const h = { ...d.responseHeaders };
          for (const k of Object.keys(h)) if (k.toLowerCase() === 'set-cookie') delete h[k];
          return cb({ responseHeaders: h });
        }
      } catch (_) { /* fall through */ }
    }
    cb({});
  });
  ses.setPermissionRequestHandler((wc, perm, cb, details) => {
    const gr = groupById(g.id);
    const ask = ['media', 'geolocation', 'notifications', 'mediaKeySystem'].includes(perm);
    if (!ask) return cb(true);
    if (perm === 'notifications' && !S.settings.notifications) return cb(false);
    gr.perms = gr.perms || {};
    const key = new URL(details.requestingUrl || 'http://x').origin + '|' + perm;
    if (key in gr.perms) return cb(gr.perms[key]);
    if (!S.settings.askPerms) return cb(true);
    const label = { media: 'use your camera or microphone', geolocation: 'know your location', notifications: 'show notifications', mediaKeySystem: 'play protected content' }[perm];
    dialog.showMessageBox(win, { type: 'question', buttons: ['Allow', 'Don’t Allow'], defaultId: 1, cancelId: 1,
      message: `“${new URL(details.requestingUrl).host}” wants to ${label}`,
      detail: `This answer is remembered for the “${gr.name}” group only.` }).then((r) => {
      gr.perms[key] = r.response === 0; cb(gr.perms[key]); push();
    });
  });
  return ses;
}

/* ------------------------------------------------------------------- tabs */
function newtabURL(g) { return 'file://' + R('newtab.html') + '?c=' + encodeURIComponent(g.color) + '&n=' + encodeURIComponent(g.name) + '&t=' + S.settings.themeResolved; }

function normalizeURL(input) {
  const q = input.trim();
  if (!q) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(q)) return q;
  if (/^localhost(:\d+)?(\/|$)/i.test(q) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(q)) return 'http://' + q;
  if (/^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q)) return 'https://' + q;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(q);
}

function ensureView(t, g) {
  let rt = tabs.get(t.id);
  if (rt) return rt;
  const ses = prepareSession(g);
  const view = new WebContentsView({ webPreferences: { session: ses, sandbox: true, contextIsolation: true, spellcheck: true } });
  view.setBackgroundColor(S.settings.themeResolved === 'dark' ? '#1B1D21' : '#FFFFFF');
  rt = { view, groupId: g.id, loading: false, title: t.title, url: t.url, canBack: false, canFwd: false };
  tabs.set(t.id, rt);
  const wc = view.webContents;
  const upd = () => { rt.canBack = wc.navigationHistory.canGoBack(); rt.canFwd = wc.navigationHistory.canGoForward(); push(); };
  wc.on('page-title-updated', (_, title) => { rt.title = t.title = title; push(); });
  wc.on('did-start-loading', () => { rt.loading = true; push(); });
  wc.on('did-stop-loading', () => { rt.loading = false; upd(); });
  wc.on('did-navigate', (_, url) => { rt.url = t.url = url.startsWith('file://') ? '' : url; upd(); });
  wc.on('did-navigate-in-page', (_, url) => { rt.url = t.url = url; upd(); });
  wc.on('focus', () => { g.lastUsed = Date.now(); });
  wc.setWindowOpenHandler(({ url }) => { openTab(g.id, url, true); return { action: 'deny' }; });
  wc.on('context-menu', (_, p) => pageMenu(wc, p, g));
  if (t.url) wc.loadURL(t.url); else wc.loadURL(g.startPage ? normalizeURL(g.startPage) : newtabURL(g));
  return rt;
}

function pageMenu(wc, p, g) {
  const items = [];
  if (p.linkURL) items.push({ label: 'Open Link in New Tab', click: () => openTab(g.id, p.linkURL, true) }, { label: 'Copy Link', click: () => require('electron').clipboard.writeText(p.linkURL) }, { type: 'separator' });
  if (p.isEditable) items.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' });
  else if (p.selectionText) items.push({ role: 'copy' });
  else items.push({ label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() }, { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() }, { label: 'Reload', click: () => wc.reload() });
  if (S.settings.devtools) items.push({ type: 'separator' }, { label: 'Inspect Element', click: () => { wc.inspectElement(p.x, p.y); } });
  Menu.buildFromTemplate(items).popup({ window: win });
}

function openTab(groupId, url, select = true) {
  const g = groupById(groupId); if (!g) return;
  const t = { id: uid(), title: url ? 'Loading…' : 'New tab', url: url || '' };
  g.tabs.push(t);
  if (select) { g.activeTab = g.tabs.length - 1; S.active = S.groups.indexOf(g); }
  show(); push();
  return t;
}

function closeTab(tabId) {
  for (const g of S.groups) {
    const i = g.tabs.findIndex((t) => t.id === tabId);
    if (i < 0) continue;
    const t = g.tabs[i];
    closed.push({ groupId: g.id, url: t.url, title: t.title });
    destroyView(tabId);
    g.tabs.splice(i, 1);
    if (!g.tabs.length) g.tabs.push({ id: uid(), title: 'New tab', url: '' });
    g.activeTab = Math.max(0, Math.min(g.activeTab > i ? g.activeTab - 1 : g.activeTab, g.tabs.length - 1));
    show(); push();
    toast(`Closed “${(t.title || 'tab').slice(0, 28)}”`, 'Undo', 'reopen');
    return;
  }
}

function destroyView(tabId) {
  const rt = tabs.get(tabId); if (!rt) return;
  try { win.contentView.removeChildView(rt.view); rt.view.webContents.close(); } catch (_) {}
  tabs.delete(tabId);
}

/* ------------------------------------------------------------- layout/show */
function show() {
  if (!win) return;
  const g = activeGroup();
  for (const [id, rt] of tabs) if (!g || g.tabs[g.activeTab]?.id !== id) rt.view.setVisible(false);
  if (g && g.tabs.length === 0) g.tabs.push({ id: uid(), title: 'New tab', url: '' });
  if (g) {
    g.lastUsed = Date.now();
    const t = g.tabs[g.activeTab] || g.tabs[0];
    const rt = ensureView(t, g);
    win.contentView.addChildView(rt.view);
    rt.view.setVisible(true);
    rt.view.setBounds(contentRect);
    if (overlayMode === 'none') rt.view.webContents.focus();
  }
  if (overlay) win.contentView.addChildView(overlay); // keep the overlay on top
}

function applyBounds() {
  const g = activeGroup(); if (!g) return;
  const t = g.tabs[g.activeTab]; const rt = t && tabs.get(t.id);
  if (rt) rt.view.setBounds(contentRect);
}

function setOverlay(mode, rect) {
  overlayMode = mode;
  const b = win.getContentBounds();
  const full = { x: 0, y: 0, width: b.width, height: b.height };
  overlay.setBounds(mode === 'none' ? { x: 0, y: 0, width: 0, height: 0 } : (rect || full));
  win.contentView.addChildView(overlay);
  if (mode === 'palette' || mode === 'sheet') overlay.webContents.focus();
  else if (mode === 'none') { const g = activeGroup(); const t = g && tabs.get(g.tabs[g.activeTab]?.id); t && t.view.webContents.focus(); }
}

function toast(text, action, cmd) {
  if (overlayMode === 'palette' || overlayMode === 'sheet') return;
  const b = win.getContentBounds();
  const w = 380, h = 64;
  setOverlay('toast', { x: Math.round((b.width - w) / 2 + (S.settings.sidebar === 'expanded' ? 100 : 28)), y: b.height - h - 12, width: w, height: h });
  overlay.webContents.send('overlay', { type: 'toast', text, action, cmd });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (overlayMode === 'toast') { overlay.webContents.send('overlay', { type: 'toast-hide' }); setTimeout(() => overlayMode === 'toast' && setOverlay('none'), 260); } }, 5000);
}

/* ------------------------------------------------------------------ windows */
function resolveTheme() {
  const t = S.settings.theme;
  nativeTheme.themeSource = t === 'system' ? 'system' : t;
  S.settings.themeResolved = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 720, minHeight: 480,
    titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 15 },
    backgroundColor: S.settings.themeResolved === 'dark' ? '#141518' : '#EDEEF1',
    vibrancy: undefined, show: false,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
  });
  win.loadFile(R('index.html'));
  win.once('ready-to-show', () => win.show());

  overlay = new WebContentsView({ webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true } });
  overlay.setBackgroundColor('#00000000');
  overlay.webContents.loadFile(R('overlay.html'));
  win.contentView.addChildView(overlay);
  overlay.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  win.on('resize', () => { if (overlayMode === 'palette' || overlayMode === 'sheet') setOverlay(overlayMode); });
  win.on('closed', () => { win = null; overlay = null; tabs.forEach((rt) => { try { rt.view.webContents.close(); } catch (_) {} }); tabs.clear(); });
  win.webContents.once('did-finish-load', () => { show(); push(); });
}

function openSettings(pane, gid) {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); if (pane) settingsWin.webContents.send('pane', pane, gid); return; }
  settingsWin = new BrowserWindow({
    width: 940, height: 640, minWidth: 860, minHeight: 560, resizable: true, fullscreenable: false,
    titleBarStyle: 'hidden', trafficLightPosition: { x: 16, y: 15 }, title: 'Settings',
    backgroundColor: S.settings.themeResolved === 'dark' ? '#141518' : '#EDEEF1',
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true }
  });
  settingsWin.loadFile(R('settings.html'), { query: { pane: pane || 'general', g: gid || '' } });
  settingsWin.on('closed', () => { settingsWin = null; });
}

/* --------------------------------------------------------------------- menu */
function cmd(name) { if (win && !win.isDestroyed()) win.webContents.send('cmd', name); }
function selectGroup(i) { if (!S.groups[i]) return; S.active = i; show(); push(); }
function stepGroup(d) { if (!S.groups.length) return; selectGroup((S.active + d + S.groups.length) % S.groups.length); }
function activeRT() { const g = activeGroup(); const t = g && g.tabs[g.activeTab]; return t && tabs.get(t.id); }

const acc = (id) => S.settings.shortcuts[id];
function buildMenu() {
  const groupItems = S.groups.slice(0, 9).map((g, i) => ({ label: g.name, accelerator: `CmdOrCtrl+${i + 1}`, click: () => selectGroup(i) }));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Bulkhead', submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => openSettings() },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' } ] },
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: acc('newTab'), click: () => { const g = activeGroup(); g && openTab(g.id); } },
      { label: 'New Group…', accelerator: acc('newGroup'), click: () => cmd('sheet') },
      { label: 'Search Groups, Tabs and Actions…', accelerator: acc('palette'), click: () => cmd('palette') },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: acc('closeTab'), click: () => { if (settingsWin && settingsWin.isFocused()) return settingsWin.close(); const g = activeGroup(); g && closeTab(g.tabs[g.activeTab].id); } },
      { label: 'Reopen Closed Tab', accelerator: acc('reopenTab'), click: reopen } ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Toggle Sidebar', accelerator: acc('toggleSidebar'), click: () => cmd('toggleSidebar') },
      { label: 'Reload', accelerator: acc('reload'), click: () => activeRT()?.view.webContents.reload() },
      { type: 'separator' }, { role: 'togglefullscreen' } ] },
    { label: 'History', submenu: [
      { label: 'Back', accelerator: 'CmdOrCtrl+[', click: () => activeRT()?.view.webContents.navigationHistory.goBack() },
      { label: 'Forward', accelerator: 'CmdOrCtrl+]', click: () => activeRT()?.view.webContents.navigationHistory.goForward() } ] },
    { label: 'Groups', submenu: [
      { label: 'Next Group', accelerator: acc('nextGroup'), click: () => stepGroup(1) },
      { label: 'Previous Group', accelerator: acc('prevGroup'), click: () => stepGroup(-1) },
      { label: 'Next Tab', accelerator: acc('nextTab'), click: () => stepTab(1) },
      { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => stepTab(-1) },
      { type: 'separator' }, ...groupItems ] },
    { role: 'windowMenu' }
  ]));
}
function stepTab(d) { const g = activeGroup(); if (!g) return; g.activeTab = (g.activeTab + d + g.tabs.length) % g.tabs.length; show(); push(); }
function reopen() { const c = closed.pop(); if (c && groupById(c.groupId)) openTab(c.groupId, c.url); }

/* ---------------------------------------------------------------------- IPC */
const H = (ch, fn) => ipcMain.handle(ch, (e, ...a) => fn(...a));
H('state:get', () => snapshot());

H('group:select', (i) => selectGroup(i));
H('group:create', (o) => {
  const g = { id: uid(), name: (o.name || 'Untitled').trim(), color: o.color || 'c-blue', persistent: o.persistent !== false,
    blockTP: o.blockTP !== undefined ? o.blockTP : S.settings.tpDefault, suspend: true, startPage: o.startPage || '', tabs: [{ id: uid(), title: 'New tab', url: '' }], activeTab: 0, lastUsed: Date.now() };
  S.groups.push(g); S.active = S.groups.length - 1;
  buildMenu(); show(); push();
  return g.id;
});
H('group:update', (id, patch) => {
  const g = groupById(id); if (!g) return;
  const wasPersistent = g.persistent;
  for (const k of ['name', 'color', 'persistent', 'blockTP', 'suspend', 'startPage']) if (k in patch) g[k] = patch[k];
  if (wasPersistent !== g.persistent) { // partition changes with storage mode: rebuild its views
    g.tabs.forEach((t) => destroyView(t.id)); show();
  }
  buildMenu(); push();
});
H('group:reorder', (ids) => {
  const cur = activeGroup()?.id;
  S.groups = ids.map(groupById).filter(Boolean).concat(S.groups.filter((g) => !ids.includes(g.id)));
  S.active = Math.max(0, S.groups.findIndex((g) => g.id === cur));
  buildMenu(); push();
});
async function clearGroup(id) {
  const g = groupById(id); if (!g) return;
  const ses = prepareSession(g);
  await ses.clearStorageData(); await ses.clearCache(); g.perms = {};
  toast(`Cleared data for “${g.name}”`);
}
async function deleteGroup(id) {
  const i = S.groups.findIndex((g) => g.id === id); if (i < 0) return;
  const g = S.groups[i];
  g.tabs.forEach((t) => destroyView(t.id));
  const ses = prepareSession(g); await ses.clearStorageData(); await ses.clearCache();
  S.groups.splice(i, 1);
  S.active = Math.max(0, Math.min(S.active > i ? S.active - 1 : S.active, S.groups.length - 1));
  buildMenu(); show(); push();
  toast(`Deleted “${g.name}”`);
}
const confirm = (parent, message, detail, ok) => dialog.showMessageBox(parent, { type: 'warning', buttons: [ok, 'Cancel'], defaultId: 1, cancelId: 1, message, detail }).then((r) => r.response === 0);
H('group:clear', (id) => clearGroup(id));
H('group:delete', (id) => deleteGroup(id));
H('group:confirm', async (id, what, fromSettings) => {
  const g = groupById(id); if (!g) return false;
  const parent = fromSettings && settingsWin ? settingsWin : win;
  if (what === 'clear') { if (await confirm(parent, `Clear data for “${g.name}”?`, 'Signs you out of every site in this group. Other groups are untouched.', 'Clear')) { await clearGroup(id); return true; } }
  if (what === 'delete') { if (await confirm(parent, `Delete “${g.name}”?`, 'Closes its tabs and erases all of its data. This can’t be undone.', 'Delete')) { await deleteGroup(id); return true; } }
  return false;
});
H('group:menu', (id) => {
  const g = groupById(id); if (!g) return;
  Menu.buildFromTemplate([
    { label: 'New Tab', click: () => openTab(g.id) },
    { label: 'Edit Group…', click: () => openSettings('groups', id) },
    { type: 'separator' },
    { label: 'Clear Data…', click: () => confirm(win, `Clear data for “${g.name}”?`, 'Signs you out of every site in this group. Other groups are untouched.', 'Clear').then((ok) => ok && clearGroup(id)) },
    { label: 'Delete Group…', click: () => confirm(win, `Delete “${g.name}”?`, 'Closes its tabs and erases all of its data. This can’t be undone.', 'Delete').then((ok) => ok && deleteGroup(id)) }
  ]).popup({ window: win });
});

H('tab:new', (gid) => { openTab(gid || activeGroup()?.id); });
H('tab:select', (id) => { for (const g of S.groups) { const i = g.tabs.findIndex((t) => t.id === id); if (i >= 0) { g.activeTab = i; S.active = S.groups.indexOf(g); show(); push(); } } });
H('tab:close', (id) => closeTab(id));
H('tab:go', (input, newTab) => {
  const url = normalizeURL(input); if (!url) return;
  const g = activeGroup(); if (!g) return;
  if (newTab) return openTab(g.id, url);
  const t = g.tabs[g.activeTab]; const rt = ensureView(t, g); rt.view.webContents.loadURL(url);
});
H('tab:open', (gid, tid) => { const g = groupById(gid); if (!g) return; const i = g.tabs.findIndex((t) => t.id === tid); if (i >= 0) { g.activeTab = i; S.active = S.groups.indexOf(g); show(); push(); } });
H('nav', (what) => { const rt = activeRT(); if (!rt) return; const wc = rt.view.webContents; if (what === 'back') wc.navigationHistory.goBack(); if (what === 'fwd') wc.navigationHistory.goForward(); if (what === 'reload') wc.reload(); });
H('reopen', () => reopen());

H('settings:set', (patch) => {
  Object.assign(S.settings, patch);
  if ('theme' in patch) resolveTheme();
  if ('proxy' in patch || 'ua' in patch) readySessions.forEach(applyNet);
  if ('shortcuts' in patch) buildMenu();
  push();
});
H('settings:reset', async () => {
  const r = await dialog.showMessageBox(settingsWin || win, { type: 'warning', buttons: ['Reset', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Reset all settings?', detail: 'Groups and their data are kept.' });
  if (r.response !== 0) return;
  S.settings = JSON.parse(JSON.stringify(store.DEFAULTS.settings)); resolveTheme(); buildMenu(); readySessions.forEach(applyNet); push();
});
H('shortcuts:record', (on) => { if (on) Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }])); else buildMenu(); });
H('sheet:open', () => { if (win) { win.focus(); cmd('sheet'); } });
H('privacy:info', async () => Promise.all(S.groups.map(async (g) => {
  let size = 0; try { size = await prepareSession(g).getCacheSize(); } catch (_) {}
  return { id: g.id, size, lastUsed: g.lastUsed || 0 };
})));
H('group:clear-all', async () => {
  const r = await dialog.showMessageBox(settingsWin || win, { type: 'warning', buttons: ['Clear All', 'Cancel'], defaultId: 1, cancelId: 1, message: 'Clear data for all groups?', detail: 'Signs you out of every site in every group.' });
  if (r.response !== 0) return;
  for (const g of S.groups) { const ses = prepareSession(g); await ses.clearStorageData(); await ses.clearCache(); g.perms = {}; }
  toast('Cleared data for all groups');
});
H('settings:open', (pane, gid) => { if (overlayMode !== 'none') setOverlay('none'); openSettings(pane, gid); });

H('ui:content-rect', (r) => { contentRect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.max(0, Math.round(r.width)), height: Math.max(0, Math.round(r.height)) }; applyBounds(); });
H('ui:palette', (open) => {
  if (open) { setOverlay('palette'); overlay.webContents.send('overlay', { type: 'palette' }); }
  else setOverlay('none');
});
H('ui:sheet', (open) => {
  if (open) { setOverlay('sheet'); overlay.webContents.send('overlay', { type: 'sheet' }); }
  else setOverlay('none');
});
H('ui:close', () => setOverlay('none'));
H('ui:tip', (tip) => {
  if (overlayMode === 'palette' || overlayMode === 'sheet' || overlayMode === 'toast') return;
  if (!tip) { if (overlayMode === 'tip') setOverlay('none'); return; }
  const wb = win.getContentBounds(), w = 360, h = 40;
  let rect, ax = 0;
  if (tip.side === 'r') rect = { x: Math.round(tip.x), y: Math.round(tip.y - h / 2), width: w, height: h };
  else { const x = Math.round(Math.min(Math.max(4, tip.x - w / 2), wb.width - w - 4)); rect = { x, y: Math.round(tip.y), width: w, height: h }; ax = tip.x - x; }
  setOverlay('tip', rect);
  overlay.webContents.send('overlay', { type: 'tip', text: tip.text, side: tip.side, ax });
});
H('ui:toast-action', (c) => { setOverlay('none'); if (c === 'reopen') reopen(); });
H('ui:overlay-done', () => { if (overlayMode === 'toast' || overlayMode === 'tip') setOverlay('none'); });
H('platform', () => ({ platform: process.platform, version: app.getVersion() }));

/* -------------------------------------------------------------------- boot */
app.setName('Bulkhead');
app.whenReady().then(() => {
  S = store.load();
  if (S.settings.startup === 'fresh') S.groups.forEach((g) => { g.tabs = [{ id: uid(), title: 'New tab', url: '' }]; g.activeTab = 0; });
  resolveTheme();
  nativeTheme.on('updated', () => { resolveTheme(); push(); });
  buildMenu();
  createWindow();
  setInterval(() => { // suspend idle groups to free memory
    const active = activeGroup();
    for (const g of S.groups) if (g !== active && g.suspend && Date.now() - (g.lastUsed || 0) > 30 * 60 * 1000) g.tabs.forEach((t) => destroyView(t.id));
  }, 60 * 1000);
  app.on('activate', () => { if (!win) { createWindow(); } });
});
app.on('open-url', async (e, url) => {
  e.preventDefault();
  if (!S || !S.groups.length) return;
  let g = groupById(S.settings.defaultGroup) || S.groups[0];
  if (S.settings.links === 'ask' && S.groups.length > 1) {
    const r = await dialog.showMessageBox(win, { type: 'question', buttons: [...S.groups.map((x) => x.name), 'Cancel'], cancelId: S.groups.length, message: 'Open this link in which group?', detail: url });
    if (r.response === S.groups.length) return;
    g = S.groups[r.response];
  }
  openTab(g.id, url); if (win) win.show();
});
app.on('before-quit', () => {
  for (const g of S.groups) if (!g.persistent) { try { session.fromPartition(partitionOf(g)).clearStorageData(); } catch (_) {} }
  store.save(S, true);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
