/**
 * The canteen.
 *
 * Two zones, and the change of floor finish is where they meet: a wet zone
 * along the south wall where the units are, and a seating zone taking the north
 * glazing. That is not an arbitrary split — a Teeküche goes on the internal
 * wall because that is where the drainage and the extract are, and the tables
 * go at the window because that is the only reason anyone comes in here.
 *
 * The units are set out around the doors, as they have to be: the canteen has a
 * door to the server room in one wall and two openings into the office in
 * another, and a run of kitchen has to fit between them.
 */

import * as THREE from 'three';

import { KITCHEN } from '../metrics';
import type { Room } from '../plan';
import * as K from '../props/kitchen';
// The reception's trough, borrowed: a planter is a planter, and building a second
// one that differed only in which file it lived in would be the worse of the two.
import { planterTrough } from '../props/hall';
import * as S from '../props/shared';
import { facing, place, solid, looseChair, type Dress } from './common';
import { jitter, range, type Rng } from '../rng';

/**
 * A table with its chairs.
 *
 * Chairs are dynamic bodies, and the pattern of which ones are pushed in is
 * where the room's history lives: a table nobody has sat at since Monday has
 * four chairs squared to it, and the one by the window has two pulled out and
 * turned to face each other.
 */
function setting(
  out: Dress,
  x: number,
  z: number,
  kind: 'round' | 'rect',
  rng: Rng,
  label: string,
): void {
  const yaw = jitter(rng, kind === 'round' ? Math.PI : 0.12);
  const table = kind === 'round' ? K.canteenTableRound() : K.canteenTableRect();
  const [w, d] = kind === 'round' ? [KITCHEN.tableRound, KITCHEN.tableRound] : KITCHEN.tableRect;

  solid(out, table, `${label}.table`, [w * 0.92, KITCHEN.tableHeight, d * 0.92], [x, 0, z], yaw);

  // Whether anyone has been at this table today. It changes everything about
  // how the chairs sit, so it is decided once and everything follows.
  const used = rng() > 0.4;
  const seats = kind === 'round' ? 4 : 4;

  for (let i = 0; i < seats; i++) {
    const a = yaw + (i / seats) * Math.PI * 2;
    const reach = kind === 'round' ? w / 2 + 0.34 : (i % 2 === 0 ? d / 2 : w / 2) + 0.34;
    const out_ = used && rng() > 0.55 ? range(rng, 0.2, 0.45) : 0;
    looseChair(
      out,
      K.stackChair(),
      `${label}.chair.${i}`,
      x + Math.sin(a) * (reach + out_),
      z + Math.cos(a) * (reach + out_),
      // Facing the table, plus however far it got turned by whoever left it.
      a + Math.PI + (out_ > 0 ? jitter(rng, 1.1) : jitter(rng, 0.09)),
      6,
      0.27,
    );
  }

  // What is still on the table. A used one has a mug on it; nobody clears up.
  if (used) {
    out.group.add(place(S.mug(rng), x + jitter(rng, 0.2), KITCHEN.tableHeight, z + jitter(rng, 0.2), 0));
    if (rng() > 0.6) {
      out.group.add(place(S.paperStack(rng), x + jitter(rng, 0.25), KITCHEN.tableHeight, z + jitter(rng, 0.25), jitter(rng, 0.8)));
    }
  }
}

export function dressKitchen(room: Room, out: Dress, rng: Rng): void {
  const southWall = room.z1;
  const eastWall = room.x1;
  const runZ = southWall - KITCHEN.baseDepth / 2 - 0.02;

  // ---- the run --------------------------------------------------------------
  // Between the server room door and the office partition. Described the way a
  // fitter would describe it, and it comes to 5.1 m in the 5.65 m of wall there
  // actually is.
  const units: K.Unit[] = [
    { kind: 'drawers', width: 0.6 },
    { kind: 'sink', width: 0.9 },
    { kind: 'dishwasher', width: 0.6 },
    { kind: 'doors', width: 0.6 },
    { kind: 'drawers', width: 0.6 },
    { kind: 'hob', width: 0.9 },
    { kind: 'doors', width: 0.9 },
  ];
  const runWidth = units.reduce((s, u) => s + u.width, 0);
  const runX = 31.1 + runWidth / 2;

  // The run faces into the room, with the wall behind it.
  const wall = facing('south');
  out.group.add(place(K.baseRun(units, rng), runX, 0, runZ, wall));
  out.collision.push({
    label: 'kitchen.run',
    size: [runWidth, KITCHEN.worktopHeight, KITCHEN.baseDepth],
    centre: [runX, KITCHEN.worktopHeight / 2, runZ],
  });

  const wallZ = southWall - 0.05;
  out.group.add(place(K.splashback(runWidth), runX, KITCHEN.worktopHeight, wallZ, wall));
  // Wall units over everything except the hob, where the extract hood goes.
  out.group.add(
    place(
      K.wallRun(2.7, rng),
      runX - runWidth / 2 + 1.35,
      KITCHEN.worktopHeight + KITCHEN.wallUnitClearance,
      southWall - KITCHEN.wallUnitDepth / 2 - 0.02,
      wall,
    ),
  );
  out.group.add(
    place(
      K.wallRun(0.9, rng),
      runX + runWidth / 2 - 0.45,
      KITCHEN.worktopHeight + KITCHEN.wallUnitClearance,
      southWall - KITCHEN.wallUnitDepth / 2 - 0.02,
      wall,
    ),
  );
  // Dunstabzugshaube over the hob, ducted straight up into the ceiling void.
  const hoodX = runX + runWidth / 2 - 1.35;
  const hood = new THREE.Group();
  S.part(hood, S.PROP_MAT.stainless, [0.9, 0.12, 0.5], [0, 0.06, 0], 0.01);
  S.part(hood, S.PROP_MAT.stainless, [0.32, 0.6, 0.32], [0, 0.42, 0.08], 0.008);
  out.group.add(place(hood, hoodX, 1.62, southWall - 0.28, 0));

  // ---- on the worktop -------------------------------------------------------
  const top = KITCHEN.worktopHeight + 0.002;
  out.group.add(place(K.coffeeMachine(), runX - runWidth / 2 + 0.35, top, runZ + 0.08, wall + jitter(rng, 0.14)));
  out.group.add(place(K.kettle(), runX - runWidth / 2 + 0.75, top, runZ + 0.1, jitter(rng, 0.6)));
  out.group.add(place(K.dishRack(rng), runX - runWidth / 2 + 2.15, top, runZ - 0.02, wall + jitter(rng, 0.08)));
  out.group.add(place(K.fruitBowl(rng), runX + 0.4, top, runZ + 0.02, 0));
  for (let i = 0; i < 4; i++) {
    out.group.add(place(S.mug(rng), runX + 1.15 + i * 0.12 + jitter(rng, 0.02), top, runZ + jitter(rng, 0.06), 0));
  }
  out.group.add(place(K.microwave(), runX + runWidth / 2 - 0.45, top, runZ + 0.02, wall + jitter(rng, 0.05)));

  // ---- the tall things ------------------------------------------------------
  // Fridge west of the server room door, where the run cannot go.
  solid(out, K.fridge(), 'kitchen.fridge', [KITCHEN.fridgeWidth, KITCHEN.fridgeHeight, 0.62], [24.4, 0, southWall - 0.34], wall);
  solid(out, K.waterCooler(), 'kitchen.cooler', [0.36, 1.5, 0.36], [23.5, 0, southWall - 0.28], wall + jitter(rng, 0.1));

  // The vending machine on the office partition, between the two openings —
  // which is exactly where a machine goes, because it is the only wall left.
  solid(out, K.vendingMachine(rng), 'kitchen.vending', [0.9, 1.83, 0.8], [eastWall - 0.44, 0, 7.4], facing('east'));

  // Mülltrennung, beside the run where the plates get scraped. West of it, not
  // east: east of the run is 50 mm of wall and then the open-plan office, and
  // the bins have been standing in the partition — and, since the board room's
  // doors moved onto that line, in a doorway — for as long as this floor has
  // existed.
  solid(out, K.binTrio(), 'kitchen.bins', [1.32, 0.7, 0.44], [runX - runWidth / 2 - 0.85, 0, southWall - 0.3], wall + jitter(rng, 0.04));

  // Sprudel: full crates by the cooler, empties stacked beside them. This is
  // the object that most reliably says which country the building is in.
  out.group.add(place(K.crateStack(rng, 3), 22.6, 0, southWall - 0.35, jitter(rng, 0.3)));
  out.group.add(place(K.crateStack(rng, 2), 21.9, 0, southWall - 0.4, jitter(rng, 0.4)));
  out.collision.push({ label: 'kitchen.crates', size: [1.4, 0.9, 0.4], centre: [22.25, 0.45, southWall - 0.37] });

  // ---- the seating ----------------------------------------------------------
  // Along the glazing, which is the only reason anyone comes in here. The
  // spacing leaves the line from the deck door through to the office openings
  // driveable, but not comfortably.
  // Two clusters, north and south of the line from the deck door through to the
  // office opening — which is the line everybody walks anyway, because it is the
  // shortest way from the car park to a desk.
  setting(out, 24.6, 2.6, 'round', rng, 'canteen.a');
  setting(out, 29.2, 2.4, 'round', rng, 'canteen.b');
  setting(out, 33.6, 3.0, 'rect', rng, 'canteen.c');
  setting(out, 23.2, 10.0, 'round', rng, 'canteen.d');
  setting(out, 27.6, 11.2, 'round', rng, 'canteen.e');
  setting(out, 32.2, 11.4, 'rect', rng, 'canteen.f');

  // Spare chairs stacked in the north-west corner, which is what a stacking
  // chair is for. Not at 13.9, where they used to be: that is inside the 3.75 m
  // opening into the west corridor, and a stack of chairs left standing in a
  // corridor mouth is the one thing a Brandschutzbeauftragter would have moved
  // the same afternoon. The corner by the glazing is where they end up instead,
  // which is where every canteen's spare chairs actually are.
  const stack = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const chair = K.stackChair();
    chair.position.y = i * 0.09;
    chair.rotation.y = jitter(rng, 0.03);
    stack.add(chair);
  }
  solid(out, stack, 'kitchen.chairstack', [0.5, 1.0, 0.48], [room.x0 + 0.55, 0, 2.2], jitter(rng, 0.2));

  // ---- the walls ------------------------------------------------------------
  out.group.add(place(K.noticeBoard(1.2, 0.9, rng), 27.6, 1.15, southWall - 0.03, wall));
  out.group.add(place(S.wallClock(0.34), 34.4, 2.2, southWall - 0.03, wall));
  out.group.add(place(K.towelDispenser(), runX - runWidth / 2 - 0.35, 1.25, southWall - 0.07, wall));

  // ---- the opening onto the open-plan --------------------------------------
  //
  // The lap leaves the canteen through the lower of the two openings in the
  // Grossraum partition — 3.75 m of it, at z 9.125 to 12.875 — and 3.75 m is a
  // barn door. You could hold the line you came in on and be through it without
  // touching the throttle, which makes the one doorway on the lap the least
  // interesting thing on it.
  //
  // So the south half is planted. A trough against the jamb takes the opening
  // down to a shade under two metres of clear width, all of it on the north side
  // — which is also the side the route wants, because it turns north the moment
  // it is through. The trough is the building's: it does not move, and hitting
  // it costs you the corner.
  //
  // Planting rather than a bollard because this is a canteen: a trough of low
  // greenery in front of a doorway is what an office does with a doorway it
  // would rather people walked round, and it is the one obstacle on the floor
  // that needed no excuse at all.
  //
  // 1.2 m and no longer, set out off the *line* rather than off the opening: the
  // route crosses the threshold at z 11.0 and a chair is 330 mm in the beam, so
  // anything north of 11.62 is in the way of it. The clearance gate said so on the
  // first attempt — a 1.9 m trough centred in the south half read as generous on
  // the plan and blocked the lap in six consecutive samples.
  //
  // What is left is 2.5 m of clear opening instead of 3.75, with the route down
  // the middle of it: a door you have to aim at rather than a hole you cannot miss.
  solid(out, planterTrough(1.2, rng), 'kitchen.trough.door', [1.2, 0.5, 0.44], [35.85, 0, 12.25], Math.PI / 2);

  // And a specimen in front of it, a metre back into the room, screening the
  // opening from the diagonal you arrive on. Dynamic, and heavy enough to be
  // worth avoiding without being a wall: clipping it costs a tenth, which is
  // the correct price for having taken the inside line too greedily.
  out.dynamic.push({
    label: 'kitchen.plant.door',
    object: S.plant(rng, { scale: 1.45 }),
    shape: { kind: 'cylinder', halfHeight: 0.52, radius: 0.23 },
    centreOffset: 0.52,
    mass: 18,
    position: [34.85, 0, 12.5],
    yaw: rng() * Math.PI * 2,
    linearDamping: 0.65,
    angularDamping: 0.5,
  });

  // A plant on the sill, because somebody always puts one there.
  potted(out, rng, 'kitchen.plant', 35.4, 1.0);

  /*
   * ---- the green edge along the glazing -------------------------------------
   *
   * The north wall is 15 m of window with tables under it, and until now that was
   * all it was: a bright empty strip that made the best-lit room on the floor read
   * as the emptiest. A canteen at a window is exactly where a building's plants
   * end up, for the obvious reason that it is the only place in it with enough
   * light to keep them alive.
   *
   * Troughs rather than pots for the run, because the length is the point — three
   * of them, broken between the table clusters so the wall reads as planted rather
   * than as fenced. They are the building's, so they are static, and they sit
   * 750 mm off the glass with their backs to it: far enough that the seating still
   * works, close enough that nothing on the lap comes near them. The nearest the
   * route ever gets to this wall is z 5.0, four metres south.
   */
  for (const [id, x, length] of [
    ['a', 23.6, 2.4],
    ['b', 28.8, 2.8],
    ['c', 32.6, 1.6],
  ] as const) {
    solid(out, planterTrough(length, rng), `kitchen.trough.glazing.${id}`, [length, 0.5, 0.44], [x, 0, 0.75]);
  }

  // Specimens in the two corners the troughs cannot reach: the north-east, in the
  // blind metre of partition beside the upper opening, and the north-west by the
  // chair stack. Corners are where the big pots go — they are the one place in an
  // open room where a 1.6 m plant is not in somebody's way.
  potted(out, rng, 'kitchen.plant.ne', 35.4, 2.1, 1.5);
  potted(out, rng, 'kitchen.plant.nw', 21.9, 1.3, 1.35);

  // And a pair flanking the doors through to the big meeting room, set outside the
  // 3 m opening so both leaves still swing. Plants beside a door is the oldest
  // move in the office-plant repertoire and it is the reason this pair is here:
  // the doorway needs to read as a doorway from across the room.
  potted(out, rng, 'kitchen.plant.board.w', 22.2, 12.9, 1.2);
  potted(out, rng, 'kitchen.plant.board.e', 25.8, 12.9, 1.2);
}

/**
 * A plant in a pot, standing on the floor and able to be knocked over.
 *
 * Dynamic rather than static, at the same weights as the rest of the floor's
 * greenery: a pot plant that stops a chair dead is a bollard with leaves on, and
 * an office is full of things that give way. The taller ones are heavier and get
 * a taller collider, which is all that separates a desk plant from a ficus.
 */
function potted(out: Dress, rng: Rng, label: string, x: number, z: number, scale = 1): void {
  const half = 0.36 * scale;
  out.dynamic.push({
    label,
    object: S.plant(rng, scale === 1 ? undefined : { scale }),
    shape: { kind: 'cylinder', halfHeight: half, radius: 0.16 * scale },
    centreOffset: half,
    mass: 7 * scale,
    position: [x, 0, z],
    yaw: rng() * Math.PI * 2,
    linearDamping: 0.6,
    angularDamping: 0.5,
  });
}
