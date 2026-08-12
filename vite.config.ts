import { defineConfig } from 'vite';

export default defineConfig({
  // Port comes from the environment so the harness can assign a free one.
  server: { port: process.env.PORT ? Number(process.env.PORT) : undefined },
  build: { target: 'es2022' },
  // rapier3d-compat inlines its wasm as base64, so no wasm plugin is needed.
});
