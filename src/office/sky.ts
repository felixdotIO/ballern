/**
 * Golden hour sky, as an equirectangular gradient.
 *
 * It does two jobs. As the scene background it is what you see through the
 * glazing, which is what lets the windows blow out and gives the perimeter its
 * punch. As the environment map it provides the image-based fill that stops
 * matte contract materials — carpet, emulsion, melamine — from reading as flat
 * plastic.
 *
 * The gradient does the colour separation on its own: a deep blue zenith fills
 * the shadows cool while the hot band just above the horizon fills everything
 * facing the window warm. That split is most of the golden-hour read, before
 * the sun itself contributes anything.
 */

import * as THREE from 'three';

const STOPS: readonly (readonly [number, string])[] = [
  [0.0, '#2f5f9e'], // zenith, deep and cool — this is what fills the shadows
  [0.34, '#7fa6cf'],
  [0.46, '#e8bd8a'],
  [0.5, '#ffd9a2'], // the hot band at the horizon
  [0.54, '#c98f52'],
  [1.0, '#3b2f26'], // ground, warm and dark
];

export function makeSkyTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  for (const [at, color] of STOPS) grad.addColorStop(at, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Prefiltered version for scene.environment. */
export function makeEnvironment(renderer: THREE.WebGLRenderer, sky: THREE.Texture): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(sky);
  pmrem.dispose();
  return target.texture;
}
