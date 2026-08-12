/**
 * Who is driving, and what they are driving.
 *
 * **The drivers are seven rigged assets, one per character.** `blender/crew/` is
 * where they are designed and `blender/rig.py` exports each one against the bone
 * contract `render/driverRig.ts` binds, so switching driver swaps the whole figure
 * and the rig re-binds. They share a body by design — one white tee, one pair of
 * trousers, one frame, only the head changes — so there is nothing here to
 * configure and nothing to recolour.
 *
 * It was a costume rail for a while: one figure, seven sets of colours by material
 * name. That is the cheaper build and it produced seven office dogs in coloured
 * t-shirts, which is not a roster, and it made the picker read as broken because
 * the only thing that changed was a hue.
 *
 * **The rides are primitives.** A gym ball is a sphere, a stool is a cylinder on
 * a five-star base, a pedestal unit is a bevelled box with three drawer fronts
 * on it — all of them built from `render/geometry.ts`'s chamfered box and three's
 * own lathes, in the clay palette, at office dimensions. The kit chair is still
 * one of the four and is simply the stock one shown.
 *
 * What none of them change is the driving. The collider is a capsule sized off
 * the chair's five-star base and it stays that capsule whatever is drawn over it,
 * so a gym ball corners exactly like a task chair. That is a deliberate refusal
 * rather than an omission: the moment a ride is faster, choosing one stops being
 * a question about who you feel like being, and the roster becomes a stat block
 * to solve. The only thing a ride changes is how high the sitter rides on it.
 */

import * as THREE from 'three';

import { bevelBox } from '../../render/geometry';
import type { DriverCharacter } from '../../game/rivals';
import type { DriverKey } from '../../render/kit';

/**
 * A driver: a name, an asset and a pace.
 *
 * ---- names ---------------------------------------------------------------
 *
 * The cast's own, out of `blender/crew/cast.py` — The new one, Facilities, The
 * office dog, The intern, The boss, The sales guy, The designer. There were two
 * rosters for a while, this one calling the same people "The Summer Intern" and
 * "The IT Guy", and the moment a name exists twice the one on screen is a coin
 * toss.
 *
 * ---- why there is no wardrobe here ---------------------------------------
 *
 * Because the cast has one body. From `blender/README.md`: *everyone wears the
 * same white tee, the same trousers, the same shoes and the same frame — only the
 * head changes*, and that is the point of the sheet rather than an accident of it.
 * A uniform body makes a weak character impossible to hide behind wardrobe.
 *
 * So a driver is a whole rigged asset, and picking one swaps it. The previous
 * version of this file loaded the office dog and recoloured his shirt seven
 * different ways, which produced seven dogs in coloured t-shirts — wrong on both
 * counts, and it made the picker look broken because the only thing changing was
 * a hue.
 */
export type Rider = {
  key: DriverKey;
  label: string;
  /**
   * How fast this one drives when the computer has it, m/s.
   *
   * On the roster rather than in `rivals.ts` because it belongs to the character:
   * whoever you do not pick lines up against you, so the boss has to bring his own
   * pace with him rather than inherit whatever grid slot he lands in.
   */
  pace: number;
  /**
   * And how they drive it, as four numbers — see `rivals.ts` for what each one
   * does to the car.
   *
   * These are here for the same reason `pace` is, and they matter more than it
   * does. A field separated only by top speed is a field of one driver at four
   * volumes: everybody takes the same corner at the same speed on the same line
   * and the whole race is a queue in pace order, which is what this one was. What
   * makes an opponent read as a person is that they are *good at different things*
   * — the sales guy is quick and will put it down the inside of you at a doorway
   * he cannot possibly make; the designer is slower and will never once be untidy;
   * the boss brakes far too early and then refuses to let you past.
   *
   * So none of these is a difficulty knob. Every one of them is a way to be fast
   * and a way to be slow at the same time, which is the only kind of character a
   * racing opponent can have.
   */
  drive: DriverCharacter;
};

export type Ride = {
  label: string;
  /**
   * Where its seat top is, in metres above the chair's origin.
   *
   * A measurement of the object, not an offset for a figure. That distinction is
   * the whole of this rewrite: the offset used to be written here directly, worked
   * out once against one figure, and it was wrong for every other one — the cast is
   * seven characters of different heights, and `blender/rig.py` reports a seat
   * height per character (the intern's is 363 mm, and the figure this table was
   * first measured against sat at 414). One number cannot serve both, which is why
   * the intern was still inside the cushion after the last fix.
   *
   * So the ride says where its seat is, the figure is measured for where its own
   * seat is, and the offset is the difference. Nothing has to be kept in step by
   * hand, and a new character or a new ride is correct on arrival.
   */
  top: number;
  /**
   * How far the sitter sinks into it, metres.
   *
   * A cushion gives, a gym ball gives more, a filing pedestal's worktop gives
   * nothing at all. Without this every ride reads as a plank.
   */
  give: number;
  /** Absent means the stock kit chair. */
  build?: () => THREE.Object3D;
};

/** Everything a clay surface is, other than its colour. `repaint.ts`'s CLAY. */
const clay = (color: number, roughness = 0.9) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });

// ---------------------------------------------------------------------------
// The drivers
// ---------------------------------------------------------------------------

/**
 * The seven, in the order the picker walks them.
 *
 * Facilities opens it. He is the fastest of them and the one who has driven this
 * floor for eleven years, so he is both the obvious default and the one the screen
 * should hand you first. The intern closes it — she is the control the character
 * sheet is judged against rather than the character to lead with.
 *
 * The order matters twice over, because the field is this list minus your pick,
 * taken in order: whoever is at the top is on the grid in every race you do not
 * drive them yourself.
 *
 * Paces span 700 mm a second — about four seconds a lap — and go to the characters
 * they suit: the new one started on Monday, and the sales guy is quick because he
 * is not thinking about it.
 */
export const RIDERS: readonly Rider[] = [
  // Eleven years on this floor. Quick because he knows where everything is, not
  // because he is trying: the highest nerve on the roster, a tidy line, and no
  // interest whatever in a fight he can win at the next doorway anyway.
  { key: 'facilities', label: 'Facility Manager', pace: 5.95, drive: { nerve: 1.12, bold: 0.45, flow: 0.85, steady: 0.9 } },
  // Fast and completely unbothered. Will take a gap that is not there, and does
  // not hold a line so much as approximately remember one.
  { key: 'sales', label: 'The sales guy', pace: 5.85, drive: { nerve: 1.06, bold: 0.95, flow: 0.35, steady: 0.45 } },
  // The best line on the floor, driven slightly too slowly, and never once a
  // move on anybody. Ends up third having looked like winning.
  { key: 'designer', label: 'The designer', pace: 5.7, drive: { nerve: 0.98, bold: 0.25, flow: 0.98, steady: 0.85 } },
  // Brakes for corners that are not corners and then will not be passed. The
  // slowest fast driver in the building.
  { key: 'boss', label: 'The boss', pace: 5.45, drive: { nerve: 0.88, bold: 0.8, flow: 0.4, steady: 0.75 } },
  // No plan at any point. Quick in a straight line, catastrophic everywhere else,
  // and entirely capable of leading a lap.
  { key: 'dog', label: 'The office dog', pace: 5.35, drive: { nerve: 1.05, bold: 0.9, flow: 0.12, steady: 0.2 } },
  // Started on Monday. Careful, off the pace, and the only one who has not hit
  // anything.
  { key: 'newone', label: 'The new one', pace: 5.25, drive: { nerve: 0.92, bold: 0.2, flow: 0.8, steady: 0.95 } },
  // Trying very hard, which is both why she is quicker than she looks and why the
  // third lap is not the first one.
  { key: 'intern', label: 'The intern', pace: 5.6, drive: { nerve: 1.02, bold: 0.6, flow: 0.6, steady: 0.4 } },
];

// ---------------------------------------------------------------------------
// The rides
// ---------------------------------------------------------------------------

/** Five arms, five castors: the base every chair on this floor stands on. */
function starBase(arms: THREE.Material, castors: THREE.Material, radius: number): THREE.Group {
  const group = new THREE.Group();
  const arm = bevelBox(0.036, 0.028, radius);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(arm, arms);
    spoke.position.set(Math.sin(a) * radius * 0.5, 0.075, Math.cos(a) * radius * 0.5);
    spoke.rotation.y = a;
    group.add(spoke);

    const castor = new THREE.Mesh(new THREE.SphereGeometry(0.031, 12, 8), castors);
    castor.position.set(Math.sin(a) * radius, 0.031, Math.cos(a) * radius);
    group.add(castor);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.05, 16), arms);
  hub.position.y = 0.075;
  group.add(hub);
  return group;
}

function gymBall(): THREE.Object3D {
  const group = new THREE.Group();
  // 650 mm ball with a sitter on it, which is a 650 mm ball squashed. Scaled
  // rather than modelled: a sphere flattened on the vertical is what a loaded one
  // is, and it puts a wide contact patch on the carpet instead of a tangent.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.34, 32, 20), clay(0x1e6f78, 0.62));
  /*
   * Squashed on both the vertical and the depth, and sat back 100 mm.
   *
   * The vertical squash is the load. The other two numbers are the sitter: a
   * sphere centred under the hips reaches 325 mm forward at its equator, and the
   * calves of the figure — one leg planted, one folded back under the seat — are
   * only 189 mm forward. A round ball in the right place therefore has a shin
   * inside it, which is what it had. Flattening the depth and setting the whole
   * thing back puts the bulge behind the calves, and leaves the crown just
   * proud of the sitter's back edge, where a loaded ball's crown actually is.
   */
  ball.scale.set(1, 0.68, 0.72);
  ball.position.set(0, 0.34 * 0.68, 0.1);
  group.add(ball);
  return group;
}

function stool(): THREE.Object3D {
  const group = new THREE.Group();
  const metal = clay(0x7d8794, 0.55);
  const dark = clay(0x2f3945, 0.7);

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.185, 0.075, 24), clay(0x6b2f3a));
  pad.position.y = 0.383;
  group.add(pad);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.28, 14), metal);
  column.position.y = 0.21;
  group.add(column);

  group.add(starBase(dark, dark, 0.22));

  // Back 30 mm, off the sitter's knees. The pad is 400 mm across and the figure's
  // calves start 189 mm forward, so a centred pad clips them at the front edge.
  group.position.z = 0.03;
  return group;
}

function pedestal(): THREE.Object3D {
  const group = new THREE.Group();
  const carcase = clay(0xa8763c);
  const faces = clay(0x9a6b34);
  const handle = clay(0x8d97a2, 0.5);
  const dark = clay(0x1f2228, 0.7);

  /*
   * 420 wide, 500 high, 440 deep — and the depth is the sitter's, not the
   * catalogue's.
   *
   * A Rollcontainer is 600 deep, and 600 of it centred under the hips is a box
   * with a pair of shins in it: the calves hang 189 mm forward of the chair's
   * centre and the carcase reached 280. So the box is shallower and set back, its
   * front face 120 mm forward, which leaves the shins hanging in front of the
   * drawers where they belong and still reads as a pedestal from every angle the
   * menu uses.
   */
  const front = -0.12;
  const depth = 0.44;
  const mid = front + depth / 2;

  const body = new THREE.Mesh(bevelBox(0.42, 0.5, depth), carcase);
  body.position.set(0, 0.3, mid);
  group.add(body);

  // A worktop lip, 18 mm and proud on every side. Without it the carcase is a
  // box, and from the one angle the garage's turntable spends most of its time at
  // — behind the sitter, where no drawer front is visible — a box is a cardboard
  // box. Every pedestal unit in this building has this edge on it.
  const top = new THREE.Mesh(bevelBox(0.45, 0.018, depth + 0.03), handle);
  top.position.set(0, 0.558, mid);
  group.add(top);

  /*
   * Three drawers, deepest at the bottom, because that is how a Rollcontainer is
   * built and it is the sort of thing this building is about.
   *
   * On the side face, which means the sitter rides it sideways. That is not a
   * stylistic choice: with the drawers on the front they are behind a pair of
   * dangling calves and the ride reads as a plain wooden box in the one place it
   * has to be identifiable — the picker. Turned through 90° the fronts and their
   * grips are the first thing the turntable shows, and the unit is near enough
   * square now that neither face is the wrong one. +X is the sitter's right,
   * which is the face the turntable is on — the other one is dark all menu.
   */
  const heights = [0.11, 0.13, 0.19];
  let y = 0.08;
  for (const h of heights) {
    const drawer = new THREE.Mesh(bevelBox(0.02, h, 0.37), faces);
    drawer.position.set(0.22, y + h / 2, mid);
    group.add(drawer);

    const grip = new THREE.Mesh(bevelBox(0.024, 0.016, 0.15), handle);
    grip.position.set(0.235, y + h - 0.03, mid);
    group.add(grip);
    y += h + 0.025;
  }

  for (const x of [-0.15, 0.15]) {
    for (const z of [mid - 0.16, mid + 0.16]) {
      const castor = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), dark);
      castor.position.set(x, 0.028, z);
      group.add(castor);
    }
  }

  return group;
}

export const RIDES: readonly Ride[] = [
  /*
   * 320: the race chair's own seat, wound down to the bottom of its gas lift — see
   * the note at the top of `kit/build_chair.py`. It is the one ride where the
   * backside is on the cushion *and* the soles can still push off the carpet, which
   * is what the driver animation spends its whole life doing.
   *
   * The other three are taller and the feet do dangle on them. That is not a bug to
   * be tuned away: a small person perched on a filing pedestal with their feet off
   * the ground is the funniest thing on the roster, and it is also what happens.
   */
  { label: 'Office Chair', top: 0.32, give: 0.02 },
  // The crown of the squashed ball where the hips land, not its very top.
  { label: 'Exercise Ball', top: 0.45, give: 0.03 },
  { label: 'Rolling Stool', top: 0.42, give: 0.012 },
  // A worktop. It does not give.
  { label: 'Filing Pedestal', top: 0.567, give: 0 },
];


/**
 * How each ride is made, or `undefined` for the one that is the stock kit chair.
 *
 * Exported because the character select now shows a picture of every ride at once,
 * and the pictures are rendered from the rides themselves — see `portraits.ts`. A
 * picker that draws its own idea of what a stool looks like is a picker that is
 * wrong the first time somebody changes the stool.
 */
export const RIDE_BUILDERS: readonly (undefined | (() => THREE.Object3D))[] = [
  undefined,
  gymBall,
  stool,
  pedestal,
];

// ---------------------------------------------------------------------------

export type Garage = {
  setRider(index: number): void;
  setRide(index: number): void;
  readonly rider: number;
  readonly ride: number;
  /** What is selected, for the manifest. */
  readonly labels: { rider: string; ride: string };
  /** How many there are of each, so the picker can say 2/5 rather than nothing. */
  readonly counts: { riders: number; rides: number };
};

/**
 * @param mount the chair's own group — whatever is drawn is drawn in here
 * @param useDriver swaps the seated figure for one of the cast and hands back
 *   whatever is now parented to `mount`. The caller owns it because it also owns
 *   the rig binding and the regrade, neither of which belong in a picker.
 */
export function createGarage(
  mount: THREE.Group,
  useDriver: (key: DriverKey) => THREE.Object3D,
): Garage {
  // Whatever is in the group before the first driver arrives is the stock chair.
  // Captured rather than indexed, because `createChair` owns that end of it and an
  // index into somebody else's children is a bug waiting for a refactor.
  const stock = [...mount.children];

  let figure: THREE.Object3D | null = null;
  let seat = 0;
  let rider = 0;
  let ride = 0;
  let built: THREE.Object3D | null = null;

  /**
   * How high a figure's own seat is: the lowest point of it, over the footprint its
   * weight is on.
   *
   * Measured off the posed geometry rather than read from a table, because the pose
   * is what decides it — `applyBoneTransform` is the only way to ask a skinned mesh
   * where it *actually* is, since its vertex buffer holds the bind pose and the sit
   * is a pose. The footprint is deliberately narrow: 200 mm either side of the
   * centre line and from 100 mm behind the origin to 140 in front, which is the
   * backside and nothing else. Widen it and it starts catching the folded leg tucked
   * under the seat, which is 100 mm lower and not what anybody is sitting on.
   */
  function seatOf(subject: THREE.Object3D): number {
    subject.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(subject.matrixWorld).invert();
    const at = new THREE.Vector3();
    let lowest = Infinity;

    subject.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (!(mesh as THREE.Mesh).isMesh) return;
      const position = mesh.geometry.attributes['position'];
      if (!position) return;
      // Every fourth vertex. This runs on every driver change and the answer is a
      // minimum over thousands of points, so a quarter of them is plenty.
      for (let i = 0; i < position.count; i += 4) {
        at.fromBufferAttribute(position, i);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, at);
        at.applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal);
        if (Math.abs(at.x) < 0.2 && at.z > -0.14 && at.z < 0.1 && at.y < lowest) lowest = at.y;
      }
    });

    return Number.isFinite(lowest) ? lowest : 0;
  }

  /** Sit whoever is in the chair on whatever they are in, and mind the cushion. */
  function seatFigure(): void {
    if (!figure) return;
    const spec = RIDES[ride]!;
    figure.position.y = spec.top - spec.give - seat;
  }

  function setRider(index: number): void {
    rider = ((index % RIDERS.length) + RIDERS.length) % RIDERS.length;
    figure = useDriver(RIDERS[rider]!.key);
    // Measured before it is moved: `seatOf` reads the figure in its own frame, and
    // it has to be asked while that frame is still at the origin.
    figure.position.y = 0;
    seat = seatOf(figure);
    seatFigure();
  }

  function setRide(index: number): void {
    ride = ((index % RIDES.length) + RIDES.length) % RIDES.length;

    if (built) {
      mount.remove(built);
      // Built here, disposed here. The materials are per-ride and the geometry is
      // per-switch, and a garage nobody ever leaves would otherwise leak both.
      built.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      built = null;
    }

    const build = RIDE_BUILDERS[ride];
    for (const child of stock) child.visible = build === undefined;

    if (build) {
      built = build();
      built.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      mount.add(built);
    }

    seatFigure();
  }

  /*
   * Applied once, before anybody has touched a picker.
   *
   * Both of these only ran on a *change*, so the driver and chair the game opened
   * with were the figure exactly as the asset ships it — which meant the first
   * entry on the roster was the only one that never wore its own palette, and
   * cycling all the way round the list made it change colour on arrival. That is
   * precisely the kind of thing that makes a picker feel broken rather than look
   * broken.
   */
  setRider(0);
  setRide(0);

  return {
    setRider,
    setRide,
    get rider() {
      return rider;
    },
    get ride() {
      return ride;
    },
    get labels() {
      return { rider: RIDERS[rider]!.label, ride: RIDES[ride]!.label };
    },
    get counts() {
      return { riders: RIDERS.length, rides: RIDES.length };
    },
  };
}
