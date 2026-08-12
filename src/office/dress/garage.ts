/**
 * What is in the three rooms across the south end of Ebene 5.
 *
 * These are the only spaces on the lap that belong to the car park rather than
 * to the office, and everything in them is chosen to say so. Upstairs every
 * object was specified by somebody: a DIN worksurface, a 5 OH cabinet, a 19"
 * rack. Down here nothing was specified by anybody — it is a sprinkler set the
 * insurer insisted on, a run of mesh cages the letting agent sold as storage,
 * and a bench the caretaker built himself. The difference between a fitted-out
 * building and the space underneath it holding it up is the whole reason the
 * lap comes down here, and it is carried almost entirely by the props.
 *
 * The lap crosses two of these rooms on their diagonals and passes the third,
 * so everything here is placed against a wall or in a corner. That is not a
 * concession to the racing line — it is where this stuff actually goes, because
 * all three rooms have to be walked through by somebody with a trolley.
 */

import * as THREE from 'three';

import { GARAGE } from '../metrics';
import { MAT } from '../materials';
import { GARAGE_COLUMNS, LEVELS, type Room } from '../plan';
import * as V from '../props/vehicles';
import { place, solid, kicker, seeded, type Dress } from './common';
import { jitter, pick, range, type Rng} from '../rng';
import { shelfKicker } from '../props/jumps';

const BASE = LEVELS.garage;

/** Wet concrete. The only reflective floor in the game, and it is a puddle. */
const DAMP = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x2b2a26),
  roughness: 0.16,
  metalness: 0,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});

/** Galvanised mesh. Drawn as a grid of bars, because a texture with holes in it
 *  needs alpha and alpha here would cost more than the bars do. */
const MESH = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8d9094), roughness: 0.55, metalness: 0.6 });

/** Sprinkler red. RAL 3000, and the only saturated colour on the level. */
const PIPE = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x8e1f1c), roughness: 0.42, metalness: 0.3 });

/** Somebody's stored junk, in the four colours junk comes in. */
const JUNK = [0x6d6152, 0x8a7a5f, 0x4a5560, 0x7a4c3c].map(
  (c) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: 0.9 }),
);

// ---------------------------------------------------------------------------
// 5.01 Sprinklerzentrale
// ---------------------------------------------------------------------------

/**
 * The sprinkler set: tank, riser, valve station, and the pipework off it.
 *
 * Seen through a louvred door for about a second and a half a lap, which is
 * exactly as long as it needs to be. What has to read in that second is the
 * colour and the verticality — a wall of red standing pipes lit by one batten —
 * and nothing else in the room has to survive being looked at.
 */
function plantRoom(room: Room, out: Dress, rng: Rng): void {
  const g = new THREE.Group();

  // Vorratsbehälter: the tank, on its plinth against the back wall.
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.9, 20), MAT.metal);
  tank.position.set(0, 1.15, 0);
  tank.castShadow = true;
  g.add(tank);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.metal);
  dome.position.set(0, 2.1, 0);
  g.add(dome);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.2, 2.0), MAT.concreteFair);
  plinth.position.set(0, 0.1, 0);
  g.add(plinth);
  solid(out, g, 'garage.plant.tank', [2.0, 2.3, 2.0], [room.x1 - 1.3, BASE, room.z1 - 1.4]);

  // The riser and the valve station beside it: standing pipes, a horizontal
  // main, gate valves with their handwheels, and the gauges.
  const set = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.3, 10), PIPE);
    riser.position.set(-0.9 + i * 0.45, 1.15, 0);
    riser.castShadow = true;
    set.add(riser);

    if (i % 2 === 0) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 6, 14), MAT.darkMetal);
      wheel.position.set(-0.9 + i * 0.45, 1.35, 0);
      wheel.rotation.y = Math.PI / 2;
      set.add(wheel);
    }
  }
  const main = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 2.4, 10), PIPE);
  main.rotation.z = Math.PI / 2;
  main.position.set(0, 2.05, 0);
  set.add(main);
  // The gauge board, which is the one thing in the room with any white on it.
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.03), MAT.paper);
  board.position.set(0, 1.75, -0.2);
  set.add(board);
  solid(out, set, 'garage.plant.valves', [2.6, 2.4, 0.5], [room.x0 + 1.5, BASE, room.z0 + 1.1]);

  // The distribution overhead, running out of the room and away down the level.
  // It is the reason the room exists and the only part of it seen from outside.
  const height = GARAGE.clearHeight - 0.45;
  for (const x of [room.x0 + 0.8, room.x0 + 1.2]) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, room.z1 - room.z0 - 0.4, 8), PIPE);
    run.rotation.x = Math.PI / 2;
    run.position.set(x, BASE + height, (room.z0 + room.z1) / 2);
    run.castShadow = true;
    out.group.add(run);
  }
  // Hangers, at the spacing pipework of that diameter is actually hung at.
  for (let z = room.z0 + 0.9; z < room.z1 - 0.5; z += 1.8) {
    const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.04), MAT.darkMetal);
    hanger.position.set(room.x0 + 1.0, BASE + height + 0.09, z);
    out.group.add(hanger);
  }

  // A pump skid, a pallet of spare heads and a bucket in the corner, because a
  // plant room with only plant in it is a diagram.
  const skid = new THREE.Group();
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.55, 12), MAT.darkMetal);
  motor.rotation.z = Math.PI / 2;
  motor.position.set(0, 0.42, 0);
  skid.add(motor);
  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.5), MAT.darkMetal);
  bed.position.set(0, 0.07, 0);
  skid.add(bed);
  solid(out, skid, 'garage.plant.pump', [1.2, 0.7, 0.6], [room.x0 + 1.4, BASE, room.z1 - 1.5], jitter(rng, 0.05));
}

// ---------------------------------------------------------------------------
// 5.02 Mieterabteile
// ---------------------------------------------------------------------------

/** One cage: a frame, mesh on the faces that show, and whatever is in it. */
function cage(rng: Rng, width: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const h = 2.0;

  for (const [x, z] of [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [-width / 2, depth / 2],
    [width / 2, depth / 2],
  ] as const) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, h, 0.05), MAT.darkMetal);
    post.position.set(x, h / 2, z);
    post.castShadow = true;
    g.add(post);
  }

  // Mesh on the aisle face only. The other three are against neighbours or the
  // wall and cannot be seen into, so drawing them is bars nobody looks through.
  for (let y = 0.12; y < h; y += 0.16) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.012), MESH);
    bar.position.set(0, y, -depth / 2);
    g.add(bar);
  }
  for (let x = -width / 2 + 0.16; x < width / 2; x += 0.16) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, 0.012), MESH);
    bar.position.set(x, h / 2, -depth / 2);
    g.add(bar);
  }
  // The top, which is what makes it a cage rather than a fence.
  for (let z = -depth / 2 + 0.2; z < depth / 2; z += 0.25) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.012, 0.012), MESH);
    bar.position.set(0, h, z);
    g.add(bar);
  }

  // What is in it. Boxes stacked badly, and one thing that is not a box.
  const stack = Math.round(range(rng, 2, 6));
  for (let i = 0; i < stack; i++) {
    const w = range(rng, 0.35, 0.62);
    const d = range(rng, 0.3, 0.5);
    const t = range(rng, 0.24, 0.42);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), pick(rng, JUNK));
    box.position.set(jitter(rng, width / 2 - 0.45), t / 2 + i * 0.34, jitter(rng, depth / 2 - 0.35));
    box.rotation.y = jitter(rng, 0.25);
    box.castShadow = true;
    g.add(box);
  }
  if (rng() > 0.55) {
    // A wheel leaning against the mesh, which is the single most legible object
    // you can put in a storage cage.
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.075, 8, 18), MAT.rubber);
    wheel.position.set(jitter(rng, 0.3), 0.33, -depth / 2 + 0.16);
    wheel.rotation.set(0.22, 0, 0);
    wheel.castShadow = true;
    g.add(wheel);
  }
  return g;
}

/**
 * The cage store.
 *
 * Two runs of mesh with a lane between them, and the lane is the room. It is
 * 1.6 m wide against the 6.25 m of the space, which is the tightest thing on the
 * lap after the doorways upstairs — and unlike a doorway it is tight for eight
 * metres. The lap crosses it corner to corner, so the runs are set out to leave
 * that diagonal and nothing else.
 */
function cageStore(room: Room, out: Dress, rng: Rng): void {
  const w = 1.45;
  const d = 1.3;

  // Three runs, on the three walls the lap does not use, leaving the diagonal
  // from the north-west opening to the south-east one. The first setting-out of
  // this put four cages along the south wall and the last of them stood squarely
  // in the exit — the clearance gate reported the lap blocked for nine
  // consecutive samples, which is exactly the failure that gate exists for and
  // exactly the one nobody spots by looking at the room.
  //
  // Size stays in each cage's own frame and the yaw turns the collider with it,
  // so the box and the mesh can never disagree about which way round it is.
  const runs: [string, number, number, number][] = [
    // South wall, stopping well short of the corner the lap leaves by.
    ['s0', 11.85, room.z1 - 0.8, Math.PI],
    ['s1', 13.4, room.z1 - 0.8, Math.PI],
    // West wall, against the plant room, turned through a right angle — which
    // is what makes the lane a diagonal rather than a corridor.
    ['w0', room.x0 + 0.8, 38.6, -Math.PI / 2],
    ['w1', room.x0 + 0.8, 40.15, -Math.PI / 2],
    // And one on the north wall, east of the way in, so the entry is a gap
    // between two cages rather than an open end.
    ['n0', 15.4, room.z0 + 0.8, 0],
  ];

  for (const [id, x, z, yaw] of runs) {
    solid(out, cage(rng, w, d), `garage.store.cage.${id}`, [w + 0.06, 2.0, d], [x, BASE, z], yaw);
  }

  // A bin bag and a broken chair left in the lane, because they always are —
  // and dynamic, so the first lap moves them and the second is a different room.
  out.dynamic.push({
    label: 'garage.store.bag',
    object: (() => {
      const g = new THREE.Group();
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), MAT.darkMetal);
      bag.scale.set(1, 0.8, 1);
      bag.position.y = 0.24;
      bag.castShadow = true;
      g.add(bag);
      return g;
    })(),
    shape: { kind: 'cylinder', halfHeight: 0.24, radius: 0.28 },
    centreOffset: 0.24,
    mass: 3.5,
    position: [12.0, BASE, 39.8],
    yaw: jitter(rng, 0.8),
    linearDamping: 0.5,
    angularDamping: 0.6,
  });
}

// ---------------------------------------------------------------------------
// 5.03 Waschbox / Hausmeister
// ---------------------------------------------------------------------------

/**
 * The wash bay and the caretaker's bench, in one room because that is how a
 * Parkhaus of this age does it.
 *
 * The floor falls to a gully in the middle and has never been dry, which makes
 * it the only reflective surface in the game — worth having for one corner
 * because a wet floor under a sodium batten does something no dry floor can, and
 * because it is the last thing you cross before the climb.
 */
function washBox(room: Room, out: Dress, rng: Rng): void {
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // The fall, the gully, and the standing water round it.
  const wet = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.6), DAMP);
  wet.rotation.x = -Math.PI / 2;
  wet.position.set(cx + 0.2, BASE + 0.012, cz + 0.5);
  wet.renderOrder = 1;
  out.group.add(wet);

  const gully = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 12), MAT.darkMetal);
  gully.position.set(cx + 0.2, BASE + 0.015, cz + 0.5);
  out.group.add(gully);

  // Werkbank against the back wall, with the shelf over it and the pegboard the
  // caretaker drew round his own spanners on.
  const bench = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.62), MAT.melamine);
  top.position.y = 0.87;
  top.castShadow = true;
  bench.add(top);
  for (const x of [-1.0, 1.0]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.85, 0.55), MAT.darkMetal);
    leg.position.set(x, 0.43, 0);
    bench.add(leg);
  }
  // Lochplatte over the bench, and small: a full-width board is a blank panel
  // catching the sunset, which is what the first pass of this looked like.
  const pegboard = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.02), MAT.darkMetal);
  pegboard.position.set(-0.1, 1.36, -0.29);
  bench.add(pegboard);
  for (let i = 0; i < 6; i++) {
    const tool = new THREE.Mesh(new THREE.BoxGeometry(0.035, range(rng, 0.2, 0.34), 0.02), MAT.stainless);
    tool.position.set(-0.52 + i * 0.17, 1.4, -0.26);
    bench.add(tool);
  }
  solid(out, bench, 'garage.wash.bench', [2.3, 1.95, 0.7], [cx + 0.35, BASE, room.z1 - 0.55]);

  // The hose reel on the wall, which is the object that says "wash bay" on its
  // own and the reason the room is called what it is.
  const reel = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16), MAT.hazardRed);
  drum.rotation.z = Math.PI / 2;
  reel.add(drum);
  const hose = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 18), MAT.darkMetal);
  hose.rotation.y = Math.PI / 2;
  reel.add(hose);
  reel.position.set(room.x1 - 0.35, BASE + 1.55, room.z0 + 1.3);
  out.group.add(reel);

  // Shelving in the corner: Streugut for the winter, and screenwash.
  const rack = new THREE.Group();
  for (let s = 0; s < 3; s++) {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.42), MAT.metal);
    shelf.position.set(0, 0.42 + s * 0.55, 0);
    shelf.castShadow = true;
    rack.add(shelf);
    for (let i = 0; i < 3; i++) {
      const tub = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.24), pick(rng, JUNK));
      tub.position.set(-0.3 + i * 0.3, 0.6 + s * 0.55, jitter(rng, 0.05));
      tub.rotation.y = jitter(rng, 0.2);
      rack.add(tub);
    }
  }
  solid(out, rack, 'garage.wash.rack', [1.0, 1.9, 0.5], [room.x0 + 0.75, BASE, room.z1 - 0.7]);

  // And the wheelie bin, which is the best thing in the room because it is the
  // one thing in it that moves.
  const bin = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.92, 0.72), MAT.darkMetal);
  body.position.y = 0.52;
  body.castShadow = true;
  bin.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.74), MAT.plastic);
  lid.position.y = 1.0;
  bin.add(lid);
  out.dynamic.push({
    label: 'garage.wash.bin',
    object: bin,
    shape: { kind: 'box', size: [0.58, 1.02, 0.72] },
    centreOffset: 0.51,
    mass: 11,
    position: [room.x0 + 1.0, BASE, room.z0 + 1.15],
    yaw: jitter(rng, 0.5),
    linearDamping: 0.28,
    angularDamping: 0.4,
  });
}

// ---------------------------------------------------------------------------


/**
 * The waist: what stands between the two lanes of Ebene 5.
 *
 * This level was bare on purpose and the note left here said what belonged in it
 * next — a row of parked cars on the column line. It is not decoration. The lap
 * comes north up the out lane at x 7.8 and goes back south down the back lane at
 * x 13.9, and between the two there were twenty-three metres of open concrete: a
 * chair could leave one lane at any point, cross in a second and a half, and
 * rejoin the other having skipped the whole north sweep. A one-way car park with
 * nothing down the middle of it is not a one-way car park.
 *
 * So the middle is parked, in the pattern the waist of a Mittelgarage actually
 * fills up in: cars nose-to-tail along the column line, and whatever the
 * caretaker has put down in the leftovers between them and the columns.
 *
 * It is deliberately not sealed. Two of the three column bays keep a metre and a
 * half of daylight beside the column — enough to thread at speed if you know it
 * is there and pick the line up early, and not nearly enough to blunder through.
 * Making the cut *impossible* would have been one line shorter and would have
 * thrown away the most interesting decision on the level; making it *expensive*
 * is the whole job.
 *
 * Everything here is static. A parked car that shifts when a chair hits it is a
 * chair that has just found a way through the row.
 */
function parkingWaist(out: Dress, rng: Rng): void {
  /** Down the column line, which is where a central row parks. */
  const line = GARAGE_COLUMNS.x;

  const park = (label: string, z: number, nose: number, body: V.Body): void => {
    const car = V.car(rng, body);
    const size = V.carFootprint(body);
    // Nobody in a Parkhaus parks square, and the ones in the middle — where
    // there are no bay lines at all — are the worst of them.
    const yaw = nose + jitter(rng, 0.06);
    const x = line + jitter(rng, 0.18);
    out.group.add(place(car, x, BASE, z, yaw));
    out.collision.push({
      label,
      size: [size.width + 0.06, size.height, size.length + 0.06],
      centre: [x, BASE + size.height / 2, z],
      yaw,
    });
  };

  // Nose-to-tail up the line, alternating which way they came in, and set out
  // around the three columns rather than through them. The two gaps left are at
  // the middle and north columns, which is where the row would break anyway:
  // nobody parks tight against a column they have to open a door beside.
  park('garage.car.a', 9.0, 0, 'estate');
  park('garage.car.b', 13.7, Math.PI, 'hatch');
  park('garage.car.c', 21.4, 0, 'hatch');
  park('garage.car.d', 28.9, Math.PI, 'estate');

  // And the leftovers. A pallet stack in the bay south of the middle column, and
  // the drums that have been outside the plant room since the last service — both
  // of them things a caretaker puts in the one part of a car park nobody parks
  // in, and both of them narrow enough to leave the gaps worth aiming for.
  const stack = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.8), MAT.melamine);
    board.position.y = 0.08 + i * 0.15;
    board.castShadow = true;
    board.receiveShadow = true;
    stack.add(board);
  }
  const wrapped = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.72), MAT.plastic);
  wrapped.position.y = 0.62 + 0.25;
  wrapped.castShadow = true;
  stack.add(wrapped);
  solid(out, stack, 'garage.pallets', [1.24, 1.4, 0.84], [line - 0.2, BASE, 16.9], jitter(rng, 0.12));

  const drums = new THREE.Group();
  for (const [dx, dz] of [
    [-0.34, -0.3],
    [0.32, -0.24],
    [-0.02, 0.34],
  ] as const) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 14), MAT.hazardRed);
    drum.position.set(dx, 0.44, dz);
    drum.castShadow = true;
    drum.receiveShadow = true;
    drums.add(drum);
    for (const ry of [0.24, 0.64] as const) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 6, 16), MAT.darkMetal);
      rib.rotation.x = Math.PI / 2;
      rib.position.set(dx, ry, dz);
      drums.add(rib);
    }
  }
  solid(out, drums, 'garage.drums', [1.3, 0.9, 1.3], [line + 0.15, BASE, 24.2], jitter(rng, 0.3));
}

export function dressGarage(room: Room, out: Dress, rng: Rng): void {
  switch (room.id) {
    case 'garage.plant':
      return plantRoom(room, out, rng);
    case 'garage.store':
      return cageStore(room, out, rng);
    case 'garage.wash':
      return washBox(room, out, rng);
    default:
      parkingWaist(out, rng);
      /*
       * The shelving unit, halfway down the back lane.
       *
       * The lane is the longest straight on the lap — eighty metres of it, one
       * heading, nothing to do but hold the throttle — so it is where a jump is
       * worth the most. Heading π: southbound, which is the direction the lap
       * runs here. On the level below the office, so it is placed on the deck's
       * own floor rather than on zero.
       */
      kicker(out, shelfKicker(seeded('garage.kicker')), 'garage.kicker', 13.9, 19.0, Math.PI, LEVELS.garage);
      return;
  }
}
