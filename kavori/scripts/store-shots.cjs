// Captures the six store screenshots from the real app.
//   node scripts/store-shots.cjs <darwin|win32> <outDir>
// Needs Playwright (resolved from NODE_PATH or the working directory) and Xvfb on Linux.
// Starts demo-server.cjs itself. Output: <outDir>/shot1.png ... shot6.png at 2x.
const { _electron, chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLATFORM = process.argv[2] === 'win32' ? 'win32' : 'darwin';
const OUT = path.resolve(process.argv[3] || 'store-shots');
const ROOT = path.resolve(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(OUT, { recursive: true });

const GROUPS = [
  { name: 'Studio', color: 'c-vermilion', who: 'Aanya Rao', accent: '#C4452B', tabs: [['mail.example.com', 'Inbox', 3], ['board.example.com', 'Weekly board', 0], ['docs.example.com', 'Brand guidelines', 0]] },
  { name: 'Personal', color: 'c-blue', who: 'Aanya', accent: '#2F62D0', tabs: [['chat.example.net', 'Messages', 12], ['calendar.example.net', 'Calendar', 0]] },
  { name: 'Aster Co.', color: 'c-green', who: 'Client admin', accent: '#1F8049', tabs: [['app.example.org', 'Workspace', 0], ['reports.example.org', 'Reports', 0]] },
  { name: 'Help desk', color: 'c-violet', who: 'Support', accent: '#6A4DB0', tabs: [['desk.example.org', 'Open queue', 24]] },
  { name: 'Finance', color: 'c-amber', who: 'Finance team', accent: '#9A5B00', tabs: [['books.example.com', 'Ledger', 0], ['invoices.example.com', 'Invoices', 0]] },
];
const url = (host, t, n) => `http://${host}/?t=${encodeURIComponent(t)}&n=${n}`;
const hostsOf = (g) => g.tabs.map((t) => t[0]);

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'demo-server.cjs')], { stdio: 'inherit' });
  await sleep(500);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kavori-shots-'));
  const app = await _electron.launch({
    executablePath: require(path.join(ROOT, 'node_modules/electron')),
    args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=2', '--host-resolver-rules=MAP *.example.com 127.0.0.1, MAP *.example.net 127.0.0.1, MAP *.example.org 127.0.0.1', ROOT, '--user-data-dir=' + userData],
    env: { ...process.env, KAVORI_FAKE_PLATFORM: PLATFORM },
  });
  await app.firstWindow(); await sleep(1500);
  const page = (part) => app.windows().find((w) => w.url().includes(part));
  const main = page('index.html');
  const call = (p, ...a) => p.evaluate((a) => window.bh.call(...a), a);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('index.html')).setContentSize(1100, 740));
  await call(main, 'settings:set', { theme: 'light', sidebar: 'expanded', density: 'comfortable', motion: 'reduced' });

  // Build the groups, each logged in as a different person on the same demo site.
  for (const g of GROUPS) {
    const id = await call(main, 'group:create', { name: g.name, color: g.color });
    await app.evaluate(async ({ session }, { id, g, hosts }) => {
      const ses = session.fromPartition('persist:g-' + id);
      for (const host of hosts) for (const [name, value] of [['who', g.who], ['accent', g.accent]]) await ses.cookies.set({ url: 'http://' + host, name, value: encodeURIComponent(value) });
    }, { id, g, hosts: hostsOf(g) });
    for (let i = 0; i < g.tabs.length; i++) {
      if (i > 0) await call(main, 'tab:new', id);
      await call(main, 'tab:go', url(...g.tabs[i]));
      await sleep(700);
    }
  }
  const state = await call(main, 'state:get');
  const studio = state.groups[0];
  await call(main, 'group:select', 0); await sleep(800);
  await call(main, 'tab:select', studio.tabs[0].id); await sleep(1200);

  async function compose(name, layers) {
    const b = await chromium.launch(); const p = await b.newPage();
    const png = await p.evaluate(async (layers) => {
      const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + src; });
      const imgs = await Promise.all(layers.map((l) => load(l.png)));
      const c = document.createElement('canvas'); c.width = imgs[0].width; c.height = imgs[0].height;
      const ctx = c.getContext('2d'); const s = imgs[0].width / layers[0].w;
      layers.forEach((l, i) => ctx.drawImage(imgs[i], Math.round(l.x * s), Math.round(l.y * s)));
      return c.toDataURL('image/png').split(',')[1];
    }, layers);
    await b.close();
    fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(png, 'base64'));
    console.log('wrote', name);
  }

  const snapMain = (name) => app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('index.html'));
    const [cw] = w.getContentSize();
    const layers = [{ x: 0, y: 0, w: cw, png: (await w.webContents.capturePage()).toPNG().toString('base64') }];
    for (const c of w.contentView.children) {
      const wc = c.webContents; const b = c.getBounds();
      if (!wc || wc.isDestroyed() || !b.width || (c.getVisible && !c.getVisible())) continue;
      layers.push({ x: b.x, y: b.y, w: cw, png: (await wc.capturePage()).toPNG().toString('base64') });
    }
    return layers;
  }).then((layers) => compose(name, layers));

  const snapSettings = (name) => app.evaluate(async ({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('settings.html'));
    return [{ x: 0, y: 0, w: w.getContentSize()[0], png: (await w.webContents.capturePage()).toPNG().toString('base64') }];
  }).then((layers) => compose(name, layers));

  // 1. The window, Studio active
  await snapMain('shot1');

  // 2. Command palette
  await call(main, 'ui:palette', true); await sleep(500);
  await page('overlay.html').fill('.pal-input', 'stu'); await sleep(500);
  await snapMain('shot2');
  await page('overlay.html').press('.pal-input', 'Escape'); await sleep(600);

  // 3. New group sheet
  await call(main, 'ui:sheet', true); await sleep(600);
  const ov = page('overlay.html');
  await ov.fill('#group-name', 'Orchard'); await ov.click('button[aria-label="Teal"]'); await sleep(500);
  await snapMain('shot3');
  await ov.press('#group-name', 'Escape'); await sleep(600);

  // 4. Settings, Groups
  await call(main, 'settings:open', 'groups', studio.id); await sleep(1500); await page('settings.html').mouse.move(2, 2); await sleep(300);
  await snapSettings('shot4');

  // 5. Settings, Privacy & Data
  await page('settings.html').click('.nav-i:nth-child(4)'); await page('settings.html').mouse.move(2, 2); await sleep(1200);
  await snapSettings('shot5');

  // 6. Dark theme
  await call(main, 'settings:set', { theme: 'dark' }); await sleep(600);
  await app.evaluate(async ({ session }, { id, hosts }) => {
    const ses = session.fromPartition('persist:g-' + id);
    for (const host of hosts) await ses.cookies.set({ url: 'http://' + host, name: 'theme', value: 'dark' });
  }, { id: studio.id, hosts: hostsOf(GROUPS[0]) });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('settings.html'))?.close());
  await call(main, 'group:select', 0); await sleep(800);
  await call(main, 'tab:select', studio.tabs[0].id); await call(main, 'nav', 'reload'); await sleep(1800);
  await snapMain('shot6');

  await app.close(); server.kill();
})().catch((e) => { console.error(e); process.exit(1); });
