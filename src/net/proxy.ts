/**
 * A chair somebody else is driving.
 *
 * ---- why this is so nearly `rivals.ts` ------------------------------------
 *
 * Because it is the same job. A rival is a kinematic capsule advanced every substep
 * from a stream of numbers that arrive from outside the driving model; the only
 * thing that changes here is where the stream comes from. `rivals.ts` says as much
 * where it argues for rails: what a racing game needs from an opponent is a pose,
 * and a pose is what a rail computes and what a socket delivers.
 *
 * Kinematic, then, exactly as a rail is, and for the extra reason that a dynamic
 * body would fight its own poses: the solver would push it somewhere, the next
 * packet would put it back, and the result is a chair that buzzes.
 *
 * ---- drawn late, on purpose ------------------------------------------------
 *
 * Poses arrive every 50 ms at best. Drawn at the newest one it has, a proxy stands
 * still and then jumps, because that is literally what the data says. So it is drawn
 * `INTERP_DELAY` behind the room clock and *interpolated between the two poses
 * either side of that moment* — both of which really happened. The cost is that a
 * chair is drawn about 700 mm behind where it truly is at racing pace, which is less
 * than the length of the chair; the benefit is that it moves.
 *
 * Extrapolation is deliberately not attempted. Guessing forward from the last pose
 * looks better on a clean connection and produces a chair that lunges and snaps back
 * on a bad one, which is worse exactly when it matters.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import { CHAIR } from '../office/metrics';
import type { Physics } from '../game/physics';
import { INTERP_DELAY, type SeatPose } from './protocol';

/** The same capsule a rail gets, for the same reasons — see `RIDER_HALF`. */
const RADIUS = CHAIR.baseDiameter / 2;
const RIDER_HALF = 0.42;
const CENTRE_Y = RIDER_HALF + RADIUS;

/** How much history to keep per seat. A second is far more than the buffer needs. */
const KEEP = 1.0;

/**
 * How far a pose may be from the one before it before we stop interpolating.
 *
 * Somebody who was disconnected for two seconds, or who has just been put back on
 * the grid, produces a pair of poses metres apart. Sliding between them drags the
 * chair through the building at a hundred miles an hour; snapping is the honest
 * picture of what happened.
 */
const TELEPORT = 4;

export type Proxy = {
  /** The mesh, for the caller to add to the scene and dress with a driver. */
  object: THREE.Object3D;
  /** Latest known route distance, so standings can rank it like anything else. */
  progress: number;
  stunned: number;
  finished: boolean;
  yaw: number;
  position: THREE.Vector3;
  /** True once at least one pose has arrived; false leaves it hidden. */
  live: boolean;
};

export type Proxies = {
  /** Take a pose off the wire. Out-of-order arrivals are handled. */
  accept(pose: SeatPose): void;
  /** Draw every proxy at `roomTime - INTERP_DELAY`. Call once a frame. */
  update(roomTime: number): void;
  /** What seat `id` looks like right now, or undefined if it is not a proxy. */
  get(seat: number): Proxy | undefined;
  readonly all: readonly Proxy[];
  reset(): void;
  dispose(): void;
};

export function createProxies(
  physics: Physics,
  /** Which seats are driven from elsewhere, and the mesh to use for each. */
  seats: readonly { seat: number; object: THREE.Object3D }[],
): Proxies {
  const lanes = new Map<
    number,
    { proxy: Proxy; body: RAPIER.RigidBody; buffer: SeatPose[] }
  >();

  for (const { seat, object } of seats) {
    const body = physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTRE_Y, 0),
    );
    physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(RIDER_HALF, RADIUS).setFriction(0.02).setRestitution(0.15),
      body,
    );
    object.visible = false;
    lanes.set(seat, {
      body,
      buffer: [],
      proxy: {
        object,
        progress: 0,
        stunned: 0,
        finished: false,
        yaw: 0,
        position: new THREE.Vector3(),
        live: false,
      },
    });
  }

  return {
    accept(pose) {
      const lane = lanes.get(pose.seat);
      if (!lane) return;
      const buffer = lane.buffer;
      // Packets can overtake each other. Insert by time rather than pushing, so the
      // buffer stays ordered and a late arrival lands where it belongs instead of
      // making the chair jump backwards for one frame.
      let i = buffer.length;
      while (i > 0 && buffer[i - 1]!.t > pose.t) i--;
      if (i > 0 && buffer[i - 1]!.t === pose.t) return;
      buffer.splice(i, 0, pose);
      const cutoff = pose.t - KEEP;
      while (buffer.length > 2 && buffer[0]!.t < cutoff) buffer.shift();
    },

    update(roomTime) {
      const want = roomTime - INTERP_DELAY;
      for (const lane of lanes.values()) {
        const { buffer, proxy, body } = lane;
        if (!buffer.length) continue;

        // The pair either side of `want`, or the ends of what we have.
        let after = 0;
        while (after < buffer.length && buffer[after]!.t < want) after++;

        let shown: { x: number; y: number; z: number; yaw: number };
        const b = buffer[after];
        const a = buffer[after - 1];

        if (a && b) {
          const span = b.t - a.t;
          const k = span > 1e-6 ? Math.min(1, Math.max(0, (want - a.t) / span)) : 1;
          const jump = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > TELEPORT;
          shown = jump
            ? { x: b.x, y: b.y, z: b.z, yaw: b.yaw }
            : {
                x: a.x + (b.x - a.x) * k,
                y: a.y + (b.y - a.y) * k,
                z: a.z + (b.z - a.z) * k,
                // Through the short way round, or a chair crossing due south spins
                // the long way home.
                yaw: a.yaw + Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw)) * k,
              };
        } else {
          // Before the first pose or after the last: hold the nearest one rather
          // than guess. A chair that pauses reads as lag; one that drifts off on its
          // own reads as a bug.
          const only = b ?? a ?? buffer[buffer.length - 1]!;
          shown = { x: only.x, y: only.y, z: only.z, yaw: only.yaw };
        }

        const newest = buffer[buffer.length - 1]!;
        proxy.progress = newest.progress;
        proxy.stunned = newest.stunned;
        proxy.finished = newest.finished;
        proxy.yaw = shown.yaw;
        proxy.position.set(shown.x, shown.y, shown.z);
        proxy.live = true;

        proxy.object.visible = true;
        proxy.object.position.set(shown.x, shown.y, shown.z);
        proxy.object.rotation.set(0, shown.yaw, 0);
        // The body's centre sits a capsule's height above the floor the mesh is on,
        // the same offset a rail applies.
        body.setNextKinematicTranslation({ x: shown.x, y: shown.y + CENTRE_Y, z: shown.z });
        body.setNextKinematicRotation({
          x: 0,
          y: Math.sin(shown.yaw / 2),
          z: 0,
          w: Math.cos(shown.yaw / 2),
        });
      }
    },

    get: (seat) => lanes.get(seat)?.proxy,

    get all() {
      return [...lanes.values()].map((l) => l.proxy);
    },

    reset() {
      for (const lane of lanes.values()) {
        lane.buffer.length = 0;
        lane.proxy.live = false;
        lane.proxy.progress = 0;
        lane.proxy.stunned = 0;
        lane.proxy.finished = false;
        lane.proxy.object.visible = false;
      }
    },

    dispose() {
      for (const lane of lanes.values()) physics.world.removeRigidBody(lane.body);
      lanes.clear();
    },
  };
}
