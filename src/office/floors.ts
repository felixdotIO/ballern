/**
 * Floor finishes.
 *
 * One recipe per finish, and each is laid the way its trade lays it: carpet
 * tile quarter-turned from a room corner, the good carpet in a broken bond,
 * linoleum in welded sheets, granite on a 600 grid with a honed border, vinyl
 * on the 600 module the raised floor below it is set out on.
 *
 * The laying pattern is doing more work here than the colour. Six rooms in six
 * flat colours still read as one room repainted; six rooms whose floors run in
 * different directions, at different scales, with different seam logic, read as
 * six rooms — and the player is looking at the floor more than at anything else,
 * because the thing they are driving is 400 mm off it.
 */

import * as THREE from 'three';

import { HALL, SERVER } from './metrics';
import { MAT } from './materials';
import type { Room } from './plan';
import type { Rng } from './rng';
import type { Sink } from '../render/batch';

/** Which material a given tile is, or null to leave the slab bare there. */
type TilePlan = (x: number, z: number, ix: number, iz: number) => THREE.Material | null;

type LayOptions = {
  /** Alternate tiles rotate 90°. Invisible on flat colour, correct the moment
   *  a pile-direction texture lands — and it is how carpet tile is fitted. */
  quarterTurn?: boolean;
  /** Rows step by half a tile, as the better carpets are laid. */
  ashlar?: boolean;
  /** Per-tile tonal spread. Dye-lot banding is the single most recognisable
   *  thing about a large field of contract carpet. */
  tonal?: number;
  /** Shrink each tile by this much, so the seam reads as a seam. */
  gap?: number;
  y?: number;
};

/**
 * Lay a tiled field across a room, one instanced mesh per material used.
 *
 * Tiles are laid from the room's own corner rather than from a building datum,
 * because that is how a floor layer works: the grid restarts at every threshold,
 * and the small disagreement between the floor's rhythm and the ceiling's is
 * what real interiors look like.
 */
function layTiles(sink: Sink, room: Room, tile: number, plan: TilePlan, rng: Rng, opts: LayOptions = {}): void {
  const nx = Math.ceil((room.x1 - room.x0) / tile);
  const nz = Math.ceil((room.z1 - room.z0) / tile);
  const gap = opts.gap ?? 0;

  const geo = new THREE.PlaneGeometry(tile - gap, tile - gap).rotateX(-Math.PI / 2);
  const buckets = new Map<THREE.Material, THREE.Matrix4[]>();

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);

  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      const shift = opts.ashlar && iz % 2 === 1 ? tile / 2 : 0;
      const x = room.x0 + (ix + 0.5) * tile + shift;
      const z = room.z0 + (iz + 0.5) * tile;
      // The ashlar offset walks the last column past the wall; drop it rather
      // than letting a half tile hang in the partition.
      if (x + tile / 2 > room.x1 + 1e-6) continue;

      const material = plan(x, z, ix, iz);
      if (!material) continue;

      q.setFromAxisAngle(up, opts.quarterTurn && (ix + iz) % 2 === 1 ? Math.PI / 2 : 0);
      m.compose(new THREE.Vector3(x, opts.y ?? 0, z), q, scale);

      let list = buckets.get(material);
      if (!list) buckets.set(material, (list = []));
      list.push(m.clone());
    }
  }

  const tone = new THREE.Color();
  for (const [material, list] of buckets) {
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    mesh.receiveShadow = true;
    for (let i = 0; i < list.length; i++) {
      mesh.setMatrixAt(i, list[i]!);
      if (opts.tonal) {
        const base = (material as THREE.MeshStandardMaterial).color;
        tone.copy(base).multiplyScalar(1 - opts.tonal / 2 + rng() * opts.tonal);
        mesh.setColorAt(i, tone);
      }
    }
    sink.add(mesh);
  }
}

/** A plain slab of one material, for finishes that arrive in sheets. */
function sheet(sink: Sink, material: THREE.Material, x0: number, z0: number, x1: number, z1: number, y = 0): void {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2);
  const m = new THREE.Matrix4().setPosition((x0 + x1) / 2, y, (z0 + z1) / 2);
  sink.geo(material, geo, m, { cast: false });
}

// ---------------------------------------------------------------------------
// Recipes
// ---------------------------------------------------------------------------

/**
 * Open-plan carpet with a slate-blue circulation run.
 *
 * The run is a real convention — 2000s fit-outs marked primary routes with a
 * contrasting tile — which is why it can carry the racing line honestly rather
 * than as a gameplay decal painted on top of the fiction. It turns the corner
 * toward the east corridor, because that is where the route it marks goes.
 */
function officeCarpet(sink: Sink, room: Room, rng: Rng): void {
  const t = 0.5;
  // Three tiles wide, 1.5 m, clearing the 1.2 m egress minimum with the margin
  // a fit-out actually leaves.
  const runZ: [number, number] = [8.5, 10.0];
  const runX: [number, number] = [62.5, 64.0];
  const inside = (v: number, band: [number, number]) => v > band[0] && v < band[1];

  layTiles(
    sink,
    room,
    t,
    (x, z) => (inside(z, runZ) || inside(x, runX) ? MAT.carpetRun : MAT.carpet),
    rng,
    { quarterTurn: true, tonal: 0.12 },
  );
}

/** Corridor: the circulation tile wall to wall, with a charcoal border band. */
function corridorCarpet(sink: Sink, room: Room, rng: Rng): void {
  const t = 0.5;
  layTiles(
    sink,
    room,
    t,
    (x, z) => {
      const edge =
        x - room.x0 < t * 1.5 || room.x1 - x < t * 1.5 || z - room.z0 < t * 1.5 || room.z1 - z < t * 1.5;
      return edge ? MAT.carpetTrim : MAT.carpetRun;
    },
    rng,
    { quarterTurn: true, tonal: 0.1 },
  );
}

/** The board room's carpet: heavier, darker, and laid in a broken bond. */
function boardCarpet(sink: Sink, room: Room, rng: Rng): void {
  layTiles(sink, room, 0.5, () => MAT.carpetBoard, rng, { ashlar: true, tonal: 0.08 });
}

/**
 * Canteen linoleum, in 2 m sheets with welded seams, and quarry tile under the
 * servery where the floor has to survive being wet twice a day.
 *
 * The change of material stops at a threshold strip rather than fading, because
 * that is how two floor finishes meet in a building.
 */
function canteenFloor(sink: Sink, room: Room): void {
  // The wet zone follows the units, which are on the internal wall because that
  // is where the drainage and the extract are. Putting the tiled strip under
  // the window instead — where there is nothing but tables — is the giveaway
  // that a plan was drawn from the outside in.
  const wet = room.z1 - 3.0;

  sheet(sink, MAT.linoleum, room.x0, room.z0, room.x1, wet);
  sheet(sink, MAT.quarryTile, room.x0, wet, room.x1, room.z1);

  // Threshold strip: a brass-look flat bar over the joint.
  sink.box(MAT.stainless, [room.x1 - room.x0, 0.006, 0.04], [(room.x0 + room.x1) / 2, 0.003, wet], { cast: false });

  // Welded seams in the sheet, every 2 m across the roll direction.
  for (let z = room.z0 + 2; z < wet - 0.2; z += 2) {
    sink.box(MAT.linoleum, [room.x1 - room.x0, 0.002, 0.012], [(room.x0 + room.x1) / 2, 0.002, z], { cast: false });
  }
}

/**
 * EDV room: conductive vinyl on the 600 grid the raised floor below is set out
 * on, with the seams left proud enough to catch the light.
 *
 * Every seam in a conductive floor has a copper tape under it earthing back to
 * the room's equipotential bar, which is why the grid is visible at all — an
 * anti-static floor is the one floor in a building that is allowed to show its
 * joints.
 */
function serverFloor(sink: Sink, room: Room, rng: Rng): void {
  sheet(sink, MAT.darkMetal, room.x0, room.z0, room.x1, room.z1, -0.004);
  layTiles(sink, room, SERVER.floorTile, () => MAT.antistatic, rng, { gap: 0.008, tonal: 0.05 });
}

/**
 * The hall: polished granite on a 600 grid, a honed border band around the
 * perimeter, and a recessed matting well inside the entrance.
 *
 * This is the only reflective floor in the building, and it is why the
 * reception is the room that impresses. At this hour it takes the whole west
 * glazing and lays it back across itself.
 */
function hallFloor(sink: Sink, room: Room, rng: Rng): void {
  const t = HALL.stoneTile;
  const band = t * 1.5;
  // The well sits inside the entrance doors, in the west wall.
  const well = { x0: room.x0 + 0.05, x1: room.x0 + HALL.mattingDepth, z0: 34.5, z1: 39.5 };
  const inWell = (x: number, z: number) => x > well.x0 && x < well.x1 && z > well.z0 && z < well.z1;

  /**
   * The inlay: a band of the dark stone that comes in through the doors, runs
   * east, and turns north to the lifts.
   *
   * This is what a stone floor in a reception is actually for. Nobody lays
   * granite in two colours to be pretty — they lay it to tell you where to walk,
   * and the band goes from the thing you came in through to the thing you are
   * looking for. Without it a 26 m hall is a car park with a nicer surface, and
   * the eye has nothing to follow across it.
   *
   * It also happens to draw the racing line, for exactly the same reason the
   * circulation run does upstairs: the fastest way through a building is the
   * way the building was designed to be walked.
   */
  const lead = { z0: 36.25, z1: 37.5, x0: room.x0, x1: 55.625 };
  const riser = { x0: 54.375, x1: 55.625, z0: room.z0 + 1.25, z1: 37.5 };
  const inLead = (x: number, z: number) =>
    (z > lead.z0 && z < lead.z1 && x > lead.x0 && x < lead.x1) ||
    (x > riser.x0 && x < riser.x1 && z > riser.z0 && z < riser.z1);

  layTiles(
    sink,
    room,
    t,
    (x, z) => {
      if (inWell(x, z)) return null;
      const edge =
        x - room.x0 < band || room.x1 - x < band || z - room.z0 < band || room.z1 - z < band;
      if (edge) return MAT.graniteDark;
      return inLead(x, z) ? MAT.graniteBand : MAT.graniteLight;
    },
    rng,
    // More figure than the office carpet gets. Polished granite is a rock: two
    // adjacent slabs off the same block are visibly different, and a stone floor
    // laid without that variation is a floor made of paint.
    { tonal: 0.16 },
  );

  // Sauberlaufzone: aluminium rails with bristle inserts, recessed so its face
  // finishes flush with the stone. Ribs run across the direction of travel,
  // which is the only orientation that does anything.
  sheet(sink, MAT.entranceMatting, well.x0, well.z0, well.x1, well.z1, -0.012);
  for (let z = well.z0 + 0.05; z < well.z1; z += 0.1) {
    sink.box(MAT.stainless, [well.x1 - well.x0 - 0.02, 0.012, 0.022], [(well.x0 + well.x1) / 2, -0.006, z], {
      cast: false,
    });
  }
  // The frame the well is set into.
  for (const [size, centre] of [
    [[well.x1 - well.x0 + 0.04, 0.014, 0.02], [(well.x0 + well.x1) / 2, 0.001, well.z0 - 0.01]],
    [[well.x1 - well.x0 + 0.04, 0.014, 0.02], [(well.x0 + well.x1) / 2, 0.001, well.z1 + 0.01]],
    [[0.02, 0.014, well.z1 - well.z0 + 0.04], [well.x1 + 0.01, 0.001, (well.z0 + well.z1) / 2]],
  ] as const) {
    sink.box(MAT.stainless, size as [number, number, number], centre as [number, number, number], { cast: false });
  }
}

// ---------------------------------------------------------------------------

export function buildFloor(sink: Sink, room: Room, rng: Rng): void {
  switch (room.floor) {
    case 'carpet':
      return officeCarpet(sink, room, rng);
    case 'carpetRun':
      return corridorCarpet(sink, room, rng);
    case 'carpetBoard':
      return boardCarpet(sink, room, rng);
    case 'linoleum':
      return canteenFloor(sink, room);
    case 'antistatic':
      return serverFloor(sink, room, rng);
    case 'stone':
      return hallFloor(sink, room, rng);
    case 'concrete':
      // The deck lays its own slab: it is poured, not fitted, and it carries
      // falls, joints and paint that no interior finish has.
      return;
  }
}
