/**
 * Besprechungsraum.
 *
 * The one room on the floor that was specified rather than fitted out: a real
 * table instead of a bench system, leather instead of contract fabric, and a
 * ceiling-hung beamer that cost more than the room it is in. That step up in
 * quality is the point — a floorplate where every room is furnished to the same
 * standard reads as a warehouse, and the board room is where a building admits
 * it has a hierarchy.
 *
 * It is also, from a track's point of view, a six-metre obstacle in the middle
 * of a shortcut, which is the best thing a room can be.
 */

import * as THREE from 'three';

import { BOARD } from '../metrics';
import { PROP_MAT, part, tube } from './shared';
import { jitter, range, type Rng } from '../rng';

const VENEER = new THREE.MeshStandardMaterial({
  // Cherry veneer rather than the beech melamine everywhere else, which is
  // exactly the distinction a 2004 procurement department would have drawn.
  color: new THREE.Color(0x8a5a3a),
  roughness: 0.28,
  metalness: 0,
});

const FELT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x5c6b66),
  roughness: 0.95,
  metalness: 0,
});

/**
 * Bootsform conference table.
 *
 * The waist is what makes it: a plain 6 × 1.5 rectangle reads as a plank, and
 * the barrel shape is also functional — everyone at a boat-shaped table can see
 * everyone else, which is why they are shaped like that.
 *
 * Built as a run of tapering sections so the curve is real geometry rather than
 * a scaled box, and split into three tops with visible joints, because a 6 m
 * table has never arrived in one piece.
 */
export function conferenceTable(length: number = BOARD.tableLength): THREE.Group {
  const g = new THREE.Group();
  const L = length;
  const W = BOARD.tableWidth;
  const waist = BOARD.tableWaist;
  const h = BOARD.tableHeight;
  const t = BOARD.tableTopThickness;
  const slices = 18;

  for (let i = 0; i < slices; i++) {
    const z0 = -L / 2 + (i * L) / slices;
    const mid = (i + 0.5) / slices;
    // Widest in the middle, narrowing to the waist at both ends.
    const width = waist + (W - waist) * Math.sin(Math.PI * mid);
    part(g, VENEER, [width, t, L / slices + 0.002], [0, h - t / 2, z0 + L / slices / 2], 0.003);
    // The two section joints, as a hairline of edge band.
    if (i === 6 || i === 12) {
      part(g, PROP_MAT.edgeBand, [width + 0.002, t + 0.002, 0.004], [0, h - t / 2, z0], 0.001);
    }
  }

  // Two panel legs rather than four, so nobody at the middle of the table has
  // a leg in their knees.
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.metal, [waist * 0.8, h - t, 0.06], [0, (h - t) / 2, (s * L) / 3], 0.006);
    part(g, PROP_MAT.darkMetal, [waist * 0.95, 0.03, 0.3], [0, 0.015, (s * L) / 3], 0.008);
  }
  // The beam that ties them together and carries the cabling.
  part(g, PROP_MAT.metal, [0.14, 0.1, (L * 2) / 3], [0, h - 0.22, 0], 0.008);

  // Kabelauslass: two brushed flaps in the top, one of them left open with a
  // VGA lead coming out of it and going nowhere.
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.stainless, [0.15, 0.006, 0.08], [0, h + 0.002, s * 1.2], 0.002);
  }
  const lead = part(g, PROP_MAT.darkPlastic, [0.012, 0.012, 0.5], [0.04, h + 0.006, -1.45], 0.004);
  lead.rotation.y = 0.5;

  return g;
}

/**
 * Konferenzstuhl: leather, five-star polished base, and a back tall enough to
 * be a status object. Twelve of these is what the room is for.
 */
export function conferenceChair(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const seat = 0.46;

  // Five-star base with castors.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + jitter(rng, 0.1);
    const arm = part(g, PROP_MAT.stainless, [0.045, 0.03, 0.3], [Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15], 0.008);
    arm.rotation.y = -a;
    const castor = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 10), PROP_MAT.rubber);
    castor.position.set(Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29);
    castor.rotation.z = Math.PI / 2;
    g.add(castor);
  }
  tube(g, PROP_MAT.stainless, 0.032, 0.042, seat - 0.09, [0, 0.06, 0], 12);

  // Seat and back, in leather over a moulded shell.
  const pan = part(g, PROP_MAT.leather, [0.5, 0.09, 0.48], [0, seat, 0], 0.03);
  pan.rotation.x = -0.03;
  const back = part(g, PROP_MAT.leather, [0.48, 0.62, 0.08], [0, seat + 0.36, 0.22], 0.03);
  back.rotation.x = -0.14;
  // Armrests, which the fabric chairs downstairs do not have.
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.leather, [0.06, 0.035, 0.24], [s * 0.27, seat + 0.21, -0.02], 0.014);
    const post = part(g, PROP_MAT.stainless, [0.028, 0.19, 0.028], [s * 0.27, seat + 0.11, 0.03], 0.006);
    post.rotation.x = 0.15;
  }
  return g;
}

/** Sideboard along the back wall. The glasses live on it; so does the phone. */
export function credenza(width: number): THREE.Group {
  const g = new THREE.Group();
  const h = BOARD.credenzaHeight;
  const d = BOARD.credenzaDepth;
  const doors = Math.max(2, Math.round(width / 0.8));

  part(g, VENEER, [width, 0.04, d + 0.02], [0, h - 0.02, 0], 0.006);
  part(g, VENEER, [width, h - 0.12, d], [0, (h - 0.04) / 2 + 0.04, 0], 0.004);
  part(g, PROP_MAT.darkMetal, [width - 0.08, 0.08, d - 0.06], [0, 0.04, 0], 0.004);
  for (let i = 0; i < doors; i++) {
    const cx = -width / 2 + (i + 0.5) * (width / doors);
    part(g, VENEER, [width / doors - 0.008, h - 0.18, 0.016], [cx, h / 2, -d / 2 + 0.008], 0.004);
    const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.09, 8), PROP_MAT.stainless);
    pull.rotation.z = Math.PI / 2;
    pull.position.set(cx, h - 0.16, -d / 2 - 0.012);
    g.add(pull);
  }
  return g;
}

/**
 * Roll-down projection screen, in its cassette, pulled about two-thirds down
 * and left there — which is what happens to every one of them.
 */
export function projectionScreen(): THREE.Group {
  const g = new THREE.Group();
  const w = BOARD.screenWidth;

  part(g, PROP_MAT.metal, [w + 0.12, 0.09, 0.09], [0, BOARD.screenCassetteHeight, 0], 0.01);
  part(g, PROP_MAT.paper, [w, BOARD.screenDrop, 0.006], [0, BOARD.screenCassetteHeight - BOARD.screenDrop / 2 - 0.05, 0.01], 0.002);
  // The weighted bar at the bottom, and the pull cord hanging off one end.
  part(g, PROP_MAT.darkMetal, [w + 0.02, 0.022, 0.02], [0, BOARD.screenCassetteHeight - BOARD.screenDrop - 0.05, 0.01], 0.004);
  return g;
}

/** Ceiling-hung beamer on its drop rod, fan running, nothing on it. */
export function beamer(dropLength: number): THREE.Group {
  const g = new THREE.Group();
  tube(g, PROP_MAT.metal, 0.016, 0.016, dropLength, [0, -dropLength, 0], 8);
  part(g, PROP_MAT.metal, [0.16, 0.012, 0.16], [0, -dropLength - 0.01, 0], 0.004);
  const body = part(g, PROP_MAT.plastic, [0.34, 0.13, 0.3], [0, -dropLength - 0.08, 0], 0.014);
  body.rotation.x = 0.06;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.05, 16), PROP_MAT.crtGlass);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0.06, -dropLength - 0.08, -0.16);
  g.add(lens);
  return g;
}

/** Flipchart on its easel, three sheets used and folded back over the top. */
export function flipchart(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 1.75;

  for (const s of [-1, 1] as const) {
    const leg = tube(g, PROP_MAT.metal, 0.016, 0.016, h, [s * 0.32, 0, 0.12], 8);
    leg.rotation.z = -s * 0.09;
    leg.rotation.x = 0.06;
  }
  const rear = tube(g, PROP_MAT.metal, 0.016, 0.016, h * 0.98, [0, 0, -0.4], 8);
  rear.rotation.x = -0.22;

  part(g, PROP_MAT.metal, [0.72, 1.0, 0.016], [0, 1.15, 0.1], 0.004);
  const pad = part(g, PROP_MAT.paper, [0.68, 0.98, 0.008], [0, 1.16, 0.09], 0.002);
  pad.rotation.z = jitter(rng, 0.012);
  // Used sheets flopped back over the head of the easel.
  for (let i = 0; i < 3; i++) {
    const sheet = part(g, PROP_MAT.paper, [0.66, 0.5, 0.004], [0, 1.62 + i * 0.006, 0.02 - i * 0.03], 0.002);
    sheet.rotation.x = -0.9 - i * 0.07;
  }
  part(g, PROP_MAT.metal, [0.4, 0.02, 0.05], [0, 0.64, 0.11], 0.004);
  return g;
}

/**
 * The conference phone. A grey plastic starfish, and the single most
 * recognisable object that has ever sat in the middle of a meeting table.
 */
export function conferencePhone(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.115, 0.05, 3), PROP_MAT.plastic);
  body.position.y = 0.025;
  body.castShadow = true;
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const pod = part(g, PROP_MAT.plastic, [0.07, 0.03, 0.05], [Math.sin(a) * 0.13, 0.02, Math.cos(a) * 0.13], 0.012);
    pod.rotation.y = -a;
  }
  part(g, PROP_MAT.crtGlass, [0.06, 0.004, 0.025], [0, 0.051, -0.02], 0.002);
  return g;
}

/** Karaffe and its glasses, set out down the middle of the table. */
export function carafe(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.22, 18), PROP_MAT.glassware);
  body.position.y = 0.11;
  body.castShadow = true;
  g.add(body);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.05, 0.06, 14), PROP_MAT.glassware);
  neck.position.y = 0.25;
  g.add(neck);
  // The water in it, stopping well short of the top as it always does.
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 0.13, 18),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0xbcdde2), roughness: 0.05, transparent: true, opacity: 0.5 }),
  );
  water.position.y = 0.075;
  g.add(water);
  return g;
}

export function tumbler(): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.028, 0.095, 16, 1, true), PROP_MAT.glassware);
  glass.position.y = 0.0475;
  glass.material.side = THREE.DoubleSide;
  glass.castShadow = true;
  g.add(glass);
  return g;
}

/** Blotter, notepad and a pen, laid at a place setting that was never used. */
export function placeSetting(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  part(g, FELT, [0.42, 0.004, 0.3], [0, 0.002, 0], 0.002);
  const pad = part(g, PROP_MAT.paper, [0.148, 0.006, 0.21], [range(rng, -0.05, 0.05), 0.007, 0], 0.002);
  pad.rotation.y = jitter(rng, 0.08);
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 8), PROP_MAT.darkPlastic);
  pen.rotation.set(Math.PI / 2, 0, jitter(rng, 0.4) + 0.2);
  pen.position.set(pad.position.x + 0.11, 0.007, -0.02);
  g.add(pen);
  return g;
}

