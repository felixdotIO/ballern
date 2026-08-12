/**
 * Where the racing line goes next, in plan. Nothing drawn, nothing in the room.
 *
 * This is what is left of `wayfinding.ts`, and the reason it is left is worth stating.
 * That module built the building's own escape-route signage — green backlit arrows at
 * 2.15 m, every eight metres along the route, each one turned to face the oncoming driver
 * with its arrow already pointing at the corner seven metres past it — and it was deleted
 * with the rest of the guides. But the signs were doing two jobs at once. One was telling
 * you where to go *in the room*, which is the job that went. The other was quietly
 * tracking where the chair is along the lap, and handing a point ten metres up the route
 * to the HUD chevron, which is an instrument and stayed.
 *
 * So the tracking survives on its own. It is the cheaper half anyway: two nearest-point
 * searches against a polyline and no geometry at all.
 *
 * The search is local — twelve metres either side of where the chair was last frame —
 * because a global one on a two-level track will happily snap to the lane three metres
 * below the ramp you are on. It falls back to a global search only when the local one has
 * clearly lost the line, and then takes whichever of the two is actually nearer.
 */

import * as THREE from 'three';

import type { RoutePath } from './routePath';

/** How far up the route the chevron points. Far enough to mean the next corner. */
const LOOK = 10;
/** Give up on the local search past this and re-acquire from scratch. */
const LOST = 14;
/** How much route either side of last frame's cursor the local search walks. */
const WINDOW = 12;

export type RouteAim = {
  /** Where the HUD chevron should point, in plan. Read after `update`. */
  readonly at: readonly [number, number];
  update(position: THREE.Vector3): void;
  reset(): void;
};

export function createRouteAim(path: RoutePath): RouteAim {
  const { pointAt } = path;

  let cursor = 0;
  let acquired = false;
  const at: [number, number] = [0, 0];
  const spot = new THREE.Vector3();

  return {
    at,

    update(position) {
      if (!acquired) {
        cursor = path.nearest(position, 0, path.total / 2).s;
        acquired = true;
      } else {
        const local = path.nearest(position, cursor, WINDOW);
        if (local.d > LOST) {
          const global = path.nearest(position, 0, path.total / 2);
          cursor = global.d < local.d ? global.s : local.s;
        } else {
          cursor = local.s;
        }
      }

      pointAt(cursor + LOOK, spot);
      at[0] = spot.x;
      at[1] = spot.z;
    },

    reset() {
      acquired = false;
    },
  };
}
