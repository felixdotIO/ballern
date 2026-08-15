/**
 * Ebene 5: the enclosed parking level under the top deck.
 *
 * It exists to be the opposite of the deck above it, and every decision here is
 * that one decision again. Up there the sun arrives with nothing in front of it,
 * the shadows are forty metres long and the nearest object is eight metres away.
 * Down here there is 2.62 m to the soffit, a column every seven and a half
 * metres, sodium that is actually winning because there is nothing to beat, and
 * a horizontal slot of sunset along every open edge. Same speed, walls close —
 * which is the whole trick, because speed is read off whatever is near enough to
 * measure it against, and the deck's long aisle never had anything.
 *
 * The shape is not a choice either. Both ramps run north–south down the flanks,
 * because that is the only axis long enough to hold 21.25 m of run, so what is
 * left is two full-width halls at the ends joined by an 11.25 m waist. Out up
 * one side of the waist and back down the other with the column line between
 * them; the north hall is the sweep that turns you round.
 *
 * German building law is why it is open-sided at all: an *offene Mittelgarage*
 * is naturally ventilated and needs no mechanical extract, which is why every
 * Parkhaus in the country is a stack of horizontal slots rather than a box. It
 * is also the only reason there is daylight on this level.
 */

import * as THREE from 'three';

import type { CollisionVolume } from './collision';
import { DECK, GARAGE } from './metrics';
import { MAT } from './materials';
import { DECK_STAIR, GARAGE_COLUMNS, GARAGE_OPENINGS, LEVELS, PARKHAUS } from './plan';
import { SODIUM } from './palette';
import { range, type Rng } from './rng';
import type { Sink } from '../render/batch';

const BASE = LEVELS.garage;
/** Underside of the deck slab overhead: this level's ceiling, and its lid. */
const SOFFIT = LEVELS.floor - GARAGE.slabDepth;

/** Slab thickness, as the deck's. */
const SLAB = 0.28;
/** Nominal size of one pour. */
const POUR = 5.3;
/** Paint sits this far above the slab. Same reasoning as the deck's. */
const LIFT = 0.01;

const WIDTH = PARKHAUS.x1 - PARKHAUS.x0;
const DEPTH = PARKHAUS.z1 - PARKHAUS.z0;

// ---------------------------------------------------------------------------
// Slab
// ---------------------------------------------------------------------------

/**
 * The floor, poured in bays like the deck's and for the same reason: a slab
 * this size goes down over several days out of several trucks, and five years
 * later the pour lines are the most legible thing on it.
 *
 * Less variation than the deck gets, though, and that is deliberate. Up there
 * the pours are bleached by five years of sun and every one has weathered
 * differently; down here nothing has ever been rained on, so the difference
 * between two bays is the difference between two mixes and nothing else.
 */
function slab(sink: Sink, out: CollisionVolume[], rng: Rng): void {
  const cx = (PARKHAUS.x0 + PARKHAUS.x1) / 2;
  const cz = (PARKHAUS.z0 + PARKHAUS.z1) / 2;

  sink.box(MAT.concrete, [WIDTH, SLAB, DEPTH], [cx, BASE - SLAB / 2 - 0.02, cz], { cast: false });
  out.push({ label: 'garage.slab', size: [WIDTH, SLAB, DEPTH], centre: [cx, BASE - SLAB / 2, cz] });

  const panelGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const base = (MAT.concrete as THREE.MeshStandardMaterial).color;
  const tone = new THREE.Color();
  const m = new THREE.Matrix4();

  const nx = Math.max(1, Math.round(WIDTH / POUR));
  const nz = Math.max(1, Math.round(DEPTH / POUR));
  const pw = WIDTH / nx;
  const pd = DEPTH / nz;

  const panels = new THREE.InstancedMesh(panelGeo, MAT.concrete, nx * nz);
  panels.receiveShadow = true;
  let i = 0;
  for (let ix = 0; ix < nx; ix++) {
    for (let iz = 0; iz < nz; iz++) {
      m.compose(
        new THREE.Vector3(PARKHAUS.x0 + (ix + 0.5) * pw, BASE, PARKHAUS.z0 + (iz + 0.5) * pd),
        new THREE.Quaternion(),
        new THREE.Vector3(pw, 1, pd),
      );
      panels.setMatrixAt(i, m);
      const lot = range(rng, 0.975, 1.025);
      tone.copy(base);
      tone.r *= lot;
      tone.g *= lot * range(rng, 0.995, 1.008);
      tone.b *= lot * range(rng, 0.99, 1.005);
      panels.setColorAt(i, tone);
      i++;
    }
  }
  sink.add(panels);

  /*
   * The pour joints are the tone difference and nothing else.
   *
   * There were strips of `darkMetal` laid over every joint, 30 mm wide and 7 mm
   * proud, on the reasoning that a saw-cut in a slab is a visible line. It is —
   * but not this line. `darkMetal` is a cool blue-grey, the floor either side of
   * it is warm concrete, and a 12 m run of cool laid across a warm floor under a
   * light this low does not read as a joint in the slab. It reads as painted
   * blue lines, on a grid, in a car park that has no bay markings anywhere else.
   *
   * The bays above already carry a per-panel tone variation for exactly this —
   * see the instanced colours — and that is what a pour line actually looks like
   * from a seat: the edge where one mix stops and the next begins. So the strips
   * go, and the joint stays as the thing it always was.
   */
}

// ---------------------------------------------------------------------------
// Enclosure
// ---------------------------------------------------------------------------

/**
 * One open edge: a solid upstand you can see over from the seat, nothing above
 * it, and an invisible collider running the full height.
 *
 * The collider and the upstand are deliberately different sizes, which is the
 * only place in the building where that is true and worth saying why. What
 * stops a car going over the edge of a car park is the Brüstung, at 1.05 m —
 * but what stops a chair is that it never gets the chance, because a chair that
 * leaves an open edge at six metres a second is a chair that has left the game.
 * The upstand is what is built; the collider is what is meant.
 */
function openEdge(
  sink: Sink,
  out: CollisionVolume[],
  label: string,
  axis: 'x' | 'z',
  at: number,
  from: number,
  to: number,
  outward: -1 | 1,
): void {
  const t = GARAGE.upstandThickness;
  const h = GARAGE.upstandHeight;
  const span = to - from;
  const mid = (from + to) / 2;
  const face = at + (outward * t) / 2;

  // 'z' runs along Z at a constant X, as everywhere else in the plan.
  const size: [number, number, number] = axis === 'z' ? [t, h, span] : [span, h, t];
  const centre: [number, number, number] = axis === 'z' ? [face, BASE + h / 2, mid] : [mid, BASE + h / 2, face];
  sink.box(MAT.concreteFair, size, centre);

  // A dark band along the top, which is what an untreated concrete upstand in a
  // car park always has: the edge everybody's sleeve, wing mirror and bumper has
  // been over for five years.
  const bandSize: [number, number, number] = axis === 'z' ? [t + 0.02, 0.09, span] : [span, 0.09, t + 0.02];
  sink.box(MAT.darkMetal, bandSize, [centre[0], BASE + h - 0.045, centre[2]], { cast: false });

  const clearHeight = SOFFIT - BASE;
  const guardSize: [number, number, number] = axis === 'z' ? [t, clearHeight, span] : [span, clearHeight, t];
  out.push({ label, size: guardSize, centre: [centre[0], BASE + clearHeight / 2, centre[2]] });
}

/** A solid piece of enclosure, floor to soffit: the building's flank, and the
 *  outer face of the ramp bay where the ramp itself is the elevation. */
function solidEdge(
  sink: Sink,
  out: CollisionVolume[],
  label: string,
  axis: 'x' | 'z',
  at: number,
  from: number,
  to: number,
  outward: -1 | 1,
  top = SOFFIT,
): void {
  const t = GARAGE.upstandThickness;
  const h = top - BASE;
  const span = to - from;
  const mid = (from + to) / 2;
  const face = at + (outward * t) / 2;

  // 'z' runs along Z at a constant X, as everywhere else in the plan.
  const size: [number, number, number] = axis === 'z' ? [t, h, span] : [span, h, t];
  const centre: [number, number, number] = axis === 'z' ? [face, BASE + h / 2, mid] : [mid, BASE + h / 2, face];
  sink.box(MAT.concreteFair, size, centre);
  out.push({ label, size, centre });
}

/**
 * The perimeter.
 *
 * Open on three sides and solid on the fourth, which is not a stylistic choice:
 * the east face is the office building it is bolted to, and there is a letting
 * on the other side of it. The two stretches of the west face that are also
 * solid are the ramp bay, where the elevation is the ramp — which is why a
 * Parkhaus with a ramp against its outer wall reads as slots with one blank
 * panel in them, and why this one does too.
 */
function enclosure(sink: Sink, out: CollisionVolume[]): void {
  // West, with the down ramp's bay closed off between its two ends. That stretch
  // runs all the way up to the deck rather than stopping at the soffit, because
  // there is no soffit over it — it is the outer face of the ramp bay, and the
  // deck's own parapet stands on top of it.
  openEdge(sink, out, 'garage.west.north', 'z', PARKHAUS.x0, PARKHAUS.z0, 8.75, -1);
  solidEdge(sink, out, 'garage.west.ramp', 'z', PARKHAUS.x0, 8.75, 33.75, -1, LEVELS.floor);
  openEdge(sink, out, 'garage.west.south', 'z', PARKHAUS.x0, 33.75, PARKHAUS.z1, -1);

  openEdge(sink, out, 'garage.north', 'x', PARKHAUS.z0, PARKHAUS.x0, PARKHAUS.x1, -1);
  openEdge(sink, out, 'garage.south', 'x', PARKHAUS.z1, PARKHAUS.x0, PARKHAUS.x1, 1);

  // And the building's flank, which is the one wall down here with a letting on
  // the far side of it and therefore the only one that is not a hole.
  solidEdge(sink, out, 'garage.east', 'z', PARKHAUS.x1, PARKHAUS.z0, PARKHAUS.z1, 1);

  // The ramp bays, walled off from Ebene 5 where the soffit gets too low to
  // drive under.
  //
  // A ramp descending through a level leaves a wedge underneath it, and that
  // wedge is open at the top end and pinches to nothing at the bottom. Left
  // open, it is a pocket you can drive into and have to reverse out of, with a
  // ceiling that comes down to meet you — and there is nothing in there, because
  // there is nothing that could be. Real Parkhäuser wall the ramp bay off for
  // exactly this reason.
  //
  // 16.25 is where it stops being drivable: the soffit is 1.6 m over the floor
  // there against a chair that stands 1.1 m, and every metre south of it is
  // worse. North of that the pocket stays open, because a low bay you *can* get
  // into and back out of is a place, and a solid wall across the whole flank
  // would take the view of the ramp with it.
  for (const [x, side] of [
    [5.0, -1],
    [16.25, 1],
    [20.0, -1],
  ] as const) {
    solidEdge(sink, out, `garage.rampbay.${x}`, 'z', x, 16.25, 30.0, side as -1 | 1);
  }

  // The fascia under this level's slab, which used to hang under the deck's.
  // It has to move down with the floor: looking over the deck parapet has to
  // find a building rather than a hole, and now the first thing it finds is the
  // slot of Ebene 5 and the band of concrete under it.
  const drop = 1.1;
  const y = BASE - SLAB - drop / 2;
  sink.box(MAT.concreteFair, [WIDTH + 0.3, drop, 0.3], [(PARKHAUS.x0 + PARKHAUS.x1) / 2, y, PARKHAUS.z0 - 0.15], {
    cast: false,
  });
  sink.box(MAT.concreteFair, [0.3, drop, DEPTH + 0.3], [PARKHAUS.x0 - 0.15, y, (PARKHAUS.z0 + PARKHAUS.z1) / 2], {
    cast: false,
  });
  sink.box(MAT.concreteFair, [WIDTH + 0.3, drop, 0.3], [(PARKHAUS.x0 + PARKHAUS.x1) / 2, y, PARKHAUS.z1 + 0.15], {
    cast: false,
  });
}

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

/**
 * The column line, and the downstands it carries.
 *
 * Three jobs, the same three the hall's columns do: hold the deck up, give the
 * room depth, and be the median between two lanes going opposite ways. Down here
 * they get a fourth that only a car park can give them — they are the only thing
 * regular enough and close enough to read speed off, which is the entire reason
 * the level below feels faster than the deck at the same six metres a second.
 */
function structure(sink: Sink, out: CollisionVolume[]): void {
  const clear = SOFFIT - BASE;
  const s = GARAGE.columnSize;

  for (const z of GARAGE_COLUMNS.zs) {
    sink.box(MAT.concreteFair, [s, clear, s], [GARAGE_COLUMNS.x, BASE + clear / 2, z]);
    out.push({ label: `garage.column.${z}`, size: [s + 0.1, clear, s + 0.1], centre: [GARAGE_COLUMNS.x, BASE + clear / 2, z] });

    // Anfahrschutz round the foot, because a column in a car park has been hit.
    for (const side of [-1, 1] as const) {
      sink.box(MAT.hazardRed, [s + 0.04, 0.16, s + 0.04], [GARAGE_COLUMNS.x, BASE + 0.55 + side * 0.22, z], {
        cast: false,
      });
    }
  }

  // Unterzüge across the waist, on the column grid. The soffit is the biggest
  // single surface on this level and a flat one reads as a lid rather than as a
  // floor with a building on top of it.
  const beam = GARAGE.beamDepth;
  for (const z of GARAGE_COLUMNS.zs) {
    sink.box(MAT.concreteFair, [11.25, beam, 0.45], [10.625, SOFFIT - beam / 2, z], { cast: false });
  }
  for (const z of [4.0, 37.5]) {
    sink.box(MAT.concreteFair, [WIDTH, beam, 0.45], [(PARKHAUS.x0 + PARKHAUS.x1) / 2, SOFFIT - beam / 2, z], {
      cast: false,
    });
  }
  // And the spine beam down the column line itself.
  sink.box(MAT.concreteFair, [0.5, beam, 18.0], [GARAGE_COLUMNS.x, SOFFIT - beam / 2, 18.75], { cast: false });

  // The stair and lift core, coming down from the deck. On this level it is the
  // solid mass the south hall turns around, which is the only thing in the hall
  // big enough to give the corner a shape.
  const st = DECK_STAIR;
  const cx = (st.x0 + st.x1) / 2;
  const cz = (st.z0 + st.z1) / 2;
  const w = st.x1 - st.x0;
  const d = st.z1 - st.z0;
  sink.box(MAT.concreteFair, [w, clear, d], [cx, BASE + clear / 2, cz]);
  out.push({ label: 'garage.stair', size: [w + 0.1, clear, d + 0.1], centre: [cx, BASE + clear / 2, cz] });
}

// ---------------------------------------------------------------------------
// The back-of-house at the south end
// ---------------------------------------------------------------------------

/** A hole in a blockwork wall, positioned along the wall's running axis. */
type Hole = { at: number; width: number; height?: number };

/**
 * A blockwork wall with holes in it, floor to soffit.
 *
 * Not the plan's `buildWall`, and that is on purpose. Everything upstairs is
 * Trockenbau or curtain wall, with skirtings, reveals and a bulkhead over every
 * door, because it is a letting somebody fitted out. These are 200 mm blocks
 * painted once in 1999: a pier, a hole, a header, and nothing else. Half the
 * character of the level is that its walls are visibly a different thing from
 * the walls of the building on top of it.
 *
 * The piers fall out of the holes rather than being listed, so a wall and its
 * openings cannot disagree — which is the same rule the floorplate upstairs is
 * built on, for the same reason.
 */
function blockWall(
  sink: Sink,
  out: CollisionVolume[],
  label: string,
  axis: 'x' | 'z',
  at: number,
  from: number,
  to: number,
  holes: readonly Hole[] = [],
): void {
  const t = 0.2;
  const full = SOFFIT - BASE;

  const piece = (u0: number, u1: number, y0: number, y1: number, tag: string) => {
    if (u1 - u0 < 0.02 || y1 - y0 < 0.02) return;
    const span = u1 - u0;
    const mid = (u0 + u1) / 2;
    const h = y1 - y0;
    const size: [number, number, number] = axis === 'z' ? [t, h, span] : [span, h, t];
    const centre: [number, number, number] = axis === 'z' ? [at, y0 + h / 2, mid] : [mid, y0 + h / 2, at];
    // Painted blockwork, not the building's magnolia emulsion. These walls went
    // up with the frame and were painted once with whatever the contractor had;
    // reading them in the same colour as a letting upstairs is the single
    // quickest way to make the level below look like a floor of the office.
    sink.box(MAT.concreteFair, size, centre);
    out.push({ label: `${label}.${tag}`, size, centre });
  };

  const sorted = [...holes].sort((a, b) => a.at - b.at);
  let cursor = from;
  for (const [i, hole] of sorted.entries()) {
    const a = hole.at - hole.width / 2;
    const b = hole.at + hole.width / 2;
    piece(cursor, a, BASE, BASE + full, `pier.${i}`);
    // The header over the hole, which is what makes an opening in blockwork read
    // as an opening rather than as the wall having stopped.
    piece(a, b, BASE + (hole.height ?? 2.4), BASE + full, `header.${i}`);
    cursor = b;
  }
  piece(cursor, to, BASE, BASE + full, 'pier.last');
}

/** A steel door leaf in its frame, applied to a face rather than cut into it. */
function steelDoor(sink: Sink, axis: 'x' | 'z', at: number, u: number, side: -1 | 1, louvred: boolean): void {
  const w = 1.01;
  const h = 2.11;
  const y = BASE + h / 2;
  const face = at + side * 0.11;

  const leaf: [number, number, number] = axis === 'z' ? [0.05, h, w] : [w, h, 0.05];
  const frame: [number, number, number] = axis === 'z' ? [0.07, h + 0.13, w + 0.15] : [w + 0.15, h + 0.13, 0.07];
  sink.box(MAT.darkMetal, frame, axis === 'z' ? [face, y + 0.06, u] : [u, y + 0.06, face], { cast: false });
  sink.box(MAT.metal, leaf, axis === 'z' ? [face + side * 0.02, y, u] : [u, y, face + side * 0.02], { cast: false });

  // Lüftungsgitter across the bottom two-thirds. A plant room door has one
  // because the room has to breathe, and it is the reason you can see the
  // pipework behind it at all.
  if (louvred) {
    for (let ly = 0.35; ly < 1.75; ly += 0.09) {
      const bar: [number, number, number] = axis === 'z' ? [0.03, 0.05, w - 0.16] : [w - 0.16, 0.05, 0.03];
      sink.box(MAT.darkMetal, bar, axis === 'z' ? [face + side * 0.05, BASE + ly, u] : [u, BASE + ly, face + side * 0.05], {
        cast: false,
      });
    }
  }

  // Türschild and the running man, because every one of these doors has both.
  sink.box(
    MAT.signFace,
    axis === 'z' ? [0.01, 0.075, 0.21] : [0.21, 0.075, 0.01],
    axis === 'z' ? [face + side * 0.05, BASE + 1.6, u + 0.75] : [u + 0.75, BASE + 1.6, face + side * 0.05],
    { cast: false },
  );
}

/**
 * The three rooms across the south end, and the walls that make them.
 *
 * The lap goes through two of them and past the third. The one it goes past is
 * the plant room, and that is the whole point of it: a locked louvred door with
 * a wall of red pipework behind it, glimpsed once a lap at the bottom of the
 * ramp, does more for the level than a third room to drive through would.
 */
function backOfHouse(sink: Sink, out: CollisionVolume[]): void {
  // The wall across the front of all three, with the plant room's door, the
  // store's opening and the Waschbox's.
  const O = GARAGE_OPENINGS;
  blockWall(sink, out, 'garage.wall.front', 'x', O.frontZ, 5.0, PARKHAUS.x1, [
    { at: 7.2, width: 1.16, height: 2.24 },
    { ...O.store, height: 2.4 },
    { ...O.wash, height: 2.4 },
  ]);
  steelDoor(sink, 'x', O.frontZ, 7.2, -1, true);

  // Plant room to store: solid, with the locked door on the store's side that
  // nobody has opened since the last sprinkler test.
  blockWall(sink, out, 'garage.wall.plant', 'z', 10.0, O.frontZ, PARKHAUS.z1);
  steelDoor(sink, 'z', 10.0, 40.6, 1, false);

  // Store to Waschbox: the hole the lap goes through, at the far corner from the
  // one it came in by.
  blockWall(sink, out, 'garage.wall.store', 'z', O.divisionX, O.frontZ, PARKHAUS.z1, [
    { ...O.storeToWash, height: 2.4 },
  ]);

  /**
   * And the same line carried north, from the front wall to the foot of the
   * Einfahrt — which is what makes the two rooms above a route rather than a
   * suggestion.
   *
   * The lap is supposed to come down the back lane, drop into the cage store at
   * x 13.0, cross it corner to corner, pass into the Waschbox at z 40.8 and come
   * out at x 19.0 pointed at the ramp. It was not supposed to be able to arrive
   * at the back lane's south end, turn left across six and a half metres of open
   * slab, and be on the ramp — skipping both rooms, which is most of what Ebene 5
   * has that the deck above it does not, and taking about two seconds off a lap
   * for the privilege. Measured on the real colliders: 4.52 m from the lane to
   * the landing with nothing whatever in the way.
   *
   * x = 16.25 because the wall is already there twice over and this is the gap
   * between them: the ramp's own west flank runs solid from the north end of the
   * level down to z 30.5, the store/Waschbox division runs from 37.5 south, and
   * the seven metres between the two was simply never built. So this is less an
   * addition than the completion of a line — which is also why it needs no
   * argument architecturally. A Parkhaus does not leave the blind side of a
   * one-way ramp's landing open to the parking hall; the whole point of a ramp
   * flank is that nothing joins the lane except at the end you can see.
   *
   * From 30.0 rather than 30.5 so it butts into the ramp structure with a little
   * to spare — a hairline between two static colliders is a seam a chair at
   * 40 km/h will eventually find. Not past 30.0: north of there the ramp deck is
   * climbing away from the slab, and a floor-to-soffit wall would stand through
   * it.
   */
  blockWall(sink, out, 'garage.wall.ramp', 'z', O.divisionX, 30.0, O.frontZ);
}

// ---------------------------------------------------------------------------
// Paint and light
// ---------------------------------------------------------------------------

/** A flat painted patch, laid on the slab. */
function paint(sink: Sink, material: THREE.Material, x0: number, z0: number, x1: number, z1: number): void {
  const geo = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)).rotateX(-Math.PI / 2);
  const m = new THREE.Matrix4().setPosition((x0 + x1) / 2, BASE + LIFT, (z0 + z1) / 2);
  sink.geo(material, geo, m, { cast: false });
}

/** Two barbs and a shaft, as painted. `yaw` 0 points at +Z. */
function arrow(sink: Sink, x: number, z: number, yaw: number): void {
  const shaft = new THREE.PlaneGeometry(0.16, 1.6).rotateX(-Math.PI / 2);
  const barb = new THREE.PlaneGeometry(0.16, 0.7).rotateX(-Math.PI / 2);
  const base = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, BASE + LIFT, z);

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
 * The one-way markings.
 *
 * A car park with two lanes going opposite ways either side of a column line
 * says so in paint, because it has to: the whole level is one room and nothing
 * about its shape tells you which side to be on. It is also the only signage on
 * the lap that agrees with the racing line by accident rather than by design.
 */
function markings(sink: Sink): void {
  const half = DECK.lineWidth / 2;

  // The centre line down the column bay, broken, as a lane divider is.
  for (let z = 9.0; z < 31.0; z += 2.4) {
    paint(sink, MAT.trafficWhite, GARAGE_COLUMNS.x - half - 1.8, z, GARAGE_COLUMNS.x + half - 1.8, z + 1.2);
  }

  // Northbound in the out lane, southbound in the back lane — the same way
  // round the level as the lap goes, because a one-way car park and a racing
  // line want the same thing and only one of them had to be designed.
  for (const z of [13.0, 21.0, 28.0]) arrow(sink, 7.8, z, Math.PI);
  for (const z of [14.0, 22.0, 29.0]) arrow(sink, 13.9, z, 0);

  // The turn at each end, where the lane swaps sides.
  arrow(sink, 11.0, 4.2, Math.PI / 2);
  arrow(sink, 5.0, 35.6, Math.PI / 2);

  // Vorfahrt hatching across the mouth of the store, and the wet-floor line
  // outside the Waschbox that has been there since before anybody remembers.
  paint(sink, MAT.trafficYellow, 11.4, 36.6, 11.4 + DECK.lineWidth, 37.4);
  paint(sink, MAT.trafficYellow, 14.6, 36.6, 14.6 + DECK.lineWidth, 37.4);
}

/**
 * Leuchtstoffröhren between the downstands, and the sodium at the ramp feet.
 *
 * A parking level is lit by a continuous run of bare battens on the soffit and
 * by nothing else, and the reason it looks the way it does is that they are all
 * the same and the concrete between them is not. The light itself is a small
 * pool — see render/lights.ts, which lifts every fitting in the building into
 * one — so what is authored here is where the fittings are, not what the frame
 * can afford.
 */
function lighting(sink: Sink, group: THREE.Group): void {
  const fittings: [number, number][] = [
    [7.8, 6.0],
    [7.8, 14.0],
    [7.8, 22.0],
    [7.8, 30.0],
    [13.9, 10.0],
    [13.9, 18.0],
    [13.9, 26.0],
    [11.0, 3.4],
    [10.0, 35.5],
    [16.5, 33.0],
    [3.5, 33.5],
    // One in each of the three rooms. The store's is the only light in a 1.6 m
    // lane between two runs of mesh, which is the whole look of the room.
    [7.5, 40.0],
    [13.2, 40.2],
    [18.6, 40.0],
  ];

  for (const [x, z] of fittings) {
    const y = SOFFIT - 0.08;
    sink.box(MAT.darkMetal, [0.11, 0.07, 1.5], [x, y, z], { cast: false });
    sink.box(MAT.sodiumLamp, [0.085, 0.03, 1.44], [x, y - 0.05, z], { cast: false });

    const lamp = new THREE.PointLight(new THREE.Color(SODIUM.color), SODIUM.intensity * 2.4, 12, 2);
    lamp.position.set(x, y - 0.2, z);
    group.add(lamp);
  }
}

// ---------------------------------------------------------------------------

export function buildGarage(sink: Sink, group: THREE.Group, rng: Rng): CollisionVolume[] {
  const collision: CollisionVolume[] = [];

  slab(sink, collision, rng);
  enclosure(sink, collision);
  structure(sink, collision);
  backOfHouse(sink, collision);
  markings(sink);
  lighting(sink, group);

  return collision;
}
