/**
 * The building shell: floors, ceilings, walls, facades, the core, the deck and
 * the light that falls on all of it.
 *
 * This module builds nothing itself. It walks the plan and hands each room to
 * the right recipe, which is the only way a floorplate this size stays
 * describable — the shape of the building lives in plan.ts, the way a ceiling
 * is made lives in ceilings.ts, and this file is just the two being introduced.
 *
 * The lighting is the exception, and it is here rather than anywhere else
 * because it is the one thing that cannot be authored per room: there is one
 * sun, it is low in the north-west, and what it does to the whole
 * floorplate at once is the entire art direction. Everything else in the
 * building is arranged so that sun has something to rake across.
 */

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';

import { buildCeiling, buildSlab } from './ceilings';
import type { CollisionVolume } from './collision';
import { buildDeck } from './deck';
import { buildFloor } from './floors';
import { FITTINGS, SECTION, WALL } from './metrics';
import { MAT } from './materials';
import { buildGarage } from './garage';
import { buildRamps } from './ramps';
import { CORE, EXTENTS, PARKHAUS, RAMPS, ROOMS, SPAWN, WALLS, HALL_COLUMNS, assertOnGrid, backing, firstBacking, solidRuns, type Room, type RoomKind } from './plan';
import { COLD_FLUORESCENT, DAYLIGHT, FLUORESCENT, SKYFILL, SUN, SURFACES } from './palette';
import { makeRng, seedFrom, type Rng } from './rng';
import { buildWall } from './walls';
import { Batch, type Sink } from '../render/batch';
import { buildExterior } from './exterior';

/**
 * The sun's travel direction: down out of the north-west at about fifteen
 * degrees.
 *
 * Hannover at midsummer sets well north of west, which is what makes this work
 * — the same low sun reaches the north glazing at a grazing angle and the west
 * glazing almost square on, so the offices get the long shadow bars and the
 * deck gets flooded. Turning it to a due-west sunset would put half the
 * floorplate in permanent shade and lose the whole thing.
 *
 * Fifteen degrees rather than the nine it started at, and the deck is why. A
 * parked car is 1.45 m tall, so at nine degrees it throws an 8.4 m shadow —
 * longer than the 6.25 m aisle behind it, which means consecutive rows shade
 * each other end to end and the whole deck goes flat. At fifteen the shadow is
 * 5.4 m, the aisles keep a strip of sun down them, and the deck reads as what
 * it is: the one place on the lap that is actually outdoors. Inside, the light
 * still reaches nine metres in from the glazing, which is all it was ever
 * doing.
 */
const SUN_DIRECTION = new THREE.Vector3(0.78, -0.26, 0.57).normalize();

/** Where the sun's shadow frustum is centred. */
const SUN_FOCUS = new THREE.Vector3(30, 0, 20);

export type Shell = {
  group: THREE.Group;
  /**
   * The one light in the building that casts across the whole floorplate.
   *
   * Handed out so the frame can decide how often its shadow map is worth
   * redrawing — see `paintShadows` in `skins/clay/main.ts`. Nothing else may
   * touch it: where it is and how hard it is are facts about the hour of the
   * day, and they are settled here.
   */
  sun: THREE.DirectionalLight;
  collision: CollisionVolume[];
  spawn: { position: readonly [number, number, number]; yaw: number };
  /** Extents for clamping the chase camera, and the ceiling it may rise to. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; maxY: number };
};

// ---------------------------------------------------------------------------
// Wall furniture
// ---------------------------------------------------------------------------

/**
 * Sockets, switches, trunking, extinguishers, escape plans.
 *
 * Bare walls are the second-biggest tell after blank ceilings, and none of this
 * costs anything to build. All of it is building-owned, so it gets exactly zero
 * jitter — the ±3° rule applies only to things a human moves.
 */
function buildFittings(sink: Sink, room: Room): void {
  const inset = 0.02;

  // Steckdosen at 300, at the German 2.5 m spacing — but only where there is a
  // wall to sink a back box into. A socket plate over a doorway is not a small
  // error; it is the detail that tells you nobody checked.
  for (let x = room.x0 + 1.25; x < room.x1 - 0.5; x += 2.5) {
    if (backing('x', room.z0, x, WALL.socketHeight)) {
      sink.box(MAT.wall, [0.08, 0.08, 0.012], [x, WALL.socketHeight, room.z0 + inset], { cast: false });
    }
    if (backing('x', room.z1, x, WALL.socketHeight)) {
      sink.box(MAT.wall, [0.08, 0.08, 0.012], [x, WALL.socketHeight, room.z1 - inset], { cast: false });
    }
  }
  for (let z = room.z0 + 1.25; z < room.z1 - 0.5; z += 2.5) {
    if (backing('z', room.x0, z, WALL.socketHeight)) {
      sink.box(MAT.wall, [0.012, 0.08, 0.08], [room.x0 + inset, WALL.socketHeight, z], { cast: false });
    }
    if (backing('z', room.x1, z, WALL.socketHeight)) {
      sink.box(MAT.wall, [0.012, 0.08, 0.08], [room.x1 - inset, WALL.socketHeight, z], { cast: false });
    }
  }

  // Brüstungskanal down the office's inboard partition, because a floorplate
  // this size was never wired for the number of PCs it ended up holding.
  //
  // In segments, stopping at every opening. The wall it runs along has two
  // 2.5 m holes in it where the canteen doorways are, and a single 14 m box
  // sails straight across both of them at 1100 — a grey bar hanging in a
  // doorway, which is precisely what it looked like. Trunking stops at an
  // opening and picks up on the other side, like everything else that is fixed
  // to a wall for its whole length.
  if (room.kind === 'office') {
    for (const [z0, z1] of solidRuns('z', room.x0, room.z0 + 0.3, room.z1 - 0.3, WALL.trunkingHeight)) {
      sink.box(MAT.metal, [0.045, 0.06, z1 - z0], [room.x0 + 0.03, WALL.trunkingHeight, (z0 + z1) / 2], {
        cast: false,
      });
      // Ends are capped, and the cap is what tells you it stopped rather than
      // that it was cut off by the frame.
      for (const end of [z0, z1]) {
        sink.box(MAT.metal, [0.05, 0.07, 0.012], [room.x0 + 0.03, WALL.trunkingHeight, end], { cast: false });
      }
    }
  }

  // Feuerlöscher on its bracket, by the door of every room in the building —
  // walked round the walls until it finds something to bolt to. Trying only one
  // edge is not enough: the west corridor's entire north side is a 3.75 m
  // opening, and a room that quietly ends up without an extinguisher is the
  // same failure as one with an extinguisher hanging in a doorway.
  const bracket = FITTINGS.extinguisherHandleHeight - 0.24;
  const spot = anyBacking(room, bracket);
  if (spot) {
    const body = new THREE.CylinderGeometry(0.075, 0.075, 0.42, 14);
    sink.geo(MAT.extinguisher, body, new THREE.Matrix4().setPosition(spot.x, bracket, spot.z));
  }

  // Flucht- und Rettungsplan by every door and lift lobby, which in practice
  // means the corridors and the hall.
  if (room.kind === 'corridor' || room.kind === 'hall') {
    const plan = anyBacking(room, FITTINGS.escapePlanCentreHeight, 1.6);
    if (plan) {
      sink.box(
        MAT.escapePlan,
        plan.axis === 'x'
          ? [FITTINGS.escapePlanWidth, FITTINGS.escapePlanHeight, 0.008]
          : [0.008, FITTINGS.escapePlanHeight, FITTINGS.escapePlanWidth],
        [plan.x, FITTINGS.escapePlanCentreHeight, plan.z],
        { cast: false },
      );
    }
  }
}

/**
 * Somewhere on any of a room's four walls with something solid behind it.
 *
 * Walks the edges in a fixed order so the answer is stable between runs —
 * a fitting that moves to a different wall because the room list was reordered
 * is a seeded world that is not actually seeded.
 */
function anyBacking(
  room: Room,
  y: number,
  offset = 0.6,
): { axis: 'x' | 'z'; x: number; z: number } | undefined {
  const face = 0.16;
  const edges = [
    { axis: 'x' as const, at: room.z0, from: room.x0 + offset, to: room.x1 - offset, into: face },
    { axis: 'z' as const, at: room.x1, from: room.z0 + offset, to: room.z1 - offset, into: -face },
    { axis: 'x' as const, at: room.z1, from: room.x1 - offset, to: room.x0 + offset, into: -face },
    { axis: 'z' as const, at: room.x0, from: room.z1 - offset, to: room.z0 + offset, into: face },
  ];

  for (const e of edges) {
    const u = firstBacking(e.axis, e.at, e.from, e.to, y);
    if (u === undefined) continue;
    return e.axis === 'x'
      ? { axis: 'x', x: u, z: e.at + e.into }
      : { axis: 'z', x: e.at + e.into, z: u };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The core
// ---------------------------------------------------------------------------

/**
 * The solid block in the middle of the floorplate: lifts, stairs, WCs, risers.
 *
 * Its walls are already built by the plan, so all this adds is the mass behind
 * them — which exists purely so that nothing can be seen through the gaps where
 * two core walls meet, and so a chair that somehow got inside would have
 * nowhere to go.
 */
function buildCore(sink: Sink, out: CollisionVolume[]): void {
  const W = CORE.x1 - CORE.x0;
  const D = CORE.z1 - CORE.z0;
  const cx = (CORE.x0 + CORE.x1) / 2;
  const cz = (CORE.z0 + CORE.z1) / 2;
  const h = SECTION.slabToSlab - SECTION.raisedFloorDepth;

  sink.box(MAT.concreteFair, [W - 0.5, h, D - 0.5], [cx, h / 2, cz]);
  out.push({ label: 'core', size: [W, h, D], centre: [cx, h / 2, cz] });
}

/**
 * The hall's columns, cased the way a reception cases a column: a honed stone
 * plinth to just above waist height, plaster above it, and a shadow gap between
 * the two so the join is a deliberate line rather than a butt joint.
 *
 * The plinth is not decoration. It is where trolleys, suitcases and heels hit
 * a column, and a reception that has been open five years with a painted column
 * base has a scuffed painted column base. Stone is what you do about it.
 */
function buildHallColumns(sink: Sink, out: CollisionVolume[], hall: Room): void {
  const s = HALL_COLUMNS.size;
  const h = hall.ceiling;

  for (const x of HALL_COLUMNS.xs) {
    const z = HALL_COLUMNS.z;
    sink.box(MAT.graniteDark, [s, HALL_COLUMNS.plinth, s], [x, HALL_COLUMNS.plinth / 2, z]);
    sink.box(MAT.stainless, [s - 0.03, 0.02, s - 0.03], [x, HALL_COLUMNS.plinth + 0.01, z], { cast: false });
    sink.box(MAT.wall, [s - 0.05, h - HALL_COLUMNS.plinth, s - 0.05], [x, (h + HALL_COLUMNS.plinth) / 2, z]);

    out.push({
      label: `hall.column.${x}`,
      size: [s + 0.1, h, s + 0.1],
      centre: [x, h / 2, z],
    });
  }
}

/**
 * The lift lobby wall, clad.
 *
 * The one wall in the hall that is neither glass nor a meeting room, and it was
 * bare fair-faced concrete — which is what the core is built from, not what a
 * tenant leaves it looking like. Honed granite to 2.4 with a stainless reveal
 * over is the cheapest thing that reads as "somebody spent money at the front
 * of this building", and it is what the lift doors need to be set into to stop
 * looking like doors in a car park.
 */
function buildLiftLobbyWall(sink: Sink, hall: Room): void {
  const z = hall.z0 + 0.03;
  const top = 2.4;
  const from = CORE.x0;
  const to = CORE.x1;

  sink.box(MAT.graniteDark, [to - from, top, 0.04], [(from + to) / 2, top / 2, z], { cast: false });
  sink.box(MAT.stainless, [to - from, 0.03, 0.06], [(from + to) / 2, top + 0.015, z], { cast: false });
  // Vertical joints on the 1.25 m module, because the stone is set out on the
  // same grid as everything else and the panels are that size.
  for (let x = from + 1.25; x < to; x += 1.25) {
    sink.box(MAT.stainless, [0.012, top, 0.05], [x, top / 2, z], { cast: false });
  }
}

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

/**
 * A room's own fittings, as actual light sources.
 *
 * Only a sample of the luminaires the ceiling drew are real lights — the
 * emissive panels carry the read for the rest. Which sample matters less than
 * the count: every one of these is evaluated for every fragment of every
 * material in the scene, and a floorplate with a light in each of two hundred
 * fittings would be correct, beautiful and completely unplayable.
 */
function roomLights(group: THREE.Group, room: Room, luminaires: readonly THREE.Vector3[]): void {
  if (!luminaires.length) return;

  /**
   * How many of a room's fittings become real lights.
   *
   * Tuned against the one thing that actually breaks: the far half of a deep
   * room going black the moment the sun stops reaching it. Two sources in a
   * 30 × 15 m floorplate cannot carry it, and the hard line where the sun's
   * shadow lands then reads as a fault rather than as light.
   */
  const budget =
    room.kind === 'office' ? 6 : room.kind === 'hall' ? 6 : room.kind === 'kitchen' || room.kind === 'board' ? 3 : 2;

  /**
   * Spread the chosen fittings over the room's plan, not over the array.
   *
   * Sampling the luminaire list at a stride looks like it distributes them and
   * does not: the list is built by walking one axis inside the other, so a
   * stride that happens to land on a multiple of the inner run puts every
   * single light in the same row. The office lit its window wall six times and
   * left the other twelve metres to the emissive panels, which is exactly the
   * failure this function exists to prevent.
   */
  const cols = Math.max(1, Math.round(Math.sqrt((budget * (room.x1 - room.x0)) / (room.z1 - room.z0))));
  const rows = Math.max(1, Math.ceil(budget / cols));
  const chosen: THREE.Vector3[] = [];

  for (let r = 0; r < rows && chosen.length < budget; r++) {
    for (let c = 0; c < cols && chosen.length < budget; c++) {
      const tx = room.x0 + ((c + 0.5) / cols) * (room.x1 - room.x0);
      const tz = room.z0 + ((r + 0.5) / rows) * (room.z1 - room.z0);
      // Snap to a real fitting: the light has to come out of something.
      let best = luminaires[0]!;
      let bestD = Infinity;
      for (const l of luminaires) {
        const d = (l.x - tx) ** 2 + (l.z - tz) ** 2;
        if (d < bestD && !chosen.includes(l)) {
          bestD = d;
          best = l;
        }
      }
      chosen.push(best);
    }
  }

  /**
   * The hall gets one soft area source over the whole room as well as its
   * downlights.
   *
   * Downlights alone give pools and blackness between them, which is what a
   * shop window looks like rather than a lobby. A real reception also has a
   * light cove, daylight off two glazed walls and a pale plastered lid bouncing
   * everything back — none of which this scene can afford to simulate honestly,
   * so one wide, weak, ceiling-height panel stands in for the lot. It is the
   * difference between "lit" and "spotlit".
   */
  if (room.kind === 'hall') {
    const fill = new THREE.RectAreaLight(
      new THREE.Color(FLUORESCENT.color),
      FLUORESCENT.intensity * 1.1,
      room.x1 - room.x0 - 6,
      room.z1 - room.z0 - 4,
    );
    fill.position.set((room.x0 + room.x1) / 2, room.ceiling - 0.35, (room.z0 + room.z1) / 2);
    fill.lookAt((room.x0 + room.x1) / 2, 0, (room.z0 + room.z1) / 2);
    group.add(fill);
  }

  for (const at of chosen) {

    if (room.kind === 'server') {
      // Cold, bare, and pointing straight down out of an open batten.
      const lamp = new THREE.PointLight(new THREE.Color(COLD_FLUORESCENT.color), COLD_FLUORESCENT.intensity * 3.5, 11, 2);
      lamp.position.copy(at);
      group.add(lamp);
      continue;
    }

    if (room.kind === 'hall') {
      /**
       * Downlights make pools, not a wash. That difference is the whole reason
       * a reception feels like a reception rather than an office with a sofa.
       *
       * Spots rather than point lights, and that is a fix rather than a
       * refinement. A point source three metres over a stone floor throws a
       * hard inverse-square hotspot with no edge to it, and driven hard enough
       * to light the room at all it clips to white and then blooms — which is
       * what a torch looks like and nothing like what a ceiling looks like. A
       * wide cone that is almost entirely penumbra spreads the same energy over
       * a pool with a soft edge, and reads brighter at a third of the intensity.
       */
      const lamp = new THREE.SpotLight(
        new THREE.Color(FLUORESCENT.color),
        FLUORESCENT.intensity * 16,
        13,
        // A 49° cone: a downlight, not a followspot.
        0.85,
        0.72,
        2,
      );
      lamp.position.copy(at);
      lamp.target.position.set(at.x, 0, at.z);
      group.add(lamp, lamp.target);
      continue;
    }

    /**
     * A wide, almost entirely penumbral downlight — the same recipe as the
     * hall's, opened up because an office lid is half a metre lower and has to
     * cover a bay rather than a pool.
     *
     * This was a 2.5 m RectAreaLight, on the sound reasoning that a 625 louvre
     * is a hard little source and one light standing in for a whole bay of them
     * has to be the size of the bay. It looked right and it was unaffordable.
     * Measured at 2560 × 1440, one area light costs 2.0 ms a frame and one spot
     * costs 0.57 — four times the price, paid on every fragment of every
     * material whether the light is overhead or across the floorplate, because
     * three integrates a linearly-transformed cosine per area light and
     * evaluates a cone per spot.
     *
     * That ratio is the whole argument. The scene has a fixed millisecond budget
     * and it is being spent on pixels; four spots and an area light cost the
     * same as three area lights, cover more of the room, and the difference
     * between a 2.5 m emitter and a 60° cone that is nine-tenths penumbra is not
     * something anyone has ever noticed at 20 km/h. The area lights that are
     * left are the ones where the shape of the source is the whole point: the
     * hall's ceiling-wide fill, and the glazing.
     */
    const lamp = new THREE.SpotLight(
      new THREE.Color(FLUORESCENT.color),
      FLUORESCENT.intensity * 12,
      10,
      // 63°, wider than the hall's because the ceiling is lower and the fitting
      // it stands in for is a whole bay of louvres rather than one downlight.
      1.1,
      0.9,
      2,
    );
    lamp.position.copy(at);
    lamp.target.position.set(at.x, 0, at.z);
    group.add(lamp, lamp.target);
  }
}

/**
 * The sun, the sky, and the glazing as a source in its own right.
 *
 * Three light colours are in play at once and none of them should be corrected
 * toward each other — the tension between them is the whole image: the sun warm
 * and hard-edged and several stops above everything else, the sky filling its
 * shadows cool, and the fluorescents green-white, invisible at the window and
 * dominant in the core.
 */
function buildLight(group: THREE.Group): THREE.DirectionalLight {
  RectAreaLightUniformsLib.init();

  // Floor bounce, standing in for the global illumination we don't have. A
  // suspended ceiling faces straight down, so nothing else in the scene reaches
  // it — in a real office it is lit almost entirely by light coming back up off
  // the carpet. At golden hour that bounce is warm, which is what keeps the
  // ceiling from going cold and dead against the sunlit floor.
  // Raised from the value one enclosed bay wanted. A third of the lap is now
  // under an open sky, where shade is not darkness — it is a huge blue source
  // filling everything the sun misses, and at the old level the deck's shadows
  // went to near-black, which is a night-time reading of a sunset.
  const bounce = new THREE.Color(SURFACES.carpet.color).multiplyScalar(2.1);
  group.add(new THREE.HemisphereLight(new THREE.Color(SKYFILL.color), bounce, 0.85));

  // The sun. Low, warm, and well outside the building so it rakes in almost
  // horizontally — that shallow angle is what throws the mullion shadows the
  // full depth of the room and the car shadows the full width of the deck, and
  // it is the single most valuable thing in the frame. A tight shadow radius
  // keeps those bars crisp; softening them turns the whole effect to mush.
  const sun = new THREE.DirectionalLight(new THREE.Color(SUN.color), SUN.intensity);
  sun.position.copy(SUN_FOCUS).addScaledVector(SUN_DIRECTION, -60);
  sun.target.position.copy(SUN_FOCUS);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  // The frustum has to cover the whole floorplate. Anything outside it is
  // treated as lit, which on a floor with windowless rooms in the middle means
  // the sun shining straight through the core into the server room.
  sun.shadow.camera.left = -46;
  sun.shadow.camera.right = 46;
  sun.shadow.camera.top = 46;
  sun.shadow.camera.bottom = -46;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);

  // The glazing glowing, as an area source per elevation. Dialled well back:
  // this is not the sun, and if it is strong enough to light a room on its own
  // it flattens the very mullion shadows the sun exists to cast.
  const glazing: [THREE.Vector3, THREE.Vector3, number, number][] = [
    // North elevation, seen from inside the office and the kitchen.
    [new THREE.Vector3(43.75, 1.7, 0.1), new THREE.Vector3(43.75, 1.2, 6), 45, 1.6],
    // West elevation, onto the kitchen and the west corridor.
    [new THREE.Vector3(21.35, 1.7, 12), new THREE.Vector3(30, 1.2, 12), 27, 1.6],
    // The hall's entrance wall, which is the brightest thing on the lap.
    [new THREE.Vector3(40.1, 1.6, 36.9), new THREE.Vector3(48, 1.2, 36.9), 11, 3.0],
  ];
  for (const [at, look, width, height] of glazing) {
    const win = new THREE.RectAreaLight(new THREE.Color(DAYLIGHT.color), DAYLIGHT.intensity * 0.3, width, height);
    win.position.copy(at);
    win.lookAt(look);
    group.add(win);
  }

  // Handed back so the frame can schedule its shadow map — see `Shell.sun`. It is
  // the only light in here anything outside ever needs a name for.
  return sun;
}

// ---------------------------------------------------------------------------

/** Ceiling tiles a maintenance visit left sitting proud, per room. */
const ASKEW: Record<string, ReadonlySet<string>> = {
  office: new Set(['14:8', '27:3', '5:15']),
  kitchen: new Set(['9:4', '18:19']),
  board: new Set(['7:11']),
  'corridor.south': new Set(['12:2']),
};

function buildRoom(sink: Sink, group: THREE.Group, out: CollisionVolume[], room: Room, rng: Rng): void {
  buildFloor(sink, room, rng);
  const ceiling = buildCeiling(sink, room, rng, ASKEW[room.id] ?? new Set());
  roomLights(group, room, ceiling.luminaires);
  buildFittings(sink, room);

  // A lid on the room, so a chair at the ceiling of the physics world has
  // something to hit rather than sailing out through the roof.
  out.push({
    label: `${room.id}.ceiling`,
    size: [room.x1 - room.x0, 0.5, room.z1 - room.z0],
    centre: [(room.x0 + room.x1) / 2, room.ceiling + 0.25, (room.z0 + room.z1) / 2],
  });
}

export function buildFloorplate(): Shell {
  if (import.meta.env.DEV) {
    const problems = assertOnGrid();
    if (problems.length) console.warn(`plan is off the module grid:\n  ${problems.join('\n  ')}`);
  }

  const group = new THREE.Group();
  const batch = new Batch();
  const collision: CollisionVolume[] = [];
  const rng = makeRng(seedFrom('hannover.floor.06'));

  // The two Parkhaus levels build themselves and must never reach the room
  // recipes. Those recipes lay carpet, hang a suspended ceiling, and fit sockets
  // and skirtings — at absolute height, because for the whole life of this
  // building there was only one floor level and nothing needed to say so. Sent
  // an enclosed car park three metres down, they put its ceiling three metres
  // above the deck instead: a lit soffit hanging over the open sky, cutting the
  // sun off the fastest part of the lap.
  const OUTDOOR: ReadonlySet<RoomKind> = new Set(['deck', 'garage']);
  const interiors = ROOMS.filter((r) => !OUTDOOR.has(r.kind));
  const deckRooms = ROOMS.filter((r) => r.kind === 'deck');

  for (const room of interiors) buildRoom(batch, group, collision, room, rng);
  for (const wall of WALLS) buildWall(batch, collision, wall, rng);

  buildCore(batch, collision);

  // The hall gets what a front-of-house gets and the offices behind it do not:
  // cased columns and a clad lobby wall.
  const hall = ROOMS.find((r) => r.kind === 'hall');
  if (hall) {
    buildHallColumns(batch, collision, hall);
    buildLiftLobbyWall(batch, hall);
  }

  // The deck's own volumes, which were being built and thrown away. That was
  // invisible while one catch-all slab covered the whole world at y = 0 and the
  // stair house was the only thing it lost — and it is fatal now, because the
  // deck's floor is its plates and nothing else.
  collision.push(...buildDeck(batch, group, deckRooms, rng).collision);
  collision.push(...buildRamps(batch, group, RAMPS));
  collision.push(...buildGarage(batch, group, rng));

  // The structural slab over the occupied floor, in two overlapping pieces so
  // the L-shaped plan is covered without a seam the sun can find. The deck gets
  // none: it is the top deck, which is the entire reason it is worth driving on.
  buildSlab(batch, 21.25, 0, 66.25, 31.25);
  buildSlab(batch, 40, 27.5, 66.25, 42.5);

  // One slab under the occupied floor, and only under it. The 0.5 m of depth is
  // what a swept capsule needs to never find the underside.
  //
  // It used to run under everything, which was right while everything was at
  // the same level. It stops at the building's west face now, because west of
  // that line the ground is three metres lower and a catch-all slab at y = 0
  // would be a solid lid over the whole of Ebene 5 — the ramps would end in
  // concrete and half the lap would be unreachable. Out there the deck plates,
  // the ramp slabs and the garage floor each pour their own, which is the only
  // arrangement where a hole in the drawing is a hole in the world.
  collision.push({
    label: 'ground',
    size: [EXTENTS.maxX - PARKHAUS.x1 + 6, 0.5, EXTENTS.maxZ + 6],
    centre: [(PARKHAUS.x1 + EXTENTS.maxX) / 2 + 3, -0.25, EXTENTS.maxZ / 2],
  });

  /**
   * A containment box around the whole floorplate, half a metre outside every
   * visible edge.
   *
   * Every wall, facade and parapet already has its own collider, and the
   * tunnelling gate says they hold — with one escape in six hundred and forty
   * eight runs, at the hard speed ceiling, through the corner where the deck's
   * parapet hands over to the ramp house. Chasing that particular seam would fix
   * that particular seam. This fixes the class: nothing can leave the world,
   * whatever new corner some future room introduces.
   *
   * It is not a substitute for building the walls properly. It is what stops a
   * seam being a lost chair rather than a scuff.
   */
  const pad = 0.5;
  const tall = 16;
  // Dropped by the height of a Parkhaus storey and then some, because the box
  // has to reach below the lowest floor there is or it stops being containment
  // and starts being a lip a chair on Ebene 5 goes under.
  const cy = tall / 2 + EXTENTS.minY - 1;
  for (const [label, size, centre] of [
    ['bound.west', [1, tall, EXTENTS.maxZ + 4], [EXTENTS.minX - pad, cy, EXTENTS.maxZ / 2]],
    ['bound.east', [1, tall, EXTENTS.maxZ + 4], [EXTENTS.maxX + pad, cy, EXTENTS.maxZ / 2]],
    ['bound.north', [EXTENTS.maxX + 4, tall, 1], [EXTENTS.maxX / 2, cy, EXTENTS.minZ - pad]],
    ['bound.south', [EXTENTS.maxX + 4, tall, 1], [EXTENTS.maxX / 2, cy, EXTENTS.maxZ + pad]],
  ] as const) {
    collision.push({ label, size, centre });
  }

  const sun = buildLight(group);
  group.add(batch.flush());
  group.add(buildExterior());

  return {
    group,
    sun,
    collision,
    spawn: SPAWN,
    bounds: {
      minX: EXTENTS.minX + 0.4,
      maxX: EXTENTS.maxX - 0.4,
      minZ: EXTENTS.minZ + 0.4,
      maxZ: EXTENTS.maxZ - 0.4,
      maxY: SECTION.ceilingHeight - 0.25,
    },
  };
}
