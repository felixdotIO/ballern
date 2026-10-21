import { resolve } from 'node:path';

import { defineConfig } from 'vite';

export default defineConfig({
  // Port comes from the environment so the harness can assign a free one.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
  build: {
    target: 'es2022',
    // Two pages: the waitlist at `/` and the game itself at `/play/` — see the
    // note at the top of play/index.html for why the game used to be the root
    // and isn't right now.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        play: resolve(__dirname, 'play/index.html'),
      },
    },
  },
  // rapier3d-compat inlines its wasm as base64, so no wasm plugin is needed.
});
