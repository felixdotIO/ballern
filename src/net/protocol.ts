/**
 * What a room says to itself.
 *
 * ---- the shape of the thing ----------------------------------------------
 *
 * Two authorities, split along the one line that matters: **you own where your own
 * chair is, the host owns everything else.**
 *
 * Owning your own motion is not a concession to latency, it is the only arrangement
 * under which driving feels like driving. `chair.ts` is a hundred lines of decisions
 * about how a castor behaves under a throttle, and every one of them is felt on the
 * frame the key goes down; routing that through anybody else's machine puts the
 * round trip between the player and the thing the game is about. So each client runs
 * its own chair, unchanged, and tells the room where it ended up.
 *
 * Everything a race needs to *agree* on goes the other way. What is in a piñata, who
 * a thrown module hit, where the computer's chairs are, when the flag drops — one
 * machine decides and says so. Not because the others could not work it out, but
 * because they would work it out slightly differently, and a race where the same
 * microwave goes off in two places is not one race.
 *
 * ---- what is deliberately not in here ------------------------------------
 *
 * No inputs. This is state sync, not lockstep: nobody replays anybody else's
 * throttle, so nothing depends on Rapier stepping identically on two machines — a
 * promise the wasm build does not make and one it would be miserable to discover
 * broken at the third corner.
 *
 * No loose furniture. The bins and plants in `dynamics.ts` are a dozen dynamic
 * bodies apiece and they exist to be knocked about; syncing them would cost more
 * traffic than the chairs do, to make a bin rest identically on five screens. It is
 * allowed to diverge, and it is written down here so that when somebody notices a
 * bin in a doorway on one machine and not another, this is the answer.
 */

import type { ItemKind } from '../game/items';

/**
 * Bumped whenever a message changes shape.
 *
 * Checked on the way in and refused loudly rather than tolerated: two clients from
 * different builds in one room produce a race that half works, which is far harder
 * to diagnose than one that will not start.
 */
export const PROTOCOL_VERSION = 1;

/** How often a client tells the room where it is. Twenty a second is plenty. */
export const POSE_HZ = 20;

/**
 * How far behind live a proxy chair is drawn, seconds.
 *
 * A buffer, not a delay to be minimised away. Poses arrive every 50 ms at best and
 * unevenly at worst, so a proxy drawn at the newest one it has teleports on every
 * late packet. Held 120 ms back there is always a pose on each side of the moment
 * being drawn, and the chair is *interpolated* between two things that really
 * happened rather than extrapolated toward one that might not.
 *
 * 120 ms is two and a bit send intervals: enough to cover ordinary jitter, and small
 * enough that a chair you are racing is drawn about 700 mm behind where it truly is
 * at full pelt — which is inside the length of the chair itself.
 */
export const INTERP_DELAY = 0.12;

/** Where a chair is, as the room describes it. */
export type SeatPose = {
  seat: number;
  /** Room clock when this was true, seconds. */
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /**
   * Metres past the start line, negative on the grid — the road, which is the one
   * quantity everything in the game ranks on. See `Racer` in `game/seat.ts`.
   *
   * Sent rather than derived, and sent in this form rather than as distance driven,
   * so the receiving end needs to know nothing about which slot the sender started
   * from in order to rank them.
   */
  progress: number;
  stunned: number;
  finished: boolean;
};

/**
 * Somebody in the room.
 *
 * `seat` is −1 until the host deals, because a lobby is a list of people and a grid
 * is a list of slots, and conflating the two is how somebody ends up racing in a
 * seat they were still choosing a driver for.
 */
export type Member = {
  id: string;
  name: string;
  /** Index into `RIDERS`. Unique within a room — the lobby enforces it. */
  rider: number;
  /** Index into `RIDES`. Cosmetic, so it may repeat. */
  ride: number;
  ready: boolean;
  seat: number;
};

/**
 * Something that happened to somebody, decided by the host.
 *
 * These are the same verbs `SeatActor` already speaks in — see `game/seat.ts` — plus
 * the two that are about the item rather than the chair. That is not a coincidence
 * and it is the whole reason the actors table was worth building: a hit resolved on
 * this machine and one that arrived over the wire end up in the same four calls.
 */
export type Effect =
  | { kind: 'stun'; seat: number; seconds: number; item: ItemKind }
  | { kind: 'push'; seat: number; speed: number; hold: number }
  | { kind: 'shove'; seat: number; dx: number; dz: number; speed: number }
  | { kind: 'blind'; seat: number; seconds: number }
  /** A chair took a piñata and this is what was in it. */
  | { kind: 'give'; seat: number; item: ItemKind }
  /** A chair threw what it was holding. */
  | { kind: 'fire'; seat: number; item: ItemKind; backwards: boolean };

export type ClientMessage =
  | { type: 'hello'; version: number; name: string; rider: number; ride: number }
  | { type: 'pick'; rider: number; ride: number }
  | { type: 'ready'; ready: boolean }
  /** Host only; the room drops it from anybody else. */
  | { type: 'start' }
  | { type: 'pose'; pose: SeatPose }
  /** Host only. */
  | { type: 'effect'; effect: Effect }
  | { type: 'lap'; seat: number; lap: number; time: number; finished: boolean }
  | { type: 'ping'; id: number };

export type ServerMessage =
  | { type: 'welcome'; you: string; host: string; room: string; members: Member[] }
  | { type: 'members'; host: string; members: Member[] }
  /**
   * The flag, and everything a race needs settled before it drops.
   *
   * `at` is a room-clock instant a little way in the future rather than "now": a
   * message that means *start when this reaches you* starts five races at five
   * different moments. Everyone waits for the same number on a clock they have all
   * measured against the room's.
   *
   * `seed` is what the host drew for the item rules. It is sent even though only the
   * host runs them, so that a client can predict a draw locally if that is ever
   * wanted, and so the race is reproducible from a log.
   */
  | {
      type: 'start';
      seed: number;
      at: number;
      /** Who is in which seat, and which grid slot that seat takes. */
      seating: { id: string; seat: number }[];
    }
  | { type: 'pose'; pose: SeatPose }
  | { type: 'effect'; effect: Effect }
  | { type: 'lap'; seat: number; lap: number; time: number; finished: boolean }
  /** `server` is the room clock when the room saw the ping. */
  | { type: 'pong'; id: number; server: number }
  | { type: 'left'; id: string }
  | { type: 'error'; reason: string };

/** Room codes are four letters, upper case, and avoid the ones people misread. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function isRoomCode(value: string): boolean {
  return (
    value.length === CODE_LENGTH &&
    [...value].every((c) => CODE_ALPHABET.includes(c))
  );
}

/** A name that is safe to put on screen: short, one line, no surprises. */
export const NAME_MAX = 14;

export function cleanName(raw: string): string {
  return raw
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .trim()
    .slice(0, NAME_MAX);
}
