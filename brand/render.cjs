// Renders every icon the website, the app, and the stores need from the Panes mark.
//   node brand/render.cjs        (needs Playwright, e.g. NODE_PATH=/path/to/node_modules)
// Outputs: website/public/*, kavori/build/*, brand/store/*
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = (p) => path.join(ROOT, p);
const FONT = OUT('website/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2');

const BLUE = '#3F74E8', RED = '#E5573A', GREEN = '#25A060', INK = '#14161A';
const panes = (fill) => [
  `<rect x="20" y="20" width="39" height="88" rx="12" fill="${fill || BLUE}"/>`,
  `<rect x="65" y="20" width="43" height="41" rx="12" fill="${fill || RED}"/>`,
  `<rect x="65" y="67" width="43" height="41" rx="12" fill="${fill || GREEN}"/>`,
].join('');
const scaled = (k, inner) => `<g transform="translate(64 64) scale(${k}) translate(-64 -64)">${inner}</g>`;
const grad = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2E36"/><stop offset="1" stop-color="#14161A"/></linearGradient></defs>';
const wrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${inner}</svg>`;

const ART = {
  // rounded app icon (Dock, Start menu, Linux launchers, PWA "any")
  squircle: wrap(`${grad}<rect width="128" height="128" rx="29" fill="url(#g)"/>${panes()}`),
  // favicon: flat, slightly larger panes so the three shapes survive at 16px
  favicon: wrap(`<rect width="128" height="128" rx="28" fill="${INK}"/>${scaled(1.16, panes())}`),
  // full-bleed square for stores and Apple touch icons (the OS applies its own mask)
  square: wrap(`${grad}<rect width="128" height="128" fill="url(#g)"/>${panes()}`),
  flat: wrap(`<rect width="128" height="128" fill="${INK}"/>${panes()}`),
  // maskable: everything important sits inside the central 80% circle
  maskable: wrap(`<rect width="128" height="128" fill="${INK}"/>${scaled(0.74, panes())}`),
  mark: wrap(panes()),
  mono: wrap(panes('#000')),
};

const textTile = (w, h, markPx, textPx) => `<div style="width:${w}px;height:${h}px;background:${INK};display:flex;align-items:center;justify-content:center;gap:${Math.round(markPx * 0.22)}px;font:600 ${textPx}px/1 Geist,system-ui;letter-spacing:-.035em;color:#fff">${ART.mark.replace('<svg ', `<svg width="${markPx}" height="${markPx}" `)}<span>Kavori</span></div>`;
const bare = (w, h, svg) => svg.replace('<svg ', `<svg width="${w}" height="${h}" `);
const centered = (w, h, markPx) => `<div style="width:${w}px;height:${h}px;background:${INK};display:flex;align-items:center;justify-content:center">${ART.mark.replace('<svg ', `<svg width="${markPx}" height="${markPx}" `)}</div>`;

const jobs = [];
const png = (out, w, h, html, opts = {}) => jobs.push({ out, w, h, html, ...opts });
const sq = (out, n, art, opts) => png(out, n, n, bare(n, n, ART[art]), opts);

// ---- website
for (const [f, n, a] of [['icon-192.png', 192, 'squircle'], ['icon-512.png', 512, 'squircle'], ['icon-maskable-512.png', 512, 'maskable'], ['apple-touch-icon.png', 180, 'square']]) sq(`website/public/${f}`, n, a);
// ---- app (installers and launchers)
for (const n of [16, 24, 32, 48, 64, 128, 256, 512]) sq(`kavori/build/icons/${n}x${n}.png`, n, 'squircle');
sq('kavori/build/icon.png', 1024, 'squircle');
sq('kavori/src/renderer/icon.png', 512, 'squircle');
// ---- Apple: App Store listing icon (full square, no alpha)
sq('brand/store/apple/app-store-icon-1024.png', 1024, 'square', { opaque: true });
// ---- Microsoft Store and MSIX tiles
for (const n of [44, 71, 150, 310]) sq(`brand/store/microsoft/Square${n}x${n}Logo.png`, n, 'flat');
sq('brand/store/microsoft/StoreLogo.png', 50, 'flat');
sq('brand/store/microsoft/StoreLogo.scale-200.png', 100, 'flat');
sq('brand/store/microsoft/StoreListingIcon-300.png', 300, 'flat');
sq('brand/store/microsoft/BoxArt-1080.png', 1080, 'flat');
png('brand/store/microsoft/Wide310x150Logo.png', 310, 150, textTile(310, 150, 86, 36));
png('brand/store/microsoft/SplashScreen.png', 620, 300, centered(620, 300, 130));
// ---- favicon source sizes (packed into .ico below)
const FAV = [16, 32, 48];
for (const n of FAV) sq(`.tmp/fav-${n}.png`, n, 'favicon');
const ICO = [16, 24, 32, 48, 64, 128, 256];

(async () => {
  fs.mkdirSync(OUT('.tmp'), { recursive: true });
  const b = await chromium.launch();
  const css = `@font-face{font-family:Geist;font-weight:100 900;src:url("file://${FONT}") format("woff2")}html,body{margin:0;background:transparent}`;
  const html = path.join(OUT('.tmp'), 'r.html');
  for (const j of jobs) {
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>${css}</style><body>${j.html}</body>`);
    const p = await b.newPage({ viewport: { width: j.w, height: j.h } });
    await p.goto('file://' + html);
    await p.evaluate(() => document.fonts.ready);
    const file = OUT(j.out);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: !j.opaque });
    await p.close();
  }
  await b.close();

  // pack .ico files from PNGs
  const ico = (pngs) => {
    const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
    let offset = 6 + 16 * pngs.length; const dir = [], data = [];
    for (const { n, buf } of pngs) {
      const e = Buffer.alloc(16);
      e[0] = n === 256 ? 0 : n; e[1] = n === 256 ? 0 : n; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
      e.writeUInt32LE(buf.length, 8); e.writeUInt32LE(offset, 12); offset += buf.length; dir.push(e); data.push(buf);
    }
    return Buffer.concat([head, ...dir, ...data]);
  };
  fs.writeFileSync(OUT('website/public/favicon.ico'), ico(FAV.map((n) => ({ n, buf: fs.readFileSync(OUT(`.tmp/fav-${n}.png`)) }))));
  fs.writeFileSync(OUT('kavori/build/icon.ico'), ico(ICO.map((n) => ({ n, buf: fs.readFileSync(OUT(`kavori/build/icons/${n === 24 ? 24 : n}x${n}.png`)) }))));

  // vector files
  const svg = (s) => s.replace('<svg ', '<svg ');
  fs.writeFileSync(OUT('website/public/favicon.svg'), ART.favicon);
  fs.writeFileSync(OUT('brand/favicon.svg'), ART.favicon);
  fs.writeFileSync(OUT('website/public/safari-pinned-tab.svg'), ART.mono);
  fs.writeFileSync(OUT('brand/mono.svg'), ART.mono);
  // BIMI wants SVG Tiny-PS: square, solid background, no gradients or scripts, with a title
  const bimi = `<?xml version="1.0" encoding="UTF-8"?>\n<svg version="1.2" baseProfile="tiny-ps" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>Kavori</title><rect width="128" height="128" fill="${INK}"/>${scaled(0.78, panes())}</svg>\n`;
  fs.writeFileSync(OUT('brand/bimi.svg'), bimi);
  fs.writeFileSync(OUT('website/public/bimi.svg'), bimi);
  fs.writeFileSync(OUT('kavori/build/icons/icon.svg'), ART.squircle);
  fs.rmSync(OUT('.tmp'), { recursive: true, force: true });
  console.log('rendered', jobs.length, 'images');
})();
