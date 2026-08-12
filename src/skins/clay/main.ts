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
import { createRivals, FIELD_SIZE } from '../../game/rivals';
import { PLAYER_SLOT, progressOnGrid } from '../../game/grid';
import { createRouteAim } from './routeAim';
import { createClayLighting } from './lighting';
import { createClayPost } from './post';
import { repaintBuilding, repaintObject } from './repaint';
import { createClayHud } from './hud';
import { createMenu } from './menu';
import { createGarage, RIDE_BUILDERS, RIDERS, RIDES } from './garage';
import { shoot } from './portraits';
import { makeRng, seedFrom } from '../../office/rng';
import { createItemPlay, type Racer } from '../../game/items';
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

const chair = createChair(physics, shell.spawn);
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
const rivalRigs = Array.from({ length: FIELD_SIZE }, (_, slot) => {
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

const rivals = createRivals(physics, lapPath, LAPS, rivalRigs.map((r) => r.object));

/**
 * Put everyone the player did not pick on the grid.
 *
 * The field is defined by subtraction, which is the whole of what makes it feel
 * like a cast rather than a set of opponents: pick the boss and you are racing the
 * other six's fastest four, and the boss is not also sitting behind you in his own
 * chair. Run at startup and on every change of driver.
 *
 * Each slot is seated by *replacing* its figure, for the same reason the player's
 * is — a character is an asset, not a colourway — and each new figure gets its own
 * rig binding. Roster order is kept rather than shuffled, so the grid is the same
 * every time for a given choice, which is what lets a player learn that Facilities
 * on the front row is quick.
 */
function fieldAgainst(picked: number): void {
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
  const others = RIDERS.filter((_, i) => i !== picked)
    .slice(0, FIELD_SIZE)
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
 * Where the player is round the lap, as one number that only ever goes up.
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
    const past = progressOnGrid(chair.object.position.x, chair.object.position.z);
    // Driven distance, on the same scale as the field's: zero on the slot, and the
    // slot's own depth of it banked by the time the line goes under the castors.
    playerProgress = PLAYER_SLOT.back + past;
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

/**
 * A chair, as the item rules see one. Index 0 is the player.
 *
 * One flat list rather than "the player, and also the rivals", which is the whole
 * trick: a rival's `progress` and the player's are already the same quantity on the
 * same scale, so targeting, standings and every hit test are one comparison over
 * five identical records. Nothing in `items.ts` or `projectiles.ts` knows which of
 * them is being driven by a person.
 */
type Seat = { -readonly [K in keyof Racer]: Racer[K] } & { position: THREE.Vector3 };

const seats: Seat[] = [
  { id: 0, position: new THREE.Vector3(), yaw: 0, progress: 0, stunned: 0, finished: false },
  ...rivals.all.map((_, i) => ({
    id: i + 1,
    position: new THREE.Vector3(),
    yaw: 0,
    progress: 0,
    stunned: 0,
    finished: false,
  })),
];

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
  fire: (kind, owner, backwards) => projectiles.fire(kind, owner, backwards),
});

const effects: ItemEffects = {
  vulnerable: (id) => itemPlay.vulnerable(id),
  absorb: (id) => itemPlay.absorb(id),
  stun(id, seconds, kind) {
    // Whatever it was carrying is gone, and it cannot be hit again for a while.
    itemPlay.struck(id);
    if (id === 0) {
      chair.stun(seconds);
      // The module blocks the screen for exactly as long as the spin-out, which is
      // the one place where the interface and the simulation have to agree to the
      // frame: a card that outlasts the stun is a card you sit behind while
      // driving, and one that ends early is a punishment with a seam in it.
      if (kind === 'training') itemHud.module(seconds);
    } else {
      rivals.stun(id - 1, seconds);
    }
  },
  shove(id, dx, dz, speed) {
    // Only the player. A rival is a distance along the route plus a lane offset and
    // has nowhere to be shoved to — see the note on `stun` in `rivals.ts`.
    if (id === 0) chair.shove(dx, dz, speed);
  },
  push(id, speed, seconds) {
    if (id === 0) chair.push(speed, seconds);
    else rivals.push(id - 1, speed, seconds);
  },
  blind(id, seconds) {
    if (id === 0) itemHud.blind(seconds);
    else rivals.blind(id - 1, seconds);
  },
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

/** Carry where everybody is into the flat list the item rules read. */
function seatEveryone(): void {
  const me = seats[0]!;
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

  for (let i = 0; i < rivals.all.length; i++) {
    const rival = rivals.all[i]!;
    const seat = seats[i + 1]!;
    seat.position.copy(rival.position);
    // The rival's own yaw is its mesh's, which is the route's heading turned into
    // the game's convention — so an item thrown by one leaves along the same facing
    // the player's would.
    seat.yaw = rival.yaw;
    seat.progress = rival.progress;
    seat.stunned = rival.stunned;
    seat.finished = rival.finished;
  }
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
  const to = inShowroom ? SHOWROOM : shell.spawn;
  chair.place(to.position[0], to.position[2], to.yaw, 0, to.position[1]);
  chair.sync();
}

function restart(): void {
  chair.reset();
  playerS = 0;
  playerProgress = 0;
  onGrid = true;
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
        fieldAgainst(garage.rider);
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
});

/**
 * The pickups are down while the front end is up.
 *
 * The piñatas are saturated, floating and 900 mm across, and the showroom stands
 * six metres from a row of them — so without this the driver select is shot with
 * three of them over the driver's shoulder.
 */
function showPickups(staged: boolean): void {
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
    if (e.code === 'KeyE') itemPlay.trailPlayer(true);
    if (e.code === 'KeyQ') itemPlay.usePlayer(true);
  }
  keys.add(e.code);
});
addEventListener('keyup', (e) => {
  if (e.code === 'KeyE' && race.live && !menu.open) itemPlay.usePlayer(false);
  keys.delete(e.code);
});
addEventListener('blur', () => {
  // A key that goes down here and up in another window never comes up as far as this
  // page is concerned, and an item left trailing forever is one that can never be
  // thrown.
  itemPlay.trailPlayer(false);
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
 * The camera is deliberately not what moves — that was tried, it was a turntable,
 * and an orbit that never stops is a background you cannot stop looking at. What
 * moves is the *chair*, and the reason this is the right answer rather than merely
 * an available one is that it is what the thing being drawn actually does. An
 * office chair swivels. Somebody sitting in one, waiting, idly turns a few degrees
 * one way and back, and the whole game is about that chair, so the one piece of
 * motion the screen gets is the one piece of motion the object has.
 *
 * Two parts, and they are kept separate because they mean different things:
 *
 *  - **the idle**, ±4.5° on an eleven-second sine. Slow enough that you cannot
 *    catch it starting, wide enough that the rim light crawls along a shoulder and
 *    the hat brim's shadow moves across the face. Nothing at a glance, everything
 *    over the ten seconds anybody spends here.
 *  - **the present**, a shove of about 20° that springs back whenever the driver or
 *    the chair changes. This is the one piece of feedback the model gave you before
 *    and it gave it in the worst possible way: the old figure vanished and a new one
 *    appeared in the identical pose in the identical place, which reads as a texture
 *    swap. Turning into the new one says *this is somebody else* with the chair
 *    rather than with a transition.
 *
 * The camera does not follow any of it. It is parked on the yaw the chair had when
 * the menu opened — `showYaw`, below — precisely so the swivel is visible: a camera
 * bolted to a rotating subject renders a subject that never rotates, which is the
 * bug the first cut of this shipped with for exactly one screenshot.
 */
const SWIVEL = {
  /** Half-width of the idle, radians. */
  sweep: 0.078,
  /** Radians a second, so 2π/0.57 ≈ eleven seconds a round trip. */
  rate: 0.57,
  /** The shove a change of driver or chair is worth, radians a second. */
  shove: 1.1,
  /** The spring that brings it back: stiff enough to settle in about a second. */
  stiffness: 11,
  damping: 4.6,
};

/** The chair's own heading, taken on the frame the menu opened. See SWIVEL. */
let showYaw = 0;
/** How far the shove has pushed the seat off the idle, and how fast. */
let shoved = 0;
let shoveRate = 0;
let showClock = 0;

/**
 * Turn the seat, because what is in it just changed.
 *
 * Direction comes through so stepping *up* the roster and stepping *down* it turn
 * opposite ways — a swivel that always goes the same way is an animation, one that
 * follows the arrow key is a response.
 */
function presentDriver(direction: 1 | -1): void {
  shoveRate += SWIVEL.shove * direction;
}

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
    showClock = 0;
    shoved = 0;
    shoveRate = 0;
  }
  showClock += dt;

  // A damped spring, so the shove overshoots a little and settles rather than sliding
  // back — which is what a chair somebody has pushed round actually does.
  shoveRate += (-SWIVEL.stiffness * shoved - SWIVEL.damping * shoveRate) * dt;
  shoved += shoveRate * dt;
  chair.object.rotation.y = showYaw + Math.sin(showClock * SWIVEL.rate) * SWIVEL.sweep + shoved;

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
    rivals.update(h, race.phase === 'racing', player, race.totalTime);

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
    (id) => race.live && itemPlay.wants(id),
    (id) => void itemPlay.give(id, itemPlay.placeOf(id)),
  );

  // Whatever the player is dragging, drawn where they are dragging it. Nothing
  // collides with it — the shield is resolved in `items.absorb` at the moment of the
  // hit — so this is purely the picture of one.
  const slot = itemPlay.slots[0]!;
  projectiles.trail(slot.trailing ? slot.held : null, chair.object.position, chair.object.rotation.y);
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
fieldAgainst(garage.rider);

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
   */
  const staged = menu.open || staging;

  // Paused means the simulation stops and the frame does not: the menu is a
  // blur over a live view of the room, and a still image behind it would be a
  // screenshot with a menu on it. Nothing in `tick` runs — the clock, the solver
  // and the driver's animation are all held exactly where they were — and the
  // keys are dropped, so a W held down while the menu came up is not still held
  // down on the way out of it.
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
    // The seat is left where the swivel had it, which is up to five degrees off the
    // heading the solver believes it is on. The next step writes the body's own yaw
    // back over it, but the camera is snapped *this* frame — so put it back first, or
    // the lap opens on a shot aimed five degrees wide of the hall.
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
      chair.object.rotation.y = showYaw;
      updateCamera(0, true);
    }
    tick(dt);

    // The rivals' own animation. Synthetic telemetry: they have a speed and
    // nothing else — no slip, no charge, no impacts — and a throttle held down
    // whenever they are moving, which is what makes the legs work.
    for (const [i, rig] of rivalRigs.entries()) {
      const state = rivals.all[i]!;
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
  itemHud.update(dt, itemPlay.held, itemPlay.slots[0]!.trailing);

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
    rivals.placeOf(playerProgress),
    FIELD_SIZE + 1,
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
