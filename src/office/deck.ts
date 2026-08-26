/**
 * The Parkdeck: top deck of the Parkhaus that abuts the building, open to the
 * sky, six floors up.
 *
 * It exists for two reasons. The first is light: everything else on this
 * floorplate is lit through glass or by a fluorescent tube, and a lap that
 * never leaves that reads as one long room. Out here the sun arrives with
 * nothing in front of it, the shadows are forty metres long, and the city is
 * the backdrop rather than a picture in a window. The second is space — this
 * is the only place on the lap wide enough to actually be driven fast, and the
 * only obstacles are things somebody parked.
 *
 * It has two holes in it now, and that changes what it is. The deck used to be
 * one rectangle with two rows of bays and an aisle between them; it is now a
 * spine — one aisle, one row of bays — running between two open ramp slots,
 * with a full-width head at each end. Every rectangle of concrete that is left
 * is in DECK_PLATES, and everything in this file that lays anything down clips
 * to that list. Nothing may assume the deck is a rectangle any more, because
 * the two things that would go wrong if it did are paint hanging over a
 * three-metre drop and, far worse, a collider closing a hole the geometry has
 * left open.
 *
 * Everything on it is poured, painted or bolted down, because that is all a
 * deck slab has: falls, joints, paint, and whatever could survive a winter.
 */

import * as THREE from 'three';

import type { CollisionVolume } from './collision';
import { BAYS, DECK_PLATES, DECK_STAIR, type Room } from './plan';
import { DECK, FITTINGS } from './metrics';
import { MAT } from './materials';
import { SODIUM } from './palette';
import { jitter, range, type Rng } from './rng';
import type { Sink } from '../render/batch';

/**
 * The order things are laid on the slab.
 *
 * Everything on a deck is a thin film on top of the concrete, so all of it
 * wants to be at very nearly the same height — and "very nearly" is exactly
 * where depth buffers fail. Four millimetres between layers is invisible from
 * a seated eye height and far more than the depth precision needs at forty
 * metres, which is the range these are still being read at.
 */
const Y: Record<'panel' | 'joint' | 'weather' | 'stain' | 'paint', number> = {
  panel: 0,
  joint: 0.003,
  weather: 0.006,
  stain: 0.009,
  paint: 0.012,
};

/** Slab thickness. */
const SLAB = 0.28;

/** Nominal size of one pour. Real bays land between five and six metres. */
const POUR = 5.3;

/** A rectangle of deck: one of the plates, or the notch. */
type Plate = { id: string; x0: number; z0: number; x1: number; z1: number };

/**
 * The plates, named, plus whatever the plan calls a deck room that is not the
 * main slab — which is the notch, and only the notch.
 */
function platesOf(rooms: readonly Room[]): Plate[] {
  const plates: Plate[] = DECK_PLATES.map((p, i) => ({ id: `deck.main.${i}`, ...p }));
  for (const room of rooms) {
    if (room.id === 'deck.main') continue;
    plates.push({ id: room.id, x0: room.x0, z0: room.z0, x1: room.x1, z1: room.z1 });
  }
  return plates;
}

/**
 * Clip a rectangle to the concrete that actually exists, as a list of pieces.
 *
 * Everything laid on the deck goes through this. Weathering, paint and hatching
 * are all authored as rectangles over a deck that used to be one, and a wash
 * running the full 42.5 m down the west edge now crosses twenty-five metres of
 * open ramp slot — where it draws as a stain hanging in mid-air three metres
 * above the level below. Clipping is two lines and removes the whole class.
 */
function onPlates(plates: readonly Plate[], x0: number, z0: number, x1: number, z1: number): [number, number, number, number][] {
  const pieces: [number, number, number, number][] = [];
  const [ax0, ax1] = x0 <= x1 ? [x0, x1] : [x1, x0];
  const [az0, az1] = z0 <= z1 ? [z0, z1] : [z1, z0];

  for (const p of plates) {
    const cx0 = Math.max(ax0, p.x0);
    const cx1 = Math.min(ax1, p.x1);
    const cz0 = Math.max(az0, p.z0);
    const cz1 = Math.min(az1, p.z1);
    if (cx1 - cx0 > 1e-4 && cz1 - cz0 > 1e-4) pieces.push([cx0, cz0, cx1, cz1]);
  }
  return pieces;
}

/**
 * Tyre rubber and dropped oil.
 *
 * Every bay that has been used for five years has a dark patch in the middle of
 * it and two pale arcs where the tyres sat. It is the cheapest possible detail
 * and it does more for a concrete floor than any amount of normal map, because
 * it is the only thing on the deck that records that anything ever happened.
 */
const STAIN = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x151413),
  roughness: 0.32,
  metalness: 0,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

/**
 * Rain.
 *
 * A deck that is open to the sky is washed and stained by the same water, and
 * where it runs is not arbitrary: down the parapets it splashes off, along the
 * falls into the channel, and out from under everything that has stood still
 * long enough to keep the rain off the concrete beneath it. Weathering that
 * ignores where water goes reads as dirt sprinkled on, which is worse than
 * clean concrete.
 */
const WEATHER = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x3d3a35),
  roughness: 0.95,
  metalness: 0,
  transparent: true,
  // Deliberately faint. Weathering at any strength you can name reads as paint
  // — the first pass of this was at 0.3 and the deck came out looking like a
  // chequerboard somebody had spilled something on. Dirt is a bias, not a mark.
  opacity: 0.11,
  depthWrite: false,
});

/**
 * Where a service has been cut out of the slab and made good.
 *
 * Darker than the deck around it, not lighter: the slab has had five years of
 * sun and traffic to bleach it and the patch has had one winter. Getting that
 * the wrong way round — which the first version did — puts a bright rectangle
 * on the floor that reads as a hole rather than as a repair.
 */
const PATCH = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x817e77),
  roughness: 0.82,
  metalness: 0,
});

/** A flat painted patch, laid on the slab. */
function paint(
  sink: Sink,
  material: THREE.Material,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y = Y.paint,
): void {
  const geo = new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(z1 - z0)).rotateX(-Math.PI / 2);
  const m = new THREE.Matrix4().setPosition((x0 + x1) / 2, y, (z0 + z1) / 2);
  sink.geo(material, geo, m, { cast: false });
}

/**
 * Four strengths of weathering rather than a continuum.
 *
 * A material per stain means a draw call per stain, and there are about fifty
 * of them. Quantising into four shared materials lets the batcher merge the lot
 * into four, and nobody has ever looked at a damp patch on a car park and been
 * able to tell you it was eleven per cent rather than fourteen.
 */
const WASHES = [0.4, 0.6, 0.8, 1.0].map((strength) => {
  const mat = WEATHER.clone();
  mat.opacity = WEATHER.opacity * strength;
  return mat;
});

/** A rectangle of weathering, laid on and blended — and clipped to the slab. */
function wash(
  sink: Sink,
  plates: readonly Plate[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  strength: number,
): void {
  const bucket = WASHES[Math.min(WASHES.length - 1, Math.max(0, Math.round(strength * WASHES.length) - 1))]!;
  for (const [cx0, cz0, cx1, cz1] of onPlates(plates, x0, z0, x1, z1)) {
    const geo = new THREE.PlaneGeometry(cx1 - cx0, cz1 - cz0).rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4().setPosition((cx0 + cx1) / 2, Y.weather, (cz0 + cz1) / 2);
    sink.geo(bucket, geo, m, { cast: false });
  }
}

// ---------------------------------------------------------------------------
// Slab
// ---------------------------------------------------------------------------

/**
 * The deck slab, poured in bays.
 *
 * This is the whole difference between a car park and a grey plane. A slab this
 * size is not one surface: it goes down bay by bay over several days, each pour
 * from a different truck with a different water content, and every one of them
 * cures to a slightly different grey. Five years later the pour lines are the
 * most legible thing on the deck — more legible than the paint, which has worn.
 *
 * So the floor is laid as panels with per-pour tone rather than as one box, the
 * saw cuts run both ways because that is how you control shrinkage in two
 * directions, and the joints are the panel edges rather than a separate set of
 * lines drawn over the top of them.
 */
function slab(sink: Sink, out: CollisionVolume[], plates: readonly Plate[], rng: Rng): void {
  const panelGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const base = (MAT.concrete as THREE.MeshStandardMaterial).color;
  const tone = new THREE.Color();
  const m = new THREE.Matrix4();

  for (const plate of plates) {
    const W = plate.x1 - plate.x0;
    const D = plate.z1 - plate.z0;
    const cx = (plate.x0 + plate.x1) / 2;
    const cz = (plate.z0 + plate.z1) / 2;

    // The structural depth, dropped clear of the panels so the two surfaces are
    // never coincident. It is never seen from up here: the panels sit on top of
    // it. From Ebene 5 it is the entire ceiling, which is why it is a real
    // 280 mm of concrete and not a plane.
    sink.box(MAT.concrete, [W, SLAB, D], [cx, -SLAB / 2 - 0.02, cz], { cast: false });
    out.push({ label: `${plate.id}.slab`, size: [W, SLAB, D], centre: [cx, -SLAB / 2, cz] });

    const nx = Math.max(1, Math.round(W / POUR));
    const nz = Math.max(1, Math.round(D / POUR));
    const pw = W / nx;
    const pd = D / nz;

    const panels = new THREE.InstancedMesh(panelGeo, MAT.concrete, nx * nz);
    panels.receiveShadow = true;
    let i = 0;
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        m.compose(
          new THREE.Vector3(plate.x0 + (ix + 0.5) * pw, Y.panel, plate.z0 + (iz + 0.5) * pd),
          new THREE.Quaternion(),
          new THREE.Vector3(pw, 1, pd),
        );
        panels.setMatrixAt(i, m);
        // Pour-to-pour variation, and it is not just brightness: a wetter mix
        // cures greyer and a drier one browner, so the shift has to be across
        // the hue as well or the deck reads as a single colour with the levels
        // wobbled. Small — five per cent. Two adjacent pours differ by about as
        // much as two sheets of paper from different reams, and anything more
        // than that stops being a floor and becomes a tiled one.
        const lot = range(rng, 0.965, 1.035);
        tone.copy(base);
        tone.r *= lot * range(rng, 0.995, 1.015);
        tone.g *= lot;
        tone.b *= lot * range(rng, 0.98, 1.005);
        panels.setColorAt(i, tone);
        i++;
      }
    }
    sink.add(panels);

    /*
     * The saw cuts are the tone difference and nothing else — see the same note,
     * and the same removal, in `garage.ts`.
     *
     * They were 30 mm strips of `darkMetal` over every panel edge in both
     * directions. A saw cut in a slab is a visible line, but not a *cool* one:
     * laid across warm concrete at golden hour a graphite strip stops reading as
     * a joint and starts reading as blue paint, and a deck ruled off in blue at
     * 5.3 m centres reads as a games court. The per-pour tone above already does
     * the job, and does it the way a real deck does — the edge where one mix
     * stops and the next begins.
     *
     * The Fugenband went with them for the same reason. A sealed movement joint
     * is a real and much wider thing than a saw cut, but it is still a dark band
     * lying in the floor, and three of them across the deck were three more blue
     * stripes on the one surface this game spends the most time looking at.
     */
  }

  // Nothing else is needed at a slot edge. The 280 mm of structural depth above
  // is the reveal you actually see from the deck, and the guarding round the
  // hole — which ramps.ts builds, because it belongs to the ramp — is what
  // reads at forty metres.

  // The notch's fascia. The Parkhaus's own edge is two levels tall now and is
  // built in garage.ts with the rest of the elevation; what is left here is the
  // one piece of deck that has nothing under it at all — the wing cantilevered
  // off the east flank over the street, which needs a soffit or it reads as a
  // slab floating past the hall's windows.
  sink.box(MAT.concreteFair, [18.75, 1.1, 0.3], [30.625, -0.55 - SLAB, 42.65], { cast: false });
  sink.box(MAT.concreteFair, [18.75, 0.3, 11.25], [30.625, -0.15 - SLAB, 36.875], { cast: false });
}

/**
 * Five years of weather on the slab.
 *
 * Ordered by where water actually goes: off the parapets, out of the building's
 * downpipes, along the falls into the channel, and standing in the low corners
 * nobody sweeps. Plus the two or three places where somebody cut the slab open
 * for a drain and made it good afterwards with a mix that has never matched.
 */
function weathering(sink: Sink, plates: readonly Plate[], rng: Rng): void {
  // Splash-back along every open edge, and the darker band where the deck meets
  // the building and the rain comes off the facade. Authored across the whole
  // deck as if it were still a rectangle, because that is how water behaves —
  // and clipped, because that is where the concrete is.
  wash(sink, plates, 0, 0, 0.9, 42.5, 1.0);
  wash(sink, plates, 0, 0, 21.25, 0.9, 0.9);
  wash(sink, plates, 0, 41.6, 40, 42.5, 0.9);
  wash(sink, plates, 20.35, 0, 21.25, 31.25, 0.8);
  wash(sink, plates, 21.25, 31.25, 40, 32.0, 0.8);
  // And a new one: the two slots are where the whole deck now drains to, so
  // there is a dark band along both of their long edges that was not there when
  // the deck was solid.
  wash(sink, plates, 4.4, 8.75, 5.0, 33.75, 1.0);
  wash(sink, plates, 16.25, 8.75, 16.85, 33.75, 0.9);

  // The falls. Water runs across the deck into the channel down the aisle, and
  // it leaves a runnel every time — long, narrow, and irregularly spaced. The
  // shape matters more than the tone: a run of short wide rectangles at even
  // spacing reads as brickwork, which is what the first attempt at this looked
  // like.
  for (let z = 1.2; z < 33; z += range(rng, 0.6, 1.7)) {
    for (const side of [-1, 1] as const) {
      if (rng() > 0.75) continue;
      const reach = range(rng, 1.4, 3.6);
      const width = range(rng, 0.1, 0.34);
      const from = 8.125 + side * 0.3;
      wash(sink, plates, from, z, from + side * reach, z + width, range(rng, 0.5, 1.0));
    }
  }
  // Standing water at the low end of the channel, which never quite drains.
  wash(sink, plates, 7.2, 19.8, 9.1, 21.3, 1.0);

  // Made-good patches. Saw-cut edges, a different mix, and always rectangular.
  for (const [x0, z0, w, d] of [
    [12.6, 24.2, 1.8, 2.4],
    [6.1, 12.0, 2.2, 1.4],
    [26.5, 33.9, 1.6, 1.9],
  ] as const) {
    const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2);
    sink.geo(PATCH, geo, new THREE.Matrix4().setPosition(x0 + w / 2, Y.joint, z0 + d / 2), { cast: false });
    // The cut line round it, which is what makes it read as a repair rather
    // than as a stain. Iron rather than powder coat, for the reason everything
    // else lying in this slab is — see `castIron`.
    sink.box(MAT.castIron, [w, 0.006, 0.02], [x0 + w / 2, Y.weather, z0], { cast: false });
    sink.box(MAT.castIron, [w, 0.006, 0.02], [x0 + w / 2, Y.weather, z0 + d], { cast: false });
    sink.box(MAT.castIron, [0.02, 0.006, d], [x0, Y.weather, z0 + d / 2], { cast: false });
    sink.box(MAT.castIron, [0.02, 0.006, d], [x0 + w, Y.weather, z0 + d / 2], { cast: false });
  }
}

// ---------------------------------------------------------------------------
// Paint
// ---------------------------------------------------------------------------

/**
 * Bay markings.
 *
 * Drawn as the line between two bays rather than as a rectangle per bay,
 * because that is what is painted: one continuous run down the head of the row
 * and a stub between each pair. Painting closed rectangles is the tell that a
 * car park was drawn by somebody who has never looked down at one.
 */
function bayMarkings(sink: Sink, rng: Rng, stains: THREE.Matrix4[]): void {
  const half = DECK.lineWidth / 2;

  for (const row of BAYS.rows) {
    const head = row.facing === 'west' ? row.x0 : row.x1;
    const tail = row.facing === 'west' ? row.x1 : row.x0;
    const z1 = row.z0 + row.count * DECK.bayWidth;

    // The head line, along the noses of the whole row.
    const hx = head + (row.facing === 'west' ? 0.35 : -0.35);
    paint(sink, MAT.trafficWhite, hx - half, row.z0, hx + half, z1);

    for (let i = 0; i <= row.count; i++) {
      const z = row.z0 + i * DECK.bayWidth;
      paint(sink, MAT.trafficWhite, Math.min(hx, tail), z - half, Math.max(hx, tail), z + half);
    }

    // Radabweiser at the head of each bay, so nobody parks into the parapet.
    for (let i = 0; i < row.count; i++) {
      const z = row.z0 + (i + 0.5) * DECK.bayWidth;
      const x = head + (row.facing === 'west' ? 0.9 : -0.9);
      sink.box(MAT.concreteFair, [0.16, DECK.wheelStopHeight, DECK.wheelStopLength], [x, DECK.wheelStopHeight / 2, z]);

      // Two-thirds of the bays carry a stain. The empty third have been empty
      // long enough for the deck to have been washed under them.
      if (rng() > 0.35) {
        stains.push(
          new THREE.Matrix4()
            .makeScale(range(rng, 0.8, 1.25), 1, range(rng, 0.7, 1.05))
            .setPosition(
              (row.x0 + row.x1) / 2 + jitter(rng, 0.4),
              Y.stain,
              z + jitter(rng, 0.3),
            ),
        );
      }
    }
  }

  // The visitors' bays in the notch, running the other way.
  const n = BAYS.notch;
  const headZ = n.z1 - 0.35;
  paint(sink, MAT.trafficWhite, n.x0, headZ - half, n.x0 + n.count * DECK.bayWidth, headZ + half);
  for (let i = 0; i <= n.count; i++) {
    const x = n.x0 + i * DECK.bayWidth;
    paint(sink, MAT.trafficWhite, x - half, n.z0, x + half, headZ);
  }
  for (let i = 0; i < n.count; i++) {
    const x = n.x0 + (i + 0.5) * DECK.bayWidth;
    sink.box(MAT.concreteFair, [DECK.wheelStopLength, DECK.wheelStopHeight, 0.16], [x, DECK.wheelStopHeight / 2, n.z1 - 0.9]);
  }

  // The accessible bay, nearest the entrance, painted out in blue with its
  // symbol block and the extra transfer width hatched beside it.
  const acc = { x0: n.x0 + 5 * DECK.bayWidth, x1: n.x0 + 6 * DECK.bayWidth };
  paint(sink, MAT.trafficBlue, acc.x0 + 0.1, n.z0 + 0.4, acc.x1 - 0.1, headZ - 0.4, Y.paint + 0.001);
  paint(sink, MAT.trafficWhite, acc.x0 + 0.55, n.z0 + 1.6, acc.x1 - 0.55, headZ - 1.6, Y.paint + 0.002);
}

/**
 * Hatching, arrows and the kerb line.
 *
 * Sperrflächen go wherever a car must not stand but the slab is too valuable to
 * leave unmarked — the corners the fire brigade needs, the strip in front of a
 * stair door. Diagonal, at 45°, and never quite fitting the space they are in.
 */
function hatching(sink: Sink, x0: number, z0: number, x1: number, z1: number): void {
  const w = x1 - x0;
  const d = z1 - z0;
  paint(sink, MAT.trafficWhite, x0, z0, x0 + DECK.lineWidth, z1);
  paint(sink, MAT.trafficWhite, x1 - DECK.lineWidth, z0, x1, z1);
  paint(sink, MAT.trafficWhite, x0, z0, x1, z0 + DECK.lineWidth);
  paint(sink, MAT.trafficWhite, x0, z1 - DECK.lineWidth, x1, z1);

  // Stripes at 45°, each trimmed to the length that keeps it inside the box.
  // Hatching that runs out over its own border is the detail that gives away a
  // painted marking generated rather than set out.
  const step = 0.9;
  for (let t = -d + step; t < w; t += step) {
    const a = [x0 + Math.max(t, 0), z0 + Math.max(-t, 0)] as const;
    const b = [x0 + Math.min(t + d, w), z0 + Math.min(d, w - t)] as const;
    const run = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (run < 0.3) continue;
    const geo = new THREE.PlaneGeometry(run, DECK.lineWidth).rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4()
      .makeRotationY(-Math.atan2(b[1] - a[1], b[0] - a[0]))
      .setPosition((a[0] + b[0]) / 2, Y.paint, (a[1] + b[1]) / 2);
    sink.geo(MAT.trafficWhite, geo, m, { cast: false });
  }
}

/** A directional arrow in the aisle. Two barbs and a shaft, as painted. */
function arrow(sink: Sink, x: number, z: number, yaw: number): void {
  const shaft = new THREE.PlaneGeometry(0.16, 1.6).rotateX(-Math.PI / 2);
  const barb = new THREE.PlaneGeometry(0.16, 0.7).rotateX(-Math.PI / 2);
  const base = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, Y.paint, z);

  sink.geo(MAT.trafficWhite, shaft, base, { cast: false });
  for (const side of [-1, 1] as const) {
    const m = new THREE.Matrix4()
      .makeRotationY(side * 0.6)
      .setPosition(side * 0.2, 0, -0.6)
      .premultiply(base);
    sink.geo(MAT.trafficWhite, barb, m, { cast: false });
  }
}

// ---------------------------------------------------------------------------
// Structures
// ---------------------------------------------------------------------------

/** Anfahrschutz: the red-and-white banded guard on anything a car can hit. */
function bumperGuard(sink: Sink, x: number, z: number): void {
  const bands = 4;
  const h = DECK.bumperHeight / bands;
  for (let i = 0; i < bands; i++) {
    sink.box(i % 2 === 0 ? MAT.hazardRed : MAT.trafficWhite, [0.14, h, 0.14], [x, h / 2 + i * h, z]);
  }
}

/**
 * The stair and lift head-house.
 *
 * In the south-west corner, next to the way into the building rather than out
 * at the far end of the deck — which is where a Parkhaus actually puts its core,
 * because everybody who has parked is walking to the office. It moved there when
 * the ramps arrived: the north-west corner it used to occupy is now the hairpin
 * at the top of the Ausfahrt, and a five-metre concrete box in the apex of the
 * fastest corner on the deck is not a landmark, it is a wall.
 *
 * It is still the tallest thing up here and still throws the long shadow, which
 * is most of what it was ever for. On this corner the shadow falls across the
 * arrival from the notch rather than across the aisle, so the first thing you
 * meet coming out of the building is shade — and the aisle beyond it is in full
 * sun, which is a better order than it was.
 */
function stairHouse(sink: Sink, out: CollisionVolume[]): void {
  const s = DECK_STAIR;
  const W = s.x1 - s.x0;
  const D = s.z1 - s.z0;
  const cx = (s.x0 + s.x1) / 2;
  const cz = (s.z0 + s.z1) / 2;

  sink.box(MAT.concreteFair, [W, s.height, D], [cx, s.height / 2, cz]);
  // Attika around the roof, and the lift overrun standing proud of it.
  sink.box(MAT.concreteFair, [W + 0.16, 0.35, D + 0.16], [cx, s.height + 0.1, cz]);
  sink.box(MAT.concreteFair, [1.9, 1.1, 2.2], [cx + 0.6, s.height + 0.75, cz + 0.9]);

  // The door on the north face, looking at whatever has just come off the notch.
  const doorX = cx + 0.6;
  sink.box(MAT.metal, [1.0, 2.11, 0.06], [doorX, 1.055, s.z0 - 0.03], { cast: false });
  sink.box(MAT.darkMetal, [1.16, 2.24, 0.08], [doorX, 1.12, s.z0 - 0.01], { cast: false });
  sink.box(MAT.exitSign, [FITTINGS.exitSignWidth, FITTINGS.exitSignHeight, 0.02], [doorX, 2.5, s.z0 - 0.05], {
    cast: false,
  });
  // Notice board: Parken auf eigene Gefahr, and the opening times nobody reads.
  sink.box(MAT.paper, [0.3, 0.42, 0.012], [doorX - 1.4, 1.65, s.z0 - 0.04], { cast: false });

  for (const [x, z] of [
    [s.x0 - 0.25, s.z0 - 0.25],
    [s.x1 + 0.25, s.z0 - 0.25],
    [s.x1 + 0.25, s.z1 - 0.6],
  ] as const) {
    bumperGuard(sink, x, z);
  }

  out.push({ label: 'deck.stair', size: [W + 0.2, s.height, D + 0.2], centre: [cx, s.height / 2, cz] });
}

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

/**
 * Mastleuchten, just struck.
 *
 * High-pressure sodium takes several minutes to come up, and at this hour it is
 * still losing badly to the sky — a weak orange smear on a slab that the sun is
 * still painting. Twenty minutes from now it would own the deck. Right now it
 * barely registers, and that is exactly the right amount: it says the building
 * is on a timer, which says somebody runs it, which is the whole trick.
 */
function lighting(sink: Sink, group: THREE.Group, collision: CollisionVolume[]): void {
  // On the bay-row boundaries and along the balustrades, never in an aisle: a
  // mast in a drive lane would be flattened inside a week, which is why no car
  // park has one there. The pair standing against the slots do a second job the
  // others do not — after dark they are the only thing lighting the top of a
  // ramp, which is exactly where you want to know where the edge is.
  const masts: [number, number][] = [
    [5.6, 12.5],
    [5.6, 27.5],
    [15.9, 11.25],
    [15.9, 28.75],
    // Was [30.0, 36.4], which is 140 mm off the centre of the racing line — a mast
    // standing in the aisle, exactly the thing the paragraph above says never happens.
    // It survived that long because it had no collider: a lamp post you drive through
    // is a lamp post nobody reports. Giving the masts collision made it a wall across
    // the lane, so it moves to the south side of the aisle, 2.6 m off the line and
    // clear of the notch bays on the other side.
    [30.0, 33.6],
  ];

  const shaft = new THREE.CylinderGeometry(0.055, 0.075, DECK.lampHeight, 10);
  for (const [x, z] of masts) {
    sink.geo(MAT.darkMetal, shaft, new THREE.Matrix4().setPosition(x, DECK.lampHeight / 2, z));
    sink.box(MAT.darkMetal, [0.42, 0.14, 0.26], [x, DECK.lampHeight + 0.07, z]);
    sink.box(MAT.sodiumLamp, [0.34, 0.05, 0.2], [x, DECK.lampHeight - 0.02, z], { cast: false });
    bumperGuard(sink, x, z + 0.28);

    /*
     * And it is solid, which it was not.
     *
     * Four metres of steel on a concrete base, drawn since the deck was built and
     * collided with by nothing: chairs went through the shaft, through the bumper
     * guard bolted to its foot, and out the other side. It reads as the worst kind
     * of bug — the one where the building is a photograph — and it is worth being
     * clear that this was never an AI problem, however it presents. The computer
     * drivers simply meet these more often than the player does, because their
     * racing line runs down the middle of the aisle the masts stand beside.
     *
     * One box for the shaft and its guard together rather than two: they are 280 mm
     * apart, the guard is 140 mm square, and a chair that fits between them is a
     * chair wedged behind a lamp post for the rest of the lap. 500 mm square from
     * the deck to head height, which is the thing you can actually hit.
     */
    collision.push({
      label: `deck.mast.${x}.${z}`,
      size: [0.5, DECK.lampHeight, 0.5],
      centre: [x, DECK.lampHeight / 2, z + 0.14],
    });

    const lamp = new THREE.PointLight(new THREE.Color(SODIUM.color), SODIUM.intensity, 14, 2);
    lamp.position.set(x, DECK.lampHeight - 0.1, z);
    group.add(lamp);
  }
}

// ---------------------------------------------------------------------------

export type DeckBuild = { collision: CollisionVolume[] };

export function buildDeck(sink: Sink, group: THREE.Group, rooms: readonly Room[], rng: Rng): DeckBuild {
  const collision: CollisionVolume[] = [];
  const stains: THREE.Matrix4[] = [];
  const plates = platesOf(rooms);

  slab(sink, collision, plates, rng);
  weathering(sink, plates, rng);
  bayMarkings(sink, rng, stains);

  // Sperrflächen: in front of the stair door, and across the north-east corner,
  // which is where you come up out of the Einfahrt and where nothing may ever
  // be standing.
  hatching(sink, DECK_STAIR.x0 + 0.3, DECK_STAIR.z0 - 2.4, DECK_STAIR.x1 - 0.3, DECK_STAIR.z0 - 0.3);
  hatching(sink, 20.15, 0.6, 21.15, 3.6);

  // The aisle and the north head, told which way to go. The deck is one-way
  // round the slots now, which is what a Parkhaus with a separate Ein- and
  // Ausfahrt actually is, and the paint has always said so.
  arrow(sink, 8.125, 14.0, 0);
  arrow(sink, 8.125, 26.0, 0);
  arrow(sink, 3.4, 3.0, -Math.PI / 2);
  arrow(sink, 18.125, 3.4, Math.PI / 2);
  arrow(sink, 30.0, 34.0, Math.PI / 2);

  // Entwässerungsrinne down the low point of the aisle. Recessed, with the
  // slab dished either side of it and a cast grating over — a channel drawn
  // flat on the surface reads as a painted stripe, and the whole reason it is
  // legible in life is that the concrete falls into it.
  sink.box(MAT.concrete, [0.42, 0.06, 33.0], [8.125, -0.03, 16.5], { cast: false });
  // Cast iron rather than powder coat: this one stays, because a channel with no
  // grating over it is a trench, but it is the single longest run of metal in the
  // game and it lies down the middle of the racing line. In `darkMetal` it was a
  // 33 m blue stripe under the one camera that never looks away from it.
  for (let z = 0.5; z < 33.0; z += 0.5) {
    sink.box(MAT.castIron, [0.26, 0.02, 0.44], [8.125, Y.joint, z + 0.25], { cast: false });
  }
  // Kerb either side, standing just proud, which is what you actually see.
  for (const s of [-1, 1] as const) {
    sink.box(MAT.concreteFair, [0.08, 0.03, 33.0], [8.125 + s * 0.21, Y.joint, 16.5], { cast: false });
  }
  const gully = new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12);
  for (const [x, z] of [[15.4, 36.0], [33.0, 41.0], [7.0, 40.5]] as const) {
    sink.geo(MAT.castIron, gully, new THREE.Matrix4().setPosition(x, Y.joint, z), { cast: false });
  }

  stairHouse(sink, collision);
  lighting(sink, group, collision);

  // Stains last, as one instanced draw over everything else.
  if (stains.length) {
    const geo = new THREE.PlaneGeometry(2.6, 1.5).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, STAIN, stains.length);
    for (let i = 0; i < stains.length; i++) mesh.setMatrixAt(i, stains[i]!);
    mesh.renderOrder = 1;
    group.add(mesh);
  }

  return { collision };
}
