/**
 * Tunnelling gate.
 *
 * Fires the chair at the building from a grid of interior positions across a
 * full sweep of headings, at the hard speed ceiling, with the throttle pinned —
 * then asserts it is still inside the building. Driving through walls stops
 * being a bug report and becomes a failing check.
 *
 * Spawn points come from the plan's rooms rather than from a bounding box over
 * the whole floorplate. That distinction is the difference between a gate and a
 * noise generator: a grid over the extents drops chairs inside the core, inside
 * parked cars and inside the ramp house, and every one of those "escapes"
 * through the floor because the chair started inside a solid. Only places a
 * player can actually be are worth testing.
 *
 * Runs off the fixed-step tick rather than the render loop, so it does not need
 * a visible tab or a single rendered frame.
 */

import type { Chair } from '../game/chair';
import type { Physics } from '../game/physics';
import { EXTENTS, LEVELS, ROOMS, roomAt } from '../office/plan';

export type TunnelResult = {
  runs: number;
  skipped: number;
  escapes: number;
  failures: { from: [number, number]; heading: number; endedAt: [number, number, number] }[];
};

const SPEED_CEILING = 13; // DRIVE.maxSpeed + DRIVE.maxBoost
const CHAIR_RADIUS = 0.33;
const SETTLE_TOLERANCE = 0.05;
/** Generous: the hall's ceiling is 3.2 and the deck has none at all. */
const CEILING = 4.0;

export function runTunnelTest(
  chair: Chair,
  physics: Physics,
  tick: (dt: number) => void,
  keys: Set<string>,
  opts: { headings?: number; seconds?: number; only?: readonly string[] } = {},
): TunnelResult {
  const headings = opts.headings ?? 24;
  const steps = Math.round((opts.seconds ?? 1.5) * 60);
  // A full sweep of the floorplate is a minute of simulation, which is fine for
  // a gate and useless for a question. `only` lets one room be interrogated.
  const rooms = opts.only ? ROOMS.filter((r) => opts.only!.includes(r.id)) : ROOMS;

  const minX = EXTENTS.minX + CHAIR_RADIUS - SETTLE_TOLERANCE;
  const maxX = EXTENTS.maxX - CHAIR_RADIUS + SETTLE_TOLERANCE;
  const minZ = EXTENTS.minZ + CHAIR_RADIUS - SETTLE_TOLERANCE;
  const maxZ = EXTENTS.maxZ - CHAIR_RADIUS + SETTLE_TOLERANCE;

  const failures: TunnelResult['failures'] = [];
  let runs = 0;
  let skipped = 0;

  const previousKeys = [...keys];
  keys.clear();
  keys.add('KeyW');

  for (const room of rooms) {
    // Three by three inside each room, inset far enough that the start point is
    // never inside the wall it is about to be fired at.
    for (let gx = 1; gx <= 3; gx++) {
      for (let gz = 1; gz <= 3; gz++) {
        const x = room.x0 + (gx / 4) * (room.x1 - room.x0);
        const z = room.z0 + (gz / 4) * (room.z1 - room.z0);
        const base = room.base ?? LEVELS.floor;
        // roomAt also rejects points that fell in the core between two rooms —
        // and, asked from the room's own floor, points where the level above
        // has grown over the one being tested.
        if (roomAt(x, z, base)?.id !== room.id) {
          skipped++;
          continue;
        }
        // And anywhere the furniture already is. A chair started inside a solid
        // is ejected by the solver on the first substep, usually downwards, and
        // lands outside the world — which this then reports as sixteen
        // tunnelling failures in a room the lap does not even enter. The plant
        // room's grid point happens to be the middle of the sprinkler tank; the
        // next room to get a big object in the middle of it would do the same.
        // A gate that cries wolf is one nobody reads.
        if (physics.obstruction(x, base, z, CHAIR_RADIUS).length) {
          skipped++;
          continue;
        }

        for (let a = 0; a < headings; a++) {
          const heading = (a / headings) * Math.PI * 2;
          chair.place(x, z, heading, SPEED_CEILING, base);
          for (let i = 0; i < steps; i++) tick(1 / 60);

          const p = chair.object.position;
          runs++;
          const escaped =
            p.x < minX ||
            p.x > maxX ||
            p.z < minZ ||
            p.z > maxZ ||
            p.y < EXTENTS.minY - SETTLE_TOLERANCE ||
            p.y > CEILING;
          if (escaped) {
            failures.push({
              from: [+x.toFixed(2), +z.toFixed(2)],
              heading: +heading.toFixed(3),
              endedAt: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
            });
          }
        }
      }
    }
  }

  keys.clear();
  for (const k of previousKeys) keys.add(k);
  chair.reset();

  return { runs, skipped, escapes: failures.length, failures };
}
