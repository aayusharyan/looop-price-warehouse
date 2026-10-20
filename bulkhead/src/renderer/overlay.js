(function () {
  const { h, icon, kbd, kbds, tile } = UI;
  const root = document.getElementById('root');
  const call = (...a) => window.bh.call(...a);
  let S = null, mode = 'none', pal = null, sheet = null, toastEl = null;

  window.bh.on('state', (s) => { S = s; UI.applyLook(s.settings); if (pal) pal.refresh(); if (sheet) sheet.refresh(); });
  call('state:get').then((s) => { S = s; UI.applyLook(s.settings); });
  window.bh.on('overlay', (m) => {
    if (m.type === 'palette') openPalette();
    else if (m.type === 'sheet') openSheet();
    else if (m.type === 'tip') showTip(m);
    else if (m.type === 'toast') showToast(m);
    else if (m.type === 'toast-hide') hideToast();
  });

  const animateOut = (nodes, done) => { nodes.forEach((n) => n && n.classList.add('out')); setTimeout(done, UI.reduced ? 10 : 170); };
  function close() {
    const els = mode === 'palette' ? [pal && pal.scrim, pal && pal.box] : mode === 'sheet' ? [sheet && sheet.scrim, sheet && sheet.box] : [];
    mode = 'none';
    animateOut(els, () => { root.replaceChildren(); pal = sheet = null; call('ui:close'); });
  }

  /* ------------------------------------------------------------- tooltip */
  function showTip(m) {
    root.replaceChildren();
    const t = h('div.tip.' + m.side, m.text);
    if (m.side === 'b') { t.style.left = m.ax + 'px'; }
    root.append(h('div.tipbox', t));
    requestAnimationFrame(() => t.classList.add('in'));
  }

  /* --------------------------------------------------------------- toast */
  function showToast(m) {
    root.replaceChildren();
    const act = m.action && h('button.toast-act', { onClick: () => call('ui:toast-action', m.cmd) }, m.action);
    toastEl = h('div.toast', m.text, act);
    root.append(h('div.toastbox', toastEl));
  }
  function hideToast() { toastEl && toastEl.classList.add('out'); }

  /* ------------------------------------------------------------- palette */
  function openPalette() {
    mode = 'palette';
    let q = '', sel = 0, rows = [];
    const input = h('input.pal-input', { type: 'text', placeholder: 'Switch group, open a tab, run a command', 'aria-label': 'Search groups, tabs and actions', spellcheck: 'false', autocomplete: 'off' });
    const body = h('div.pal-body');
    const scrim = h('div.scrim', { onClick: close });
    const box = h('div.pal', { role: 'dialog', 'aria-label': 'Search groups, tabs and actions' },
      h('div.pal-in', icon('search', 'ic-lg'), input, kbd('esc')),
      body,
      h('div.pal-foot',
        h('span', kbds(['↑', '↓']), 'Navigate'), h('span', kbd('↵'), 'Open'),
        h('span', kbds(['⌘', '↵']), 'Open in new tab'),
        h('span', { style: { marginLeft: 'auto' } }, kbd('esc'), 'Close')));
    root.replaceChildren(scrim, h('div.layer', { style: { top: '92px' } }, box));
    pal = { scrim, box, refresh: build };
    input.focus();

    const has = (s) => !q || s.toLowerCase().includes(q.toLowerCase());
    const hl = (s) => {
      const i = q ? s.toLowerCase().indexOf(q.toLowerCase()) : -1;
      return i < 0 ? [s] : [s.slice(0, i), h('mark.hl', s.slice(i, i + q.length)), s.slice(i + q.length)];
    };

    function build() {
      rows = [];
      const sections = [];
      const ag = S.groups[S.active];
      const looksUrl = q.trim() && (/^[a-z]+:\/\//i.test(q) || /^[^\s/]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(q.trim()) || /^localhost/.test(q.trim()));
      if (q.trim() && ag) rows_add('Go', [{ ic: looksUrl ? 'fwd' : 'search', label: looksUrl ? `Go to ${q.trim()}` : `Search the web for “${q.trim()}”`, keys: ['↵'], run: (nt) => call('tab:go', q.trim(), nt) }], sections);
      const gs = S.groups.map((g, i) => ({ g, i })).filter((x) => has(x.g.name));
      rows_add('Groups', gs.map((x) => ({
        tile: x.g, label: x.g.name, meta: x.g.tabs.length + (x.g.tabs.length === 1 ? ' tab' : ' tabs'), keys: ['⌘', String(x.i + 1)], run: () => call('group:select', x.i) })), sections);
      const ts = [];
      S.groups.forEach((g, gi) => g.tabs.forEach((t) => { if (has(t.title) || has(g.name) || has(t.url)) ts.push({ g, t, gi }); }));
      rows_add('Open tabs', ts.slice(0, 5).map((x) => ({
        mark: x.g, label: x.t.title, group: x.g.name, host: x.t.url ? x.t.url.replace(/^https?:\/\//, '').slice(0, 34) : '', run: () => call('tab:open', x.g.id, x.t.id) })), sections);
      const A = [];
      if (ag) {
        A.push({ ic: 'plus', label: `New tab in ${ag.name}`, keys: ['⌘', 'T'], run: () => call('tab:new', ag.id) });
        A.push({ ic: 'edit', label: `Edit group ${ag.name}…`, run: () => call('settings:open', 'groups', ag.id) });
        A.push({ ic: 'trash', label: `Clear data for ${ag.name}…`, run: () => call('group:confirm', ag.id, 'clear') });
        A.push({ ic: 'ret', label: 'Reopen closed tab', keys: ['⌘', '⇧', 'T'], run: () => call('reopen') });
      }
      A.push({ ic: 'plus', label: 'New group…', keys: ['⌘', 'N'], run: () => call('ui:sheet', true), keep: true });
      A.push({ ic: 'sliders', label: 'Open Settings', keys: ['⌘', ','], run: () => call('settings:open') });
      A.push({ ic: 'sidebar', label: 'Toggle sidebar', keys: ['⌘', '⌥', 'S'], run: () => call('settings:set', { sidebar: S.settings.sidebar === 'expanded' ? 'rail' : 'expanded' }) });
      rows_add('Actions', A.filter((a) => has(a.label)).slice(0, 5), sections);

      sel = Math.min(sel, Math.max(0, rows.length - 1));
      body.replaceChildren();
      if (!rows.length) body.append(h('div.pal-none', `No groups, tabs or actions match “${q}”.`));
      sections.forEach((s) => body.append(s));
      mark();
    }

    function rows_add(title, items, sections) {
      if (!items.length) return;
      const frag = h('div', h('div.pal-sec', title));
      items.forEach((it) => {
        const idx = rows.length;
        const lead = it.tile ? h('span.pal-ic', tile(it.tile, 'md')) : it.mark ? h('span.pal-ic', h('span.tile.tile-xs.' + it.mark.color)) : h('span.pal-ic', icon(it.ic));
        const right = h('span.grow-r', it.meta && h('span', it.meta), it.host && h('span.pal-host', it.host), it.keys && (it.keys.length > 1 || it.tile ? kbds(it.keys) : kbd(it.keys[0])));
        const el = h('button.pal-row', { role: 'option', onMouseMove: () => { if (sel !== idx) { sel = idx; mark(); } }, onClick: (e) => activate(idx, e.metaKey) },
          lead, h('span.pal-t', hl(it.label), it.group && h('span.pal-m', it.group)), right);
        rows.push({ el, it });
        frag.append(el);
      });
      sections.push(frag);
    }

    function mark() {
      rows.forEach((r, i) => r.el.classList.toggle('is-sel', i === sel));
      rows[sel] && rows[sel].el.scrollIntoView({ block: 'nearest' });
    }

    function activate(i, meta) {
      const r = rows[i]; if (!r) return;
      const keep = r.it.keep;
      if (keep) { r.it.run(); return; } // the sheet replaces the palette
      mode = 'none';
      pal.scrim.classList.add('out'); pal.box.classList.add('out');
      setTimeout(() => { root.replaceChildren(); pal = null; call('ui:close').then(() => r.it.run(!!meta)); }, 140);
    }

    input.addEventListener('input', () => { q = input.value; sel = 0; build(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % Math.max(1, rows.length); mark(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + rows.length) % Math.max(1, rows.length); mark(); }
      else if (e.key === 'Enter') { e.preventDefault(); activate(sel, e.metaKey); }
    });
    build();
  }

  /* --------------------------------------------------------------- sheet */
  const COLORS = [['c-vermilion', 'Vermilion'], ['c-amber', 'Amber'], ['c-green', 'Green'], ['c-teal', 'Teal'], ['c-blue', 'Blue'], ['c-violet', 'Violet'], ['c-rose', 'Rose'], ['c-graphite', 'Graphite']];

  function openSheet() {
    mode = 'sheet';
    const used = new Set(S.groups.map((g) => g.color));
    const v = { name: '', color: (COLORS.find((c) => !used.has(c[0])) || COLORS[S.groups.length % COLORS.length])[0], persistent: true, tp: S.settings.tpDefault !== false };

    const tileEl = h('span.tile.tile-lg');
    const nameIn = h('input.field.field-lg#group-name', { type: 'text', placeholder: 'Group name', spellcheck: 'false', autocomplete: 'off' });
    const swatches = COLORS.map(([c, label]) => h('button.swatch.' + c, { 'aria-label': label, onClick: () => { v.color = c; sync(); } }, icon('check')));
    const desc = h('div.row-d');
    const thumb = h('span.thumb');
    const segBtns = [['Persistent', true], ['Temporary', false]].map(([l, val]) => h('button', { onClick: () => { v.persistent = val; sync(); } }, l));
    const sw = h('button.sw', { role: 'switch', 'aria-label': 'Block third-party cookies', onClick: () => { v.tp = !v.tp; sync(); } });
    const start = h('input.field#start-page', { type: 'text', placeholder: 'https://', spellcheck: 'false', autocomplete: 'off' });
    const create = h('button.btn.btn-primary', { onClick: submit }, 'Create group');
    const num = Math.min(9, S.groups.length + 1);

    const scrim = h('div.scrim', { onClick: close });
    const box = h('div.sheet', { role: 'dialog', 'aria-labelledby': 'sheet-title', style: { borderRadius: '0 0 18px 18px' } },
      h('div.sheet-h', h('h2.sheet-t#sheet-title', 'New group'), h('p', { style: { color: 'var(--text-2)', marginTop: '2px' } }, 'Each group keeps its own logins, cookies, storage and cache.')),
      h('div.sheet-b',
        h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '16px' } }, tileEl,
          h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' } }, h('label.lbl', { for: 'group-name' }, 'Name'), nameIn)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, h('span.lbl', 'Color'), h('div', { role: 'group', 'aria-label': 'Group color', style: { display: 'flex', gap: '12px' } }, swatches)),
        h('div', h('div.sec', 'Session'),
          h('div.card',
            h('div.row', h('div.row-main', h('div.row-t', 'Storage'), desc), h('div.seg.n2', thumb, segBtns)),
            h('div.row', h('div.row-main', h('div.row-t', 'Block third-party cookies'), h('div.row-d', 'Stops cross-site trackers inside this group only.')), sw),
            h('div.lock-note', { style: { borderTop: '1px solid var(--line)' } }, icon('lock'), h('span', 'Nothing is shared. This group cannot read cookies or storage from any other group.')))),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, h('label.lbl', { for: 'start-page' }, 'Start page ', h('span', { style: { color: 'var(--text-3)', fontWeight: 400 } }, '(optional)')), start),
        h('button.card.row', { style: { width: '100%' }, onClick: () => { call('ui:close'); call('settings:open', 'advanced'); } },
          h('div.row-main', h('div.row-t', 'Advanced'), h('div.row-d', 'Proxy, user agent and site permissions')), icon('chevdown'))),
      h('div.sheet-f',
        h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-3)' } }, 'Switch to this group with ', kbds(['⌘', String(num)])),
        h('span', { style: { flex: 1 } }),
        h('button.btn.btn-secondary', { onClick: close }, 'Cancel'), create));
    root.replaceChildren(scrim, h('div.layer', { style: { top: '0' } }, box));
    sheet = { scrim, box, refresh() {} };

    function sync() {
      const name = nameIn.value.trim();
      tileEl.className = 'tile tile-lg ' + v.color;
      tileEl.textContent = UI.glyphOf(name);
      swatches.forEach((s, i) => s.setAttribute('aria-pressed', String(COLORS[i][0] === v.color)));
      thumb.className = 'thumb at-' + (v.persistent ? 0 : 1);
      segBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0) === v.persistent)));
      desc.textContent = v.persistent ? 'Logins, cookies and cache are kept between launches.' : 'Everything in this group is wiped when you quit Bulkhead.';
      sw.setAttribute('aria-checked', String(v.tp));
      create.classList.toggle('is-disabled', !name);
    }
    async function submit() {
      const name = nameIn.value.trim(); if (!name) { nameIn.focus(); return; }
      mode = 'none'; scrim.classList.add('out'); box.classList.add('out');
      await call('group:create', { name, color: v.color, persistent: v.persistent, blockTP: v.tp, startPage: start.value.trim() });
      setTimeout(() => { root.replaceChildren(); sheet = null; call('ui:close'); }, 170);
    }
    nameIn.addEventListener('input', sync);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); submit(); }
    });
    sync();
    nameIn.focus();
  }

  UI.reduced = false;
})();
