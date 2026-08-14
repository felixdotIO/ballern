/**
 * Chair Force One. The game, and the only one — entry point at `/`.
 *
 * This file began as a copy of the shipped `src/main.ts` with the art direction
 * swapped, run from its own page so an experiment could not break the game. It won:
 * the golden-hour clay is what the game looks like now, the donuts are what a
 * checkpoint is, and the boarding pass is the front end. So the old entry and the
 * old HUD — `src/main.ts` and `src/ui/hud.ts`, daylight and Helvetica on dark
 * plates — have been deleted rather than left to rot beside this one, and
 * `index.html` points here. There is one build.
 *
 * What is still imported unchanged from underneath is everything that makes it a
 * game rather than a look: `buildFloorplate`, `buildDressing`, `buildTrackMarks`,
 * the 120 Hz physics, the chair, the driver rig, the race, the resolution
 * controller, and the Flucht- und Rettungsplan in `ui/minimap.ts`. The lap is the
 * lap: eleven gates in order through every room on the floor, three times round.
 *
 * The art direction is five things:
 *
 *  1. Every shared material repainted in place — `repaint.ts`, which is the whole
 *     reason this can use the real floorplate at all.
 *  2. The building's thirty-seven fittings harvested out and replaced by a low warm
 *     key, a cold travelling rim, and an ambient standing in for the tubes —
 *     `lighting.ts`.
 *  3. A golden-hour sky and environment.
 *  4. A low, wide, close chase that opens with speed and rolls into a slide.
 *  5. GTAO, a shallow depth of field, a hot bloom and a vignette — `post.ts`.
 *
 * And the interface is `look.ts`, `menu.ts`, `hud.ts` and `gauge.ts`: a very small
 * airline whose entire fleet is office furniture.
 *
 * The one thing the repaint cannot do is geometry. Every box in the building is
 * chamfered at 4 mm, which is a highlight-catcher and not a roundover, so the forms
 * stay architectural where clay would be moulded. That is one constant in
 * `render/geometry.ts` and it is deliberately not changed here.
 */

import * as THREE from 'three';

import { buildFloorplate } from '../../office/shell';
import { GATES, LAPS, ROUTE, SHOWROOM, roomAt } from '../../office/plan';
import { buildDressing } from '../../office/dressing';
import { buildTrackMarks } from '../../office/trackmarks';
import { buildCrowd } from '../../office/crowd';
import { createChair, DRIFT_TIERS, FLOOR_OFFSET, type Input } from '../../game/chair';
import { createPhysics } from '../../game/physics';
import { createDynamics } from '../../game/dynamics';
import { createDriver } from '../../game/driver';
import { bearingTo, createRace } from '../../game/race';
import { bindDriver } from '../../render/driverRig';
import { createQuality } from '../../render/quality';
import { driver as kitDriver, loadKit, raceChair, type DriverKey } from '../../render/kit';
import { createLightPool } from '../../render/lights';
import { createRoutePath } from './routePath';
import { createRivals, MAX_RIVALS } from '../../game/rivals';
import {
  GRID_SLOTS,
  GRID_YAW,
  PLAYER_SLOT,
  progressOnGrid,
  slotAt,
  type GridSlot,
} from '../../game/grid';
import { createRouteAim } from './routeAim';
import { createClayLighting } from './lighting';
import { createClayPost } from './post';
import { repaintBuilding, repaintObject } from './repaint';
import { createClayHud } from './hud';
import { createMenu } from './menu';
import { createGarage, RIDE_BUILDERS, RIDERS, RIDES } from './garage';
import { shoot } from './portraits';
import { makeRng, seedFrom } from '../../office/rng';
import { createItemPlay } from '../../game/items';
import { IDLE_ACTOR, type Seat, type SeatActor } from '../../game/seat';
import {
  joinRoom,
  MULTIPLAYER_AVAILABLE,
  newRoomCode,
  type Room,
  type RoomHandlers,
} from '../../net/room';
import { createProxies, type Proxies } from '../../net/proxy';
import { POSE_HZ } from '../../net/protocol';
import { createProjectiles, type ItemArt, type ItemEffects } from '../../game/projectiles';
import { createPinatas } from './pinatas';
import { createItemHud } from './itemHud';
import { createRush } from './rush';
import {
  binder,
  cloud,
  extinguisher as extinguisherArt,
  inviteCard,
  microwaveBomb,
  puddle as puddleArt,
} from './itemArt';

const canvas = document.getElementById('stage') as HTMLCanvasElement;

// Before anything is built. See the note at the top of repaint.ts — the whole
// building holds references to these exact material instances, so this is the
// re-skin, and it has to happen before a builder reads one of them.
repaintBuilding();

const renderer = new THREE.WebGLRenderer({ canvas });
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Khronos PBR Neutral, as the game uses, and for the same reason: the palette
// is carried by hue and a curve that protects highlights by pulling them toward
// white takes the hue with it. AgX was tried in the lab and did exactly that.
renderer.toneMapping = THREE.NeutralToneMapping;
// Below the game's own 0.72, and that is arithmetic rather than taste: this
// scene carries the building's full fitting pool *and* a key and a rim on top
// of it, so there is strictly more light in it than the shipped game has. The
// first pass ran at 1.06 — tuned in the lab, where there were three lights and
// no ceiling — and the reception hall came out white.
renderer.toneMappingExposure = 0.6;
renderer.shadowMap.enabled = true;
// PCF, not PCF-soft. A shadow with an edge on it is half of what separates a
// room with a sun in it from a room with a soft box in it.
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------

/** Golden hour. Deep blue overhead, hot band at the horizon, warm ground haze. */
const SWEEP: readonly (readonly [number, string])[] = [
  [0, '#3a5c78'],
  [0.4, '#6f92a8'],
  [0.58, '#d9a468'],
  [0.7, '#f6b878'],
  [1, '#6d5843'],
];

function makeSky(): THREE.Texture {
  const sky = document.createElement('canvas');
  sky.width = 8;
  sky.height = 512;
  const ctx = sky.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const grad = ctx.createLinearGradient(0, 0, 0, sky.height);
  for (const [at, color] of SWEEP) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, sky.width, sky.height);

  const tex = new THREE.CanvasTexture(sky);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const sky = makeSky();
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromEquirectangular(sky).texture;
pmrem.dispose();

scene.background = sky;
scene.environment = environment;
// Restrained, for the same reason the game's is: push it and the ceiling lifts
// to the value of the floor, which is how a room ends up looking like a box.
scene.environmentIntensity = 0.45;

// ---------------------------------------------------------------------------
// The building
// ---------------------------------------------------------------------------

await loadKit();

const shell = buildFloorplate();
scene.add(shell.group);

const dressing = buildDressing();
scene.add(dressing.group);

const marks = buildTrackMarks();
scene.add(marks.group);

/*
 * The colleagues who came to watch, and who are also the track's edges.
 *
 * They replace the checkpoint donuts: a wall of people with their arms up says
 * "this way" in the same register the rest of the building speaks in, and unlike a
 * floating marker it is *solid*, so the shortcut behind it stops existing. The
 * gates in `race.ts` are unchanged and still decide whether a lap counts — the
 * difference is that the route is now shaped by the room rather than only judged
 * after the fact. See `office/crowd.ts` for where they stand and why.
 */
const crowd = buildCrowd();
scene.add(crowd.group);

// The kit's `.glb` assets carry their own materials, which `repaintBuilding`
// cannot reach because they are not in `MAT`. Now that everything is built,
// sweep the graph.
repaintObject(scene);

// The game's own light pool, kept. Fifty-odd authored fittings harvested into
// a small travelling set — see the measurement at the top of render/lights.ts.
// The clay rig goes on top of it rather than instead of it; lighting.ts has the
// note on why replacing it fails in the windowless core.
const pool = createLightPool(scene);
const lighting = createClayLighting(scene);

const physics = await createPhysics([...shell.collision, ...dressing.collision, ...crowd.collision]);

const dynamics = createDynamics(physics.world, dressing.dynamic);
scene.add(dynamics.root);

/*
 * ---- who is in which seat -------------------------------------------------
 *
 * Five seats and five grid slots, and until now the answer was so obvious it was
 * never written down: the person was seat 0 and stood on the back slot, and the
 * computer was seats 1-4 on slots 0-3. That fact was spelled three different ways
 * across this file — an `id === 0` to pick the chair over a rival, an `id - 1` to
 * turn a seat into a rail, and `GRID[i]` inside `rivals.ts` to place one.
 *
 * Written down once, it is three small tables. The seat a person is in, the grid
 * slot each seat starts from, and which seats the computer drives — everything else
 * in this file reads those rather than assuming. In a solo race they say exactly
 * what the old constants did, which is the point: this is the same arrangement,
 * named, so that a room can hand over a different one.
 */

/**
 * How many people are on the grid, and which one is at this keyboard.
 *
 * Solo is one person, and the arrangement it gets is the one the game has always
 * had: the back slot, with the computer on the four in front. That is not a default
 * falling out of the arithmetic, it is a decision — see `PLAYER_SLOT` — and it stays
 * true whatever a room does.
 *
 * A room deals differently. Everybody takes a slot in the order they joined, so the
 * humans are the front of the grid and the computer fills in behind, and the person
 * at this keyboard is wherever the room put them.
 */
let humanSeats: number[] = [0];
let localSeat = 0;
let seatSlots: GridSlot[] = [PLAYER_SLOT, ...GRID_SLOTS.slice(0, MAX_RIVALS)];
let railSeats: number[] = [1, 2, 3, 4];
/** Seats driven by another person, over the wire. Empty in a solo race. */
let proxySeats: number[] = [];

/** The seat a rail drives, and the rail driving a seat. −1 if nothing is. */
const seatOfRail = (rail: number): number => railSeats[rail] ?? -1;
const railOfSeat = (seat: number): number => railSeats.indexOf(seat);

/**
 * Where the local chair lines up: its own slot, computed.
 *
 * `plan.ts` writes `SPAWN` out as `slotAt(PLAYER_SLOT)` already evaluated — it has
 * to, because that declaration sits above `ROUTE` and half the building is built off
 * it — and both this and `stage(false)` used to take it as "where the person
 * starts". That is the same number only for as long as the person is the one on the
 * back slot, and in a room they are not: dealing seats means every chair starts from
 * a slot worked out at runtime.
 *
 * Doing this is what turned up the grid deadlock in `rivals.ts` — see
 * `TRAFFIC.touching`, which is the fix. `SPAWN` rounded to three decimals lands a
 * third of a millimetre on one side of the start line's projection and the computed
 * slot lands on the other, and the field used to care enormously about which. It no
 * longer does, and this can be the honest number.
 *
 * The floor comes from `SPAWN` because that is a fact about the hall rather than
 * about the slot, and `slotAt` only answers in plan.
 */
function slotSpawn(slot: GridSlot): { position: readonly [number, number, number]; yaw: number } {
  const [x, z] = slotAt(slot);
  return { position: [x, shell.spawn.position[1], z], yaw: GRID_YAW };
}

/**
 * A function rather than a value, because the slot can change between races.
 *
 * `chair.reset()` goes back to whatever spawn the chair was *constructed* with, so
 * everything that puts the player on the grid calls `chair.place` off this instead.
 * In a solo race it is the same slot every time and the distinction never shows.
 */
const localSpawn = (): { position: readonly [number, number, number]; yaw: number } =>
  slotSpawn(seatSlots[localSeat]!);

const chair = createChair(physics, slotSpawn(seatSlots[localSeat]!));
scene.add(chair.object);


// Where the line goes next, tracked but not drawn — the HUD chevron's bearing
// and nothing else. See the note at the top of routeAim.ts.
const lapPath = createRoutePath(ROUTE);
const routeAim = createRouteAim(lapPath);


const driver = createDriver();

/*
 * The seated figure, and it is a `let` because picking a driver swaps the whole
 * asset.
 *
 * Seven characters share one body and differ only above the neck, so there is
 * nothing to configure on a figure — the cast is seven separate rigged GLBs and
 * choosing one means parenting a different one to the chair. Which in turn means
 * re-binding the rig: `bindDriver` reads the armature it is given and caches every
 * bone's rest orientation, so a figure swapped underneath a stale binding is a
 * figure that never moves again.
 *
 * Everything else about the driver — the pose model in `game/driver.ts`, the
 * telemetry it reads, the offsets in `driverRig.ts` — is per-character-agnostic and
 * shared, because the skeleton is the same skeleton.
 */
let driverFigure: THREE.Object3D = kitDriver(RIDERS[0]!.key);
let driverRig = bindDriver(driverFigure);

function useDriver(key: DriverKey): THREE.Object3D {
  if (driverFigure.parent) driverFigure.parent.remove(driverFigure);
  driverFigure = kitDriver(key);
  /*
   * Not regraded, and that is the fix for the worst-looking bug of the lot.
   *
   * `repaintObject` exists to pull the *building's* kit assets into the clay band,
   * and run over one of the cast it destroys the design: measured on the intern, her
   * white tee came out #d8c870 — a yellow — and her copper bob #d5956e, a washed
   * tan. Every character is already authored in this game's palette in
   * `blender/crew/cast.py`, with a saturated hero colour apiece and a deliberately
   * white tee across all seven, so the regrade has nothing to add and one thing to
   * take away.
   *
   * The scene-wide sweep is safe because it runs before any figure is parented —
   * see `repaintObject(scene)` above, which happens before the chair exists.
   */
  chair.object.add(driverFigure);
  driverRig = bindDriver(driverFigure);
  return driverFigure;
}

// The one the game opens with — the head of the roster, whoever that is. From here
// on `createGarage` calls `useDriver` itself for every change, including its own
// opening `setRider(0)`.
useDriver(RIDERS[0]!.key);

/*
 * ---- the field -----------------------------------------------------------
 *
 * Three more chairs, each with somebody in it. See `game/rivals.ts` for why they
 * follow the route rather than drive it; this end is only about making them look
 * like the fourth wall of the same office.
 *
 * The figure is cloned through `SkeletonUtils`, not `Object3D.clone()`. A skinned
 * mesh cloned the ordinary way keeps a reference to the *original* skeleton, so
 * three rivals and the player would share one set of bones: whatever the player's
 * legs did, all four would do, and the moment the rig bound one of them the other
 * three would inherit its pose. `kit.ts` says as much where it hands the driver
 * over — there is exactly one of these in the asset, and this is the supported way
 * to have four.
 *
 * Materials are cloned per rival for the same class of reason. The garage paints a
 * driver by writing colours into the material instances the asset owns; without a
 * private copy per rival, dressing the Boss would dress the player too.
 */
const rivalRigs = Array.from({ length: railSeats.length }, (_, slot) => {
  const rng = makeRng(seedFrom(`rival.slot.${slot}`));
  const chairBody = raceChair(rng).group;
  scene.add(chairBody);

  // Its own animation, driven off its own speed. Four more `createDriver`s is four
  // more sets of nine numbers a frame; what it buys is four people paddling at four
  // different rates, which is what stops them reading as props slid along the floor.
  return {
    object: chairBody,
    driver: createDriver(),
    figure: null as THREE.Object3D | null,
    rig: null as ReturnType<typeof bindDriver> | null,
  };
});

const rivals = createRivals(
  physics,
  lapPath,
  LAPS,
  rivalRigs.map((r) => r.object),
  railSeats.map((seat) => seatSlots[seat]!),
);

/**
 * Put everyone nobody picked on the grid.
 *
 * The field is defined by subtraction, which is the whole of what makes it feel
 * like a cast rather than a set of opponents: pick the boss and you are racing the
 * other six's fastest four, and the boss is not also sitting behind you in his own
 * chair. Run at startup and on every change of driver.
 *
 * A set of taken riders rather than the one index it used to be, because in a room
 * every person takes one out of the roster and the computer gets what is left. The
 * roster is seven and the grid is five, so there is always enough to go round.
 *
 * Each slot is seated by *replacing* its figure, for the same reason the player's
 * is — a character is an asset, not a colourway — and each new figure gets its own
 * rig binding. Roster order is kept rather than shuffled, so the grid is the same
 * every time for a given choice, which is what lets a player learn that Facilities
 * on the front row is quick.
 */
function fieldAgainst(taken: ReadonlySet<number>): void {
  /*
   * The field, slowest at the front.
   *
   * The roster is in pace order and the grid used to be filled straight from it,
   * which quietly guaranteed the dullest possible race: the fastest chair started
   * first, the slowest started last, and in three laps not one of them ever had a
   * reason to pass another. Every overtaking behaviour in `rivals.ts` was dead code
   * on a grid sorted like that.
   *
   * Reversed, the race has something in it from the first corner — and it is the
   * right shape for the player as well, who starts behind all four: the chairs they
   * reach first are the ones they can actually get past, while the quick ones are
   * carving their own way up the road ahead in plain sight. That is the difficulty
   * ramp a five-minute race wants, and it costs one `sort`.
   */
  const others = RIDERS.filter((_, i) => !taken.has(i))
    .slice(0, railSeats.length)
    .sort((a, b) => a.pace - b.pace);
  rivals.setDrivers(others.map((r) => ({ label: r.label, pace: r.pace, drive: r.drive })));

  others.forEach((rider, i) => {
    const rig = rivalRigs[i];
    if (!rig) return;
    if (rig.figure) rig.object.remove(rig.figure);
    const figure = kitDriver(rider.key);
    rig.object.add(figure);
    rig.figure = figure;
    rig.rig = bindDriver(figure);
  });
}

/**
 * Reseat the field from whoever is currently spoken for.
 *
 * One line today — the only person on the grid is the one at this keyboard — and
 * the single place that has to learn about the others later. Both call sites went
 * through `garage.rider` directly before, which is the sort of thing that gets
 * missed exactly once.
 */
function refreshField(): void {
  // Everybody in the room takes a character out of the roster, not just the person at
  // this keyboard — otherwise the computer turns up driving somebody who is already
  // on the grid. Solo this is the one pick it always was.
  const taken = new Set<number>([garage.rider]);
  for (const member of room?.members ?? []) taken.add(member.rider);
  fieldAgainst(taken);
}

const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1600);

// ---------------------------------------------------------------------------
// Input — the game's, verbatim
// ---------------------------------------------------------------------------

const keys = new Set<string>();
const BLOCKED = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const race = createRace();

// The skin's own interface, not the game's recoloured. The first pass here did
// exactly that — `createHud()` with six custom properties overridden — and it is
// what the note at the top of `hud.ts` is about: a palette swap cannot fix a
// Helvetica rectangle over a room made of clay.
const hud = createClayHud();

/*
 * Where the player is round the lap: metres past the start line, negative on the
 * grid, and it is the *only* quantity in the game that means "where a chair is".
 *
 * The distinction it replaces cost two bugs, so it is worth saying plainly. There
 * are two numbers you can keep about a chair — how far it has driven since the
 * flag (its odometer, which starts at zero on every slot) and how far past the
 * line it is (its road, which starts at minus its own slot depth) — and only the
 * second one can be compared between two chairs. A grid is 3.5 m deep, so ranking
 * odometers is ranking a race in which every slot has its own start line: with
 * nobody moving at all it reads 5th at −0.1 m and 1st at 0.0.
 *
 * Everything downstream now speaks road: `Seat.progress`, `Rival.progress`, the
 * pose that goes over the wire, the item odds, the projectile gaps, the field's
 * rubber band and the standings. Nothing adds a grid handicap back on, because
 * nothing has to — the handicap is the metres between a slot and the line, and
 * every chair drives them.
 *
 * Standings are a comparison of distances, so the player needs the same figure the
 * rivals carry. Two ways to get it and only one that works: `race.lap` times the
 * lap length plus the nearest point on the route is the obvious one, and it jumps
 * by a whole lap every time the crossing and the nearest-point search disagree
 * about which side of the line the chair is on — which they do, for a frame, every
 * lap. So it is accumulated from the *change* in the nearest point instead, with
 * the wrap resolved by taking the short way round. Driving backwards takes it
 * down again, which is correct: reversing over the line is not a lap.
 */
let playerS = 0;
let playerProgress = 0;
/*
 * Whether the chair is still on the starting grid, which is not on the route.
 *
 * The grid is 3.5 m of floor behind the line laid on the line's own tangent — see
 * `grid.ts` — and the route behind the line is the hairpin, a metre and a half
 * away and at ninety degrees to it. So for the few seconds before the flag, asking
 * the route where the player is answers with a point on the hairpin and reports
 * two metres of progress the player has not driven. Measured on the grid instead,
 * and handed over to the route the moment the line is crossed, which is the one
 * frame where the two measures agree.
 */
let onGrid = true;

/**
 * The player, in the terms the field races in — see `PlayerOnTrack`.
 *
 * The lane is the interesting one: it is the chair's offset from the racing line on
 * the route's own right-hand normal, which is the exact frame a rival's `lane` is
 * measured in, so "is the player in my way" is one subtraction rather than a
 * geometry problem. Recomputed on the frame rather than the step because it feeds a
 * decision a rival re-takes every second and a half, not every 8 ms.
 */
const onTrack = new THREE.Vector3();
const player = { progress: 0, lane: 0, speed: 0 };

/**
 * Everybody on the grid the computer is not driving, which is what the field races.
 *
 * One entry today and the same object `readPlayer` fills in, so nothing about the
 * cost or the behaviour changes. It is a list because `rivals.update` now takes one:
 * a rail has to treat every person as traffic and rubber-band against the nearest,
 * and with a single element both of those are the numbers they always were.
 */
const humans: (typeof player)[] = [player];

function readPlayer(): void {
  player.progress = playerProgress;
  player.speed = chair.speed();
  lapPath.pointAt(playerS, onTrack);
  const yaw = lapPath.headingAt(playerS);
  player.lane =
    (chair.object.position.x - onTrack.x) * Math.cos(yaw) -
    (chair.object.position.z - onTrack.z) * Math.sin(yaw);
}

function trackPlayer(): void {
  if (onGrid) {
    // Road, measured on the grid straight, which is where the projection onto the
    // line's own run *is* the road: negative behind the line and zero on it. The
    // same number `rivals.ts` starts a rail on, arrived at by measurement rather
    // than by arithmetic, and it needs no slot depth adding to it — see the note
    // on `playerProgress`.
    const past = progressOnGrid(chair.object.position.x, chair.object.position.z);
    playerProgress = past;
    if (past < 0) {
      playerS = 0;
      return;
    }
    onGrid = false;
    playerS = past % lapPath.total;
  }

  const next = lapPath.nearest(chair.object.position, playerS, 7).s;
  let step = next - playerS;
  if (step > lapPath.total / 2) step -= lapPath.total;
  else if (step < -lapPath.total / 2) step += lapPath.total;
  playerProgress += step;
  playerS = ((next % lapPath.total) + lapPath.total) % lapPath.total;
}

/*
 * ---- items ----------------------------------------------------------------
 *
 * Six rows of piñatas on the route, five kinds of thing to find in one, and one
 * seat per chair to carry it. `game/items.ts` owns the rules, `game/projectiles.ts`
 * owns what flies, `pinatas.ts` owns the boxes and `itemArt.ts` owns the look; the
 * only thing that lives here is the wiring, because this is the one file that knows
 * the player and the field are the same kind of thing.
 *
 * Everything is built *after* `repaintObject(scene)`, for the same reason the donuts
 * are: an item is not furniture, the regrade would take it into the clay band, and a
 * pickup in the clay band is a pickup nobody can see.
 */

/*
 * A chair, as the item rules see one — see `game/seat.ts`, which is where the type
 * lives now that more than this file needs it.
 *
 * One flat list rather than "the player, and also the rivals", which is the whole
 * trick: a rival's `progress` and a person's are already the same quantity on the
 * same scale, so targeting, standings and every hit test are one comparison over
 * five identical records. Nothing in `items.ts` or `projectiles.ts` knows which of
 * them is being driven by a person.
 */
const seats: Seat[] = seatSlots.map((_, id) => ({
  id,
  position: new THREE.Vector3(),
  yaw: 0,
  progress: 0,
  stunned: 0,
  finished: false,
}));

const itemHud = createItemHud();
const rush = createRush();

/**
 * The rung a drift boost fired at this frame, and the worst clout taken.
 *
 * Both are collected inside the fixed step — where they happen — and spent on the
 * frame, which is the same arrangement `takeTrick` and `race.takeSplit` use and
 * for the same reason: a boost released inside a substep would otherwise be
 * reported up to eight times between two paints, and eight camera punches on one
 * corner is a seizure rather than a shot.
 */
let boostThisFrame = 0;
let impactThisFrame = 0;

/**
 * Not the seeded generator every builder in this project uses.
 *
 * The building is seeded because a room that comes out differently on two machines
 * is a bug. A race is the opposite: drawing the same five items in the same order
 * every time is the bug, and it is the one that would be noticed first.
 */
const itemPlay = createItemPlay({
  size: seats.length,
  rng: Math.random,
  human: (id) => id === localSeat,
  fire: (kind, owner, backwards) => projectiles.fire(kind, owner, backwards),
});

/**
 * What an item does to the chair on this screen.
 *
 * The only actor that has an interface as well as a body, and that is the whole of
 * what makes it different from a rail: a spin-out is a thing that happens to the
 * simulation *and* a thing the player has to be told about.
 */
const localActor: SeatActor = {
  stun(seconds, kind) {
    chair.stun(seconds);
    // The module blocks the screen for exactly as long as the spin-out, which is
    // the one place where the interface and the simulation have to agree to the
    // frame: a card that outlasts the stun is a card you sit behind while
    // driving, and one that ends early is a punishment with a seam in it.
    if (kind === 'training') itemHud.module(seconds);
  },
  push: (speed, hold) => chair.push(speed, hold),
  shove: (dx, dz, speed) => chair.shove(dx, dz, speed),
  blind: (seconds) => itemHud.blind(seconds),
};

/**
 * A chair the computer is driving.
 *
 * `shove` is missing on purpose rather than by omission: a rival is a distance
 * along the route plus a lane offset and has nowhere to be shoved to — see the note
 * on `stun` in `rivals.ts`. It inherits the no-op from `IDLE_ACTOR`, which is the
 * same nothing that used to happen when this file was the one deciding not to call
 * it, only now the decision is written where the reason is.
 */
const railActor = (rail: number): SeatActor => ({
  ...IDLE_ACTOR,
  stun: (seconds) => rivals.stun(rail, seconds),
  push: (speed, hold) => rivals.push(rail, speed, hold),
  blind: (seconds) => rivals.blind(rail, seconds),
});

/**
 * Who is in each seat, as the four things that can be done to them.
 *
 * This table is what replaced the `id === 0` / `id - 1` demux, and it is worth
 * saying what that bought beyond tidiness: those two tests encoded *three* separate
 * facts — that the person is seat 0, that rails are the rest, and that seat n is
 * rail n−1 — in a form where none of them could be changed without finding all of
 * the others. Here there is one array and the facts are its contents.
 *
 * It is also exactly where a network goes. Applying an effect that arrived off the
 * wire and applying one resolved here are the same four calls on the same table;
 * only which entry is which changes.
 */
const actors: SeatActor[] = seats.map((seat) =>
  seat.id === localSeat ? localActor : railActor(railOfSeat(seat.id)),
);

const effects: ItemEffects = {
  vulnerable: (id) => itemPlay.vulnerable(id),
  absorb: (id) => itemPlay.absorb(id),
  stun(id, seconds, kind) {
    // Whatever it was carrying is gone, and it cannot be hit again for a while.
    itemPlay.struck(id);
    actors[id]?.stun(seconds, kind);
  },
  shove: (id, dx, dz, speed) => actors[id]?.shove(dx, dz, speed),
  push: (id, speed, seconds) => actors[id]?.push(speed, seconds),
  blind: (id, seconds) => actors[id]?.blind(seconds),
};

/** Every puddle is its own splash, so each one gets its own stream of numbers. */
let spills = 0;

const itemArt: ItemArt = {
  binder: binder(),
  card: inviteCard(),
  microwave: microwaveBomb(),
  extinguisher: extinguisherArt(),
  puddle: () => puddleArt(makeRng(seedFrom(`clay.puddle.${spills++}`))),
  cloud,
};

const projectiles = createProjectiles(physics, lapPath, itemArt, effects);
scene.add(projectiles.root);

const pinatas = createPinatas(lapPath, physics);
scene.add(pinatas.group);

/**
 * Where a seat stands, 1-based.
 *
 * Three separate faults met here, and the fix needs all three halves.
 *
 * ---- it has to be everybody ----------------------------------------------
 *
 * This asked `rivals.placeOf`, which counts the computer's chairs. That was right
 * for exactly as long as the only person on the grid was the one reading the
 * number; in a room it cheerfully reported second place to somebody being led by
 * three of their friends. Verified in a two-client race: 4th, to a chair that was
 * genuinely last. The position on screen and the ordinal on the result card both
 * come from here, so both were wrong together.
 *
 * ---- and it has to be the road, not the odometer -------------------------
 *
 * Ranking distance *driven* sorts the field by how far each chair has travelled
 * since the flag, with every slot counting as its own start line, and on a grid
 * 3.5 m deep that is a different race: with nobody moving at all it reads 5th at
 * −0.1 m and 1st at 0.0, so the moment the back-row chair edges forward it leads a
 * race it has not started. It runs the other way for the rest of the lap too — a
 * chair genuinely 1.7 m up the road counts as behind, because it started further
 * forward and so has less road on its odometer.
 *
 * That fix used to live here, as a subtraction of the seat's own slot depth off
 * every reading. It has moved to the source: a seat's `progress` *is* the road now,
 * for rails, for people and for the chairs over the wire — see the note on
 * `playerProgress`. So this is a straight read, and, more to the point, so is every
 * other comparison of two chairs in the game. The item odds and the projectile
 * targeting were making the same mistake this note is about, silently, because they
 * were handed the same number and had no subtraction of their own.
 */
function roadOf(id: number): number {
  return seats[id]?.progress ?? 0;
}

/**
 * ---- and the road stops meaning anything at the flag --------------------
 *
 * Road is the right comparison for as long as everybody is still driving, and it
 * is the wrong one the moment somebody is not. A chair that has finished stops
 * where it stopped; a chair still on its last lap keeps going, sails past that
 * parked number, and is told it has moved up — and since the result card takes
 * the position on the frame the flag falls, the last player to finish read
 * "Won", every single time, whatever had happened in the three laps before it.
 *
 * So a race is two questions, in this order: has this chair finished, and if
 * both of us have, which of us finished first. Only chairs still running are
 * ranked on the road. The order below is recorded once per chair, at the moment
 * it takes the flag, which is the only moment at which it is knowable.
 */
const finishOrder: number[] = seats.map(() => 0);
let flagged = 0;

/** Everybody back on the grid, nobody finished. */
function resetStandings(): void {
  finishOrder.fill(0);
  flagged = 0;
}

/** Whoever has just taken the flag, in the order they took it. */
function noteFlag(): void {
  let fresh: number[] | null = null;
  for (const seat of seats) {
    if (seat.finished && finishOrder[seat.id] === 0) (fresh ??= []).push(seat.id);
  }
  if (!fresh) return;
  // Two chairs can cross inside one substep — 72 mm of road apart at racing speed
  // — and the one further up it crossed first. Without this the tie is broken by
  // seat number, which is the grid order, which is not a result.
  if (fresh.length > 1) fresh.sort((a, b) => roadOf(b) - roadOf(a));
  for (const id of fresh) finishOrder[id] = ++flagged;
}

/** Is `a` ahead of `b`? */
function ahead(a: number, b: number): boolean {
  const mine = finishOrder[a] ?? 0;
  const theirs = finishOrder[b] ?? 0;
  // Ties on the road go to whoever is asking — `>` and not `>=` — which is the
  // convention every racing game uses and the only one that does not read as
  // being robbed. Finishing order never ties: it is a sequence.
  if (mine === 0 && theirs === 0) return roadOf(a) > roadOf(b);
  return theirs === 0 || (mine !== 0 && mine < theirs);
}

function placeOf(id: number): number {
  let count = 0;
  for (const seat of seats) if (seat.id !== id && ahead(seat.id, id)) count++;
  return count + 1;
}

/** Carry where everybody is into the flat list the item rules read. */
function seatEveryone(): void {
  const me = seats[localSeat]!;
  const p = chair.body.translation();
  me.position.set(p.x, p.y - FLOOR_OFFSET, p.z);
  // Yaw off the body rather than off `chair.object`, because this runs inside the
  // fixed step and the mesh is only synced once a frame. The chair writes its
  // heading into the body's rotation every substep as a pure Y quaternion, so this
  // is the same number one line earlier.
  const r = chair.body.rotation();
  me.yaw = 2 * Math.atan2(r.y, r.w);
  me.progress = playerProgress;
  me.stunned = chair.stunned();
  me.finished = race.phase === 'finished';

  /*
   * The chairs being driven from another machine, taken from their interpolation
   * buffers. Read before the rails only because it reads better; they are the same
   * kind of record and everything downstream treats them identically.
   */
  if (proxies) {
    for (const seat of proxySeats) {
      const proxy = proxies.get(seat);
      const record = seats[seat];
      if (!proxy || !record || !proxy.live) continue;
      record.position.copy(proxy.position);
      record.yaw = proxy.yaw;
      record.progress = proxy.progress;
      record.stunned = proxy.stunned;
      record.finished = proxy.finished;
    }
  }

  // Taken once. `rivals.all` is a getter over however many rails are actually
  // racing, so it builds an array on every read — and this runs 120 times a second.
  const field = rivals.all;
  for (let rail = 0; rail < field.length; rail++) {
    const rival = field[rail]!;
    const seat = seats[seatOfRail(rail)];
    if (!seat) continue;
    seat.position.copy(rival.position);
    // The rival's own yaw is its mesh's, which is the route's heading turned into
    // the game's convention — so an item thrown by one leaves along the same facing
    // a person's would.
    seat.yaw = rival.yaw;
    seat.progress = rival.progress;
    seat.stunned = rival.stunned;
    seat.finished = rival.finished;
  }

  // Last, because it is a fact about the five records above and has to be taken
  // in the step they were written in: the flag falls inside a substep, and a
  // finishing order sampled once a frame is one that ranks two chairs 8 ms apart
  // by whichever of them the renderer happened to look at first.
  noteFlag();
}

/**
 * Move the chair between the two places the front end shows it.
 *
 * `true` is the showroom in the open plan — see `SHOWROOM` in plan.ts for why the
 * character select is shot among the desks. `false` is the grid slot it starts a
 * race from.
 *
 * A teleport rather than a second scene, and that is the whole trick: there is no
 * showroom set, no separate lighting rig and no duplicate of the chair. The front end
 * drives the player's chair to a clear stretch of the south aisle, photographs it
 * there, and drives it back to the grid when they press start. Everything that reads
 * the chair's position — the camera, the light pool, the depth of field, the swivel —
 * follows it without being told.
 *
 * Only from the title screen. Pausing mid-race shows you where you actually are,
 * because a pause menu that spirits the player off to a basement is a pause menu that
 * has lost the race.
 */
function stage(inShowroom: boolean): void {
  const to = inShowroom ? SHOWROOM : localSpawn();
  chair.place(to.position[0], to.position[2], to.yaw, 0, to.position[1]);
  chair.sync();
}

function restart(): void {
  // Onto this seat's slot rather than `chair.reset()`, which goes back to whichever
  // one the chair was built with. They are the same in a solo race and are not in a
  // room — see `localSpawn`.
  const to = localSpawn();
  chair.place(to.position[0], to.position[2], to.yaw, 0, to.position[1]);
  chair.sync();
  playerS = 0;
  playerProgress = 0;
  onGrid = true;
  // Nobody has finished a race that has not started. Left standing, last race's
  // order outranks this race's road and the whole grid reads as having finished
  // before the flag has even dropped.
  resetStandings();
  rivals.reset();
  for (const r of rivalRigs) r.driver.reset();
  dynamics.reset();
  driver.reset();
  routeAim.reset();
  // Every piñata back on its hook, everything in the air gone, five empty hands and
  // a clean screen. A race that starts with somebody's microwave still ticking from
  // the last one is not a restart.
  pinatas.reset();
  projectiles.reset();
  itemPlay.reset();
  itemHud.reset();
  rush.reset();
  race.reset();
  race.start();
  updateCamera(0, true);
}

/**
 * The boarding pass, which is the title screen and the pause both — see `menu.ts`.
 *
 * It is created after `restart` because it holds a reference to it, and its key
 * handler is registered on the document in the capture phase, which is what puts it
 * in front of the listener below: while the pass is up, nothing here hears anything
 * at all.
 *
 * The buffer scale is deliberately not on it. The controller holds it as high as
 * the machine can carry and − and + still override that, but a line about render
 * resolution on a boarding pass is a line nobody chose to read.
 */

/** Five drivers and four rides, all of them out of what is already loaded. */
const garage = createGarage(chair.object, useDriver);

/*
 * And a picture of every one of them, taken now.
 *
 * The character select shows the whole roster at once rather than one name with a
 * pair of arrows beside it, which means eleven portraits. They are rendered here,
 * from the same assets the game is about to drive — see the note at the top of
 * `portraits.ts` for why that beats both drawing them and baking them in Blender.
 *
 * Before the menu exists and after the kit has loaded, which is the only window
 * where it is free: the renderer is warm, nothing is on screen yet, and eleven
 * 192-pixel renders cost about a frame in total. Doing it lazily when the menu opens
 * would put that frame exactly where it is most visible.
 *
 * The ride models are built for the shot and thrown away — each builder makes its
 * own geometry and materials, so they are disposed rather than left to accumulate.
 * The drivers are not: `kitDriver` hands back a clone that shares the asset's
 * geometry, and disposing that takes the character out of the game with it.
 */
const portraits = {
  riders: RIDERS.map((r) => shoot(renderer, kitDriver(r.key), { head: true })),
  rides: RIDES.map((_, i) => {
    const build = RIDE_BUILDERS[i];
    const object = build ? build() : raceChair().group;
    const url = shoot(renderer, object, { fill: 0.76, yaw: Math.PI - 0.85 });
    if (build) {
      object.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    }
    return url;
  }),
};

const menu = createMenu({
  state: () => ({ racing: race.phase === 'racing' || race.phase === 'countdown' }),
  // From the grid this leaves it; from the result it is a fresh race, which is
  // the same thing said twice and so only offered once.
  start: () => {
    // Off the showroom floor and onto the grid. `restart` resets the chair itself,
    // so only the standing start has to be walked back up the ramp.
    if (race.phase === 'grid') {
      stage(false);
      race.start();
    } else restart();
  },
  resume: () => {},
  restart,
  garage: {
    rider: {
      label: () => garage.labels.rider,
      index: () => garage.rider,
      count: () => garage.counts.riders,
      art: portraits.riders,
      choose: (index, direction) => {
        garage.setRider(index);
        // The field is everyone else, so changing driver changes the grid.
        refreshField();
        // And the seat turns to show you who you just picked. See SWIVEL.
        presentDriver(direction);
      },
    },
    ride: {
      label: () => garage.labels.ride,
      index: () => garage.ride,
      count: () => garage.counts.rides,
      art: portraits.rides,
      choose: (index, direction) => {
        garage.setRide(index);
        presentDriver(direction);
      },
    },
  },
  /*
   * The room, reached through functions rather than handed over as an object.
   *
   * `createMenu` runs before the room section below exists — the front end is built
   * early because it owns the boot card — so everything here is a call made later,
   * from a click, by which time it does.
   */
  room: {
    available: MULTIPLAYER_AVAILABLE,
    state: () =>
      room
        ? {
            code: room.code,
            connected: room.connected,
            error: room.error,
            isHost: room.isHost(),
            you: room.you,
            members: room.members,
          }
        : null,
    name: () => playerName,
    setName: (value) => {
      playerName = value;
    },
    // Generates a code and joins it in one go: the player is never asked to pick or
    // confirm one, because a room code is an address they are given, not a name.
    create: () => enterRoom(newRoomCode()),
    join: (code) => enterRoom(code),
    leave: () => leaveRoom(),
    setReady: (ready) => room?.setReady(ready),
    start: () => room?.start(),
  },
});

/**
 * The pickups are down while the front end is up.
 *
 * The piñatas are saturated, floating and 900 mm across, and the showroom stands
 * six metres from a row of them — so without this the driver select is shot with
 * three of them over the driver's shoulder.
 */
function showPickups(staged: boolean): void {
  // Hidden outright in a room, rather than standing there un-takeable.
  if (online()) staged = true;
  // `staged` rather than `menu.open`, because the front end is on screen before the
  // menu is: `staging` holds the character-select framing from the first frame until
  // the title card has finished lifting, and a pickup that is only hidden once the
  // menu itself appears is a pickup visible for the whole of that.
  pinatas.group.visible = !staged;
  /*
   * And the colleagues, for a reason that is about the picture rather than the game.
   *
   * The showroom stands in the Grossraum and the office stand is nineteen metres up
   * the room from it, which is squarely in the background of the portrait — so the
   * character select was being shot with a crowd of jumping people over the driver's
   * shoulder, all of them competing with the one figure the screen exists to show.
   * They are track furniture: they belong to the race, and the race has not started.
   */
  crowd.group.visible = !staged;
}

/*
 * ---- racing against other people ------------------------------------------
 *
 * Everything above works the same whether there is anybody else in the room; this is
 * the part that puts them there. Three jobs and no more:
 *
 *  1. Take the seating the room dealt and rearrange the grid around it — who is at
 *     this keyboard, which slots the computer is left with, and which chairs are
 *     being driven from somewhere else.
 *  2. Say where this chair is, twenty times a second.
 *  3. Drop the flag when the room says to, rather than when this machine feels like
 *     it.
 *
 * **Items are off in a room, in this first cut.** The rules are host-authoritative
 * by design — see `Effect` in `net/protocol.ts`, which already carries them — but the
 * relay is not wired yet, and a microwave that goes off on one screen and not another
 * is worse than no microwave. Racing, contact, laps and standings all work; the
 * piñatas stay on their hooks. It is the next thing.
 */

/** The room, once joined. Null in a solo race, which is every race by default. */
let room: Room | null = null;
/** The other people's chairs, as poses to interpolate. Null when nobody else is in. */
let proxies: Proxies | null = null;
/** True between the room's start signal and leaving the room. */
let racingOnline = false;
/** Room-clock instant the flag drops, or null if it already has. */
let flagAt: number | null = null;
/** Seconds until this chair should say where it is again. */
let poseDue = 0;

const online = (): boolean => racingOnline && !!room;

/**
 * Rebuild the actors table for the current seating.
 *
 * A seat driven by another person gets `IDLE_ACTOR` and that is not a stub: they own
 * their own chair, so a stun applied to their proxy here would be a second opinion
 * about something their machine has already decided and is already telling us about
 * through its poses. The only honest thing to do locally is nothing.
 */
function rebuildActors(): void {
  for (const seat of seats) {
    actors[seat.id] =
      seat.id === localSeat
        ? localActor
        : railOfSeat(seat.id) >= 0
          ? railActor(railOfSeat(seat.id))
          : IDLE_ACTOR;
  }
}

/** Put the grid back the way a solo race wants it. */
function seatSolo(): void {
  humanSeats = [0];
  localSeat = 0;
  seatSlots = [PLAYER_SLOT, ...GRID_SLOTS.slice(0, MAX_RIVALS)];
  railSeats = [1, 2, 3, 4];
  proxySeats = [];
  rivals.reseat(railSeats.map((seat) => seatSlots[seat]!));
  rebuildActors();
  refreshField();
}

/**
 * Take the seating a room dealt.
 *
 * People take the front slots in the order they joined and the computer fills in
 * behind them, which is the arrangement that needs the least explaining: the grid
 * reads as "everyone who turned up, then the rest".
 */
function seatRoom(count: number, mine: number): void {
  humanSeats = Array.from({ length: count }, (_, i) => i);
  localSeat = mine;
  seatSlots = [...GRID_SLOTS];
  railSeats = [];
  for (let seat = count; seat < GRID_SLOTS.length; seat++) railSeats.push(seat);
  proxySeats = humanSeats.filter((seat) => seat !== mine);

  rivals.reseat(railSeats.map((seat) => seatSlots[seat]!));
  rebuildActors();

  /*
   * The chair meshes, divided up.
   *
   * There are exactly four of them and exactly four chairs that are not this one, so
   * they always go round: the rails take the first `railSeats.length` — which is what
   * `rivals.reseat` leaves racing — and the proxies take what is left. No new
   * geometry, no pool, and the rig each one already carries animates it.
   */
  proxies?.dispose();
  proxies = createProxies(
    physics,
    proxySeats.map((seat, i) => ({ seat, object: rivalRigs[railSeats.length + i]!.object })),
  );
}

/** Dress a chair mesh with a particular character. Used for the people in a room. */
function dressRig(index: number, key: DriverKey): void {
  const rig = rivalRigs[index];
  if (!rig) return;
  if (rig.figure) rig.object.remove(rig.figure);
  const figure = kitDriver(key);
  rig.object.add(figure);
  rig.figure = figure;
  rig.rig = bindDriver(figure);
}

/** Everything a race needs putting back, without touching the room. */
function resetForRace(): void {
  restart();
  proxies?.reset();
}

/** Hand the room to the front end, and take a seating back. */
const roomHandlers: RoomHandlers = {
  changed: () => menu.roomChanged(),
  started(message) {
    if (!room) return;
    const mine = message.seating.find((s) => s.id === room!.you)?.seat ?? 0;
    seatRoom(message.seating.length, mine);

    // Everybody wears the driver they picked in the lobby: the people over the wire
    // on the proxy rigs, and whatever the computer was left with on the rails.
    const byId = new Map(room.members.map((m) => [m.id, m]));
    proxySeats.forEach((seat, i) => {
      const who = message.seating.find((s) => s.seat === seat);
      const member = who && byId.get(who.id);
      if (member) dressRig(railSeats.length + i, RIDERS[member.rider]!.key);
    });
    refreshField();
    useDriver(RIDERS[garage.rider]!.key);

    racingOnline = true;
    poseDue = 0;
    resetForRace();
    // Held on the grid until the room's clock reaches the agreed instant. `restart`
    // has already called `race.start()`, so undo that and wait.
    race.reset();
    flagAt = message.at;
    menu.hide();
  },
  pose: (pose) => proxies?.accept(pose),
  effect: () => {
    // Items are off in a room for now — see the note at the top of this section.
  },
  lap: () => {},
};

/** Join a room, or leave the one we are in. Called by the lobby. */
function enterRoom(code: string): void {
  leaveRoom();
  room = joinRoom(
    code,
    { name: playerName, rider: garage.rider, ride: garage.ride },
    roomHandlers,
  );
}

function leaveRoom(): void {
  room?.leave();
  room = null;
  racingOnline = false;
  flagAt = null;
  proxies?.dispose();
  proxies = null;
  seatSolo();
  useDriver(RIDERS[garage.rider]!.key);
  resetForRace();
  race.reset();
}

/**
 * What to call this player.
 *
 * Kept here rather than in the room so that it survives leaving one and joining
 * another, which is what somebody racing a few rounds with the same friends will do.
 */
let playerName = '';

/*
 * ---- throwing things ------------------------------------------------------
 *
 * E forward, Q behind, and holding E drags the item along behind you instead of
 * firing it. That last one falls out of the two handlers rather than needing a mode:
 * the key going down starts the trail and the key coming up throws, so a tap is a
 * throw with a trail four hundredths of a second long and a hold is a shield you can
 * spend whenever you like. It is the same gesture every game of this kind uses, and
 * it is worth having because the field throws back.
 */
addEventListener('keydown', (e) => {
  if (BLOCKED.has(e.code)) e.preventDefault();
  if (e.code === 'KeyR') restart();
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') quality.step(-1);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') quality.step(1);
  if (e.code === 'Digit0' || e.code === 'Numpad0') quality.auto();
  if (!e.repeat && race.live && !menu.open) {
    if (e.code === 'KeyE') itemPlay.trail(localSeat, true);
    if (e.code === 'KeyQ') itemPlay.use(localSeat, true);
  }
  keys.add(e.code);
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyE' && race.live && !menu.open) itemPlay.use(localSeat, false);
  keys.delete(e.code);
});
addEventListener('blur', () => {
  // A key that goes down here and up in another window never comes up as far as this
  // page is concerned, and an item left trailing forever is one that can never be
  // thrown.
  itemPlay.trail(localSeat, false);
  keys.clear();
});

const held = (...codes: string[]) => codes.some((c) => keys.has(c));

const input: Input = { throttle: 0, steer: 0, drift: false };

function readInput(): void {
  if (!race.live) {
    input.throttle = 0;
    input.steer = 0;
    input.drift = false;
    return;
  }
  input.throttle = (held('KeyW', 'ArrowUp') ? 1 : 0) + (held('KeyS', 'ArrowDown') ? -1 : 0);
  input.steer = (held('KeyD', 'ArrowRight') ? 1 : 0) + (held('KeyA', 'ArrowLeft') ? -1 : 0);
  input.drift = held('Space', 'ShiftLeft');
}

// ---------------------------------------------------------------------------
// Chase camera
// ---------------------------------------------------------------------------

/**
 * Lower, wider and closer than the game's, and it moves.
 *
 * The shipped camera is 64° at 3.4 m with a 1.55 m eye, which looks down on the
 * desks. This sits at 1.28 — near enough the height of the sitter's own eyes —
 * and opens to 58°, so the partitions rush past instead of scrolling. Both
 * numbers are the lab's `clayBold` chase.
 *
 * The occlusion ray and the per-room ceiling clamp are the game's own and are
 * kept exactly: this is a real building with a slab over it, and a camera that
 * rises through the ceiling or parks inside a Stellwand ends the illusion far
 * faster than any lighting decision saves it.
 */
const CAM = {
  distance: 3.6,
  minDistance: 1.15,
  margin: 0.22,
  height: 1.28,
  aim: 0.58,
  baseFov: 58,
  fovPerSpeed: 1.9,
  /** Radians of roll per m/s of sideways slide, and a hard clamp on it. */
  rollPerSlide: 0.05,
  maxRoll: 0.16,

  /*
   * ---- when it cannot go back, it goes up ----------------------------------
   *
   * The occlusion clamp does the right thing and produces a terrible shot: it
   * pulls the boom in until the wall is clear, which at the limit is a lens 1.15 m
   * from the back of the driver's own head, at his eye line, seeing nothing else.
   * The start is the worst case and it is not a rare one — measured, the east
   * glazing stands 1.5 m behind the player's grid slot, so a camera asking for
   * 3.82 m gets 1.66 and the opening frame of every race is the inside of a
   * chair back. Doorways all round the lap do a smaller version of the same.
   *
   * A boom that cannot go backwards can still go *upward*, and that is a real
   * shot rather than a salvage: high and steep behind the chair, looking down the
   * road over it. So when the clamp bites, the rig asks a second question — how
   * far can it get going up and over instead — and takes whichever of the two
   * answers leaves more room. One extra raycast on the frames where it matters.
   */
  /**
   * How much higher the steep shot rides, metres above the normal lift.
   *
   * 0.8, and the first attempt at 1.45 is worth recording because it was wrong in
   * the interesting direction: it cleared the wall beautifully and put the lens
   * 2.35 m up on a 1.37 m boom, which is a 52° look-down — a helicopter shot of
   * the top of your own driver's head with the entire field outside the frame.
   * Fixing "the camera is in the wall" by making the camera useless is not fixing
   * it. Height alone was never the answer; see `squeezeAhead`.
   */
  squeezeLift: 0.8,
  /** And how much of the boom's length it keeps while doing it. */
  squeezePull: 0.55,
  /**
   * Seconds the rig takes to move between the open shot and the squeezed one.
   *
   * The first version had no such number, and that was the whole fault. It picked
   * the better of a flat boom and a steep one *per frame*, by a strict comparison
   * — so a doorframe drifting in and out of the ray's path flipped the shot
   * between two quite different camera angles from one frame to the next, and the
   * aim swung two and a half metres up the road with it. Correct every frame, and
   * unwatchable across them.
   *
   * There is no version of a binary choice that does not do this, so the choice is
   * gone: the two booms are *blended* by an eased figure, and this is how long the
   * ease takes. 0.4 s is slow enough that a doorway flickering past cannot move the
   * camera and quick enough that arriving at a real wall is dealt with before you
   * reach it.
   */
  squeezeEases: 0.4,

  /**
   * Where it looks when it has been squeezed: further up the road.
   *
   * This is the half of the fix that matters. A camera that cannot back away from
   * its subject has one other way to frame anything — stop pointing at the
   * subject. Aiming 2.4 m ahead of the chair swings the whole view up and forward,
   * so the driver drops into the bottom of the frame and what fills it is the
   * thing you actually need at a standing start: the four chairs in front and the
   * road past them. The lift is then only there to see over your own head.
   */
  squeezeAhead: 1.8,
  /** And a little extra height on the aim, so the horizon comes up with it. */
  squeezeAimUp: 0.3,

  /*
   * ---- what the camera does when something happens -------------------------
   *
   * The rig tracked speed and slide and nothing else, which is why gaining speed
   * felt like nothing: an FOV that widens smoothly with velocity is a lens, and a
   * lens is not an event. A drift boost is the biggest thing that happens in a
   * lap and it arrived silently.
   *
   * So a boost now punches the lens open and drops the boom back, both decaying
   * over about half a second — the frame it lands on is wide and far, and the
   * shot walks back in as the speed bleeds off. Scaled by the rung, so the third
   * tier is visibly a bigger event than the first, which is the whole argument
   * for having rungs.
   */
  /** Degrees of FOV added at the moment a top-rung boost fires. */
  boostFov: 7,
  /** And metres the boom drops back with it. */
  boostPull: 0.5,
  /** Seconds either takes to come back. */
  boostFor: 0.55,

  /*
   * And a kick when the room hits back.
   *
   * `chair.telemetry().impact` — the speed lost to a collision this substep — has
   * been computed since the driving model was written and **nothing has ever read
   * it**. Clouting a doorframe at six metres a second took two thirds of your
   * speed and the picture did not move, which is most of why the building feels
   * soft to drive in.
   *
   * A kick rather than hit-stop: freezing time is the usual trick and it is not
   * available here, because the race clock runs off the fixed substep and a lap
   * time that pauses when you crash is not a lap time.
   */
  /** Radians of roll thrown in per m/s of speed lost, and a clamp. */
  kickPerImpact: 0.05,
  maxKick: 0.2,
  /** Seconds it takes to settle. */
  kickFor: 0.4,

  /**
   * How close the *rescue* clamp may come, as against `minDistance`.
   *
   * They are two different jobs and they had one number. `minDistance` is a
   * composition floor — how near the lens is ever willingly parked, so the shot
   * does not become a shoulder. This is a safety floor, and it has to be smaller
   * than the thing it is rescuing from: with only the 1.15 m figure, a rival
   * sitting a metre off the player's back left the camera stopping *at* 1.15 m —
   * which is to say, inside it. Measured, that was 260 mm from the rider's head.
   *
   * 0.7 m is closer than any shot wants to be and it is only ever reached for a
   * moment, which is the correct trade: too close for a beat beats inside a head
   * for a beat.
   */
  hardMin: 0.7,
};

const desired = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const behind = new THREE.Vector3();
/** The up-and-over boom the rig falls back to when the flat one is blocked. */
const steep = new THREE.Vector3();
const pivot = new THREE.Vector3();
const toCamera = new THREE.Vector3();
let roll = 0;
/** 0…1, how much of a drift boost's punch is still on the lens. */
let punch = 0;
/** How blocked the ordinary boom is, eased. 0 open, 1 against a wall. */
let squeezed = 0;
/** And of an impact's kick, with the side it came from. */
let kick = 0;
let kickSide = 1;

function updateCamera(dt: number, snap = false): void {
  const yaw = chair.object.rotation.y;
  behind.set(Math.sin(yaw), 0, Math.cos(yaw));

  pivot.copy(chair.object.position);
  pivot.y += CAM.aim;

  // Both decay on their own clock so a boost taken mid-crash does not cancel it.
  punch = Math.max(0, punch - dt / CAM.boostFor);
  kick = Math.max(0, kick - dt / CAM.kickFor);

  const lift = CAM.height - CAM.aim;
  // Back as well as up on a boost: the shot opens out at the moment the speed
  // arrives and walks in again as it bleeds away.
  toCamera.copy(behind).multiplyScalar(CAM.distance + punch * CAM.boostPull).setY(lift);
  const boom = toCamera.length();
  toCamera.divideScalar(boom);

  /*
   * ---- one boom, blended, rather than a choice between two ----------------
   *
   * How blocked the ordinary shot is, as a fraction — 0 down an open corridor, 1
   * with a wall against the lens. That figure is then *eased*, and everything
   * downstream reads the eased one: the blend toward the steep boom, and how far
   * up the road the aim swings.
   *
   * This replaces a hard per-frame comparison — take the flat boom or the steep
   * one, whichever gained more height — and the comparison is what made the
   * camera change angle so violently. It was individually right on every frame
   * and wrong across them: a doorframe passing through the ray flipped the shot
   * between two quite different rigs and back again within a few frames, and
   * there is no threshold or hysteresis that fixes a binary choice being made
   * sixty times a second. Blending has no state to flip.
   */
  const flatClear = physics.rayToSolid(pivot, toCamera, boom + CAM.margin, chair.body);
  const blocked = THREE.MathUtils.clamp(1 - (flatClear - CAM.margin) / boom, 0, 1);
  squeezed += (blocked - squeezed) * Math.min(1, dt / CAM.squeezeEases);
  if (snap) squeezed = blocked;

  if (squeezed > 0.01) {
    // The steep shot, and the boom actually flown is the two of them mixed. Both
    // are directions on the same pivot, so mixing them is a mix of *angle*, which
    // is what the eye reads — the lens rises and comes in together.
    steep.copy(behind).multiplyScalar(CAM.distance * CAM.squeezePull).setY(lift + CAM.squeezeLift).normalize();
    toCamera.lerp(steep, squeezed).normalize();
  }

  const clear = physics.rayToSolid(pivot, toCamera, boom + CAM.margin, chair.body);
  const reach = Math.max(CAM.minDistance, Math.min(boom, clear - CAM.margin));

  desired.copy(pivot).addScaledVector(toCamera, reach);

  const b = shell.bounds;
  const at = chair.object.position;
  const room = roomAt(at.x, at.z, at.y);
  const headroom = room ? (room.ceiling > 0 ? room.ceiling - 0.25 : 4.2) : 2.2;
  desired.x = THREE.MathUtils.clamp(desired.x, b.minX, b.maxX);
  desired.z = THREE.MathUtils.clamp(desired.z, b.minZ, b.maxZ);
  desired.y = THREE.MathUtils.clamp(desired.y, at.y + 0.45, at.y + headroom);

  if (snap) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.pow(0.0006, dt));

  /*
   * And then the same test again, against where the lens actually ended up.
   *
   * The ray above clears the position the camera is *travelling to*; the camera
   * eases there over about a fifth of a second, and in that time a chair doing
   * five and a half metres a second can drive into the space it is crossing. That
   * is not a hypothetical — with only the first test, measured, the lens still
   * came within 240 mm of a rival's head, because the rival arrived after the
   * boom had been cleared.
   *
   * So the eased position is clamped too. This one is a hard correction rather
   * than a target: it moves the camera this frame, without easing, because a lens
   * inside somebody's head has to be out of it now rather than shortly.
   */
  toCamera.subVectors(camera.position, pivot);
  const held = toCamera.length();
  if (held > 1e-3) {
    toCamera.divideScalar(held);
    const room = physics.rayToSolid(pivot, toCamera, held + CAM.margin, chair.body);
    /*
     * Only when the lens is genuinely *through* something, not merely near it.
     *
     * The test used to be `room < held + margin`, which fires whenever anything at
     * all comes within the margin of the boom — down a corridor that is most
     * frames, and each one snapped the camera without easing. A rescue that runs
     * constantly is not a rescue, it is a second, jerkier camera fighting the
     * first. Dropped to the bare penetration test it fires only when it has
     * something to fix, and the ordinary easing is left to do the ordinary work.
     */
    if (room < held) {
      camera.position.copy(pivot).addScaledVector(toCamera, Math.max(CAM.hardMin, room - CAM.margin));
    }
  }

  /*
   * And the aim swings up the road by the same eased figure.
   *
   * `squeezed` rather than a fresh reading off `reach`, so the look direction and
   * the boom move together on one clock. Driven off `reach` it jittered: the
   * clamp is a hard number that changes the instant a ray clears, so the aim was
   * being thrown two metres forward and back between frames while the boom itself
   * was easing smoothly. One value, one ease, one motion.
   */
  aimPoint.copy(chair.object.position);
  aimPoint.y += CAM.aim + squeezed * CAM.squeezeAimUp;
  // Forward is the opposite of the boom's own direction along the floor.
  aimPoint.x -= behind.x * squeezed * CAM.squeezeAhead;
  aimPoint.z -= behind.z * squeezed * CAM.squeezeAhead;
  camera.lookAt(aimPoint);

  // Roll into the slide, off the chair's own lateral velocity. Clamped and
  // smoothed hard — a camera that tracks sideways speed one-to-one is a camera
  // nobody can drive behind. It is a garnish, and it is worth more than the
  // rest of the rig at conveying that something is happening.
  const wanted = THREE.MathUtils.clamp(
    chair.telemetry().lateralRight * CAM.rollPerSlide,
    -CAM.maxRoll,
    CAM.maxRoll,
  );
  roll = snap ? wanted : roll + (wanted - roll) * (1 - Math.pow(0.02, dt));
  // The impact kick rides on top of the roll rather than replacing it, and it is
  // not eased: a collision is the one thing on screen that should arrive on the
  // frame it happened. It decays, it does not ramp.
  camera.rotateZ(roll + (snap ? 0 : kick * CAM.maxKick * kickSide));

  const targetFov = CAM.baseFov + chair.speed() * CAM.fovPerSpeed;
  camera.fov += (targetFov - camera.fov) * (snap ? 1 : 1 - Math.pow(0.05, dt));
  // And the boost's punch, applied after the easing rather than through it —
  // eased, it would be a slow zoom, and the whole point is that it is a hit.
  camera.fov += punch * CAM.boostFov;
  camera.updateProjectionMatrix();
}

/**
 * The menu shot: one composed frame of the chair, held still.
 *
 * This was a turntable — a slow orbit, on the theory that a picker should show every
 * side of what it is picking. In practice a background that never stops moving is a
 * background you cannot stop looking at, and behind a menu that is a fault and not a
 * feature. So it is a still now: one three-quarter view, chosen and held.
 *
 * It is not a separate rig. It is the chase camera's own boom, with three deliberate
 * differences:
 *
 *  - It is parked at a fixed angle rather than following the chair's heading, so the
 *    driver is always seen from the front quarter — the one view that says who you
 *    picked.
 *  - It aims *off* the chair, by 0.8 m to the chair's left in screen terms, which
 *    puts the chair into the right third of the frame and the menu's type into
 *    the empty left. Composition, done by moving the target rather than by
 *    nudging the projection.
 *  - The occlusion ray and the ceiling clamp are kept. It is still a real
 *    building with a slab over it, and an orbit that swings through a Stellwand
 *    to show off a stool is worse than no orbit.
 *
 * The whole thing runs on a longer focal length than the chase — 42° against 58 —
 * because a wide lens 2.4 m from an office chair distorts it, and this is the one
 * moment in the game where the object is the subject.
 */
/*
 * The shot, and the two numbers that matter are `aim` and `distance`.
 *
 * The camera aims at 0.85 m — above the seat, near the sitter's chest — rather than at
 * the 0.62 it used to. Aiming higher pushes the subject *down* the frame, which leaves
 * air over the driver's hat instead of cropping it against the top edge. It was worth
 * having when the menu hung a card up there and it is still worth having now that the
 * menu is a rail down the left: a figure jammed into the top of the frame reads as a
 * mistake whether or not there is type beside it. The boom grew with it so the figure
 * does not fill the frame it now has to share.
 */
/*
 * Closer and lower than it was: 2.95 m at 1.24, against 3.5 at 1.42.
 *
 * The old boom framed the whole room with a figure in it. This one frames the
 * figure, with the room behind — which is what a character select is, and it is
 * most of why the screen now reads as a portrait rather than as a screenshot of
 * the game with a menu over it. Lower, too, so the camera is nearer the sitter's
 * own eye line and looking very slightly up at him instead of down.
 *
 * `aim` came back down to 0.78 after the first pass at 0.88 cropped the shoes
 * against the bottom edge. A figure cut off at the shin reads as a mistake; the
 * castors are half of what the joke is about and they stay in frame.
 */
const SHOW = { distance: 3.1, height: 1.22, aim: 0.78, offset: 0.66, fov: 40 };

const showAim = new THREE.Vector3();
const showRight = new THREE.Vector3();
/**
 * Where the camera stands, in radians round the chair *from directly behind it*.
 *
 * Relative to the chair's own heading, which is the whole point and was the bug: read
 * as a world bearing it framed whatever the spawn happened to be pointing at, and on
 * this floor the spawn faces up the hall — so the driver select opened on the back of
 * the driver's head, which is the one shot that says nothing about who you picked.
 * Added to the chair's yaw it is always the same view of the driver.
 *
 * π is dead in front: the driver looks down the lens.
 *
 * This walked in from 42° — a proper three-quarter — to 2.82 rad, which is 18° off the
 * nose, on the argument that a figure whose face is four flat clay planes needs to be
 * nearly frontal before it reads as a face at all, but that a little turn keeps the
 * shot from being a passport photograph. The first half of that was right and the
 * second half was the mistake: at 18° the driver is not looking at you, he is looking
 * just past your shoulder, and on a character select — where the entire question being
 * asked is *who is this* — being looked at is worth more than being composed.
 *
 * So it is frontal, and the shot gets its asymmetry from somewhere that costs nothing:
 * `showcase` already aims off the chair to put it in the right third of the frame, and
 * the seat turns on its own below. A subject squared up to the lens in an off-centre
 * frame is a portrait; it was only ever the *pose* that risked being a passport photo.
 */
const SHOW_ANGLE = Math.PI;

/**
 * And the angles it will settle for, in order of preference.
 *
 * A single fixed angle is not enough in a real building, which is what the first still
 * got wrong: the grid sits a metre and a half from a glazed wall, the preferred
 * three-quarter view puts the camera outside it, the occlusion ray does its job, and the
 * boom collapses to its 1.15 m minimum — a hero shot of somebody's shoulder. So the
 * shot is chosen rather than declared: walk out from the front quarter in both
 * directions and take the first angle with a clear boom, or failing that the one with
 * the most room. Eight short raycasts against a parked chair, which is nothing beside
 * the frame they inform.
 */
const HERO_ANGLES = [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7].map((d) => SHOW_ANGLE + d);

const probe = new THREE.Vector3();

/*
 * ---- the seat turns, and it is the whole difference between a portrait and a
 * ---- product photograph ---------------------------------------------------
 *
 * Everything above composes a still. It is a *good* still, and held for thirty
 * seconds while somebody reads a roster it is also an inventory photograph: a man
 * sitting perfectly motionless in an office chair, in a room where nothing moves,
 * under lights that do not flicker. The eye finishes it in about a second and then
 * has nowhere to go. Nothing in the shot was wrong; there was simply no life in it.
 *
 * The camera is deliberately not what moves — that was tried, it was a camera
 * turntable, and an *orbit* that never stops is a background you cannot stop
 * looking at, because everything in the room slides behind a subject that never
 * changes. What moves is the *chair*, and the reason this is the right answer
 * rather than merely an available one is that it is what the thing being drawn
 * actually does. An office chair swivels. The whole game is about that chair, so
 * the one piece of motion the screen gets is the one piece of motion the object
 * has: the room stays still, the seat comes round.
 *
 * It began as an idle — ±4.5° on an eleven-second sine, a figure shifting in his
 * seat — and it is a full turn now, about twenty seconds a revolution. Which is a
 * different thing and answers a different question. The sine says *this is alive*.
 * A revolution says *this is what you picked, from every side* — the hat from the
 * back, the lanyard, what the chair's frame actually looks like — and on a screen
 * whose entire job is choosing between eleven things that differ only in their
 * silhouette, showing the silhouette all the way round is the screen doing its
 * work rather than decorating itself.
 *
 * And it can be taken hold of, which is the half that makes it a *picker* rather
 * than an animation. Drag anywhere off the rail and the seat follows the pointer
 * one-to-one, either way; let go and it keeps whatever spin the flick gave it and
 * eases back into the slow turn. That is a turntable in the sense a shop window is
 * one, and it is the one interaction on this screen that is about the object
 * instead of about the list.
 *
 * So there is exactly one quantity — `turnRate`, radians a second — and everything
 * writes to it:
 *
 *  - **the idle** is what it decays back to, and is the whole of the motion when
 *    nobody touches anything.
 *  - **the drag** overrides it outright, because a dragged object that lags the
 *    finger is a dragged object nobody believes; the release hands back the
 *    pointer's own velocity, so a flick throws it.
 *  - **the present**, a kick whenever the driver or the chair changes. This is the
 *    one piece of feedback the model gave you before and it gave it in the worst
 *    possible way: the old figure vanished and a new one appeared in the identical
 *    pose in the identical place, which reads as a texture swap. Turning into the
 *    new one says *this is somebody else* with the chair rather than with a
 *    transition. It rides on the same rate as everything else, so the kick is a
 *    change of speed rather than a separate spring fighting the turn.
 *
 * The camera does not follow any of it. It is parked on the yaw the chair had when
 * the menu opened — `showYaw`, below — precisely so the swivel is visible: a camera
 * bolted to a rotating subject renders a subject that never rotates, which is the
 * bug the first cut of this shipped with for exactly one screenshot. `heroShot`
 * reads `showYaw` for the same reason, so a seat coming round cannot walk the
 * camera to a different side of the room.
 */
const SWIVEL = {
  /** Radians a second left alone: 2π/0.32 ≈ twenty seconds a revolution. */
  idle: 0.32,
  /**
   * Radians of seat per pixel of drag.
   *
   * Set so a drag across the full width of a 1440-pixel window is a little over
   * one revolution — near enough one-to-one that the seat feels held rather than
   * geared, and short enough that you can get all the way round a figure without
   * running out of desk.
   */
  perPixel: 0.0052,
  /**
   * Seconds a thrown spin takes to give back two thirds of its speed to the idle.
   *
   * Exponential rather than linear, so a hard flick decays fast while it is fast
   * and then coasts — which is what a chair on a gas lift does, and what makes the
   * difference between letting go of something and switching an animation on.
   */
  settle: 1.1,
  /** As fast as a flick is allowed to throw it. Past this it is a strobe. */
  maxRate: 11,
  /** The kick a change of driver or chair is worth, radians a second. */
  shove: 2.2,
};

/** The chair's own heading, taken on the frame the menu opened. See SWIVEL. */
let showYaw = 0;
/** How far round the seat has come from that heading, and how fast it is going. */
let turned = 0;
let turnRate = SWIVEL.idle;

/**
 * Turn the seat, because what is in it just changed.
 *
 * Direction comes through so stepping *up* the roster and stepping *down* it turn
 * opposite ways — a swivel that always goes the same way is an animation, one that
 * follows the arrow key is a response. Added to the rate rather than assigned, so
 * holding an arrow down winds the seat up instead of re-triggering the same nudge.
 */
function presentDriver(direction: 1 | -1): void {
  turnRate = THREE.MathUtils.clamp(turnRate + SWIVEL.shove * direction, -SWIVEL.maxRate, SWIVEL.maxRate);
}

/*
 * ---- and the pointer, which is the other half of it -----------------------
 *
 * Registered on the window rather than on the canvas, because the canvas is not
 * what the pointer lands on: `#menu` is a fixed, full-screen element and it takes
 * every event over the whole viewport while it is up. So the test is not *what was
 * hit* but *what was not*: anything inside the rail or the briefing sheet belongs
 * to the interface and is left alone, and everything else — which is the picture —
 * is the turntable.
 *
 * `staged` rather than `menu.open`, for the same reason every other decision about
 * the room reads it: the shot is on screen before the menu is, and a figure you
 * cannot grab for the first half second is a figure that looks like it was never
 * meant to be grabbed.
 */
/** Whether the world is on the character select. Written once a frame in `frame`. */
let staged = true;
/** The pointer id currently turning the seat, or null. */
let turning: number | null = null;
let lastX = 0;
let lastAt = 0;
/**
 * Pointer velocity in radians a second, smoothed.
 *
 * Smoothed rather than taken from the last event, because a pointer that stops
 * dead a frame before it is lifted reports zero — which throws away the whole
 * gesture and makes a fast drag end in a dead stop about a third of the time.
 * Smoothed *hard* the other way and a flick would have to be sustained to
 * register, so a third of the new reading a move is about right.
 */
let flick = 0;

/** Does this event belong to the interface rather than to the picture? */
function onInterface(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('.rail, .briefing') !== null;
}

addEventListener('pointerdown', (e) => {
  if (!staged || turning !== null || e.button !== 0 || onInterface(e.target)) return;
  turning = e.pointerId;
  lastX = e.clientX;
  lastAt = e.timeStamp;
  flick = 0;
  turnRate = 0;
  document.body.style.cursor = 'grabbing';
});

addEventListener('pointermove', (e) => {
  if (e.pointerId !== turning) return;
  const step = (e.clientX - lastX) * SWIVEL.perPixel;
  lastX = e.clientX;
  turned += step;
  /*
   * And the rate that move implies, folded into a running average.
   *
   * Off the event's own clock rather than the frame's: a pointer reports at the
   * device's rate, which on a trackpad is faster than the display and on a
   * coalesced touchmove is slower, and dividing a real delta by an assumed 16 ms
   * makes a slow careful drag throw as hard as a flick. Floored at a quarter of a
   * millisecond so two events in the same tick cannot divide by nothing.
   */
  const dt = Math.max(0.00025, (e.timeStamp - lastAt) / 1000);
  lastAt = e.timeStamp;
  flick += (step / dt - flick) * 0.35;
  e.preventDefault();
});

function release(e: PointerEvent): void {
  if (e.pointerId !== turning) return;
  turning = null;
  // Whatever the flick was worth, and from here the ordinary decay carries it back
  // to the idle — including all the way through zero if it was thrown backwards.
  turnRate = THREE.MathUtils.clamp(flick, -SWIVEL.maxRate, SWIVEL.maxRate);
  document.body.style.cursor = staged ? 'grab' : '';
}
addEventListener('pointerup', release);
addEventListener('pointercancel', release);

/** The angle, and how much boom it has: see HERO_ANGLES. */
function heroShot(boom: number): { angle: number; clear: number } {
  let best = HERO_ANGLES[0]!;
  let bestClear = -1;
  const lift = (SHOW.height - SHOW.aim) / SHOW.distance;

  for (const angle of HERO_ANGLES) {
    // The parked heading, not the seat's current one: the swivel must not be able to
    // change which angle the shot was chosen at, or a figure turning 4° in his chair
    // makes the camera hop to a different side of him.
    const yaw = showYaw + angle;
    probe.set(Math.sin(yaw), lift, Math.cos(yaw)).normalize();
    const clear = physics.rayToSolid(pivot, probe, boom + CAM.margin, chair.body);
    if (clear >= boom) return { angle, clear };
    if (clear > bestClear) {
      bestClear = clear;
      best = angle;
    }
  }
  return { angle: best, clear: bestClear };
}

/**
 * @param snap true on the first frame the menu is up: place the camera rather than ease
 *             it. A composed still should be composed from the first frame — easing into
 *             it means the menu opens on a shot nobody chose, and on a slow frame budget
 *             it can spend a second and a half there.
 */
function showcase(dt: number, snap: boolean): void {
  /*
   * The seat, before the camera — the shot is composed against the heading the chair
   * parked on, and the swivel is written on top of it afterwards.
   *
   * `snap` is the frame the menu opened on, which is where the parked heading is
   * taken and where the swivel is zeroed. It has to be zeroed: the sine is driven off
   * a clock that starts here, so a menu re-opened mid-lap would otherwise begin with
   * the seat already 4° off true and settle into a shot nobody composed.
   */
  if (snap) {
    showYaw = chair.object.rotation.y;
    turned = 0;
    turnRate = SWIVEL.idle;
  }

  /*
   * One rate, decaying to the idle, integrated into one angle — except while the
   * pointer has hold of it, when the angle is written directly by the drag and
   * there is nothing here to add.
   *
   * The decay is exponential and framed as a half-life rather than a step, so it
   * behaves the same at 30 fps as at 144 and a dropped frame cannot overshoot the
   * idle and reverse the turn.
   */
  if (turning === null) {
    turnRate = SWIVEL.idle + (turnRate - SWIVEL.idle) * Math.pow(0.33, dt / SWIVEL.settle);
    turned += turnRate * dt;
  }
  chair.object.rotation.y = showYaw + turned;

  pivot.copy(chair.object.position);
  pivot.y += SHOW.aim;

  /*
   * A 40° lens at 3 m frames a seated figure and its ride on a 16:9 window and crops the
   * driver's hat off on a tall one, so a narrow frame needs more subject in view. The
   * first fix was to walk the camera backwards, and it was the wrong one: the grid is a
   * metre and a half from a glazed wall in a hall full of sofas, there is no angle with
   * five metres of clearance behind it, and every extra metre demanded came straight
   * back off the boom as an occlusion clamp. So the *lens* widens and the boom barely
   * moves — which is what a photographer with their back to a wall does too.
   */
  const tall = THREE.MathUtils.clamp(1.55 / camera.aspect, 1, 1.45);
  const pull = THREE.MathUtils.lerp(1, 1.16, (tall - 1) / 0.45);
  const fov = SHOW.fov * tall;
  // And on a narrow window there is no room to put the subject in the right third,
  // because the card is already using most of the width.
  const offset = SHOW.offset * (camera.aspect > 1.3 ? 1 : 0.3);

  // The boom this window wants, then the best angle that can actually carry it.
  const reach = Math.hypot(SHOW.distance, SHOW.height - SHOW.aim) * pull;
  const { angle, clear } = heroShot(reach);

  const yaw = showYaw + angle;
  toCamera
    .set(Math.sin(yaw), 0, Math.cos(yaw))
    .multiplyScalar(SHOW.distance * pull)
    .setY((SHOW.height - SHOW.aim) * pull)
    .normalize();

  /*
   * How far the camera actually got, which is not always how far it asked to go: this is
   * a real building, the grid is in a glazed hall, and the occlusion clamp regularly
   * brings the boom in by half a metre or more. Left alone that makes the driver bigger
   * in frame in exactly the rooms with least space around him — so the lens gives back
   * what the room took, and the figure subtends the same angle wherever the shot ends up
   * standing. It is the one correction that keeps the driver select looking like the same
   * shot from one ride to the next.
   */
  const stood = Math.max(CAM.minDistance, Math.min(reach, clear - CAM.margin));
  const framed = (2 * Math.atan(Math.tan((fov * Math.PI) / 360) * (reach / stood)) * 180) / Math.PI;

  desired.copy(pivot).addScaledVector(toCamera, stood);

  const at = chair.object.position;
  const room = roomAt(at.x, at.z, at.y);
  const headroom = room ? (room.ceiling > 0 ? room.ceiling - 0.25 : 4.2) : 2.2;
  desired.y = THREE.MathUtils.clamp(desired.y, at.y + 0.35, at.y + headroom);

  if (snap) camera.position.copy(desired);
  else camera.position.lerp(desired, 1 - Math.pow(0.002, dt));

  // The screen-right of the current boom, which is what "0.8 m to the left of
  // the chair" has to mean while the camera is going round it.
  showRight.set(toCamera.z, 0, -toCamera.x);
  showAim.copy(pivot).addScaledVector(showRight, -offset);
  camera.lookAt(showAim);

  roll = snap ? 0 : roll * Math.pow(0.02, dt);
  camera.rotateZ(roll);

  camera.fov = snap ? framed : camera.fov + (framed - camera.fov) * (1 - Math.pow(0.02, dt));
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------

/**
 * The canvas's real box, measured rather than guessed.
 *
 * `clientWidth` is an integer and it is *zero* before the element has been laid
 * out — which, on a page that opens behind a full-screen title card, is exactly
 * when this module first runs. The fallback was 1280×720, so on any window that
 * is not that size the opening frames were composed into a buffer of the wrong
 * shape and stretched to fit: a soft, slightly wrong-aspect picture that snapped
 * sharp a few frames later when the real box finally reported. That is the
 * "blurry, then sharper" on the character select.
 *
 * `getBoundingClientRect` gives sub-pixel numbers and, more to the point, gives
 * them correctly the moment the element has a box at all.
 */
function box(): [number, number] {
  const r = canvas.getBoundingClientRect();
  return [Math.round(r.width) || canvas.clientWidth || innerWidth, Math.round(r.height) || canvas.clientHeight || innerHeight];
}

let [cssWidth, cssHeight] = box();
let ratio = Math.min(devicePixelRatio, 2);

const post = createClayPost(renderer, scene, camera, cssWidth, cssHeight, ratio);

function applySize(force = false): void {
  const [w, h] = box();
  if (!force && w === cssWidth && h === cssHeight) return;
  cssWidth = w;
  cssHeight = h;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  post.setSize(w, h, ratio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

/**
 * The quality ladder now moves two things, and the second is the one that matters.
 *
 * Measured on one frame: scene 979 draws and 4.2 M triangles in **2.3 ms**, the
 * whole simulation **1.55 ms**, the post chain **17.6 ms**. Nine tenths of the
 * frame is six full-screen passes, so a controller that only ever scaled the
 * buffer was rearranging the 11% it could reach. On a machine that could not hold
 * 60 it walked the pixel ratio down to its floor and then had nothing left to
 * give, still running ambient occlusion and a full-resolution bokeh.
 *
 * So the bottom of the ladder cuts passes instead. The mapping is deliberately
 * blunt — there is no point interpolating between "runs" and "does not" — and it
 * is keyed off the ratio the controller settled on, because that is exactly its
 * verdict on how much machine there is.
 *
 * The floor comes down to 1.0 as well. 1.25 was never a floor for a weak machine,
 * it was a floor for a good one: on a HiDPI laptop it is a buffer 56% larger than
 * the panel, which is the most expensive rung being treated as the cheapest.
 */
const quality = createQuality({
  min: 1,
  max: Math.min(devicePixelRatio, 2),
  apply: (next) => {
    ratio = next;
    post.setDetail(next >= 1.75 ? 2 : next >= 1.25 ? 1 : 0);
    applySize(true);
  },
});

const focusPoint = new THREE.Vector3();

function tick(dt: number): void {
  /*
   * The flag, on the room's clock rather than on this machine's whim.
   *
   * Everybody was handed the same instant when the host pressed start, and everybody
   * has measured their own offset from the room's clock — see `net/clock.ts` — so
   * calling `race.start()` when that instant arrives puts five countdowns within a
   * few milliseconds of each other. The three seconds of 3-2-1 absorbs the rest.
   *
   * In `tick` rather than in `frame`, for the same reason the lap timer is: this is a
   * thing that happens to the race, and a race event resolved on the render loop is
   * one that happens at a different moment on a fast machine and a slow one.
   */
  if (flagAt !== null && room && room.clock.now() >= flagAt) {
    flagAt = null;
    race.start();
  }

  // Where the player is round the lap, first, because everything below reads it: the
  // rivals' rubber band, which side one comes past on, the standings, and which chair
  // an item is thrown at. It used to sit in `frame` immediately above the call to
  // this — the same once a frame, in the same order — and moving it in is what makes
  // a tick a whole step of the game rather than most of one.
  trackPlayer();
  readPlayer();
  readInput();
  boostThisFrame = 0;
  impactThisFrame = 0;
  physics.step(dt, (h) => {
    chair.update(h, input);
    // The loudest of whatever happened across this frame's substeps. Taken here
    // because `takeBoost` clears itself, and a substep that is not read is a
    // boost that never happened as far as the screen is concerned.
    boostThisFrame = Math.max(boostThisFrame, chair.takeBoost());
    impactThisFrame = Math.max(impactThisFrame, chair.telemetry().impact);
    driver.update(h, chair.telemetry(), input);
    const p = chair.body.translation();
    const v = chair.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    const scale = speed > 0.001 ? 1 / speed : 0;
    race.update(h, p.x, p.y - FLOOR_OFFSET, p.z, v.x * scale, v.z * scale, speed);
    /*
     * The field, advanced in the same fixed step the player is.
     *
     * In here rather than on the frame because they are bodies in the same world:
     * a kinematic capsule moved once a frame and stepped at 120 Hz is one that can
     * pass clean through the player between two solves. The player's progress is
     * the figure taken at the top of the frame — one nearest-point search a frame
     * is ample for a rubber band measured in tens of metres, and for a rival
     * deciding which side of the player to come past on.
     */
    rivals.update(h, race.phase === 'racing', humans, race.totalTime);

    /*
     * And the items, last in the step, because everything they read has just moved.
     *
     * In here rather than on the frame for the reason the field is: a card doing
     * twelve metres a second covers 200 mm between paints on a good frame and 600 on
     * a bad one, and a hit resolved once a frame is a hit that depends on the frame
     * rate. The same argument `race.ts` makes about the finish line.
     */
    seatEveryone();
    itemPlay.update(h, seats, race.totalTime);
    projectiles.update(h, seats);
  });
  chair.sync();
  dynamics.sync();
  driverRig.apply(driver.pose);

  /*
   * Hand this frame's events to the camera before it is moved, so the punch and
   * the kick are on the shot that gets drawn rather than the one after it.
   *
   * The impact threshold is 1.4 m/s of speed lost. Below that is a kerb, a
   * threshold strip or a rival's flank brushed at an angle — things that happen
   * constantly and must not shake the frame, or the whole lap trembles.
   */
  if (boostThisFrame > 0) punch = Math.min(1, boostThisFrame / DRIFT_TIERS.length);
  if (impactThisFrame > 1.4) {
    kick = Math.min(1, impactThisFrame * CAM.kickPerImpact / CAM.maxKick);
    // Thrown away from whichever side took it, so a wall clipped on the left
    // rolls the shot right. Sideways speed is the only clue available about
    // where the hit came from and it is the right one.
    kickSide = chair.telemetry().lateralRight >= 0 ? -1 : 1;
  }

  updateCamera(dt);
  lighting.update(chair.object.position);
  // After the camera, because what the pool should light is what is about to be
  // on screen, and the camera is what decides that.
  pool.update(camera.position, dt);
  // After the camera, because the focal distance is measured from it.
  focusPoint.copy(chair.object.position);
  focusPoint.y += 0.55;
  post.focusOn(camera, focusPoint);
  routeAim.update(chair.object.position);
  crowd.update(dt);

  // The boxes on the frame rather than in the step, unlike everything else about
  // items — a piñata is nearly a metre across, nothing takes one at more than
  // 8.6 m/s, and 70 mm of frame-rate slop against a 720 mm reach is not a
  // race-deciding quantity. What it buys is the bob, the spin and the burst running
  // on the same clock the rest of the scene animates on.
  pinatas.update(
    dt,
    seats,
    localSeat,
    // Nothing is on offer in a room — see the note on items in the room section.
    (id) => !online() && race.live && itemPlay.wants(id),
    (id) => void itemPlay.give(id, itemPlay.placeOf(id)),
  );

  // Whatever the player is dragging, drawn where they are dragging it. Nothing
  // collides with it — the shield is resolved in `items.absorb` at the moment of the
  // hit — so this is purely the picture of one.
  /*
   * Say where this chair is, and draw everybody else's.
   *
   * On the frame rather than in the step, and at a fixed rate rather than every
   * frame: twenty a second is `POSE_HZ`, which is what the interpolation on the
   * other end is built around, and sending at the render rate would mean a machine
   * holding 144 fps flooding one holding 40 with poses it cannot use.
   */
  if (online() && room) {
    const clock = room.clock.now();
    poseDue -= dt;
    if (poseDue <= 0) {
      poseDue = 1 / POSE_HZ;
      const me = seats[localSeat]!;
      room.sendPose({
        seat: localSeat,
        t: clock,
        x: me.position.x,
        y: me.position.y,
        z: me.position.z,
        yaw: me.yaw,
        progress: me.progress,
        stunned: me.stunned,
        finished: me.finished,
      });
    }
    proxies?.update(clock);
  }

  const slot = itemPlay.slots[localSeat]!;
  projectiles.trail(
    localSeat,
    slot.trailing ? slot.held : null,
    chair.object.position,
    chair.object.rotation.y,
  );
}

const clock = new THREE.Clock();

chair.sync();
lighting.update(chair.object.position);
updateCamera(0, true);
// Settle the pool onto the grid before compiling, so the programs baked here
// are the ones a full pool actually uses.
pool.update(camera.position, 1);

applySize(true);
renderer.compile(scene, camera);

/*
 * Everything is built, warmed and standing on the grid, so the holding card in
 * index.html has done its job.
 *
 * The menu's *interface* waits for the card rather than cross-fading with it: both
 * carry the same wordmark, in different places, and for a third of a second there were
 * two of them on screen at once. Title card, wipe, rail — in that order. The timeout is
 * the belt to the transition's braces, because a `transitionend` that never fires (a
 * display change, a backgrounded tab) would leave the game with no front end at all.
 *
 * The menu's *shot* does not wait, and that is the fix for the worst half-second in the
 * game. The card fades over 460 ms and what it was fading to reveal was the race: the
 * chase camera on the grid, four rivals lined up in front of you, the driving exposure,
 * the sharp background — held for a beat and then replaced wholesale by a portrait of
 * one man in an empty hall. Loading screen, glimpse of a race that has not started,
 * character select. The glimpse is the bug, and it was never a transition anyone
 * designed: it was the gap between the card leaving and the menu opening, and the scene
 * had no instruction about what to be during it.
 *
 * So `staging` puts the scene on the character select from the first frame the loop
 * ever runs, long before the card lifts — see `frame`, where it stands in for
 * `menu.open` in every decision about what the *world* looks like, and only there. The
 * first frame anybody sees is the composed shot, and the rail arrives on top of a
 * picture that is already right.
 */
let staging = true;

// And the chair is in the showroom before the first frame is drawn, not moved there
// once the card lifts: the whole point of `staging` is that what the card uncovers is
// already the finished shot.
stage(true);

const boot = document.getElementById('boot');
if (boot) {
  let handed = false;
  const hand = () => {
    if (handed) return;
    handed = true;
    boot.remove();
    /*
     * Re-size on the frame the card comes off, before anybody sees the room.
     *
     * The card is a full-screen element and removing it is a layout change, so
     * the canvas's box can be settling right up to this moment. Everything up to
     * here was composed behind something opaque; this is the first frame that is
     * actually looked at, and it is the one that has to be right rather than the
     * one after it.
     */
    applySize(true);
    staging = false;
    menu.show();
  };
  boot.addEventListener('transitionend', hand);
  setTimeout(hand, 700);
  boot.classList.add('gone');
} else {
  staging = false;
  menu.show();
}

// The opening grid, against whoever the default driver is not.
refreshField();

/** Whether last frame was spent on the menu's turntable. See `frame`. */
let orbiting = false;

/**
 * How many opening frames re-apply the size whether or not the box changed.
 *
 * `applySize` only acts on a change, which is right for a resize handler and
 * wrong for the opening frames. A canvas whose context came up before layout — an
 * iframe, a tab that was not visible when it loaded, an embedded preview — gives
 * the composer a degenerate drawing buffer to size its targets from, and then
 * never changes its CSS box again, so nothing ever asks for them a second time.
 * The symptom is not a crash: it is a full-screen brown smear, with
 * `Framebuffer is incomplete: attachment has zero size` behind it, lasting until
 * something else happens to resize the window.
 *
 * Six frames rather than one, because the buffer can still be degenerate on the
 * frame after layout — the size has to be re-applied once the context is really
 * presenting, and a tenth of a second of redundant target allocation at startup
 * is a price worth paying to never ship that smear.
 *
 * Plus one late pass, for a tab that is shown after it loads: nothing resizes on
 * becoming visible, so a frame counter has already run out by then.
 *
 * What this does *not* fix is an embedding that never presents at all — the dev
 * preview pane runs the loop at 800 fps with one draw call and stays a smear no
 * matter when the size is re-applied, and only a real resize of its window brings
 * it back. That one is not ours.
 */
let settling = 6;
setTimeout(() => applySize(true), 400);

function frame(): void {
  applySize(settling > 0);
  if (settling > 0) settling--;
  const dt = Math.min(clock.getDelta(), 0.05);

  /*
   * Whether the world is on the character select — which is not the same question as
   * whether the menu is up, and the difference is the whole of the opening.
   *
   * `staging` is true from the first frame until the title card has finished lifting,
   * so the shot, the lights, the lens and the field are all already the portrait's
   * behind a card nobody can see through. `menu.open` takes over the moment the rail
   * arrives. Every decision about the *room* below reads this; every decision about the
   * *interface* still reads `menu.open`.
   *
   * Declared at module scope rather than here because the pointer handlers that turn
   * the seat read it too, and they run between frames — see the note above SWIVEL.
   */
  /*
   * A pause is a private thing; a race is not.
   *
   * Solo, the menu freezes the world outright — `tick` is not called, the clock and
   * the solver hold exactly where they were, and that is the right behaviour for one
   * person pausing their own game. In a room it is not available: four other people
   * are still driving, and a client that stops stepping stops sending poses and
   * arrives back seconds behind a race that never waited. So online the menu is an
   * overlay over a race that keeps running, and `staging` — the front end's own
   * showroom, before any of this — is the only thing that still freezes it.
   */
  staged = online() ? staging : menu.open || staging;

  // Paused means the simulation stops and the frame does not: the menu is a
  // blur over a live view of the room, and a still image behind it would be a
  // screenshot with a menu on it. Nothing in `tick` runs — the clock, the solver
  // and the driver's animation are all held exactly where they were — and the
  // keys are dropped, so a W held down while the menu came up is not still held
  // down on the way out of it.
  if (menu.open) keys.clear();

  if (staged) {
    keys.clear();
    // The camera is the only thing still moving, and it is the point of the
    // screen: the menu picks the driver and the chair, so it looks at them. The
    // light pool travels with it, because the pool is the building's own fittings
    // and a camera that orbits away from the set it was compiled for takes the
    // room's light with it.
    showcase(dt, !orbiting);
    // The turntable gets its own balance: key off the lens, rim behind the head,
    // room fill up. See the note on `portrait` in lighting.ts.
    lighting.portrait(camera, chair.object.position);
    pool.update(camera.position, dt);
    // On the sitter's chest rather than on the chair's origin, which is on the floor
    // between the castors — a shallow depth of field focused there leaves the one thing
    // the screen is about, the driver's head, a foot behind the focal plane and soft.
    focusPoint.copy(chair.object.position);
    focusPoint.y += 0.85;
    post.focusOn(camera, focusPoint);
  } else {
    // Coming off the turntable the boom is somewhere the chase camera never put
    // it. Snapped rather than eased: a two-second swoop back into position while
    // the countdown is already running is the camera taking a turn it was not
    // offered.
    /*
     * The seat is left wherever the turntable had it, which is now anywhere at all
     * rather than the five degrees the old idle could reach — press start while the
     * figure is showing you his back and the mesh is 180° off the heading the solver
     * believes it is on. The next fixed step writes the body's own transform back
     * over the mesh, but the camera is snapped *this* frame, so it has to be put back
     * first or the lap opens looking down the hall the wrong way.
     *
     * `chair.sync()` rather than writing `showYaw`, which is what this used to do and
     * was quietly wrong even at five degrees: `showYaw` is the heading the chair had
     * when the *menu* opened, and the menu opens in the showroom while the race starts
     * on the grid. Two different headings. The body is the only thing that knows which
     * one is current, so ask it.
     */
    /*
     * The resolution controller only watches the *race*.
     *
     * It used to sample every frame, including the whole of the character select
     * — which is a different program: no simulation, no field, one still figure,
     * and the full post chain over it. Judging the buffer on that and then
     * carrying the verdict into the race is measuring the wrong thing, and it is
     * why the opening looked soft and then sharpened. The first frames of a
     * session are also its most expensive — shaders compiling, targets
     * allocating — so the menu is precisely where the numbers lie most.
     *
     * So the ladder now opens at the top, holds there for the portrait, and only
     * starts forming an opinion once there is a lap to form it about.
     */
    quality.sample(dt);

    if (orbiting) {
      chair.sync();
      updateCamera(0, true);
    }
    tick(dt);

    // The rivals' own animation. Synthetic telemetry: they have a speed and
    // nothing else — no slip, no charge, no impacts — and a throttle held down
    // whenever they are moving, which is what makes the legs work.
    // Only the rails that are racing have a state to animate off. In a room the
    // computer may be driving two chairs, or none, and the rest are parked.
    const racing = rivals.all;
    for (const [i, rig] of rivalRigs.entries()) {
      const state = racing[i];
      if (!state) continue;
      rig.driver.update(
        dt,
        { along: state.speed, lateralRight: 0, charge: 0, impact: 0, airborne: false, air: 0 },
        { throttle: state.speed > 0.2 ? 1 : 0, steer: 0, drift: false },
      );
      rig.rig?.apply(rig.driver.pose);
    }
  }

  /*
   * The grid is not part of the character select.
   *
   * On the turntable the four of them stand in the frame behind your own driver,
   * out of focus, in the same chair — which reads as the game having drawn the
   * player four times rather than as a grid, and it is the first thing anybody
   * asks about. They come back the moment the menu closes, which is also the
   * moment they mean something.
   */
  /*
   * The pickups are down whenever the front end is up, checked every frame.
   *
   * This used to sit inside the transition below with everything else, which is a
   * reasonable saving on two boolean writes and was hiding a real failure: if the
   * frame the menu opened on never ran the comparison — a throttled tab, a frame
   * dropped on the way into the title — nothing ever put them away again, and the
   * character select was shot with a piñata row over the driver's shoulder and a
   * checkpoint donut in the corner.
   *
   * It never showed while the showroom was down in the car park, because there is
   * nothing to see there. Moving the shot into the open plan, six metres from a
   * row, is what made a latent bug into the first thing in frame. Two writes a
   * frame is not a cost worth a class of bug.
   */
  showPickups(staged);

  if (staged !== orbiting) {
    // Bloom is a driving effect. See the note on `glow` in post.ts.
    post.glow(!staged);
    // And the character select is shot on a different lens: open the aperture so the
    // office behind the subject goes soft, and close the vignette in. See `portrait`.
    post.portrait(staged);
    /*
     * And the whole frame comes down a third of a stop for the menu.
     *
     * The rig ratios were right — one key, real shade, low fill — and the picture was
     * still too bright, because a ratio says nothing about level. 0.6 is set for a
     * lap that spends half its time in a sunlit hall and the other half in a
     * basement, where the eye is moving and the bright end is where the drama is. A
     * still portrait of a figure in a white t-shirt wants the opposite: the shirt at
     * three quarters of the range rather than at the top of it, so it has folds, and
     * the room behind it dark enough to be a room rather than a background.
     */
    renderer.toneMappingExposure = staged ? 0.42 : 0.6;
    for (const rig of rivalRigs) rig.object.visible = !staged;
    /*
     * And the picture says it can be picked up.
     *
     * On the body rather than on the canvas, because the canvas is not what the
     * pointer is over — `#menu` covers the whole viewport while it is up. The rail's
     * own controls set `cursor: pointer` on themselves and win over this, which is
     * exactly the right split: a hand over the room, a finger over the list.
     *
     * A drag in progress is dropped on the way out. The menu can close under a held
     * pointer — Enter on the start bar, or Escape — and a race that begins with the
     * turntable still owning the seat is a race whose chair spins on the grid.
     */
    document.body.style.cursor = staged ? 'grab' : '';
    if (!staged) turning = null;
  }
  orbiting = staged;

  post.render();

  // Not merely "whenever the menu is down": on the grid there is no lap, no clock and
  // no speed to read, and during the half second between the title card wiping and the
  // menu arriving the whole instrument set used to flash up over the hero shot.
  hud.setVisible(!menu.open && race.phase !== 'grid');
  itemHud.setVisible(!menu.open && race.phase !== 'grid');
  rush.setVisible(!menu.open && race.phase !== 'grid');
  rush.update(dt, chair.speed() * 3.6, chair.driftCharge(), chair.driftTier(), boostThisFrame);
  itemHud.update(dt, itemPlay.heldBy(localSeat), itemPlay.slots[localSeat]!.trailing);

  // The taxiway sign points down the racing line rather than at the gate: a bearing
  // to a checkpoint through a wall, across a junction, or on the level below is
  // correct and unusable. It is the last of the guidance left standing, and it is an
  // instrument rather than a thing in the room, which is why it stayed.
  const aim = routeAim.at;
  const at = chair.object.position;
  hud.update(
    race,
    dt,
    chair.speed() * 3.6,
    chair.driftCharge(),
    bearingTo(camera, aim[0], aim[1], at),
    at,
    chair.object.rotation.y,
    chair.telemetry().air,
    // Taken on the frame, not in the step: a landing inside a substep would
    // otherwise be reported up to eight times before the next paint.
    chair.takeTrick(),
    placeOf(localSeat),
    seats.length,
  );
  requestAnimationFrame(frame);
}

frame();

if (import.meta.env.DEV) {
  /*
   * The three gates, back on the handle.
   *
   * They were owned by the entry point this file replaced and went orphaned when it
   * was deleted — three hundred lines of tooling still in the tree with nothing
   * able to call them. `routeTest` is the one that matters most and needs no
   * simulation at all: it walks the lap at 250 mm intervals and asks the solver
   * whether a chair standing there would be inside something, reporting the width
   * of the gap as well as the fact of it. Anything that puts furniture near the
   * racing line — planting a doorway, parking the waist of the car park, closing a
   * hall down its middle — is one line of dressing away from a lap that cannot be
   * completed, and this is the only thing that catches it before a player does.
   */
  const { runRouteTest } = await import('../../dev/routeTest');
  const { runSettleTest } = await import('../../dev/settleTest');
  const { runTunnelTest } = await import('../../dev/tunnelTest');

  Object.assign(window, {
    clay: {
      /** Static gate: is the lap actually drivable? Needs no simulation. */
      routeTest: (step?: number) => runRouteTest(physics, step),
      settleTest: (seconds?: number) => runSettleTest(dynamics, tick, keys, seconds),
      tunnelTest: (opts?: Parameters<typeof runTunnelTest>[4]) =>
        runTunnelTest(chair, physics, tick, keys, opts),
      chair,
      rivals,
      shell,
      camera,
      scene,
      renderer,
      physics,
      race,
      quality,
      lighting,
      routeAim,
      pinatas,
      crowd,
      projectiles,
      itemPlay,
      rush,
      seats,
      /*
       * The standings, as the two functions rather than as the number on screen.
       *
       * A place is the one thing in the game that cannot be read off a screenshot
       * and cannot be checked by eye: it is right or wrong only in relation to
       * where five chairs are and which of them have finished, and both of the
       * bugs it has had were invisible until somebody drove three whole laps and
       * looked at the last two metres. On the handle they can be asked, off a
       * scripted race, in a tab that never paints.
       */
      placeOf,
      roadOf,
      /*
       * The fixed-step tick and the key set, on the handle.
       *
       * The three gates above already take these — `tunnelTest` says why in its own
       * header: it runs off the tick rather than the render loop, so it needs
       * neither a visible tab nor a single rendered frame. Everything about items
       * wants the same thing, and wants it interactively: a request animation frame
       * that is throttled or suspended (a background tab, an embedded preview pane)
       * leaves the whole simulation frozen with the countdown still on screen, and
       * there is then no way to ask a question about a race.
       */
      tick,
      keys,
      pool,
      post,
      CAM,
      route: ROUTE,
      gates: GATES,
      THREE,
    },
  });
}
