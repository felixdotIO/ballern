/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Where the room server lives, e.g. `wss://ballern-rooms.<subdomain>.workers.dev`.
   *
   * Optional on purpose. With it unset the game builds and plays exactly as it
   * always has and the Multiplayer row is disabled — which is what keeps the beta
   * genuinely opt-in, and what lets a checkout with no worker of its own still be a
   * working game. See `MULTIPLAYER_AVAILABLE` in `src/net/room.ts`.
   */
  readonly VITE_ROOM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
