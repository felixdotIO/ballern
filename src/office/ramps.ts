/**
 * The two ramps between the top deck and Ebene 5.
 *
 * Open slots cut through the deck rather than enclosed head-houses, and that is
 * the single decision this whole file is downstream of. An enclosed ramp is a
 * dark mouth you take on trust: you cannot see where it goes, you cannot see
 * what is at the bottom, and the first time you drive it is the first time you
 * find out. An open one is a three-metre drop with a balustrade round it that
 * you pass twice a lap on the longest straight in the game — so by the time you
 * turn into it you have already been shown the level below, twice, from above.
 * That is free wayfinding, it is what a real Parkhaus does with its light wells,
 * and it costs nothing but a hole in a slab.
 *
 * Everything here is poured, painted or bolted, like everything else on the
 * Parkhaus: the slab, the upstands either side of it, the guarding round the
 * hole, and the two rolls of paint that tell you which way each one goes.
 *
 * The gradient is not chosen here. It falls out of the storey height and the
 * length of the building, both of which are set in metrics.ts and plan.ts, and
 * plan.ts asserts the result is something a garage ramp is allowed to be.
 */

import * as THREE from 'three';

import type { CollisionVolume } from './collision';
import { DECK, FITTINGS, GARAGE } from './metrics';
import { MAT } from './materials';
import { LEVELS, type Ramp } from './plan';
import { SODIUM } from './palette';
import type { Sink } from '../render/batch';

/** Structural depth of the ramp slab. Thinner than the deck: it spans less. */
const SLAB = 0.24;
/** Kerb either side of the running surface, and the guardrail standing on it. */
const KERB = { height: 0.28, width: 0.3 } as const;
/** How far the paint sits above the slab. Same reasoning as the deck's. */
const LIFT = 0.008;

type Geometry = {
  /** Angle the slab is tipped through, about X. Positive drops the +Z end. */
  pitch: number;
  /** Distance along the slope, which is the length the slab is actually cast. */
  run: number;
  cx: number;
  width: number;
  /** Centre of the sloping surface, in world space. */
  midY: number;
  midZ: number;
  /**
   * Ramp frame to world. Local X is across the ramp, local Z is up and down the
   * slope from its centre, local Y is the surface normal. Everything laid on a
   * ramp is authored in these and multiplied out, because the alternative is
   * trigonometry at every call site and one sign error putting the paint
   * underneath the concrete.
   */
  frame: THREE.Matrix4;
};

function geometryOf(ramp: Ramp): Geometry {
  const drop = LEVELS.floor - LEVELS.garage;
  const fall = ramp.zLow - ramp.zHigh;
  return {
    pitch: Math.atan2(drop, fall),
    run: Math.hypot(fall, drop),
    cx: (ramp.x0 + ramp.x1) / 2,
    width: ramp.x1 - ramp.x0,
    midY: (LEVELS.floor + LEVELS.garage) / 2,
    midZ: (ramp.zHigh + ramp.zLow) / 2,
    frame: new THREE.Matrix4()
      .makeRotationX(Math.atan2(drop, fall))
      .setPosition((ramp.x0 + ramp.x1) / 2, (LEVELS.floor + LEVELS.garage) / 2, (ramp.zHigh + ramp.zLow) / 2),
  };
}

/** A point on the ramp's surface, given how far across and along it sits. */
function at(g: Geometry, across: number, along: number, above = 0): [number, number, number] {
  const v = new THREE.Vector3(across, above, along).applyMatrix4(g.frame);
  return [v.x, v.y, v.z];
}

/** World Z to a distance along the slope from the ramp's centre. */
const alongTo = (g: Geometry, z: number) => (z - g.midZ) / Math.cos(g.pitch);

/**
 * A box in the ramp's own frame, tipped with the slab rather than with the
 * world.
 *
 * The batcher's `box` takes a yaw and nothing else, which is right for a
 * building where the only thing off-square is a door standing open. Anything on
 * a ramp has to come in as geometry with the frame baked into its vertices
 * instead — otherwise the slab is in the right place, at the right size, and
 * perfectly level, which is the one thing it must not be.
 */
function slopedBox(
  sink: Sink,
  material: THREE.Material,
  g: Geometry,
  size: readonly [number, number, number],
  local: readonly [number, number, number],
  opts?: { cast?: boolean },
): void {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const m = new THREE.Matrix4().makeTranslation(local[0], local[1], local[2]).premultiply(g.frame);
  sink.geo(material, geo, m, opts);
}

// ---------------------------------------------------------------------------
// Slab
// ---------------------------------------------------------------------------

/**
 * The running surface, its kerbs, and the guardrail over them.
 *
 * One cuboid for the slab, tipped by the actual gradient, and one collider that
 * is the same cuboid. The alternative — a flight of thin level boxes
 * approximating the slope — is not a ramp: it is a staircase with 40 mm risers,
 * and a chair on castors finds every one of them. It either chatters the whole
 * way down or catches a nosing and stops dead, and from the driver's seat
 * neither failure looks anything like a collider problem.
 */
function slab(sink: Sink, out: CollisionVolume[], ramp: Ramp, g: Geometry): void {
  const push = (
    label: string,
    size: readonly [number, number, number],
    centre: readonly [number, number, number],
  ) => out.push({ label, size, centre, pitch: g.pitch });

  // Overrun at the low end only, and that asymmetry is the whole of it.
  //
  // A sloping slab extended past the top of its own ramp does not tuck under the
  // deck — it climbs above it, because the extension follows the slope upward.
  // Six hundred millimetres of overrun at thirteen per cent put a 75 mm lip
  // across the mouth of the Ausfahrt: a step you cannot see, arrived at
  // southbound at six metres a second off the fastest straight on the lap. It
  // launched the chair, and because the driving model *sets* the horizontal
  // velocity every substep rather than accumulating it, whatever came down was
  // still being driven forward into the step — often far enough under the
  // slab's up-slope end to end up inside it, looking out through the deck.
  //
  // At the low end the same overrun does exactly what overrun is for: it runs on
  // under the garage floor, which is 280 mm of concrete at a fixed level and
  // simply wins. So the slab stops dead where the deck starts and runs long
  // where the floor is flat.
  const overrun = 0.6;
  const length = g.run + overrun;

  slopedBox(sink, MAT.concrete, g, [g.width, SLAB, length], [0, -SLAB / 2, overrun / 2], { cast: false });
  push(`${ramp.id}.slab`, [g.width, SLAB, length], at(g, 0, overrun / 2, -SLAB / 2));

  // Kerbs. Low enough to be a kerb rather than a wall — you can see over them
  // from the seat, which is the whole reason the slot reads as open — and the
  // collider standing on them, which is full guard height, is what actually
  // keeps a chair on the ramp.
  for (const side of [-1, 1] as const) {
    const across = side * (g.width / 2 - KERB.width / 2);
    slopedBox(sink, MAT.concreteFair, g, [KERB.width, KERB.height, length], [across, KERB.height / 2, overrun / 2]);
    push(
      `${ramp.id}.kerb.${side < 0 ? 'west' : 'east'}`,
      [KERB.width, DECK.guardHeight, length],
      at(g, across, overrun / 2, DECK.guardHeight / 2),
    );

    // Steel guard on the kerb, bringing it to the 1.10 m the regs want. Two
    // rails and a post every two and a half metres, which is how every one of
    // these has ever been made.
    for (const y of [DECK.guardHeight, DECK.guardHeight - 0.42]) {
      slopedBox(sink, MAT.darkMetal, g, [0.05, 0.05, length], [across, y, overrun / 2]);
    }
    for (let s = -g.run / 2; s <= g.run / 2 + 0.01; s += 2.5) {
      slopedBox(sink, MAT.darkMetal, g, [0.06, DECK.guardHeight - KERB.height, 0.06], [
        across,
        (DECK.guardHeight + KERB.height) / 2,
        s,
      ]);
    }
  }
}

/**
 * The soffit, which is the only part of a ramp anybody photographs.
 *
 * Seen from Ebene 5 the underside of a ramp is a raking plane coming down out
 * of the deck, and it is the strongest single cue that there is a level above
 * this one. Left as the bare bottom of the slab it reads as a wedge of nothing;
 * given the two edge beams it is actually built with, it reads as structure.
 */
function soffit(sink: Sink, g: Geometry): void {
  const length = g.run + 1.2;
  for (const side of [-1, 1] as const) {
    const across = side * (g.width / 2 - 0.2);
    slopedBox(sink, MAT.concreteFair, g, [0.4, 0.45, length], [across, -SLAB - 0.225, 0], { cast: false });
  }
}

// ---------------------------------------------------------------------------
// Paint and signs
// ---------------------------------------------------------------------------

/** A flat marking laid on the ramp's surface, in the ramp's own frame. */
function paint(
  sink: Sink,
  material: THREE.Material,
  g: Geometry,
  across: number,
  along: number,
  width: number,
  length: number,
): void {
  const geo = new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2);
  const m = new THREE.Matrix4().makeTranslation(across, LIFT, along).premultiply(g.frame);
  sink.geo(material, geo, m, { cast: false });
}

/** Two barbs and a shaft, laid on the slope and pointing the way you go. */
function arrow(sink: Sink, g: Geometry, along: number, travel: -1 | 1): void {
  const shaft = new THREE.PlaneGeometry(0.16, 1.6).rotateX(-Math.PI / 2);
  const barb = new THREE.PlaneGeometry(0.16, 0.7).rotateX(-Math.PI / 2);
  const base = new THREE.Matrix4()
    .makeRotationY(travel > 0 ? 0 : Math.PI)
    .setPosition(0, LIFT, along)
    .premultiply(g.frame);

  sink.geo(MAT.trafficWhite, shaft, base, { cast: false });
  for (const side of [-1, 1] as const) {
    const m = new THREE.Matrix4()
      .makeRotationY(side * 0.6)
      .setPosition(side * 0.2, 0, -0.6)
      .premultiply(base);
    sink.geo(MAT.trafficWhite, barb, m, { cast: false });
  }
}

/**
 * Anfahrschutz: the red-and-white banded guard bolted to anything a car can hit.
 * On a ramp that means both corners of the mouth, every time.
 */
function bumperGuard(sink: Sink, x: number, y: number, z: number): void {
  const bands = 4;
  const h = DECK.bumperHeight / bands;
  for (let i = 0; i < bands; i++) {
    sink.box(i % 2 === 0 ? MAT.hazardRed : MAT.trafficWhite, [0.14, h, 0.14], [x, y + h / 2 + i * h, z]);
  }
}

/**
 * The mouth: the height gauge, the mirror, and the two guards.
 *
 * The Durchfahrtshöhe sign is not decoration. It is the one object in a car
 * park that states, in figures, that there is a level with a lid on it — and it
 * is hanging over the entry to the only part of this lap that has one.
 */
function mouth(sink: Sink, out: CollisionVolume[], ramp: Ramp, g: Geometry): void {
  const z = ramp.travel > 0 ? ramp.zHigh : ramp.zLow;
  const y = ramp.travel > 0 ? LEVELS.floor : LEVELS.garage;
  const facing = ramp.travel > 0 ? -1 : 1;

  for (const x of [ramp.x0 + 0.35, ramp.x1 - 0.35]) {
    bumperGuard(sink, x, y, z + facing * 0.9);
  }

  // Verkehrsspiegel, on its post outside the mouth, because you cannot see up
  // the ramp until you are already committed to it.
  const post = new THREE.CylinderGeometry(0.032, 0.032, 2.3, 10);
  const mirrorX = ramp.x1 + 0.55;
  sink.geo(MAT.darkMetal, post, new THREE.Matrix4().setPosition(mirrorX, y + 1.15, z + facing * 1.6));
  const dish = new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 3);
  sink.geo(
    MAT.stainless,
    dish,
    new THREE.Matrix4().makeRotationX(Math.PI * 0.62).setPosition(mirrorX, y + 2.15, z + facing * 1.6),
  );
  out.push({ label: `${ramp.id}.mirror`, size: [0.16, 2.3, 0.16], centre: [mirrorX, y + 1.15, z + facing * 1.6] });

  // Height gauge over the opening, and the running-man over the ramp because a
  // ramp is a Rettungsweg in a Parkhaus whether anybody has thought about it.
  sink.box(MAT.trafficYellow, [ramp.x1 - ramp.x0, 0.22, 0.05], [g.cx, y + GARAGE.signedHeadroom, z + facing * 0.15], {
    cast: false,
  });
  sink.box(
    MAT.exitSign,
    [FITTINGS.exitSignWidth, FITTINGS.exitSignHeight, 0.02],
    [g.cx, y + GARAGE.signedHeadroom + 0.4, z + facing * 0.15],
    { cast: false },
  );
}

// ---------------------------------------------------------------------------
// The hole in the deck
// ---------------------------------------------------------------------------

/**
 * Guarding round the slot, at deck level.
 *
 * Absturzsicherung, and the only reason the open slot is a legal thing to have
 * cut in a deck people park on. It is also the thing that makes the drop
 * readable from the aisle: a plain edge at forty metres is a change of tone, and
 * a hundred metres of galvanised handrail is unmistakably a hole.
 */
function guarding(sink: Sink, out: CollisionVolume[], ramp: Ramp, edges: readonly ('west' | 'east' | 'south')[]): void {
  const h = DECK.guardHeight;
  const runs: [string, [number, number, number], [number, number, number]][] = [];
  const length = ramp.landingLow - ramp.zHigh;
  const cz = (ramp.zHigh + ramp.landingLow) / 2;

  if (edges.includes('west')) runs.push([`${ramp.id}.guard.west`, [0.12, h, length], [ramp.x0 + 0.06, h / 2, cz]]);
  if (edges.includes('east')) runs.push([`${ramp.id}.guard.east`, [0.12, h, length], [ramp.x1 - 0.06, h / 2, cz]]);
  if (edges.includes('south')) {
    runs.push([
      `${ramp.id}.guard.south`,
      [ramp.x1 - ramp.x0, h, 0.12],
      [(ramp.x0 + ramp.x1) / 2, h / 2, ramp.landingLow - 0.06],
    ]);
  }

  for (const [label, size, centre] of runs) {
    const alongX = size[0] > size[2];
    // A kerb, two rails and posts — drawn as what it is rather than as a solid
    // panel, because you have to be able to see the level below through it.
    sink.box(MAT.concreteFair, [size[0], 0.12, size[2]], [centre[0], 0.06, centre[2]], { cast: false });
    for (const y of [h, h - 0.42]) {
      sink.box(MAT.darkMetal, [alongX ? size[0] : 0.05, 0.05, alongX ? 0.05 : size[2]], [centre[0], y, centre[2]]);
    }
    const span = alongX ? size[0] : size[2];
    for (let s = -span / 2 + 0.2; s <= span / 2; s += 2.5) {
      sink.box(
        MAT.darkMetal,
        [0.06, h, 0.06],
        [centre[0] + (alongX ? s : 0), h / 2, centre[2] + (alongX ? 0 : s)],
      );
    }
    out.push({ label, size, centre });
  }
}

// ---------------------------------------------------------------------------

export function buildRamps(sink: Sink, group: THREE.Group, ramps: readonly Ramp[]): CollisionVolume[] {
  const collision: CollisionVolume[] = [];

  for (const ramp of ramps) {
    const g = geometryOf(ramp);

    slab(sink, collision, ramp, g);
    soffit(sink, g);
    mouth(sink, collision, ramp, g);

    // The Ausfahrt's west edge is the Parkhaus's own west face, so there is a
    // wall there rather than a handrail; everything else is guarded.
    guarding(sink, collision, ramp, ramp.x0 === 0 ? ['east', 'south'] : ['west', 'east', 'south']);

    // Edge lines the whole length, and an arrow at each end.
    for (const side of [-1, 1] as const) {
      const across = side * (g.width / 2 - KERB.width - DECK.lineWidth);
      paint(sink, MAT.trafficWhite, g, across, 0, DECK.lineWidth, g.run - 1.0);
    }
    // Two and a half metres in from each end — *in*, not along the direction of
    // travel. Scaling the offset by `travel` put the Einfahrt's pair outside its
    // own slab: one 2.4 m past the top, floating over the deck at the north
    // head, and one below the garage floor where nobody would ever have found
    // it. Which end of the ramp a marking sits at has nothing to do with which
    // way you drive up it; only the arrowhead does.
    arrow(sink, g, alongTo(g, ramp.zHigh) + 2.4, ramp.travel);
    arrow(sink, g, alongTo(g, ramp.zLow) - 2.4, ramp.travel);

    // Three lamps down each ramp, and they carry more than the deck's masts do.
    // Up there the sodium is a warming smear on a slab the sun is still
    // painting; in a five-metre slot with a fifteen-degree sun it is the only
    // light that reaches, and a descent that goes to black is one nobody can
    // read the far end of.
    for (const z of [ramp.zHigh + 4, (ramp.zHigh + ramp.zLow) / 2, ramp.zLow - 2]) {
      const [lx, ly, lz] = at(g, g.width / 2 - 0.35, alongTo(g, z), 2.5);
      sink.box(MAT.sodiumLamp, [0.3, 0.05, 0.18], [lx, ly, lz], { cast: false });
      const lamp = new THREE.PointLight(new THREE.Color(SODIUM.color), SODIUM.intensity * 3.2, 14, 2);
      lamp.position.set(lx, ly - 0.1, lz);
      group.add(lamp);
    }
  }

  return collision;
}
