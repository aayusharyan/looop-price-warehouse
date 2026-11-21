# Kavori website

Astro + a few small React islands. Static output, no backend.

```sh
npm install
npm run dev      # http://localhost:4321
npm run build    # static site in dist/
```

## Before launch

Fill the placeholders in `src/config.ts`: `price`, `buyUrl`, `refund`, `company`, `comparedOn`.
Edit the comparison table and FAQ in `src/data/content.ts`. Re-check competitors' pricing and features before publishing.

## Layout

- `src/pages/index.astro`: the page. Sections are plain markup.
- `src/components/`: `HeroDemo`, `JarLab`, `Faq`, `ThemeToggle` are React islands; `Icon` is shared.
- `src/styles/kavori.css`: tokens (Porcelain light / Graphite dark), components and motion. `site.css` adds scroll reveals.

Fonts are bundled (`@fontsource-variable`), so the page makes no third-party requests. Light/dark follows the system and is remembered. Motion respects `prefers-reduced-motion`.
