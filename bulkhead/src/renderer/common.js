/* Shared helpers for every Bulkhead window (chrome, overlay, settings). */
(function () {
  const ICONS = {
    back: '<path d="M14.5 6 8.5 12l6 6"/>',
    fwd: '<path d="M9.5 6l6 6-6 6"/>',
    reload: '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    sidebar: '<rect x="3.5" y="4.5" width="17" height="15" rx="3.5"/><path d="M9.5 4.5v15"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.3-7 9-4.1-1.7-7-4.8-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7M10 11v5M14 11v5"/>',
    ret: '<path d="M19 6v5a3 3 0 0 1-3 3H5M9 10l-4 4 4 4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chevdown: '<path d="M6 9.5l6 6 6-6"/>',
    updown: '<path d="M8 9.5l4-4 4 4M8 14.5l4 4 4-4"/>',
    layers: '<path d="M12 4l8.5 4.5L12 13 3.5 8.5z"/><path d="M3.5 12.5L12 17l8.5-4.5"/><path d="M3.5 16.5L12 21l8.5-4.5"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>',
    keyboard: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17 10h.01M8 14h8"/>',
    terminal: '<path d="M5 7l5 5-5 5M12.5 17.5H19"/>',
    grip: '<g fill="currentColor" stroke="none"><circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/></g>'
  };

  const SVGNS = 'http://www.w3.org/2000/svg';

  /** h('div.cls#id', {attr}, ...children) — tiny DOM builder. */
  function h(sel, attrs, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel);
    const el = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][\w-]+/g) || []).forEach((p) => (p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1))));
    if (attrs && (attrs.nodeType || typeof attrs === 'string' || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k == null || k === false) continue;
      el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  function icon(name, cls) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'ic' + (cls ? ' ' + cls : ''));
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }
  const kbd = (k) => h('span.kbd', k);
  const kbds = (keys) => h('span.kbds', keys.map(kbd));
  const glyphOf = (name) => ((name || '').trim().charAt(0) || '?').toUpperCase();
  const tile = (g, size) => h('span.tile' + (size ? '.tile-' + size : '') + '.' + g.color, glyphOf(g.name));

  /** Display symbols for an Electron accelerator ("CmdOrCtrl+Alt+S" -> ⌘ ⌥ S). */
  function accelKeys(acc) {
    const map = { cmdorctrl: '⌘', command: '⌘', cmd: '⌘', ctrl: '⌃', control: '⌃', alt: '⌥', option: '⌥', shift: '⇧', up: '↑', down: '↓', left: '←', right: '→', tab: '⇥', return: '↵', enter: '↵', escape: 'esc', space: 'Space', backspace: '⌫' };
    return acc.split('+').map((p) => map[p.toLowerCase()] || p.toUpperCase());
  }

  /** Apply theme + motion + density from settings to <html>. */
  function applyLook(S) {
    const r = document.documentElement;
    r.dataset.theme = S.themeResolved;
    r.dataset.density = S.density;
    const reduce = S.motion === 'reduced' || (S.motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    r.dataset.motion = reduce ? 'reduced' : 'full';
  }

  function mountSprite() { /* icons are inlined per use; nothing to mount */ }

  window.UI = { h, add, icon, kbd, kbds, glyphOf, tile, accelKeys, applyLook, mountSprite, ICONS };
})();
