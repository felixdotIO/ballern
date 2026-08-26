/**
 * Ceilings.
 *
 * A blank ceiling is the biggest single tell of a fake interior — most of them
 * have literally nothing up there. Players look up constantly in a chair racer,
 * so this surface does more work here than in almost any other game, and it is
 * also the cheapest place to make two rooms feel like different rooms: an
 * exposed T-bar grid, a painted soffit hung with cable ladder, and a plastered
 * lid with a light cove are three completely different rooms before a single
 * piece of furniture is in any of them.
 *
 * Fittings are set out from a building datum and the tiles follow the fittings,
 * not the room. The edge margins therefore come out uneven, and forcing them
 * symmetric is what makes a ceiling look drawn rather than built.
 */

import * as THREE from 'three';

import { GRID, SECTION } from './metrics';
import { MAT } from './materials';
import type { Room } from './plan';
import { TINTS } from './palette';
import type { Rng } from './rng';
import type { Sink } from '../render/batch';

export type CeilingResult = {
  /** Luminaire centres in world space, so the lighting pass can put real light
   *  sources in a sample of them rather than guessing where the fittings are. */
  luminaires: THREE.Vector3[];
};

/** Cable ladder height, shared with the server dressing so the racks' cables
 *  actually reach it rather than stopping in mid air. */
export const SERVER_LADDER_Y = 2.5;

/** How far the hall's outer rim hangs below its raised coffer. */
const RIM_DROP = 0.45;

/**
 * The structural slab.
 *
 * Fair-faced concrete rather than the near-black it used to be. When there was
 * one bay this was never seen from anywhere — now the deck looks straight at
 * the building's flank, and the exposed edge of every floor slab is part of
 * what you see. A black plate hanging over a sunlit facade reads as a hole.
 */
const SLAB_MAT = MAT.concreteFair;

/** Tile indices carrying a fitting: every `step`th tile from `start`. */
function fittingIndices(tileCount: number, start: number, step: number): number[] {
  const out: number[] = [];
  for (let i = start; i < tileCount; i += step) out.push(i);
  return out;
}

// ---------------------------------------------------------------------------
// Exposed T-bar with 625 mineral tile
// ---------------------------------------------------------------------------

function tbar(sink: Sink, room: Room, rng: Rng, askew: ReadonlySet<string>): CeilingResult {
  const h = room.ceiling;
  const t = GRID.ceilingTile;
  const nx = Math.round((room.x1 - room.x0) / t);
  const nz = Math.round((room.z1 - room.z0) / t);
  const luminaires: THREE.Vector3[] = [];

  // Luminaires on a 2.5 m grid — every fourth tile. Narrow rooms get a single
  // run down the middle instead, because that is what they get in life.
  const lampX = new Set(nx <= 6 ? [Math.floor(nx / 2)] : fittingIndices(nx, 1, 4));
  const lampZ = new Set(nz <= 6 ? [Math.floor(nz / 2)] : fittingIndices(nz, 1, 4));
  // Services never share the lighting layout in a real building.
  const ductX = new Set(fittingIndices(nx, 3, 8));
  const ductZ = new Set(fittingIndices(nz, 3, 8));

  const isLamp = (ix: number, iz: number) => lampX.has(ix) && lampZ.has(iz);
  const isDuct = (ix: number, iz: number) => ductX.has(ix) && ductZ.has(iz);

  const tileGeo = new THREE.PlaneGeometry(t - 0.006, t - 0.006).rotateX(Math.PI / 2);
  const plain: THREE.Matrix4[] = [];

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      if (isLamp(ix, iz) || isDuct(ix, iz)) continue;
      // A few tiles sit pushed up and skewed, the way they do after someone has
      // been into the plenum for a network cable and not seated them properly
      // again. Named rather than random — they should read as a repair.
      const lifted = askew.has(`${ix}:${iz}`);
      q.setFromAxisAngle(up, lifted ? 0.06 : 0);
      m.compose(
        new THREE.Vector3(room.x0 + (ix + 0.5) * t, lifted ? h + 0.035 : h, room.z0 + (iz + 0.5) * t),
        q,
        scale,
      );
      plain.push(m.clone());
    }
  }

  const tiles = new THREE.InstancedMesh(tileGeo, MAT.ceilingTile, plain.length);
  const tone = new THREE.Color();
  for (let i = 0; i < plain.length; i++) {
    tiles.setMatrixAt(i, plain[i]!);
    tone.setHex(TINTS.ceilingTile.color).multiplyScalar(0.96 + rng() * 0.08);
    tiles.setColorAt(i, tone);
  }
  sink.add(tiles);

  // T-bar: main runners and cross tees, on the same grid the tiles sit in.
  const teeY = h - 0.008;
  const W = room.x1 - room.x0;
  const D = room.z1 - room.z0;
  for (let ix = 0; ix <= nx; ix++) {
    sink.box(MAT.metal, [GRID.ceilingTeeWidth, 0.016, D], [room.x0 + ix * t, teeY, room.z0 + D / 2], { cast: false });
  }
  for (let iz = 0; iz <= nz; iz++) {
    sink.box(MAT.metal, [W, 0.016, GRID.ceilingTeeWidth], [room.x0 + W / 2, teeY, room.z0 + iz * t], { cast: false });
  }

  // Luminaires: 625 louvre fittings, recessed into the grid.
  for (const ix of lampX) {
    for (const iz of lampZ) {
      const cx = room.x0 + (ix + 0.5) * t;
      const cz = room.z0 + (iz + 0.5) * t;
      sink.box(MAT.metal, [t - 0.01, 0.09, t - 0.01], [cx, h + 0.045, cz], { cast: false });
      sink.box(MAT.lamp, [t - 0.07, 0.012, t - 0.07], [cx, h - 0.012, cz], { cast: false });
      luminaires.push(new THREE.Vector3(cx, h - 0.03, cz));
    }
  }

  // Swirl diffusers.
  for (const ix of ductX) {
    for (const iz of ductZ) {
      sink.box(MAT.metal, [t - 0.02, 0.02, t - 0.02], [room.x0 + (ix + 0.5) * t, h - 0.008, room.z0 + (iz + 0.5) * t], {
        cast: false,
      });
    }
  }

  // Pendent sprinklers on 2.5 m centres, and a smoke detector or two.
  const dropGeo = new THREE.CylinderGeometry(0.018, 0.024, 0.05, 8);
  const dropAt = new THREE.Matrix4();
  for (let x = room.x0 + GRID.sprinklerSpacing; x < room.x1; x += GRID.sprinklerSpacing) {
    for (let z = room.z0 + GRID.sprinklerSpacing; z < room.z1; z += GRID.sprinklerSpacing) {
      dropAt.setPosition(x, h - 0.025, z);
      sink.geo(MAT.metal, dropGeo, dropAt, { cast: false });
    }
  }
  const detectorGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.025, 16);
  for (const [dx, dz] of [[0.36, 0.62], [0.74, 0.28]] as const) {
    dropAt.setPosition(room.x0 + W * dx, h - 0.012, room.z0 + D * dz);
    sink.geo(MAT.ceilingTile, detectorGeo, dropAt, { cast: false });
  }

  return { luminaires };
}

// ---------------------------------------------------------------------------
// No ceiling at all: the EDV room
// ---------------------------------------------------------------------------

/**
 * Painted soffit with everything hung off it in plain sight.
 *
 * A comms room does not get a suspended ceiling because a suspended ceiling is
 * somewhere for a fire to travel and somewhere for a leak to hide. What it gets
 * instead is a cable ladder, a pair of cooling ducts and open batten lighting,
 * all of it visible — which happens to make it the most graphically interesting
 * ceiling on the floor.
 */
function openSoffit(sink: Sink, room: Room): CeilingResult {
  const h = room.ceiling;
  const W = room.x1 - room.x0;
  const D = room.z1 - room.z0;
  const cx = (room.x0 + room.x1) / 2;
  const luminaires: THREE.Vector3[] = [];

  sink.box(MAT.paintedSoffit, [W, 0.06, D], [cx, h + 0.03, (room.z0 + room.z1) / 2], { cast: false });

  // Downstand beams, running across the short span as they do structurally.
  for (let x = room.x0 + 2.5; x < room.x1 - 0.5; x += 2.5) {
    sink.box(MAT.paintedSoffit, [0.3, 0.35, D], [x, h - 0.175, (room.z0 + room.z1) / 2], { cast: false });
  }

  // Kabeltrasse: perforated ladder over each rack row, on drop rods, with the
  // bundles it carries lying in it.
  for (const z of [room.z0 + 3.0, room.z0 + 6.5]) {
    const y = SERVER_LADDER_Y;
    sink.box(MAT.darkMetal, [W - 0.6, 0.05, 0.3], [cx, y, z], { cast: false });
    for (let x = room.x0 + 0.8; x < room.x1 - 0.5; x += 1.5) {
      sink.box(MAT.darkMetal, [0.012, h - y - 0.05, 0.012], [x, (y + h) / 2, z - 0.13], { cast: false });
      sink.box(MAT.darkMetal, [0.012, h - y - 0.05, 0.012], [x, (y + h) / 2, z + 0.13], { cast: false });
    }
    // The bundle. Grey, fat, and gaffer-taped every metre.
    sink.box(MAT.patchCable, [W - 0.8, 0.07, 0.16], [cx, y + 0.06, z - 0.05], { cast: false });
    sink.box(MAT.patchCable, [W - 0.8, 0.05, 0.1], [cx, y + 0.055, z + 0.08], { cast: false });
  }

  // Open batten fittings: bare 6500 K tubes, hung between the beams.
  for (const z of [room.z0 + 2.2, room.z0 + 5.6, room.z0 + 9.0]) {
    for (let x = room.x0 + 1.5; x < room.x1 - 1.0; x += 3.2) {
      sink.box(MAT.metal, [1.5, 0.05, 0.09], [x + 0.75, h - 0.12, z], { cast: false });
      sink.box(MAT.coldLamp, [1.44, 0.035, 0.035], [x + 0.75, h - 0.16, z], { cast: false });
      luminaires.push(new THREE.Vector3(x + 0.75, h - 0.18, z));
    }
  }

  // Cooling: a supply duct along the back wall with two spigots dropping into
  // the room. Rectangular, insulated, and never straight.
  sink.box(MAT.metal, [W - 1.0, 0.4, 0.3], [cx, h - 0.28, room.z1 - 0.55], { cast: false });
  for (const x of [room.x0 + 2.8, room.x0 + 7.2]) {
    sink.box(MAT.metal, [0.32, 0.32, 0.28], [x, h - 0.62, room.z1 - 0.55], { cast: false });
  }

  return { luminaires };
}

// ---------------------------------------------------------------------------
// Plasterboard: the hall
// ---------------------------------------------------------------------------

/**
 * MF-suspended plasterboard with a raised coffer and a light cove.
 *
 * The one ceiling in the building that somebody designed. It is what tells you
 * the room you have walked into is the front of house: the grid stops at the
 * threshold, the lid lifts half a metre, and the light stops coming out of
 * louvres and starts coming out of a slot you cannot see into.
 */
function plaster(sink: Sink, room: Room): CeilingResult {
  const h = room.ceiling;
  const W = room.x1 - room.x0;
  const D = room.z1 - room.z0;
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;
  const luminaires: THREE.Vector3[] = [];

  // The flat field, at the lower level, carrying the cove's spill. See
  // `coveWashLow` in materials.ts for why this is a material and not a light.
  const rim = 3.0;
  sink.box(MAT.coveWashLow, [W, 0.05, D], [cx, h - RIM_DROP + 0.025, cz], { cast: false });

  // The coffer: a rectangle lifted out of the middle of it, on the module, and
  // the one lid in the building that carries its own faint emission so the cove
  // below it has something to have washed. See `coveWash` in materials.ts.
  const coffer = { x0: room.x0 + rim, x1: room.x1 - rim, z0: room.z0 + rim, z1: room.z1 - rim };
  sink.box(
    MAT.coveWash,
    [coffer.x1 - coffer.x0, 0.05, coffer.z1 - coffer.z0],
    [(coffer.x0 + coffer.x1) / 2, h + 0.025, (coffer.z0 + coffer.z1) / 2],
    { cast: false },
  );

  // The upstand between the two levels, with the cove behind its lower edge.
  const drop = RIM_DROP;
  for (const [size, centre] of [
    [[coffer.x1 - coffer.x0, drop, 0.04], [(coffer.x0 + coffer.x1) / 2, h - drop / 2, coffer.z0]],
    [[coffer.x1 - coffer.x0, drop, 0.04], [(coffer.x0 + coffer.x1) / 2, h - drop / 2, coffer.z1]],
    [[0.04, drop, coffer.z1 - coffer.z0], [coffer.x0, h - drop / 2, (coffer.z0 + coffer.z1) / 2]],
    [[0.04, drop, coffer.z1 - coffer.z0], [coffer.x1, h - drop / 2, (coffer.z0 + coffer.z1) / 2]],
  ] as const) {
    sink.box(MAT.wall, size as [number, number, number], centre as [number, number, number], { cast: false });
  }

  // Lichtvoute: a warm slot washing the upper lid. Hidden source, visible glow,
  // and the reason the hall's ceiling is the brightest surface in the room.
  for (const [size, centre] of [
    [[coffer.x1 - coffer.x0 - 0.2, 0.03, 0.1], [(coffer.x0 + coffer.x1) / 2, h - drop + 0.06, coffer.z0 + 0.1]],
    [[coffer.x1 - coffer.x0 - 0.2, 0.03, 0.1], [(coffer.x0 + coffer.x1) / 2, h - drop + 0.06, coffer.z1 - 0.1]],
    [[0.1, 0.03, coffer.z1 - coffer.z0 - 0.2], [coffer.x0 + 0.1, h - drop + 0.06, (coffer.z0 + coffer.z1) / 2]],
    [[0.1, 0.03, coffer.z1 - coffer.z0 - 0.2], [coffer.x1 - 0.1, h - drop + 0.06, (coffer.z0 + coffer.z1) / 2]],
  ] as const) {
    sink.box(MAT.receptionLamp, size as [number, number, number], centre as [number, number, number], { cast: false });
  }

  // Downlights in the flat rim, on a 1.25 m rhythm because the ceiling is set
  // out on the module like everything else.
  const canGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.02, 16);
  const at = new THREE.Matrix4();
  const y = h - drop;
  const ring: [number, number][] = [];
  for (let x = room.x0 + 1.25; x < room.x1; x += 1.25) {
    ring.push([x, room.z0 + 1.5], [x, room.z1 - 1.5]);
  }
  for (let z = room.z0 + 2.75; z < room.z1 - 2.5; z += 1.25) {
    ring.push([room.x0 + 1.5, z], [room.x1 - 1.5, z]);
  }
  for (const [x, z] of ring) {
    at.setPosition(x, y - 0.01, z);
    sink.geo(MAT.receptionLamp, canGeo, at, { cast: false });
    luminaires.push(new THREE.Vector3(x, y - 0.05, z));
  }

  // Sprinklers here are recessed and flush, with only the rosette showing.
  const rosette = new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12);
  for (let x = room.x0 + 2.5; x < room.x1; x += 3.0) {
    for (let z = room.z0 + 2.5; z < room.z1; z += 3.0) {
      const inCoffer = x > coffer.x0 && x < coffer.x1 && z > coffer.z0 && z < coffer.z1;
      at.setPosition(x, (inCoffer ? h : y) - 0.005, z);
      sink.geo(MAT.metal, rosette, at, { cast: false });
    }
  }

  /**
   * Linear slot diffusers in the coffer, and the smoke detectors.
   *
   * The coffer was six by twenty metres of blank plaster. A feature ceiling
   * still has to be a ceiling: the air comes out of it, and in a plastered lid
   * it comes out of slots rather than the swirl diffusers the grid uses,
   * because a round diffuser in a coffer looks like a mistake and everybody
   * knows it. Two continuous runs is what this room would have, and they give
   * the biggest flat surface in the building a direction.
   */
  for (const z of [coffer.z0 + 2.4, coffer.z1 - 2.4]) {
    const length = coffer.x1 - coffer.x0 - 4.0;
    sink.box(MAT.metal, [length, 0.02, 0.16], [cx, h - 0.01, z], { cast: false });
    // Two slots with a blade between them, which is what a slot diffuser is.
    for (const off of [-0.04, 0.04]) {
      sink.box(MAT.darkMetal, [length - 0.06, 0.03, 0.035], [cx, h - 0.022, z + off], { cast: false });
    }
  }

  const detector = new THREE.CylinderGeometry(0.06, 0.06, 0.022, 14);
  for (const [dx, dz] of [[0.3, 0.4], [0.72, 0.66]] as const) {
    at.setPosition(room.x0 + W * dx, h - 0.011, room.z0 + D * dz);
    sink.geo(MAT.wall, detector, at, { cast: false });
  }

  return { luminaires };
}

// ---------------------------------------------------------------------------

export function buildCeiling(sink: Sink, room: Room, rng: Rng, askew: ReadonlySet<string>): CeilingResult {
  switch (room.ceilingKind) {
    case 'tbar':
      return tbar(sink, room, rng, askew);
    case 'open':
      return openSoffit(sink, room);
    case 'plaster':
      return plaster(sink, room);
    case 'sky':
      return { luminaires: [] };
  }
}

/**
 * The shadow-casting lid above the suspended ceiling, standing in for the slab.
 *
 * Without it the low sun pours in over the top of the facade and lights every
 * room from above, which destroys the whole effect — the light has to arrive
 * only through the glazing. It sits above the visible ceiling, so it is never
 * seen from inside, and the overhang closes the sliver of sky a 10° sun could
 * otherwise sneak through at the perimeter.
 */
export function buildSlab(sink: Sink, x0: number, z0: number, x1: number, z1: number): void {
  // Half a metre of overhang, which is what it takes to close the sliver of sky
  // a fifteen-degree sun could otherwise find between the lid and the head of
  // the glazing. It used to be a metre, and a metre reads from the deck as a
  // canopy nobody designed.
  const over = 0.5;
  sink.box(
    SLAB_MAT,
    [x1 - x0 + over * 2, 0.2, z1 - z0 + over * 2],
    [(x0 + x1) / 2, SECTION.slabToSlab - SECTION.raisedFloorDepth - 0.1, (z0 + z1) / 2],
  );
}
