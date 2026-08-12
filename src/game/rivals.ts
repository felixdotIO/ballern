/**
 * The other three chairs.
 *
 * ---- why they are on rails ------------------------------------------------
 *
 * A rival here is a position along the lap, not a driver. It does not steer,
 * brake, or read the room; it advances a distance every substep and is put where
 * that distance is. The alternative — running three more copies of the player's
 * driving model against three copies of the player's inputs, produced by some
 * steering controller — is the honest simulation and it is the wrong thing to
 * build for this game, for reasons that are worth writing down because they will
 * come up again:
 *
 *  - The lap is a building. It is 390 m of rooms joined by doorways two and a half
 *    metres wide, with a hairpin in a reception hall and two ramps between floors.
 *    A controller good enough not to get wedged in the meeting-room doorway is most
 *    of a term's work, and one that is *not* good enough does not read as a weak
 *    opponent — it reads as a bug, on screen, for the whole race.
 *  - What a racing game actually needs from an opponent is a pace it can express
 *    as one number, so the race is close. That is exactly what a distance along
 *    the route is, and it is why every arcade racer ever shipped has done some
 *    version of this.
 *  - The route already exists, in three dimensions, with the ramps in it. Driving
 *    it is free. Discovering it is not.
 *
 * What they *do* have is a physical body, kinematic, so the player can hit them.
 * That is the part a rail cannot fake: an opponent you drive through is scenery.
 * They will not be knocked off their line by the contact — a chair on a rail is
 * unmovable, which is not fair, and is exactly how the pace car in every game of
 * this kind behaves.
 *
 * ---- what makes it a race ------------------------------------------------
 *
 * Three things, in order of how much they matter:
 *
 *  1. **They slow down for corners.** Curvature is read off the route ahead and
 *     turned into a speed the way a real corner does it — v² = a·r, against a
 *     lateral-grip figure. Without it they hold one speed round a hairpin that
 *     costs the player two metres a second, which is not a rival, it is a clock
 *     you cannot beat.
 *  2. **They rubber-band, gently.** A rival a long way behind gains a little; one
 *     a long way ahead loses a little. Deliberately weak — 12% either way — so a
 *     good lap still shows on the gap. Rubber-banding hard is the thing players
 *     hate most about arcade racers, and they are right to: it makes the driving
 *     pointless.
 *  3. **They are not identical.** Three base speeds, three lane offsets, three
 *     rates at which they drift across their lane. Two identical opponents read
 *     as one opponent drawn twice.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import { CHAIR } from '../office/metrics';
import type { Physics } from './physics';

/** Same capsule as the player's, for the same reason: it is the same chair. */
const RADIUS = CHAIR.baseDiameter / 2;
const HALF_HEIGHT = 0.22;
const CENTRE_Y = HALF_HEIGHT + RADIUS;

/**
 * The grid, as slots rather than as people.
 *
 * Who sits in them is not this module's business and deliberately so: the field is
 * always *the other characters* — whoever the player did not pick out of the
 * roster — so the names and the paces arrive from outside through `setDrivers`,
 * and what lives here is the part that is about the track. Four slots, because the
 * cast is five.
 *
 * Each slot carries three numbers and they do different jobs:
 *
 *  - `ahead` and `gridLane` are the starting block: metres of route in front of the
 *    line, and how far off the centre of it. Two abreast, two rows, with the player
 *    on the line behind the lot of them.
 *
 *    The player starting *last* is the one decision here worth arguing about, and
 *    two things settle it. The chase camera sits three and a half metres behind the
 *    chair: with the field on the grid behind the player, the opening shot of every
 *    race was four chair backs filling the frame with the player somewhere beyond
 *    them. And the line sits two metres from the exit of the hairpin in the east
 *    glazing, so anything laid out behind it wraps round the corner — the first
 *    attempt had half the field facing north while the front row faced west. Ahead
 *    of the line is six metres of straight, which fits a real two-by-two grid, and
 *    a race you start at the back of is a race with somewhere to go.
 *  - `lane` is where it drives once it is going, which is *not* its grid slot: a
 *    chair that keeps 620 mm of offset all the way round is a chair scraping the
 *    wall through every doorway on the lap.
 *  - `weave` is how much it wanders across its own lane. Three different values so
 *    three chairs in your mirrors are not one object drawn three times.
 */
const SLOTS: readonly { ahead: number; gridLane: number; lane: number; weave: number }[] = [
  // Both columns sit north of the line rather than either side of it, which is also
  // what a real grid does — the slots go on the racing side. Here the reason is the
  // reception lounge: measured, `hall.armchair.a` leaves a slot at +0.52 with 730 mm
  // of room, and a chair whose first act of the race is to hit the furniture is not
  // on a grid, it is parked.
  { ahead: 3.1, gridLane: -0.66, lane: -0.34, weave: 0.11 },
  { ahead: 3.1, gridLane: 0.24, lane: 0.36, weave: 0.19 },
  { ahead: 1.5, gridLane: -0.66, lane: -0.14, weave: 0.07 },
  { ahead: 1.5, gridLane: 0.24, lane: 0.16, weave: 0.14 },
];

/** How many chairs the computer drives. One per slot. */
export const FIELD_SIZE = SLOTS.length;

/** Who is in a slot: a name and a pace, both off the roster. */
export type Driver = { label: string; pace: number };

const TUNING = {
  /*
   * How fast a corner may be taken, as sideways acceleration in m/s².
   *
   * The first attempt scaled the target speed by the radians of heading change
   * over three metres of route, and it was hopeless — measured, the field averaged
   * 2.9 m/s against a 5.5 base, which over a 430 m lap is two and a half minutes
   * and would have had the player lapping all three of them. The reason it fails
   * is that radians-per-metre is not a speed limit: a gentle 20 m sweep and a
   * doorway both produce "some heading change", and the only way to keep the
   * doorway sane is to make the sweep crawl.
   *
   * What a corner actually limits is lateral acceleration: v² = a·r. The route's
   * curvature gives r directly, so this reads as the grip of a castor on loop pile
   * and produces the right answer at both ends — 5.9 m/s through anything of 6 m
   * radius or more, and about 3 through the tightest doorway on the lap.
   */
  cornerGrip: 5.5,
  /** And a floor, in m/s: nothing crawls, however tight the corner. */
  slowestCorner: 2.9,
  /** Metres of route the curvature is read over. */
  lookAhead: 3.5,
  /** Seconds to reach a new target speed. Chairs have no engine; nothing is instant. */
  responds: 0.55,
  /** Fraction of base speed the rubber band may add or take away. */
  band: 0.12,
  /** Metres of gap at which the band is at full stretch. */
  bandFull: 45,
  /** Seconds to drift from a starting block across to a racing line. */
  findsLine: 3.5,
} as const;

/** What the rest of the game can see of one rival. */
export type Rival = {
  readonly label: string;
  /** Where it is now, in world space. */
  readonly position: THREE.Vector3;
  readonly yaw: number;
  readonly speed: number;
  /** 1-based, like the player's. */
  readonly lap: number;
  /** Total route distance covered, so standings are one comparison. */
  readonly progress: number;
  /** True once it has taken the flag. */
  readonly finished: boolean;
  /** Its total time, once it has one. */
  readonly time: number | null;
};

/** The route, as much of it as this needs. `skins/clay/routePath.ts` builds it. */
export type Track = {
  total: number;
  pointAt(s: number, out: THREE.Vector3): THREE.Vector3;
  headingAt(s: number): number;
};

export type Rivals = {
  readonly all: readonly Rival[];
  /** One per rival, to be added to the scene and moved by `update`. */
  readonly objects: readonly THREE.Object3D[];
  /**
   * Advance the field. Call from inside the fixed physics step.
   *
   * `playerProgress` is the player's own total route distance, for the band.
   * `live` is false on the grid, during the countdown and after the flag, and
   * holds everybody exactly where they are.
   */
  update(h: number, live: boolean, playerProgress: number, elapsed: number): void;
  /** Back to the grid. */
  reset(): void;
  /**
   * Put people in the slots.
   *
   * Called whenever the player changes driver, because the field is defined as
   * everyone else: pick the boss and the boss stops being on the grid.
   */
  setDrivers(drivers: readonly Driver[]): void;
  /**
   * The player's position in the field, 1-based.
   *
   * Ties go to the player, which is the convention every racing game uses and the
   * only one that does not read as being robbed.
   */
  placeOf(playerProgress: number): number;
};

type State = {
  slot: (typeof SLOTS)[number];
  driver: Driver;
  /**
   * Total route distance travelled since the world was built, absolute.
   *
   * The one number a rival is. Everything else — where it is, which lap it is on,
   * whether it has finished, where it stands against the player — is read off
   * this, and that is not tidiness, it is the fix for a real bug. The first
   * version kept a distance-along-this-lap and a lap counter, and incremented the
   * counter whenever the distance wrapped past the line. But the grid is three and
   * a half metres *behind* the line, so every rival crossed it six metres into the
   * race and called that lap one complete: the field raced two laps to the
   * player's three and finished a minute early, which is not a difficulty setting,
   * it is a different race.
   *
   * The player's own progress, the way `main.ts` accumulates it, is the same
   * quantity on the same scale — which is what makes the standings a single
   * comparison and the finish the same test for everybody.
   */
  progress: number;
  /** Where that lands on the lap, cached for the geometry. */
  s: number;
  speed: number;
  lane: number;
  phase: number;
  finished: boolean;
  time: number | null;
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  view: Rival;
};

/** Shortest signed angle from a to b. */
function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createRivals(
  physics: Physics,
  track: Track,
  laps: number,
  /** Where the player starts, as a route distance. Everybody lines up behind it. */
  startS: number,
  /** One chair-and-rider per rival, already built by the caller. */
  bodies: readonly THREE.Object3D[],
): Rivals {
  const at = new THREE.Vector3();
  const states: State[] = [];

  SLOTS.forEach((slot, i) => {
    const object = bodies[i];
    if (!object) throw new Error(`grid slot ${i + 1} has no chair to drive`);

    const body = physics.world.createRigidBody(
      // Kinematic: it moves where it is told and nothing the player does changes
      // that. The collider is what makes contact real.
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTRE_Y, 0),
    );
    physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setFriction(0.02).setRestitution(0.15),
      body,
    );

    const view: Rival = {
      label: '',
      position: new THREE.Vector3(),
      yaw: 0,
      speed: 0,
      lap: 1,
      progress: 0,
      finished: false,
      time: null,
    };

    states.push({
      slot,
      driver: { label: '', pace: 5.5 },
      progress: 0,
      s: 0,
      speed: 0,
      lane: slot.gridLane,
      // Staggered so the field does not weave in step, which would read as one
      // object with four parts.
      phase: i * 2.1,
      finished: false,
      time: null,
      body,
      object,
      view,
    });
  });

  /** Put a rival where its distance says, and carry the numbers out to its view. */
  function settle(state: State): void {
    track.pointAt(state.s, at);
    const yaw = track.headingAt(state.s);
    // Across the lane rather than along it: the offset is applied on the route's
    // own right-hand normal, so a rival keeps its side of the corridor through
    // every corner instead of cutting across the line at each change of heading.
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    const sway = state.lane + Math.sin(state.phase) * state.slot.weave;

    const x = at.x + nx * sway;
    const z = at.z + nz * sway;

    state.object.position.set(x, at.y, z);
    // Facing is the route's heading turned to the game's convention: `headingAt`
    // measures the direction of travel, and a chair at yaw θ faces (−sinθ, −cosθ).
    state.object.rotation.y = yaw + Math.PI;
    state.body.setNextKinematicTranslation({ x, y: at.y + CENTRE_Y, z });

    const v = state.view as { -readonly [K in keyof Rival]: Rival[K] };
    v.label = state.driver.label;
    v.position.set(x, at.y, z);
    v.yaw = state.object.rotation.y;
    v.speed = state.speed;
    // One plus the whole lap lengths driven, measured from this chair's own grid
    // slot so a rival three metres up the road is still on lap one. Clamped at the
    // top, or a chair sitting on the flag reports a fourth lap of a three-lap race.
    const driven = state.progress - state.slot.ahead;
    v.lap = Math.min(laps, Math.max(1, 1 + Math.floor(driven / track.total)));
    v.progress = driven;
    v.finished = state.finished;
    v.time = state.time;
  }

  /**
   * The distance at which a race is over.
   *
   * Route distance zero *is* the start line — `ROUTE[0]` is the grid — so the
   * player begins at zero and three laps is three lap lengths, flat. The rivals
   * start on negative progress because their grid slots are a few metres behind
   * the line, which means they cover those few metres extra to see the same flag:
   * that is what a grid position costs, and it falls out of the arithmetic rather
   * than having to be arranged.
   *
   * `race.ts` gates the player's laps by the eleven checkpoints and the finish
   * plane, and `main.ts` accumulates their distance from the same zero, so the two
   * measures agree without either knowing about the other.
   */
  const flagAt = laps * track.total;

  function reset(): void {
    states.forEach((state, i) => {
      // On the grid: behind the line by its own slot's spacing, and off to its own
      // side of it. Measured along the route rather than in the room, so the blocks
      // keep their shape round the corner the start line happens to sit on.
      state.progress = startS + state.slot.ahead;
      state.s = ((state.progress % track.total) + track.total) % track.total;
      state.speed = 0;
      state.lane = state.slot.gridLane;
      state.finished = false;
      state.time = null;
      state.phase = i * 2.1;
      settle(state);
    });
  }

  reset();

  return {
    all: states.map((s) => s.view),
    objects: states.map((s) => s.object),

    update(h, live, playerProgress, elapsed) {
      for (const state of states) {
        if (!live || state.finished) {
          // Still settled every step: a finished rival is parked on the line and a
          // rival on the grid has to be *somewhere*, and both want the same code.
          state.speed = state.finished ? 0 : state.speed;
          settle(state);
          continue;
        }

        // What the route does over the next few metres, as a radius. Read ahead
        // rather than at the wheel: a rival that starts slowing once it is already
        // in the corner is a rival that never makes the corner.
        const turn = Math.abs(
          angleDiff(track.headingAt(state.s), track.headingAt(state.s + TUNING.lookAhead)),
        );
        const corner =
          turn > 1e-3
            ? Math.max(TUNING.slowestCorner, Math.sqrt((TUNING.cornerGrip * TUNING.lookAhead) / turn))
            : Infinity;

        // The band, from the gap in metres of route rather than in seconds: a gap
        // measured in time swings wildly whenever either of you is in a corner.
        const gap = playerProgress - (state.progress - state.slot.ahead);
        const band = 1 + TUNING.band * Math.max(-1, Math.min(1, gap / TUNING.bandFull));

        // The slowest of what it wants, what the corner allows and what the band
        // asks for — and the band is a factor on its own pace, not on the corner's
        // limit, because rubber-banding a chair through a doorway faster than it
        // can hold the line is how a pace car ends up in a wall.
        const target = Math.min(state.driver.pace * band, corner);
        state.speed += (target - state.speed) * Math.min(1, h / TUNING.responds);

        // Off the blocks and onto its racing line over the first few seconds. A
        // chair that snaps from its grid slot to its lane on the first frame of the
        // race is a chair that teleports sideways in front of the player.
        state.lane += (state.slot.lane - state.lane) * Math.min(1, h / TUNING.findsLine);

        state.progress += state.speed * h;
        state.s = ((state.progress % track.total) + track.total) % track.total;
        state.phase += h * (0.7 + state.slot.weave);

        // Its own flag, its own grid slot: a chair that starts three metres up the
        // road has three metres more to cover, so everybody drives the same distance.
        // On a 390 m lap it is worth a third of a second, which is nothing — and
        // being the kind of nothing that is free to get right, it is got right.
        if (state.progress >= flagAt + state.slot.ahead) {
          // Parked on the line with its progress left where it is, so a rival that
          // has finished still outranks everyone still on the last lap.
          state.finished = true;
          state.time = elapsed;
          state.speed = 0;
          state.s = 0;
        }

        settle(state);
      }
    },

    reset,

    setDrivers(drivers) {
      states.forEach((state, i) => {
        // Fewer drivers than slots would leave a nameless chair on the grid, so the
        // list wraps rather than running out. It never should: the roster is one
        // longer than the field by construction.
        state.driver = drivers[i % Math.max(1, drivers.length)] ?? state.driver;
        settle(state);
      });
    },

    placeOf(playerProgress) {
      // Distance driven, not distance along the route: the field starts up the road,
      // so comparing raw route position would have the player last for the whole
      // first lap of a race they were leading.
      let ahead = 0;
      for (const state of states) if (state.progress - state.slot.ahead > playerProgress) ahead++;
      return ahead + 1;
    },
  };
}
