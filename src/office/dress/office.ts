/**
 * The open-plan bay, and the corridors that feed it.
 *
 * Each workstation is assigned an *owner* — a seeded persona with a tenure, a
 * tidiness and an occupancy state — and everything on and around that desk
 * follows from who that person is. That is what stops a room of identical
 * desks: the variation is causal rather than noise, so it survives being
 * looked at.
 *
 * Screens sit at 90° to the glazing throughout. Facing a monitor into a window
 * is glare and facing one away from it is reflections, so real German offices
 * run the desk line perpendicular to the facade — and it is also the most
 * legible tell that a generated office has never been designed by anyone.
 */

import * as THREE from 'three';

import { DESK, OH, PLACEMENT, STORAGE } from '../metrics';
import type { Room } from '../plan';
import * as P from '../props/office';
import * as S from '../props/shared';
import { facing, place, solid, looseChair, kicker, seeded, type Dress } from './common';
import { jitter, range, type Rng} from '../rng';
import { boardKicker } from '../props/jumps';

/**
 * Who sits here. Occupancy is the big lever: a nine-year veteran's desk and a
 * hot desk are barely the same object, and having both in one room is most of
 * what makes the room believable.
 */
type Persona = {
  occupancy: 'settled' | 'active' | 'hotdesk' | 'vacant';
  tidiness: number;
  monitors: number;
};

function persona(rng: Rng): Persona {
  const roll = rng();
  const occupancy: Persona['occupancy'] =
    roll > 0.72 ? 'settled' : roll > 0.3 ? 'active' : roll > 0.14 ? 'hotdesk' : 'vacant';
  return {
    occupancy,
    tidiness: occupancy === 'hotdesk' ? 0.95 : range(rng, 0.15, 0.9),
    // A second monitor in 2004 was a status object, not a default.
    monitors: occupancy === 'settled' && rng() > 0.6 ? 2 : 1,
  };
}

/**
 * One workstation. `side` is -1 when the user sits on the -X side of the pod
 * spine and +1 when they sit on the +X side; everything else derives from it,
 * so a pod is just two mirrored calls.
 */
function workstation(
  out: Dress,
  spineX: number,
  seatZ: number,
  side: -1 | 1,
  rng: Rng,
  label: string,
): void {
  const who = persona(rng);
  const deskX = spineX + side * (DESK.depth / 2);
  // Desk back (its modesty panel) faces the spine; the user faces the spine too.
  const deskYaw = side === -1 ? Math.PI / 2 : -Math.PI / 2;
  // Monitors face the user, which is outward from the spine.
  const faceUser = side === -1 ? Math.PI / 2 : -Math.PI / 2;
  const out_ = -side; // direction away from the spine, toward the user

  out.group.add(place(P.benchDesk(), deskX, 0, seatZ, deskYaw));

  const deskTop = DESK.height;
  const jx = () => jitter(rng, PLACEMENT.humanJitterMetres);
  const jyaw = () => jitter(rng, (PLACEMENT.humanJitterDegrees * Math.PI) / 180);

  if (who.occupancy !== 'vacant') {
    // Monitor sits back against the screen, angled slightly toward its owner.
    for (let m = 0; m < who.monitors; m++) {
      const offset = who.monitors === 1 ? 0 : m === 0 ? -0.24 : 0.24;
      out.group.add(
        place(
          P.crtMonitor(),
          spineX + side * 0.27 + jx(),
          deskTop,
          seatZ + offset + jx(),
          faceUser + jyaw() + (who.monitors === 2 ? (m === 0 ? 0.22 : -0.22) : 0),
        ),
      );
    }
    out.group.add(place(P.keyboard(), spineX + out_ * 0.24 + jx(), deskTop, seatZ + jx(), faceUser + jyaw()));
    out.group.add(place(P.mouse(), spineX + out_ * 0.24 + jx(), deskTop, seatZ - 0.28 + jx(), faceUser));
    out.group.add(place(P.deskPhone(), spineX + side * 0.2, deskTop, seatZ + 0.6 + jx(), faceUser + jitter(rng, 0.4)));
    out.group.add(place(P.tower(), spineX + side * 0.42, 0, seatZ + 0.62, faceUser + jyaw()));
  }

  if (who.occupancy === 'settled' || who.occupancy === 'active') {
    out.group.add(place(P.pedestal(), spineX + side * 0.28, 0, seatZ - 0.55, deskYaw));
  }

  // Clutter scales inversely with tidiness. A tidy desk is not an empty desk —
  // it has one mug and a squared-off stack.
  if (who.occupancy !== 'vacant' && who.occupancy !== 'hotdesk') {
    out.group.add(place(S.mug(rng), spineX + out_ * 0.1 + jx(), deskTop, seatZ - 0.42 + jx(), 0));
    if (who.tidiness < 0.75) {
      out.group.add(place(S.paperStack(rng), spineX + out_ * 0.05 + jx(), deskTop, seatZ + 0.45 + jx(), jitter(rng, 0.5)));
    }
    if (who.tidiness < 0.4) {
      out.group.add(place(S.paperStack(rng), spineX + side * 0.1 + jx(), deskTop, seatZ - 0.62 + jx(), jitter(rng, 0.7)));
    }
  }

  // The chair. Pushed in when nobody is there, swung out and turned when
  // somebody has just got up — which is why the room is empty enough to race in.
  //
  // "Pushed in" is 1.16 m from the spine, not the 0.95 it looks like it should
  // be. The pod's collider is one solid box out to 0.83, so a chair authored
  // where a pushed-in chair visually sits is 190 mm inside it, and the solver
  // shoves every chair in the room outward before the first frame. 1.16 puts
  // the base just touching the desk edge, which is as far under as a chair with
  // arms goes anyway.
  const pushedIn = who.occupancy === 'vacant' || who.occupancy === 'hotdesk' || rng() > 0.55;
  looseChair(
    out,
    P.taskChair(rng).group,
    `${label}.chair`,
    spineX + out_ * (pushedIn ? 1.16 : range(rng, 1.35, 1.75)),
    seatZ + (pushedIn ? jitter(rng, 0.06) : jitter(rng, 0.45)),
    faceUser + (pushedIn ? jyaw() : jitter(rng, 1.5)),
  );
}

function pod(out: Dress, spineX: number, z0: number, seats: number, rng: Rng, label: string): void {
  for (let i = 0; i < seats; i++) {
    const seatZ = z0 + (i + 0.5) * DESK.width;
    workstation(out, spineX, seatZ, -1, rng, `${label}.${i}L`);
    workstation(out, spineX, seatZ, 1, rng, `${label}.${i}R`);
  }

  // Stellwand along the spine, in one continuous run as it is actually built.
  const runLength = seats * DESK.width;

  /**
   * Bins, at the ends of the run rather than one under every desk.
   *
   * A desk bin lives under the desk, and the pod's collider is one box from
   * floor to worktop — so a bin authored where a bin actually goes spawns
   * inside it and the solver shoves it out before the first frame. Rather than
   * hand-tuning an offset that clears both the desk and whichever chair is
   * pulled out next to it, they go at the ends of the run, which is where the
   * ones that have been kicked out of the way end up anyway.
   */
  for (const [side, endZ] of [
    [-1, z0 - 0.35],
    [1, z0 + runLength + 0.35],
  ] as const) {
    out.dynamic.push({
      label: `${label}.bin.${side}`,
      // The lightest thing in the room, and it behaves like it.
      object: S.bin(),
      shape: { kind: 'cylinder', halfHeight: 0.15, radius: 0.14 },
      centreOffset: 0.15,
      mass: 1.2,
      position: [spineX + side * 1.05, 0, endZ],
      yaw: 0,
      linearDamping: 0.25,
      angularDamping: 0.4,
    });
  }
  out.group.add(place(P.deskScreen(runLength), spineX, 0, z0 + runLength / 2, Math.PI / 2));

  // One collision volume for the whole pod: two desk depths plus the spine.
  out.collision.push({
    label: `${label}.desks`,
    size: [DESK.depth * 2 + 0.06, DESK.height, runLength],
    centre: [spineX, DESK.height / 2, z0 + runLength / 2],
  });
  out.collision.push({
    label: `${label}.screen`,
    size: [DESK.screenThickness + 0.04, DESK.screenHeight, runLength],
    centre: [spineX, DESK.screenHeight / 2, z0 + runLength / 2],
  });
}

/**
 * The bay.
 *
 * Two bands of bench pods with the circulation run untouched between them, and
 * the desk lines running perpendicular to the north glazing so no screen faces
 * a window. The south band stops well short of the board room's glazed front,
 * because the doors in it have to open.
 */
export function dressOffice(room: Room, out: Dress, rng: Rng): void {
  /*
   * Somebody's whiteboard, over somebody else's archive boxes, in the north
   * lane against the blinds.
   *
   * This is the fastest part of the lap — twenty metres of straight glazing at
   * the top speed the model allows — and it is also an open-plan office, where
   * a board off the wall and a stack of files is the most ordinary obstruction
   * imaginable. Heading −π/2 is eastbound, which is the way the line runs
   * along the windows.
   */
  kicker(out, boardKicker(seeded('office.kicker')), 'office.kicker', 49.6, 2.4, -Math.PI / 2);

  // One band of pods down the middle of the room, not two bands with a
  // circulation run between them. The room is thirty metres long and only
  // thirteen and three quarters deep, and a single run of bench pods leaves a
  // lane against the north glazing and a second lane against the core — which
  // is both how a room this proportion is actually laid out and the reason the
  // lap can come out along the windows and back down the other side.
  for (const [i, spineX] of [39.5, 44.0, 48.5, 53.0, 57.5, 62.0].entries()) {
    pod(out, spineX, 4.4, 4, rng, `pod.${i}`);
  }

  // Storage wall along the core, carrying the binder run. Never against the
  // glazing: a wall of cabinets across a window is the one thing no fit-out
  // has ever done.
  const cabinetZ = room.z1 - STORAGE.cabinetDepth / 2 - 0.02;
  for (let i = 0; i < 7; i++) {
    const x = 53.4 + i * (STORAGE.cabinetWidth + 0.02);
    const heightOH = i === 2 || i === 5 ? 3 : 5;
    out.group.add(place(S.cabinet(heightOH), x, 0, cabinetZ, 0));
    for (let shelf = 0; shelf < heightOH; shelf++) {
      if (rng() > 0.82) continue;
      out.group.add(place(S.binderRow(STORAGE.cabinetWidth - 0.05, rng), x, 0.066 + shelf * OH, cabinetZ - 0.02, 0));
    }
    out.collision.push({
      label: `office.storage.${i}`,
      size: [STORAGE.cabinetWidth, heightOH * OH, STORAGE.cabinetDepth],
      centre: [x, (heightOH * OH) / 2, cabinetZ],
    });
  }

  /**
   * Print nook: printer on a low cabinet, paper on top, and the recycling box
   * underneath that never gets emptied.
   *
   * Against the canteen partition between the two openings, where the aisle is
   * a pocket rather than a route and anybody standing at it is out of
   * everyone's way — which is, in fairness, where every print nook in every
   * office of this vintage actually is.
   */
  const printX = room.x0 + 0.55;
  const printZ = 12.6;
  out.group.add(place(S.cabinet(2), printX, 0, printZ, facing('west')));
  out.group.add(place(P.printer(), printX, 2 * OH, printZ, facing('west') + jitter(rng, 0.12)));
  out.group.add(place(S.paperStack(rng), printX, 2 * OH, printZ + 0.5, jitter(rng, 0.6)));
  out.collision.push({
    label: 'office.print',
    size: [STORAGE.cabinetDepth, 2 * OH, STORAGE.cabinetWidth],
    centre: [printX, OH, printZ],
  });

  // A whiteboard on the machine room's blockwork, where the stand-up happens.
  out.group.add(place(P.whiteboard(1.8, 1.2), 50.0, 0.9, room.z1 - 0.06, facing('south')));

  // Plants at the ends of the pod run and in the gaps between the pods, far
  // enough in that a chair pulled right out cannot reach one. A planter nudged
  // on the first frame is a planter somebody put in a walkway.
  for (const [px, pz] of [[41.8, 5.6], [46.2, 9.6], [50.8, 5.2], [55.2, 9.8], [59.8, 5.4], [64.4, 10.6]] as const) {
    out.dynamic.push({
      label: `office.plant.${px}`,
      object: S.plant(rng),
      shape: { kind: 'cylinder', halfHeight: 0.36, radius: 0.16 },
      centreOffset: 0.36,
      mass: 7,
      position: [px, 0, pz],
      yaw: rng() * Math.PI * 2,
      linearDamping: 0.6,
      angularDamping: 0.5,
    });
  }
}

// ---------------------------------------------------------------------------
// Corridors
// ---------------------------------------------------------------------------

/**
 * Corridors, which are never actually empty.
 *
 * A bare corridor is the single most common failure in a generated building,
 * and it is a failure of observation rather than of effort: real circulation
 * space accumulates everything that has nowhere else to go. A photocopier in an
 * alcove, boxes of paper nobody has put away, a cleaner's trolley parked at ten
 * past six, and a notice board with four things on it.
 */
export function dressCorridor(room: Room, out: Dress, rng: Rng): void {
  const cz = (room.z0 + room.z1) / 2;

  if (room.id === 'corridor.west') {
    // The copier alcove. Against the server room's blockwork, because that is
    // the only wall on this run with nothing else happening on it.
    const x = room.x1 - 0.42;
    out.group.add(place(S.cabinet(2), x, 0, 17.0, facing('east')));
    out.group.add(place(P.printer(), x, 2 * OH, 17.0, facing('east') + jitter(rng, 0.1)));
    out.collision.push({ label: 'corridor.west.copier', size: [0.5, 1.05, 0.9], centre: [x, 0.52, 17.0] });

    // Paper, in the boxes it was delivered in and never unpacked from. Five
    // reams to a box, three boxes high, and the top one has been opened.
    const boxes = new THREE.Group();
    const card = new THREE.MeshStandardMaterial({ color: new THREE.Color(0xa08258), roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const box = S.part(boxes, card, [0.32, 0.24, 0.44], [jitter(rng, 0.03), 0.12 + i * 0.25, jitter(rng, 0.03)], 0.008);
      box.rotation.y = jitter(rng, 0.14);
    }
    out.group.add(place(S.paperStack(rng), x - 0.1, 0.77, 18.6, jitter(rng, 0.4)));
    out.group.add(place(boxes, x - 0.1, 0, 18.6, 0));
    out.collision.push({ label: 'corridor.west.paper', size: [0.44, 0.78, 0.34], centre: [x - 0.1, 0.39, 18.6] });

    // On the server room's blockwork, not on the opening into the canteen —
    // the whole north edge of this corridor is a 3.75 m hole.
    out.group.add(place(S.wallClock(), room.x1 - 0.06, 2.15, 19.0, facing('east')));
    out.dynamic.push({
      label: 'corridor.west.plant',
      object: S.plant(rng),
      shape: { kind: 'cylinder', halfHeight: 0.36, radius: 0.16 },
      centreOffset: 0.36,
      mass: 7,
      position: [room.x0 + 0.5, 0, 26.4],
      yaw: rng() * Math.PI * 2,
      linearDamping: 0.6,
      angularDamping: 0.5,
    });
    return;
  }

  if (room.id === 'corridor.east') {
    // A bench under the glazing, where people wait to be collected.
    const bench = new THREE.Group();
    S.part(bench, S.PROP_MAT.melamine, [0.42, 0.04, 1.6], [0, 0.44, 0], 0.008);
    for (const s of [-1, 1] as const) {
      S.part(bench, S.PROP_MAT.metal, [0.38, 0.42, 0.04], [0, 0.21, s * 0.72], 0.006);
    }
    solid(out, bench, 'corridor.east.bench', [0.44, 0.46, 1.7], [room.x1 - 0.4, 0, 22.0]);

    out.dynamic.push({
      label: 'corridor.east.plant',
      object: S.plant(rng),
      shape: { kind: 'cylinder', halfHeight: 0.36, radius: 0.16 },
      centreOffset: 0.36,
      mass: 7,
      position: [room.x1 - 0.5, 0, 17.0],
      yaw: rng() * Math.PI * 2,
      linearDamping: 0.6,
      angularDamping: 0.5,
    });
    out.group.add(place(S.wallClock(0.28), room.x0 + 0.06, 2.15, cz, facing('west')));
    return;
  }

  // The south corridor: long, glazed onto the deck, and the last thing anybody
  // walks down on a Friday.
  const trolley = new THREE.Group();
  S.part(trolley, S.PROP_MAT.darkMetal, [0.5, 0.03, 0.86], [0, 0.32, 0], 0.006);
  S.part(trolley, S.PROP_MAT.darkMetal, [0.5, 0.03, 0.86], [0, 0.86, 0], 0.006);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      S.tube(trolley, S.PROP_MAT.darkMetal, 0.014, 0.014, 0.9, [sx * 0.22, 0.04, sz * 0.4], 8);
      const castor = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 10), S.PROP_MAT.rubber);
      castor.rotation.z = Math.PI / 2;
      castor.position.set(sx * 0.22, 0.035, sz * 0.4);
      trolley.add(castor);
    }
  }
  // The yellow bag on its hoop, and the mop standing in the bucket.
  S.part(trolley, S.PROP_MAT.crate, [0.34, 0.5, 0.3], [0, 0.6, 0.24], 0.02);
  const mop = S.tube(trolley, S.PROP_MAT.melamine, 0.014, 0.014, 1.35, [0.18, 0.34, -0.3], 8);
  mop.rotation.z = 0.14;
  solid(out, trolley, 'corridor.south.trolley', [0.56, 1.0, 0.92], [23.4, 0, cz + 0.6], jitter(rng, 0.25));

  // Notice board on the long blank wall, and the recycling point beside it.
  out.group.add(place(S.wallClock(), 33.0, 2.2, room.z0 + 0.06, facing('north')));

  for (const [px, pz] of [[27.5, room.z1 - 0.55], [37.0, room.z0 + 0.6]] as const) {
    out.dynamic.push({
      label: `corridor.south.plant.${px}`,
      object: S.plant(rng),
      shape: { kind: 'cylinder', halfHeight: 0.36, radius: 0.16 },
      centreOffset: 0.36,
      mass: 7,
      position: [px, 0, pz],
      yaw: rng() * Math.PI * 2,
      linearDamping: 0.6,
      angularDamping: 0.5,
    });
  }
}
