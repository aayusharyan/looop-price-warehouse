(function () {
  const { h, icon, kbd, kbds, tile } = UI;
  const call = (...a) => window.bh.call(...a);
  const $ = (id) => document.getElementById(id);
  const wrap = $('wrap'), navEl = $('nav');
  const qs = new URLSearchParams(location.search);
  let S = null, pane = qs.get('pane') || 'general', gid = qs.get('g') || null, binds = [], recording = null;

  const PANES = [['general', 'General', 'sliders'], ['groups', 'Groups', 'layers'], ['appearance', 'Appearance', 'sun'], ['privacy', 'Privacy & Data', 'shield'], ['shortcuts', 'Shortcuts', 'keyboard'], ['advanced', 'Advanced', 'terminal']];
  const navBtns = PANES.map(([id, label, ic]) => {
    const b = h('button.nav-i', { onClick: () => go(id) }, h('span.nav-ic', icon(ic)), label);
    navEl.append(b); return b;
  });

  /* ---------------------------------------------------------- primitives */
  const bind = (fn) => { binds.push(fn); fn(); };
  const set = (patch) => call('settings:set', patch);

  const section = (t) => h('div.sec', t);
  const row = (title, desc, control) => h('div.row', h('div.row-main', h('div.row-t', title), desc && h('div.row-d', desc)), control);
  const card = (...rows) => h('div.card', rows);

  function toggle(key, label) {
    const b = h('button.sw', { role: 'switch', 'aria-label': label, onClick: () => set({ [key]: !S.settings[key] }) });
    bind(() => b.setAttribute('aria-checked', String(!!S.settings[key])));
    return b;
  }
  function groupToggle(key, label) {
    const b = h('button.sw', { role: 'switch', 'aria-label': label, onClick: () => { const g = curGroup(); g && call('group:update', g.id, { [key]: !g[key] }); } });
    bind(() => { const g = curGroup(); b.setAttribute('aria-checked', String(!!(g && g[key]))); });
    return b;
  }
  function seg(labels, get, pick) {
    const thumb = h('span.thumb');
    const btns = labels.map((l, i) => h('button', { onClick: () => pick(i) }, l));
    const el = h('div.seg.n' + labels.length, thumb, btns);
    bind(() => { const i = get(); thumb.className = 'thumb at-' + i; btns.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j))); });
    return el;
  }

  /* custom dropdown, in the style of a macOS pop-up menu */
  let openMenu = null;
  function closeMenu() { if (openMenu) { openMenu.btn.setAttribute('aria-expanded', 'false'); openMenu.el.remove(); openMenu = null; } }
  document.addEventListener('mousedown', (e) => { if (openMenu && !openMenu.el.contains(e.target) && e.target !== openMenu.btn && !openMenu.btn.contains(e.target)) closeMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
  function select(options, get, pick) {
    const label = h('span');
    const btn = h('button.field.select', { 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, label, icon('updown', 'ic-sm'));
    btn.onclick = () => {
      if (openMenu && openMenu.btn === btn) return closeMenu();
      closeMenu();
      const opts = options();
      const cur = get();
      const items = opts.map((o) => h('button.mi' + (o.v === cur ? '.is-sel' : ''), { role: 'option', onClick: () => { closeMenu(); pick(o.v); } }, h('span.chk', o.v === cur ? icon('check') : null), o.label));
      const el = h('div.menu.select-menu', { role: 'listbox' }, items);
      el.style.width = Math.max(btn.offsetWidth, 200) + 'px';
      document.body.append(el);
      const r = btn.getBoundingClientRect();
      el.style.left = Math.max(8, r.right - el.offsetWidth) + 'px';
      el.style.top = Math.min(r.bottom + 6, innerHeight - el.offsetHeight - 8) + 'px';
      btn.setAttribute('aria-expanded', 'true');
      openMenu = { el, btn };
    };
    bind(() => { const o = options().find((x) => x.v === get()); label.textContent = o ? o.label : ''; });
    return btn;
  }

  const curGroup = () => (S.groups.find((g) => g.id === gid) || S.groups[0]);
  const groupOpts = () => S.groups.map((g) => ({ v: g.id, label: g.name }));

  /* --------------------------------------------------------------- panes */
  const title = (t, sub) => [h('h1.set-title', t), h('p.set-sub', sub)];

  const PANE = {
    general: () => [
      ...title('General', 'How Bulkhead starts, and where links and notifications go.'),
      section('Startup'),
      card(
        row('When Bulkhead opens', null, select(() => [{ v: 'restore', label: 'Restore all groups and tabs' }, { v: 'fresh', label: 'Start with a new tab in each group' }], () => S.settings.startup, (v) => set({ startup: v }))),
        row('Default group', 'Where new windows and unmatched links start.', select(groupOpts, () => S.settings.defaultGroup || (S.groups[0] && S.groups[0].id), (v) => set({ defaultGroup: v })))),
      section('Links'),
      card(row('Open links from other apps in', 'Applies to links you click in Mail, Messages and other apps.',
        select(() => [{ v: 'ask', label: 'Ask each time' }, { v: 'default', label: 'The default group' }], () => S.settings.links, (v) => set({ links: v })))),
      section('Notifications'),
      card(
        row('Unread badges on groups', null, toggle('badges', 'Unread badges on groups')),
        row('Total unread on the Dock icon', null, toggle('dockBadge', 'Total unread on the Dock icon')),
        row('Allow notifications from sites', 'Each group still asks for permission separately.', toggle('notifications', 'Allow notifications from sites'))),
      section('Updates'),
      card(row('Update automatically', 'Updates install the next time you quit Bulkhead.', toggle('updates', 'Update automatically')))
    ],

    groups: () => {
      const list = h('div.card.glist');
      const detail = h('div');
      let renderedIds = '';
      let dragging = null;

      const nameIn = h('input.field.field-lg#dname', { type: 'text', spellcheck: 'false' });
      nameIn.addEventListener('change', () => { const g = curGroup(); const v = nameIn.value.trim(); if (g && v) call('group:update', g.id, { name: v }); else nameIn.value = g.name; });
      const big = h('span.tile.tile-lg');
      const swatches = ['c-vermilion', 'c-amber', 'c-green', 'c-teal', 'c-blue', 'c-violet', 'c-rose', 'c-graphite'].map((c, i) =>
        h('button.swatch.' + c, { 'aria-label': ['Vermilion', 'Amber', 'Green', 'Teal', 'Blue', 'Violet', 'Rose', 'Graphite'][i], onClick: () => call('group:update', curGroup().id, { color: c }) }, icon('check')));
      const stDesc = h('div.row-d');
      const shortRow = h('div.row-t');
      const numKbds = h('span');
      const nameField = () => document.activeElement === nameIn;

      function buildList() {
        const key = S.groups.map((g) => g.id + g.name + g.color).join('|') + '#' + (curGroup() || {}).id;
        if (key === renderedIds) return; renderedIds = key;
        list.replaceChildren(...S.groups.map((g) => {
          const el = h('button.gi' + (g.id === curGroup().id ? '.is-active' : ''), { draggable: 'true', onClick: () => { gid = g.id; sync(); } },
            h('span.grip', icon('grip', 'ic-sm')), tile(g, 'md'), h('span', { style: { flex: 1, minWidth: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, g.name));
          el.ondragstart = (e) => { dragging = g.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', g.id); };
          el.ondragend = () => { dragging = null; list.querySelectorAll('.gi').forEach((n) => n.classList.remove('dragging', 'drop-before', 'drop-after')); };
          el.ondragover = (e) => { if (!dragging || dragging === g.id) return; e.preventDefault(); const r = el.getBoundingClientRect(), b = e.clientY < r.top + r.height / 2; el.classList.toggle('drop-before', b); el.classList.toggle('drop-after', !b); };
          el.ondragleave = () => el.classList.remove('drop-before', 'drop-after');
          el.ondrop = (e) => { e.preventDefault(); const b = el.classList.contains('drop-before'); if (!dragging || dragging === g.id) return; const ids = S.groups.map((x) => x.id).filter((x) => x !== dragging); ids.splice(ids.indexOf(g.id) + (b ? 0 : 1), 0, dragging); call('group:reorder', ids); };
          return el;
        }));
      }
      function sync() {
        const g = curGroup();
        detail.hidden = !g;
        if (!g) return;
        buildList();
        big.className = 'tile tile-lg ' + g.color; big.textContent = UI.glyphOf(g.name);
        if (!nameField()) nameIn.value = g.name;
        swatches.forEach((s) => s.setAttribute('aria-pressed', String(s.classList.contains(g.color))));
        stDesc.textContent = g.persistent ? 'Logins, cookies and cache are kept between launches.' : 'Everything is wiped when you quit Bulkhead.';
        shortRow.textContent = 'Switch to ' + g.name;
        const i = S.groups.indexOf(g);
        numKbds.replaceChildren(i < 9 ? kbds(['⌘', String(i + 1)]) : h('span.num-note', 'No shortcut'));
      }
      binds.push(sync);
      const empty = h('p.set-sub', 'No groups yet.');
      binds.push(() => { empty.hidden = S.groups.length > 0; });

      detail.append(
        h('div.dtl-head', big, h('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' } }, h('label.lbl', { for: 'dname' }, 'Name'), nameIn)),
        h('div', { role: 'group', 'aria-label': 'Group color', style: { display: 'flex', gap: '10px', marginBottom: '6px' } }, swatches),
        section('Session'),
        card(
          row('Storage', stDesc, seg(['Persistent', 'Temporary'], () => (curGroup().persistent ? 0 : 1), (i) => call('group:update', curGroup().id, { persistent: i === 0 }))),
          row('Block third-party cookies', null, groupToggle('blockTP', 'Block third-party cookies')),
          row('Suspend when idle', 'Frees memory after 30 minutes unused. Tabs reload when you return.', groupToggle('suspend', 'Suspend when idle'))),
        section('Shortcut'),
        card(h('div.row', h('div.row-main', shortRow), numKbds)),
        section('Data'),
        card(
          row('Clear cookies, storage and cache', 'Signs you out of every site in this group. Other groups are untouched.', h('button.btn.btn-secondary.btn-sm', { onClick: () => call('group:confirm', curGroup().id, 'clear', true) }, 'Clear…')),
          row('Delete group', 'Closes its tabs and erases all of its data. This can’t be undone.', h('button.btn.btn-danger.btn-sm', { onClick: () => { const id = curGroup().id; call('group:confirm', id, 'delete', true).then((ok) => { if (ok) gid = null; }); } }, 'Delete…'))));

      return [
        ...title('Groups', 'Each group is a sealed session. Reorder them in the sidebar by dragging.'), empty,
        h('div.mgrid',
          h('div', list, h('button.btn.btn-secondary', { style: { marginTop: '12px', width: '100%' }, onClick: () => call('sheet:open') }, icon('plus', 'ic-sm'), 'New group')),
          detail)
      ];
    },

    appearance: () => {
      const card3 = (id, label, prev) => {
        const b = h('button.tcard', { onClick: () => set({ theme: id }) }, prev, label);
        bind(() => b.setAttribute('aria-pressed', String(S.settings.theme === id)));
        return b;
      };
      const pf = (bg, w) => (c) => h('span.pf', { style: { background: bg, ...(w ? { width: w } : {}) } }, ['#C2552F', '#3B5BC4', '#2E8A5C'].map((x) => h('span.pt', { style: { background: x } })));
      const pc = (bg, a, b) => h('span.pc', { style: { background: bg } }, h('span.pb', { style: { width: '70%', background: a } }), h('span.pb', { style: { width: '90%', background: b } }), h('span.pb', { style: { width: '55%', background: b } }));
      const prevSys = h('span.tprev',
        h('span.pf', { style: { background: '#EDEEF1', width: '14%' } }, ['#C2552F', '#3B5BC4'].map((x) => h('span.pt', { style: { background: x } }))),
        h('span.pc', { style: { background: '#FFFFFF' } }, h('span.pb', { style: { width: '80%', background: '#E4E6EA' } }), h('span.pb', { style: { width: '60%', background: '#F0F1F4' } })),
        h('span.pc', { style: { background: '#1B1D21', borderTopLeftRadius: 0, marginTop: 0 } }, h('span.pb', { style: { width: '80%', background: '#33363C', marginTop: '8px' } }), h('span.pb', { style: { width: '60%', background: '#272A2F' } })));
      const sbVals = ['expanded', 'rail', 'autohide'];
      return [
        ...title('Appearance', 'Light is Porcelain, dark is Graphite. Chrome stays quiet so the page leads.'),
        section('Theme'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '12px' } },
          card3('light', 'Light', h('span.tprev', pf('#EDEEF1')(), pc('#FFFFFF', '#E4E6EA', '#F0F1F4'))),
          card3('dark', 'Dark', h('span.tprev', pf('#141518')(), pc('#1B1D21', '#33363C', '#272A2F'))),
          card3('system', 'Match macOS', prevSys)),
        section('Layout'),
        card(
          row('Group sidebar', 'Rail only gives pages the most width. Auto-hide tucks the rail away until the pointer touches the left edge.',
            seg(['Expanded', 'Rail only', 'Auto-hide'], () => Math.max(0, sbVals.indexOf(S.settings.sidebar)), (i) => set({ sidebar: sbVals[i] }))),
          row('Show group name in the titlebar', 'Keeps the active group visible when the sidebar is collapsed.', toggle('chip', 'Show group name in the titlebar')),
          row('Density', null, seg(['Comfortable', 'Compact'], () => (S.settings.density === 'compact' ? 1 : 0), (i) => set({ density: i ? 'compact' : 'comfortable' })))),
        section('Motion'),
        card(row('Animations', 'Reduced swaps slides and springs for quick fades. Follows the macOS setting by default.',
          seg(['Full', 'Reduced'], () => (document.documentElement.dataset.motion === 'reduced' ? 1 : 0), (i) => set({ motion: i ? 'reduced' : 'full' }))))
      ];
    },

    privacy: () => {
      const tbody = h('tbody');
      const fmt = (b) => (b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b > 1e6 ? Math.round(b / 1e6) + ' MB' : Math.max(0, Math.round(b / 1e3)) + ' KB');
      const when = (t) => { if (!t) return 'Never'; const d = Math.floor((Date.now() - t) / 864e5); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? d + ' days ago' : d < 14 ? 'Last week' : 'Earlier'; };
      let last = '';
      async function fill() {
        const info = await call('privacy:info');
        const key = JSON.stringify(info) + S.groups.map((g) => g.name + g.color).join();
        if (key === last) return; last = key;
        tbody.replaceChildren(...S.groups.map((g) => {
          const i = info.find((x) => x.id === g.id) || {};
          return h('tr', h('td', h('span', { style: { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 500 } }, tile(g, 'md'), g.name)),
            h('td.num', fmt(i.size || 0)), h('td', { style: { color: 'var(--text-2)' } }, when(i.lastUsed)),
            h('td', { style: { textAlign: 'right' } }, h('button.btn.btn-ghost.btn-sm', { onClick: () => call('group:confirm', g.id, 'clear', true).then(() => { last = ''; fill(); }) }, 'Clear…')));
        }));
      }
      binds.push(fill); fill();
      return [
        ...title('Privacy & Data', 'What each group has stored, and the defaults new groups start with.'),
        section('Cached data by group'),
        h('div.card', { style: { overflow: 'hidden' } }, h('table.tbl', h('thead', h('tr', h('th', 'Group'), h('th.num', 'Cache'), h('th', 'Last used'), h('th'))), tbody)),
        section('Defaults for new groups'),
        card(
          row('Block third-party cookies', null, toggle('tpDefault', 'Block third-party cookies by default')),
          row('Ask before using camera, microphone or location', 'Answers are remembered per group, never across groups.', toggle('askPerms', 'Ask before using camera, microphone or location'))),
        h('div', { style: { marginTop: '24px' } }, h('button.btn.btn-danger', { onClick: () => call('group:clear-all') }, 'Clear data for all groups…'))
      ];
    },

    shortcuts: () => {
      const LABELS = [
        ['Groups', [['palette', 'Search groups, tabs and actions'], ['newGroup', 'New group'], ['nextGroup', 'Next group'], ['prevGroup', 'Previous group'], ['toggleSidebar', 'Toggle sidebar']]],
        ['Tabs', [['newTab', 'New tab'], ['closeTab', 'Close tab'], ['reopenTab', 'Reopen closed tab'], ['nextTab', 'Next tab'], ['reload', 'Reload']]]
      ];
      const sections = [];
      LABELS.forEach(([t, rows]) => {
        sections.push(section(t));
        const fixed = t === 'Groups' ? [h('div.row', { style: { minHeight: '44px', padding: '6px 16px' } }, h('div.row-main', h('div.row-t', { style: { fontWeight: 400 } }, 'Switch to group 1–9')), kbds(['⌘', '1–9']))] : [];
        sections.push(card(...rows.map(([id, label]) => {
          const el = h('button.kbds.rec', { 'aria-label': 'Change shortcut for ' + label, onClick: () => record(id, el) });
          bind(() => { if (recording !== id) el.replaceChildren(...UI.accelKeys(S.settings.shortcuts[id]).map(kbd)); });
          return h('div.row', { style: { minHeight: '44px', padding: '6px 16px' } }, h('div.row-main', h('div.row-t', { style: { fontWeight: 400 } }, label)), el);
        }), ...fixed));
      });
      return [...title('Shortcuts', 'Click a shortcut to record a new one.'), sections];
    },

    advanced: () => [
      ...title('Advanced', 'Network and compatibility options. Per-group overrides live in each group’s settings.'),
      section('Network'),
      card(row('Proxy', 'Used by all groups.', select(() => [{ v: 'system', label: 'Use system settings' }, { v: 'direct', label: 'No proxy' }], () => S.settings.proxy, (v) => set({ proxy: v })))),
      section('Compatibility'),
      card(
        row('User agent', null, select(() => [{ v: 'default', label: 'Default' }, { v: 'safari', label: 'Safari' }, { v: 'firefox', label: 'Firefox' }], () => S.settings.ua, (v) => set({ ua: v }))),
        row('Hardware acceleration', 'Takes effect after you restart Bulkhead.', toggle('hw', 'Hardware acceleration'))),
      section('Developer'),
      card(row('Web inspector', 'Adds Inspect Element to the page menu in every group.', toggle('devtools', 'Web inspector'))),
      section('About'),
      card(
        row('Version', null, version()),
        row('Reset all settings', 'Groups and their data are kept.', h('button.btn.btn-secondary.btn-sm', { onClick: () => call('settings:reset') }, 'Reset…')))
    ]
  };

  function version() {
    const el = h('span', { style: { color: 'var(--text-2)', fontFamily: 'var(--font-mono)', fontSize: '12px' } });
    call('platform').then((p) => { el.textContent = 'v' + p.version; });
    return el;
  }

  /* ------------------------------------------------- shortcut recording */
  function record(id, el) {
    if (recording) return;
    recording = id;
    call('shortcuts:record', true);
    el.classList.add('recording');
    el.replaceChildren(h('span.rec-hint', 'Press keys…'));
    const done = () => { recording = null; el.classList.remove('recording'); call('shortcuts:record', false); window.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown, true); binds.forEach((f) => f()); };
    const onDown = (e) => { if (!el.contains(e.target)) done(); };
    const onKey = (e) => {
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') return done();
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return;
      if (!(e.metaKey || e.ctrlKey || e.altKey)) return;
      const named = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Tab: 'Tab', Enter: 'Return', ' ': 'Space' };
      const key = named[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      const acc = [e.metaKey && 'CmdOrCtrl', e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', key].filter(Boolean).join('+');
      set({ shortcuts: { ...S.settings.shortcuts, [id]: acc } });
      done();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown, true);
  }

  /* ------------------------------------------------------------- driving */
  function go(id) {
    if (id === pane && wrap.firstChild) return;
    pane = id; closeMenu(); binds = [];
    navBtns.forEach((b, i) => { const on = PANES[i][0] === id; b.classList.toggle('is-active', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
    const body = h('div.pane-in', PANE[id]());
    wrap.replaceChildren(body);
    $('pane').scrollTop = 0;
    if (S) binds.forEach((f) => f());
  }

  function onState(s) {
    S = s; UI.applyLook(s.settings);
    if (!wrap.firstChild) go(pane);
    else binds.forEach((f) => f());
  }
  window.bh.on('state', onState);
  window.bh.on('pane', (p, g) => { if (g) gid = g; if (p === pane) { binds.forEach((f) => f()); } else go(p); });
  call('platform').then((p) => { window.__version = 'v' + p.version; });
  call('state:get').then((s) => { S = s; UI.applyLook(s.settings); if (!gid && s.groups[0]) gid = s.groups[0].id; go(pane); });
})();
