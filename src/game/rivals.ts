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
import { ACROSS, LINE, RUN, type GridSlot } from './grid';
import type { Physics } from './physics';

/** Same footprint as the player's, for the same reason: it is the same chair. */
const RADIUS = CHAIR.baseDiameter / 2;

/**
 * But taller than the player's, because it has to include the person in it.
 *
 * The player's capsule is sized off the five-star base and stops at 1.1 m, which
 * is the right shape for the thing it does — deciding whether a chair fits through
 * a doorway, where the rider is irrelevant because he is directly above the base.
 * A rival's collider has a second job the player's does not: it is what the chase
 * camera's occlusion ray hits, and *that* question is about the whole silhouette.
 *
 * At 1.1 m the ray flew straight over the top of it. The lens then arrived, at
 * about 1.4 m, exactly where the rider's head is drawn — measured, 140 mm from
 * the middle of it, which on screen is the inside of a skull. The capsule was
 * reporting a chair where the player could see a person.
 *
 * 1.5 m tall, then: an office chair with somebody sitting on it. The footprint is
 * untouched, so nothing about driving into one changes — only what it blocks.
 */
const RIDER_HALF = 0.42;
const CENTRE_Y = RIDER_HALF + RADIUS;

/**
 * The grid, as slots rather than as people.
 *
 * Who sits in them is not this module's business and deliberately so: the field is
 * always *the other characters* — whoever the player did not pick out of the
 * roster — so the names and the paces arrive from outside through `setDrivers`,
 * and what lives here is the part that is about the track.
 *
 * The starting blocks themselves are not here either any more. They are in
 * `grid.ts`, because the player stands on the same grid and the two arrangements
 * being authored separately is what produced the thing that file exists to undo:
 * a field lined up in front of the start line. What is left here is the part that
 * is about *driving*:
 *
 *  - `lane` is where it drives once it is going, which is **not** its grid slot: a
 *    chair that keeps 620 mm of offset all the way round is a chair scraping the
 *    wall through every doorway on the lap.
 *  - `weave` is how much it wanders across its own lane. Different per slot so
 *    three chairs in your mirrors are not one object drawn three times.
 */
const SLOTS: readonly { lane: number; weave: number }[] = [
  { lane: -0.34, weave: 0.11 },
  { lane: 0.36, weave: 0.19 },
  { lane: -0.14, weave: 0.07 },
  { lane: 0.16, weave: 0.14 },
];

/**
 * The most chairs the computer can drive — one per driving slot above.
 *
 * A ceiling now rather than a count. How many it *actually* drives is however many
 * of the five grid slots no person took, which is decided in a lobby and passed to
 * `createRivals` as bodies and grid slots. Four is still the number in a solo race,
 * because a solo race is one person and five slots.
 */
export const MAX_RIVALS = SLOTS.length;

/**
 * The four axes a computer driver is made of. All 0…1 except `nerve`.
 *
 * Deliberately not independent-but-equivalent: `nerve` and `bold` make a driver
 * faster *and* more likely to throw it away, `flow` and `steady` make one slower on
 * paper and better at actually being there at the end. A field is interesting when
 * it is spread across that trade rather than along it — which is the whole reason
 * this type exists. Separated only by top speed, four opponents are one driver at
 * four volumes: same corner, same speed, same line, and the race is a queue in pace
 * order. The values live on the roster in `garage.ts`, because being the sort of
 * driver who brakes early is a fact about the boss, not about grid slot three.
 */
export type DriverCharacter = {
  /**
   * Corner speed, as a multiplier on the grip everybody else gets: 0.9 is braking
   * for things that do not need braking for, 1.15 is carrying it into the doorway
   * and being right about it.
   */
  nerve: number;
  /**
   * Appetite for a pass. Low sits in the queue and waits for the straight; high
   * pulls out the moment there is a gap, and sometimes when there is not.
   */
  bold: number;
  /**
   * Tidiness. High holds one line; low wanders across its lane and arrives at
   * corners at slightly the wrong angle.
   */
  flow: number;
  /**
   * Whether the pace is the same on lap three as on lap one. Low fades and surges;
   * high is a metronome.
   */
  steady: number;
};

/** What the field needs to know about the player to race them. */
export type PlayerOnTrack = {
  /** Distance driven, on the same scale as a rival's. */
  progress: number;
  /** Metres off the racing line, right positive — the same frame a rival's lane is in. */
  lane: number;
  speed: number;
};

/** Who is in a slot: a name, a pace and a character, all three off the roster. */
export type Driver = { label: string; pace: number; drive: DriverCharacter };

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

  /**
   * The difficulty of the whole field, as one factor on every driver's pace.
   *
   * ---- why this exists, and why it is 0.84 ---------------------------------
   *
   * The roster's paces are *characterisation*: the sales guy is quicker than the
   * new one because of who they are, and the 700 mm a second between the fastest
   * and the slowest is the shape of the field. None of that says how hard the race
   * should be, and it was doing both jobs — so the only way to make the game
   * winnable was to rewrite seven lines of prose about people.
   *
   * Difficulty belongs in one number, and this is it. Measured at 1.0, timed over
   * three laps with nobody in their way, the field laps in **85.7–87.7 s**. The
   * lap is 389 m and the player's absolute top speed is 6.0 m/s, so 86 s is an
   * average of 4.53 m/s — which means holding 75% of a flat-out sprint for the
   * whole lap, through eleven doorways, a hairpin, two ramps and whatever is being
   * thrown at you, without touching anything. A chair on rails can do that. Nobody
   * driving can, and a player who is never once in front is not racing, they are
   * watching. It is the whole of why the position readout said 5/5 all race, long
   * after the arithmetic behind it was right.
   *
   * 0.84 puts the field at about 102–104 s a lap, which leaves a clean lap ahead
   * of them and a scrappy one behind — the race being close is what the rubber
   * band is then for, and it cannot do that job from twenty seconds down.
   *
   * This is the difficulty dial. Raise it for a harder field; the shape of the
   * roster does not change.
   */
  paceScale: 0.84,

  /**
   * Fraction of base speed the rubber band may add or take away.
   *
   * Was 0.12, on the argument at the top of this file that rubber-banding hard is
   * the thing players hate most about arcade racers. That argument is right and it
   * assumed a field the player could live with in the first place. Against a field
   * twenty seconds a lap quicker, a 12% band is not restraint, it is a rounding
   * error on a race that was already over — the gap it is meant to close opens
   * faster than it can pull.
   *
   * 0.18 with the pace above is still gentle: a rival 45 m clear gives back under
   * a metre a second, so a good lap still shows on the gap and the field never
   * reels you in for free. It is enough that one bad corner is not the race.
   */
  band: 0.18,
  /** Metres of gap at which the band is at full stretch. */
  bandFull: 45,
  /** Seconds to drift from a starting block across to a racing line. */
  findsLine: 3.5,

  /*
   * ---- being hit -----------------------------------------------------------
   *
   * A rival cannot be knocked off its line, and that is the price of the rail —
   * see the note at the top of this file. What it can be is *stopped*, and that
   * turns out to be the same thing where it counts: a chair held at a standstill
   * for a second and a quarter loses six or seven metres of route to everybody
   * still moving, which is exactly what a spin-out costs the player.
   *
   * 9 m/s² brings one from racing pace to nothing in about six tenths, so the
   * back half of a hit is spent stationary rather than trickling.
   */
  stunBrake: 9,
  /** Spun at the same rate the player is, for the same reasons. */
  stunSpin: 9,
  /** What a faceful of extinguisher powder costs, as a factor on pace. */
  blindPace: 0.74,
} as const;

/**
 * Traffic, which is the difference between four opponents and four ghosts.
 *
 * Everything above is a rival against the clock. None of it says what happens when
 * one of them catches another, and what happened was nothing: they are on separate
 * rails, so a faster chair simply advanced *through* a slower one — two chairs in
 * the same cubic metre, one head sticking out of the other's back, for as long as
 * it took to get past. It is the single dumbest thing the field did, it happened in
 * every race, and it happened directly in front of the player because the player is
 * behind all of them at the start.
 *
 * So a rival now looks up the road, finds whoever is in its way, and does one of two
 * things about it: goes round, or sits behind. Which one is what `bold` chooses.
 */
const TRAFFIC = {
  /** How far ahead a chair looks for someone in its way, metres. */
  sees: 7,
  /**
   * And how far ahead somebody has to actually *be* to count as being ahead.
   *
   * ---- the grid deadlock ---------------------------------------------------
   *
   * This was `gap <= 0` — anything up the road at all is traffic — and it has one
   * fixed point that a chair can never drive out of.
   *
   * Everything on the grid starts at `driven === 0` exactly: `reset` sets
   * `progress = -grid.back`, so `progress + grid.back` is zero for every slot. If
   * anything else is sitting a *hair* past zero, the test says it is ahead, the
   * holding controller below matches its speed, and its speed is zero. So the rail
   * does not move; because it does not move, `driven` stays at zero; because
   * `driven` stays at zero, the gap stays where it was. The chair sits on its slot
   * for the whole race, and the one behind it then holds station on *it*, and so on
   * back down the column.
   *
   * Measured, that is exactly what happened, and the hair was **two microns**. A
   * person standing on the back slot has `progress = 3.5 + progressOnGrid(...)`,
   * which is zero in exact arithmetic and +2.3e-6 in floating point. `plan.ts`
   * happens to write `SPAWN` out rounded to three decimals, which lands on −3.4e-4
   * instead — on the *other* side of zero — and that rounding is the only reason
   * this has never been seen. Compute the slot properly, as a room full of people
   * on assigned slots must, and two of the four rails never leave the grid.
   *
   * 50 mm, then, and the size is not delicate: a chair is 660 mm across, so nothing
   * within 50 mm of another chair's centre is following it — it is inside it, and
   * the solver owns that. Real following distances on this lap start around 400 mm
   * and the number they settle at is `keeps`, 1.6 m. What this excludes is only the
   * degenerate band where "ahead" is float noise.
   */
  touching: 0.05,
  /**
   * Lateral distance within which somebody counts as being in the way — and, the
   * same number the other way round, the room a move has to leave to be worth
   * making. A chair is 660 mm across, so two of them at 0.62 are not passing, they
   * are the same chair drawn twice.
   */
  wide: 0.74,
  /**
   * The gap a chair holds behind one it cannot pass, metres.
   *
   * There has to be a *distance* in the following, not just a speed. Matching the
   * speed of the chair in front and nothing else is a controller with no fixed
   * point: wherever the gap happens to be when the speeds meet is where it stays,
   * and measured, that put pairs 60 mm apart — nose in back, all the way round the
   * lap, which looks precisely as bad as it sounds.
   */
  keeps: 1.6,
  /**
   * How far out a move goes, at most — and it is an absolute lane rather than an
   * offset from this chair's own, because a pass is about the road and the chair
   * being passed, not about where the passer happened to be sitting.
   */
  swing: 0.78,
  /**
   * The room a move has to leave beside the chair it is passing.
   *
   * A chair is 660 mm across, so this is the width of one plus a hand: it is the
   * difference between going round somebody and going through them. Distinct from
   * `wide`, which is the wider question of whether they are in the way at all — the
   * two were one number for a while and it made passes impossible, because a gap
   * big enough to notice somebody in has to be smaller than the one you would
   * accept to drive through it.
   */
  clears: 0.7,
  /**
   * Seconds a move stays committed once made.
   *
   * Without it a chair that pulls out re-decides on the next step, finds the road
   * ahead clear *because it has pulled out*, tucks back in, finds it blocked, and
   * pulls out again — thirty times a second. Committing to a line for a second and a
   * half is not a cosmetic smoothing, it is what makes the move a decision.
   */
  commits: 1.5,
  /** Seconds between clearance probes. See `swayCap`. */
  /**
   * How far up the road the width of it is taken account of, metres.
   *
   * 2.4, which is a shade under half a second at racing pace — far enough that a
   * chair has time to pull its line in before it arrives at the pinch, and short
   * enough that it is not driving down the middle of a wide room because there is
   * a doorway somewhere in the distance.
   */
  probeAhead: 3.2,
  /**
   * Seconds the cap takes to follow the road, rather than jumping to it.
   *
   * The table is sampled every 400 mm, so the width it reports changes in steps —
   * and a clamp applied raw turns each step into a sideways hop. Measured, up to
   * 490 mm in a single frame, against the 92 mm a chair covers in one at pace:
   * a visible twitch every time somebody reached a doorway.
   *
   * Easing it is only safe because of the look-ahead above, which is the whole
   * reason the two numbers are set together: at racing pace 3.2 m is 580 ms of
   * warning, so a cap that takes 300 ms to arrive is fully tightened with half
   * the margin still unspent. The chair now draws its line in as it approaches
   * the pinch, which is also simply what a driver does.
   */
  capEases: 0.3,
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
  /** Seconds of spin-out left. Nothing throws at a chair already out. */
  readonly stunned: number;
};

/** The route, as much of it as this needs. `skins/clay/routePath.ts` builds it. */
export type Track = {
  total: number;
  pointAt(s: number, out: THREE.Vector3): THREE.Vector3;
  headingAt(s: number): number;
};

export type Rivals = {
  /**
   * The rails that are actually racing, in rail order.
   *
   * A getter rather than a fixed array because `reseat` can shorten it: with three
   * people in a room the computer drives two chairs, and the other two must not
   * appear in the standings, be thrown at, or be counted as traffic.
   */
  readonly all: readonly Rival[];
  /** One per rival, to be added to the scene and moved by `update`. */
  readonly objects: readonly THREE.Object3D[];
  /**
   * Advance the field. Call from inside the fixed physics step.
   *
   * `live` is false on the grid, during the countdown and after the flag, and holds
   * everybody exactly where they are.
   *
   * Each person arrives as three numbers rather than one because the field has to be
   * able to *see* them: distance for the rubber band, lane and speed so a rival
   * catching one goes round rather than through.
   *
   * A list rather than a single player, because there can be up to five of them and
   * a rival has to treat every one as traffic. With one in it this is exactly what
   * it was.
   */
  update(h: number, live: boolean, humans: readonly PlayerOnTrack[], elapsed: number): void;
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
   * Deal the computer a different hand: which grid slots it has, and how many.
   *
   * A race in a room decides this in a lobby rather than at load — four rails
   * against one person, two against three, none at all against five — and the slots
   * left over are whichever ones nobody took, not always the front four.
   *
   * Reseating rather than rebuilding, deliberately. The bodies are kinematic
   * capsules that get moved wherever they are told every substep, so there is
   * nothing about a rail that has to be constructed against a particular slot; the
   * alternative is destroying and recreating rigid bodies between races, which is
   * churn in the solver to achieve a change of two numbers.
   *
   * Rails beyond `slots.length` are parked: not simulated, not in `all`, and their
   * meshes are the caller's to hide. Calling this implies a `reset`.
   */
  reseat(slots: readonly GridSlot[]): void;

  /*
   * ---- what an item may do to one ------------------------------------------
   *
   * The mirror of `chair.stun` / `push` / `shove`, minus the one a rail cannot
   * honour. There is no `shove`: a rival's position is its distance along the
   * route plus a lane offset, so a sideways impulse has nowhere to go. Callers
   * pass the blast's shove for the player and drop it for the field, and the
   * asymmetry is invisible — what a player reads off an opponent is that it
   * stopped and spun, not the direction it ended up facing.
   */
  /** Spun out and brought to a stop where it stands. */
  stun(index: number, seconds: number): void;
  /** A extinguisher's push, as pace rather than as an impulse. */
  push(index: number, speed: number, seconds: number): void;
  /** A faceful of powder: it cannot be blinded, so it is slowed instead. */
  blind(index: number, seconds: number): void;

  /*
   * Standings used to live here, as a count of rails ahead of one number. They do
   * not any more: with people in the other chairs the field is not the computer's
   * chairs, so ranking it is a question about `seats` and belongs where that list
   * is. See `placeOf` in `main.ts`.
   */
};

type State = {
  slot: (typeof SLOTS)[number];
  /** Where it starts. See grid.ts — the player is on the same grid. */
  grid: GridSlot;
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
  /**
   * The widest it may sit off the racing line here without being in the building.
   *
   * Read off the width table built in `createRivals` rather than probed: a wall
   * does not move, so neither does the answer. See the note above `widths`.
   */
  swayCap: number;
  /** Which side a pass is being made on, the lane it goes to, and for how long. */
  move: -1 | 0 | 1;
  moveOut: number;
  moveFor: number;
  /** Where the slow drift in its pace has got to. See `steady`. */
  mood: number;
  /** Seconds of spin-out left, and how far round the hit has turned it. */
  stunned: number;
  spin: number;
  /** A push, and how long it still counts for. Plus a faceful of powder. */
  boost: number;
  boostFor: number;
  blindFor: number;
  /** Height, vertical speed, and whether it is off the ground. See `settle`. */
  y: number;
  vy: number;
  air: boolean;
  finished: boolean;
  time: number | null;
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  view: Rival;
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

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
  /** One chair-and-rider per rival, already built by the caller. */
  bodies: readonly THREE.Object3D[],
  /**
   * The grid slot each of them starts from, in the same order.
   *
   * Passed in rather than read off `GRID_SLOTS[i]`, because which slots are the
   * computer's is no longer a fact about this module: it is whatever is left after
   * the people in the room have taken theirs. Reading index `i` was right only for
   * as long as the rails were always slots 0-3 and the one person was always at the
   * back, and it fails silently rather than loudly when that stops being true —
   * two chairs on one slot rather than an error.
   */
  grid: readonly GridSlot[],
): Rivals {
  const at = new THREE.Vector3();
  const states: State[] = [];
  /**
   * How many rails are racing. See `reseat`.
   *
   * Everything that walks the field walks `racing()` rather than `states`, so a
   * parked rail is invisible to the standings, to traffic, and to anything thrown.
   */
  let active = 0;
  const racing = (): State[] => states.slice(0, active);

  bodies.forEach((object, i) => {
    const slot = SLOTS[i];
    const start = grid[i];
    if (!slot) throw new Error(`no driving slot for rival ${i + 1}; the most there can be is ${MAX_RIVALS}`);
    if (!start) throw new Error(`rival ${i + 1} has no grid slot to start from`);

    const body = physics.world.createRigidBody(
      // Kinematic: it moves where it is told and nothing the player does changes
      // that. The collider is what makes contact real.
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, CENTRE_Y, 0),
    );
    physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(RIDER_HALF, RADIUS).setFriction(0.02).setRestitution(0.15),
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
      stunned: 0,
    };

    states.push({
      slot,
      grid: start,
      driver: { label: '', pace: 5.5, drive: { nerve: 1, bold: 0.5, flow: 0.7, steady: 0.8 } },
      progress: 0,
      s: 0,
      speed: 0,
      lane: start.lane,
      swayCap: 0.6,
      move: 0,
      moveOut: 0,
      moveFor: 0,
      mood: i * 1.7,
      stunned: 0,
      spin: 0,
      boost: 0,
      boostFor: 0,
      blindFor: 0,
      y: 0,
      vy: 0,
      air: false,
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

  /** The direction the race runs at the line, as a heading. Grid chairs face it. */
  const lineHeading = Math.atan2(RUN[0], RUN[1]);

  const down = new THREE.Vector3(0, -1, 0);
  const from = new THREE.Vector3();

  /**
   * The floor under a chair, asked of the building rather than of the route.
   *
   * `ROUTE` carries a height per vertex and `pointAt` interpolates between them, which
   * is a good enough answer for a flat floor and the wrong answer for anything the
   * building does between two vertices. Measured, the field was passing through the
   * *ramps* — not the Parkhaus ramps, which the route does describe, but the four
   * kickers, whose surfaces climb 400 mm inside two metres and which the polyline runs
   * straight through the middle of. A chair on rails went through the pallet stack on
   * the deck and the shelf in the store as though they were painted on.
   *
   * So the route says which floor a chair is on and the solver says how high it is.
   * The reach is deliberately short in both directions: the deck's aisle and Ebene 5's
   * back lane are three metres apart in section, and a ray long enough to find one
   * from the other is a ray that drops the whole field a storey.
   */
  function groundUnder(x: number, z: number, guess: number, self: RAPIER.RigidBody): number {
    from.set(x, guess + 0.9, z);
    // Its own body excluded, or a chair reads its own capsule as the floor and rides
    // up its own head.
    const d = physics.rayToStatic(from, down, 1.9, self);
    return d < 1.9 ? guess + 0.9 - d : guess;
  }

  /**
   * Put a rival where its distance says, and carry the numbers out to its view.
   *
   * `h` is the step, and zero means *place it* rather than *drive it* — the grid, a
   * reset, a change of driver. Without that distinction the first frame of a race
   * would read the floor rising under a chair that has not moved and launch the whole
   * field off the start line.
   */
  function settle(state: State, h = 0): void {
    /*
     * ---- how far off its line this chair is sitting -------------------------
     *
     * On the grid: exactly where its slot says, and nowhere else.
     *
     * Neither the wander nor the sway cap belongs to a stationary chair. The
     * wander is a *driving* mannerism — nobody weaves while parked — and the cap
     * is a width measured on the **route**, which the grid is deliberately not on
     * (see the note below, and `grid.ts`). Asked for a chair whose progress is
     * negative, `state.s` wraps round to the far end of the lap, so the clamp on
     * a car sitting on the start line was being taken from the corridor a metre
     * *before* the finish.
     *
     * That is not a theoretical mismatch, it is what the field was visibly doing
     * wrong. `reset()` does not recompute the cap, so every race began with
     * whatever figure each chair happened to be carrying when the last one ended.
     * Measured, the front row spent the whole countdown squashed onto the centre
     * line at lane 0.00 — two chairs occupying the same slot — and then jumped
     * 0.6 and 0.8 m sideways on the first frame after the flag, when the cap was
     * finally recomputed for somewhere they actually were. Four chairs teleporting
     * apart on GO, on every restart.
     *
     * A grid slot needs no clamping in any case: `grid.ts` sizes the arrangement
     * against the floor it stands on and says so at length.
     */
    const onGrid = state.progress < 0;
    const wander = onGrid ? 0 : Math.sin(state.phase) * state.slot.weave * (1.6 - state.driver.drive.flow);
    const sway = onGrid ? state.lane : clamp(state.lane + wander, -state.swayCap, state.swayCap);
    let x: number;
    let z: number;
    let floor: number;
    let yaw: number;

    if (onGrid) {
      /*
       * Still on the grid, which is not on the route — see the note at the top of
       * `grid.ts`. Behind the line the route turns ninety degrees into the hairpin
       * within two metres, so a chair placed by route distance would spend the
       * countdown facing the east glazing. The grid is the line's own straight
       * instead, and the two agree exactly at the line: same point, same tangent,
       * so a chair driving off its slot crosses onto the racing line without a
       * seam to hide.
       */
      const back = -state.progress;
      x = LINE[0] - RUN[0] * back + ACROSS[0] * sway;
      z = LINE[1] - RUN[1] * back + ACROSS[1] * sway;
      floor = 0;
      yaw = lineHeading;
    } else {
      track.pointAt(state.s, at);
      yaw = track.headingAt(state.s);
      // Across the lane rather than along it: the offset is applied on the route's
      // own right-hand normal, so a rival keeps its side of the corridor through
      // every corner instead of cutting across the line at each change of heading.
      x = at.x + Math.cos(yaw) * sway;
      z = at.z - Math.sin(yaw) * sway;
      floor = at.y;
    }

    /*
     * ---- and the vertical, which is where the jumps come from -------------
     *
     * The chair is held on the floor the solver reports, and the moment that floor
     * stops climbing as fast as it has been, it is let go. That is the whole of the
     * jump: no jump table, no trigger volumes, no list of kickers to keep in step
     * with the four that exist. A ramp is a piece of floor that goes up, a lip is
     * where it stops, and a chair that was being lifted at two metres a second when
     * the lifting stopped is a chair travelling upwards at two metres a second.
     *
     * Which is also why it is worth doing this way rather than scripting it: the day
     * somebody puts a fifth kicker in the canteen, the field jumps it.
     */
    const ground = groundUnder(x, z, floor, state.body);
    if (h <= 0) {
      state.y = ground;
      state.vy = 0;
      state.air = false;
    } else if (state.air) {
      // A shade heavier than earth, which is the oldest trick in arcade racing: real
      // gravity on a two-metre hop reads as slow motion.
      state.vy -= 13 * h;
      state.y += state.vy * h;
      if (state.y <= ground) {
        state.y = ground;
        state.vy = 0;
        state.air = false;
      }
    } else {
      const climb = (ground - state.y) / h;
      if (state.vy > 0.8 && climb < state.vy * 0.5) {
        // The floor is no longer keeping up with the climb it was giving: a lip.
        state.air = true;
        state.y += state.vy * h;
      } else {
        state.y = ground;
        state.vy = Math.max(0, climb);
      }
    }
    floor = state.y;

    state.object.position.set(x, floor, z);
    // Facing is the route's heading turned to the game's convention: `headingAt`
    // measures the direction of travel, and a chair at yaw θ faces (−sinθ, −cosθ).
    // Plus however far a hit has knocked it round, which is the only rotation on a
    // rail chair that is not the route's own.
    state.object.rotation.y = yaw + Math.PI + state.spin;
    state.body.setNextKinematicTranslation({ x, y: floor + CENTRE_Y, z });

    const v = state.view as { -readonly [K in keyof Rival]: Rival[K] };
    v.label = state.driver.label;
    v.position.set(x, floor, z);
    v.yaw = state.object.rotation.y;
    v.speed = state.speed;
    // One plus the whole lap lengths driven, measured from this chair's own grid
    // slot so a rival three metres up the road is still on lap one. Clamped at the
    // top, or a chair sitting on the flag reports a fourth lap of a three-lap race.
    const driven = state.progress + state.grid.back;
    v.lap = Math.min(laps, Math.max(1, 1 + Math.floor(driven / track.total)));
    v.progress = driven;
    v.finished = state.finished;
    v.time = state.time;
    v.stunned = state.stunned;
  }

  /**
   * The widest offset from the racing line that is still floor, here.
   *
   * Walked **outwards from the line and stopped at the first thing hit**, which is a
   * correction rather than a refinement: the first version tested candidate offsets
   * from the outside in and returned the first one that was clear, and that answers a
   * different question. A chair 300 mm off line and a lamp mast 500 mm off line are
   * both inside a metre of clearance, so a probe that finds a metre clear and stops
   * has walked straight past the mast. Anything between the line and the rim was
   * invisible to it — which is exactly the class of object that gets hit.
   *
   * Both sides, and the smaller of the two, so the answer is symmetric and a chair
   * never has more room on one side than the number says.
   *
   * `RADIUS + 0.05` rather than `RADIUS`: a chair that is exactly not touching the
   * door frame at twenty kilometres an hour is a chair touching the door frame.
   */
  function measureRoom(s: number): number {
    track.pointAt(s, at);
    const yaw = track.headingAt(s);
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    let cap = 0;
    for (let off = 0.14; off <= 1.0; off += 0.11) {
      if (physics.obstruction(at.x - nx * off, at.y, at.z - nz * off, RADIUS + 0.05).length) break;
      if (physics.obstruction(at.x + nx * off, at.y, at.z + nz * off, RADIUS + 0.05).length) break;
      cap = off;
    }
    return cap;
  }

  /**
   * The width of the road, everywhere, measured once.
   *
   * ---- why this is a table and not a probe ---------------------------------
   *
   * Because the answer never changes. The route is fixed, the building is fixed,
   * and the furniture that is *not* fixed is invisible to `obstruction` anyway —
   * so "how far off the line can a chair sit at this point of the lap" is a
   * property of the lap, and re-deriving it eight times a second per chair was
   * paying a running cost for a constant.
   *
   * It also fixes the thing the running version could not. Probing at the wheel
   * missed anything the chair was about to reach; probing at the wheel *and* a
   * couple of metres ahead — the first attempt at this — missed everything
   * *between* those two points, which is most of the road. Measured, that left
   * one rival driving through `garage.car.a` on the deck: the car sat in the
   * blind span between the two samples and neither one ever saw it. With a table
   * there is no sampling decision left to get wrong at runtime — the minimum is
   * taken over an unbroken run of it.
   *
   * 400 mm resolution, which is a little over a chair's radius, so nothing
   * narrower than a chair can hide between two entries.
   */
  const WIDTH_STEP = 0.4;
  const widths = new Float32Array(Math.max(1, Math.ceil(track.total / WIDTH_STEP)));
  for (let i = 0; i < widths.length; i++) widths[i] = measureRoom(i * WIDTH_STEP);

  /** The narrowest the road gets between here and `span` metres up it. */
  function roomOver(s: number, span: number): number {
    let cap = Infinity;
    for (let d = 0; d <= span; d += WIDTH_STEP) {
      const at = ((((s + d) % track.total) + track.total) % track.total) / WIDTH_STEP;
      cap = Math.min(cap, widths[Math.floor(at) % widths.length]!);
    }
    return cap;
  }

  /**
   * Whoever this rival is about to run into, if anybody.
   *
   * People count. A field that queues politely behind each other and then drives
   * straight through the one chair somebody is sitting in has not learned
   * anything — and being overtaken *properly*, with somebody pulling out and coming
   * past, is most of what makes a rival feel like a driver rather than a timer.
   *
   * `faster` is what turns a queue into a race: there is no point pulling out on
   * somebody who is pulling away, and a chair that tries reads as confused.
   */
  function nearestAhead(
    self: State,
    driven: number,
    humans: readonly PlayerOnTrack[],
  ): { gap: number; speed: number; lane: number; faster: boolean } | null {
    let best: { gap: number; speed: number; lane: number; faster: boolean } | null = null;

    const consider = (theirDriven: number, theirLane: number, theirSpeed: number): void => {
      const gap = theirDriven - driven;
      // See `TRAFFIC.touching`: a chair that is level with this one is not ahead of
      // it, and treating it as though it were is a deadlock rather than a queue.
      if (gap <= TRAFFIC.touching || gap > TRAFFIC.sees) return;
      if (Math.abs(theirLane - self.lane) > TRAFFIC.wide) return;
      if (best && gap >= best.gap) return;
      best = { gap, speed: theirSpeed, lane: theirLane, faster: self.speed > theirSpeed + 0.04 };
    };

    for (const other of racing()) {
      if (other === self || other.finished) continue;
      consider(other.progress + other.grid.back, other.lane, other.speed);
    }
    // People are already carrying their own grid handicap in `progress` — see the
    // note on `flagAt` — so they go in as they arrive. A person who has finished is
    // still traffic: they are parked somewhere on this floor either way.
    for (const person of humans) consider(person.progress, person.lane, person.speed);

    return best;
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
    racing().forEach((state, i) => {
      // On the grid: behind the line by its own slot's spacing, and off to its own
      // side of it. Negative, because the line is route zero and the grid is behind
      // it — which is also what makes the flag arithmetic below come out right
      // without anybody having to add a grid-position handicap by hand.
      state.progress = -state.grid.back;
      state.s = ((state.progress % track.total) + track.total) % track.total;
      state.speed = 0;
      state.lane = state.grid.lane;
      state.finished = false;
      state.time = null;
      state.phase = i * 2.1;
      state.stunned = 0;
      state.spin = 0;
      state.boost = 0;
      state.boostFor = 0;
      state.blindFor = 0;
      // And the width of the road where it is about to be, not where it last was.
      // Belt and braces next to the grid's own exemption above, but a stale figure
      // surviving a restart is precisely the bug that exemption exists to end.
      state.swayCap = roomOver(0, TRAFFIC.probeAhead);
      settle(state);
    });
  }

  // Everything the caller handed over is racing until somebody says otherwise.
  active = states.length;
  reset();

  return {
    get all() {
      return racing().map((s) => s.view);
    },
    get objects() {
      return racing().map((s) => s.object);
    },

    update(h, live, humans, elapsed) {
      for (const state of racing()) {
        if (!live || state.finished) {
          // Still settled every step: a finished rival is parked on the line and a
          // rival on the grid has to be *somewhere*, and both want the same code.
          state.speed = state.finished ? 0 : state.speed;
          settle(state);
          continue;
        }

        if (state.stunned > 0) {
          /*
           * Stopped where it stands, and spinning.
           *
           * The route still owns where it is — progress keeps accruing off whatever
           * speed is left — so a chair hit in a doorway comes to rest in the doorway
           * rather than halting on the frame it was hit, which reads as a dropped
           * connection rather than as a collision.
           *
           * `settle(state, h)` rather than `settle(state)`: a chair hit in mid-air
           * over a kicker is still in mid-air, and the zero-step form means *place
           * it*, which would snap it to the floor. Being knocked out of a jump
           * should cost you the landing, not delete the jump.
           *
           * Clamped rather than merely decremented, because this branch stops
           * running the moment it reaches zero — an unclamped subtraction leaves a
           * small negative behind it forever, on the `Rival` view, where the item
           * rules read it to decide whether a chair is already out.
           */
          state.stunned = Math.max(0, state.stunned - h);
          state.spin += TUNING.stunSpin * h;
          state.speed = Math.max(0, state.speed - TUNING.stunBrake * h);
          state.progress += state.speed * h;
          state.s = ((state.progress % track.total) + track.total) % track.total;
          state.phase += h * 0.4;
          // Whatever pass it was in the middle of is off. A chair that comes out of
          // a spin still committed to a move it began two seconds ago arrives back
          // on the racing line sideways.
          state.move = 0;
          state.moveFor = 0;
          settle(state, h);
          continue;
        }

        /*
         * And unwound back onto the line once it is over.
         *
         * Wrapped to a half turn before it is eased, which is the whole of the fix:
         * a chair spun through two and a half turns carries fifteen radians, and
         * easing *that* to zero plays the entire spin again backwards. Wrapping
         * first means it takes the short way round from wherever it stopped.
         */
        if (state.spin !== 0) {
          const wrapped = Math.atan2(Math.sin(state.spin), Math.cos(state.spin));
          state.spin = Math.abs(wrapped) < 0.02 ? 0 : wrapped * Math.pow(0.02, h);
        }
        if (state.boostFor > 0) state.boostFor = Math.max(0, state.boostFor - h);
        if (state.blindFor > 0) state.blindFor = Math.max(0, state.blindFor - h);

        // What the route does over the next few metres, as a radius. Read ahead
        // rather than at the wheel: a rival that starts slowing once it is already
        // in the corner is a rival that never makes the corner.
        // Read from the line rather than from behind it while a chair is still on
        // the grid: the route behind the line is the hairpin, and a rival that reads
        // its own starting slot as a ninety-degree corner creeps off the line at
        // walking pace on every start of every race.
        const look = Math.max(state.progress, 0);
        const turn = Math.abs(
          angleDiff(track.headingAt(look), track.headingAt(look + TUNING.lookAhead)),
        );
        // Nerve is a grip figure, which is the honest place for it: a braver driver
        // is not one who ignores the corner, it is one who believes the castors will
        // hold at a higher speed through the same radius — and is occasionally wrong
        // about it, which the floor then settles.
        const grip = TUNING.cornerGrip * state.driver.drive.nerve;
        const corner =
          turn > 1e-3
            ? Math.max(TUNING.slowestCorner, Math.sqrt((grip * TUNING.lookAhead) / turn))
            : Infinity;

        /*
         * The band, from the gap in metres of route rather than in seconds: a gap
         * measured in time swings wildly whenever either of you is in a corner.
         *
         * Against the *nearest* person rather than against the field's leader, and
         * with more than one of them on the grid that is a decision rather than an
         * implementation detail. The band exists to keep a race close for whoever is
         * near this chair; measured against the leader it would push a rival that is
         * already scrapping with a back-marker, and measured against an average it
         * would answer to nobody actually on screen. Nearest is the only reading
         * under which a rival races the person it is racing.
         *
         * With one person in the room this is the number it always was.
         */
        const driven = state.progress + state.grid.back;
        let gap = 0;
        let closest = Infinity;
        for (const person of humans) {
          const theirs = person.progress - driven;
          if (Math.abs(theirs) < closest) {
            closest = Math.abs(theirs);
            gap = theirs;
          }
        }
        const band = 1 + TUNING.band * Math.max(-1, Math.min(1, gap / TUNING.bandFull));

        /*
         * And the pace itself is not a constant, for anybody but the metronomes.
         *
         * A slow wander of a few percent, on its own phase, scaled by how unsteady
         * the driver is. It is worth about a second a lap on the dog and nothing at
         * all on the new one, and its real job is not the lap time: it is that the
         * order behind the player changes on its own. A field where every gap only
         * ever grows is a field of clocks.
         */
        state.mood += h * 0.21;
        const drift = 1 + (1 - state.driver.drive.steady) * 0.075 * Math.sin(state.mood);

        // The slowest of what it wants, what the corner allows and what the band
        // asks for — and the band is a factor on its own pace, not on the corner's
        // limit, because rubber-banding a chair through a doorway faster than it
        // can hold the line is how a pace car ends up in a wall.
        // Pace, then whatever items have done to it. The corner still caps the lot —
        // a push through a doorway faster than the line can be held is the same
        // mistake the band is stopped from making just above.
        const paced =
          state.driver.pace * TUNING.paceScale * (state.blindFor > 0 ? TUNING.blindPace : 1) +
          (state.boostFor > 0 ? state.boost : 0);
        let target = Math.min(paced * band * drift, corner);

        /*
         * ---- traffic ------------------------------------------------------
         *
         * Whoever is in the way, if anybody: nearest chair up the road, inside seven
         * metres, within a chair's width of this one's line. Then one decision, and
         * `bold` makes it — go round, or sit behind.
         *
         * The going-round is a lane offset rather than a line: these are rails, and a
         * rail cannot dive up an inside that is not there. What it can do is move to
         * the free side of the corridor, hold it while it goes past, and come back —
         * which is what a pass looks like from the seat behind, and is the whole of
         * what the player needs to read. What it must never do is what it used to,
         * which is advance straight through the chair in front.
         */
        const ahead = nearestAhead(state, driven, humans);
        if (ahead) {
          const urgency = 1 - ahead.gap / TRAFFIC.sees;
          /*
           * Which side to go, and it is decided by where *they* are rather than by
           * where this chair happens to be sitting.
           *
           * The first cut picked the side with more road on it — `lane <= 0 ? 1 : -1`
           * — which is a perfectly good rule for one chair on an empty lap and a way
           * of driving into people the moment there are four. Slot lanes are 700 mm
           * apart: a chair on −0.34 swinging +0.44 arrives at +0.10, and the chair it
           * was trying to pass is on +0.16. Measured, that produced pairs 160 mm apart
           * — two chairs in the same place, which is the exact failure the whole of
           * this section exists to remove.
           *
           * Away from them, then, and only if the road that side is both wide enough
           * to hold and wide enough to clear them by a chair's width. Otherwise there
           * is no move here, and the answer is to sit behind and wait for one.
           */
          const side = ahead.lane >= state.lane ? -1 : 1;
          const swung = side * Math.min(state.swayCap - 0.12, TRAFFIC.swing);
          const canSwing =
            Math.abs(swung) > 0.2 && Math.abs(swung - ahead.lane) >= TRAFFIC.clears;

          if (state.moveFor > 0) {
            state.moveFor -= h;
          } else if (canSwing && state.driver.drive.bold * urgency > 0.34 && ahead.faster) {
            // Committed, and committed for long enough to be a move rather than a
            // twitch. See TRAFFIC.commits.
            state.move = side;
            state.moveOut = swung;
            state.moveFor = TRAFFIC.commits;
          } else {
            state.move = 0;
            /*
             * Not going round, so do not go through: hold station instead.
             *
             * A gap controller rather than a speed match. Inside the holding distance
             * it lifts below the chair ahead and the gap opens again; outside it, it
             * may close at a rate proportional to the room it has, so a chair four
             * metres back still closes and one at a metre and a half sits there. The
             * fixed point is `keeps`, which is what makes it a queue with spacing
             * rather than a pile.
             */
            const room = ahead.gap - TRAFFIC.keeps;
            target = Math.min(target, room < 0 ? ahead.speed * 0.82 : ahead.speed + room * 0.9);
          }
        } else if (state.moveFor > 0) {
          state.moveFor -= h;
        } else {
          state.move = 0;
        }

        state.speed += (target - state.speed) * Math.min(1, h / TUNING.responds);

        // Off the blocks and onto its racing line over the first few seconds, and
        // out to the passing side and back for as long as a move is on. A chair that
        // snaps from its grid slot to its lane on the first frame of the race is a
        // chair that teleports sideways in front of the player.
        /*
         * And a move is abandoned the moment the road stops being wide enough for it.
         *
         * The lane is clamped to the corridor in `settle` whatever happens here, so a
         * chair that commits to a pass in the Grossraum and arrives at the meeting
         * room door still in it does not end up in the frame — but it does end up
         * squeezed back alongside the chair it was passing. Dropping the move puts it
         * back behind instead, which is what a driver who has run out of road does.
         */
        if (state.moveFor > 0 && Math.abs(state.moveOut) > state.swayCap - 0.06) {
          state.move = 0;
          state.moveFor = 0;
        }
        const wants = state.move === 0 ? state.slot.lane : state.moveOut;
        state.lane += (wants - state.lane) * Math.min(1, h / TUNING.findsLine);

        /*
         * How much road there is here, re-measured a few times a second.
         *
         * Grown outwards from the racing line rather than tested at the wanted offset
         * alone: what is wanted is the largest offset that is still clear, and a
         * single test at 440 mm says only that 440 mm is not, which leaves nothing to
         * fall back to but the centre of the road.
         */
        /*
         * How much road there is, from here to a couple of metres up it.
         *
         * The same argument the corner speed makes forty lines up — "a rival that
         * starts slowing once it is already in the corner is a rival that never
         * makes the corner" — applied to the width of the road rather than to its
         * curvature. A lane offset chosen in an open bay used to be held all the
         * way into the gap beside a table, because the probe only ever reported
         * the table once the chair was level with it. Now the line tightens before
         * the pinch and opens again after it, and it costs a handful of array
         * reads because the table above already knows the answer.
         */
        const road = roomOver(state.s, TRAFFIC.probeAhead);
        state.swayCap += (road - state.swayCap) * Math.min(1, h / TRAFFIC.capEases);

        state.progress += state.speed * h;
        state.s = ((state.progress % track.total) + track.total) % track.total;
        state.phase += h * (0.7 + state.slot.weave);

        // Its own flag, its own grid slot: a chair that starts three metres up the
        // road has three metres more to cover, so everybody drives the same distance.
        // On a 390 m lap it is worth a third of a second, which is nothing — and
        // being the kind of nothing that is free to get right, it is got right.
        if (state.progress >= flagAt - state.grid.back) {
          /*
           * Parked just past the flag with its progress left where it is, so a rival
           * that has finished still outranks everyone still on the last lap.
           *
           * *Past* it, and strung out down the road in grid order, because parking
           * them all on the line put four chairs in one cubic metre — the single
           * worst-looking thing in the last thirty seconds of a race, and the thing
           * that made the pair-distance measurements look like the field was driving
           * through itself when what it was really doing was finishing.
           */
          state.finished = true;
          state.time = elapsed;
          state.speed = 0;
          state.s = 2.4 + states.indexOf(state) * 1.7;
          state.lane = state.grid.lane;
        }

        settle(state, h);
      }
    },

    reset,

    stun(index, seconds) {
      const state = states[index];
      if (!state || state.finished) return;
      // The longer of the two, never the sum. Same rule as `chair.stun`, same
      // reason: two things landing at once is one accident.
      state.stunned = Math.max(state.stunned, seconds);
      state.boostFor = 0;
    },

    push(index, speed, seconds) {
      const state = states[index];
      if (!state) return;
      state.boost = Math.max(state.boostFor > 0 ? state.boost : 0, speed);
      state.boostFor = Math.max(state.boostFor, seconds);
    },

    blind(index, seconds) {
      const state = states[index];
      if (!state) return;
      state.blindFor = Math.max(state.blindFor, seconds);
    },

    reseat(slots) {
      active = Math.min(slots.length, states.length);
      for (let i = 0; i < active; i++) {
        const state = states[i]!;
        state.grid = slots[i]!;
      }
      // Whatever is parked must not be left standing on the grid from last time.
      for (let i = active; i < states.length; i++) {
        const state = states[i]!;
        state.finished = true;
        state.speed = 0;
        state.object.visible = false;
      }
      for (let i = 0; i < active; i++) states[i]!.object.visible = true;
      reset();
    },

    setDrivers(drivers) {
      racing().forEach((state, i) => {
        // Fewer drivers than slots would leave a nameless chair on the grid, so the
        // list wraps rather than running out. It never should: the roster is one
        // longer than the field by construction.
        state.driver = drivers[i % Math.max(1, drivers.length)] ?? state.driver;
        settle(state);
      });
    },

    /*
     * Standings used to live here, and the last thing that happened to them before
     * they left was a real fix: they were ranking the *odometer* rather than the
     * road. `state.progress + state.grid.back` is how far a chair has driven from its
     * own slot, so the field was sorted by distance travelled since the flag with
     * every slot counting as its own start line — which on a 3.5 m grid is a
     * different race, and reported 5th at -0.1 m and 1st at 0.0 with nobody moving.
     *
     * `state.progress` is the honest quantity: distance past the line, starting at
     * `-back`, exactly as `reset` sets it.
     *
     * That fix is kept and is now applied to everybody, which is the other half of
     * it. Ranking only the computer's chairs was right for exactly as long as the
     * only person on the grid was the one reading the number, so the question moved
     * to where the whole field is — see `placeOf` in `main.ts`.
     */
  };
}
