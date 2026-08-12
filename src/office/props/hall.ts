/**
 * Empfang — the floor's reception hall.
 *
 * This is the front of house, and everything in it is doing a different job
 * from everything else in the building. The floor is stone, the ceiling is
 * plastered, the seating is soft, the plants are twice the size and in proper
 * pots, and there is a desk whose entire purpose is to be the first thing you
 * see. None of it is better than the office behind it in any functional sense;
 * all of it is more expensive, and that gap is exactly what a reception is.
 *
 * At this hour it is also the brightest room on the lap. Two glazed walls, a
 * polished floor and a low sun is most of the reason the hall is where the grid
 * is: you start in the light and drive out into it.
 */

import * as THREE from 'three';

import { HALL } from '../metrics';
import { PROP_MAT, framedPanel, part, tube } from './shared';
import { MAT } from '../materials';
import { jitter, range, type Rng } from '../rng';

const VENEER = new THREE.MeshStandardMaterial({
  // Pulled back from the cherry the board room uses. A 3.6 m counter front is
  // ten times the area of a table edge, and at that size the same red reads as
  // orange plastic rather than as wood.
  color: new THREE.Color(0x7a5740),
  roughness: 0.3,
  metalness: 0,
});

/** The honed stone the columns, the desk base and the logo wall all share. */
const STONE = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0x3c3b3a),
  roughness: 0.28,
  metalness: 0,
});

/**
 * Satin anodised lettering.
 *
 * Not the polished stainless the rest of the ironmongery is: at 90% metalness a
 * letter is a mirror, and a mirror in a room lit by a sunset comes out orange,
 * which made the company name read as a row of tan tiles. Anodised aluminium is
 * both what signage is actually made of and what keeps its own colour.
 */
const LETTERING = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0xc9ccca),
  roughness: 0.42,
  metalness: 0.35,
});

/** Cold cathode in the counter reveal. Blue-white, and unmistakably of its
 *  decade — nobody has lit a reception desk this way since. */
const COUNTER_LIGHT = new THREE.MeshStandardMaterial({
  color: new THREE.Color(0xdfeaf2),
  emissive: new THREE.Color(0xbfe0ff),
  emissiveIntensity: 2.2,
  roughness: 0.5,
});

const LOUNGE = new THREE.MeshStandardMaterial({
  // The one piece of soft furniture in the building that was chosen rather
  // than specified — charcoal wool, and it shows every speck of anything.
  color: new THREE.Color(0x3c3f43),
  roughness: 0.92,
  metalness: 0,
});

/**
 * The reception counter: a working top at 740 with a transaction shelf at 1100
 * standing in front of it.
 *
 * The two-tier arrangement is the whole object. A single-height desk is a desk;
 * the raised shelf that hides the receptionist's screen and gives a visitor
 * somewhere to sign is what makes it a reception counter, and it is the detail
 * that is nearly always missed.
 */
export function receptionDesk(length = HALL.deskLength): THREE.Group {
  const g = new THREE.Group();
  const d = HALL.deskDepth;
  const work = HALL.deskWorkHeight;
  const shelf = HALL.deskTransactionHeight;

  // Back run: the counter the receptionist actually works at.
  part(g, VENEER, [length, 0.04, d * 0.6], [0, work - 0.02, d * 0.18], 0.006);
  part(g, PROP_MAT.melamine, [length - 0.1, work - 0.14, d * 0.55], [0, (work - 0.14) / 2 + 0.14, d * 0.18], 0.004);

  /**
   * The front, in three bands rather than one panel.
   *
   * A reception counter is the one piece of joinery in the building that was
   * detailed by somebody, and a single flat sheet of veneer 3.6 m long and a
   * metre high is precisely what it is not — it reads as a crate. Real ones are
   * a stone base you can kick, a veneer body, and a reveal between them, with
   * the transaction shelf cantilevered off the top so the whole mass appears to
   * stop short of the floor.
   */
  const base = 0.22;
  part(g, STONE, [length, base, 0.05], [0, base / 2, -d / 2 + 0.015], 0.006);
  // Shadow gap: the body is set back from the base, which is what makes the
  // base read as a base and not as the bottom of the same panel.
  part(g, PROP_MAT.stainless, [length, 0.018, 0.03], [0, base + 0.009, -d / 2 + 0.005], 0.004);
  part(g, VENEER, [length, shelf - 0.09 - base, 0.04], [0, base + (shelf - 0.09 - base) / 2 + 0.018, -d / 2 + 0.02], 0.006);

  // The transaction shelf, standing proud on its own reveal.
  part(g, PROP_MAT.stainless, [length + 0.06, 0.035, 0.3], [0, shelf - 0.018, -d / 2 - 0.09], 0.008);
  part(g, PROP_MAT.stainless, [length, 0.022, 0.022], [0, shelf - 0.058, -d / 2 + 0.008], 0.004);

  /**
   * The lit slot under the shelf.
   *
   * The single most 2004 detail available: a cold cathode strip washing down
   * the counter front. It costs one emissive box and it is the thing that makes
   * a reception desk read as the focal point of a dim hall rather than as a
   * sideboard.
   */
  part(g, COUNTER_LIGHT, [length - 0.1, 0.02, 0.012], [0, shelf - 0.085, -d / 2 - 0.005], 0.004);

  // Kickspace, so the whole thing does not look welded to the floor.
  part(g, PROP_MAT.darkMetal, [length - 0.12, 0.1, d - 0.1], [0, 0.05, 0.02], 0.004);

  return g;
}

/**
 * The tenant's name on the wall behind the desk.
 *
 * Individual raised letters on standoffs rather than a printed panel — which is
 * what a company that has just signed a floor buys, and which throws the small
 * hard shadows that make it read as lettering at all. No actual glyphs: the
 * typeface is its own pass, and a system font up there would undo the room.
 */
export function logoWall(width: number, height: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();

  /**
   * Built in the same language as the columns: a honed stone plinth to just
   * above waist height, a pale panel above it, and a shadow gap between the
   * two. Consistency across a room is what reads as design — the first version
   * of this was one 4.4 m sheet of beech melamine, and at that size the era's
   * defining material stops being a finish and becomes an orange wall.
   */
  const plinth = 1.1;
  part(g, STONE, [width, plinth, 0.09], [0, plinth / 2, 0], 0.006);
  part(g, PROP_MAT.stainless, [width - 0.02, 0.02, 0.1], [0, plinth + 0.01, 0], 0.004);
  part(g, MAT.wall, [width, height - plinth, 0.07], [0, (height + plinth) / 2, 0], 0.006);
  // Stainless returns at both ends, which is how a freestanding screen is
  // finished where you can walk round the back of it.
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.stainless, [0.03, height, 0.12], [(s * width) / 2, height / 2, 0], 0.006);
  }

  // A word's worth of letterform blocks, in the rhythm real lettering has:
  // varied widths, consistent height, tight and even spacing. Sized off the
  // panel rather than fixed — 160 mm caps on a 4.4 m wall read as a label
  // somebody stuck on it.
  //
  // Small, and deliberately: without a typeface these are blocks, and a block
  // 300 mm high is a blank panel screwed to a wall. At 180 it is text you
  // cannot quite read from across a lobby, which is exactly the impression a
  // company name is supposed to make and all this can honestly deliver.
  const letters = Math.floor(range(rng, 8, 12));
  const capHeight = (height - plinth) * 0.14;
  const widths: number[] = [];
  // Real letterforms vary a lot in width — an I next to an M — and it is that
  // unevenness rather than the shapes that says "writing" at a distance.
  for (let i = 0; i < letters; i++) widths.push(capHeight * range(rng, 0.22, 0.85));
  const gap = capHeight * 0.28;
  const total = widths.reduce((a, b) => a + b, 0) + (letters - 1) * gap;
  let x = -total / 2;

  for (const w of widths) {
    // On standoffs, which is what throws the small hard shadow that makes
    // individual letters read as letters at all.
    part(g, LETTERING, [w, capHeight, 0.016], [x + w / 2, plinth + (height - plinth) * 0.55, -0.045], 0.003);
    x += w + gap;
  }
  return g;
}

/** Contract sofa: low, hard, and on a steel sled base. */
export function sofa(length = HALL.sofaLength): THREE.Group {
  const g = new THREE.Group();
  const seat = HALL.sofaSeatHeight;
  const d = HALL.sofaDepth;

  part(g, LOUNGE, [length, 0.16, d - 0.1], [0, seat - 0.04, 0], 0.05);
  const back = part(g, LOUNGE, [length, 0.42, 0.16], [0, seat + 0.25, d / 2 - 0.1], 0.05);
  back.rotation.x = -0.08;
  for (const s of [-1, 1] as const) {
    part(g, LOUNGE, [0.14, 0.22, d - 0.1], [(s * (length - 0.14)) / 2, seat + 0.07, 0], 0.05);
  }
  /*
   * Sled base: two bent steel runners, which is what makes this range look light.
   *
   * The runner has to be *on the floor*, and for a long time it was not: it sat at
   * seat − 0.13, which is 290 mm up, with the uprights hanging off it into thin air
   * and nothing touching the granite at all. The whole lounge — a sofa and two
   * armchairs — hovered a foot above the floor with its own shadow underneath it,
   * which is the single most obvious kind of wrong a modelled interior can be. A
   * sled base appears to float *because the runner is a thin bar lying flat on the
   * floor*, not because it is in the air.
   */
  const bar = 0.03;
  const under = seat - 0.04 - 0.08; // the underside of the seat cushion
  for (const s of [-1, 1] as const) {
    const x = (s * (length - 0.3)) / 2;
    // The runner, lying on the floor.
    part(g, PROP_MAT.stainless, [bar, bar, d - 0.2], [x, bar / 2, 0], 0.008);
    // And the two uprights off it, reaching the cushion.
    for (const sz of [-1, 1] as const) {
      part(g, PROP_MAT.stainless, [bar, under - bar, bar], [x, (under + bar) / 2, (sz * (d - 0.2)) / 2], 0.008);
    }
  }
  return g;
}

/** The armchair from the same range, which nobody ever sits in. */
export function armchair(): THREE.Group {
  const g = new THREE.Group();
  const seat = HALL.sofaSeatHeight;
  const w = 0.78;
  const d = HALL.sofaDepth;

  part(g, LOUNGE, [w, 0.16, d - 0.1], [0, seat - 0.04, 0], 0.05);
  const back = part(g, LOUNGE, [w, 0.42, 0.16], [0, seat + 0.25, d / 2 - 0.1], 0.05);
  back.rotation.x = -0.08;
  // Same sled base as the sofa, and it had the same fault — see the note there.
  const bar = 0.03;
  const under = seat - 0.04 - 0.08;
  for (const s of [-1, 1] as const) {
    part(g, LOUNGE, [0.14, 0.22, d - 0.1], [(s * (w - 0.14)) / 2, seat + 0.07, 0], 0.05);
    const x = (s * (w - 0.3)) / 2;
    part(g, PROP_MAT.stainless, [bar, bar, d - 0.2], [x, bar / 2, 0], 0.008);
    for (const sz of [-1, 1] as const) {
      part(g, PROP_MAT.stainless, [bar, under - bar, bar], [x, (under + bar) / 2, (sz * (d - 0.2)) / 2], 0.008);
    }
  }
  return g;
}

/** Glass-topped low table, with the trade press fanned out on it. */
export function coffeeTable(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = HALL.coffeeTableHeight;

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.012, 0.6),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xd8e2e0),
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.36,
    }),
  );
  top.position.y = h;
  top.castShadow = true;
  g.add(top);
  part(g, VENEER, [0.9, 0.02, 0.44], [0, h * 0.28, 0], 0.004);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      tube(g, PROP_MAT.stainless, 0.015, 0.015, h, [sx * 0.48, 0, sz * 0.24], 10);
    }
  }

  // Magazines: fanned, not stacked, because somebody fans them every morning
  // and by six o'clock they are half fanned and half shoved.
  for (let i = 0; i < 4; i++) {
    const mag = part(
      g,
      PROP_MAT.paper,
      [0.21, 0.005, 0.28],
      [-0.2 + i * 0.13 + jitter(rng, 0.02), h + 0.008 + i * 0.005, jitter(rng, 0.04)],
      0.002,
    );
    mag.rotation.y = jitter(rng, 0.3);
    mag.material = new THREE.MeshStandardMaterial({
      color: new THREE.Color([0xb8452f, 0x2f5f96, 0xd8c33a, 0x3f7a52][i % 4]).multiplyScalar(range(rng, 0.85, 1.05)),
      roughness: 0.35,
    });
  }
  return g;
}

/**
 * Wegweiser: the directory board listing who is on which floor, in a slim
 * anodised frame with slide-in strips. The strips are what date it — a building
 * that expects its tenants to change buys a board you can re-letter with a
 * screwdriver.
 */
export function directoryBoard(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const w = 0.6;
  const h = 0.9;

  const front = framedPanel(g, PROP_MAT.stainless, PROP_MAT.darkPlastic, w, h, { bar: 0.035, depth: 0.03 });
  for (let i = 0; i < 8; i++) {
    const strip = part(g, PROP_MAT.metal, [w - 0.12, 0.06, 0.004], [0, h / 2 - 0.11 - i * 0.095, front - 0.003], 0.002);
    // A couple of the slots are empty, because two of the floors are unlet.
    if (rng() > 0.82) strip.visible = false;
  }
  return g;
}

/** Prospektständer, three tiers, mostly empty. */
export function leafletStand(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.stainless, [0.02, 1.3, 0.02], [s * 0.14, 0.65, 0], 0.004);
  }
  part(g, PROP_MAT.darkMetal, [0.34, 0.02, 0.24], [0, 0.01, 0], 0.004);
  for (let i = 0; i < 3; i++) {
    const y = 0.55 + i * 0.3;
    const pocket = part(g, PROP_MAT.stainless, [0.3, 0.1, 0.06], [0, y, -0.02], 0.006);
    pocket.rotation.x = 0.18;
    if (rng() > 0.4) {
      part(g, PROP_MAT.paper, [0.2, 0.14, 0.006], [0, y + 0.06, -0.03], 0.002).rotation.x = 0.18;
    }
  }
  return g;
}

/** Retractable belt post, roping off the bit of hall nobody may walk through. */
export function beltPost(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.03, 20), PROP_MAT.darkMetal);
  base.position.y = 0.015;
  base.castShadow = true;
  g.add(base);
  tube(g, PROP_MAT.stainless, 0.032, 0.036, 0.92, [0, 0.03, 0], 14);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 14), PROP_MAT.stainless);
  cap.position.y = 0.99;
  g.add(cap);
  return g;
}

/** The belt between two of them, sagging exactly as much as a belt sags. */
export function belt(length: number): THREE.Group {
  const g = new THREE.Group();
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    points.push(new THREE.Vector3(0, 0.94 - Math.sin(t * Math.PI) * 0.05, -length / 2 + length * t));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, 0.018, 3, false),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(0x24262a), roughness: 0.8 }),
  );
  mesh.scale.x = 0.25;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

/** Schirmständer by the door, holding one umbrella somebody forgot in March. */
export function umbrellaStand(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.5, 16, 1, true), PROP_MAT.stainless);
  body.position.y = 0.25;
  body.material.side = THREE.DoubleSide;
  body.castShadow = true;
  g.add(body);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.86, 8), PROP_MAT.darkPlastic);
  shaft.position.set(0.04, 0.43, 0.02);
  shaft.rotation.z = 0.09 + jitter(rng, 0.03);
  shaft.castShadow = true;
  g.add(shaft);
  return g;
}

/** A visitors' book on the transaction shelf, open, with a pen on the chain. */
export function visitorBook(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  part(g, VENEER, [0.34, 0.02, 0.24], [0, 0.01, 0], 0.004);
  const left = part(g, PROP_MAT.paper, [0.16, 0.006, 0.22], [-0.085, 0.023, 0], 0.002);
  const right = part(g, PROP_MAT.paper, [0.16, 0.006, 0.22], [0.085, 0.023, 0], 0.002);
  left.rotation.z = 0.02;
  right.rotation.z = -0.02;
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 8), PROP_MAT.stainless);
  pen.rotation.set(Math.PI / 2, 0, 0.5 + jitter(rng, 0.3));
  pen.position.set(0.06, 0.03, -0.06);
  g.add(pen);
  return g;
}

/** Flat-panel monitor on the desk. In 2004 the receptionist got the TFT. */
export function flatPanel(): THREE.Group {
  const g = new THREE.Group();
  part(g, PROP_MAT.darkPlastic, [0.2, 0.015, 0.16], [0, 0.008, 0], 0.006);
  const stem = part(g, PROP_MAT.darkPlastic, [0.05, 0.16, 0.05], [0, 0.09, 0.02], 0.01);
  stem.rotation.x = 0.1;
  const panel = part(g, PROP_MAT.darkPlastic, [0.4, 0.32, 0.03], [0, 0.33, 0.03], 0.008);
  panel.rotation.x = 0.1;
  const screen = part(g, PROP_MAT.crtGlass, [0.36, 0.28, 0.006], [0, 0.331, 0.014], 0.003);
  screen.rotation.x = 0.1;
  return g;
}

// ---------------------------------------------------------------------------
// The things a reception has that an office does not
// ---------------------------------------------------------------------------

/**
 * Garderobenständer — the coat stand.
 *
 * Freestanding rather than a wall rail, and that is forced rather than chosen:
 * every wall in this hall is glass, a lift core or a meeting room, and you
 * cannot screw a coat rail to any of them. Which is exactly why real receptions
 * in glazed buildings use the standing kind.
 */
export function coatStand(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 1.78;

  // Cast base, column, and the crown of hooks.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.035, 20), PROP_MAT.darkMetal);
  base.position.y = 0.018;
  base.castShadow = true;
  g.add(base);
  tube(g, PROP_MAT.stainless, 0.022, 0.028, h, [0, 0.03, 0], 12);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + jitter(rng, 0.05);
    const arm = part(g, PROP_MAT.stainless, [0.02, 0.02, 0.16], [Math.sin(a) * 0.08, h - 0.06, Math.cos(a) * 0.08], 0.006);
    arm.rotation.y = -a;
    const hook = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), PROP_MAT.stainless);
    hook.position.set(Math.sin(a) * 0.15, h - 0.09, Math.cos(a) * 0.15);
    hook.castShadow = true;
    g.add(hook);
  }

  // One coat somebody has not collected, hanging off the back. A reception with
  // an empty coat stand at twenty past six is a reception nobody works in.
  if (rng() > 0.35) {
    const a = range(rng, 0, Math.PI * 2);
    const coat = part(
      g,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2f3338), roughness: 0.92 }),
      [0.4, 0.95, 0.14],
      [Math.sin(a) * 0.16, h - 0.55, Math.cos(a) * 0.16],
      0.05,
    );
    coat.rotation.y = -a;
    // Shoulders: a coat on a hook is wide at the top and hangs to a point.
    const shoulder = part(
      g,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(0x2f3338), roughness: 0.92 }),
      [0.44, 0.2, 0.16],
      [Math.sin(a) * 0.16, h - 0.16, Math.cos(a) * 0.16],
      0.07,
    );
    shoulder.rotation.y = -a;
  }
  return g;
}

/**
 * Vitrine: a lit display case on a stone plinth.
 *
 * What goes in one of these is whatever the tenant is proud of — a product, a
 * model, an award. Here it is abstract blocks, because inventing a company's
 * trophy is inventing the company. The point is the object: a lit glass box in
 * a dim hall is the strongest single focal point a reception can have.
 */
export function vitrine(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const w = 0.75;
  const d = 0.55;
  const plinth = 0.85;
  const glass = 0.9;

  part(g, PROP_MAT.melamine, [w, plinth, d], [0, plinth / 2, 0], 0.008);
  part(g, PROP_MAT.stainless, [w + 0.03, 0.025, d + 0.03], [0, plinth + 0.012, 0], 0.006);

  // The case: four posts and the glass between them, lit from a slot in the top.
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      part(g, PROP_MAT.stainless, [0.022, glass, 0.022], [(sx * (w - 0.04)) / 2, plinth + glass / 2, (sz * (d - 0.04)) / 2], 0.004);
    }
  }
  const pane = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xdfe8ea),
    roughness: 0.03,
    metalness: 0,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  });
  part(g, pane, [w - 0.05, glass - 0.03, 0.006], [0, plinth + glass / 2, -d / 2 + 0.02], 0.002);
  part(g, pane, [w - 0.05, glass - 0.03, 0.006], [0, plinth + glass / 2, d / 2 - 0.02], 0.002);
  part(g, pane, [0.006, glass - 0.03, d - 0.05], [-w / 2 + 0.02, plinth + glass / 2, 0], 0.002);
  part(g, pane, [0.006, glass - 0.03, d - 0.05], [w / 2 - 0.02, plinth + glass / 2, 0], 0.002);

  // Lid, and the light in it. This is the whole reason the case is worth having.
  part(g, PROP_MAT.stainless, [w, 0.05, d], [0, plinth + glass + 0.025, 0], 0.008);
  part(
    g,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xf6f2e6),
      emissive: new THREE.Color(0xffeccc),
      emissiveIntensity: 1.5,
      roughness: 0.6,
    }),
    [w - 0.14, 0.012, d - 0.14],
    [0, plinth + glass - 0.008, 0],
    0.004,
  );

  // What is in it: three blocks on a felt deck, arranged the way an exhibit is.
  const felt = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4a4f52), roughness: 0.95 });
  part(g, felt, [w - 0.09, 0.01, d - 0.09], [0, plinth + 0.03, 0], 0.003);
  const stock = [0xb8b3a6, 0x8a5a3a, 0x6b7076];
  for (let i = 0; i < 3; i++) {
    const s = range(rng, 0.09, 0.16);
    const block = part(
      g,
      new THREE.MeshStandardMaterial({ color: new THREE.Color(stock[i]!), roughness: range(rng, 0.3, 0.6), metalness: 0.2 }),
      [s, s * range(rng, 0.8, 2.0), s * 0.7],
      [-0.2 + i * 0.2 + jitter(rng, 0.02), plinth + 0.04 + (s * 1.2) / 2, jitter(rng, 0.05)],
      0.006,
    );
    block.rotation.y = jitter(rng, 0.5);
  }
  return g;
}

/**
 * Zeitungshalter — the newspaper rack.
 *
 * Papers on wooden poles on a stand, which is a specifically European object
 * and is in the corner of every hotel and office lobby in the country. Two of
 * the four slots are empty because somebody has taken the papers to read.
 */
export function newspaperRack(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 1.2;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.03, 18), PROP_MAT.darkMetal);
  base.position.y = 0.015;
  base.castShadow = true;
  g.add(base);
  tube(g, PROP_MAT.stainless, 0.02, 0.024, h, [0, 0.03, 0], 10);
  part(g, PROP_MAT.stainless, [0.5, 0.02, 0.02], [0, h, 0], 0.005);
  part(g, PROP_MAT.stainless, [0.02, 0.02, 0.5], [0, h - 0.06, 0], 0.005);

  for (let i = 0; i < 4; i++) {
    if (rng() > 0.6) continue;
    const a = (i / 4) * Math.PI * 2;
    const hang = new THREE.Group();
    hang.position.set(Math.sin(a) * 0.23, h - (i % 2) * 0.06, Math.cos(a) * 0.23);
    hang.rotation.y = -a;
    // The wooden pole, and the paper folded over it.
    part(hang, PROP_MAT.melamine, [0.02, 0.02, 0.3], [0, 0, 0], 0.006);
    const paper = part(hang, PROP_MAT.paper, [0.28, 0.42, 0.014], [0, -0.21, 0], 0.004);
    paper.rotation.z = jitter(rng, 0.05);
    g.add(hang);
  }
  return g;
}

/**
 * A linear planter trough.
 *
 * Reception planting is not pots dotted about — it is a run of trough along a
 * glazed elevation, which is both what looks designed and what the maintenance
 * contract is written against. Low planting, so it screens the floor without
 * blocking the view that the glazing was paid for.
 */
export function planterTrough(length: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 0.45;
  const d = 0.42;

  part(g, PROP_MAT.planterSteel, [length, h, d], [0, h / 2, 0], 0.01);
  part(g, PROP_MAT.stainless, [length + 0.02, 0.02, d + 0.02], [0, h, 0], 0.005);
  part(g, PROP_MAT.soil, [length - 0.06, 0.04, d - 0.06], [0, h - 0.03, 0], 0.004);

  // Low mounded planting: overlapping blades rather than a green box.
  for (let x = -length / 2 + 0.12; x < length / 2 - 0.1; x += range(rng, 0.09, 0.16)) {
    const blades = Math.floor(range(rng, 3, 6));
    for (let i = 0; i < blades; i++) {
      const tall = range(rng, 0.18, 0.42);
      const blade = part(
        g,
        PROP_MAT.leafDark,
        [range(rng, 0.012, 0.03), tall, 0.008],
        [x + jitter(rng, 0.05), h + tall / 2 - 0.02, jitter(rng, d / 3)],
        0.003,
      );
      blade.rotation.z = jitter(rng, 0.5);
      blade.rotation.x = jitter(rng, 0.35);
    }
  }
  return g;
}

/**
 * A framed panel on the lift lobby wall.
 *
 * Abstract, and deliberately so — a representational picture would be inventing
 * a photograph, and a corporate lobby of this vintage bought colour-field prints
 * by the metre anyway. The frame is what sells it: a deep shadow gap and a
 * mount, not a poster stuck to plasterboard.
 */
export function artwork(width: number, height: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const front = framedPanel(g, PROP_MAT.darkMetal, PROP_MAT.paper, width, height, { bar: 0.06, depth: 0.05 });

  /**
   * Colour fields in a restrained palette — this building's palette, not a new
   * one. A lobby print that introduces colours nothing else in the building has
   * reads as a sticker.
   *
   * The band heights are normalised so they exactly fill the mount. They used
   * to be drawn at random heights and then clamped, which stacked several of
   * them at the same height and the same depth — coplanar, z-fighting, and the
   * reason this print came out as a shimmering checkerboard.
   */
  const field = [0x3e6b6b, 0x8a5a3a, 0xa9a294, 0x6b2f3a, 0xc9a87c];
  const w = width - 0.22;
  const h = height - 0.22;
  const count = Math.floor(range(rng, 3, 6));
  const weights = Array.from({ length: count }, () => range(rng, 0.6, 1.5));
  const total = weights.reduce((a, b) => a + b, 0);

  let y = -h / 2;
  for (const weight of weights) {
    const bh = (weight / total) * h;
    part(
      g,
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(field[Math.floor(rng() * field.length)]!).multiplyScalar(range(rng, 0.8, 1.15)),
        roughness: 0.8,
      }),
      [w, bh, 0.006],
      [0, y + bh / 2, front - 0.004],
      0.002,
    );
    y += bh;
  }
  return g;
}

/**
 * A freestanding signage totem.
 *
 * The blade of brushed steel by the entrance that tells you which floors are
 * which. No lettering: the typeface is its own pass, and a system font on a
 * two-metre sign in the middle of the hall would undo the room single-handedly.
 * The etched bands carry the rhythm of text without pretending to be it.
 */
export function signTotem(rng: Rng): THREE.Group {
  const g = new THREE.Group();
  const h = 1.85;
  const w = 0.42;

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.025, 18), PROP_MAT.darkMetal);
  base.position.y = 0.012;
  base.castShadow = true;
  g.add(base);
  part(g, PROP_MAT.stainless, [w, h, 0.05], [0, h / 2 + 0.02, 0], 0.008);
  part(g, PROP_MAT.darkMetal, [w - 0.06, 0.04, 0.056], [0, h * 0.78, 0], 0.006);

  for (let i = 0; i < 7; i++) {
    if (rng() > 0.85) continue;
    part(
      g,
      PROP_MAT.darkPlastic,
      [range(rng, 0.14, 0.3), 0.022, 0.008],
      [-w / 2 + 0.11 + jitter(rng, 0.02), h * 0.66 - i * 0.12, -0.03],
      0.003,
    );
  }
  return g;
}

/** Slatted bench for the lift lobby, where people wait standing up anyway. */
export function lobbyBench(length: number): THREE.Group {
  const g = new THREE.Group();
  const seat = 0.44;

  for (let i = 0; i < 7; i++) {
    part(g, PROP_MAT.melamine, [length, 0.028, 0.052], [0, seat, -0.19 + i * 0.064], 0.006);
  }
  for (const s of [-1, 1] as const) {
    part(g, PROP_MAT.stainless, [0.04, seat - 0.03, 0.42], [(s * (length - 0.5)) / 2, (seat - 0.03) / 2, 0], 0.008);
    part(g, PROP_MAT.stainless, [0.06, 0.02, 0.46], [(s * (length - 0.5)) / 2, 0.01, 0], 0.005);
  }
  return g;
}

/**
 * A rug, laid on the stone under the lounge.
 *
 * The single cheapest thing that stops a large hard floor reading as a car
 * park: a soft rectangle that says the seating is a room within the room. Every
 * reception with a stone floor and a sofa on it has one, for that reason.
 */
export function rug(width: number, depth: number): THREE.Group {
  const g = new THREE.Group();
  const pile = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x6a6257), roughness: 0.98 });
  const border = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x4c4740), roughness: 0.98 });

  part(g, border, [width, 0.012, depth], [0, 0.006, 0], 0.004);
  part(g, pile, [width - 0.22, 0.014, depth - 0.22], [0, 0.008, 0], 0.004);
  return g;
}
