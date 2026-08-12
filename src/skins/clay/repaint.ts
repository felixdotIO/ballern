/**
 * Repainting the building, without editing the building.
 *
 * `office/*.ts` reaches for `MAT.carpet` and `PROP_MAT.melamine` directly —
 * that is the fusion the lab was built to work around, and it is why the lab
 * had to hand-cut its own room rather than use the real floorplate. This file
 * is the way round it that does not need the migration doing first.
 *
 * The trick is that `MAT` and `PROP_MAT` are objects of *material instances*,
 * shared by construction: `office/materials.ts` exists precisely so that there
 * is exactly one carpet in the project and a room cannot quietly acquire its
 * own slightly different beige. Every wall, desk, cabinet and skirting in the
 * building holds a reference to the same handful of objects. So repainting them
 * in place — before anything is built — re-skins the entire floorplate, and
 * `src/main.ts` and everything under `office/` are untouched.
 *
 * That is a real technique and not a hack, but it has two honest limits and
 * both are worth knowing before judging the result:
 *
 *  - **It cannot change geometry.** Every box in the building is chamfered at
 *    4 mm by `render/geometry.ts`, which is a highlight-catcher, not a
 *    roundover. The clay look in the lab gets a proportional radius; here the
 *    forms stay architectural. Changing that is one constant in a shared module
 *    — deliberately not done, because the brief was a copy.
 *  - **It is global.** Mutating a shared singleton affects anything else in the
 *    same page that uses it. That is fine here because this entry is the only
 *    thing on its page, and it is exactly why this lives in its own entry point
 *    rather than behind a flag in the real one.
 */

import * as THREE from 'three';

import { MAT } from '../../office/materials';
import { PROP_MAT } from '../../office/props/shared';

/**
 * The clay-bold palette, mapped onto the building's own vocabulary.
 *
 * Same hues as `office/palette.ts` throughout — this is the beige 2004 office
 * at golden hour, not a different building. Values are down and chroma is up,
 * for the reason set out in `styles/clayBold.ts`: a rim light is only visible
 * against something dark, so a dramatic room is made by leaving room for the
 * lights rather than by adding them.
 */
const PAINT: Record<string, number> = {
  // -- the five --------------------------------------------------------------
  carpet: 0x54703f,
  carpetRun: 0x2c5268,
  carpetBoard: 0x46603a,
  carpetTrim: 0x24303a,
  wall: 0xbfa887,
  melamine: 0xa8763c,
  metal: 0x7d8794,

  // -- the building ----------------------------------------------------------
  darkMetal: 0x2f3945,
  stainless: 0x8d97a2,
  ceilingTile: 0xc9b79c,
  paintedSoffit: 0xa8947a,
  blind: 0xd8c8a8,
  linoleum: 0x4c6350,
  quarryTile: 0x7a4f31,
  wallTile: 0xd6cdb8,
  antistatic: 0x5c6a68,
  graniteLight: 0x8a8073,
  graniteDark: 0x2a2a29,
  graniteBand: 0x6b6359,
  entranceMatting: 0x30322e,
  concrete: 0x6f6a60,
  concreteFair: 0x7d776c,
  trafficWhite: 0xd9cfb6,
  trafficYellow: 0xf0a828,
  trafficBlue: 0x2f6d96,
  hazardRed: 0xff4626,
  leather: 0x2c211c,
  plastic: 0xdfd2b6,
  crtGlass: 0x14181f,
  patchCable: 0x7d8794,
  rubber: 0x24282e,
  glass: 0x5c93a8,
  partitionGlass: 0x76a8ba,
  paper: 0xdfd2b6,

  // -- the props -------------------------------------------------------------
  edgeBand: 0x6b675f,
  /** Desk chairs. Never the player's colour — the hero chair stays alone. */
  fabric: 0x3d6f80,
  fabricAlt: 0x8a4a52,
  screen: 0x5b6878,
  darkPlastic: 0x1f2228,
  soil: 0x241a13,
  terracotta: 0x6d4527,
  planterSteel: 0x8d97a2,
  leaf: 0x35703f,
  leafDark: 0x2a5c33,
  ceramic: 0xdfd2b6,
  glassware: 0x9fc6cf,
  bottleGreen: 0x24512f,
  crate: 0x2f6d96,
};

/** Everything a clay surface is, other than its colour. */
const CLAY = { roughness: 0.9, metalness: 0 };

/**
 * Colour for anything the map above does not name.
 *
 * Same rule the palette follows, applied arithmetically: keep the hue, push the
 * chroma up, pull the value down and into a band. It exists because the Blender
 * kit ships its own materials inside the `.glb` files and there is no list of
 * them — a generic regrade is the only thing that can reach those, and it turns
 * out to be good enough because the kit's colours were authored to the same
 * palette in the first place.
 */
const hsl = { h: 0, s: 0, l: 0 };

function regrade(color: THREE.Color): void {
  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    Math.min(0.62, hsl.s * 1.5 + 0.05),
    THREE.MathUtils.clamp(0.14 + hsl.l * 0.66, 0.06, 0.84),
  );
}

/** Emissive fittings are light sources wearing a material. Leave them alone. */
function isEmitter(m: THREE.Material): boolean {
  const e = (m as THREE.MeshStandardMaterial).emissive;
  return !!e && (e.r > 0.02 || e.g > 0.02 || e.b > 0.02);
}

function paintOne(m: THREE.Material, name?: string): void {
  const std = m as THREE.MeshStandardMaterial;
  if (isEmitter(std)) return;

  const hex = name ? PAINT[name] : undefined;
  if (hex !== undefined) std.color.setHex(hex);
  else if (std.color) regrade(std.color);

  // Textures are the thing that most stops this reading as clay. The carpet's
  // pile, the ceiling's fissure and the deck's float are all band-limited
  // normal maps doing exactly what they were built to do — and a moulded object
  // has no weave. They go, and with them most of the 2004-ness, which is the
  // trade this whole style is.
  std.map = null;
  std.normalMap = null;
  std.roughnessMap = null;
  std.metalnessMap = null;
  std.aoMap = null;

  std.roughness = CLAY.roughness;
  std.metalness = CLAY.metalness;

  // Glazing keeps its transparency and gains a little roughness — cast acrylic
  // rather than float glass, because a clear pane in a room made of clay is the
  // one object that would have to be *not* clay.
  if (std.transparent) {
    std.roughness = 0.35;
    std.opacity = Math.min(0.85, std.opacity + 0.25);
  }

  std.needsUpdate = true;
}

/**
 * Repaint every shared material in the project.
 *
 * Must run before anything is built. It does not have to — the materials are
 * live and three will pick the change up on the next frame — but a builder that
 * reads `material.color` while deciding something would see the old value, and
 * running first removes the question.
 */
export function repaintBuilding(): void {
  for (const [name, m] of Object.entries(MAT)) paintOne(m as THREE.Material, name);
  for (const [name, m] of Object.entries(PROP_MAT)) paintOne(m as THREE.Material, name);
}

/**
 * Repaint whatever a `.glb` brought with it.
 *
 * The Blender kit's assets carry their own materials, and `render/kit.ts` also
 * hands each clone its own copy of the fabric so no two chairs in a sightline
 * match. Neither is reachable from a name, so both go through the regrade.
 */
export function repaintObject(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      paintOne(m);
    }
  });
}
