/**
 * Cheering colleagues, and the job they do is track design rather than dressing.
 *
 * ---- what replaced what --------------------------------------------------
 *
 * The lap used to be told to you by twelve floating pink donuts, one per
 * checkpoint. They worked, and they were the wrong instrument: a checkpoint
 * marker is a *sign*, and a sign is what you reach for when the building does not
 * say the thing by itself. It also meant the route was enforced entirely in
 * software — `race.ts` refusing to count a lap — with nothing in the world
 * stopping a chair going the wrong way, only something telling it off afterwards.
 *
 * A crowd says both at once, in the register the rest of the game is in. A wall of
 * people with their arms up is unmistakably *the way*, from any angle, at any
 * distance, without a single icon; and it is solid, so the shortcut behind them is
 * simply not available. The gates in `race.ts` are unchanged and still decide
 * whether a lap counts — the difference is that the route is now shaped by the
 * building and merely *checked* by the timer.
 *
 * ---- where they go, and it was measured ----------------------------------
 *
 * Not by eye. The lap was swept for pairs of points a long way apart *along the
 * route* but close together *in the building*, with nothing solid between them:
 * that is the definition of a shortcut, and it found nineteen of them. Each stand
 * below closes one, and every one was checked twice — the sweep re-run to prove
 * the gap is shut, and `dev/routeTest.ts` re-run to prove the racing line is not.
 *
 * Two rules came out of getting it wrong first. A stand must run **across** its
 * shortcut, not along it — a barrier parallel to the gap you are shutting is a
 * handrail. And it must be short enough to sit **between** the two lanes without
 * touching either, or `routeTest` finds the racing line standing inside a crowd,
 * which is exactly what happened on the first attempt at Ebene 5.
 *
 * ---- why they are instanced ----------------------------------------------
 *
 * The cast is seven rigged GLBs and a crowd of those is unaffordable — every one
 * is a skinned mesh with its own skeleton, and the frame budget is already most of
 * the way spent on post-processing. So a colleague is the building's own prop
 * language, bevelled boxes merged into three shapes, and the whole crowd across
 * every stand is **three draw calls** — one per body part, instanced, with the
 * shirt colour and the jump carried per instance. Forty people cost three draws
 * and forty matrix writes a frame.
 */

import * as THREE from 'three';

import { collapse } from '../render/batch';
import { bevelBox } from '../render/geometry';
import type { CollisionVolume } from './collision';
import { LEVELS } from './plan';
import { makeRng, range, seedFrom, type Rng } from './rng';

/**
 * The hero colours, borrowed from the cast rather than invented.
 *
 * `blender/crew/cast.py` gives every character one saturated colour and a white
 * tee, and a crowd is the rest of the office — so it is the same wardrobe seen
 * from thirty metres. Using the pickups' palette instead would have been the
 * mistake: those four are reserved for things you can collect, and a barrier you
 * drive at because it is piñata-coloured is a barrier that has lied to you.
 */
const SHIRTS = [0x3f6fa8, 0x8a4a7d, 0x2f7d63, 0xa8543a, 0x4a5a86, 0x7d6a3a] as const;
const SKIN = [0xe8c9a8, 0xc59a70, 0x8d6247, 0xf0d8bd] as const;

/** Head height. */
const STAND = 1.62;

/**
 * How high they get off the floor, and how fast.
 *
 * 220 mm, which is a person hopping on the spot rather than a person jumping —
 * and the difference matters because the collider does not move. A crowd that
 * leaves the ground by half a metre is a crowd with a visible gap under a barrier
 * that is still solid, and the first thing a player does with a gap is aim at it.
 *
 * The rate is per-figure and deliberately spread wide. A crowd jumping in time is
 * a chorus line; what a real one does is a mess of people each on their own beat,
 * and the mess is the whole read.
 */
const HOP = 0.22;

export type Stand = {
  /** Middle of the line, on its floor. */
  at: readonly [number, number, number];
  /** How long the line is, and which way it runs — the line lies along local X. */
  length: number;
  yaw: number;
  label: string;
};

export const STANDS: readonly Stand[] = [
  {
    // The deck's north end. The big one: without it, 9.7 m of open concrete was
    // worth 154 m of lap — forty per cent of the race. The lanes are at x≈8.4 and
    // x≈18.1, so a line down the middle at 13.2 is nearly five metres clear of
    // each of them.
    at: [13.2, LEVELS.floor, 6.9],
    length: 8.0,
    yaw: Math.PI / 2,
    label: 'crowd.deck.north',
  },
  {
    // Ebene 5's waist, where the level narrows and the two lanes run either side
    // of the column line — at x≈7.7 and x≈13.5. Long, because the open ground
    // between them runs the length of the waist rather than pinching at a point.
    at: [10.6, LEVELS.garage, 31.0],
    length: 13.0,
    yaw: Math.PI / 2,
    label: 'crowd.garage.waist',
  },
  {
    /*
     * The Grossraum, and this is the one that changes how the room is driven.
     *
     * The office is meant to be a full circuit: in at the west, east along the
     * north glazing, back west along the south side of the desk run, out at the
     * south. What was available instead was to come in, carry straight on, and
     * turn immediately right onto the return leg — arriving at the exit having
     * driven a quarter of the room. Measured, that is 60 m of lap for 9.8 m of
     * driving.
     *
     * The first attempt put the stand across the middle of the room at z=9.6 and
     * closed nothing, because the cut does not run through the middle of the room.
     * Traced properly, it starts at (34.4, 10.7) — which is still in the *kitchen* —
     * goes through the surviving canteen door, and lands on the return leg at
     * (46, 13.8). Twelve metres of driving for sixty-three metres of lap.
     *
     * So the stand is just inside the Grossraum, immediately east of that door,
     * running north–south. It stands between the door and the return leg, and it is
     * west of x=46 where the return leg actually begins, so neither the entry sweep
     * nor the lane it was cutting to is touched. Coming through the door you can no
     * longer turn right onto the way home; you have to go round the room.
     */
    at: [38.5, LEVELS.floor, 13.0],
    length: 5.0,
    yaw: Math.PI / 2,
    label: 'crowd.office.middle',
  },

  /*
   * ---- and the desk run itself --------------------------------------------
   *
   * The Grossraum is meant to be one long circuit: east along the north glazing,
   * back west along the south side of the desks. What makes that optional is the
   * desk run's own cross-aisles — measured, six of them, each a clear two metres
   * wide, every one of which is a straight line from the north lane to the south
   * one. Take the first and you have driven a fifth of the room.
   *
   * Colleagues stand in five of the six, which is the number that matters: the
   * one left open is the easternmost at x≈64.5, and that is not a shortcut, it is
   * the turn at the end of the room. Blocking the other five means the first place
   * you can come back is the far end, so the whole round has to be taken.
   *
   * They are the front rows of the office watching the race come past their own
   * desks, which is the most plausible place in the building for a crowd to be.
   */
  ...[41.75, 46.25, 50.75, 55.25, 59.75].map((x, i) => ({
    at: [x, LEVELS.floor, 7.3] as const,
    length: 2.4,
    yaw: 0,
    label: `crowd.office.aisle.${i}`,
  })),
];

export type Crowd = {
  group: THREE.Group;
  collision: CollisionVolume[];
  /** Bounce them. Call once a frame. */
  update(dt: number): void;
};

/** How thick a stand is, and how high its collider stands. */
const DEPTH = 0.7;
const BLOCK = 1.1;

/** One colleague, at the origin, arms up. Merged per material by the caller. */
function figure(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const put = (name: string, size: [number, number, number], at: [number, number, number], rot?: number) => {
    const m = new THREE.Mesh(bevelBox(size[0], size[1], size[2], 0.02), MATS[name]!);
    m.position.set(at[0], at[1], at[2]);
    if (rot) m.rotation.z = rot;
    m.castShadow = true;
    g.add(m);
  };
  put('legs', [0.34, 0.82, 0.24], [0, 0.41, 0]);
  put('shirt', [0.42, 0.56, 0.26], [0, 1.1, 0]);
  put('skin', [0.24, 0.26, 0.24], [0, STAND - 0.13, 0]);
  // Both arms up, and that is the entire silhouette at the distance this is read
  // from. The lean is fixed rather than per-figure: instancing shares one matrix
  // per person, so variety is bought with yaw, colour and the beat instead.
  for (const side of [-1, 1] as const) {
    put('skin', [0.13, 0.62, 0.13], [side * 0.29, 1.42, 0], 0.3 * side);
  }
  void rng;
  return g;
}

/** Three materials, three instanced meshes, three draws for the whole crowd. */
const MATS: Record<string, THREE.MeshStandardMaterial> = {
  legs: new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.8 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }),
};

export function buildCrowd(): Crowd {
  const group = new THREE.Group();
  const collision: CollisionVolume[] = [];
  const rng = makeRng(seedFrom('office.crowd'));

  /** Where every colleague stands, and the beat they are on. */
  const people: { x: number; y: number; z: number; yaw: number; phase: number; rate: number; shirt: THREE.Color; skin: THREE.Color }[] = [];

  for (const stand of STANDS) {
    const across = Math.max(2, Math.round(stand.length / 0.78));
    const cos = Math.cos(stand.yaw);
    const sin = Math.sin(stand.yaw);
    // Two ranks, staggered: one line of people is a queue, two is a crowd, and the
    // back rank is what stops a stand reading as cardboard from an angle.
    for (let rank = 0; rank < 2; rank++) {
      for (let i = 0; i < across - rank; i++) {
        const t = (i + rank * 0.5) / (across - 1) - 0.5;
        const along = t * stand.length + range(rng, -0.06, 0.06);
        const back = -rank * 0.52 + range(rng, -0.05, 0.05);
        people.push({
          // The line lies along local X and the depth along local Z, turned by yaw.
          x: stand.at[0] + along * cos + back * sin,
          y: stand.at[1],
          z: stand.at[2] - along * sin + back * cos,
          yaw: stand.yaw + range(rng, -0.35, 0.35),
          phase: rng() * Math.PI * 2,
          rate: range(rng, 4.2, 7.4),
          shirt: new THREE.Color(SHIRTS[Math.floor(rng() * SHIRTS.length)]!),
          skin: new THREE.Color(SKIN[Math.floor(rng() * SKIN.length)]!),
        });
      }
    }

    collision.push({
      label: stand.label,
      size: [stand.length + 0.5, BLOCK, DEPTH],
      centre: [
        stand.at[0] - 0.26 * sin,
        stand.at[1] + BLOCK / 2,
        stand.at[2] - 0.26 * cos,
      ],
      yaw: stand.yaw,
    });
  }

  // One figure, merged, then instanced once per person per body part.
  const merged = collapse(figure(rng), { detail: 'high' });
  const parts: { mesh: THREE.InstancedMesh; tint: 'shirt' | 'skin' | null }[] = [];
  for (const child of [...merged.children]) {
    const m = child as THREE.Mesh;
    if (!m.isMesh) continue;
    const mat = m.material as THREE.MeshStandardMaterial;
    const which = mat === MATS.shirt ? 'shirt' : mat === MATS.skin ? 'skin' : null;
    const inst = new THREE.InstancedMesh(m.geometry, mat, people.length);
    inst.castShadow = true;
    // They never leave their stand, and a crowd culled because its origin is off
    // screen is a crowd that vanishes as you turn into it.
    inst.frustumCulled = false;
    if (which) {
      for (let i = 0; i < people.length; i++) inst.setColorAt(i, people[i]![which]);
      inst.instanceColor!.needsUpdate = true;
    }
    group.add(inst);
    parts.push({ mesh: inst, tint: which });
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  let clock = 0;

  function update(dt: number): void {
    clock += dt;
    for (let i = 0; i < people.length; i++) {
      const p = people[i]!;
      // Off the floor on the up-beat only: `max(0, sin)` gives a hop with a pause
      // on the ground between them, which is what jumping looks like. A raw sine
      // is a float, and a crowd of floats is a crowd underwater.
      const s = Math.sin(p.phase + clock * p.rate);
      pos.set(p.x, p.y + Math.max(0, s) * HOP, p.z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      m4.compose(pos, q, one);
      for (const part of parts) part.mesh.setMatrixAt(i, m4);
    }
    for (const part of parts) part.mesh.instanceMatrix.needsUpdate = true;
  }

  update(0);
  return { group, collision, update };
}
