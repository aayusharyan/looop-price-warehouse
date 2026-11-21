# Kavori

One browser. Every account, kept apart. A macOS app built from the Kavori / Porcelain design.

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

## Icons

The app's UI icons come from Font Awesome, chosen in `icons.config.json` (app icon name → Font Awesome name, plus a `style`).

```sh
npm run icons     # regenerates src/renderer/icons.generated.js
```

- **Free (default):** `@fortawesome/fontawesome-free`, `style: "solid"`. Free is almost all Solid, so icons look heavier than the earlier line icons. Attribution (CC BY 4.0) is on the website's Legal notices page.
- **Pro:** install `@fortawesome/fontawesome-pro` using your own Font Awesome npm token (kept in your user `~/.npmrc`, never in the repo), set `style` to `regular`, `light`, `thin`, `duotone` or a `sharp-*` style, and run `npm run icons`. Icons missing from a style fall back to Solid and are listed.
- If this repository is public, don't commit Pro-generated output: the Font Awesome Pro license doesn't allow publishing the raw Pro icons. Generate it in CI or locally instead.
