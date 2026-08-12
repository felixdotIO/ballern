/**
 * Physics world.
 *
 * Fixed 120 Hz substeps, decoupled from the render rate. A chair racer reaches
 * speeds where a variable 60 Hz step is enough to skip a capsule clean through
 * a 100 mm partition between frames, and no amount of collider tuning fixes a
 * timestep that is too coarse.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import type { CollisionVolume } from '../office/collision';

export const FIXED_STEP = 1 / 120;
/** Never simulate more than this much in one frame — a stall must not turn into
 *  a spiral of catch-up steps that stalls the next frame too. */
const MAX_CATCHUP = 0.1;

export type Physics = {
  world: RAPIER.World;
  /**
   * Distance to the nearest solid obstruction along a ray, or `max` if clear.
   *
   * Used by the chase camera, and "solid" here means **fixed or kinematic** —
   * the building, and the four chairs the computer drives.
   *
   * Dynamic bodies are still ignored on purpose: pulling the camera in every time
   * it passes behind a loose bin would read as a stutter rather than as an
   * occlusion, and a bin gets knocked out of the way in a moment anyway.
   *
   * The rivals were in that same exemption until it was measured, and they do not
   * belong in it. A rival is not scenery that might be nudged aside: it is a
   * chair-and-rider the same size as the player's, it is *following* you, and it
   * stays there. With the field excluded the camera sat 60 mm from the head of the
   * chair behind — measured — which on screen is the inside of somebody's skull
   * filling the frame. A stutter is a blemish; that is the shot being destroyed.
   */
  rayToSolid(from: THREE.Vector3, dir: THREE.Vector3, max: number, exclude: RAPIER.RigidBody): number;
  /**
   * The same ray, against the **building alone** — fixed bodies only.
   *
   * This is the floor question rather than the camera question, and they are not
   * the same one. `rivals.ts` casts downward to find which floor a chair is
   * standing on, and if that ray could see the other chairs then the first rival
   * to drive under another would read its rival's capsule as the ground and ride
   * up over its head. A camera wants to know what is in the way; a floor probe
   * wants to know what the building is doing. Two names, so neither can quietly
   * become the other.
   */
  rayToStatic(from: THREE.Vector3, dir: THREE.Vector3, max: number, exclude: RAPIER.RigidBody): number;
  /**
   * The upward normal of whatever is under a point, or undefined if there is
   * nothing within `reach`.
   *
   * This is what tells the chair it is on a ramp. Asking the world rather than
   * consulting the plan is the whole point: the answer is right on the ramp,
   * right on its transitions, right on a kerb, and right on whatever gets built
   * next, with nothing in the driving model that has to be kept in step with
   * the geometry.
   */
  groundNormal(from: THREE.Vector3, reach: number, exclude: RAPIER.RigidBody, out: THREE.Vector3): boolean;
  /** Feed it wall-clock delta; it runs whole fixed steps and calls back on each. */
  step(dt: number, onStep: (h: number) => void): void;
  /**
   * What a chair standing at (x, z) on the floor at `y` would be inside, by name.
   *
   * The building and its furniture arrive here as anonymous cuboids, so the
   * labels are carried alongside — without them a blocked racing line reports
   * "something solid at 44.2, 21.6", which is the question rather than the
   * answer. With them it reports `board.table`, and the fix is obvious.
   *
   * `y` is the floor being stood on, not the height of the sample: the sample
   * sits a castor's height above it. It stopped being optional the moment two
   * floors shared a footprint — asked without it, the clearance gate walks the
   * whole of Ebene 5 at deck height and reports the lap as sailing through the
   * parked cars on the level above.
   */
  obstruction(x: number, y: number, z: number, radius: number): string[];
};

export async function createPhysics(volumes: readonly CollisionVolume[]): Promise<Physics> {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_STEP;

  const labels = new Map<number, string>();
  /** Colliders that are ramps. See `drivable` in collision.ts. */
  const drivable = new Set<number>();

  // Yaw about the world's Y and pitch about the volume's own X, in that order,
  // which is what 'YXZ' gives — a ramp that is both turned and tipped tips
  // along its own length rather than along the world's, and getting the order
  // backwards puts a twist in it that reads as a warped slab.
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const orientation = new THREE.Quaternion();

  for (const v of volumes) {
    euler.set(v.pitch ?? 0, v.yaw ?? 0, 0);
    orientation.setFromEuler(euler);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(v.centre[0], v.centre[1], v.centre[2])
        .setRotation(orientation),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(v.size[0] / 2, v.size[1] / 2, v.size[2] / 2)
        // Low friction on the building: a chair should skate along a wall it
        // clips rather than snag and stop dead on it.
        .setFriction(0.04)
        .setRestitution(0.08),
      body,
    );
    labels.set(collider.handle, v.label);
    if (v.drivable) drivable.add(collider.handle);
  }

  let accumulator = 0;

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });

  /**
   * The body of both ray queries. `chairs` is the only thing that differs: the
   * camera counts the kinematic field as things to be blocked by, the floor probe
   * does not. Dynamic bodies are excluded either way — see `rayToSolid`.
   */
  function cast(
    from: THREE.Vector3,
    dir: THREE.Vector3,
    max: number,
    exclude: RAPIER.RigidBody,
    chairs: boolean,
  ): number {
    ray.origin.x = from.x;
    ray.origin.y = from.y;
    ray.origin.z = from.z;
    ray.dir.x = dir.x;
    ray.dir.y = dir.y;
    ray.dir.z = dir.z;

    let nearest = max;
    world.intersectionsWithRay(ray, max, true, (hit) => {
      const parent = hit.collider.parent();
      if (!parent || parent === exclude) return true;
      if (!parent.isFixed() && !(chairs && parent.isKinematic())) return true;
      if (hit.timeOfImpact < nearest) nearest = hit.timeOfImpact;
      return true;
    });
    return nearest;
  }
  // A second ray rather than a shared one. These two are called from different
  // places in the frame — the camera's occlusion test from the render side, the
  // chair's slope probe from inside the fixed step — and rapier's ray is a
  // handle into wasm memory, so any overlap between the two is not a stale
  // reading but a panic out of the allocator.
  const down = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  return {
    world,
    rayToSolid(from, dir, max, exclude) {
      return cast(from, dir, max, exclude, true);
    },
    rayToStatic(from, dir, max, exclude) {
      return cast(from, dir, max, exclude, false);
    },
    groundNormal(from, reach, exclude, out) {
      down.origin.x = from.x;
      down.origin.y = from.y;
      down.origin.z = from.z;

      const hit = world.castRayAndGetNormal(down, reach, true, undefined, undefined, undefined, exclude);
      if (!hit) return false;
      out.set(hit.normal.x, hit.normal.y, hit.normal.z);
      // A ray leaving a surface from inside it comes back with the normal
      // pointing the way the ray went. Everything downstream assumes up.
      if (out.y < 0) out.negate();
      return true;
    },
    obstruction(x, y, z, radius) {
      // Bring the broad phase up to date first.
      //
      // Shape queries read an acceleration structure that `world.step()`
      // rebuilds, so in a tab that has never been stepped — which is every tab
      // running headless, because requestAnimationFrame does not fire in a
      // background tab — every query answers "nothing there". The clearance
      // gate then walks the entire lap, finds no wall anywhere in the building,
      // and reports a clean bill of health. A gate that passes loudest when it
      // is least able to see is worse than no gate, and one line fixes it.
      world.updateSceneQueries();

      // A flat box at castor height rather than a ball, and the flatness is the
      // whole point: the floor slab is a collider like any other, and a ball
      // wide enough to measure a doorway reaches down through it and reports
      // `ground` at every single sample on the lap. A 240 mm slice taken between
      // the floor and the underside of a desk asks the question actually being
      // asked — is there anything in the way down where the wheels are.
      const shape = new RAPIER.Cuboid(radius, 0.12, radius);
      const found: string[] = [];
      world.intersectionsWithShape({ x, y: y + 0.34, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, (collider) => {
        if (drivable.has(collider.handle)) return true;
        const label = labels.get(collider.handle);
        if (label && !found.includes(label)) found.push(label);
        return true;
      });
      return found;
    },
    step(dt, onStep) {
      accumulator = Math.min(accumulator + dt, MAX_CATCHUP);
      while (accumulator >= FIXED_STEP) {
        onStep(FIXED_STEP);
        world.step();
        accumulator -= FIXED_STEP;
      }
    },
  };
}
