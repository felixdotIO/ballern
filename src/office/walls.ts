/**
 * Walls, openings, doors and the things applied to them.
 *
 * One builder per wall kind, all fed from the plan, and all emitting their
 * collision volumes as they go. That pairing is the point: a wall's collider is
 * produced by the same line of code that produced its geometry, from the same
 * numbers, so the two cannot drift apart. Deriving colliders from the finished
 * mesh — the obvious shortcut — is how you end up driving through a doorway
 * header at speed.
 *
 * Colliders are deliberately thicker than the walls they represent. The extra
 * depth is free insurance against a fast swept capsule clipping a corner, and
 * it is invisible because it sits inside the wall.
 */

import * as THREE from 'three';

import type { CollisionVolume } from './collision';
import { DOOR, FACADE, FITTINGS, HALL, MODULE, SECTION, WALL } from './metrics';
import { MAT } from './materials';
import { openingWidth, type Applied, type Opening, type Wall } from './plan';
import { jitter, type Rng } from './rng';
import type { Sink } from '../render/batch';

/** Colliders are 200 mm regardless of what the wall is actually built from. */
const COLLIDER_THICKNESS = 0.2;

const thicknessOf = (kind: Wall['kind']): number => {
  switch (kind) {
    case 'core':
      return WALL.coreThickness;
    case 'facade':
      return WALL.partitionThickness;
    case 'parapet':
      return 0.24;
    default:
      return WALL.partitionThickness;
  }
};

/**
 * A run of wall expressed in the axis-independent terms the builders work in.
 *
 * `u` is the distance along the wall, `v` is across it, and the two helpers
 * below are the only place either has to be turned back into world XZ. Every
 * builder in this file is written once and works on both axes because of it.
 */
type Frame = {
  axis: 'x' | 'z';
  at: number;
  /** World XZ for a point at distance `u` along the wall, `v` across it. */
  xz(u: number, v: number): [number, number];
  /** The same point as a full world centre, at height `y`. */
  centre(u: number, v: number, y: number): [number, number, number];
  /** A box size, given its length along the wall and its thickness across. */
  size(length: number, height: number, thickness: number): [number, number, number];
};

function frameOf(wall: Wall): Frame {
  if (wall.axis === 'x') {
    return {
      axis: 'x',
      at: wall.at,
      xz: (u, v) => [u, wall.at + v],
      centre: (u, v, y) => [u, y, wall.at + v],
      size: (l, h, t) => [l, h, t],
    };
  }
  return {
    axis: 'z',
    at: wall.at,
    xz: (u, v) => [wall.at + v, u],
    centre: (u, v, y) => [wall.at + v, y, u],
    size: (l, h, t) => [t, h, l],
  };
}

/** The clear structural opening a plan entry cuts, as a span along the wall. */
function span(o: Opening): [number, number] {
  const w = openingWidth(o.kind, o.width);
  return [o.at - w / 2, o.at + w / 2];
}

/** Head height of an opening: a door's leaf plus its frame, or an authored one. */
const openingHeight = (o: Opening): number => o.height ?? DOOR.leafHeight + DOOR.frameReveal;

// ---------------------------------------------------------------------------
// Doors
// ---------------------------------------------------------------------------

/** The Zarge for one opening. There is nothing hanging in it; see below. */
function doorSet(sink: Sink, f: Frame, wall: Wall, o: Opening): void {
  if (o.kind === 'void') return;

  const [o0, o1] = span(o);
  const th = thicknessOf(wall.kind);
  const h = openingHeight(o);
  const r = DOOR.frameReveal;

  // Zarge: jambs and head, standing proud of the wall on both faces.
  for (const u of [o0 + r / 2, o1 - r / 2]) {
    const [x, z] = f.xz(u, 0);
    sink.box(MAT.melamine, f.size(r, h, th + 0.02), [x, h / 2, z]);
  }
  const [hx, hz] = f.xz((o0 + o1) / 2, 0);
  sink.box(MAT.melamine, f.size(o1 - o0, r, th + 0.02), [hx, h - r / 2, hz]);

  /**
   * The leaves themselves are not drawn, and the Zarge above is now the whole
   * door.
   *
   * They were: every door on the floor stood open on its hold-open at eighty
   * degrees or so, which is exactly what a door in a building being used looks
   * like and exactly the wrong thing to put on a race track. A 1.85 m double
   * opening with two leaves standing in it is a 1.2 m opening with two blind
   * corners, and the leaves were what every clearance problem on the lap turned
   * out to be — the measured half-gap through half the doorways on the line was
   * under 450 mm, which is 120 mm either side of a chair base. Reading the room
   * is the point of having built it; being stopped dead by a door you could not
   * see past is not.
   *
   * The frames stay, so a doorway still reads as a doorway rather than as a hole
   * punched in a partition, and every opening is now its full structural width.
   * `swing` and `hinge` survive in the plan as a record of how each door hangs;
   * nothing builds from them any more.
   */
}

// ---------------------------------------------------------------------------
// Applied fittings: things on a wall that are not holes in it
// ---------------------------------------------------------------------------

/**
 * A Türschild — the room plate beside every door in a German building.
 *
 * No text on it yet; the type it wants is the same one the HUD will use, and
 * putting a system font on a wall now would undo more than the sign earns.
 */
function sign(sink: Sink, f: Frame, u: number, v: number): void {
  sink.box(
    MAT.signFace,
    f.size(FITTINGS.signWidth, FITTINGS.signHeight, 0.006),
    f.centre(u, v, FITTINGS.signCentreHeight),
    { cast: false },
  );
}

/**
 * The green running-man sign over an escape route.
 *
 * Only over the openings that are actually on one — a structural opening or a
 * pair of doors — never over the single leaf into a plant room, because that is
 * not a way out of the building. It doubles as the track's directional
 * telegraphing, which is precisely what it does in real life too: it is the one
 * thing in the room whose entire job is to tell you which way to go next.
 */
function exitSign(sink: Sink, f: Frame, o: Opening, openHeight: number, wallHeight: number): void {
  if (o.kind === 'single' || o.kind === 'wide') return;
  const y = Math.min(wallHeight - 0.18, openHeight + 0.16);
  for (const side of [-1, 1] as const) {
    sink.box(
      MAT.exitSign,
      f.size(FITTINGS.exitSignWidth, FITTINGS.exitSignHeight, 0.02),
      f.centre(o.at, side * 0.09, y),
      { cast: false },
    );
  }
}

function applied(sink: Sink, f: Frame, wall: Wall, a: Applied): void {
  const th = thicknessOf(wall.kind);
  const face = (a.side * th) / 2;

  if (a.kind === 'lift') {
    const w = HALL.liftDoorWidth;
    const h = HALL.liftDoorHeight;
    const arch = HALL.liftArchitrave;
    const [x, z] = f.xz(a.at, face + 0.012);

    // Polished stainless architrave, the two leaves, and the joint between them
    // — which is the detail that says lift rather than cupboard.
    sink.box(MAT.stainless, f.size(w + arch * 2, h + arch, 0.024), [x, (h + arch) / 2, z], { cast: false });
    for (const s of [-1, 1] as const) {
      const [lx, lz] = f.xz(a.at + (s * w) / 4, face + 0.026);
      sink.box(MAT.stainless, f.size(w / 2 - 0.006, h - 0.02, 0.012), [lx, (h - 0.02) / 2, lz], { cast: false });
    }
    // Call panel and the floor indicator above the doors.
    const [px, pz] = f.xz(a.at + w / 2 + 0.22, face + 0.02);
    sink.box(MAT.stainless, f.size(0.09, 0.16, 0.01), [px, 1.05, pz], { cast: false });
    const [ix, iz] = f.xz(a.at, face + 0.02);
    sink.box(MAT.crtGlass, f.size(0.24, 0.1, 0.01), [ix, h + arch + 0.16, iz], { cast: false });
    return;
  }

  // A closed door: frame, leaf flush in it, handle, and a plate beside it. It
  // must never become a hole — the WCs behind these walls do not exist.
  const width = DOOR.leafWidth;
  const h = DOOR.leafHeight;
  const r = DOOR.frameReveal;

  for (const s of [-1, 1] as const) {
    const [jx, jz] = f.xz(a.at + (s * (width + r)) / 2, face);
    sink.box(MAT.melamine, f.size(r, h + r, 0.06), [jx, (h + r) / 2, jz], { cast: false });
  }
  const [hx, hz] = f.xz(a.at, face);
  sink.box(MAT.melamine, f.size(width + r * 2, r, 0.06), [hx, h + r / 2, hz], { cast: false });

  const [lx, lz] = f.xz(a.at, face + a.side * 0.02);
  sink.box(a.kind === 'riser' ? MAT.metal : MAT.melamine, f.size(width, h, 0.04), [lx, h / 2, lz], { cast: false });

  const handleGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.12, 8);
  const [gx, gz] = f.xz(a.at - width / 2 + 0.08, face + a.side * 0.08);
  const m = new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(
    new THREE.Matrix4().makeTranslation(gx, DOOR.handleHeight, gz),
  );
  sink.geo(MAT.metal, handleGeo, m, { cast: false });

  sign(sink, f, a.at + width / 2 + 0.16, face + a.side * 0.015);
}

// ---------------------------------------------------------------------------
// Solid partitions and core walls
// ---------------------------------------------------------------------------

function buildPartition(sink: Sink, out: CollisionVolume[], wall: Wall, height: number): void {
  const f = frameOf(wall);
  const th = thicknessOf(wall.kind);
  const glazed = wall.kind === 'glazed';
  const material = wall.kind === 'core' ? MAT.concreteFair : MAT.wall;
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.at - b.at);

  /** One solid stretch of wall, with its skirting and its collider. */
  const solid = (u0: number, u1: number, y0: number, y1: number, index: string) => {
    if (u1 - u0 < 1e-6 || y1 - y0 < 1e-6) return;
    const [x, z] = f.xz((u0 + u1) / 2, 0);
    const y = (y0 + y1) / 2;

    if (glazed && y0 === 0) {
      buildGlazedBay(sink, f, u0, u1, y1);
    } else {
      sink.box(material, f.size(u1 - u0, y1 - y0, th), [x, y, z]);
      if (y0 === 0) {
        for (const s of [-1, 1] as const) {
          const [sx, sz] = f.xz((u0 + u1) / 2, (s * (th + WALL.skirtingDepth)) / 2);
          sink.box(
            MAT.metal,
            f.size(u1 - u0, WALL.skirtingHeight, WALL.skirtingDepth),
            [sx, WALL.skirtingHeight / 2, sz],
          );
        }
      }
    }

    out.push({
      label: `${wall.id}.${index}`,
      size: f.size(u1 - u0, y1 - y0, COLLIDER_THICKNESS),
      centre: [x, y, z],
    });
  };

  let cursor = wall.from;
  openings.forEach((o, i) => {
    const [o0, o1] = span(o);
    solid(cursor, o0, 0, height, `pier.${i}`);
    // The bulkhead over the opening. Voids without an authored height run full
    // height and get none — that is a structural opening, not a doorway.
    const oh = openingHeight(o);
    if (oh < height - 1e-6) solid(o0, o1, oh, height, `header.${i}`);
    doorSet(sink, f, wall, o);
    exitSign(sink, f, o, oh, height);
    cursor = o1;
  });
  solid(cursor, wall.to, 0, height, 'pier.last');

  for (const a of wall.applied ?? []) applied(sink, f, wall, a);
}

/**
 * A bay of Systemtrennwand: glass in a slim frame.
 *
 * It used to carry the pair of sandblasted manifestation bands at 1050 and 1500
 * that a glazed partition is legally required to have, and they are gone. Not
 * because the requirement is wrong — it is the single most recognisable mark a
 * glazed meeting room carries — but because of what they do in this particular
 * frame: two bright horizontal strips at eye height across every internal
 * elevation, seen from a camera that is itself at eye height, so they land
 * dead across the middle of the image everywhere the lap passes a meeting room.
 * They read as a rendering artefact rather than as a detail of the room, which
 * is the one thing a detail is not allowed to do.
 */
function buildGlazedBay(sink: Sink, f: Frame, u0: number, u1: number, height: number): void {
  const width = u1 - u0;
  if (width < 0.02) return;
  const [x, z] = f.xz((u0 + u1) / 2, 0);

  // Head and foot rails, and a mullion on every module line the bay crosses.
  sink.box(MAT.metal, f.size(width, 0.06, 0.07), [x, height - 0.03, z]);
  sink.box(MAT.metal, f.size(width, 0.08, 0.07), [x, 0.04, z]);
  for (let u = Math.ceil(u0 / MODULE) * MODULE; u <= u1 + 1e-6; u += MODULE) {
    const [mx, mz] = f.xz(u, 0);
    sink.box(MAT.metal, f.size(0.05, height - 0.12, 0.07), [mx, height / 2, mz]);
  }

  sink.box(MAT.partitionGlass, f.size(width - 0.02, height - 0.14, 0.01), [x, height / 2, z], { cast: false });
}

// ---------------------------------------------------------------------------
// Curtain wall
// ---------------------------------------------------------------------------

/**
 * The facade.
 *
 * Mullions on the 1.25 m module — the same grid the partitions use, which is
 * exactly why a partition can meet the facade on a mullion instead of landing
 * awkwardly mid-glass. Vertical blinds, never rollers, and left in inconsistent
 * states because nobody in an office has ever agreed about the blinds.
 */
function buildFacade(sink: Sink, out: CollisionVolume[], wall: Wall, height: number, rng: Rng): void {
  const f = frameOf(wall);
  const outward = wall.outward ?? 1;
  const sill = wall.fullHeight ? 0.0 : FACADE.sillHeight;
  const head = wall.head ?? FACADE.headHeight;
  const th = WALL.partitionThickness;
  const openings = [...(wall.openings ?? [])].sort((a, b) => a.at - b.at);

  const gaps: [number, number][] = openings.map(span);
  const clear = (u0: number, u1: number) => !gaps.some(([g0, g1]) => u1 > g0 + 1e-6 && u0 < g1 - 1e-6);

  /** A stretch of elevation, between the door openings. */
  const bandRun = (u0: number, u1: number, index: number) => {
    if (u1 - u0 < 1e-6) return;
    const width = u1 - u0;

    // Spandrel below the sill and the bulkhead above the head, both set slightly
    // outboard of the glass line.
    if (sill > 0) {
      const [sx, sz] = f.xz((u0 + u1) / 2, outward * 0.05);
      sink.box(MAT.wall, f.size(width, sill, th), [sx, sill / 2, sz]);
      // Fensterbank — the pressed metal sill inside.
      const [bx, bz] = f.xz((u0 + u1) / 2, -outward * 0.05);
      sink.box(MAT.metal, f.size(width, 0.04, 0.16), [bx, sill + 0.02, bz]);
    }
    if (head < height - 1e-6) {
      const [ux, uz] = f.xz((u0 + u1) / 2, outward * 0.05);
      sink.box(MAT.wall, f.size(width, height - head, th), [ux, head + (height - head) / 2, uz]);
    }

    // The glass itself. One plane per run, because it is glass — the mullions
    // are what give it its rhythm, not the panes.
    const [gx, gz] = f.xz((u0 + u1) / 2, outward * 0.02);
    sink.box(MAT.glass, f.size(width, head - sill, 0.008), [gx, (sill + head) / 2, gz], { cast: false });

    out.push({
      label: `${wall.id}.${index}`,
      size: f.size(width, height, COLLIDER_THICKNESS * 2),
      centre: f.centre((u0 + u1) / 2, outward * 0.05, height / 2),
    });
  };

  let cursor = wall.from;
  openings.forEach((o, i) => {
    const [o0, o1] = span(o);
    bandRun(cursor, o0, i);
    // Above an entrance the curtain wall carries on: a transom, then glass.
    const oh = openingHeight(o);
    const [tx, tz] = f.xz((o0 + o1) / 2, outward * 0.02);
    sink.box(MAT.metal, f.size(o1 - o0, 0.09, 0.09), [tx, oh + 0.045, tz]);
    sink.box(MAT.glass, f.size(o1 - o0, head - oh - 0.09, 0.008), [tx, (oh + 0.09 + head) / 2, tz], { cast: false });
    out.push({
      label: `${wall.id}.transom.${i}`,
      size: f.size(o1 - o0, height - oh, COLLIDER_THICKNESS),
      centre: f.centre((o0 + o1) / 2, outward * 0.05, oh + (height - oh) / 2),
    });
    doorSet(sink, f, wall, o);
    cursor = o1;
  });
  bandRun(cursor, wall.to, openings.length);

  /**
   * Mullions, on every module line — but not through the doors.
   *
   * They used to run the whole elevation including the openings, on the
   * reasoning that curtain walling does not stop for an entrance, the entrance
   * is set into it. That is true of the grid and false of the mullion: a real
   * entrance bay has its own framing, and the module line that would have
   * crossed the opening is carried by the door frame instead. What the old rule
   * actually produced was a 60 mm steel post standing in the middle of every
   * doorway on the lap — dead centre of the canteen's fire exit at Z 7.5 and of
   * the corridor's at X 30, both of which land exactly on the 1.25 m grid, and
   * two of them across the entrance. No collider, so you drove straight through
   * them, which is worse rather than better: a post you can see and cannot hit
   * is a post that makes you flinch at a doorway you are trying to aim at.
   */
  for (let u = Math.ceil(wall.from / MODULE) * MODULE; u <= wall.to + 1e-6; u += MODULE) {
    if (!clear(u - FACADE.mullionWidth / 2 - 0.03, u + FACADE.mullionWidth / 2 + 0.03)) continue;
    const [mx, mz] = f.xz(u, outward * 0.02);
    sink.box(MAT.metal, f.size(FACADE.mullionWidth, height, 0.09), [mx, height / 2, mz]);
  }

  // Perimeter heating. Behind a 900 sill it is a panel radiator; behind full
  // height glazing it has to go in the floor, so it becomes a linear grille.
  for (let u = wall.from; u < wall.to - 1e-6; u += MODULE) {
    if (!clear(u + 0.06, u + MODULE - 0.06)) continue;
    if (wall.fullHeight) {
      const [rx, rz] = f.xz(u + MODULE / 2, -outward * 0.16);
      sink.box(MAT.metal, f.size(MODULE - 0.06, 0.02, 0.14), [rx, 0.01, rz], { cast: false });
    } else {
      const [rx, rz] = f.xz(u + MODULE / 2, -outward * 0.1);
      sink.box(
        MAT.metal,
        f.size(MODULE - 0.12, FACADE.radiatorHeight, FACADE.radiatorDepth),
        [rx, FACADE.radiatorFloorGap + FACADE.radiatorHeight / 2, rz],
      );
    }
  }

  if (!wall.blinds) return;

  // Blinds down over some bays, open over others, with one bent slat. The
  // pattern is deliberately irregular: a facade where every fourth bay is
  // identical reads as wallpaper.
  const slatW = 0.089;
  let bay = 0;
  for (let u = wall.from; u < wall.to - 1e-6; u += MODULE, bay++) {
    if (bay % 4 !== 1 && bay % 7 !== 5) continue;
    if (!clear(u, u + MODULE)) continue;
    const slats = Math.floor(MODULE / (slatW * 0.85));
    for (let s = 0; s < slats; s++) {
      const [bx, bz] = f.xz(u + 0.06 + s * slatW * 0.85, -outward * 0.08);
      const yaw = (bay % 7 === 5 && s === 3 ? 1.15 : 0.55) + jitter(rng, 0.06);
      sink.box(MAT.blind, f.size(slatW, head - sill - 0.04, 0.004), [bx, (sill + head) / 2, bz], {
        yaw: f.axis === 'x' ? yaw : yaw + Math.PI / 2,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Parapet
// ---------------------------------------------------------------------------

/**
 * The deck edge: a concrete upstand with a steel rail over it, bringing the
 * whole thing to the 1.10 m the building regs want.
 *
 * Low enough to see the city over from a seated eye height, high enough that
 * the deck still feels enclosed — which is the only reason it is worth having
 * an open-air section at all.
 */
function buildParapet(sink: Sink, out: CollisionVolume[], wall: Wall): void {
  const f = frameOf(wall);
  const outward = wall.outward ?? 1;
  const th = 0.24;
  const length = wall.to - wall.from;
  const mid = (wall.from + wall.to) / 2;
  const [cx, cz] = f.xz(mid, (outward * th) / 2);

  sink.box(MAT.concreteFair, f.size(length, 0.5, th), [cx, 0.25, cz]);
  // Abdeckblech: the pressed metal capping every parapet in the country has.
  sink.box(MAT.metal, f.size(length, 0.03, th + 0.06), [cx, 0.515, cz], { cast: false });

  // Rail: two horizontals on posts at 2.5 m, the Parkhaus standard.
  for (const y of [0.78, 1.08]) {
    sink.box(MAT.darkMetal, f.size(length, 0.04, 0.04), [cx, y, cz]);
  }
  for (let u = wall.from + 1.25; u < wall.to; u += 2.5) {
    const [px, pz] = f.xz(u, (outward * th) / 2);
    sink.box(MAT.darkMetal, f.size(0.05, 0.62, 0.05), [px, 0.79, pz]);
  }

  out.push({
    label: wall.id,
    size: f.size(length, 1.1, COLLIDER_THICKNESS + th),
    centre: [cx, 0.55, cz],
  });
}

// ---------------------------------------------------------------------------

export function buildWall(sink: Sink, out: CollisionVolume[], wall: Wall, rng: Rng): void {
  const height = wall.height ?? SECTION.ceilingHeight;
  switch (wall.kind) {
    case 'facade':
      return buildFacade(sink, out, wall, height, rng);
    case 'parapet':
      return buildParapet(sink, out, wall);
    default:
      return buildPartition(sink, out, wall, height);
  }
}
