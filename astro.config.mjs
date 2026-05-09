import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://policywonkgame.aasifj.com',
  output: 'static',
  integrations: [react()],
  // Hide the floating Astro dev toolbar in localhost — Aasif's call.
  // It only shows in dev mode anyway (never in the deployed build),
  // but disabling here keeps the dev preview clean too.
  devToolbar: { enabled: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
