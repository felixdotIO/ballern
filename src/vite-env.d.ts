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

  /**
   * The Apps Script web app that appends a row to the waitlist sheet. Optional
   * on purpose, same bargain as `VITE_ROOM_URL`: unset, the waitlist page still
   * builds and plays dumb — the form disables itself rather than eating
   * submissions nobody can read. See `src/waitlist/main.ts`.
   */
  readonly VITE_WAITLIST_URL?: string;
  /** Matches `SHARED_SECRET` in tools/waitlist/Code.gs — see the note there. */
  readonly VITE_WAITLIST_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
