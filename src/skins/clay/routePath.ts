/**
 * The lap as a distance, rather than as a list of corners.
 *
 * `ROUTE` is a polyline of ninety-eight vertices, and every one of them is
 * where it is because a room is that shape — which means they are dense at the
 * corners and forty metres apart down the Grossraum. Anything that wants to say
 * "eight metres further on" has to work in arc length, or it bunches everything
 * it places into exactly the corners where it needed them spread out.
 *
 * Two things here are load-bearing and neither is obvious:
 *
 *  - **Everything is 3D.** The deck's aisle and Ebene 5's back lane pass within
 *    a metre of each other in plan and three metres apart in section, driven in
 *    opposite directions. Any question asked in plan alone gets the wrong lane
 *    half the time. `plan.ts` says the same thing at more length above `ROUTE`.
 *  - **`nearest` is windowed.** Not an optimisation — a global search flips
 *    between those two lanes on the ramp and everything downstream turns round.
 *    Searching near where you already were keeps the answer continuous, and the
 *    full sweep is the recovery path for when you have genuinely left the route.
 */

import * as THREE from 'three';

export type RoutePath = {
  /** Length of the whole lap, in metres. */
  total: number;
  /** World position at a distance along the loop. Wraps. Writes into `out`. */
  pointAt(s: number, out: THREE.Vector3): THREE.Vector3;
  /** Direction of travel at a distance along the loop, as a yaw. */
  headingAt(s: number): number;
  /** Distance along the loop of the point nearest `at`, searched near `from`. */
  nearest(at: THREE.Vector3, from: number, window: number): { s: number; d: number };
  /** Distance along the loop of the point nearest a plan position on a floor. */
  place(x: number, z: number, y: number): number;
};

export function createRoutePath(route: readonly (readonly [number, number, number])[]): RoutePath {
  const n = route.length;
  const cum = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = route[i]!;
    const b = route[(i + 1) % n]!;
    cum[i + 1] = cum[i]! + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  const total = cum[n]!;

  const pointAt = (s: number, out: THREE.Vector3): THREE.Vector3 => {
    let d = s % total;
    if (d < 0) d += total;
    let i = 0;
    while (i < n - 1 && cum[i + 1]! < d) i++;
    const a = route[i]!;
    const b = route[(i + 1) % n]!;
    const seg = cum[i + 1]! - cum[i]!;
    const t = seg > 1e-6 ? (d - cum[i]!) / seg : 0;
    // ROUTE is authored [x, z, y]; the world wants [x, y, z].
    return out.set(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, a[1] + (b[1] - a[1]) * t);
  };

  const probe = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const behind = new THREE.Vector3();

  return {
    total,
    pointAt,

    headingAt(s) {
      pointAt(s - 0.8, behind);
      pointAt(s + 0.8, ahead);
      return Math.atan2(ahead.x - behind.x, ahead.z - behind.z);
    },

    nearest(at, from, window) {
      let bestS = from;
      let bestD = Infinity;
      for (let o = -window; o <= window; o += 0.6) {
        pointAt(from + o, probe);
        const d = probe.distanceTo(at);
        if (d < bestD) {
          bestD = d;
          bestS = from + o;
        }
      }
      return { s: bestS, d: bestD };
    },

    place(x, z, y) {
      probe.set(x, y, z);
      let bestS = 0;
      let bestD = Infinity;
      for (let s = 0; s < total; s += 0.4) {
        pointAt(s, ahead);
        const d = ahead.distanceTo(probe);
        if (d < bestD) {
          bestD = d;
          bestS = s;
        }
      }
      return bestS;
    },
  };
}
