/**
 * Teeküche und Aufenthaltsraum.
 *
 * Built from the DIN 68935 fitted-kitchen system, because that is what a German
 * office kitchenette actually is: the same carcasses, the same 600 depth, the
 * same 150 plinth as somebody's flat, bought in contract white and fitted by
 * the same trade. Getting that right is most of why the room reads as European
 * rather than as a generic break room — an American office kitchen has none of
 * this geometry.
 *
 * The room's real signature is the stuff on top of the units rather than the
 * units: the filter machine that has been on since seven, the crate of Sprudel
 * under the worktop, the three colour-coded bins, and the drying rack nobody
 * has emptied.
 */

import * as THREE from 'three';

import { KITCHEN } from '../metrics';
import { MAT } from '../materials';
import { PROP_MAT, framedPanel, part, tube } from './shared';
import { jitter, range, type Rng } from '../rng';

/** What occupies one carcass width of a run. */
export type UnitKind = 'door' | 'doors' | 'drawers' | 'sink' | 'dishwasher' | 'hob' | 'open';

export type Unit = { kind: UnitKind; width: number };

const CARCASS = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0xe6e3da),
  roughness: 0.35,
  metalness: 0,
});

const WORKTOP = new THREE.MeshStandardMaterial({
  // Post-formed chipboard with a rolled front edge, in the grey speckle that
  // every contract kitchen of the period was specified in.
  color: new THREE.Color(0x6f6c66),
  roughness: 0.3,
  metalness: 0,
});

const HOB_GLASS = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x14161a),
  roughness: 0.12,
  metalness: 0.1,
});

/** Kork, the colour of every notice board fitted between 1980 and now. */
const CORK = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x9a7c50), roughness: 0.95 });

/** Stewed since half past seven. */
const COFFEE = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2a1408), roughness: 0.2 });

/** Bügelgriff: the bow handle on every door and drawer in the run. */
function bowHandle(g: THREE.Group, x: number, y: number, z: number, length: number, vertical = false): void {
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, length, 8), PROP_MAT.stainless);
  bar.rotation.z = vertical ? 0 : Math.PI / 2;
  bar.position.set(x, y, z - 0.03);
  bar.castShadow = true;
  g.add(bar);
  for (const s of [-1, 1] as const) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), PROP_MAT.stainless);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(
      vertical ? x : x + (s * length) / 2 - s * 0.02,
      vertical ? y + (s * length) / 2 - s * 0.02 : y,
      z - 0.015,
    );
    g.add(foot);
  }
}

/**
 * A run of base units with its worktop.
 *
 * Assembled left to right from a list of carcasses, so a run can be described
 * the way a kitchen fitter would describe it — 600 drawers, 900 sink, 600
 * dishwasher — rather than as a box with lines drawn on it. That is the whole
 * difference between a kitchen and a sideboard.
 *
 * Origin at the centre of the run, on the floor. The doors face -Z.
 */
export function baseRun(units: readonly Unit[], rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const d = KITCHEN.baseDepth;
  const top = KITCHEN.worktopHeight;
  const carcassTop = top - KITCHEN.worktopThickness;
  const plinth = KITCHEN.plinthHeight;
  const total = units.reduce((sum, u) => sum + u.width, 0);

  // Worktop, with the rolled front edge standing 20 mm proud of the doors.
  part(g, WORKTOP, [total, KITCHEN.worktopThickness, d + 0.02], [0, top - KITCHEN.worktopThickness / 2, 0.01], 0.008);
  // Aufkantung: the upstand where the worktop meets the wall.
  part(g, WORKTOP, [total, 0.04, 0.02], [0, top + 0.02, d / 2 - 0.01], 0.004);

  let x = -total / 2;
  for (const unit of units) {
    const cx = x + unit.width / 2;
    const faceZ = -d / 2 + 0.009;

    // Sockel: set back, and darker because it is always in shadow.
    part(g, PROP_MAT.darkMetal, [unit.width, plinth, d - KITCHEN.plinthSetback], [cx, plinth / 2, KITCHEN.plinthSetback / 2], 0.004);
    // Carcass body, which is only ever seen as the gap around the doors.
    part(g, CARCASS, [unit.width, carcassTop - plinth, d - 0.02], [cx, (plinth + carcassTop) / 2, 0], 0.004);

    const doorTop = carcassTop - 0.004;
    const doorBottom = plinth + 0.004;
    const doorH = doorTop - doorBottom;

    switch (unit.kind) {
      case 'drawers': {
        const drawers = 3;
        for (let i = 0; i < drawers; i++) {
          const h = doorH / drawers - 0.004;
          const y = doorBottom + i * (doorH / drawers) + h / 2;
          part(g, CARCASS, [unit.width - 0.008, h, 0.018], [cx, y, faceZ], 0.004);
          bowHandle(g, cx, y + h / 2 - 0.05, faceZ, unit.width * 0.55);
        }
        break;
      }
      case 'doors': {
        for (const s of [-1, 1] as const) {
          const w = unit.width / 2 - 0.006;
          part(g, CARCASS, [w, doorH, 0.018], [cx + (s * unit.width) / 4, (doorBottom + doorTop) / 2, faceZ], 0.004);
          bowHandle(g, cx + s * 0.03, (doorBottom + doorTop) / 2, faceZ, doorH * 0.5, true);
        }
        break;
      }
      case 'dishwasher': {
        // Integrated front, and the one panel in the run that never quite lines
        // up with its neighbours because the machine sets its own height.
        part(g, CARCASS, [unit.width - 0.008, doorH - 0.01, 0.02], [cx, (doorBottom + doorTop) / 2 + 0.004, faceZ], 0.004);
        bowHandle(g, cx, doorTop - 0.06, faceZ, unit.width * 0.7);
        part(g, PROP_MAT.crtGlass, [0.09, 0.012, 0.006], [cx + unit.width * 0.28, doorTop - 0.02, faceZ - 0.01], 0.002);
        break;
      }
      case 'sink': {
        // Einbauspüle: a pressed stainless bowl with a drainer beside it, sunk
        // into the worktop, and the mixer tap standing behind.
        const bowl = 0.34;
        part(g, PROP_MAT.stainless, [bowl, 0.02, bowl], [cx - 0.12, top - 0.005, -0.02], 0.006);
        part(g, PROP_MAT.stainless, [bowl - 0.04, 0.14, bowl - 0.04], [cx - 0.12, top - 0.08, -0.02], 0.01);
        // Abtropffläche, with its pressed drainage grooves.
        part(g, PROP_MAT.stainless, [0.3, 0.008, 0.42], [cx + 0.2, top - 0.002, -0.01], 0.004);
        for (let i = 0; i < 5; i++) {
          part(g, PROP_MAT.stainless, [0.012, 0.004, 0.34], [cx + 0.1 + i * 0.05, top + 0.002, -0.01], 0.002);
        }
        tube(g, PROP_MAT.stainless, 0.016, 0.02, 0.24, [cx - 0.12, top, 0.22], 12);
        const spout = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.014, 8, 12, Math.PI / 2), PROP_MAT.stainless);
        spout.position.set(cx - 0.12, top + 0.24, 0.145);
        spout.rotation.set(0, Math.PI / 2, 0);
        spout.castShadow = true;
        g.add(spout);
        // Doors under the sink, where the washing-up things live.
        for (const s of [-1, 1] as const) {
          const w = unit.width / 2 - 0.006;
          part(g, CARCASS, [w, doorH, 0.018], [cx + (s * unit.width) / 4, (doorBottom + doorTop) / 2, faceZ], 0.004);
          bowHandle(g, cx + s * 0.03, (doorBottom + doorTop) / 2, faceZ, doorH * 0.5, true);
        }
        break;
      }
      case 'hob': {
        part(g, HOB_GLASS, [unit.width - 0.08, 0.012, 0.5], [cx, top + 0.004, -0.02], 0.004);
        for (const [ox, oz] of [[-0.14, -0.13], [0.14, -0.13], [-0.14, 0.1], [0.14, 0.1]] as const) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 6, 20), PROP_MAT.darkMetal);
          ring.rotation.x = Math.PI / 2;
          ring.position.set(cx + ox, top + 0.011, -0.02 + oz);
          g.add(ring);
        }
        part(g, CARCASS, [unit.width - 0.008, doorH, 0.018], [cx, (doorBottom + doorTop) / 2, faceZ], 0.004);
        bowHandle(g, cx, doorTop - 0.06, faceZ, unit.width * 0.6);
        break;
      }
      case 'open': {
        // Knee space, with the bin under it and the pipes on show at the back.
        break;
      }
      default: {
        part(g, CARCASS, [unit.width - 0.008, doorH, 0.018], [cx, (doorBottom + doorTop) / 2, faceZ], 0.004);
        bowHandle(g, cx + unit.width * 0.35, (doorBottom + doorTop) / 2, faceZ, doorH * 0.5, true);
      }
    }
    x += unit.width;
  }

  // Nothing in a fitted run is ever perfectly plumb once it has been used.
  g.rotation.y = jitter(rng, 0.004);
  return g;
}

/**
 * Oberschränke — the wall units, 500 above the worktop because that is the
 * clearance the standard gives, and 350 deep so you can still stand at the
 * counter. One of them is left open, because one of them always is.
 */
export function wallRun(width: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = KITCHEN.wallUnitHeight;
  const d = KITCHEN.wallUnitDepth;
  const doors = Math.max(2, Math.round(width / 0.6));
  const doorW = width / doors;

  part(g, CARCASS, [width, h, d], [0, h / 2, 0], 0.004);
  for (let i = 0; i < doors; i++) {
    const cx = -width / 2 + (i + 0.5) * doorW;
    const open = i === doors - 2;
    const door = part(g, CARCASS, [doorW - 0.008, h - 0.008, 0.018], [cx, h / 2, -d / 2 + 0.009], 0.004);
    if (open) {
      // Hung on the hinge rather than translated, so it swings about the right
      // edge — a door that pivots about its own middle is unmistakable.
      const hinge = new THREE.Group();
      hinge.position.set(cx - doorW / 2, h / 2, -d / 2 + 0.009);
      hinge.rotation.y = -range(rng, 0.7, 1.1);
      g.remove(door);
      door.position.set(doorW / 2, 0, 0);
      hinge.add(door);
      g.add(hinge);
      // A shelf of mugs, visible now that the door is open.
      part(g, CARCASS, [doorW - 0.02, 0.016, d - 0.02], [cx, h * 0.55, 0], 0.003);
    }
    bowHandle(g, cx + doorW * 0.36, h / 2, -d / 2 + 0.009, h * 0.55, true);
  }
  return g;
}

/** Fliesenspiegel: the 200 mm white tile band between worktop and wall units. */
export function splashback(width: number): THREE.Group {
  const g = new THREE.Group();
  const h = KITCHEN.wallUnitClearance;
  const t = KITCHEN.splashbackTile;
  const cols = Math.round(width / t);
  const rows = Math.max(1, Math.round(h / t));

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      part(
        g,
        MAT.wallTile,
        [t - 0.004, h / rows - 0.004, 0.008],
        [-width / 2 + (c + 0.5) * t, (r + 0.5) * (h / rows), 0],
        0.002,
      );
    }
  }
  return g;
}

/** Kühlschrank, full height, in the contract white nobody has ever cleaned. */
export function fridge(): THREE.Group {
  const g = new THREE.Group();
  const w = KITCHEN.fridgeWidth;
  const h = KITCHEN.fridgeHeight;
  const d = 0.62;

  part(g, CARCASS, [w, h, d], [0, h / 2, 0], 0.01);
  // The freezer compartment's door line, a third of the way down.
  part(g, PROP_MAT.stainless, [w - 0.02, 0.006, 0.008], [0, h * 0.72, -d / 2 - 0.002], 0.002);
  bowHandle(g, w * 0.34, h * 0.45, -d / 2 - 0.006, 0.5, true);
  bowHandle(g, w * 0.34, h * 0.82, -d / 2 - 0.006, 0.18, true);
  // The magnets and the rota nobody keeps to.
  part(g, PROP_MAT.paper, [0.14, 0.2, 0.002], [-0.1, h * 0.55, -d / 2 - 0.004], 0.001);
  return g;
}

/**
 * Filter coffee machine, on since seven, jug half full and slowly cooking.
 * The single most reliable object in a German office.
 */
export function coffeeMachine(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.darkPlastic, [0.2, 0.34, 0.26], [0, 0.17, 0.02], 0.012);
  part(g, PROP_MAT.darkPlastic, [0.2, 0.08, 0.14], [0, 0.36, 0.06], 0.014);
  // Hotplate and the jug standing on it.
  part(g, PROP_MAT.stainless, [0.17, 0.008, 0.16], [0, 0.11, -0.06], 0.004);
  tube(g, PROP_MAT.glassware, 0.075, 0.065, 0.16, [0, 0.115, -0.06], 16);
  // The coffee in it, which has been there since half past seven.
  tube(g, COFFEE, 0.068, 0.06, 0.07, [0, 0.12, -0.06], 16);
  part(g, PROP_MAT.darkPlastic, [0.02, 0.09, 0.05], [0.085, 0.19, -0.06], 0.006); // handle
  part(g, PROP_MAT.stainless, [0.03, 0.006, 0.006], [0.06, 0.34, -0.06], 0.002); // switch light
  return g;
}

export function kettle(): THREE.Group {
  const g = new THREE.Group();
  tube(g, PROP_MAT.stainless, 0.085, 0.095, 0.22, [0, 0, 0], 18);
  part(g, PROP_MAT.darkPlastic, [0.018, 0.14, 0.05], [0.1, 0.13, 0], 0.008);
  part(g, PROP_MAT.darkPlastic, [0.1, 0.014, 0.1], [0, 0.007, 0], 0.006);
  return g;
}

export function microwave(): THREE.Group {
  const g = new THREE.Group();
  part(g, CARCASS, [0.48, 0.28, 0.36], [0, 0.14, 0], 0.01);
  part(g, PROP_MAT.crtGlass, [0.3, 0.2, 0.008], [-0.06, 0.15, -0.182], 0.004);
  part(g, PROP_MAT.darkPlastic, [0.1, 0.24, 0.012], [0.17, 0.14, -0.184], 0.004);
  part(g, PROP_MAT.stainless, [0.02, 0.2, 0.02], [-0.21, 0.15, -0.19], 0.004);
  return g;
}

/** Abtropfgestell, permanently full. */
export function dishRack(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.stainless, [0.38, 0.012, 0.28], [0, 0.008, 0], 0.003);
  for (let i = 0; i < 8; i++) {
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.003, 5, 12, Math.PI), PROP_MAT.stainless);
    wire.position.set(-0.16 + i * 0.045, 0.06, 0);
    wire.rotation.set(0, Math.PI / 2, 0);
    g.add(wire);
  }
  // Plates leaning in the rack, and one mug upside down on the corner.
  const plates = Math.floor(range(rng, 2, 6));
  for (let i = 0; i < plates; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20), PROP_MAT.ceramic);
    plate.position.set(-0.14 + i * 0.05, 0.1, 0);
    plate.rotation.set(0, 0, Math.PI / 2 + jitter(rng, 0.12));
    plate.castShadow = true;
    g.add(plate);
  }
  return g;
}

/**
 * Wasserspender with its bottle inverted on top. The bubble that goes through
 * it is the only moving thing this room would have, if anything moved.
 */
export function waterCooler(): THREE.Group {
  const g = new THREE.Group();
  part(g, CARCASS, [0.33, 1.0, 0.33], [0, 0.5, 0], 0.012);
  part(g, PROP_MAT.stainless, [0.16, 0.02, 0.06], [0, 0.72, -0.19], 0.004);
  part(g, PROP_MAT.darkPlastic, [0.05, 0.05, 0.05], [-0.05, 0.78, -0.18], 0.008);
  part(g, PROP_MAT.darkPlastic, [0.05, 0.05, 0.05], [0.05, 0.78, -0.18], 0.008);

  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.46, 20), PROP_MAT.glassware);
  bottle.position.y = 1.24;
  bottle.castShadow = true;
  g.add(bottle);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.09, 0.12, 16), PROP_MAT.glassware);
  neck.position.y = 1.05;
  g.add(neck);
  // The water inside it, which is what makes it read as full rather than as a
  // moulded shape.
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.128, 0.1, 0.36, 20), new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x9fd0dc),
    roughness: 0.05,
    transparent: true,
    opacity: 0.55,
  }));
  water.position.y = 1.2;
  g.add(water);
  return g;
}

/**
 * Vending machine. Lit from inside, which makes it the brightest object in the
 * room and the only light source in the building that is trying to sell you
 * something.
 */
export function vendingMachine(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const w = 0.9;
  const h = 1.83;
  const d = 0.8;

  part(g, PROP_MAT.darkPlastic, [w, h, d], [0, h / 2, 0], 0.012);
  // The illuminated header, and the glass front with the interior glowing.
  const header = part(g, PROP_MAT.plastic, [w - 0.06, 0.3, 0.02], [0, h - 0.2, -d / 2 - 0.005], 0.006);
  header.material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xd8d2c0),
    emissive: new THREE.Color(0xffe9b8),
    emissiveIntensity: 1.1,
    roughness: 0.5,
  });

  const interior = part(g, PROP_MAT.plastic, [w - 0.14, 1.16, 0.02], [-0.04, h * 0.53, -d / 2 + 0.14], 0.004);
  interior.material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xf2ead6),
    emissive: new THREE.Color(0xfff0cc),
    emissiveIntensity: 0.8,
    roughness: 0.8,
  });

  // Product rows on their spirals. Colour is the whole point — this and the
  // binder wall are the only saturated things in the building.
  const snack = [0xc7452f, 0xe0b13a, 0x2f6fb0, 0x8a4a9c, 0x3f8f4a];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const box = part(
        g,
        PROP_MAT.plastic,
        [0.1, 0.13, 0.03],
        [-w / 2 + 0.16 + col * 0.14, 0.62 + row * 0.22, -d / 2 + 0.1],
        0.004,
      );
      box.material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(snack[(row * 5 + col) % snack.length]).multiplyScalar(range(rng, 0.8, 1.15)),
        roughness: 0.35,
      });
      // A sold-out slot or two, because there always is one.
      if (rng() > 0.86) box.visible = false;
      const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.003, 4, 10), PROP_MAT.stainless);
      spiral.position.set(-w / 2 + 0.16 + col * 0.14, 0.56 + row * 0.22, -d / 2 + 0.14);
      spiral.rotation.x = Math.PI / 2;
      g.add(spiral);
    }
  }

  part(g, PROP_MAT.crtGlass, [w - 0.12, 1.24, 0.008], [-0.04, h * 0.53, -d / 2 - 0.004], 0.004);
  // Coin slot, keypad and the flap at the bottom.
  part(g, PROP_MAT.stainless, [0.11, 0.34, 0.02], [w / 2 - 0.09, 1.15, -d / 2 - 0.008], 0.006);
  part(g, PROP_MAT.darkPlastic, [w - 0.16, 0.22, 0.02], [0, 0.28, -d / 2 - 0.008], 0.008);
  return g;
}

/**
 * Mülltrennung: three bins with colour-coded lids, in the order the sign above
 * them insists on. The most quietly, unmistakably German object available.
 */
export function binTrio(): THREE.Group {
  const g = new THREE.Group();
  const lids = [
    { color: 0xd8c33a, label: 'Wertstoff' },
    { color: 0x2f6f3a, label: 'Papier' },
    { color: 0x3a3b3d, label: 'Restmüll' },
  ];

  lids.forEach((lid, i) => {
    const x = (i - 1) * 0.44;
    part(g, PROP_MAT.plastic, [0.4, 0.62, 0.4], [x, 0.31, 0], 0.02);
    part(
      g,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(lid.color), roughness: 0.5 }),
      [0.42, 0.05, 0.42],
      [x, 0.645, 0],
      0.012,
    );
    // The flap you push, worn pale in the middle.
    part(g, PROP_MAT.darkPlastic, [0.2, 0.012, 0.2], [x, 0.672, 0], 0.006);
  });
  return g;
}

/** Getränkekisten, stacked two high, with the empties in the top one. */
export function crateStack(rng: Rng, crates = 2): THREE.Group {
  const g = new THREE.Group();
  const [w, h, d] = KITCHEN.crate;

  for (let c = 0; c < crates; c++) {
    const y = c * h;
    part(g, PROP_MAT.crate, [w, h, d], [0, y + h / 2, 0], 0.008);
    // Bottles in the top crate only. The lower ones are full and you cannot
    // see into them, which saves twenty-four bottles nobody would ever notice.
    if (c !== crates - 1) continue;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        if (rng() > 0.82) continue;
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.26, 10), PROP_MAT.bottleGreen);
        bottle.position.set(-w / 2 + 0.05 + i * 0.1, y + h + 0.13, -d / 2 + 0.05 + j * 0.09);
        bottle.castShadow = true;
        g.add(bottle);
      }
    }
  }
  g.rotation.y = jitter(rng, 0.18);
  return g;
}

/** Kantinentisch, round, on a single column base. */
export function canteenTableRound(): THREE.Group {
  const g = new THREE.Group();
  const h = KITCHEN.tableHeight;
  const r = KITCHEN.tableRound / 2;

  const top = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 28), PROP_MAT.melamine);
  top.position.y = h - 0.015;
  top.castShadow = true;
  top.receiveShadow = true;
  g.add(top);
  // The PVC edge band, which on a round top is a separate applied strip and is
  // the detail that dates the table more precisely than anything else on it.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.002, r + 0.002, 0.032, 28, 1, true), PROP_MAT.edgeBand);
  band.position.y = h - 0.015;
  g.add(band);
  tube(g, PROP_MAT.metal, 0.035, 0.035, h - 0.03, [0, 0, 0], 12);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.03, 20), PROP_MAT.darkMetal);
  foot.position.y = 0.015;
  foot.castShadow = true;
  g.add(foot);
  return g;
}

/** The rectangular one, on a four-leg frame. */
export function canteenTableRect(): THREE.Group {
  const g = new THREE.Group();
  const [w, d] = KITCHEN.tableRect;
  const h = KITCHEN.tableHeight;

  part(g, PROP_MAT.melamine, [w, 0.028, d], [0, h - 0.014, 0], 0.006);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      tube(g, PROP_MAT.metal, 0.021, 0.021, h - 0.028, [(sx * (w - 0.16)) / 2, 0, (sz * (d - 0.14)) / 2], 10);
    }
  }
  // The rails that stop it racking.
  for (const sz of [-1, 1] as const) {
    part(g, PROP_MAT.metal, [w - 0.16, 0.025, 0.02], [0, h - 0.1, (sz * (d - 0.14)) / 2], 0.004);
  }
  return g;
}

/**
 * Stapelstuhl: four legs, a moulded shell, and a frame that lets it stack.
 *
 * On the repetition whitelist, and rightly — twelve identical stacking chairs
 * around a canteen table is what the room looks like, and varying them would be
 * its own kind of fake.
 */
export function stackChair(): THREE.Group {
  const g = new THREE.Group();
  const seat = KITCHEN.stackChairSeatHeight;

  part(g, PROP_MAT.plastic, [0.42, 0.022, 0.4], [0, seat, 0], 0.014);
  // Backrest, raked back and standing off the seat as they always are.
  const back = part(g, PROP_MAT.plastic, [0.4, 0.3, 0.02], [0, seat + 0.29, 0.17], 0.014);
  back.rotation.x = -0.18;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const leg = tube(g, PROP_MAT.metal, 0.014, 0.014, seat, [sx * 0.17, 0, sz * 0.16], 8);
      // Splayed, which is why they stack and why they are impossible to sit on
      // straight.
      leg.rotation.z = -sx * 0.06;
      leg.rotation.x = sz * 0.05;
    }
    // The back frame carrying on up past the seat.
    const post = tube(g, PROP_MAT.metal, 0.014, 0.014, 0.34, [sx * 0.17, seat, 0.16], 8);
    post.rotation.x = -0.18;
  }
  return g;
}

/** A cork noticeboard with the Dienstplan and four other things on it. */
export function noticeBoard(width: number, height: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = height / 2;
  g.add(holder);
  const front = framedPanel(holder, PROP_MAT.metal, CORK, width, height, { bar: 0.035, depth: 0.025 });

  const sheets = Math.floor(range(rng, 4, 8));
  for (let i = 0; i < sheets; i++) {
    const w = range(rng, 0.14, 0.22);
    const h = w * 1.414;
    const sheet = part(
      holder,
      PROP_MAT.paper,
      [w, h, 0.002],
      [
        range(rng, -width / 2 + w, width / 2 - w),
        range(rng, -height / 2 + h / 2 + 0.05, height / 2 - h / 2 - 0.05),
        front - 0.002,
      ],
      0.001,
    );
    sheet.rotation.z = jitter(rng, 0.06);
  }
  return g;
}

/** Papierhandtuchspender, and the bin under it that is always overflowing. */
export function towelDispenser(): THREE.Group {
  const g = new THREE.Group();
  part(g, CARCASS, [0.28, 0.36, 0.13], [0, 0.18, 0], 0.012);
  part(g, PROP_MAT.paper, [0.22, 0.02, 0.02], [0, 0.01, -0.04], 0.004);
  return g;
}

/** Obstkorb. Somebody's initiative, three weeks in. */
export function fruitBowl(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), PROP_MAT.ceramic);
  bowl.position.y = 0.075;
  bowl.material.side = THREE.DoubleSide;
  bowl.castShadow = true;
  g.add(bowl);

  const fruit = [0xa8c23a, 0xd9a12c, 0xb03a28];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(
      new THREE.SphereGeometry(range(rng, 0.032, 0.045), 10, 8),
      new THREE.MeshStandardMaterial({ color: new THREE.Color(fruit[i % fruit.length]), roughness: 0.6 }),
    );
    f.position.set(range(rng, -0.06, 0.06), 0.085 + range(rng, 0, 0.03), range(rng, -0.06, 0.06));
    f.castShadow = true;
    g.add(f);
  }
  return g;
}
