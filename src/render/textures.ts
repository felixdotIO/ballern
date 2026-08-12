/**
 * Procedural surface detail.
 *
 * Flat-coloured materials are the reason untextured real-time work reads as a
 * blockout: every surface catches light identically, so carpet, emulsion and
 * melamine are distinguishable only by hue. A normal map at the right frequency
 * fixes that before any albedo texture exists, because it changes how the
 * surface *behaves* under the lights rather than just what colour it is.
 *
 * Generated in-code rather than authored, because these are the two largest
 * surfaces in frame and they need to exist before the Blender kit lands. Hero
 * assets get real maps.
 */

import * as THREE from 'three';

import { makeRng } from '../office/rng';

/** Box-blur a height field in place, once per pass. */
function blur(height: Float32Array, size: number, passes: number): void {
  const scratch = new Float32Array(height.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            // Wrap, so the map tiles seamlessly.
            const sx = (x + dx + size) % size;
            const sy = (y + dy + size) % size;
            sum += height[sy * size + sx] ?? 0;
          }
        }
        scratch[y * size + x] = sum / 9;
      }
    }
    height.set(scratch);
  }
}

/**
 * Noise normal map.
 *
 * `smoothing` sets the grain: 0 passes gives the tight fibrous scatter of loop
 * pile, 2–3 passes gives the softer fissuring of a mineral ceiling tile.
 */
export function makeNoiseNormalMap(
  size: number,
  strength: number,
  seed: number,
  smoothing = 0,
): THREE.CanvasTexture {
  const rng = makeRng(seed);
  const height = new Float32Array(size * size);
  for (let i = 0; i < height.length; i++) height[i] = rng();
  if (smoothing > 0) blur(height, size, smoothing);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const image = ctx.createImageData(size, size);

  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)] ?? 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sobel gradient of the height field is the surface slope.
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));

      const nx = dx * strength;
      const ny = dy * strength;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      image.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      image.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      image.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  // Normal maps carry vector data, not colour — tagging them sRGB would bend
  // the normals through the transfer function.
  tex.colorSpace = THREE.NoColorSpace;
  // Every one of these lands on a floor, and a floor is the one surface in the
  // game that is always seen at a grazing angle. Sixteen taps rather than eight
  // is the cheapest quality in the whole renderer — it costs nothing that shows
  // up in a frame time and it is the difference between carpet that holds its
  // grain to the far wall and carpet that turns to grey mush four metres out.
  tex.anisotropy = 16;
  return tex;
}
