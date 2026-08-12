/**
 * Empfang.
 *
 * Laid out around the three things that actually determine a reception: where
 * you come in, where you are going, and where the structure is. You arrive from
 * the deck through the west doors, the lifts are in the core wall to the north,
 * the columns march across at 7.5 m centres — and the desk sits between the
 * entrance and the lifts, turned to face the way in, because that is the only
 * arrangement that works and the reason every reception you have walked into is
 * like this.
 *
 * The room is then divided the way a designer divides one: an arrival zone with
 * the matting and the coats, a reception zone screened by the logo wall, a lift
 * lobby against the clad core, and a lounge taking the corner where two glazed
 * walls meet. Each has a different floor, a different height of thing in it and
 * a different reason to be there — which is what stops six hundred square
 * metres of granite reading as a car park with a sofa on it.
 *
 * At this hour the whole of it is full of low sun off a polished floor, which
 * makes it the brightest room on the lap and the reason the grid is here.
 */

import { HALL } from '../metrics';
import { HALL_COLUMNS, type Room } from '../plan';
import * as H from '../props/hall';
import * as S from '../props/shared';
import { facing, place, solid, kicker, seeded, type Dress } from './common';
import { jitter, range, type Rng} from '../rng';
import { matKicker } from '../props/jumps';

export function dressHall(room: Room, out: Dress, rng: Rng): void {
  /*
   * Floor protection over a rolled carpet, on the pit straight.
   *
   * The hall is permanently half-fitted-out — there is a tenant moving in
   * somewhere in this building every week of the year — so a board over a roll
   * of contract carpet is what is actually in the way of the last corner. On the
   * line east of the lifts, at the heading the straight runs: −1.504 rad, which
   * is 6 m of easting to 400 mm of southing.
   */
  kicker(out, matKicker(seeded('hall.kicker')), 'hall.kicker', 51.5, 31.35, -1.504);

  // ---- the screen, and the desk in front of it ------------------------------
  // The logo wall goes on the column line. That is the whole arrangement in one
  // decision: the columns already cut the room in two at Z 33.75, so a wall on
  // that line reads as structure rather than as furniture, and it does the job
  // a reception screen exists to do — you cannot see the lift lobby from the
  // entrance, and you cannot reach the lifts without passing the desk.
  const screenX = 48.75;
  /*
   * 4.6 m rather than the 5.5 it was, and pushed 450 mm south.
   *
   * At 5.5 it reached z 31.0 and the lap's eastbound lane runs at 31.2 — 200 mm
   * off the end of it, which is less than a chair's own radius. The clearance gate
   * has been reporting the line blocked there in three consecutive samples for as
   * long as it has been possible to run it: the screen was not a chicane, it was a
   * wall you drove into every lap and blamed the steering for. It is short enough
   * now to leave 700 mm of daylight, which is what the gate asks for.
   *
   * Its other job is unaffected — the run of planting below closes the column line
   * at this x, and the north end of the screen was never what did that.
   */
  solid(
    out,
    H.logoWall(4.6, 2.5, rng),
    'hall.logo',
    // Local extents, not world ones. `solid` turns the collider by the same yaw
    // it turns the mesh by, so pre-swapping X and Z here *and* passing a quarter
    // turn rotated the box twice: the screen you can see ran along Z and the box
    // that stops you ran along X. You could drive straight through 5.5 m of
    // reception screen, and there was an invisible wall across the hall at right
    // angles to it — which is most of why arriving felt arbitrary.
    [4.6, 2.5, 0.14],
    [screenX, 0, HALL_COLUMNS.z + 0.45],
    Math.PI / 2,
  );

  /*
   * Directly ahead as you come through the doors, and turned to face them. A desk
   * that faces the back of its own lobby is the single most common mistake in a
   * modelled reception and is legible as wrong even to somebody who could not say
   * why — and this one was making it. `facing(w)` answers "which wall is it standing
   * against", so it returns the heading that turns a prop's face *into* the room:
   * `facing('west')` is for something with the west wall behind it. The screen is to
   * the desk's east, so the desk stands against `'east'`, and asking for `'west'` had
   * it looking straight into the back of the logo wall with its transaction shelf
   * pushed 140 mm through it.
   *
   * A metre of clearance rather than the 400 mm it had, too: at 400 the counter body
   * ran to within 10 mm of the screen and the receptionist's side of it was a gap you
   * could not stand in.
   */
  const deskX = screenX - 1.0;
  const deskZ = HALL_COLUMNS.z + 1.9;
  /*
   * The box, in the desk's own frame — which is not the frame it was written in.
   *
   * `receptionDesk()` builds its run along its local **X**: every `part` in it is
   * `[length, …]` wide with the depth carried in Z. The collider was authored the
   * other way round, `[depth, height, length]`, and since `solid` yaws the mesh
   * and the box by the same angle the two ended up crossed at ninety degrees.
   *
   * Measured: 3.70 m of collider running east–west against 3.6 m of counter
   * running north–south. Which means the two ends of the desk — most of it —
   * stopped nothing at all, and there was an invisible 3.6 m wall lying across
   * the visitor side of it instead. Driving through the reception counter was the
   * first thing anybody noticed about this room.
   *
   * It is the same mistake this file already records one paragraph down, where
   * the things standing *on* the desk were laid out in X for an unturned desk and
   * ended up hanging in mid-air over the lift lobby. A turned prop has to be
   * described in its own axes, every time.
   */
  solid(
    out,
    H.receptionDesk(),
    'hall.desk',
    [HALL.deskLength, HALL.deskTransactionHeight, HALL.deskDepth + 0.3],
    [deskX, 0, deskZ],
    facing('east'),
  );

  /*
   * And everything standing on it, offset *along* it.
   *
   * The counter is turned a quarter turn, so its 3.6 m length runs north–south and
   * its 900 mm depth runs east–west. These were written as offsets in X — `deskX +
   * 0.7`, `deskX + 1.2` — which is the layout you would write for an unturned desk,
   * and it put them in a line running across the counter, out through its back and
   * out through the logo wall behind it: a monitor and a stack of paper hanging in
   * mid-air over the lift lobby, 240 mm and 740 mm clear of the wall respectively.
   * That is the one thing in this room that read as a bug rather than as a room.
   *
   * So the two surfaces are named once, in world X, and everything on them varies in
   * Z. `work` is the receptionist's top at 740, on the screen side; `shelf` is the
   * transaction shelf at 1100, on the visitor's.
   */
  const work = deskX + HALL.deskDepth * 0.18;
  const shelf = deskX - HALL.deskDepth / 2 - 0.09;
  // The monitor faces the receptionist, who is facing the doors — so it looks the
  // opposite way to the desk it stands on.
  out.group.add(place(H.flatPanel(), work, HALL.deskWorkHeight, deskZ - 0.9, facing('west') + jitter(rng, 0.2)));
  out.group.add(place(S.mug(rng), work - 0.06, HALL.deskWorkHeight, deskZ - 0.15, 0));
  out.group.add(place(S.paperStack(rng), work + 0.04, HALL.deskWorkHeight, deskZ + 1.05, jitter(rng, 0.4)));
  // The book is read from the visitor's side, so it faces the way they came in.
  out.group.add(place(H.visitorBook(rng), shelf, HALL.deskTransactionHeight, deskZ + 0.5, facing('east')));
  // And the leaflets stand off the visitor's end of the counter, where somebody
  // waiting to be seen can reach them.
  out.group.add(place(H.leafletStand(rng), deskX - 1.5, 0, deskZ - 2.1, facing('east')));

  // ---- arrival --------------------------------------------------------------
  // Everything that belongs to the moment you come through the doors is in the
  // west bay, between the entrance and the first column: coats, umbrellas, the
  // sign, and the lit case that is the first thing to catch the eye. Grouped
  // rather than dotted about, because a lobby reads as designed exactly to the
  // extent that its objects are in families.
  solid(out, H.coatStand(rng), 'hall.coats', [0.55, 1.8, 0.55], [41.6, 0, 41.3]);
  solid(out, H.umbrellaStand(rng), 'hall.umbrellas', [0.3, 0.5, 0.3], [42.4, 0, 41.6]);
  solid(out, H.signTotem(rng), 'hall.totem', [0.44, 1.85, 0.2], [41.4, 0, 34.6], facing('west') + jitter(rng, 0.1));
  solid(out, H.vitrine(rng), 'hall.vitrine', [0.78, 1.8, 0.58], [44.6, 0, 40.6], facing('north') + jitter(rng, 0.1));

  // Belt posts steering arrivals off the entrance axis and toward the desk,
  // set out on the column grid so the run lands square on the screen. They are
  // also, conveniently, a chicane.
  const beltLine: [number, number][] = [
    [42.8, 35.4],
    [44.6, 34.9],
    [46.4, 34.6],
  ];
  beltLine.forEach(([x, z], i) => {
    solid(out, H.beltPost(), `hall.post.${i}`, [0.38, 1.0, 0.38], [x, 0, z]);
    if (i > 0) {
      const [px, pz] = beltLine[i - 1]!;
      const belt = H.belt(Math.hypot(x - px, z - pz));
      out.group.add(place(belt, (x + px) / 2, 0, (z + pz) / 2, Math.atan2(x - px, z - pz)));
    }
  });

  // ---- the lift lobby -------------------------------------------------------
  // Behind the screen, against the clad core, and furnished as its own room: a
  // bench to wait on, the directory, the clock, and a print big enough to be
  // worth looking at for the ninety seconds a lift takes. All four go on the
  // piers between the lift doors, because that is the only wall there is —
  // three 1.1 m openings in a 13.75 m run leaves four clear stretches and
  // nothing may cross one.
  out.group.add(place(H.artwork(1.8, 1.3, rng), 53.9, 1.7, room.z0 + 0.1, facing('north')));
  out.group.add(place(S.wallClock(0.4), 57.25, 2.72, room.z0 + 0.1, facing('north')));
  out.group.add(place(H.directoryBoard(rng), 60.75, 1.55, room.z0 + 0.1, facing('north')));
  solid(out, H.lobbyBench(2.4), 'hall.bench', [2.4, 0.5, 0.5], [57.25, 0, 28.4], facing('north'));
  solid(out, H.newspaperRack(rng), 'hall.papers', [0.5, 1.2, 0.5], [64.6, 0, 28.6]);

  // ---- the lounge -----------------------------------------------------------
  // In the corner where the two glazed walls meet, on a rug, arranged around a
  // table nobody has ever moved. The rug is the whole trick: it makes the
  // seating a room within the room instead of four objects on a stone floor.
  const lx = 60.0;
  const lz = 40.2;
  out.group.add(place(H.rug(4.6, 3.6), lx, 0, lz, 0));
  solid(out, H.sofa(), 'hall.sofa', [HALL.sofaLength, 0.7, HALL.sofaDepth], [lx, 0, lz + 1.5], Math.PI);
  solid(out, H.armchair(), 'hall.armchair.a', [0.8, 0.7, HALL.sofaDepth], [lx - 1.6, 0, lz - 0.1], Math.PI / 2 + jitter(rng, 0.14));
  solid(out, H.armchair(), 'hall.armchair.b', [0.8, 0.7, HALL.sofaDepth], [lx + 1.6, 0, lz - 0.1], -Math.PI / 2 + jitter(rng, 0.14));
  solid(out, H.coffeeTable(rng), 'hall.table', [1.1, 0.42, 0.6], [lx, 0, lz], jitter(rng, 0.06));

  // ---- planting -------------------------------------------------------------
  // A trough along the south glazing rather than pots dotted about, which is
  // both what looks designed and what the maintenance contract is written
  // against. Low, so it screens the floor without blocking the view the glazing
  // was paid for.
  solid(out, H.planterTrough(5.0, rng), 'hall.trough.a', [5.0, 0.5, 0.44], [50.5, 0, room.z1 - 0.55], 0);
  solid(out, H.planterTrough(3.6, rng), 'hall.trough.b', [3.6, 0.5, 0.44], [42.8, 0, room.z1 - 0.55], 0);
  // ---- the median on the column line ---------------------------------------
  //
  // The one piece of dressing in the building that exists for the lap.
  //
  // The hall is driven twice a lap in opposite directions — eastbound along the
  // lift lobby side, then a hairpin inside the east glazing, then westbound down
  // the pit straight and over the line. With the room open in the middle the
  // obvious thing to do on the second pass is cut the diagonal, which arrives at
  // the line from behind, where crossing it counts for nothing. Everybody did it,
  // and it reads as the game being broken rather than as the lap being misread.
  //
  // So the column line is planted, wall to column to column, in three runs whose
  // joints are 50 mm wide: continuous to a chair, and to the eye a normal
  // reception's run of trough between its columns. The columns close the gaps the
  // planting leaves, and the run stops at the last of them — east of x 60 is the
  // hairpin's own space, and closing that would close the lap.
  const median: readonly (readonly [string, number, number])[] = [
    ['w', 46.98, 3.3], // between the west column and the logo wall
    ['a', 50.5, 3.34], // logo wall to the middle column
    ['b', 54.5, 3.4], // and on to the east column in two runs
    ['c', 57.95, 3.4],
  ];
  for (const [id, x, length] of median) {
    solid(out, H.planterTrough(length, rng), `hall.median.${id}`, [length, 0.5, 0.44], [x, 0, HALL_COLUMNS.z]);
  }

  // And one closing the lift lobby's open end, which is what stops the bench
  // reading as a bench somebody left in a car park.
    // Local extents again — the same double-rotation as the logo wall above, and
  // the reason the planter closing the lift lobby could be driven through.
  solid(out, H.planterTrough(2.4, rng), 'hall.trough.c', [2.4, 0.5, 0.44], [52.9, 0, 29.2], Math.PI / 2);

  // Specimen plants at the columns and in the corners, twice the size of the
  // office ones and in proper pots. That difference is doing as much work as
  // the stone floor is.
  for (const [px, pz, scale] of [
    [41.4, 29.0, 1.5],
    [HALL_COLUMNS.xs[1]! - 0.9, HALL_COLUMNS.z + 0.1, 1.3],
    [65.4, 32.2, 1.35],
    [46.6, 41.8, 1.6],
  ] as const) {
    out.dynamic.push({
      label: `hall.plant.${px}`,
      object: S.plant(rng, { scale, smart: true }),
      shape: { kind: 'cylinder', halfHeight: 0.42, radius: 0.24 },
      centreOffset: 0.42,
      mass: 16,
      position: [px, 0, pz],
      yaw: rng() * Math.PI * 2,
      linearDamping: 0.65,
      angularDamping: 0.5,
    });
  }

  // The bin by the desk, which is the only thing in the room that gets used.
  out.dynamic.push({
    label: 'hall.bin',
    object: S.bin(),
    shape: { kind: 'cylinder', halfHeight: 0.15, radius: 0.14 },
    centreOffset: 0.15,
    mass: 1.4,
    position: [deskX - 1.9, 0, deskZ + 0.55],
    yaw: 0,
    linearDamping: 0.25,
    angularDamping: 0.4,
  });

  // A visitor's chair pulled up to the desk and left there, and one of the
  // lobby chairs turned to face the window. The two objects in the room that
  // are where a person put them rather than where the plan put them.
  out.dynamic.push({
    label: 'hall.chair.visitor',
    object: H.armchair(),
    shape: { kind: 'cylinder', halfHeight: 0.35, radius: 0.42 },
    centreOffset: 0.35,
    mass: 22,
    position: [deskX - 1.8, 0, deskZ + 1.9],
    yaw: Math.PI / 2 + range(rng, -0.6, 0.6),
    linearDamping: 0.7,
    angularDamping: 0.8,
  });
}
