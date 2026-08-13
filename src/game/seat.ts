/**
 * A seat in the race, and whoever is sitting in it.
 *
 * ---- why a seat is not a player -------------------------------------------
 *
 * There are five chairs on the grid and the rules — items, standings, targeting,
 * the finish — have never cared which of them is being driven by a person. That
 * was already true before any of this: `items.ts` and `projectiles.ts` speak
 * entirely in ids, and the note above `seats` in `main.ts` says so outright.
 *
 * What was *not* true is that the wiring agreed. Seat 0 was the player and seats
 * 1-4 were rails, and that assumption was written down in three places at once —
 * an `id === 0` test to decide whether to stun the chair or a rival, an `id - 1`
 * to turn a seat into a rail index, and a `slots[0]` to find out what the HUD
 * should draw. Three encodings of one fact, none of them named.
 *
 * This file names it. A seat has an id and a pose; an **actor** is the four things
 * that can be done to whoever is in it. The local chair is one implementation, a
 * rail is another, and a chair being driven from somewhere else is a third. The
 * rules call the verbs and never ask who answered.
 *
 * The immediate payoff is that the local player stops being index 0 and becomes
 * an index — which is what lets somebody else be in the seat in front. The larger
 * one is that `SeatActor` is exactly the boundary a network sits on: applying an
 * effect locally and receiving one off the wire are the same four calls.
 */

import type * as THREE from 'three';

import type { ItemKind } from './items';

/**
 * A chair, as much of one as the rules need to see.
 *
 * `progress` is total route distance driven and is the same quantity on the same
 * scale for everybody — see the long note on `State.progress` in `rivals.ts`,
 * which is what makes standings, targeting and the finish one comparison rather
 * than three.
 *
 * Nothing in here says who is driving. That is the point of the file.
 */
export type Racer = {
  readonly id: number;
  readonly position: { x: number; y: number; z: number };
  readonly yaw: number;
  readonly progress: number;
  /** Seconds of spin-out left. Nothing throws at a chair that is already out. */
  readonly stunned: number;
  /** True once it has taken the flag; a parked chair stops playing. */
  readonly finished: boolean;
};

/**
 * The writable form, with a real vector for the position.
 *
 * The rules receive `Racer` and cannot scribble on it; the frame that fills the
 * list in needs somewhere to write. Same record, two views, and the readonly one
 * is what leaves this module.
 */
export type Seat = { -readonly [K in keyof Racer]: Racer[K] } & { position: THREE.Vector3 };

/**
 * What can be done to whoever is in a seat.
 *
 * Four verbs and no getters, which is deliberate: an actor is the *write* side of
 * a seat and the pose is the read side, and keeping them apart is what stops this
 * quietly turning back into "the chair, or else the rival". Everything that reads
 * a seat reads the `Seat` record.
 *
 * `shove` is on the interface even though a rail has nowhere to be shoved to —
 * see the note on `stun` in `rivals.ts` — because the alternative is the caller
 * knowing which kind of thing it is talking to, which is the entire arrangement
 * this replaces. A rail simply ignores it, exactly as it did when `main.ts` was
 * the one deciding not to call it.
 */
export type SeatActor = {
  /**
   * Spun out for `seconds`. `kind` is passed through only so an actor that is
   * on this screen can put the right thing on it — the training module blocks
   * the view for exactly as long as the stun, and nothing else needs to know.
   */
  stun(seconds: number, kind: ItemKind): void;
  push(speed: number, hold: number): void;
  shove(dx: number, dz: number, speed: number): void;
  blind(seconds: number): void;
};

/** An actor for a seat nobody is driving from here. Every verb is a no-op. */
export const IDLE_ACTOR: SeatActor = {
  stun() {},
  push() {},
  shove() {},
  blind() {},
};
