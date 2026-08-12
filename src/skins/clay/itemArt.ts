/**
 * What the items look like.
 *
 * Everything here belongs to one register of its own, and that is a deliberate
 * exception rather than an oversight. The building is a graded,
 * desaturated, golden-hour clay model in which the loudest thing permitted is a
 * fire extinguisher; the checkpoints are two-metre pink pastries hanging in the
 * air. The case is the same one the checkpoint markers used to make: a pickup has
 * to be legible at six metres a second from a 3.6 m
 * boom, in a windowless core, past a driver's head — and nothing that also has to
 * pass for office furniture can do that.
 *
 * So these are saturated, they carry their own emissive, and they are built
 * *after* `repaintObject(scene)` has swept the graph so the regrade never reaches
 * them. The one thing they are not is loose: every builder returns a collapsed
 * group — one mesh per material — so a row of three piñatas is six draws rather
 * than a hundred and fifty, and a clone of one shares both geometry and material
 * with the original.
 *
 * The convention is `props/shared.ts`'s with one change: a thing that flies has
 * its origin at its own centre, not on the floor, because the only sensible pivot
 * for something spinning through the air is the middle of it. Things that sit on
 * the floor — the puddle — keep the floor origin.
 */

import * as THREE from 'three';

import { bevelBox } from '../../render/geometry';
import { collapse } from '../../render/batch';
import { makeRng, range, seedFrom, type Rng } from '../../office/rng';

/**
 * The piñata's paper, and the palette every item borrows its accents from.
 *
 * Four hot colours plus a warm white, and they are the only fully saturated set
 * in the frame. There is no argument for a *second* family of loudest colours, so
 * everything in the game that is not furniture draws on this one.
 */
const PAPER = [0xe8617f, 0xffd447, 0x53c3f0, 0x7be08a, 0xfff2e0] as const;

/**
 * Clay with a glow of its own, and the lesson behind it was learnt the hard way: a pickup lit brightly enough to find in a dark corridor is a pickup with a
 * point light inside its own geometry, and the bloom pass turns that into a
 * two-metre neon smear. It glows because it is glowing.
 */
function lit(color: number, emissive = 0.16, over: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: emissive,
    roughness: 0.72,
    metalness: 0,
    ...over,
  });
}

const MAT = {
  paper: PAPER.map((c) => lit(c, 0.22)),
  /** Ring binder board — the red every mandatory training module has ever been printed on. */
  binder: lit(0xd8452f, 0.2),
  label: lit(0xf4ece0, 0.1),
  card: lit(0xf6efe2, 0.12),
  cardBar: lit(0x3f8fd0, 0.3),
  cardRule: lit(0x9aa6ad, 0.02, { roughness: 0.9 }),
  housing: lit(0x53565a, 0.02, { roughness: 0.45, metalness: 0.35 }),
  stainless: lit(0xb9bcbd, 0.02, { roughness: 0.28, metalness: 0.7 }),
  /** Behind the door, and it is the only warm thing in the object. */
  cooking: lit(0xff8a2b, 1.5),
  fish: lit(0x9fb8c4, 0.08, { roughness: 0.35 }),
  /**
   * Coffee. Almost black in colour and almost a mirror in finish, because that
   * is the only way a 40 mm deep puddle reads on a carpet at all — it is the
   * reflection of the ceiling you see, never the liquid.
   */
  coffee: lit(0x2a1a10, 0.02, { roughness: 0.06, metalness: 0.15 }),
  cup: lit(0xf2ece1, 0.04, { roughness: 0.8 }),
  /** The lid every takeaway cup in Europe has, and the kraft sleeve under it. */
  lid: lit(0x2b2b2e, 0.02, { roughness: 0.55 }),
  sleeve: lit(0xa97f56, 0.03, { roughness: 0.95 }),
  /** RAL 3000 with the black band the pressure label is printed on. */
  extinguisherRed: lit(0x9d1f1f, 0.14),
  ink: lit(0x1c1a19, 0.0, { roughness: 0.7 }),
  /** The dark inside of an oven door, and the gauge glass on a bottle. */
  glass: lit(0x14181c, 0.0, { roughness: 0.2, metalness: 0.4 }),
  /** The powder cloud and the stink cloud, which differ only in colour. */
  powder: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
  stink: new THREE.MeshBasicMaterial({ color: 0x9fd08a, transparent: true, opacity: 0.42, depthWrite: false }),
};

/** A bevelled box, positioned and rotated, added to a parent. The unit here. */
function part(
  parent: THREE.Object3D,
  material: THREE.Material,
  size: [number, number, number],
  at: [number, number, number],
  rotation?: [number, number, number],
  bevel = 0.004,
): THREE.Mesh {
  const mesh = new THREE.Mesh(bevelBox(size[0], size[1], size[2], bevel), material);
  mesh.position.set(at[0], at[1], at[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// The piñata
// ---------------------------------------------------------------------------

/**
 * The seven points, as directions.
 *
 * One up, one down, five round the equator — which is the piñata everybody has
 * in their head, and it is that shape for a reason worth keeping: the silhouette
 * is unmistakable from any angle, including the one that matters, which is
 * head-on from three metres behind a driver at six metres a second. A star has no
 * bad side. The alternative on the table was a burro, and a small animal read
 * from behind at speed is a brown blob.
 *
 * The equator is tilted a few degrees off level so the thing never presents two
 * points as a perfectly horizontal pair — a symmetry that reads as a logo rather
 * than as an object.
 */
const POINTS: readonly THREE.Vector3[] = [
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  ...Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a), Math.sin(a * 2) * 0.22, Math.sin(a)).normalize();
  }),
];

/**
 * Body radius, and the reach of a point beyond it. Together: a 920 mm star.
 *
 * Sized off legibility rather than off a real piñata, and measured rather than
 * guessed. The first pass was 640 mm with the points barely longer than the body
 * was wide, and at the eight metres you first see a row from it read as a
 * coloured pom-pom — no silhouette at all, just a smudge of confetti. The donut
 * was 860 mm across for exactly this reason: the size that
 * makes it charming and the size that makes it legible from a 3.6 m boom
 * disagree, and legible wins.
 *
 * The points are now longer than the body's radius, which is what makes it a
 * star instead of a ball with bumps.
 */
const CORE = 0.22;
const SPIKE = 0.24;

/**
 * The fringe, which is the whole of what makes it a piñata rather than a jack.
 *
 * Bands of cut paper round the body, each band one colour, each strip tilted so
 * it stands off the surface and catches the rim light rather than lying flat on
 * it.
 *
 * Three bands of eight, and both of those numbers came down from the first pass —
 * five bands of twelve covered the whole body in confetti and the star vanished
 * inside it. What a piñata actually looks like at any distance is a *coloured
 * shape* with a texture, not a texture in the shape of nothing, so the fringe now
 * sits in three distinct rings with body colour showing between them and the
 * strips are half again as long so each one still reads as a strip.
 */
function fringe(group: THREE.Group, rng: Rng): void {
  const bands = 3;
  for (let b = 0; b < bands; b++) {
    // Latitude from the top down, kept well off both poles so the fringe never
    // fights the two axial points for the same piece of surface.
    const lat = Math.PI * (0.27 + (b / (bands - 1)) * 0.46);
    const y = Math.cos(lat) * CORE;
    const r = Math.sin(lat) * CORE;
    // Cyan, green and warm white. Not the body's pink and not the points' amber,
    // so all three registers of the object stay separable at distance.
    const material = MAT.paper[2 + (b % 3)]!;
    const strips = 8;
    for (let i = 0; i < strips; i++) {
      const a = (i / strips) * Math.PI * 2 + b * 0.4;
      part(
        group,
        material,
        [0.075, 0.014, 0.11],
        [Math.cos(a) * r * 1.04, y, Math.sin(a) * r * 1.04],
        // Turned to face out of the body, then tipped down the way cut paper
        // hangs. The jitter is what stops two dozen identical strips reading as
        // a machined part.
        [-0.62 + range(rng, -0.16, 0.16), -a, 0],
        0.002,
      );
    }
  }
}

/**
 * One piñata, collapsed, origin at its centre.
 *
 * Built once by the caller and cloned per position — the geometry and the five
 * materials are shared, which is the only reason eighteen of these are free.
 */
export function pinata(): THREE.Group {
  const build = new THREE.Group();
  const rng = makeRng(seedFrom('clay.pinata'));

  // A faceted body rather than a smooth one, and no subdivision: twenty flat
  // faces is the same language the cast is modelled in, and a sphere here would
  // be the one round object in a game made entirely of chamfered boxes.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(CORE, 0), MAT.paper[0]!);
  build.add(core);

  /*
   * All seven points in one colour, and it is not the body's.
   *
   * The first pass gave each point its own — seven colours on seven cones — and
   * it destroyed the silhouette: a shape made of seven differently-coloured
   * pieces does not read as one shape, it reads as a cluster. One amber star on
   * a pink body is a star from thirty metres away.
   */
  const cone = new THREE.ConeGeometry(0.09, SPIKE + CORE * 0.35, 6, 1);
  POINTS.forEach((dir) => {
    const spike = new THREE.Mesh(cone, MAT.paper[1]!);
    // A cone is built pointing up its own +Y with its base at the origin's level,
    // so it is pushed out along the direction and then turned to look that way.
    spike.position.copy(dir).multiplyScalar(CORE * 0.72);
    spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    build.add(spike);
  });

  fringe(build, rng);

  const group = collapse(build, { detail: 'high' });
  group.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) (node as THREE.Mesh).castShadow = true;
  });
  return group;
}

/**
 * The scraps it comes apart into.
 *
 * A pickup that simply vanishes reads as a bug the first three times you see it —
 * the old checkpoint markers solved it by blowing up when taken. A piñata cannot do
 * that, because a piñata that swells to four times its size is a balloon. What a
 * piñata does is *burst*, so this is the burst: sixteen scraps of its own paper,
 * thrown outward on their own headings, tumbling as they go.
 */
export function confetti(): { group: THREE.Group; scraps: THREE.Object3D[]; headings: THREE.Vector3[] } {
  const group = new THREE.Group();
  const rng = makeRng(seedFrom('clay.confetti'));
  const scraps: THREE.Object3D[] = [];
  const headings: THREE.Vector3[] = [];

  for (let i = 0; i < 16; i++) {
    const scrap = new THREE.Mesh(
      bevelBox(0.055, 0.006, 0.045, 0.002),
      MAT.paper[i % MAT.paper.length]!,
    );
    group.add(scrap);
    scraps.push(scrap);
    // Outward and upward, on a spiral so no two leave together, and biased up
    // because the eye follows what rises.
    const a = (i / 16) * Math.PI * 2 + range(rng, -0.2, 0.2);
    headings.push(
      new THREE.Vector3(Math.cos(a), range(rng, 0.5, 1.5), Math.sin(a)).multiplyScalar(range(rng, 1.6, 3.1)),
    );
  }
  group.visible = false;
  return { group, scraps, headings };
}

// ---------------------------------------------------------------------------
// The five items
// ---------------------------------------------------------------------------

/**
 * The mandatory training module: a lever-arch file, flying.
 *
 * ---- what "cheap" meant, and what fixed it -------------------------------
 *
 * The first pass was two boards, a spine and two rings — the *diagram* of a ring
 * binder rather than one. Objects read as cheap when every part of them is a
 * primitive at its default proportion, and the fix is never more polygons: it is
 * the two or three details that are the reason the real thing looks the way it
 * does. On a German lever-arch file those are the **finger hole** punched through
 * the bottom of the spine, the **steel edge shoes** on the outer corners, and the
 * **label window** with a frame round it rather than a white rectangle painted on.
 * All three are cut or added at the silhouette, which is the only place a detail
 * survives being thrown across a room.
 *
 * A4 upright, 70 mm on the spine, held flat and nose-first as it flies.
 */
export function binder(): THREE.Group {
  const build = new THREE.Group();
  const H = 0.297;
  const W = 0.21;
  const D = 0.076;

  // Boards, and the spine between them.
  part(build, MAT.binder, [W, H, 0.012], [0, 0, -D / 2], undefined, 0.006);
  part(build, MAT.binder, [W, H, 0.012], [0, 0, D / 2], undefined, 0.006);
  part(build, MAT.binder, [0.014, H, D], [-W / 2 + 0.007, 0, 0], undefined, 0.005);

  /*
   * The label window: a sunken frame with a paper insert, not a painted patch.
   * The frame is what makes it read as a *holder*, and a holder is the thing every
   * one of these has and no cheap model ever includes.
   */
  part(build, MAT.ink, [0.006, 0.172, 0.056], [-W / 2 + 0.002, 0.028, 0], undefined, 0.002);
  part(build, MAT.label, [0.004, 0.158, 0.046], [-W / 2, 0.028, 0], undefined, 0.002);

  // The finger hole, punched through the foot of the spine. Drawn as the dark of
  // the hole rather than modelled through, which at this size is the same picture.
  part(build, MAT.ink, [0.006, 0.028, 0.036], [-W / 2 + 0.001, -0.108, 0], undefined, 0.003);

  // Steel shoes on the two outer corners of the spine edge — the parts that wear.
  for (const y of [H / 2 - 0.016, -H / 2 + 0.016]) {
    part(build, MAT.stainless, [0.02, 0.032, D + 0.006], [-W / 2 + 0.01, y, 0], undefined, 0.003);
  }

  // And the lever's back plate showing along the inner edge of the boards.
  part(build, MAT.stainless, [0.01, H - 0.06, 0.01], [-W / 2 + 0.03, 0, 0], undefined, 0.002);

  return collapse(build, { detail: 'high' });
}

/**
 * “Quick Sync?” — the invite, as a card that skitters.
 *
 * It has to read as a *card* from above, because that is the only angle it is ever
 * seen from once it is on the carpet. What lifts it off being a white rectangle
 * with a stripe is the furniture of an actual meeting invite: a coloured header
 * with a **clock** on it, a **time block** under the title, and one **accept
 * button** — and the joke is that there is only one and it is not "no".
 */
export function inviteCard(): THREE.Group {
  const build = new THREE.Group();
  const W = 0.3;
  const D = 0.21;

  part(build, MAT.card, [W, 0.014, D], [0, 0, 0], undefined, 0.006);
  // Header band, proud of the face so it catches its own edge of light.
  part(build, MAT.cardBar, [W, 0.005, 0.056], [0, 0.0085, -D / 2 + 0.028], undefined, 0.002);
  // The clock on the header: a ring with two hands, which is the one glyph that
  // says "meeting" without a word of type.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0035, 6, 16), MAT.card);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(-W / 2 + 0.032, 0.0115, -D / 2 + 0.028);
  build.add(ring);
  part(build, MAT.card, [0.0035, 0.003, 0.013], [-W / 2 + 0.032, 0.0115, -D / 2 + 0.0225], undefined, 0.001);
  part(build, MAT.card, [0.011, 0.003, 0.0035], [-W / 2 + 0.0375, 0.0115, -D / 2 + 0.028], undefined, 0.001);

  // Title rule, then the time block under it — a filled bar, because that is what
  // a booked half hour looks like in every calendar ever drawn.
  part(build, MAT.cardRule, [0.19, 0.003, 0.014], [-0.03, 0.008, -0.012], undefined, 0.001);
  part(build, MAT.cardBar, [0.076, 0.004, 0.026], [-0.096, 0.0085, 0.028], undefined, 0.002);
  part(build, MAT.cardRule, [0.062, 0.003, 0.009], [-0.006, 0.008, 0.03], undefined, 0.001);

  // The accept button, and there is only one.
  part(build, MAT.cardBar, [0.066, 0.006, 0.028], [0.098, 0.0095, 0.066], undefined, 0.003);
  return collapse(build, { detail: 'high' });
}

/**
 * A fish, in a microwave.
 *
 * The tail in the door seal explains the whole item in one silhouette, and that
 * part was always right. What was cheap was the oven around it: a grey box with a
 * lighter rectangle for a door. A microwave is recognisable from four things and
 * none of them is the box — the **handle bar** down the door, the **mesh** in the
 * window, the **button grid and display** beside it, and the **vent slots** in the
 * flank. All four are here now, and the fish has a body, a dorsal fin and a
 * forked tail instead of a cone.
 */
export function microwaveBomb(): THREE.Group {
  const build = new THREE.Group();
  const w = 0.46;
  const h = 0.27;
  const d = 0.33;
  const front = -d / 2;

  part(build, MAT.housing, [w, h, d], [0, 0, 0], undefined, 0.01);
  // Door: a frame standing proud, with the glass sunk inside it.
  part(build, MAT.stainless, [w * 0.66, h * 0.88, 0.014], [-w * 0.13, 0, front - 0.007], undefined, 0.004);
  part(build, MAT.glass, [w * 0.54, h * 0.7, 0.006], [-w * 0.13, 0, front - 0.015], undefined, 0.002);
  // The mesh — four bars is enough to read as a grille and cheap enough to keep.
  for (let i = -1; i <= 2; i++) {
    part(build, MAT.stainless, [0.004, h * 0.66, 0.002], [-w * 0.13 + i * 0.028, 0, front - 0.019], undefined, 0.001);
  }
  // Warm light behind it, which is the only warm thing in the object.
  part(build, MAT.cooking, [w * 0.5, h * 0.62, 0.003], [-w * 0.13, 0, front - 0.012], undefined, 0.001);
  // Handle: a bar on its own two stand-offs, down the door's right edge.
  part(build, MAT.stainless, [0.018, h * 0.78, 0.018], [w * 0.19, 0, front - 0.036], undefined, 0.004);
  for (const y of [h * 0.3, -h * 0.3]) {
    part(build, MAT.stainless, [0.016, 0.014, 0.026], [w * 0.19, y, front - 0.023], undefined, 0.002);
  }

  // Control panel: a recessed plate, a display strip, and a grid of buttons.
  part(build, MAT.ink, [w * 0.2, h * 0.86, 0.008], [w * 0.36, 0, front - 0.004], undefined, 0.003);
  part(build, MAT.cooking, [w * 0.15, 0.028, 0.003], [w * 0.36, h * 0.3, front - 0.009], undefined, 0.001);
  for (let r = 0; r < 3; r++) for (let col = 0; col < 2; col++) {
    part(build, MAT.stainless, [0.018, 0.016, 0.003],
      [w * 0.36 + (col - 0.5) * 0.03, h * 0.08 - r * 0.05, front - 0.009], undefined, 0.001);
  }

  // Vent slots in the flank, and the four feet it stands on.
  for (let i = 0; i < 4; i++) {
    part(build, MAT.ink, [0.003, 0.012, d * 0.4], [w / 2, h * 0.22 - i * 0.03, 0.02], undefined, 0.001);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    part(build, MAT.ink, [0.03, 0.014, 0.03], [sx * w * 0.4, -h / 2 - 0.006, sz * d * 0.36], undefined, 0.002);
  }

  /*
   * And the fish, caught in the seal. Body, dorsal fin, forked tail — the three
   * shapes that make a fish a fish rather than a cone, and all three are on the
   * silhouette where they survive being thrown.
   */
  const fishAt: [number, number, number] = [-w * 0.13, -h * 0.16, front - 0.05];
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.028, 0.14, 8), MAT.fish);
  body.rotation.set(Math.PI / 2, 0, 0.4);
  body.scale.set(1, 1, 0.55);
  body.position.set(fishAt[0], fishAt[1], fishAt[2]);
  build.add(body);
  for (const s of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.06, 3), MAT.fish);
    fin.rotation.set(Math.PI / 2, 0, 0.4 + s * 0.55);
    fin.scale.set(1, 1, 0.35);
    fin.position.set(fishAt[0] + 0.035 * s * 0.4 - 0.025, fishAt[1] - 0.055 + s * 0.02, fishAt[2] - 0.045);
    build.add(fin);
  }
  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.04, 3), MAT.fish);
  dorsal.rotation.set(Math.PI / 2, 0, -1.1);
  dorsal.scale.set(1, 1, 0.3);
  dorsal.position.set(fishAt[0] + 0.042, fishAt[1] + 0.03, fishAt[2] + 0.01);
  build.add(dorsal);

  return collapse(build, { detail: 'high' });
}

/**
 * The coffee spill, origin on the floor.
 *
 * A fan of triangles with a jittered rim rather than a disc, because a circle of
 * coffee on a carpet is a coaster. The cup is what makes it legible before you are
 * in it: the pool itself is 8 mm tall and vanishes at any distance, and a toppled
 * cup beside it is a 100 mm silhouette that does not.
 *
 * And the cup is a *takeaway* cup now, which is three parts rather than one: the
 * tapered paper body, the pressed **lid** with its rim, and the kraft **sleeve**.
 * A plain white cone reads as a beaker; those two bands are the whole difference
 * between a prop and a thing somebody carried out of the Teeküche.
 */
export function puddle(rng: Rng): THREE.Group {
  const build = new THREE.Group();

  const segments = 20;
  const radii = Array.from({ length: segments }, () => range(rng, 0.36, 0.58));
  const position: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const r0 = radii[i]!;
    const r1 = radii[(i + 1) % segments]!;
    position.push(0, 0, 0, Math.cos(a1) * r1, 0, Math.sin(a1) * r1, Math.cos(a0) * r0, 0, Math.sin(a0) * r0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geo.computeVertexNormals();
  const spill = new THREE.Mesh(geo, MAT.coffee);
  spill.position.y = 0.006;
  build.add(spill);

  // Splashes: a few outliers beyond the rim, which is what a dropped cup does and
  // what a modelled puddle never has.
  for (let i = 0; i < 5; i++) {
    const a = range(rng, 0, Math.PI * 2);
    const r = range(rng, 0.6, 0.85);
    const drop = new THREE.Mesh(new THREE.CircleGeometry(range(rng, 0.03, 0.07), 7), MAT.coffee);
    drop.rotation.x = -Math.PI / 2;
    drop.position.set(Math.cos(a) * r, 0.005, Math.sin(a) * r);
    build.add(drop);
  }

  // The cup, on its side: body, sleeve, lid.
  const lie = range(rng, -0.5, 0.5);
  const cup = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.03, 0.105, 12, 1, true), MAT.cup);
  cup.add(body);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0435, 0.037, 0.042, 12, 1, true), MAT.sleeve);
  sleeve.position.y = -0.004;
  cup.add(sleeve);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 12), MAT.lid);
  lid.position.y = 0.056;
  cup.add(lid);
  cup.rotation.set(Math.PI / 2, 0, lie);
  cup.position.set(range(rng, -0.26, 0.26), 0.042, range(rng, -0.26, 0.26));
  build.add(cup);

  const group = collapse(build, { detail: 'high' });
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    }
  });
  return group;
}

/**
 * A cloud, for the two things that go off rather than hit.
 *
 * One low-poly sphere, unlit, additive-ish through transparency and with depth
 * writing off so a chair driving through it is inside it rather than behind it.
 * Scaled and faded from the outside — the blast owns the animation, this is only
 * the shape.
 */
export function cloud(kind: 'powder' | 'stink'): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    kind === 'powder' ? MAT.powder.clone() : MAT.stink.clone(),
  );
  mesh.visible = false;
  return mesh;
}

/**
 * The extinguisher — the thing you are holding rather than the one on the wall.
 *
 * This is the item with the least excuse for looking cheap, because the real thing
 * is bolted beside every door in the building and the player has driven past forty
 * of them. A red cylinder with a stick on top is not it. What makes a DIN EN 3
 * bottle recognisable, in order of how far away each one survives:
 *
 *   the **shoulder**   it is not a flat-topped tube. The top tapers into a neck,
 *                      and that curve is most of the silhouette.
 *   the **lever**      a carry handle with a squeeze lever above it, not one bar.
 *   the **hose**       clipped down the flank and ending in a horn, which is the
 *                      only part of the object that is not vertical.
 *   the **gauge**      a small white dial on the valve. Tiny, and the single
 *                      detail that says "pressurised" rather than "cylinder".
 *   the **label**      a white band with a black stripe, low on the body.
 */
export function extinguisher(): THREE.Group {
  const build = new THREE.Group();

  // Body, with a base ring and a tapered shoulder rather than a flat top.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.34, 14), MAT.extinguisherRed);
  build.add(body);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.076, 0.07, 0.024, 14), MAT.extinguisherRed);
  base.position.y = -0.176;
  build.add(base);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.072, 0.085, 14), MAT.extinguisherRed);
  shoulder.position.y = 0.212;
  build.add(shoulder);

  // Label band, low on the body where it actually sits, with its black stripe.
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0735, 0.0735, 0.11, 14, 1, true), MAT.label);
  label.position.y = -0.03;
  build.add(label);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0742, 0.0742, 0.016, 14, 1, true), MAT.ink);
  stripe.position.y = 0.014;
  build.add(stripe);

  // Neck and valve block.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.05, 10), MAT.stainless);
  neck.position.y = 0.275;
  build.add(neck);
  part(build, MAT.stainless, [0.05, 0.042, 0.05], [0, 0.312, 0], undefined, 0.004);

  // Carry handle under, squeeze lever over — two bars, which is what makes it a
  // trigger rather than a spike.
  part(build, MAT.ink, [0.088, 0.014, 0.024], [0.018, 0.318, 0], [0, 0, -0.06], 0.004);
  part(build, MAT.ink, [0.104, 0.012, 0.026], [0.026, 0.352, 0], [0, 0, 0.1], 0.004);

  // The pressure gauge, on the side of the valve, facing out.
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.008, 10), MAT.stainless);
  dial.rotation.x = Math.PI / 2;
  dial.position.set(-0.03, 0.312, -0.03);
  build.add(dial);
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.003, 10), MAT.label);
  face.rotation.x = Math.PI / 2;
  face.position.set(-0.03, 0.312, -0.036);
  build.add(face);

  /*
   * The hose, down the flank into a horn. Three straight lengths rather than a
   * curve: at any size this is seen it reads as a hose, and a swept tube here
   * would be the most expensive geometry in the item for the least return.
   */
  part(build, MAT.ink, [0.016, 0.09, 0.016], [0.062, 0.26, 0.04], [0, 0, -0.35], 0.004);
  part(build, MAT.ink, [0.016, 0.13, 0.016], [0.092, 0.15, 0.04], [0, 0, -0.08], 0.004);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.016, 0.075, 10, 1, true), MAT.ink);
  horn.position.set(0.098, 0.05, 0.04);
  horn.rotation.z = 0.12;
  build.add(horn);

  return collapse(build, { detail: 'high' });
}
