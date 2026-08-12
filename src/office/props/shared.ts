/**
 * The parts every prop kit is built from.
 *
 * Convention, and it holds across every file in this directory: a prop's origin
 * sits on the floor at its centre, and it faces -Z — the same direction three
 * uses for an unrotated mesh. That means a desk's user sits on the -Z side of
 * it, a cabinet opens toward -Z, a car's bonnet points at -Z, and every
 * dressing solver only ever has to reason about one facing.
 *
 * Materials are shared with the building's, not reinvented per prop. The moment
 * props start carrying their own bespoke beiges the room falls apart, and with
 * six room types on one floorplate that failure mode is six times as available.
 */

import * as THREE from 'three';

import { SURFACES, TINTS, asColor, type SurfaceSpec } from '../palette';
import { bevelBox } from '../../render/geometry';
import { jitter, pick, range, type Rng } from '../rng';
import { BINDER_COLORS } from '../palette';
import { OH, STORAGE } from '../metrics';

const mat = (spec: SurfaceSpec, over: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    color: asColor(spec),
    roughness: spec.roughness,
    metalness: spec.metalness,
    ...over,
  });

export const PROP_MAT = {
  melamine: mat(SURFACES.melamine),
  /** Grey PVC edge banding — the giveaway detail of the era's furniture. */
  edgeBand: mat({ referent: 'PVC edge band, grey', color: 0x8f8b82, roughness: 0.5, metalness: 0 }),
  metal: mat(SURFACES.metal),
  darkMetal: mat({ referent: 'RAL 7024 graphite frame', color: 0x54565a, roughness: 0.5, metalness: 0.45 }),
  stainless: mat(TINTS.stainless),
  fabric: mat(TINTS.upholstery),
  fabricAlt: mat(TINTS.upholsteryAlt),
  leather: mat(TINTS.leather),
  /** Stellwand screen fabric — flat, acoustic, the colour of nothing. */
  screen: mat({ referent: 'acoustic screen fabric, oatmeal', color: 0xa9a294, roughness: 0.95, metalness: 0 }),
  plastic: mat(TINTS.yellowedPlastic),
  darkPlastic: mat({ referent: 'ABS housing, charcoal', color: 0x3a3b3d, roughness: 0.5, metalness: 0 }),
  crtGlass: mat(TINTS.crtGlass, { roughness: 0.18 }),
  paper: mat({ referent: 'A4 80 gsm', color: 0xf2efe6, roughness: 0.85, metalness: 0 }),
  soil: mat({ referent: 'potting compost', color: 0x2e2620, roughness: 1, metalness: 0 }),
  terracotta: mat({ referent: 'plastic planter, terracotta', color: 0x8a5540, roughness: 0.75, metalness: 0 }),
  planterSteel: mat({ referent: 'brushed steel planter, reception', color: 0xa8aaa9, roughness: 0.35, metalness: 0.75 }),
  leaf: mat({ referent: 'Dracaena marginata foliage', color: 0x3f5a33, roughness: 0.7, metalness: 0 }),
  leafDark: mat({ referent: 'Ficus benjamina foliage', color: 0x33492c, roughness: 0.75, metalness: 0 }),
  ceramic: mat({ referent: 'glazed stoneware mug', color: 0xe8e4dc, roughness: 0.28, metalness: 0 }),
  glassware: new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xdfe8e6),
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.3,
  }),
  /** Sprudel, in the only bottle Germany sells it in. */
  bottleGreen: new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x2f4a33),
    roughness: 0.12,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
  }),
  crate: mat({ referent: 'PE Getränkekasten, blue', color: 0x27447a, roughness: 0.6, metalness: 0 }),
  rubber: mat({ referent: 'EPDM castor tyre', color: 0x2a2a28, roughness: 0.85, metalness: 0 }),
} as const;

/** A bevelled box, cast and received. The unit every prop is assembled from. */
export function part(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: [number, number, number],
  at: [number, number, number],
  bevel = 0.006,
): THREE.Mesh {
  const m = new THREE.Mesh(bevelBox(size[0], size[1], size[2], bevel), material);
  m.position.set(at[0], at[1], at[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** A cylinder, standing on its base unless told otherwise. */
export function tube(
  parent: THREE.Object3D,
  material: THREE.Material,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  at: [number, number, number],
  segments = 16,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  m.position.set(at[0], at[1] + height / 2, at[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Things that turn up in more than one room
// ---------------------------------------------------------------------------

export function mug(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.037, 0.095, 20), PROP_MAT.ceramic);
  body.position.y = 0.0475;
  body.castShadow = true;
  g.add(body);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.006, 8, 16, Math.PI * 1.15), PROP_MAT.ceramic);
  handle.position.set(0.045, 0.05, 0);
  handle.rotation.set(0, Math.PI / 2, -0.4);
  handle.castShadow = true;
  g.add(handle);
  g.rotation.y = rng() * Math.PI * 2;
  return g;
}

/** A4 stack. Never square to the desk. */
export function paperStack(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const sheets = Math.floor(range(rng, 2, 5));
  for (let i = 0; i < sheets; i++) {
    const s = part(
      g,
      PROP_MAT.paper,
      [0.21, 0.004, 0.297],
      [jitter(rng, 0.008), 0.002 + i * 0.004, jitter(rng, 0.008)],
      0.001,
    );
    s.rotation.y = jitter(rng, 0.09);
  }
  return g;
}

export function bin(): THREE.Group {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.112, 0.30, 20, 1, true), PROP_MAT.darkMetal);
  b.position.y = 0.15;
  b.material.side = THREE.DoubleSide;
  b.castShadow = true;
  g.add(b);
  return g;
}

/** Aktenschrank, specified in Ordnerhöhen like everything else in the room. */
export function cabinet(heightsInOH: number, width = STORAGE.cabinetWidth): THREE.Group {
  const g = new THREE.Group();
  const w = width;
  const d = STORAGE.cabinetDepth;
  const h = heightsInOH * OH;

  part(g, PROP_MAT.melamine, [w, 0.05, d], [0, 0.025, 0]);
  part(g, PROP_MAT.melamine, [0.018, h, d], [-w / 2 + 0.009, h / 2, 0]);
  part(g, PROP_MAT.melamine, [0.018, h, d], [w / 2 - 0.009, h / 2, 0]);
  part(g, PROP_MAT.melamine, [w, 0.018, d], [0, h - 0.009, 0]);
  part(g, PROP_MAT.melamine, [w - 0.036, 0.016, d - 0.02], [0, 0.05, 0.01]);
  for (let i = 1; i < heightsInOH; i++) {
    part(g, PROP_MAT.melamine, [w - 0.036, 0.016, d - 0.02], [0, 0.05 + i * OH, 0.01]);
  }
  return g;
}

/**
 * Binder spines, cached by colour and dye lot.
 *
 * The obvious way to vary these is a fresh material per file, and it is the
 * expensive way: four hundred lever-arch files in the building means four
 * hundred materials, which survives every attempt to batch them. Quantising the
 * variation into a couple of dozen shared materials looks identical — nobody
 * can see the difference between two adjacent brightnesses of the same red —
 * and lets a whole storage wall collapse into one draw per colour.
 */
const BINDER_MATERIALS = new Map<string, THREE.MeshStandardMaterial>();

function binderMaterial(color: number, lot: number, wear: number): THREE.MeshStandardMaterial {
  const key = `${color}:${lot}:${wear}`;
  let mat = BINDER_MATERIALS.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).multiplyScalar(0.85 + lot * 0.0625),
      roughness: 0.55 + wear * 0.05,
    });
    BINDER_MATERIALS.set(key, mat);
  }
  return mat;
}

/**
 * A shelf of lever-arch files.
 *
 * The strongest regional signature available to us, and the cheapest source of
 * honest colour variety in the room. Widths alternate between the wide and
 * narrow spine, the run leans where it isn't full, and the colours stay in the
 * limited, slightly grim range the real product comes in — brightening these
 * into a toy palette would undo the whole point.
 */
export function binderRow(width: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  let x = -width / 2 + 0.012;
  let lean = 0;

  while (x < width / 2 - 0.06) {
    const wide = rng() > 0.35;
    const bw = wide ? STORAGE.binderWidthWide : STORAGE.binderWidthNarrow;
    if (x + bw > width / 2 - 0.012) break;

    // A gap in the run — a file is out on someone's desk. Everything after it
    // leans into the space, which is what a half-empty shelf actually does.
    if (rng() > 0.9) {
      x += bw * 0.8;
      lean = range(rng, 0.06, 0.16);
      continue;
    }

    const b = part(
      g,
      PROP_MAT.melamine,
      [bw - 0.004, STORAGE.binderHeight, STORAGE.binderDepth],
      [x + bw / 2, STORAGE.binderHeight / 2, 0],
      0.002,
    );
    b.material = binderMaterial(pick(rng, BINDER_COLORS), Math.floor(rng() * 4), Math.floor(rng() * 5));
    b.rotation.z = lean;
    if (lean > 0) b.position.y -= 0.004;
    lean = Math.max(0, lean - 0.05);
    x += bw;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Foliage
// ---------------------------------------------------------------------------

/**
 * A single strap leaf: tapered to a point and drooping under its own weight.
 *
 * Built as real geometry rather than as a flat box, because a box reads as a
 * stick and a bundle of sticks reads as nothing at all. The taper and the droop
 * are what make the eye accept it as foliage.
 */
function leafGeometry(length: number, width: number): THREE.BufferGeometry {
  const segments = 7;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    // Widest around a third of the way along, tapering to a point at the tip.
    const w = width * Math.sin(Math.PI * Math.pow(t, 0.55)) * (1 - t * 0.15);
    // Droop accelerates toward the tip, and the leaf curls slightly as it falls.
    const drop = -length * 0.45 * t * t;
    const z = length * t;
    positions.push(-w / 2, drop, z, w / 2, drop - w * 0.12, z);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export type PlantOptions = {
  /** Scale on the whole plant. Reception plants are twice the office ones. */
  scale?: number;
  /** Brushed steel cache-pot instead of the terracotta one, for the hall. */
  smart?: boolean;
};

/**
 * Dracaena marginata — the office plant of the period, and geometrically kind
 * to us: canes and strap leaves rather than a canopy that would need real
 * foliage cards to avoid looking like a green blob.
 */
export function plant(rng: Rng, opts: PlantOptions = {}): THREE.Group {
  const g = new THREE.Group();
  const s = opts.scale ?? 1;
  const potH = 0.28 * s;
  const potR = 0.16 * s;

  if (opts.smart) {
    // A cylindrical brushed-steel cache pot, which is what a reception buys
    // when it wants the plant to look like it was specified rather than bought.
    tube(g, PROP_MAT.planterSteel, potR * 1.15, potR * 1.1, potH, [0, 0, 0], 24);
  } else {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(potR, potR * 0.78, potH, 20), PROP_MAT.terracotta);
    pot.position.y = potH / 2;
    pot.castShadow = true;
    pot.receiveShadow = true;
    g.add(pot);
  }

  const soil = new THREE.Mesh(new THREE.CylinderGeometry(potR * 0.93, potR * 0.93, 0.02, 20), PROP_MAT.soil);
  soil.position.y = potH - 0.012;
  g.add(soil);

  const foliage = opts.smart ? PROP_MAT.leafDark : PROP_MAT.leaf;
  const canes = Math.floor(range(rng, 2, 4));
  for (let c = 0; c < canes; c++) {
    const caneH = range(rng, 0.5, 0.95) * s;
    const lean = range(rng, 0.04, 0.16);
    const dir = rng() * Math.PI * 2;
    const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.017 * s, 0.023 * s, caneH, 8), PROP_MAT.soil);
    cane.position.set(Math.cos(dir) * 0.05 * s, potH + caneH / 2, Math.sin(dir) * 0.05 * s);
    cane.rotation.z = lean * Math.cos(dir);
    cane.rotation.x = -lean * Math.sin(dir);
    cane.castShadow = true;
    g.add(cane);

    // Leaves radiate from the crown. Each hangs off a pivot at the growing
    // point and is rotated outward from there, so they fan from one origin
    // instead of floating around it.
    const crownX = Math.cos(dir) * 0.05 * s + Math.sin(cane.rotation.z) * caneH * 0.5;
    const crownZ = Math.sin(dir) * 0.05 * s - Math.sin(cane.rotation.x) * caneH * 0.5;
    const leaves = Math.floor(range(rng, 11, 17));
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + rng() * 0.5;
      const len = range(rng, 0.26, 0.46) * s;
      const pivot = new THREE.Group();
      pivot.position.set(crownX, potH + caneH - range(rng, 0, 0.07) * s, crownZ);
      pivot.rotation.y = -a;
      // Older leaves at the bottom of the crown sit almost horizontal; new
      // growth at the top stands up.
      pivot.rotation.x = range(rng, -0.15, 0.55);
      pivot.rotation.z = jitter(rng, 0.25);

      const leaf = new THREE.Mesh(leafGeometry(len, range(rng, 0.026, 0.038) * s), foliage);
      leaf.material.side = THREE.DoubleSide;
      leaf.castShadow = true;
      pivot.add(leaf);
      g.add(pivot);
    }
  }
  return g;
}

/**
 * Wanduhr. Every meeting room, every reception, every canteen in the country.
 *
 * Set to a real time — twenty past six on a Friday, which is why the building
 * is empty enough to drive around. A clock at twelve o'clock reads as a texture;
 * a clock at an odd time reads as a clock.
 */
export function wallClock(diameter = 0.32): THREE.Group {
  const g = new THREE.Group();
  const r = diameter / 2;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.045, 28), PROP_MAT.metal);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  g.add(body);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(r - 0.012, r - 0.012, 0.048, 28), PROP_MAT.paper);
  face.rotation.x = Math.PI / 2;
  g.add(face);

  // Hour marks, and the two hands. 18:20.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.008, r * 0.16, 0.004), PROP_MAT.darkPlastic);
    mark.position.set(Math.sin(a) * r * 0.84, Math.cos(a) * r * 0.84, -0.026);
    mark.rotation.z = -a;
    g.add(mark);
  }
  for (const [length, width, angle] of [
    [r * 0.5, 0.01, (18.33 / 12) * Math.PI * 2],
    [r * 0.78, 0.007, (20 / 60) * Math.PI * 2],
  ] as const) {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.004), PROP_MAT.darkPlastic);
    hand.position.set((Math.sin(angle) * length) / 2, (Math.cos(angle) * length) / 2, -0.028);
    hand.rotation.z = -angle;
    g.add(hand);
  }
  return g;
}

/**
 * A framed panel: a recessed face inside four bars standing proud of it.
 *
 * The obvious way to build one of these is a solid box for the frame and a
 * slightly smaller box in front of it for the face, and it is wrong in a way
 * that only shows up on screen: the two overlap in depth, the depth buffer
 * cannot decide which is nearer, and the result is a shimmering checkerboard
 * across the whole panel that follows the camera. Every board in the building —
 * the artwork, the pin wall, the notice board, the directory, the whiteboard —
 * had it.
 *
 * A frame is four bars around a hole. Building it that way removes the overlap
 * by construction and also looks like a frame, which the box never did.
 *
 * Returns the depth its face sits at, so callers can pin things to it.
 */
export function framedPanel(
  parent: THREE.Object3D,
  frameMaterial: THREE.Material,
  faceMaterial: THREE.Material,
  width: number,
  height: number,
  opts: { bar?: number; depth?: number; faceDepth?: number } = {},
): number {
  const bar = opts.bar ?? 0.05;
  const depth = opts.depth ?? 0.04;
  const faceDepth = opts.faceDepth ?? 0.014;

  // Convention: props face -Z, so the front of the frame is at -depth/2.
  for (const sy of [-1, 1] as const) {
    part(parent, frameMaterial, [width, bar, depth], [0, (sy * (height - bar)) / 2, 0], 0.004);
  }
  for (const sx of [-1, 1] as const) {
    part(parent, frameMaterial, [bar, height - bar * 2, depth], [(sx * (width - bar)) / 2, 0, 0], 0.004);
  }

  // The face sits behind the front of the bars, which is what "framed" means.
  const front = -depth / 2 + 0.012;
  part(parent, faceMaterial, [width - bar * 1.6, height - bar * 1.6, faceDepth], [0, 0, front + faceDepth / 2], 0.003);
  return front;
}
