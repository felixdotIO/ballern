/**
 * EDV-Raum.
 *
 * Everything in here is either 19 inches wide or a multiple of a 600 mm floor
 * tile, and that single fact is what makes the room read: it is the only space
 * on the floorplate where the dimensional system is inherited from equipment
 * rather than from architecture, and the eye picks that up instantly even
 * without knowing why.
 *
 * It is also the only room with saturated colour in it. A rack front is a wall
 * of tiny green and amber lights against black, and after twenty minutes of
 * beige that is worth more than any amount of geometry.
 */

import * as THREE from 'three';

import { SERVER } from '../metrics';
import { MAT } from '../materials';
import { PROP_MAT, part, tube } from './shared';
import { jitter, range, type Rng } from '../rng';

const RACK_BODY = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x1e1f22),
  roughness: 0.45,
  metalness: 0.4,
});

const EQUIPMENT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x2b2c2f),
  roughness: 0.5,
  metalness: 0.35,
});

const BLANKING = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x3a3b3f),
  roughness: 0.65,
  metalness: 0.25,
});

/** Beige-boxed kit from before everything went black. Half the rack is this. */
const LEGACY = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0xcfc7b2),
  roughness: 0.55,
  metalness: 0.1,
});

const U = SERVER.U;

/** A row of indicator LEDs across the front of a piece of equipment. */
function indicators(g: THREE.Group, x0: number, y: number, z: number, count: number, rng: Rng): void {
  for (let i = 0; i < count; i++) {
    const roll = rng();
    const material =
      roll > 0.93 ? MAT.led.fault : roll > 0.6 ? MAT.led.activity : roll > 0.08 ? MAT.led.link : MAT.led.power;
    part(g, material, [0.008, 0.005, 0.004], [x0 + i * 0.014, y, z], 0.001);
  }
}

/**
 * A 19-inch cabinet, populated.
 *
 * Filled from the bottom up the way a rack actually fills — the heavy, boring
 * things low down, the switching in the middle where the patching reaches, and
 * a lot of empty U at the top that somebody has blanked off and somebody else
 * has not.
 */
export function rack(rng: Rng, opts: { door?: boolean; fill?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const w = SERVER.rackWidth;
  const d = SERVER.rackDepth;
  const h = SERVER.rackHeight;
  const plinth = SERVER.rackPlinth;

  // Frame: four uprights, a top, a plinth, and side panels.
  part(g, RACK_BODY, [w, plinth, d], [0, plinth / 2, 0], 0.006);
  part(g, RACK_BODY, [w, 0.06, d], [0, h - 0.03, 0], 0.006);
  for (const s of [-1, 1] as const) {
    part(g, RACK_BODY, [0.02, h - plinth, d], [(s * (w - 0.02)) / 2, (h + plinth) / 2, 0], 0.004);
  }
  part(g, RACK_BODY, [w, h - plinth - 0.06, 0.02], [0, (h + plinth - 0.06) / 2, d / 2 - 0.01], 0.004);

  // The 19-inch mounting rails, with their square punchings implied by a
  // continuous strip — at this distance the strip is what you see anyway.
  for (const s of [-1, 1] as const) {
    part(g, BLANKING, [0.03, h - plinth - 0.1, 0.03], [s * 0.44 * w, (h + plinth) / 2, -d / 2 + 0.12], 0.004);
  }

  // Fans in the roof, and the vents in the plinth they pull through.
  for (const x of [-0.15, 0.15]) {
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 14), BLANKING);
    fan.position.set(x, h + 0.005, -0.1);
    g.add(fan);
  }

  // Populate. `fill` is how much of the rack has anything in it at all.
  const fill = opts.fill ?? 0.7;
  let u = 1;
  const top = Math.floor((h - plinth - 0.1) / U);

  while (u < top) {
    const y = plinth + (u + 0.5) * U;
    const roll = rng();

    if (u / top > fill) {
      // Above the fill line: blanking plates where somebody was tidy, and open
      // U where they were not.
      if (rng() > 0.45) part(g, BLANKING, [w - 0.06, U - 0.004, 0.012], [0, y, -d / 2 + 0.02], 0.002);
      u += 1;
      continue;
    }

    if (roll > 0.82) {
      // Patch panel: 24 ports in two rows, and the leads coming out of them.
      part(g, BLANKING, [w - 0.06, U * 1 - 0.004, 0.014], [0, y, -d / 2 + 0.02], 0.002);
      for (let i = 0; i < 12; i++) {
        for (const row of [-1, 1] as const) {
          part(g, RACK_BODY, [0.014, 0.012, 0.006], [-0.22 + i * 0.04, y + row * 0.009, -d / 2 + 0.014], 0.001);
        }
      }
      u += 1;
    } else if (roll > 0.62) {
      // Switch: a long row of link lights, which is the thing that makes a rack
      // look alive rather than look like a filing cabinet.
      part(g, EQUIPMENT, [w - 0.06, U - 0.004, d * 0.4], [0, y, -d / 2 + 0.2], 0.002);
      indicators(g, -0.22, y, -d / 2 + 0.001, 24, rng);
      u += 1;
    } else if (roll > 0.3) {
      // A 1U or 2U server, drive bays on the left, badge and buttons right.
      const height = rng() > 0.6 ? 2 : 1;
      const box = rng() > 0.65 ? LEGACY : EQUIPMENT;
      const cy = plinth + (u + height / 2) * U;
      part(g, box, [w - 0.06, height * U - 0.004, d * 0.85], [0, cy, -d / 2 + 0.42], 0.002);
      for (let i = 0; i < 4; i++) {
        part(g, BLANKING, [0.05, height * U - 0.014, 0.006], [-0.2 + i * 0.055, cy, -d / 2 + 0.012], 0.002);
      }
      indicators(g, 0.14, cy, -d / 2 + 0.012, 4, rng);
      u += height;
    } else {
      // Tape library or a disk shelf: 4U, heavy, and always near the bottom.
      const height = 4;
      const cy = plinth + (u + height / 2) * U;
      part(g, EQUIPMENT, [w - 0.06, height * U - 0.004, d * 0.9], [0, cy, -d / 2 + 0.45], 0.003);
      part(g, PROP_MAT.crtGlass, [0.12, 0.03, 0.006], [-0.15, cy + 0.05, -d / 2 + 0.012], 0.002);
      indicators(g, 0.05, cy + 0.05, -d / 2 + 0.012, 6, rng);
      u += height;
    }
  }

  if (opts.door) {
    // Perforated front door, in a frame, standing very slightly ajar because
    // nobody has ever closed one of these properly.
    const hinge = new THREE.Group();
    hinge.position.set(-w / 2 + 0.01, 0, -d / 2 - 0.015);
    hinge.rotation.y = -range(rng, 0.05, 0.35);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.02, h - plinth - 0.08, 0.02),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(0x1a1b1e),
        roughness: 0.5,
        metalness: 0.5,
        transparent: true,
        opacity: 0.72,
      }),
    );
    door.position.set((w - 0.02) / 2, (h + plinth - 0.08) / 2, 0);
    door.castShadow = true;
    hinge.add(door);
    g.add(hinge);
  }

  g.rotation.y = jitter(rng, 0.006);
  return g;
}

/**
 * Umluftkühlgerät — the in-row cooling unit, and by a wide margin the loudest
 * object in the building.
 */
export function crac(): THREE.Group {
  const g = new THREE.Group();
  const [w, h, d] = SERVER.cracSize;

  part(g, PROP_MAT.metal, [w, h, d], [0, h / 2, 0], 0.01);
  // Return grille across the top two-thirds of the front.
  for (let i = 0; i < 22; i++) {
    part(g, PROP_MAT.darkMetal, [w - 0.14, 0.016, 0.01], [0, 0.6 + i * 0.055, -d / 2 - 0.006], 0.003);
  }
  // Control panel, and the condensate pipe running off to a drain.
  part(g, PROP_MAT.crtGlass, [0.16, 0.09, 0.008], [w * 0.26, h - 0.24, -d / 2 - 0.008], 0.004);
  part(g, MAT.led.link, [0.01, 0.006, 0.005], [w * 0.26 - 0.06, h - 0.32, -d / 2 - 0.01], 0.002);
  tube(g, PROP_MAT.metal, 0.02, 0.02, 0.3, [w / 2 - 0.1, 0, d / 2 - 0.08], 8);
  return g;
}

/** USV cabinet. Heavy, warm, and full of batteries older than the servers. */
export function ups(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.plastic, [0.44, 1.3, 0.75], [0, 0.65, 0], 0.012);
  part(g, PROP_MAT.crtGlass, [0.18, 0.06, 0.008], [0, 1.02, -0.38], 0.004);
  part(g, MAT.led.link, [0.012, 0.008, 0.005], [-0.1, 0.94, -0.382], 0.002);
  part(g, MAT.led.activity, [0.012, 0.008, 0.005], [-0.07, 0.94, -0.382], 0.002);
  // Ventilation louvres down the front, and the castors it arrived on.
  for (let i = 0; i < 12; i++) {
    part(g, PROP_MAT.darkPlastic, [0.3, 0.012, 0.008], [0, 0.24 + i * 0.05, -0.378], 0.002);
  }
  return g;
}

/**
 * KVM console: a shelf, a 15" CRT and a keyboard, wheeled to whichever rack is
 * being sworn at. The only screen in the building that is switched on.
 */
export function kvmConsole(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.darkMetal, [0.7, 0.03, 0.55], [0, 0.86, 0], 0.006);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      tube(g, PROP_MAT.darkMetal, 0.018, 0.018, 0.85, [sx * 0.3, 0, sz * 0.22], 8);
    }
  }
  part(g, PROP_MAT.darkMetal, [0.7, 0.02, 0.5], [0, 0.42, 0], 0.006);

  // The monitor: a small, deep, beige box, and a screen with something on it.
  part(g, LEGACY, [0.4, 0.36, 0.38], [0, 1.07, 0.06], 0.014);
  const screen = part(g, PROP_MAT.crtGlass, [0.31, 0.25, 0.01], [0, 1.11, -0.135], 0.006);
  screen.material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x0a1a12),
    emissive: new THREE.Color(0x2f8f52),
    emissiveIntensity: 0.85,
    roughness: 0.2,
  });
  part(g, LEGACY, [0.42, 0.02, 0.15], [0, 0.885, -0.14], 0.004);
  return g;
}

/**
 * Löschanlage: the inert-gas cylinders and their manifold, strapped to the
 * wall. Red, which in this room is the only warning colour that isn't an LED.
 */
export function gasCylinders(count = 3): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 0.28;
    tube(g, MAT.extinguisher, 0.115, 0.12, 1.35, [x, 0, 0], 16);
    tube(g, PROP_MAT.metal, 0.045, 0.05, 0.12, [x, 1.35, 0], 10);
    part(g, PROP_MAT.stainless, [0.1, 0.05, 0.05], [x, 1.5, -0.05], 0.008);
  }
  // The manifold and the strap holding the lot to the wall.
  part(g, PROP_MAT.stainless, [count * 0.28, 0.03, 0.03], [0, 1.56, -0.05], 0.006);
  part(g, PROP_MAT.darkMetal, [count * 0.28 + 0.1, 0.05, 0.02], [0, 0.95, 0.13], 0.004);
  return g;
}

/** Brandmeldezentrale, with its key switch and its row of lamps. */
export function alarmPanel(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.metal, [0.4, 0.5, 0.11], [0, 0, 0], 0.008);
  part(g, PROP_MAT.crtGlass, [0.3, 0.12, 0.008], [0, 0.14, -0.057], 0.004);
  part(g, MAT.led.link, [0.014, 0.01, 0.005], [-0.12, -0.02, -0.058], 0.002);
  part(g, MAT.led.fault, [0.014, 0.01, 0.005], [-0.08, -0.02, -0.058], 0.002);
  part(g, PROP_MAT.darkPlastic, [0.24, 0.14, 0.01], [0, -0.14, -0.058], 0.004);
  return g;
}

/**
 * A lifted floor tile leaning against a rack, and the void it came out of.
 *
 * There is always exactly one of these, and it has always been like that for
 * three weeks. It is the single most economical way to say that this room is
 * maintained by people rather than generated.
 */
export function liftedTile(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const t = SERVER.floorTile;
  const tile = part(g, MAT.antistatic, [t - 0.01, 0.03, t - 0.01], [0, t / 2, 0], 0.004);
  tile.rotation.x = -Math.PI / 2 + range(rng, 0.16, 0.3);
  tile.rotation.y = jitter(rng, 0.2);
  // The suction lifter, left on top of it.
  part(g, PROP_MAT.darkPlastic, [0.1, 0.03, 0.14], [0.05, t * 0.6, -0.08], 0.01);
  return g;
}

/** The void the tile came out of: cable trays and dust, seen from above. */
export function floorVoid(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const t = SERVER.floorTile;
  part(g, PROP_MAT.darkMetal, [t, 0.02, t], [0, -0.14, 0], 0.004);
  for (let i = 0; i < 5; i++) {
    const cable = part(
      g,
      MAT.patchCable,
      [t - 0.05, 0.018, 0.02],
      [0, -0.12 + i * 0.012, -0.2 + i * 0.09],
      0.008,
    );
    cable.rotation.y = jitter(rng, 0.25);
  }
  return g;
}

/**
 * A bundle of patch leads dropping from the cable ladder into a rack.
 *
 * Drawn as a catenary rather than as a straight run, because a cable that hangs
 * straight is the fastest way to make a comms room look modelled.
 */
export function cableDrop(fromY: number, toY: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const strands = Math.floor(range(rng, 3, 6));

  for (let s = 0; s < strands; s++) {
    const sag = range(rng, 0.08, 0.22);
    const offset = jitter(rng, 0.06);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      points.push(
        new THREE.Vector3(
          offset + Math.sin(t * Math.PI) * sag * 0.4,
          fromY + (toY - fromY) * t - Math.sin(t * Math.PI) * sag,
          jitter(rng, 0.05) + Math.sin(t * Math.PI) * sag * 0.5,
        ),
      );
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.006, 5, false), MAT.patchCable);
    mesh.castShadow = true;
    g.add(mesh);
  }
  return g;
}

/** Spare rails, a stack of flattened boxes, and the trolley they came on. */
export function serverClutter(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const card = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xa08258), roughness: 0.9 });

  for (let i = 0; i < 3; i++) {
    const box = part(g, card, [0.6, 0.06, 0.42], [jitter(rng, 0.04), 0.03 + i * 0.065, jitter(rng, 0.04)], 0.006);
    box.rotation.y = jitter(rng, 0.14);
  }
  // Rails leaning on whatever is behind them.
  for (let i = 0; i < 2; i++) {
    const rail = part(g, BLANKING, [0.04, 0.72, 0.03], [0.42 + i * 0.06, 0.36, 0.2], 0.004);
    rail.rotation.z = 0.24 + jitter(rng, 0.05);
  }
  return g;
}
