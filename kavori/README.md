# Bulkhead

One browser. Every account, kept apart. A macOS app built from the Bulkhead / Porcelain design.

Each **group** is a sealed browser session (its own Electron `partition`): separate logins, cookies, storage and cache.
Open the same site in three groups and stay signed in as three different people.

## Run

```sh
npm install
npm start
npm run dist   # builds a .dmg (macOS)
```

## Layout

- `src/main/` – main process: windows, per-group sessions, tabs (`WebContentsView`), menu and shortcuts, persistence.
- `src/renderer/porcelain.css` – the design system, verbatim from the design. `app.css` adds the app layer (motion, drag, overlay).
- `index.html` + `chrome.js` – the window: titlebar, tabs, group sidebar (expanded / rail / auto-hide).
- `overlay.html` + `overlay.js` – a transparent view above the web content: ⌘K palette, new-group sheet, tooltips, toasts.
- `settings.html` + `settings.js` – the Settings window (General, Groups, Appearance, Privacy & Data, Shortcuts, Advanced).

Motion follows the design tokens (springs for the active-row plate, switches and segmented thumbs; 100–500 ms durations) and
respects *Reduced motion* from macOS or Settings → Appearance.
