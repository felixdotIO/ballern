/**
 * Ramps, made of what a building like this actually has lying about.
 *
 * The brief was "organic" ramps, and the word is doing real work: nothing on
 * this floor was built to be jumped off. A moulded skate kicker dropped into a
 * German office at golden hour would be the single most out-of-place object in
 * the game — it would announce that the level has stopped being a building and
 * started being a track. What a floor like this *does* have is sheet material,
 * pallets, archive boxes, a shelving unit somebody took apart and never took
 * away, and a facilities man who leaned a board against them so a trolley could
 * get up. Every ramp here is that: a sheet of something, propped on something.
 *
 * ---- the frame every one of them is built in ------------------------------
 *
 * A kicker is authored with its low edge at the origin and rising toward −Z,
 * which is the game's forward. That is not arbitrary: `dress/common.ts` places
 * these with the yaw a chair would be driving at, and `collision.ts` pitches the
 * collider about its own X *after* that yaw, so a positive pitch and a matching
 * yaw put the climb in the direction of travel with no sign-juggling at the call
 * site. Get the convention wrong and the ramp reads as a kerb: the chair arrives
 * at the high edge and stops dead against a 500 mm wall.
 *
 * The deck's *surface* is what matters and the collider is authored off it — the
 * sheet hangs below its own driving surface, like a real board on real pallets.
 *
 * ---- the numbers ---------------------------------------------------------
 *
 * 18° and about 1.35 m of sheet, which comes from the driving model rather than
 * from taste — and was measured rather than reasoned about. `chair.ts` moves the
 * speed ceiling by the gradient and clamps the slope term at 3 m/s², which is
 * reached at 18°: steeper costs no more per second but keeps the chair on the
 * ramp longer, and the first pass at 22° took a chair from 6 m/s to 3.4 at the
 * lip. At 18 the same jump leaves around 4.4, which is four tenths of a second
 * in the air and better than a metre of carry — unmistakably a jump, and not
 * enough to put the player on the ceiling.
 */

import * as THREE from 'three';

import { PROP_MAT, part } from './shared';
import { jitter, range, type Rng } from '../rng';

/** A ramp, in the frame described above. */
export type Kicker = {
  group: THREE.Group;
  /** Length of the sloping surface itself, metres. */
  length: number;
  width: number;
  /** How high the top edge stands above the floor. */
  rise: number;
  /** Thickness of the sheet, so the collider can hang under its own surface. */
  thickness: number;
};

/**
 * The angle everything here is built at.
 *
 * 18.3°, which is where `chair.ts` clamps its slope term: below it the climb
 * costs proportionally less, above it the cost stops rising but the geometry gets
 * harder for a capsule on castors to transition onto. Measured on the office
 * kicker, 22° took a chair from 6 m/s to 3.4 at the lip and 18° leaves it near
 * 4.4 — the same jump, most of the speed kept.
 */
const PITCH = 0.32;

const PLYWOOD = new THREE.MeshStandardMaterial({
  // Site ply: sanded one side, and orange-brown rather than yellow, which is
  // what separates it from the beech melamine the whole building is faced in.
  color: new THREE.Color(0xb07a41),
  roughness: 0.82,
  metalness: 0,
});

const CARDBOARD = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x9c7a55),
  roughness: 0.95,
  metalness: 0,
});

const WHITEBOARD = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0xeceff0),
  roughness: 0.18,
  metalness: 0.02,
});

const HAZARD = new THREE.MeshStandardMaterial({
  // The one piece of colour any of these is allowed. A strip of hazard tape
  // across the lip is what somebody responsible does to a board people are
  // running a trolley up, and it is also the only reason the lip reads at speed.
  color: new THREE.Color(0xe0a52a),
  roughness: 0.6,
  metalness: 0,
});

/**
 * The sheet, laid at the pitch, with the mid-point of its surface where the
 * geometry wants it.
 *
 * Everything else in a kicker is packing under this.
 */
function deck(
  group: THREE.Group,
  material: THREE.Material,
  length: number,
  width: number,
  thickness: number,
  rise: number,
): void {
  const run = Math.sqrt(Math.max(0, length * length - rise * rise));
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length), material);
  // Down and back along its own normal by half its thickness, so the *top* face
  // is the plane the collider will be authored on.
  sheet.position.set(0, rise / 2 - (thickness / 2) * Math.cos(PITCH), -run / 2 - (thickness / 2) * Math.sin(PITCH));
  sheet.rotation.x = PITCH;
  group.add(sheet);

  // Hazard tape across the lip, and a hair proud of the sheet so it never
  // z-fights with it.
  const tape = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, thickness * 0.5, 0.09), HAZARD);
  tape.position.set(0, rise - thickness * 0.18, -run + 0.055);
  tape.rotation.x = PITCH;
  group.add(tape);
}

/** A stack of pallets, which is the most honest prop in the building. */
function pallets(group: THREE.Group, at: number, height: number, width: number, rng: Rng): void {
  const decks = Math.max(2, Math.round(height / 0.144));
  for (let i = 0; i < decks; i++) {
    const y = (i + 0.5) * (height / decks);
    const skew = jitter(rng, 0.02);
    part(group, PLYWOOD, [width, height / decks - 0.05, 0.78], [skew, y, at], 0.004);
    // Two bearers per pallet, which is what you see from the side of a stack.
    for (const s of [-1, 1] as const) {
      part(group, PROP_MAT.metal, [0.05, 0.03, 0.8], [skew + (s * width) / 2.6, y + height / decks / 2 - 0.02, at], 0.003);
    }
  }
}

/**
 * Pallets and a sheet of ply. The car deck's, and the plainest of the four —
 * it is standing in the open where a delivery would have been dropped.
 */
export function palletKicker(rng: Rng): Kicker {
  const group = new THREE.Group();
  const length = range(rng, 1.3, 1.42);
  const width = 1.34;
  const rise = length * Math.sin(PITCH);
  const run = length * Math.cos(PITCH);

  deck(group, PLYWOOD, length, width, 0.045, rise);
  pallets(group, -run + 0.42, rise - 0.06, width * 0.92, rng);
  // One more on its side at the foot, chocking the sheet so it cannot slide.
  part(group, PLYWOOD, [width * 0.5, 0.1, 0.14], [jitter(rng, 0.1), 0.05, -0.16], 0.006);

  return { group, length, width, rise, thickness: 0.045 };
}

/**
 * A dismantled shelving unit with the ply over it. Ebene 5's, because a garage
 * is where the shelves that no longer fit anywhere go.
 */
export function shelfKicker(rng: Rng): Kicker {
  const group = new THREE.Group();
  const length = range(rng, 1.32, 1.4);
  const width = 1.28;
  const rise = length * Math.sin(PITCH);
  const run = length * Math.cos(PITCH);

  deck(group, PLYWOOD, length, width, 0.04, rise);

  // The unit on its back: uprights become bearers, shelves become slats.
  const bays = 3;
  for (let i = 0; i < bays; i++) {
    const y = rise * (0.3 + 0.7 * (i / bays));
    part(group, PROP_MAT.metal, [width * 0.86, 0.028, 0.5], [0, y, -run + 0.3 + i * 0.16], 0.004);
  }
  for (const s of [-1, 1] as const) {
    part(group, PROP_MAT.darkMetal, [0.05, rise - 0.04, 0.62], [(s * width) / 2.5, (rise - 0.04) / 2, -run + 0.42], 0.004);
  }
  // A strap round the lot, which is how it has stayed put for two years.
  part(group, PROP_MAT.plastic, [width * 0.9, 0.02, 0.03], [0, rise * 0.62, -run + 0.62], 0.003);

  return { group, length, width, rise, thickness: 0.04 };
}

/**
 * A whiteboard off the wall, laid over a stack of archive boxes. The
 * open-plan's, and the one that is obviously somebody's fault.
 */
export function boardKicker(rng: Rng): Kicker {
  const group = new THREE.Group();
  const length = range(rng, 1.34, 1.44);
  const width = 1.22;
  const rise = length * Math.sin(PITCH);
  const run = length * Math.cos(PITCH);

  deck(group, WHITEBOARD, length, width, 0.036, rise);
  // Aluminium frame down both long edges, which is the only part of a
  // whiteboard that reads from more than two metres away.
  for (const s of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, length), PROP_MAT.stainless);
    rail.position.set((s * width) / 2, rise / 2 - 0.012, -run / 2 - 0.01);
    rail.rotation.x = PITCH;
    group.add(rail);
  }

  // Archive boxes under it. Lid labels face out, because they always do.
  const rows = 3;
  for (let i = 0; i < rows; i++) {
    const h = 0.26;
    const y = i * h;
    if (y + h > rise + 0.06) break;
    const back = -run + 0.34 + jitter(rng, 0.03);
    part(group, CARDBOARD, [0.78, h - 0.02, 0.36], [jitter(rng, 0.05), y + h / 2, back], 0.006);
    part(group, PROP_MAT.paper, [0.3, 0.001, 0.14], [jitter(rng, 0.04), y + h - 0.02, back - 0.1], 0.002);
  }

  return { group, length, width, rise, thickness: 0.036 };
}

/**
 * Floor protection over a rolled carpet and a pallet — the hall's, where
 * something is always being fitted out and the granite is always being covered.
 */
export function matKicker(rng: Rng): Kicker {
  const group = new THREE.Group();
  const length = range(rng, 1.3, 1.38);
  const width = 1.4;
  const rise = length * Math.sin(PITCH);
  const run = length * Math.cos(PITCH);

  deck(group, PROP_MAT.melamine, length, width, 0.03, rise);

  // The roll doing the propping. Two of them, the far one shorter, so the
  // section under the board is not a single extruded shape.
  for (const [i, z] of [-run + 0.3, -run + 0.62].entries()) {
    const radius = 0.2 - i * 0.05;
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width * (0.9 - i * 0.08), 16), PROP_MAT.fabric);
    roll.rotation.z = Math.PI / 2;
    roll.position.set(jitter(rng, 0.04), radius, z);
    group.add(roll);
  }
  part(group, PLYWOOD, [width * 0.86, rise * 0.5, 0.5], [0, rise * 0.25, -run + 0.46], 0.006);

  return { group, length, width, rise, thickness: 0.03 };
}
