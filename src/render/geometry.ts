/**
 * Bevelled box primitive.
 *
 * Nothing physical has a zero-radius edge. A sharp edge catches no highlight,
 * so it reads as a hard colour boundary rather than as a form — which is the
 * main reason untreated real-time geometry looks like CAD instead of a game.
 * A 2–4 mm chamfer costs a handful of triangles and does more for the contour
 * of an object than any amount of texture work.
 *
 * Geometries are cached by dimensions, because the shell builds hundreds of
 * boxes at a few dozen distinct sizes. They must not be built by scaling a unit
 * cube: that scales the bevel too, and a 4 mm chamfer stretched across a 20 m
 * wall becomes a 60 mm roundover.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** Default chamfer. Reads at arm's length without softening the architecture. */
export const BEVEL = 0.004;

const cache = new Map<string, THREE.BufferGeometry>();

export function bevelBox(w: number, h: number, d: number, bevel = BEVEL): THREE.BufferGeometry {
  // A roundover can never exceed a third of the thinnest dimension, or the
  // geometry inverts on thin plates like socket faces and blind slats.
  const r = Math.max(0.0005, Math.min(bevel, Math.min(w, h, d) * 0.33));
  const key = `${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${r.toFixed(4)}`;

  let geo = cache.get(key);
  if (!geo) {
    geo = new RoundedBoxGeometry(w, h, d, 1, r);
    cache.set(key, geo);
  }
  return geo;
}
