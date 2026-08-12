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
import { createChair, FLOOR_OFFSET, type Input } from '../../game/chair';
import { createPhysics } from '../../game/physics';
import { createDynamics } from '../../game/dynamics';
import { createDriver } from '../../game/driver';
import { bearingTo, createRace } from '../../game/race';
import { bindDriver } from '../../render/driverRig';
import { createQuality } from '../../render/quality';
import { driver as kitDriver, loadKit, raceChair, type DriverKey } from '../../render/kit';
import { createLightPool } from '../../render/lights';
import { createDonuts } from './donuts';
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

const physics = await createPhysics([...shell.collision, ...dressing.collision]);

const dynamics = createDynamics(physics.world, dressing.dynamic);
scene.add(dynamics.root);

const chair = createChair(physics, shell.spawn);
scene.add(chair.object);

// The checkpoints, made literal. Added after `repaintObject` so the regrade
// does not reach them — a donut is the one thing in this building that is
// allowed to be fully saturated. Purely visual: the gate is still taken by the
// same plane crossing in race.ts that it always was.
//
// And now the only thing in the world that marks the lap. The escape-route
// signage and the floor's pink rings both used to say the same thing in two
// other registers; the donut says it once, so it is the one that stayed.
const donuts = createDonuts(GATES);
scene.add(donuts.group);

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

/**
 * Move the chair between the two places the front end shows it.
 *
 * `true` is the showroom on Ebene 5 — see `SHOWROOM` in plan.ts for why the character
 * select is a garage scene. `false` is the grid slot it starts a race from.
 *
 * A teleport rather than a second scene, and that is the whole trick: there is no
 * showroom set, no separate lighting rig and no duplicate of the chair. The building
 * already contains a windowless concrete level nobody was looking at, so the front
 * end drives the player's chair down there, photographs it, and drives it back up
 * when they press start. Everything that reads the chair's position — the camera, the
 * light pool, the depth of field, the swivel — follows it without being told.
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
  donuts.reset();
  routeAim.reset();
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
 * The donuts are down while the menu is up, and that is the whole of it now.
 *
 * The first gate's donut stands on the start line, the chair is parked on the start
 * line, and the menu's camera sits under three metres away — so the first frame of
 * the picker was a driver almost entirely inside a two-metre pink torus. The donut
 * is for the lap; while the chair is the subject it is scenery in the way.
 *
 * This used to be a settings function, called `applyGuides`, and it hid three things
 * at once behind a switch on the menu: these donuts, the escape-route signage, and a
 * second set of pink rings the floor builder was laying at the same eleven gates. The
 * signage and the rings are gone, the switch with them, and what is left is not a
 * setting — it is one object getting out of the way of one shot.
 */
function showDonuts(): void {
  donuts.group.visible = !menu.open;
}

addEventListener('keydown', (e) => {
  if (BLOCKED.has(e.code)) e.preventDefault();
  if (e.code === 'KeyR') restart();
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') quality.step(-1);
  if (e.code === 'Equal' || e.code === 'NumpadAdd') quality.step(1);
  if (e.code === 'Digit0' || e.code === 'Numpad0') quality.auto();
  keys.add(e.code);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

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
};

const desired = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const behind = new THREE.Vector3();
const pivot = new THREE.Vector3();
const toCamera = new THREE.Vector3();
let roll = 0;

function updateCamera(dt: number, snap = false): void {
  const yaw = chair.object.rotation.y;
  behind.set(Math.sin(yaw), 0, Math.cos(yaw));

  pivot.copy(chair.object.position);
  pivot.y += CAM.aim;

  const lift = CAM.height - CAM.aim;
  toCamera.copy(behind).multiplyScalar(CAM.distance).setY(lift);
  const boom = toCamera.length();
  toCamera.divideScalar(boom);

  const clear = physics.rayToStatic(pivot, toCamera, boom + CAM.margin, chair.body);
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

  aimPoint.copy(chair.object.position);
  aimPoint.y += CAM.aim;
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
  camera.rotateZ(roll);

  const targetFov = CAM.baseFov + chair.speed() * CAM.fovPerSpeed;
  camera.fov += (targetFov - camera.fov) * (snap ? 1 : 1 - Math.pow(0.05, dt));
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
 * 2.82 rad is 18° off the nose. The first still stood at 42° — a proper three-quarter —
 * and at that angle, on a figure whose face is four flat clay planes under a hat brim,
 * the head reads as the *back* of a head. Being right about the geometry is not the
 * same as being right about the picture: this figure only reads as facing you when it
 * is nearly facing you, so the shot is almost frontal with just enough turn to keep it
 * from being a passport photograph.
 */
const SHOW_ANGLE = 2.82;

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
    const clear = physics.rayToStatic(pivot, probe, boom + CAM.margin, chair.body);
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

let cssWidth = canvas.clientWidth || 1280;
let cssHeight = canvas.clientHeight || 720;
let ratio = Math.min(devicePixelRatio, 2);

const post = createClayPost(renderer, scene, camera, cssWidth, cssHeight, ratio);

function applySize(force = false): void {
  const w = canvas.clientWidth || cssWidth;
  const h = canvas.clientHeight || cssHeight;
  if (!force && w === cssWidth && h === cssHeight) return;
  cssWidth = w;
  cssHeight = h;
  renderer.setPixelRatio(ratio);
  renderer.setSize(w, h, false);
  post.setSize(w, h, ratio);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const quality = createQuality({
  max: Math.min(devicePixelRatio, 2),
  apply: (next) => {
    ratio = next;
    applySize(true);
  },
});

const focusPoint = new THREE.Vector3();

function tick(dt: number): void {
  readInput();
  physics.step(dt, (h) => {
    chair.update(h, input);
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
  });
  chair.sync();
  dynamics.sync();
  driverRig.apply(driver.pose);
  updateCamera(dt);
  lighting.update(chair.object.position);
  // After the camera, because what the pool should light is what is about to be
  // on screen, and the camera is what decides that.
  pool.update(camera.position, dt);
  // After the camera, because the focal distance is measured from it.
  focusPoint.copy(chair.object.position);
  focusPoint.y += 0.55;
  post.focusOn(camera, focusPoint);
  donuts.update(dt, race.gate, race.lap, chair.object.position);
  routeAim.update(chair.object.position);
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
  quality.sample(dt);

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
    if (orbiting) {
      chair.object.rotation.y = showYaw;
      updateCamera(0, true);
    }
    trackPlayer();
    readPlayer();
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
  if (staged !== orbiting) {
    showDonuts();
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
      donuts,
      routeAim,
      pool,
      post,
      CAM,
      route: ROUTE,
      gates: GATES,
      THREE,
    },
  });
}
