/**
 * The Blender kit, loaded at startup.
 *
 * Assets are built by `kit/build_*.py` and exported to `public/kit`. This module
 * loads them once and hands out clones, so a room full of chairs costs one
 * parse and one geometry upload.
 *
 * Per-instance variation happens here rather than in Blender: the exporter
 * writes one material named `Fabric`, and each clone gets its own copy of it
 * with a different colour. That keeps a single asset on disk while still
 * satisfying the anti-duplication rule — no two chairs in a sightline are the
 * same instance.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { TINTS, asColor } from '../office/palette';
import { pick, range, type Rng } from '../office/rng';

type Asset = { high: THREE.Group; low: THREE.Group | null };

const assets = new Map<string, Asset>();

/**
 * Distance at which a prop drops to its decimated variant.
 *
 * Chosen from how the game is actually looked at: the chase camera sits 3.4 m
 * back, so the player's own chair is always full detail, and essentially every
 * other prop in the room is beyond this and switches.
 */
const LOD_DISTANCE = 6.5;

const FABRIC_CHOICES = [TINTS.upholstery, TINTS.upholsteryAlt] as const;

export async function loadKit(): Promise<void> {
  const loader = new GLTFLoader();
  const manifest: [string, string][] = [
    ['taskChair', '/kit/task-chair.glb'],
    // The one being driven. Same chair with the armrests left off — see the note
    // at the top of `kit/build_chair.py`: the cast sits with its hands forward in
    // its lap, so on a chair with arms the forearms pass through both pads.
    ['raceChair', '/kit/task-chair-race.glb'],
    ['crtMonitor', '/kit/crt.glb'],
    ['benchDesk', '/kit/desk.glb'],
    ...DRIVERS.map((key) => [`driver.${key}`, `/kit/driver-${key}.glb`] as [string, string]),
  ];

  const prepare = (root: THREE.Object3D) => {
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  };

  await Promise.all(
    manifest.map(async ([name, url]) => {
      const lowUrl = url.replace(/\.glb$/, '-low.glb');
      const [high, low] = await Promise.all([
        loader.loadAsync(url),
        // A missing low variant is not fatal — the asset simply never switches.
        loader.loadAsync(lowUrl).catch(() => null),
      ]);
      prepare(high.scene);
      if (low) prepare(low.scene);
      assets.set(name, { high: high.scene, low: low ? low.scene : null });
    }),
  );
}

/**
 * One instance of a kit asset as a THREE.LOD.
 *
 * three swaps the level itself during render based on distance to the camera,
 * so nothing in the game has to know this happened.
 */
function instance(name: string): THREE.LOD {
  const asset = assets.get(name);
  if (!asset) throw new Error(`kit asset "${name}" requested before loadKit() resolved`);

  const lod = new THREE.LOD();
  lod.addLevel(asset.high.clone(true), 0);
  if (asset.low) lod.addLevel(asset.low.clone(true), LOD_DISTANCE);
  return lod;
}

/**
 * Wrap a kit asset in a group, turned to face the game's forward direction.
 *
 * Blender is Z-up and its front view looks along +Y, so an object authored
 * facing -Y arrives from the glTF exporter facing +Z. The game's convention is
 * -Z, hence the half turn — corrected here rather than in the build scripts so
 * assets stay natural to author.
 */
function oriented(name: string): { group: THREE.Group; model: THREE.Object3D } {
  const group = new THREE.Group();
  const model = instance(name);
  model.rotation.y = Math.PI;
  group.add(model);
  return { group, model };
}

/** 17" CRT. Origin sits on the desk surface. */
export function crtMonitor(): THREE.Group {
  return oriented('crtMonitor').group;
}

/** Bench desk, 1600 × 800 × 720. Origin on the floor, user side at -Z. */
export function benchDesk(): THREE.Group {
  return oriented('benchDesk').group;
}


/**
 * The cast, by asset key.
 *
 * Seven characters, one body. `blender/crew/cast.py` is the authority and its
 * README states the rule this list exists to serve: everyone wears the same white
 * tee, the same trousers, the same shoes and the same frame, and only the head
 * changes. So there is nothing to recolour and nothing to configure — swapping
 * driver means swapping the whole rigged asset, which is why all seven are loaded
 * rather than one being dressed up.
 *
 * They come to about 9 MB together, which the holding card in `index.html` covers.
 * The alternative — loading one and fetching the rest on demand — buys a faster
 * boot and pays for it with a stall in the middle of the picker, at the exact
 * moment somebody is comparing two of them.
 */
export const DRIVERS = ['intern', 'newone', 'boss', 'facilities', 'sales', 'designer', 'dog'] as const;

export type DriverKey = (typeof DRIVERS)[number];

/**
 * One of the cast, seated and rigged, as a fresh instance.
 *
 * Cloned through `SkeletonUtils` rather than handed over directly, because there
 * are five of these on the grid at once and an ordinary `clone()` of a skinned
 * mesh keeps a reference to the original's skeleton — bind one figure's rig and
 * all five would inherit its pose. Geometry and materials are shared by
 * reference, so the clone costs a skeleton and a handful of nodes.
 */
/**
 * Parts a figure is carrying that its character sheet no longer asks for.
 *
 * The facilities manager wore headphones — a band, two cups, the accent marks on
 * them, and a three-segment cable with a jack on the end. `blender/crew/cast.py`
 * says `cans=False` for him and has for a while; the `.glb` in `public/kit` was
 * exported before that and still has the lot, and re-exporting needs Blender, which
 * a browser does not have.
 *
 * So they come off here, by name, at the one place every figure is built. This is a
 * patch over a stale asset and should be deleted the next time the crew is exported
 * — `python blender/export.py` is what makes it unnecessary. Until then it is at
 * least honest: the sheet is the source of truth and this is the runtime agreeing
 * with it, rather than the sheet being quietly edited to match a file nobody can
 * rebuild.
 */
const STALE_PARTS: Partial<Record<DriverKey, readonly string[]>> = {
  // Exactly what `_cans` in blender/crew/build.py builds, and nothing else: the band,
  // the two cups, the accent mark on each, and the cable with its jack. Not `ball` or
  // `catch`, which sound like headphone parts and are the eyeballs and the buckle
  // under the paper bag.
  facilities: ['hpband', 'cup1', 'cup-1', 'mark1', 'mark-1', 'cable1', 'cable2', 'cable3', 'plug'],
};

export function driver(key: DriverKey = 'intern'): THREE.Group {
  const asset = assets.get(`driver.${key}`);
  if (!asset) throw new Error(`driver "${key}" requested before loadKit() resolved`);
  const group = new THREE.Group();
  const figure = cloneSkinned(asset.high);
  // The same half turn as every other asset: authored facing -Y in Blender, so it
  // arrives facing +Z and has to be turned to the game's forward.
  figure.rotation.y = Math.PI;

  const stale = STALE_PARTS[key];
  if (stale) {
    // Collected before removing: `traverse` walks the children it is given, and
    // removing during the walk skips siblings.
    const drop: THREE.Object3D[] = [];
    figure.traverse((o) => {
      // Meshes only, which the sheet names `<Character>_<part>`. The armature's bones
      // are bare — `cable1` is a *bone* as well as a mesh, the rig binds it by name,
      // and taking it out is how a whole cast stops animating.
      const cut = o.name.indexOf('_');
      if (cut < 0) return;
      if (stale.includes(o.name.slice(cut + 1))) drop.push(o);
    });
    for (const o of drop) o.removeFromParent();
  }

  group.add(figure);
  return group;
}

/** The chair that gets driven: the task chair with no armrests. */
export function raceChair(rng?: Rng): { group: THREE.Group; seatHeight: number } {
  return chairFrom('raceChair', rng);
}

/** A task chair, with its fabric recoloured per instance. */
export function taskChair(rng?: Rng): { group: THREE.Group; seatHeight: number } {
  return chairFrom('taskChair', rng);
}

function chairFrom(asset: string, rng?: Rng): { group: THREE.Group; seatHeight: number } {
  const { group, model } = oriented(asset);

  if (rng) {
    const spec = pick(rng, FABRIC_CHOICES);
    const tint = asColor(spec).multiplyScalar(range(rng, 0.82, 1.12));
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat?.name !== 'Fabric') return;
      const own = mat.clone();
      own.color.copy(tint);
      mesh.material = own;
    });
  }

  // The asset is modelled at a fixed 470 mm seat. Gas-lift variation would mean
  // rigging the column, which is not worth it for a prop — the visible
  // variation is doing its work through fabric and pose instead.
  return { group, seatHeight: 0.47 };
}
