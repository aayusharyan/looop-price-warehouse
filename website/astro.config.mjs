import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

// Static site: `npm run build` writes plain HTML/CSS/JS to dist/, deployable anywhere.
export default defineConfig({
  integrations: [react()],
});
