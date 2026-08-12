/**
 * Static geometry batching.
 *
 * The shell is built the way a building is described — one box per wall piece,
 * one per ceiling tee, one per socket plate — because that is the only way the
 * code stays readable against the dimensional constants it works from. On one
 * bay that cost a few hundred draw calls and nobody noticed. On a whole
 * floorplate with a car park attached it is several thousand, which is enough
 * to be the frame budget on its own.
 *
 * So the authoring stays per-box and the result does not: every box goes into a
 * bucket keyed by material and shadow flags, and each bucket is merged into a
 * single mesh at the end. Nothing about the building description changes, and
 * the room arrives as a couple of dozen draws.
 *
 * What this deliberately does not do is merge anything that moves, anything
 * lit per-instance, or anything that wants its own tinted colour — those go in
 * through `add()` untouched, as instanced meshes or as plain objects.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { bevelBox } from './geometry';

/** The attributes every merged geometry is reduced to. */
const KEEP = ['position', 'normal', 'uv'] as const;

/**
 * Bring a geometry into the one shape everything can be merged in: non-indexed,
 * and carrying exactly the three attributes above.
 *
 * mergeGeometries refuses to mix indexed and non-indexed input, and silently
 * produces garbage if the attribute sets differ — three's rounded box is
 * non-indexed while every cylinder and plane is indexed, so without this the
 * first batch that mixed a wall with a sprinkler head would throw.
 */
function normalize(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source.clone();
  if (!geo.getAttribute('uv')) {
    const count = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  }
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  for (const name of Object.keys(geo.attributes)) {
    if (!KEEP.includes(name as (typeof KEEP)[number])) geo.deleteAttribute(name);
  }
  return geo;
}

type BoxOptions = {
  /** Rotation about Y, radians. */
  yaw?: number;
  /** Chamfer. Kept at true size, never scaled from a unit cube. */
  bevel?: number;
  /**
   * Ceilings opt out: they are lit from below, so casting from them produces
   * nothing but acne. Everything else casts, because at golden hour the light
   * arrives sideways and every upstand in the room throws a bar across it.
   */
  cast?: boolean;
  receive?: boolean;
};

/**
 * Somewhere to put geometry. The shell builders take one of these rather than
 * a THREE.Object3D, so the same code can be batched or, for debugging, not.
 */
export type Sink = {
  box(material: THREE.Material, size: readonly [number, number, number], centre: readonly [number, number, number], opts?: BoxOptions): void;
  /** Arbitrary geometry, merged. The matrix is baked into the vertices. */
  geo(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, opts?: BoxOptions): void;
  /** Anything that must stay its own object: lights, instanced meshes, groups. */
  add(object: THREE.Object3D): void;
};

export class Batch implements Sink {
  private readonly buckets = new Map<
    string,
    { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[] }
  >();

  private readonly loose: THREE.Object3D[] = [];
  private readonly scratch = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly at = new THREE.Vector3();

  box(
    material: THREE.Material,
    size: readonly [number, number, number],
    centre: readonly [number, number, number],
    opts: BoxOptions = {},
  ): void {
    this.quat.setFromAxisAngle(this.up, opts.yaw ?? 0);
    this.at.set(centre[0], centre[1], centre[2]);
    this.scratch.compose(this.at, this.quat, this.one);
    this.geo(material, bevelBox(size[0], size[1], size[2], opts.bevel), this.scratch, opts);
  }

  geo(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, opts: BoxOptions = {}): void {
    const cast = opts.cast ?? true;
    const receive = opts.receive ?? true;
    const key = `${material.uuid}:${cast ? 1 : 0}${receive ? 1 : 0}`;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { material, cast, receive, parts: [] };
      this.buckets.set(key, bucket);
    }

    const part = normalize(geometry);
    part.applyMatrix4(matrix);
    bucket.parts.push(part);
  }

  add(object: THREE.Object3D): void {
    this.loose.push(object);
  }

  /** Merge everything collected and hand back one group ready for the scene. */
  flush(): THREE.Group {
    const group = new THREE.Group();

    for (const { material, cast, receive, parts } of this.buckets.values()) {
      const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      group.add(mesh);
    }

    for (const object of this.loose) group.add(object);

    this.buckets.clear();
    this.loose.length = 0;
    return group;
  }
}

/**
 * Collapse an already-built object tree into one mesh per material.
 *
 * The props are authored the way the shell is — one small mesh per part, because
 * that is how you describe a thing made of parts. A rack is sixty of them, a car
 * is a hundred and twenty, and a floorplate with twenty cars and eighteen racks
 * on it came out at thirty thousand draw calls a frame, which is the whole
 * budget spent on submitting geometry rather than drawing it.
 *
 * So the authoring stays per-part and the result does not. Nothing about how a
 * prop is written changes; it just arrives as five meshes instead of a hundred.
 *
 * What is deliberately left alone: skinned meshes, instanced meshes and lights.
 * Each of those carries state that only survives as its own object — a skeleton
 * has to stay bound — so they are lifted out intact and reparented rather than
 * baked.
 *
 * Levels of detail used to be on that list and are not any more; see `detail`.
 */
export type CollapseOptions = {
  /**
   * What to do with a THREE.LOD.
   *
   * `'keep'` leaves it as its own switching object, which is what an LOD is for
   * and what it costs: every level of every instance stays a separate draw. The
   * open-plan office alone is eighty-two desks and chairs out of the Blender
   * kit, and keeping their LODs was seven hundred and twelve meshes in one room
   * — nearly half the floorplate's draw calls, and every one of them submitted
   * twice a frame because the ambient-occlusion pass re-renders the scene for
   * normals.
   *
   * `'high'` bakes the nearest level into the merge and throws the rest away.
   * It costs triangles, and the measurement says triangles are not what is
   * expensive here: the whole floorplate draws 2.2 M of them in about 6 ms and
   * spends the same again just submitting fifteen hundred draw calls. Trading
   * the second for the first is the right way round, and it is also the only
   * one of the two that a room full of desks can be merged under.
   */
  detail?: 'keep' | 'high';
};

export function collapse(root: THREE.Object3D, { detail = 'keep' }: CollapseOptions = {}): THREE.Group {
  root.updateMatrixWorld(true);
  const inverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const relative = new THREE.Matrix4();

  const buckets = new Map<
    string,
    { material: THREE.Material; cast: boolean; receive: boolean; order: number; parts: THREE.BufferGeometry[] }
  >();
  const kept: THREE.Object3D[] = [];

  const visit = (node: THREE.Object3D): void => {
    const it = node as THREE.Object3D & {
      isLOD?: boolean;
      isSkinnedMesh?: boolean;
      isInstancedMesh?: boolean;
      isPoints?: boolean;
      isLight?: boolean;
      isMesh?: boolean;
      material?: THREE.Material | THREE.Material[];
      geometry?: THREE.BufferGeometry;
    };

    if (node !== root) {
      // An LOD being flattened is not lifted out and not descended into wholly:
      // only its first level is, and the rest never reach the merge. Descending
      // into all of them would bake every level on top of itself.
      if (it.isLOD && detail === 'high') {
        const nearest = (node as THREE.LOD).levels[0]?.object;
        if (nearest) visit(nearest);
        return;
      }

      if (it.isLOD || it.isSkinnedMesh || it.isInstancedMesh || it.isPoints || it.isLight) {
        relative.multiplyMatrices(inverse, node.matrixWorld);
        relative.decompose(node.position, node.quaternion, node.scale);
        kept.push(node);
        return; // and do not descend: whatever is under it belongs to it
      }

      if (it.isMesh && it.geometry && it.material && !Array.isArray(it.material)) {
        const material = it.material;
        const cast = node.castShadow;
        const receive = node.receiveShadow;
        const key = `${material.uuid}:${cast ? 1 : 0}${receive ? 1 : 0}`;

        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = { material, cast, receive, order: node.renderOrder, parts: [] };
          buckets.set(key, bucket);
        }
        const part = normalize(it.geometry);
        relative.multiplyMatrices(inverse, node.matrixWorld);
        part.applyMatrix4(relative);
        bucket.parts.push(part);
      }
    }

    for (const child of [...node.children]) visit(child);
  };

  visit(root);

  const group = new THREE.Group();
  group.position.copy(root.position);
  group.quaternion.copy(root.quaternion);
  group.scale.copy(root.scale);

  for (const { material, cast, receive, order, parts } of buckets.values()) {
    const merged = parts.length === 1 ? parts[0]! : mergeGeometries(parts, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    mesh.renderOrder = order;
    group.add(mesh);
  }
  for (const object of kept) group.add(object);

  return group;
}
