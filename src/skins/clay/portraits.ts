/**
 * Pictures of the cast and the rides, rendered from the assets themselves.
 *
 * ---- why these are rendered and not drawn ---------------------------------
 *
 * The character select shows every driver and every chair at once, which needs a
 * picture of each — eleven of them. There are three ways to get those and only one
 * of them survives contact with this project:
 *
 *  - **Draw them.** Eleven illustrations that have to be redrawn every time a
 *    character's head changes, by somebody who is not here.
 *  - **Render them in Blender.** `blender/contact.py` already makes a contact sheet
 *    of the cast, so the pipeline half-exists — and it produces files that go stale
 *    silently. The intern's hair changes, the sheet does not, and the picker shows a
 *    character the game no longer contains.
 *  - **Render them here, at startup, from the same `.glb` the game is about to put
 *    in the chair.** Eleven small renders, about a frame's work in total, and the
 *    picture cannot disagree with the game because it *is* the game.
 *
 * The last one is barely more code than loading eleven PNGs would be, and it is the
 * only one where a new driver appears in the picker by existing.
 *
 * ---- the two things that are not obvious ----------------------------------
 *
 * **Tone mapping does not run on a render target.** three applies it only when
 * drawing to the canvas — `_currentRenderTarget === null ? toneMapping : NoToneMapping`
 * — so a portrait rendered the same way the game renders comes out brighter and
 * flatter than the game does. Rather than fight that, the rig here is lit for the
 * curve it is actually going through: lower key, real fill, and a level set against
 * the tiles rather than against the room.
 *
 * **The subject is framed on what differs.** Every one of the cast wears the same
 * white tee and the same trousers — `blender/README.md` is explicit that only the
 * head changes — so a full-length portrait of seven characters is seven identical
 * white rectangles with something small happening at the top. The driver portraits
 * are framed on the head and shoulders for that reason, and the rides are framed
 * whole, because a ride *is* its silhouette.
 */

import * as THREE from 'three';

export type Portrait = {
  /** A data URL, for an `<img>`. */
  url: string;
};

/** How big the picture is rendered, in pixels. Square. */
const SIZE = 192;

/**
 * A little studio, built once and reused for every subject.
 *
 * Its own scene and its own lights: the game's are placed against a camera that is
 * looking at a room, and borrowing them would mean moving them and putting them back
 * — on the frame the menu is being built, which is the frame the player is watching.
 */
function studio(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();

  // Three quarters front-left, which is where the menu's own portrait camera stands.
  const key = new THREE.DirectionalLight(0xfff0dc, 1.9);
  key.position.set(-2.2, 3.0, 3.4);
  scene.add(key);

  // And the emblem's flame off the other shoulder, at a third of the strength: the
  // same trick the character select plays in 3D, for the same reason — it is what
  // stops a cream head on a warm tile reading as one shape.
  const kick = new THREE.DirectionalLight(0xff5a28, 0.9);
  kick.position.set(3.0, 1.2, -2.6);
  scene.add(kick);

  scene.add(new THREE.HemisphereLight(0xbcd4ea, 0x6b5030, 0.85));

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 40);
  return { scene, camera };
}

/**
 * Point the camera at a box and fill the frame with it.
 *
 * `fill` is how much of the frame the subject's larger dimension takes. Below 1 it
 * leaves air, which every one of these wants: a portrait cropped hard against the
 * tile edge reads as a mistake at 46 px even when it is not.
 */
function frame(camera: THREE.PerspectiveCamera, box: THREE.Box3, fill: number, yaw: number): void {
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const extent = Math.max(size.x, size.y) / fill;
  const distance = extent / 2 / Math.tan((camera.fov * Math.PI) / 360);

  camera.position.set(
    centre.x + Math.sin(yaw) * distance,
    centre.y + distance * 0.12,
    centre.z + Math.cos(yaw) * distance,
  );
  camera.lookAt(centre);
  camera.updateProjectionMatrix();
}

/**
 * The box round a figure's head, found through the rig rather than the geometry.
 *
 * Two earlier versions of this measured meshes and both were wrong, for a reason
 * worth writing down because it will catch the next person too: **the cast's parts
 * share one buffer.** The exporter merges the figure into a single geometry and hands
 * every `SkinnedMesh` a view of it, so `Box3.setFromObject` on the mesh named `head`
 * returns the bounding box of the entire character — head, shirt, trousers and shoes.
 * Asking for "everything above the bottom of the head" then returns everything, and
 * the portraits come out as seven full-length figures, which is exactly what they
 * were. The measurement was not slightly off; it was answering a different question
 * confidently.
 *
 * The armature does not have that problem. Every one of the cast is rigged to the
 * same skeleton — `blender/rig.py` exports against a bone contract that `driverRig.ts`
 * binds by name — so there is always a bone called `head`, it is always at the base of
 * the skull, and it is in the right place whatever pose the asset happens to be
 * exported in. The head's *size* is the one thing left to assume, and it is stable
 * across the cast by construction: they share a body, and measured against the game's
 * own posed figure the head is 0.30 of the total height.
 */
function headBox(subject: THREE.Object3D): THREE.Box3 {
  const whole = new THREE.Box3().setFromObject(subject);
  const bone = subject.getObjectByName('head');
  if (!bone) return whole;

  const tall = whole.getSize(new THREE.Vector3()).y * 0.3;
  const at = bone.getWorldPosition(new THREE.Vector3());

  // Up from the bone by a head, down by a little for the chin and the neck, and
  // square in plan so the crop is the same however far round the camera stands.
  const box = new THREE.Box3();
  box.min.set(at.x - tall * 0.66, at.y - tall * 0.16, at.z - tall * 0.66);
  box.max.set(at.x + tall * 0.66, at.y + tall * 1.04, at.z + tall * 0.66);
  return box;
}

/**
 * Render one subject to a data URL.
 *
 * The object is parented into the studio and taken out again, so the caller keeps
 * whatever it handed over — these are live assets on their way into the game, not
 * copies, and a portrait that leaves a driver parented to a scene nobody renders is
 * a driver who never appears in the chair.
 */
export function shoot(
  renderer: THREE.WebGLRenderer,
  subject: THREE.Object3D,
  options: { head?: boolean; yaw?: number; fill?: number } = {},
): string {
  const { scene, camera } = studio();
  const parent = subject.parent;
  const at = subject.position.clone();
  const rot = subject.rotation.clone();

  subject.position.set(0, 0, 0);
  subject.rotation.set(0, 0, 0);
  scene.add(subject);
  subject.updateMatrixWorld(true);

  const box = options.head ? headBox(subject) : new THREE.Box3().setFromObject(subject);

  /*
   * Round the front, and which side that is depends on the subject.
   *
   * Everything in the kit is authored facing away down −Z and turned half a circle on
   * the way in, so a camera parked on +Z photographs the back of its head — which is
   * exactly what the first set of portraits were, seven backs of heads and nobody the
   * wiser at 46 px. Half a turn off that, less a little, is a three-quarter front.
   */
  frame(camera, box, options.fill ?? 0.82, options.yaw ?? Math.PI - 0.5);

  const target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  });
  const wasTarget = renderer.getRenderTarget();
  const wasClear = renderer.getClearColor(new THREE.Color());
  const wasAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);

  const pixels = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, pixels);
  renderer.setRenderTarget(wasTarget);
  renderer.setClearColor(wasClear, wasAlpha);
  target.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const image = ctx.createImageData(SIZE, SIZE);
  // GL reads bottom-up; a canvas is top-down.
  for (let y = 0; y < SIZE; y++) {
    const from = (SIZE - 1 - y) * SIZE * 4;
    image.data.set(pixels.subarray(from, from + SIZE * 4), y * SIZE * 4);
  }
  ctx.putImageData(image, 0, 0);

  // Put the subject back exactly as it was found.
  scene.remove(subject);
  subject.position.copy(at);
  subject.rotation.copy(rot);
  if (parent) parent.add(subject);

  return canvas.toDataURL('image/png');
}
