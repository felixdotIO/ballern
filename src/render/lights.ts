/**
 * A fixed budget of real lights, moved to wherever the player is.
 *
 * The building is authored the way a building is lit: every room puts sources in
 * its own fittings, the deck stands five masts up, the glazing is an area source
 * per elevation. That came to thirty-seven lights, twenty-two of them area
 * sources, and three.js renders all of them forward — every light is evaluated
 * in the fragment shader of every material, for every pixel, whether it is over
 * your head or sixty metres away behind two slabs.
 *
 * Measured on the floorplate at 2560 × 1440: the scene cost 63 ms a frame, and
 * 53 ms of that was the twenty-two area lights. Each one is an LTC integration
 * per fragment and costs about 2.4 ms flat, regardless of where it is. That is
 * not a scene that needs less lighting; it is a scene that needs the lighting it
 * cannot see to stop being charged for.
 *
 * So the authoring stays per-room and the result does not — the same bargain
 * batch.ts makes for geometry. Every light the builders emit is harvested out of
 * the graph into a list of emitters, and a small fixed pool of real lights is
 * flown to whichever emitters matter from where the player is standing.
 *
 * Fixed is load-bearing. three compiles a program per light-count configuration,
 * so a pool that grew and shrank with the room would stall for tens of
 * milliseconds every time you came through a doorway — the exact frame you can
 * least afford it. The pool is allocated once at its full size and never
 * changes; slots with nothing worth lighting sit at zero intensity. They still
 * cost their shader time. Paying it constantly is the point: a steady 16 ms
 * beats an average of 12 with a 90 ms spike in it.
 *
 * The sun, the hemisphere fill and anything casting shadows are left alone.
 * There is one sun, it is the art direction, and it is not the problem.
 */

import * as THREE from 'three';

type Kind = 'rect' | 'point' | 'spot';

/**
 * One authored light, reduced to what it takes to re-create it in a pool slot.
 *
 * Positions are world-space and baked at harvest: the emitters are all fixtures
 * in a building that does not move, and resolving them once means the per-frame
 * ranking is arithmetic on plain numbers rather than a matrix walk.
 */
type Emitter = {
  kind: Kind;
  position: THREE.Vector3;
  /** Where a rect or a spot points. Unused for point lights. */
  target: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  /** Falloff radius for point and spot. Zero means unbounded. */
  distance: number;
  decay: number;
  angle: number;
  penumbra: number;
  width: number;
  height: number;
  /**
   * How much light this thing puts out, in units the ranking can compare across
   * kinds. Not physical — it only has to order a sodium mast against a ceiling
   * panel the way your eye would.
   */
  power: number;
};

export type LightPool = {
  /** Point the pool at the player. Cheap enough to call every frame. */
  update(focus: THREE.Vector3, dt: number): void;
  /** For the perf overlay and for asserting the pool never resizes. */
  readonly slots: Readonly<Record<Kind, number>>;
  readonly emitters: Readonly<Record<Kind, number>>;
};

/**
 * The budget, and why it is shaped like this.
 *
 * Measured at 2560 × 1440, per light, per frame, on every fragment in the
 * scene: an area light costs 2.0 ms, a spot 0.57, a point 0.44. Those numbers
 * are the whole design. Lighting was seventy per cent of the scene pass and the
 * scene pass is what pays for resolution — and on a Retina panel run full
 * screen the frame is seven and a half million pixels, so every millisecond of
 * per-fragment cost is worth about a fifth of the linear resolution.
 *
 * So the shape is: as many cheap lights as the room needs, and area lights only
 * where the shape of the source is the thing being drawn. The ceiling fittings
 * were area sources and are now spots; what is left of the area budget goes to
 * the two things that are genuinely big and flat — the hall's ceiling-wide fill
 * and the glazing.
 */
const SLOTS: Record<Kind, number> = {
  /**
   * One area source: whichever of the four big flat emitters you are nearest.
   *
   * There are only four left in the building — the hall's fill and the three
   * glazed elevations — and they are mutually exclusive in practice. In the hall
   * the fill outranks everything; anywhere along a window wall the glazing does;
   * in the core there is nothing for the slot to hold and it sits dark. A second
   * slot would spend two milliseconds a frame holding the runner-up, and the
   * runner-up to a 45 m window is never what is lighting the room.
   */
  rect: 1,
  /** Ceiling fittings, everywhere. Six is a bay of an office or the near half
   *  of the hall — enough that the room never lights in patches. */
  spot: 6,
  /**
   * The deck's masts, the machine room's battens, and every fitting on Ebene 5.
   *
   * Three was right while every point source in the building was a warming
   * sodium mast on an open deck, where the sky was doing the work and the lamps
   * were set dressing. It is not right under a lid: on the lower level these are
   * the only lights there are, they are 1.5 m battens eight metres apart, and
   * three slots means the two behind you go out as the one ahead comes on —
   * which reads as the building being switched off around you.
   */
  point: 5,
};

/**
 * How much brighter a candidate has to be than the emitter in a slot before it
 * takes the slot.
 *
 * Without it, two fittings at nearly equal range trade the same slot back and
 * forth every few frames as you drive between them, which is a flicker rather
 * than a light. Twenty-five per cent is well outside the noise and well inside
 * the point where you would notice the swap happened late.
 */
const TAKEOVER_MARGIN = 1.25;

/** Seconds to fade a slot out of its old emitter and into its new one. */
const CROSSFADE = 0.22;

/**
 * Rough irradiance from an emitter at a point, in arbitrary but consistent
 * units.
 *
 * The `+ area` in the denominator is not a fudge: a 45 m² window three metres
 * away is not a point source and does not fall off like one, and without the
 * softening term the ranking hands every slot to whichever huge emitter you
 * happen to be standing closest to the plane of.
 */
function influence(e: Emitter, at: THREE.Vector3): number {
  const dx = at.x - e.position.x;
  const dy = at.y - e.position.y;
  const dz = at.z - e.position.z;
  const d2 = dx * dx + dy * dy + dz * dz;

  // Past its own falloff radius a point or spot light contributes exactly
  // nothing, and three will not even reach it in the shader.
  if (e.distance > 0 && d2 > e.distance * e.distance) return 0;

  const area = e.kind === 'rect' ? e.width * e.height : 1;
  let score = e.power / (d2 + area);

  if (e.kind !== 'point') {
    // Directional emitters light one side of themselves. A ceiling panel aimed
    // at the floor is worth nothing to the storey above it, and the glazing on
    // the north elevation is worth nothing out on the deck.
    const fx = e.target.x - e.position.x;
    const fy = e.target.y - e.position.y;
    const fz = e.target.z - e.position.z;
    const fl = Math.hypot(fx, fy, fz) || 1;
    const along = (dx * fx + dy * fy + dz * fz) / (fl * (Math.sqrt(d2) || 1));
    if (along <= 0) return 0;
    score *= along;
  }

  return score;
}

/** Everything a harvested light needs read off it before it leaves the graph. */
function describe(light: THREE.Light, world: THREE.Vector3, aim: THREE.Vector3): Emitter | null {
  const l = light as THREE.Light & {
    isRectAreaLight?: boolean;
    isPointLight?: boolean;
    isSpotLight?: boolean;
    distance?: number;
    decay?: number;
    angle?: number;
    penumbra?: number;
    width?: number;
    height?: number;
  };

  const kind: Kind | null = l.isRectAreaLight ? 'rect' : l.isSpotLight ? 'spot' : l.isPointLight ? 'point' : null;
  if (!kind) return null;

  const width = l.width ?? 1;
  const height = l.height ?? 1;

  return {
    kind,
    position: world.clone(),
    target: aim.clone(),
    color: light.color.clone(),
    intensity: light.intensity,
    distance: l.distance ?? 0,
    decay: l.decay ?? 2,
    angle: l.angle ?? Math.PI / 3,
    penumbra: l.penumbra ?? 0,
    width,
    height,
    // An area source of a given intensity puts out its area's worth of light; a
    // punctual one is already specified as total output. Putting them in the
    // same units is the whole job of this number.
    power: light.intensity * (kind === 'rect' ? width * height : 1),
  };
}

/**
 * Strip every poolable light out of a built scene and hand back a pool that
 * stands in for all of them.
 *
 * Harvesting after the fact rather than asking the builders to register their
 * lights is deliberate. Every room recipe, the deck, the exterior and anything
 * added later all emit lights the ordinary way, into their own group, with their
 * own transform — and they keep doing exactly that. Nothing has to know this
 * file exists for it to cover it.
 */
export function createLightPool(scene: THREE.Scene): LightPool {
  const emitters: Record<Kind, Emitter[]> = { rect: [], point: [], spot: [] };

  const world = new THREE.Vector3();
  const aim = new THREE.Vector3();
  const doomed: THREE.Object3D[] = [];

  scene.updateMatrixWorld(true);
  scene.traverse((node) => {
    const light = node as THREE.Light & { isLight?: boolean; target?: THREE.Object3D };
    if (!light.isLight) return;
    // The sun, the sky and anything that casts are not what is expensive, and
    // the sun in particular is the whole image. Leave them where they are.
    if (light.castShadow) return;

    world.setFromMatrixPosition(node.matrixWorld);

    // A rect light aims down its own -Z; a spot aims at a target object. Both
    // resolve to a world-space point, which is all the pool slot needs.
    if ((light as { isSpotLight?: boolean }).isSpotLight && light.target) {
      light.target.updateMatrixWorld(true);
      aim.setFromMatrixPosition(light.target.matrixWorld);
    } else {
      aim.set(0, 0, -1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion())).add(world);
    }

    const emitter = describe(light, world, aim);
    if (!emitter) return;

    emitters[emitter.kind].push(emitter);
    doomed.push(node);
    if ((light as { isSpotLight?: boolean }).isSpotLight && light.target) doomed.push(light.target);
  });

  for (const node of doomed) node.removeFromParent();

  // ---------------------------------------------------------------------------
  // The pool
  // ---------------------------------------------------------------------------

  type Slot = {
    light: THREE.RectAreaLight | THREE.PointLight | THREE.SpotLight;
    /** What it is currently standing in for, or -1 for an empty slot. */
    holding: number;
    /** What it is fading towards. Equal to `holding` when settled. */
    incoming: number;
    /** 0 while swapping, 1 when fully lit. */
    level: number;
  };

  const pools: Record<Kind, Slot[]> = { rect: [], point: [], spot: [] };
  const root = new THREE.Group();
  root.name = 'light-pool';
  scene.add(root);

  for (let i = 0; i < SLOTS.rect; i++) {
    const light = new THREE.RectAreaLight(0xffffff, 0, 1, 1);
    root.add(light);
    pools.rect.push({ light, holding: -1, incoming: -1, level: 0 });
  }
  for (let i = 0; i < SLOTS.point; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 10, 2);
    root.add(light);
    pools.point.push({ light, holding: -1, incoming: -1, level: 0 });
  }
  for (let i = 0; i < SLOTS.spot; i++) {
    const light = new THREE.SpotLight(0xffffff, 0, 10, Math.PI / 4, 0.5, 2);
    root.add(light, light.target);
    pools.spot.push({ light, holding: -1, incoming: -1, level: 0 });
  }

  /** Move a slot's light onto an emitter. Intensity is applied separately. */
  function occupy(slot: Slot, e: Emitter): void {
    const light = slot.light;
    light.position.copy(e.position);
    light.color.copy(e.color);

    if (light instanceof THREE.RectAreaLight) {
      light.width = e.width;
      light.height = e.height;
      light.lookAt(e.target);
    } else if (light instanceof THREE.SpotLight) {
      light.distance = e.distance;
      light.decay = e.decay;
      light.angle = e.angle;
      light.penumbra = e.penumbra;
      light.target.position.copy(e.target);
      light.target.updateMatrixWorld();
    } else {
      light.distance = e.distance;
      light.decay = e.decay;
    }
  }

  const ranked: { index: number; score: number }[] = [];

  function updateKind(kind: Kind, focus: THREE.Vector3, dt: number): void {
    const list = emitters[kind];
    const slots = pools[kind];

    ranked.length = 0;
    for (let i = 0; i < list.length; i++) {
      const score = influence(list[i]!, focus);
      if (score > 0) ranked.push({ index: i, score });
    }
    ranked.sort((a, b) => b.score - a.score);

    // Anything a slot is already showing keeps it, so a light only ever changes
    // hands when a genuinely brighter one turns up.
    const spoken = new Set<number>();
    for (const slot of slots) if (slot.incoming >= 0) spoken.add(slot.incoming);

    let next = 0;
    for (const slot of slots) {
      // Skip past candidates that are already on screen in another slot.
      while (next < ranked.length && spoken.has(ranked[next]!.index)) next++;

      const candidate = next < ranked.length ? ranked[next]! : null;
      const held = slot.incoming >= 0 ? influence(list[slot.incoming]!, focus) : 0;

      if (candidate && candidate.score > held * TAKEOVER_MARGIN) {
        spoken.delete(slot.incoming);
        spoken.add(candidate.index);
        slot.incoming = candidate.index;
        next++;
      } else if (slot.incoming >= 0 && held <= 0) {
        // Walked out of range of whatever it was holding, and nothing to take
        // its place — fade it out rather than snapping it off.
        spoken.delete(slot.incoming);
        slot.incoming = -1;
      }

      // Crossfade. A slot dims to nothing on its old emitter before it is moved,
      // so the swap happens in the dark and there is nothing to see.
      const step = dt / CROSSFADE;
      if (slot.holding !== slot.incoming) {
        slot.level -= step;
        if (slot.level <= 0) {
          slot.level = 0;
          slot.holding = slot.incoming;
          if (slot.holding >= 0) occupy(slot, list[slot.holding]!);
        }
      } else if (slot.holding >= 0) {
        slot.level = Math.min(1, slot.level + step);
      } else {
        slot.level = 0;
      }

      slot.light.intensity = slot.holding >= 0 ? list[slot.holding]!.intensity * slot.level : 0;
    }
  }

  return {
    update(focus, dt) {
      updateKind('rect', focus, dt);
      updateKind('point', focus, dt);
      updateKind('spot', focus, dt);
    },
    slots: SLOTS,
    emitters: { rect: emitters.rect.length, point: emitters.point.length, spot: emitters.spot.length },
  };
}
