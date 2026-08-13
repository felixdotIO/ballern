/**
 * The starting grid.
 *
 * ---- why this is a file and not four numbers in `rivals.ts` ---------------
 *
 * Because three places have to agree about it: the field lines up on it, the
 * player spawns on it, and the player's progress is measured from it for as long
 * as the race has not reached the line yet. Two of those used to disagree, and the
 * disagreement is what this replaces.
 *
 * ---- what was wrong ------------------------------------------------------
 *
 * The field started **in front of the start line** — four chairs standing on the
 * racing side of a chequered band with the player alone behind it. It reads as
 * exactly what it is: not a grid, four chairs that have jumped the start. Nobody
 * lines up past the line in any form of racing, and a player looking at it does
 * not think "interesting design decision", they think the game is broken.
 *
 * It was not, though, an accident, and the reason is worth keeping because it is
 * the constraint this file has to solve rather than ignore: **there is no route
 * behind the line.** The line sits in the hall by the east glazing, two metres
 * from the exit of the hairpin — measured off `ROUTE`, the last 2.01 m before the
 * line run west, and the 1.8 m before *that* run north. A grid laid out backwards
 * along the route puts the second row round a ninety-degree corner facing the
 * wrong way, which is worse than starting up the road. So the field went up the
 * road.
 *
 * ---- what this does instead ----------------------------------------------
 *
 * A grid is not a piece of route. It is a rectangle of floor with slots painted
 * on it, and the only thing it borrows from the track is where the line is and
 * which way the cars point. So that is what this is: **the line's own straight,
 * extended backwards**, with the slots laid on it. The route's corner behind the
 * line is simply not part of the arrangement — the chairs sit on the open floor
 * east of it, square to the line, and drive straight off their slots onto the
 * racing line the moment the flag drops. The tangent at the line is shared, so a
 * chair leaving the grid and a chair on the route are on the same line going the
 * same way: there is no seam to hide.
 *
 * The floor allows it, and only just, which is why the spacing is what it is.
 * Probed against the solver, the open floor behind the line runs clear to about
 * 4.3 m and then hits `facade.east.hall.0` — the east glazing. Three rows at
 * 1.3 m fit in that with half a metre to spare; six chairs would not fit at all,
 * and a row spacing generous enough to look like a Formula One grid would put the
 * back marker through the window.
 */

import { ROUTE } from '../office/plan';

/** A slot: metres behind the line, and metres off its centre. Right is positive. */
export type GridSlot = { readonly back: number; readonly lane: number };

/**
 * The line, as a frame: where it is, the way the race goes, and the way across.
 *
 * Taken off the first two vertices of `ROUTE` rather than written down, because
 * the whole point of the arrangement is that it is square to the racing line. A
 * grid that is three degrees off is not a grid that is three degrees off, it is a
 * grid that looks like a mistake.
 */
const a = ROUTE[0]!;
const b = ROUTE[1]!;
const span = Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Where the flag is, in plan. */
export const LINE: readonly [number, number] = [a[0], a[1]];
/** The direction the race runs at the line, as a unit vector in plan. */
export const RUN: readonly [number, number] = [(b[0] - a[0]) / span, (b[1] - a[1]) / span];
/**
 * Across the line, to the racing right — and it has to be the *route's* right.
 *
 * `rivals.ts` applies a lane offset on the route's own right-hand normal, which
 * for a heading θ measured as `atan2(dx, dz)` is `(cos θ, −sin θ)`. The grid was
 * authored as `(−RUN.z, RUN.x)`, which is that vector negated: the grid's right
 * was the route's left.
 *
 * Which meant the arrangement looked perfect and then came apart at the one
 * moment everybody is watching. A chair holds its slot through the countdown,
 * crosses the line, and on the first frame its progress goes positive the same
 * lane number is suddenly measured the other way round — so it changes sides.
 * Measured, that was a **1.10 m sideways jump in a single frame**, on all four
 * chairs at once, half a second after the flag, against the 0.09 m a chair
 * actually travels in a frame at racing pace. The whole field swapping sides in
 * one frame is what "the riders bug around at the start" was.
 *
 * The slots are a symmetric pair either side of the line, so flipping this
 * changes nothing about how the grid looks — only which chair is on which side,
 * and that it stays there.
 */
export const ACROSS: readonly [number, number] = [RUN[1], -RUN[0]];

/**
 * The heading a chair on the grid faces, in the chair's own yaw convention.
 *
 * `atan2(dx, dz)` is the direction of travel — the same figure `RoutePath.headingAt`
 * reports — and a chair at yaw θ faces (−sin θ, −cos θ), so it is that plus half a
 * turn. Written here once because both the player's spawn and every rival's facing
 * are the same number, and the two of them being derived separately is how a grid
 * ends up with one chair pointing at the window.
 */
export const GRID_YAW = Math.atan2(RUN[0], RUN[1]) + Math.PI;

/**
 * Every slot on the grid, in grid order — P1 first, the back marker last.
 *
 * Two columns, 1.24 m apart, which is a chair and a half: any tighter and the
 * outside two are in the furniture (`hall.armchair.b` is 1.1 m off the line's
 * left at the front of the grid, measured), any wider and the columns are driving
 * into the walls of a hall that is only comfortably four chairs across.
 *
 * Rows rather than a stagger. A staggered grid is the prettier arrangement and it
 * needs a metre more depth than this floor has — and staggering three rows into
 * 4.3 m means row three sits in row one's mirrors rather than beside anybody,
 * which is a queue drawn diagonally. Two clean rows and a back marker is a grid.
 *
 * ---- why this is one list and not four-plus-one -------------------------
 *
 * It was two exports for as long as there was exactly one person on the grid: the
 * four the computer used, and the player's, kept apart because the player's is
 * different — centred, at the back, and the one the character select photographs.
 *
 * That difference is real and it is *positional*, not personal. The back slot is
 * still centred and still the one a portrait is taken in; what has changed is that
 * a person is no longer guaranteed to be the one sitting in it. With up to five
 * people on a grid built for five, "the player's slot" is not a slot, it is a
 * question about the seating — so the geometry is one list and who takes which
 * entry is decided elsewhere.
 *
 * **Five is the ceiling, and it is the floor's, not the code's.** Probed against
 * the solver, the clear run behind the line is about 4.3 m before `facade.east.hall.0`
 * — the east glazing. A sixth slot does not fit behind the fifth and a sixth
 * column does not fit beside the others. Adding one means moving the start line.
 */
export const GRID_SLOTS: readonly GridSlot[] = [
  { back: 1.0, lane: -0.62 },
  { back: 1.0, lane: 0.62 },
  { back: 2.3, lane: -0.62 },
  { back: 2.3, lane: 0.62 },
  { back: 3.5, lane: 0 },
];

/**
 * The back marker, named because two other things point at it.
 *
 * `plan.ts` writes out `SPAWN` as this slot already evaluated — it has to, because
 * that declaration sits above `ROUTE` and half the building is built off it — and
 * its comment says the numbers are `slotAt(PLAYER_SLOT)`. Keeping the name keeps
 * that sentence true. The solo seating in `main.ts` is the other: one person on
 * the grid starts here, which is what makes the opening shot four chair backs
 * ahead of you rather than a rival between you and the lens.
 */
export const PLAYER_SLOT: GridSlot = GRID_SLOTS[GRID_SLOTS.length - 1]!;

/** Where a slot is, in plan. */
export function slotAt(slot: GridSlot): [number, number] {
  return [
    LINE[0] - RUN[0] * slot.back + ACROSS[0] * slot.lane,
    LINE[1] - RUN[1] * slot.back + ACROSS[1] * slot.lane,
  ];
}

/**
 * How far past the line a point on the grid straight is — negative, on the grid.
 *
 * This is what lets the player's distance round the lap be a single number that
 * starts negative and passes through zero at the flag, exactly as the field's
 * does. Measured along the line's own run, so it is the projection of the chair
 * onto the straight rather than a distance from a point: a chair that has drifted
 * 300 mm across its slot has not gained 300 mm of race.
 */
export function progressOnGrid(x: number, z: number): number {
  return (x - LINE[0]) * RUN[0] + (z - LINE[1]) * RUN[1];
}
