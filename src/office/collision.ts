/**
 * Collision is authored, never derived from render geometry.
 *
 * Deriving colliders from the visual mesh is the single most common cause of
 * driving through walls: the render mesh is thin, open-edged, full of decorative
 * detail, and gets swept through at speed. Authoring cuboids from the same
 * dimensional constants that generate the walls costs almost nothing — the
 * walls are already module-aligned rectangles — and gives the solver thick,
 * closed, convex volumes it can never tunnel through.
 */

import type * as THREE from 'three';

/**
 * A prop light enough to be knocked around.
 *
 * Anything a chair could plausibly shove — other chairs, bins, plants — becomes
 * a dynamic body rather than part of the static building. Unlike the player's
 * chair these do *not* lock their rotation: a bin that skitters and a plant that
 * topples are most of the comedy, and an office chair that stays perfectly
 * upright after being rammed reads as scenery rather than as furniture.
 *
 * `centreOffset` is how far above the object's floor origin the collider centre
 * sits, so the visual can be hung off the body and rotate with it correctly.
 */
export type DynamicProp = {
  label: string;
  object: THREE.Object3D;
  shape:
    | { kind: 'box'; size: readonly [number, number, number] }
    | { kind: 'cylinder'; halfHeight: number; radius: number };
  centreOffset: number;
  /** Kilograms. The ratio between these is what makes a bin fly and a plant
   *  merely tip. */
  mass: number;
  position: readonly [number, number, number];
  yaw: number;
  linearDamping: number;
  angularDamping: number;
};

export type CollisionVolume = {
  /** Full extents, not half-extents. */
  size: readonly [number, number, number];
  centre: readonly [number, number, number];
  /** Rotation about Y, radians. Only doors and angled partitions need it. */
  yaw?: number;
  /**
   * Rotation about X, radians. Ramps, and nothing else so far.
   *
   * Worth having rather than approximating, because the obvious alternative is
   * a staircase of thin level boxes and that is not a ramp — it is a flight of
   * 40 mm steps. A capsule on castors finds every one of them: the chair either
   * chatters the whole way down or catches a nosing and stops dead, and neither
   * failure looks like a collider problem from the driver's seat. One cuboid
   * tipped by the actual gradient is both cheaper and exactly right.
   */
  pitch?: number;
  /**
   * Something you drive *on* rather than into: a ramp.
   *
   * Every other volume in the building answers "is there anything in the way
   * here" with a yes that means the lap is broken. A kicker answers yes to the
   * same question and means the opposite — the whole point of it is that a chair
   * arrives at castor height and goes up. `physics.obstruction` leaves these
   * out, which is what keeps the clearance gate honest instead of having to be
   * argued with every time a ramp is added.
   */
  drivable?: boolean;
  /** For debugging and for the tunnelling test's failure messages. */
  label: string;
};
