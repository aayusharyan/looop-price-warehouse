(function () {
  const { h, icon, kbds, tile } = UI;
  const $ = (id) => document.getElementById(id);
  const app = $('app'), rowsEl = $('rows'), tabsEl = $('tabs'), contentEl = $('content');
  let S = null, peekTimer = null, lastRect = '', trackUntil = 0;

  /* ---------------------------------------------------------- static chrome */
  $('b-side').append(icon('sidebar'));
  $('b-back').append(icon('back'));
  $('b-fwd').append(icon('fwd'));
  $('b-reload').append(icon('reload'));
  $('b-search').append(icon('search', 'ic-sm'), 'Search', kbds(['⌘', 'K']));
  $('b-new').append(h('span.tile.tile-ghost', icon('plus')), h('span.g-label', h('span.g-name', 'New group')));
  $('b-set').append(h('span.tile.tile-flat', icon('sliders', 'ic-lg')), h('span.g-label', h('span.g-name', 'Settings')));

  const call = (...a) => window.bh.call(...a);
  $('b-side').onclick = toggleSidebar;
  $('b-back').onclick = () => call('nav', 'back');
  $('b-fwd').onclick = () => call('nav', 'fwd');
  $('b-reload').onclick = () => call('nav', 'reload');
  $('b-search').onclick = () => call('ui:palette', true);
  $('b-new').onclick = () => call('ui:sheet', true);
  $('b-set').onclick = () => call('settings:open');

  function toggleSidebar() { call('settings:set', { sidebar: S.settings.sidebar === 'expanded' ? 'rail' : 'expanded' }); }

  /* -------------------------------------------------------------- tooltips */
  let tipTimer = null, tipShown = false;
  function hideTip() { clearTimeout(tipTimer); if (tipShown) { tipShown = false; call('ui:tip', null); } }
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    clearTimeout(tipTimer);
    if (!t) return hideTip();
    const side = t.classList.contains('tip-r') ? 'r' : 'b';
    if (side === 'r' && app.dataset.mode === 'expanded' && !app.classList.contains('autohide')) return;
    tipTimer = setTimeout(() => {
      const r = t.getBoundingClientRect();
      tipShown = true;
      call('ui:tip', { text: t.dataset.tip, side, x: side === 'r' ? r.right + 10 : r.left + r.width / 2, y: side === 'r' ? r.top + r.height / 2 : r.bottom + 8 });
    }, 450);
  });
  document.addEventListener('mousedown', hideTip);
  window.addEventListener('blur', hideTip);

  /* ------------------------------------------------------- content bounds */
  function reportBounds() {
    const r = contentEl.getBoundingClientRect();
    const inset = app.classList.contains('autohide') && !app.classList.contains('peek') ? 6 : 0;
    const x = r.left + 1 + inset;
    const rect = { x, y: r.top + 1, width: r.width - 1 - inset, height: r.height - 1 };
    const key = [rect.x, rect.y, rect.width, rect.height].map(Math.round).join();
    if (key !== lastRect) { lastRect = key; call('ui:content-rect', rect); }
  }
  function track(ms) {
    const was = trackUntil > performance.now();
    trackUntil = performance.now() + ms;
    if (was) return;
    (function loop() { reportBounds(); if (performance.now() < trackUntil) requestAnimationFrame(loop); })();
  }
  new ResizeObserver(reportBounds).observe(contentEl);
  window.addEventListener('resize', reportBounds);

  /* ----------------------------------------------------------- autohide rail */
  const peek = (on) => { clearTimeout(peekTimer); if (on) { if (!app.classList.contains('peek')) { app.classList.add('peek'); track(500); } } else { peekTimer = setTimeout(() => { app.classList.remove('peek'); track(500); }, 380); } };
  $('hot').addEventListener('mouseenter', () => peek(true));
  $('side').addEventListener('mouseenter', () => peek(true));
  $('side').addEventListener('mouseleave', () => peek(false));

  /* ---------------------------------------------------------------- render */
  const rowMap = new Map(), tabMap = new Map();
  let dragId = null;

  function groupRow(g) {
    const label = h('span.g-label', h('span.g-name'), h('span.g-sub'));
    const el = h('button.grow.has-tip.tip-r', { draggable: 'true', 'aria-label': g.name }, h('span.tile'), label);
    el.onclick = () => call('group:select', S.groups.findIndex((x) => x.id === g.id));
    el.oncontextmenu = (e) => { e.preventDefault(); call('group:menu', g.id); };
    el.ondragstart = (e) => { dragId = g.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id); hideTip(); };
    el.ondragend = () => { dragId = null; rowMap.forEach((r) => r.el.classList.remove('dragging', 'drop-before', 'drop-after')); };
    el.ondragover = (e) => {
      if (!dragId || dragId === g.id) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
      el.classList.toggle('drop-before', before); el.classList.toggle('drop-after', !before);
    };
    el.ondragleave = () => el.classList.remove('drop-before', 'drop-after');
    el.ondrop = (e) => {
      e.preventDefault();
      const before = el.classList.contains('drop-before');
      el.classList.remove('drop-before', 'drop-after');
      if (!dragId || dragId === g.id) return;
      const ids = S.groups.map((x) => x.id).filter((x) => x !== dragId);
      const at = ids.indexOf(g.id) + (before ? 0 : 1);
      ids.splice(at, 0, dragId);
      call('group:reorder', ids);
    };
    return { el, tile: el.querySelector('.tile'), name: el.querySelector('.g-name'), sub: el.querySelector('.g-sub'), label, count: null, dot: null };
  }

  function renderGroups() {
    const seen = new Set();
    S.groups.forEach((g, i) => {
      let r = rowMap.get(g.id);
      if (!r) { r = groupRow(g); rowMap.set(g.id, r); }
      seen.add(g.id);
      r.tile.className = 'tile ' + g.color;
      r.tile.textContent = UI.glyphOf(g.name);
      r.name.textContent = g.name;
      r.sub.textContent = g.tabs.length + (g.tabs.length === 1 ? ' tab' : ' tabs');
      r.el.classList.toggle('is-active', i === S.active);
      r.el.dataset.tip = g.unread ? `${g.name}  ·  ${g.unread} unread` : g.name;
      r.el.setAttribute('aria-label', g.name);
      if (i === S.active) r.el.setAttribute('aria-current', 'true'); else r.el.removeAttribute('aria-current');
      const txt = g.unread > 99 ? '99+' : String(g.unread);
      if (g.unread && !r.count) { r.count = h('span.badge.g-count'); r.dot = h('span.badge.g-dot'); r.el.append(r.count, r.dot); }
      if (!g.unread && r.count) { r.count.remove(); r.dot.remove(); r.count = r.dot = null; }
      if (r.count) { if (r.count.textContent !== txt) { r.count.textContent = r.dot.textContent = txt; r.dot.style.animation = 'none'; void r.dot.offsetWidth; r.dot.style.animation = ''; } }
      // keep DOM order = group order
      if (rowsEl.children[i + 1] !== r.el) rowsEl.insertBefore(r.el, rowsEl.children[i + 1] || null);
    });
    rowMap.forEach((r, id) => { if (!seen.has(id)) { r.el.remove(); rowMap.delete(id); } });
    $('plate').style.setProperty('--i', S.active);
    $('plate').hidden = S.groups.length === 0;
  }

  function renderTabs(g) {
    const seen = new Set();
    g.tabs.forEach((t, i) => {
      let r = tabMap.get(t.id);
      if (!r) {
        const mark = h('span.tab-mark'), spin = h('span.spin'), title = h('span.tab-title');
        const main = h('button.tab-main', mark, title);
        const x = h('button.tab-x', { 'aria-label': 'Close tab', onClick: (e) => { e.stopPropagation(); call('tab:close', t.id); } }, icon('x', 'ic-sm'));
        const el = h('div.tab', main, x);
        main.onclick = () => call('tab:select', t.id);
        el.onauxclick = (e) => { if (e.button === 1) call('tab:close', t.id); };
        r = { el, main, mark, spin, title, loading: false };
        tabMap.set(t.id, r);
      }
      seen.add(t.id);
      r.title.textContent = t.title;
      r.el.classList.toggle('is-active', i === g.activeTab);
      if (t.loading !== r.loading) { r.loading = t.loading; r.main.replaceChild(t.loading ? r.spin : r.mark, t.loading ? r.mark : r.spin); }
      const plus = tabsEl.querySelector('.plus');
      const kids = [...tabsEl.children].filter((c) => !c.classList.contains('plus') && !c.classList.contains('leaving'));
      if (kids[i] !== r.el) tabsEl.insertBefore(r.el, kids[i] || plus || null);
    });
    tabMap.forEach((r, id) => {
      if (seen.has(id)) return;
      tabMap.delete(id);
      r.el.classList.add('leaving');
      setTimeout(() => r.el.remove(), 170);
    });
  }

  const plusBtn = h('button.ibtn.has-tip.plus', { 'data-tip': 'New tab  ⌘T', 'aria-label': 'New tab', onClick: () => call('tab:new') }, icon('plus'));
  tabsEl.append(plusBtn);

  let lastActiveId = null;
  function render() {
    UI.applyLook(S.settings);
    const mode = S.settings.sidebar;
    const empty = S.groups.length === 0;
    app.dataset.mode = mode === 'expanded' && !empty ? 'expanded' : 'rail';
    app.classList.toggle('autohide', mode === 'autohide' && !empty);
    if (mode !== 'autohide') app.classList.remove('peek');
    app.classList.toggle('no-chip', !S.settings.chip);
    track(520);

    renderGroups();
    $('empty').hidden = !empty;
    $('b-search').hidden = empty;
    $('b-new').hidden = false;
    ['b-back', 'b-fwd', 'b-reload'].forEach((id) => $(id).classList.toggle('is-off', empty));

    const g = S.groups[S.active];
    tabsEl.hidden = !g; $('chip').hidden = !g; $('iso').hidden = !g;
    if (g) {
      const t = g.tabs[g.activeTab] || {};
      tabsEl.className = 'tabs ' + g.color;
      $('chip').className = 'chip-g ' + g.color;
      $('chip').replaceChildren(tile(g, 'sm'), g.name);
      contentEl.className = 'content ' + g.color;
      $('iso').replaceChildren(icon('shield', 'ic-sm'), 'Isolated');
      $('iso').dataset.tip = `Cookies, storage and cache are private to ${g.name}`;
      $('b-back').classList.toggle('is-off', !t.canBack);
      $('b-fwd').classList.toggle('is-off', !t.canFwd);
      $('loadbar').hidden = !t.loading;
      renderTabs(g);
      if (lastActiveId !== g.id) { lastActiveId = g.id; }
    } else {
      contentEl.className = 'content';
      $('loadbar').hidden = true;
      tabMap.forEach((r) => r.el.remove()); tabMap.clear();
    }
    document.title = g ? `${g.name} — Bulkhead` : 'Bulkhead';
  }

  /* ------------------------------------------------------------- first run */
  function buildEmpty() {
    const mini = (glyph, color, name) => h('div.mini',
      h('div.mini-h', h('span.tile.tile-sm.' + color, glyph), name),
      h('div.sk', { style: { width: '90%' } }), h('div.sk', { style: { width: '70%' } }), h('div.sk', { style: { width: '80%' } }),
      h('div.mini-f', icon('lock', 'ic-sm'), 'Own logins and storage'));
    $('empty').append(h('div.empty-in',
      h('p.eyebrow', 'Welcome to Bulkhead'),
      h('h1.empty-h', 'One browser. Every account, kept apart.'),
      h('p.empty-p', 'A group is a sealed browser session with its own logins, cookies, storage and cache. Open the same site in three groups and stay signed in as three different people, side by side.'),
      h('div.empty-act',
        h('button.btn.btn-primary.btn-lg', { onClick: () => call('ui:sheet', true) }, 'Create your first group'),
        h('span', 'or press ', kbds(['⌘', 'N']))),
      h('div.demo', mini('S', 'c-vermilion', 'Studio'), mini('P', 'c-blue', 'Personal'), mini('A', 'c-green', 'Aster Co.')),
      h('p.cap', 'The same site, open three times, each signed in separately.')));
  }
  buildEmpty();

  /* ----------------------------------------------------------------- wiring */
  window.bh.on('state', (s) => { S = s; render(); });
  window.bh.on('cmd', (c) => {
    if (c === 'palette') call('ui:palette', true);
    else if (c === 'sheet') call('ui:sheet', true);
    else if (c === 'toggleSidebar') toggleSidebar();
  });
  call('state:get').then((s) => { S = s; render(); reportBounds(); });
})();
