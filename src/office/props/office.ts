/**
 * The office prop kit. 2004 German open-plan.
 *
 * Every builder works to a named real referent and to the dimensions in
 * metrics.ts. These are procedural stand-ins with correct proportions, not
 * final art — they exist so the dressing rules, the collision volumes and the
 * lighting can be built and judged now. Hero items delegate to the Blender kit
 * and get replaced there without any of that work being redone.
 */

import * as THREE from 'three';

import { DESK, STORAGE } from '../metrics';
import { PROP_MAT, framedPanel, part } from './shared';
import { benchDesk as kitBenchDesk, crtMonitor as kitCrtMonitor, taskChair as kitTaskChair } from '../../render/kit';
import type { Rng } from '../rng';

/**
 * Bench desk. Delegates to the Blender kit asset — beech melamine top with grey
 * PVC edge banding, RAL 7035 cantilever C-frame, modesty panel, cable tray and
 * grommet rings.
 */
export function benchDesk(): THREE.Group {
  return kitBenchDesk();
}

/** Stellwand: fabric screen on the desk spine, 1400 above finished floor. */
export function deskScreen(width: number = DESK.width): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.screen, [width, DESK.screenHeight - DESK.height, DESK.screenThickness],
    [0, (DESK.screenHeight + DESK.height) / 2, 0], 0.008);
  part(g, PROP_MAT.metal, [width, 0.022, DESK.screenThickness + 0.012],
    [0, DESK.screenHeight - 0.011, 0], 0.006);
  return g;
}

/**
 * 17" CRT. Delegates to the Blender kit asset — the deep wedge tapering to the
 * tube neck and the outward-bulging screen glass are what date it, and neither
 * survives being approximated with boxes.
 */
export function crtMonitor(): THREE.Group {
  return kitCrtMonitor();
}

/** Mid-tower, standing on the floor beside the pedestal where they all lived. */
export function tower(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.plastic, [0.19, 0.40, 0.43], [0, 0.20, 0], 0.008);
  part(g, PROP_MAT.metal, [0.12, 0.006, 0.02], [0, 0.33, -0.216], 0.002); // floppy slot
  part(g, PROP_MAT.metal, [0.14, 0.028, 0.02], [0, 0.29, -0.216], 0.003); // CD tray
  return g;
}

export function keyboard(): THREE.Group {
  const g = new THREE.Group();
  const k = part(g, PROP_MAT.plastic, [0.45, 0.022, 0.155], [0, 0.011, 0], 0.004);
  k.rotation.x = -0.04; // front edge sits lower, as they do on their flip-out feet
  return g;
}

export function mouse(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 8), PROP_MAT.plastic);
  m.scale.set(1, 0.62, 1.55);
  m.position.y = 0.02;
  m.castShadow = true;
  g.add(m);
  return g;
}

/** Rollcontainer: three drawers, aluminium bar handles, on castors. */
export function pedestal(): THREE.Group {
  const g = new THREE.Group();
  const w = STORAGE.pedestalWidth;
  const d = STORAGE.pedestalDepth;
  const h = STORAGE.pedestalHeight;

  part(g, PROP_MAT.melamine, [w, h - 0.05, d], [0, 0.05 + (h - 0.05) / 2, 0]);
  for (let i = 0; i < 3; i++) {
    const y = 0.12 + i * 0.145;
    part(g, PROP_MAT.melamine, [w - 0.012, 0.13, 0.016], [0, y, -d / 2 - 0.005], 0.004);
    part(g, PROP_MAT.metal, [w * 0.5, 0.014, 0.016], [0, y + 0.045, -d / 2 - 0.016], 0.005);
  }
  return g;
}

/** Siemens-type desk phone with an LCD strip and a coiled cord. */
export function deskPhone(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.plastic, [0.19, 0.045, 0.21], [0, 0.023, 0], 0.008);
  part(g, PROP_MAT.crtGlass, [0.075, 0.004, 0.03], [0.03, 0.046, -0.05], 0.002);
  part(g, PROP_MAT.plastic, [0.055, 0.038, 0.20], [-0.062, 0.062, 0], 0.014); // handset
  return g;
}

/**
 * Task chair. Delegates to the Blender kit asset — kept here so every call site
 * (the player's chair, and every chair standing at a desk) still goes through
 * one place, and so a fallback could be swapped in without touching them.
 */
export function taskChair(rng?: Rng): { group: THREE.Group; seatHeight: number } {
  return kitTaskChair(rng);
}

/** Laser printer, always on its own table, always with paper stacked on it. */
export function printer(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.plastic, [0.48, 0.30, 0.42], [0, 0.15, 0], 0.012);
  part(g, PROP_MAT.plastic, [0.40, 0.02, 0.24], [0, 0.30, -0.04], 0.006); // output tray
  part(g, PROP_MAT.darkMetal, [0.10, 0.012, 0.05], [-0.16, 0.312, -0.13], 0.003); // control panel
  return g;
}

/**
 * Whiteboard on its wall rail, with a pen tray and the ghost of everything
 * anyone has ever failed to clean off it.
 */
export function whiteboard(width: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = height / 2;
  g.add(holder);
  framedPanel(holder, PROP_MAT.metal, PROP_MAT.paper, width, height, { bar: 0.03, depth: 0.026 });
  part(g, PROP_MAT.metal, [width * 0.55, 0.02, 0.06], [0, 0.03, -0.03], 0.004); // pen tray
  return g;
}
