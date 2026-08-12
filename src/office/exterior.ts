/**
 * The world outside.
 *
 * Two jobs, and they used to be one. Seen through a curtain wall it only ever
 * has to read as depth at a glance while the player goes past, so it is built
 * from unlit material with hand-authored values — full control over the one
 * thing it has to do. But the lap now spends a third of its length on an open
 * deck with no glass in front of it, and the nearest hundred metres of that
 * view is standing in the same sunlight the player is. So the near work — the
 * host building's flank, the Parkhaus decks below — is lit properly, and only
 * the city beyond it stays flat.
 *
 * The art direction is unchanged: we are looking roughly into the setting sun,
 * so the facades facing us are in shade and cool, and all the warmth comes from
 * their windows catching the sunset. Cool buildings, hot windows. That inversion
 * is what makes a golden hour city read.
 *
 * Coverage is the hard requirement, and it got harder. From the deck you can see
 * the full circle, so a city built in a cone in front of the office windows runs
 * out and leaves bare sky over the parapet. Everything here is laid out radially
 * in three tiers: a fan of detailed blocks, hundreds of instanced masses out to
 * half a kilometre, and a low rim so the skyline never simply stops.
 */

import * as THREE from 'three';

import { EXTENTS, LEVELS } from './plan';
import { GARAGE } from './metrics';
import { MAT } from './materials';
import { bevelBox } from '../render/geometry';
import { makeRng, range, seedFrom, type Rng } from './rng';

/** Street level, well below us — this floor is about six storeys up. */
const GROUND_Y = -21;

/** The hot band of the sky at the horizon. Everything fades toward this. */
const HAZE = new THREE.Color(0xf0c191);

/** Where the city is centred: the middle of the floorplate. */
const ORIGIN = new THREE.Vector2(EXTENTS.maxX / 2, EXTENTS.maxZ / 2);

type Slab = {
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Height above street level. */
  height: number;
  /** Storey height, which sets the window rhythm. */
  storey: number;
};

const flat = (color: THREE.Color) => new THREE.MeshBasicMaterial({ color });

/** Mix toward the horizon haze by distance. This is the entire depth cue. */
function aerial(base: number, distance: number): THREE.Color {
  const t = THREE.MathUtils.clamp(distance / 320, 0, 0.88);
  return new THREE.Color(base).lerp(HAZE, t);
}

/**
 * A curtain wall of windows on one face.
 *
 * Most panes are dark and cool. A minority are turned far enough to catch the
 * sun and go incandescent, and a few are lit from inside by people still at
 * their desks — which quietly says the same thing our own empty office does.
 */
function windowGrid(parent: THREE.Object3D, slab: Slab, distance: number, facing: number, rng: Rng): void {
  const cols = Math.max(3, Math.floor(slab.width / 1.9));
  const rows = Math.max(3, Math.floor(slab.height / slab.storey));
  const paneW = (slab.width / cols) * 0.66;
  const paneH = slab.storey * 0.52;

  // Rotated to face back toward the building. A default PlaneGeometry faces +Z,
  // which is away from us, so every pane would be back-face culled.
  const geo = new THREE.PlaneGeometry(paneW, paneH).rotateY(Math.PI);
  const mesh = new THREE.InstancedMesh(geo, flat(new THREE.Color(0xffffff)), cols * rows);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const tone = new THREE.Color();

  const dark = aerial(0x2b3a4c, distance);
  const sunlit = aerial(0xffc074, distance * 0.35);
  const interior = aerial(0xffe0a8, distance * 0.5);

  let i = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const roll = rng();
      // Sun-catching panes cluster into bands, because in life it is whole
      // storeys that line up with the sun, not scattered single windows.
      const band = Math.sin(r * 1.7) > 0.35;
      tone.copy(band && roll > 0.35 ? sunlit : roll > 0.93 ? interior : dark);
      tone.multiplyScalar(range(rng, 0.82, 1.18));

      m.compose(
        new THREE.Vector3(
          -slab.width / 2 + (c + 0.5) * (slab.width / cols),
          GROUND_Y + (r + 0.5) * slab.storey,
          -slab.depth / 2 - 0.02,
        ),
        q,
        scale,
      );
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, tone);
      i++;
    }
  }
  mesh.position.set(slab.x, 0, slab.z);
  mesh.rotation.y = facing;
  parent.add(mesh);
}

function building(parent: THREE.Object3D, slab: Slab, distance: number, facing: number, rng: Rng): void {
  const g = new THREE.Group();

  const body = new THREE.Mesh(bevelBox(slab.width, slab.height, slab.depth, 0.08), flat(aerial(0x4d5563, distance)));
  body.position.set(slab.x, GROUND_Y + slab.height / 2, slab.z);
  body.rotation.y = facing;
  g.add(body);

  // Parapet, catching a thin line of sun along the top edge.
  const cap = new THREE.Mesh(bevelBox(slab.width + 0.4, 0.5, slab.depth + 0.4, 0.06), flat(aerial(0x8e8272, distance)));
  cap.position.set(slab.x, GROUND_Y + slab.height + 0.2, slab.z);
  cap.rotation.y = facing;
  g.add(cap);

  // Rooftop plant. Nothing is ever a clean box on top.
  const units = Math.floor(range(rng, 1, 4));
  for (let i = 0; i < units; i++) {
    const w = range(rng, 1.6, 4.2);
    const h = range(rng, 0.8, 2.4);
    const unit = new THREE.Mesh(bevelBox(w, h, range(rng, 1.6, 3.4), 0.05), flat(aerial(0x585d66, distance)));
    unit.position.set(
      slab.x + range(rng, -slab.width * 0.3, slab.width * 0.3),
      GROUND_Y + slab.height + h / 2,
      slab.z + range(rng, -slab.depth * 0.25, slab.depth * 0.25),
    );
    g.add(unit);
  }

  windowGrid(g, slab, distance, facing, rng);
  parent.add(g);
}

/**
 * The bulk of the city, as a single instanced draw.
 *
 * At this range buildings genuinely lose their window detail to haze, so flat
 * tinted masses are not a shortcut — it is what a distant skyline looks like.
 */
function cityField(
  parent: THREE.Object3D,
  rng: Rng,
  opts: { count: number; minRadius: number; maxRadius: number; minHeight: number; maxHeight: number },
): void {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, flat(new THREE.Color(0xffffff)), opts.count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tone = new THREE.Color();
  const palette = [0x4d5563, 0x555a62, 0x46505e, 0x5a5750, 0x424c5a];

  for (let i = 0; i < opts.count; i++) {
    // Radial rather than gridded: a grid leaves visible avenues that line up
    // and read as a pattern the moment the camera moves.
    const angle = rng() * Math.PI * 2;
    const radius = range(rng, opts.minRadius, opts.maxRadius);
    const x = ORIGIN.x + Math.sin(angle) * radius;
    const z = ORIGIN.y + Math.cos(angle) * radius;

    // Taller further out, so the near ground stays open and the far skyline
    // still breaks the horizon.
    const reach = (radius - opts.minRadius) / (opts.maxRadius - opts.minRadius);
    const height = range(rng, opts.minHeight, opts.maxHeight) * (0.55 + reach * 0.85);
    const w = range(rng, 16, 52);
    const d = range(rng, 16, 52);

    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 0.5);
    m.compose(new THREE.Vector3(x, GROUND_Y + height / 2, z), q, new THREE.Vector3(w, height, d));

    tone.copy(aerial(palette[i % palette.length] ?? 0x4d5563, radius)).multiplyScalar(range(rng, 0.9, 1.1));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, tone);
  }
  parent.add(mesh);
}

// ---------------------------------------------------------------------------
// The near work: our own building, and the Parkhaus we are standing on
// ---------------------------------------------------------------------------

/**
 * The rest of the office building, above and below this floor.
 *
 * This is the one piece of exterior the player can walk up to, because the west
 * flank of the building is what you are looking at for the whole length of the
 * deck. It is built in lit material rather than flat: at fifteen metres, in the
 * same raking sun the deck is in, an unlit face reads as a painted backdrop
 * instantly — and the moment it does, the deck stops being outside.
 */
function hostBuilding(parent: THREE.Object3D): void {
  const storey = 3.6;
  const floorTop = 3.45;
  const above = storey * 3;
  const below = -0.3 - GROUND_Y;

  // The flank, in two pieces so this floor's real facade stays visible between
  // them. Inset very slightly so it never z-fights the curtain wall.
  const faces: { x: number; z: number; w: number; d: number }[] = [
    // West flank, facing the deck. The one that matters.
    { x: 21.24, z: 15.6, w: 0.02, d: 31.25 },
    // The two elevations around the notch — the corridor's outer wall and the
    // hall's entrance wall. Without these the storeys above the entrance simply
    // are not there, and the roof slab over the hall reads as a plate floating
    // in front of the sunset. Everything the deck looks at has to be a building
    // all the way up, because from out here you can see all the way up.
    { x: 30.625, z: 31.24, w: 18.75, d: 0.02 },
    { x: 39.99, z: 36.875, w: 0.02, d: 11.25 },
    // North and east flanks, seen through the office glazing.
    { x: 43.75, z: -0.01, w: 45, d: 0.02 },
    { x: 66.26, z: 21.25, w: 0.02, d: 42.5 },
    { x: 53.1, z: 42.51, w: 26.25, d: 0.02 },
  ];

  for (const f of faces) {
    for (const [y, h] of [
      [floorTop + above / 2, above],
      [-0.3 - below / 2, below],
    ] as const) {
      const mass = new THREE.Mesh(bevelBox(Math.max(f.w, 0.6), h, Math.max(f.d, 0.6), 0.05), MAT.concreteFair);
      mass.position.set(f.x, y, f.z);
      mass.castShadow = true;
      mass.receiveShadow = true;
      parent.add(mass);
    }

    // Ribbon glazing on the storeys above, so the flank reads as an office
    // building rather than as a retaining wall.
    for (let n = 0; n < 3; n++) {
      const y = floorTop + 0.9 + n * storey;
      const band = new THREE.Mesh(
        bevelBox(Math.max(f.w + 0.1, 0.7), 1.6, Math.max(f.d + 0.1, 0.7), 0.02),
        MAT.crtGlass,
      );
      band.position.set(f.x, y, f.z);
      parent.add(band);
    }
  }
}

/**
 * The Parkhaus below us — the faked part of it.
 *
 * Visible only over the parapet, and only for the two seconds a lap spends near
 * one — but a deck edge with nothing under it is the single fastest way to
 * remind somebody they are looking at a floating rectangle. Open decks with
 * dark voids between them, which is what a Parkhaus is.
 *
 * The voids are unlit black boxes, and that is the whole reason this function
 * has to know where the real building stops.
 *
 * It used to start one storey under the top deck, which was right for exactly
 * as long as the top deck was the only floor anybody drove on. The moment the
 * lap went down a ramp, the first faked level was *the same 2.9 m* as the real
 * Ebene 5 — so the entire lower level and both ramp slots sat inside a solid
 * black MeshBasic box with no light, no shading and no collider. You drove
 * straight into it going down, it appeared out of nowhere because an unlit face
 * has no shading to announce it, and from behind it swallowed everything below
 * the driver's shoulders. Every physics gate passed the whole time, because
 * there was nothing there to collide with.
 *
 * So the stack starts below the lowest floor that actually exists, and takes
 * its storey height from the same constant the real one does — the two must
 * never be able to drift apart again.
 */
function parkhaus(parent: THREE.Object3D): void {
  const decks = 5;
  const storey = GARAGE.storey;
  /** The first faked deck: one storey under the lowest real one. */
  const start = LEVELS.garage - storey;
  const dark = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x201f1e) });

  for (let n = 0; n < decks; n++) {
    const y = start - n * storey;
    const slab = new THREE.Mesh(bevelBox(21.9, 0.32, 43.1, 0.03), MAT.concreteFair);
    slab.position.set(10.6, y, 21.25);
    slab.receiveShadow = true;
    parent.add(slab);

    // The void between decks: dark, and just deep enough to have cars in it
    // that will never be built.
    const void_ = new THREE.Mesh(bevelBox(21.5, storey - 0.32, 42.7, 0.02), dark);
    void_.position.set(10.6, y + storey / 2, 21.25);
    parent.add(void_);

    // Edge upstand along the open sides, so each deck reads as a deck.
    for (const [x, z, w, d] of [
      [10.6, -0.2, 21.9, 0.3],
      [-0.2, 21.25, 0.3, 43.1],
      [20, 42.7, 40.3, 0.3],
    ] as const) {
      const band = new THREE.Mesh(bevelBox(w, 0.9, d, 0.02), MAT.concreteFair);
      band.position.set(x, y + 0.55, z);
      parent.add(band);
    }
  }

  // The ground the whole thing stands on, so the bottom is not open sky.
  const base = new THREE.Mesh(bevelBox(22, 1.5, 43.2, 0.05), MAT.concreteFair);
  base.position.set(10.6, start - decks * storey - 1.0, 21.25);
  parent.add(base);
}

// ---------------------------------------------------------------------------

export function buildExterior(): THREE.Group {
  const group = new THREE.Group();
  const rng = makeRng(seedFrom('exterior.hannover'));

  // Street, far below and entirely in shadow at this hour. Large enough that
  // its edge is never the thing terminating the view.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), flat(aerial(0x33302e, 90)));
  ground.position.set(ORIGIN.x, GROUND_Y, ORIGIN.y);
  group.add(ground);

  hostBuilding(group);
  parkhaus(group);

  /**
   * The near fan, on a full circle rather than an arc.
   *
   * A curtain wall lets you see nearly 180° through it, and an open deck lets
   * you see all of it — so blocks are placed on a ring around the whole
   * floorplate. Heights are lowest to the west, where the deck looks out: the
   * blocks over there are deliberately shorter than we are, so looking down
   * onto their roofs establishes our height and leaves the sunset clear.
   */
  const FAN = 26;
  for (let i = 0; i < FAN; i++) {
    const angle = (i / FAN) * Math.PI * 2 + jitterAngle(rng);
    const radius = range(rng, 62, 130);
    // How far this block is from due west, where the view matters most.
    const openness = Math.abs(Math.cos(angle - Math.PI * 1.5));
    const height = range(rng, 13, 22) + (1 - openness) * range(rng, 8, 30);

    building(
      group,
      {
        x: ORIGIN.x + Math.sin(angle) * radius,
        z: ORIGIN.y + Math.cos(angle) * radius,
        width: range(rng, 24, 46),
        depth: range(rng, 16, 28),
        height,
        storey: range(rng, 3.3, 3.9),
      },
      radius,
      // Turned to face roughly back at us, so its window wall is the side we see.
      -angle + jitterAngle(rng) * 0.6,
      rng,
    );
  }

  // The mass of the city, then a low rim so the horizon never simply stops.
  cityField(group, rng, { count: 240, minRadius: 150, maxRadius: 470, minHeight: 16, maxHeight: 62 });
  cityField(group, rng, { count: 130, minRadius: 470, maxRadius: 940, minHeight: 22, maxHeight: 70 });

  return group;
}

/** Small angular wobble so the fan never reads as an evenly spaced ring. */
function jitterAngle(rng: Rng): number {
  return (rng() * 2 - 1) * 0.09;
}
