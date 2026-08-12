/**
 * The cars.
 *
 * Silhouettes rather than models. What makes a 2004 German office car park
 * recognisable is not badges or panel gaps — it is proportion: where the
 * greenhouse sits on the body, how long the rear overhang is, how high the
 * belt line runs, and the fact that four out of nine of them are silver. Get
 * those and a viewer supplies the make themselves. Get them wrong and no amount
 * of detail rescues it.
 *
 * Each body is lofted from a profile down its length rather than assembled from
 * boxes, so the roofline is a real curve. That single decision is the whole
 * difference between a car and a shipping crate with wheels: a flat-topped box
 * reads as cargo at any distance, and a car's roof is never flat.
 *
 * Origin on the ground at the centre of the car; the bonnet points at -Z.
 */

import * as THREE from 'three';

import { CAR } from '../metrics';
import { CAR_COLORS, CAR_GLASS, asColor } from '../palette';
import { PROP_MAT, part } from './shared';
import type { Rng } from '../rng';

export type Body = 'hatch' | 'saloon' | 'estate' | 'van';

type Profile = {
  length: number;
  width: number;
  /** Belt line: the top of the lower body, where the glass starts. */
  belt: (t: number) => number;
  /** Roof height at t, or null where there is no greenhouse. */
  roof: (t: number) => number | null;
  /** Front and rear axle positions, as a fraction of the length. */
  axles: [number, number];
  /** Where the cabin starts and ends, for the pillars. */
  cabin: [number, number];
  /** Rear roof rails, which only the estate has. */
  rails?: boolean;
};

/** Smooth step, for rooflines that rise and fall rather than kink. */
const arc = (t: number, from: number, to: number): number => {
  const u = THREE.MathUtils.clamp((t - from) / (to - from), 0, 1);
  return Math.sin(u * Math.PI);
};

/**
 * The four bodies. Dimensions are the real ones — a Golf IV, a Passat B5 in
 * both shapes, and a T4 — because those four cars are ninety per cent of what
 * was parked outside a German office in 2004.
 */
const PROFILES: Record<Body, Profile> = {
  hatch: {
    length: 4.15,
    width: 1.74,
    belt: (t) => 0.92 + 0.05 * t,
    // Roof arcs up behind the windscreen and stays up almost to the tailgate,
    // which is what makes a hatchback a hatchback.
    roof: (t) => (t > 0.3 && t < 0.93 ? 1.28 + 0.16 * arc(t, 0.3, 1.05) : null),
    axles: [0.19, 0.79],
    cabin: [0.3, 0.93],
  },
  saloon: {
    length: 4.68,
    width: 1.74,
    belt: (t) => 0.94 + 0.06 * t,
    // Three-box: the roof stops at the C pillar and the boot deck carries on
    // at belt height, which is the entire visual difference from the estate.
    roof: (t) => (t > 0.32 && t < 0.76 ? 1.3 + 0.16 * arc(t, 0.28, 0.86) : null),
    axles: [0.19, 0.81],
    cabin: [0.32, 0.76],
  },
  estate: {
    length: 4.68,
    width: 1.76,
    belt: (t) => 0.94 + 0.06 * t,
    roof: (t) => (t > 0.32 && t < 0.96 ? 1.32 + 0.17 * arc(t, 0.28, 1.3) : null),
    axles: [0.19, 0.81],
    cabin: [0.32, 0.96],
    rails: true,
  },
  van: {
    length: 4.71,
    width: 1.84,
    // A van has almost no lower body: the sides go up nearly from the sill.
    belt: (t) => (t < 0.24 ? 1.0 : 1.14),
    roof: (t) => (t > 0.08 ? 1.9 + 0.04 * arc(t, 0.05, 1.4) : null),
    axles: [0.16, 0.82],
    cabin: [0.08, 0.34],
  },
};

const TAILLIGHT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x8e1c18),
  roughness: 0.18,
  metalness: 0.1,
  transparent: true,
  opacity: 0.85,
});

const HEADLIGHT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0xc9ccc8),
  roughness: 0.06,
  metalness: 0.2,
});

const TYRE = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x1a1a19), roughness: 0.92, metalness: 0 });

/**
 * Paint, cached per colour and per dye lot.
 *
 * Two cars of the same silver are the same silver — they came off the same
 * line. Giving every one of them a freshly mixed material would be both
 * physically wrong and the thing that stops twenty cars merging into a handful
 * of draws, so the small per-car variation is quantised into four lots.
 */
const FINISHES = new Map<string, { paint: THREE.MeshStandardMaterial; film: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial }>();

function finish(index: number, lot: number) {
  const key = `${index}:${lot}`;
  let set = FINISHES.get(key);
  if (set) return set;

  const spec = CAR_COLORS[index]!;
  const shade = 0.94 + lot * 0.04;
  set = {
    paint: new THREE.MeshStandardMaterial({
      color: asColor(spec).multiplyScalar(shade),
      roughness: spec.roughness,
      metalness: spec.metalness,
    }),
    // The band of road film along the sills. Everything that lives on an open
    // deck through a German winter has one, and it is the cheapest way to stop
    // a row of cars looking like a showroom.
    film: new THREE.MeshStandardMaterial({
      color: asColor(spec).multiplyScalar(shade * 0.62),
      roughness: Math.min(1, spec.roughness + 0.35),
      metalness: spec.metalness * 0.4,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: asColor(CAR_GLASS),
      roughness: CAR_GLASS.roughness,
      metalness: 0,
      transparent: true,
      opacity: 0.78,
    }),
  };
  FINISHES.set(key, set);
  return set;
}
const HUB = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8d9195), roughness: 0.35, metalness: 0.7 });
const PLATE = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xdedbd0), roughness: 0.5, metalness: 0 });

/** A road wheel with its tyre, hub and a hint of an arch behind it. */
function wheel(g: THREE.Group, x: number, z: number): void {
  const r = CAR.wheelDiameter / 2;
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, CAR.wheelWidth, 18), TYRE);
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(x, r, z);
  tyre.castShadow = true;
  g.add(tyre);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, CAR.wheelWidth + 0.006, 14), HUB);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(x + Math.sign(x) * 0.005, r, z);
  g.add(hub);
}

/** One car, in one of the nine finishes the palette allows. */
export function car(rng: Rng, body: Body = 'hatch'): THREE.Group {
  const g = new THREE.Group();
  const p = PROFILES[body];
  const L = p.length;
  const W = p.width;
  const slices = 26;
  const step = L / slices;
  // Slices overlap and carry only a hairline chamfer. At 160 mm apart a 20 mm
  // bevel cuts a visible groove between every pair and the car comes out
  // corrugated — the loft has to read as one surface, not as a stack of discs.
  const lap = step * 1.9;
  const seam = 0.005;

  const { paint, film, glass } = finish(Math.floor(rng() * CAR_COLORS.length), Math.floor(rng() * 4));

  const sill = CAR.sillHeight;

  for (let i = 0; i < slices; i++) {
    const t = (i + 0.5) / slices;
    const z = -L / 2 + t * L;
    const belt = p.belt(t);

    // Lower body. Tapered at both ends, so the car has a nose and a tail rather
    // than two identical square cuts.
    const taper = 0.82 + 0.18 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.02) / 0.96)));
    part(g, paint, [W * taper, belt - sill - 0.14, lap], [0, (belt + sill + 0.14) / 2, z], seam);
    // The road film band along the bottom of the doors.
    part(g, film, [W * taper * 0.985, 0.16, lap], [0, sill + 0.15, z], seam);

    const roof = p.roof(t);
    if (roof === null) continue;

    // Greenhouse: narrower than the body and set in, which is the single most
    // important proportion in the whole silhouette.
    const glassW = W * taper * 0.9;
    part(g, glass, [glassW, roof - belt - 0.05, lap], [0, (roof + belt - 0.05) / 2, z], seam);
    // Roof panel over the top of it.
    part(g, paint, [glassW + 0.02, 0.07, lap], [0, roof - 0.03, z], seam);
  }

  // Pillars. The A pillar is raked hard, the C pillar much less, and the eye
  // reads that difference as speed even parked.
  const pillar = (t: number, thickness: number) => {
    const z = -L / 2 + t * L;
    const roof = p.roof(Math.min(0.95, Math.max(0.05, t)));
    const belt = p.belt(t);
    if (roof === null) return;
    for (const s of [-1, 1] as const) {
      part(
        g,
        paint,
        [0.05, roof - belt, thickness],
        [(s * W * 0.86) / 2, (roof + belt) / 2 - 0.02, z],
        0.012,
      );
    }
  };
  pillar(p.cabin[0] + 0.02, 0.12);
  pillar((p.cabin[0] + p.cabin[1]) / 2, 0.07);
  pillar(p.cabin[1] - 0.02, 0.1);

  // Bumpers, which on a car of this era are body-coloured and slightly proud.
  for (const s of [-1, 1] as const) {
    part(g, film, [W * 0.94, 0.3, 0.1], [0, 0.48, (s * L) / 2 - s * 0.03], 0.03);
  }

  // Lights. Headlamps wrap the front corners; tail lamps are taller and sit
  // right at the outer edge, which is where the width of a car is read from.
  for (const s of [-1, 1] as const) {
    part(g, HEADLIGHT, [0.34, 0.15, 0.06], [s * (W * 0.32), 0.78, -L / 2 + 0.03], 0.02);
    part(g, TAILLIGHT, [0.2, 0.34, 0.06], [s * (W * 0.4), 0.82, L / 2 - 0.03], 0.02);
  }
  part(g, PLATE, [0.52, 0.11, 0.01], [0, 0.55, -L / 2 - 0.01], 0.004);
  part(g, PLATE, [0.52, 0.11, 0.01], [0, 0.62, L / 2 + 0.01], 0.004);

  // Door shut lines. Two a side on a five-door, and they are what stops the
  // flank reading as one extruded shape.
  for (const s of [-1, 1] as const) {
    for (const t of [p.cabin[0] + 0.06, (p.cabin[0] + p.cabin[1]) / 2]) {
      part(g, film, [0.01, 0.5, 0.012], [(s * W * 0.9) / 2, 0.6, -L / 2 + t * L], 0.002);
    }
  }

  // Mirrors, on their stalks, at the base of the A pillar.
  for (const s of [-1, 1] as const) {
    const z = -L / 2 + (p.cabin[0] + 0.03) * L;
    part(g, paint, [0.13, 0.08, 0.05], [s * (W * 0.56), p.belt(p.cabin[0]) + 0.02, z], 0.014);
  }

  const axleZ = (f: number) => -L / 2 + f * L;
  for (const s of [-1, 1] as const) {
    wheel(g, (s * (W - CAR.wheelWidth - 0.04)) / 2, axleZ(p.axles[0]));
    wheel(g, (s * (W - CAR.wheelWidth - 0.04)) / 2, axleZ(p.axles[1]));
  }

  if (p.rails) {
    for (const s of [-1, 1] as const) {
      const from = -L / 2 + 0.42 * L;
      const to = -L / 2 + 0.94 * L;
      part(g, PROP_MAT.darkMetal, [0.03, 0.03, to - from], [s * W * 0.34, 1.53, (from + to) / 2], 0.008);
    }
  }

  // Exhaust, and the shadow gap under the rear valance.
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.1, 10), PROP_MAT.darkMetal);
  pipe.rotation.x = Math.PI / 2;
  pipe.position.set(W * 0.28, 0.32, L / 2 + 0.02);
  g.add(pipe);

  return g;
}

/**
 * Dachbox on the roof of exactly one car, because somebody has not taken it off
 * since the Osterferien. Nothing says "these are people's cars" faster.
 */
export function roofBox(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2b2e33), roughness: 0.35, metalness: 0.15 });
  const slices = 10;
  for (let i = 0; i < slices; i++) {
    const t = (i + 0.5) / slices;
    const taper = 0.55 + 0.45 * Math.sin(Math.PI * t);
    part(g, shell, [0.78 * taper, 0.34 * (0.6 + 0.4 * taper), 1.9 / slices + 0.004], [0, 0.17, -0.95 + t * 1.9], 0.03);
  }
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.darkMetal, [0.05, 0.06, 0.3], [s * 0.28, -0.02, -0.4], 0.008);
    part(g, PROP_MAT.darkMetal, [0.05, 0.06, 0.3], [s * 0.28, -0.02, 0.4], 0.008);
  }
  return g;
}

/**
 * The bay's-worth of dimensions a dressing solver needs to know without having
 * to build the car first.
 */
export function carFootprint(body: Body): { length: number; width: number; height: number } {
  const p = PROFILES[body];
  const roof = p.roof(0.5);
  return { length: p.length, width: p.width, height: roof ?? p.belt(0.5) };
}
