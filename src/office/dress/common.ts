/**
 * What every dressing solver is handed and what it puts things into.
 *
 * The solvers all obey the same rules, which are real space-planning
 * constraints rather than art direction:
 *
 *  - The circulation route stays clear. It is a fire escape route before it is
 *    a racing line, and nothing may encroach on the 1.2 m the regulations want.
 *  - A door's swing arc stays clear of everything.
 *  - Anything a human touches gets ±3° and ±40 mm. Anything the building owns
 *    gets exactly zero.
 *  - Every prop a chair could hit contributes an authored collision volume, or
 *    is a dynamic body. Nothing a chair can reach is allowed to be neither.
 *
 * Variation is causal, not random. Each solver decides who or what a piece of
 * the room belongs to first, and everything on and around it follows from that
 * — which is what stops a room of identical desks, and what makes the variation
 * survive being looked at.
 */

import type * as THREE from 'three';

import type { CollisionVolume, DynamicProp } from '../collision';
import { makeRng, seedFrom, type Rng } from '../rng';
import type { Kicker } from '../props/jumps';

export type Dress = {
  group: THREE.Group;
  collision: CollisionVolume[];
  dynamic: DynamicProp[];
};

/** Put an object down at a world position with a heading. */
export function place<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, yaw = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = yaw;
  return o;
}

/**
 * Which wall of a room a thing is standing against.
 *
 * Named by compass rather than by axis because that is how anyone reasons about
 * it in front of a plan: `north` is the wall at the room's low Z, `south` the
 * high Z, `west` the low X, `east` the high X.
 */
export type Against = 'north' | 'south' | 'east' | 'west';

/**
 * The heading that turns a prop's face into the room.
 *
 * Every prop in this project is authored facing -Z, so anything stood against
 * the room's *high* Z wall wants a heading of zero and everything else wants a
 * quarter or a half turn from there. Reasoning that out by hand at each call
 * site is exactly the kind of thing nobody gets right twenty-five times running,
 * and it was not got right: the canteen's whole fitted run, both fridges, the
 * vending machine, the board room's credenza and screen, the server room's
 * cooling and power, and every clock and notice board outside the open-plan
 * office were all installed facing the wall they were hung on. From the room you
 * saw the blank back of a kitchen — which is precisely what a modelled interior
 * looks like and what this one is trying not to be.
 */
export function facing(against: Against): number {
  switch (against) {
    case 'south':
      return 0;
    case 'north':
      return Math.PI;
    case 'east':
      return Math.PI / 2;
    case 'west':
      return -Math.PI / 2;
  }
}

/**
 * A private random stream, for anything added to a room after the fact.
 *
 * Every solver in here draws from one sequence, so a call inserted anywhere in
 * one shifts every draw after it — and because the variation is causal, that does
 * not mean "slightly different jitter", it means a different car in a different
 * bay. Adding the car deck's kicker moved `deck.car.centre.9` far enough to pinch
 * the racing line from 510 mm to 390, in a room the ramp is nowhere near. The
 * clearance gate caught it; nothing else would have.
 *
 * So an addition takes its own stream, named for itself, and the room it is
 * dropped into keeps the layout it had.
 */
export function seeded(name: string): Rng {
  return makeRng(seedFrom(name));
}

/**
 * A ramp, put down where a chair will drive at it.
 *
 * `x, z` is the *foot* of the ramp — the edge a chair arrives at — and `heading`
 * is the direction it will be driving when it does, which is the only way anyone
 * reasons about a jump. Everything else follows: the sheet climbs away from that
 * edge along the heading, and the collider is the same slab, authored so its top
 * face is the surface the sheet is showing.
 *
 * The maths, since it is the kind that hides a sign error for weeks: in the
 * kicker's own frame the surface runs from the origin up toward −Z, so its
 * mid-point is at (0, rise/2, −run/2) and its normal is X-pitched up-and-back.
 * The collider centre is that mid-point pulled half a thickness down that
 * normal. Then yaw carries the pair into the world together — `physics.ts`
 * composes rotations as YXZ for exactly this reason, so the pitch stays along
 * the ramp's own length instead of the world's.
 */
export function kicker(
  out: Dress,
  built: Kicker,
  label: string,
  x: number,
  z: number,
  heading: number,
  y = 0,
): void {
  place(built.group, x, y, z, heading);
  out.group.add(built.group);

  const pitch = Math.asin(Math.min(1, built.rise / built.length));
  const run = Math.sqrt(Math.max(0, built.length * built.length - built.rise * built.rise));
  const half = built.thickness / 2;
  // In the ramp's frame, then rotated out by the heading.
  const localY = built.rise / 2 - half * Math.cos(pitch);
  const localZ = -run / 2 - half * Math.sin(pitch);
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);

  out.collision.push({
    label,
    drivable: true,
    size: [built.width, built.thickness, built.length],
    // Three's Y rotation takes a point on the local Z axis to (z·sin, z·cos),
    // which is the same convention the chair's forward vector is written in.
    centre: [x + localZ * sin, y + localY, z + localZ * cos],
    yaw: heading,
    pitch,
  });
}

/** Add a prop and the box that stops a chair driving through it. */
export function solid(
  out: Dress,
  object: THREE.Object3D,
  label: string,
  size: readonly [number, number, number],
  centre: readonly [number, number, number],
  yaw = 0,
): void {
  // `centre[1]` is the floor the prop stands on, not the middle of it — props
  // are authored from their own base upward and always have been. It was
  // hardcoded to zero, which was the same thing while the building had one floor
  // level and is not any more: the rooms at the south end of Ebene 5 are three
  // metres down, and a solver that assumes zero hangs their entire contents in
  // the air above them.
  place(object, centre[0], centre[1], centre[2], yaw);
  out.group.add(object);
  out.collision.push({ label, size, centre: [centre[0], centre[1] + size[1] / 2, centre[2]], yaw });
}

/**
 * A chair, as a body rather than as scenery.
 *
 * Unlike the player's, loose chairs do not lock their rotation: one that goes
 * over when it is hit is most of the reason hitting things is worth doing, and
 * one that stays bolt upright reads as furniture bolted to the floor.
 */
export function looseChair(
  out: Dress,
  object: THREE.Object3D,
  label: string,
  x: number,
  z: number,
  yaw: number,
  mass = 12,
  radius = 0.31,
): void {
  out.dynamic.push({
    label,
    object,
    shape: { kind: 'cylinder', halfHeight: 0.52, radius },
    centreOffset: 0.52,
    mass,
    position: [x, 0, z],
    yaw,
    linearDamping: 0.5,
    angularDamping: 0.7,
  });
}
