/**
 * What is parked on the deck.
 *
 * A car park at twenty past six on a Friday is about half full, and which half
 * is what tells the story: the bays nearest the building door go first and are
 * emptying first, the far corner by the ramp is still full because those are
 * the people who came in at seven, and there is always one car across two bays.
 *
 * The cars are also the only obstacles out here. Everything else on the deck is
 * paint, so the entire character of the fast section comes from where somebody
 * left a Passat.
 */

import * as THREE from 'three';

import { BAYS, DECK_STAIR, RAMPS } from '../plan';
import { DECK } from '../metrics';
import { MAT } from '../materials';
import * as V from '../props/vehicles';
import { place, solid, kicker, seeded, type Dress } from './common';
import { jitter, pick, range, type Rng} from '../rng';
import { palletKicker } from '../props/jumps';

/** The mix. Silver saloons and estates, with the odd van and small hatch. */
const BODIES: readonly V.Body[] = ['hatch', 'saloon', 'estate', 'saloon', 'estate', 'hatch', 'van'];

/**
 * One parked car.
 *
 * `heading` is the direction the bonnet points. Reversed-in cars are worth the
 * extra line on their own: it is overwhelmingly a German habit, and a car park
 * where every car is nose-in reads as somewhere else.
 */
function park(
  out: Dress,
  rng: Rng,
  label: string,
  x: number,
  z: number,
  heading: number,
  body: V.Body,
): void {
  const car = V.car(rng, body);
  const size = V.carFootprint(body);
  // Nobody parks perfectly square, and nobody parks exactly centred either.
  const yaw = heading + jitter(rng, 0.045);
  out.group.add(place(car, x, 0, z, yaw));

  // A car is a static obstacle: heavy enough that a chair bounces off it, and
  // low enough that it is worth trying to see over.
  out.collision.push({
    label,
    size: [size.width + 0.06, size.height, size.length + 0.06],
    centre: [x, size.height / 2, z],
    yaw,
  });
  return;
}

export function dressDeck(out: Dress, rng: Rng): void {
  /*
   * The delivery ramp, on the walkway the lap crosses westbound.
   *
   * Pallets and a sheet of ply, left where a delivery was dropped and never
   * cleared — which on the open deck is the least remarkable thing that could
   * be lying about. 1.47 rad is the heading of the line here: the route runs
   * from x 20 to x 14 with 600 mm of southing over it, and a ramp square to the
   * world instead of square to the *line* is one a chair hits at an angle and
   * slides off sideways.
   */
  kicker(out, palletKicker(seeded('deck.kicker')), 'deck.kicker', 17.6, 34.95, 1.471);

  // ---- the bay rows ---------------------------------------------------------
  for (const row of BAYS.rows) {
    const cx = (row.x0 + row.x1) / 2;
    // Nose toward the parapet on the west row, toward the building on the
    // centre row. A car's bonnet points -Z when unrotated, so a bay entered
    // from the east needs a quarter turn.
    const nose = row.facing === 'west' ? -Math.PI / 2 : Math.PI / 2;

    for (let i = 0; i < row.count; i++) {
      const z = row.z0 + (i + 0.5) * DECK.bayWidth;
      // The roof-box bay is parked separately, below.
      if (row.id === 'centre' && i === 3) continue;

      // Occupancy falls off toward the building: the near bays have already
      // gone home. This is the one decision that gives the deck its shape.
      const nearness = 1 - Math.abs(z - 20) / 26;
      if (rng() > 0.42 + nearness * 0.34) continue;

      // One in seven has reversed in, and one in fifteen is a hand's width over
      // the line and has annoyed both neighbours.
      const reversed = rng() > 0.86;
      const drift = rng() > 0.93 ? range(rng, 0.4, 0.7) * (rng() > 0.5 ? 1 : -1) : jitter(rng, 0.12);

      park(
        out,
        rng,
        `deck.car.${row.id}.${i}`,
        cx + jitter(rng, 0.15),
        z + drift,
        reversed ? nose + Math.PI : nose,
        pick(rng, BODIES),
      );
    }
  }

  // ---- the visitors' bays ---------------------------------------------------
  // In the notch, by the entrance. Emptier, because visitors leave earlier.
  const n = BAYS.notch;
  for (let i = 0; i < n.count; i++) {
    // The accessible bay stays empty, which is both correct and the most
    // legible way to show that it is one.
    if (i === 5) continue;
    if (rng() > 0.5) continue;
    const x = n.x0 + (i + 0.5) * DECK.bayWidth;
    park(out, rng, `deck.car.notch.${i}`, x + jitter(rng, 0.12), (n.z0 + n.z1) / 2 + 0.35, rng() > 0.8 ? 0 : Math.PI, pick(rng, BODIES));
  }

  // The one with the roof box still on it from the Osterferien. Its bay is
  // parked explicitly rather than left to the occupancy roll — a box floating
  // over an empty bay is the exact failure that comes of decorating a car that
  // may not have been built.
  const boxRow = BAYS.rows[0]!;
  const boxCx = (boxRow.x0 + boxRow.x1) / 2;
  const boxZ = boxRow.z0 + 3.5 * DECK.bayWidth;
  park(out, rng, 'deck.car.roofbox', boxCx, boxZ, Math.PI / 2, 'estate');
  out.group.add(place(V.roofBox(), boxCx, V.carFootprint('estate').height, boxZ, Math.PI / 2));

  // ---- everything else ------------------------------------------------------
  // Traffic cones round the Ausfahrt's mouth, because somebody is always doing
  // something to a Parkhaus ramp — and they are bodies, not scenery. A cone
  // that a chair passes straight through is worse than no cone, and a cone
  // that stops it dead is worse still. Two and a half kilos of hollow plastic
  // is exactly the mass that goes over the bonnet.
  //
  // On the east side of the mouth, not across it: the line into the ramp comes
  // out of the hairpin hard against the west parapet, so a cone three metres to
  // its right is one you can choose to hit. One that had to be avoided would be
  // a chicane, and a chicane made of cones is a chicane somebody can move.
  const mouth = RAMPS[0]!;
  for (const [x, z] of [
    [mouth.x1 + 0.5, 6.6],
    [mouth.x1 + 0.9, 8.2],
    [mouth.x1 + 0.4, 9.8],
    [mouth.x1 + 1.1, 11.4],
  ] as const) {
    out.dynamic.push({
      label: `deck.cone.${x}`,
      object: cone(),
      shape: { kind: 'cylinder', halfHeight: 0.31, radius: 0.18 },
      centreOffset: 0.31,
      mass: 2.5,
      position: [x, 0, z],
      yaw: jitter(rng, 0.6),
      // Barely damped: the whole point of a cone is how far it goes.
      linearDamping: 0.12,
      angularDamping: 0.1,
    });
  }

  // A couple of pallets dumped behind the stair house, waiting for somebody to
  // take them away. Heavy enough to shove rather than launch, which is the other
  // half of the joke — one object that scatters and one that grudgingly slides.
  // Behind the core rather than beside the ramp now: they used to lean on the
  // ramp house, and the ramp house is a hole in the deck.
  for (const [id, x, z, spread] of [
    ['deck.pallet', DECK_STAIR.x1 + 1.05, 39.4, 0.6],
    ['deck.pallet.b', DECK_STAIR.x1 + 1.75, 41.0, 0.8],
  ] as const) {
    out.dynamic.push({
      label: id,
      object: pallet(),
      shape: { kind: 'box', size: [1.2, 0.16, 0.8] },
      centreOffset: 0.08,
      mass: 17,
      position: [x, 0, z],
      yaw: jitter(rng, spread),
      linearDamping: 0.35,
      angularDamping: 0.5,
    });
  }

  // Bicycle stands by the building door, mostly empty because it is Hannover in
  // whatever month has this light and nobody cycles in a suit. Bolted down, so
  // unlike the cones these are something to avoid.
  const rack = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.024, 8, 16, Math.PI), MAT.darkMetal);
    hoop.position.set(0, 0.36, -1.5 + i * 0.75);
    hoop.rotation.y = Math.PI / 2;
    hoop.castShadow = true;
    rack.add(hoop);
  }
  // Against the Gehweg's railing at the north end, by the canteen's fire exit,
  // rather than out in the middle of the old building lane — which is the
  // Einfahrt now, and a bike rack in it would be three metres in the air.
  solid(out, rack, 'deck.bikes', [0.12, 0.72, 3.8], [20.6, 0, 1.6]);
}

/** Leitkegel. Hollow, moulded, and weighted only by its own foot. */
function cone(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.62, 12), MAT.hazardRed);
  body.position.y = 0.31;
  body.castShadow = true;
  g.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.14, 12), MAT.trafficWhite);
  band.position.y = 0.38;
  g.add(band);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.34), MAT.hazardRed);
  base.position.y = 0.015;
  base.castShadow = true;
  g.add(base);
  return g;
}

/** Europalette: nine blocks, three bearers, and boards with gaps between them. */
function pallet(): THREE.Group {
  const g = new THREE.Group();
  const timber = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xa78d63), roughness: 0.95 });

  for (let i = 0; i < 6; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.022, 0.1), timber);
    board.position.set(0, 0.144, -0.4 + i * 0.16);
    board.castShadow = true;
    board.receiveShadow = true;
    g.add(board);
  }
  for (const z of [-0.35, 0, 0.35]) {
    const bearer = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.022, 0.1), timber);
    bearer.position.set(0, 0.022, z);
    g.add(bearer);
    for (const x of [-0.5, 0, 0.5]) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.078, 0.1), timber);
      block.position.set(x, 0.072, z);
      block.castShadow = true;
      g.add(block);
    }
  }
  return g;
}
