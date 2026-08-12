/**
 * Racing-line clearance gate.
 *
 * Walks the lap at a fine interval and asks the solver, at every step, whether
 * a chair standing there would be inside something. A blocked line is not a
 * subtle bug — it is a lap that cannot be completed — and it is also the single
 * easiest thing to introduce, because the route is authored in one file and the
 * furniture that has to get out of its way is authored in nine others.
 *
 * It reports the *width* of the gap as well as whether the centreline is clear,
 * because those are different failures with different fixes. A centreline
 * through a desk is a route that needs moving. A clear centreline with 700 mm
 * either side is a doorway a chair technically fits through and never will at
 * twenty kilometres an hour, and that is a room that needs moving.
 */

import type { Physics } from '../game/physics';
import { GATES, ROUTE } from '../office/plan';

/** Chair base radius plus a little. Matches the capsule in chair.ts. */
const CHAIR_RADIUS = 0.33;

/**
 * How much room either side of the line the lap is expected to have.
 *
 * Not a regulation: a 1.2 m escape route is what the building owes, and this is
 * what the driving owes. At 6 m/s a chair covers 100 mm in the time it takes to
 * notice it is off line, and a lane you cannot be 300 mm wrong in is a lane
 * nobody can drive.
 */
const COMFORT = 0.62;

export type RouteResult = {
  samples: number;
  /** Places the centre of the line is inside something. Reported as x, z, y. */
  blocked: { at: [number, number, number]; by: string[] }[];
  /** Places the line is clear but the gap is tighter than COMFORT. */
  tight: { at: [number, number, number]; clearance: number; by: string[] }[];
  /** Narrowest half-gap found anywhere on the lap, in metres. */
  narrowest: number;
  /** Gates whose own centre is blocked — always a mistake in the gate, not the room. */
  badGates: string[];
};

export function runRouteTest(physics: Physics, step = 0.25): RouteResult {
  const blocked: RouteResult['blocked'] = [];
  const tight: RouteResult['tight'] = [];
  let narrowest = Infinity;
  let samples = 0;

  /**
   * How far the line can be pushed in any direction here before it hits
   * something.
   *
   * Radial rather than a march sideways along the normal: a point walked across
   * the lane steps straight past a table leg, and a table leg is exactly the
   * thing that ends a lap. Growing a disc until it catches cannot miss one.
   */
  const halfGap = (x: number, y: number, z: number): { gap: number; by: string[] } => {
    for (let r = CHAIR_RADIUS; r <= 1.4; r += 0.06) {
      const hit = physics.obstruction(x, y, z, r);
      if (hit.length) return { gap: r, by: hit };
    }
    return { gap: 1.4, by: [] };
  };

  for (let i = 0; i < ROUTE.length; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[(i + 1) % ROUTE.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const dy = b[2] - a[2];
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / step));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t;
      const z = a[1] + dz * t;
      // The floor under this sample, interpolated down the ramps with the route
      // itself. Sampling the whole lap at deck height would walk Ebene 5 through
      // the parked cars three metres above it and report the level below as
      // solid from end to end.
      const y = a[2] + dy * t;
      samples++;

      const centre = physics.obstruction(x, y, z, CHAIR_RADIUS);
      if (centre.length) {
        blocked.push({ at: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], by: centre });
        narrowest = 0;
        continue;
      }

      const { gap, by } = halfGap(x, y, z);
      narrowest = Math.min(narrowest, gap);
      if (gap < COMFORT) {
        tight.push({ at: [+x.toFixed(2), +z.toFixed(2), +y.toFixed(2)], clearance: +gap.toFixed(2), by });
      }
    }
  }

  const badGates = GATES.filter((g) => physics.obstruction(g.at[0], g.y ?? 0, g.at[1], CHAIR_RADIUS).length).map(
    (g) => g.label,
  );

  return { samples, blocked, tight, narrowest: +narrowest.toFixed(2), badGates };
}
