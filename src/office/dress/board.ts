/**
 * Besprechungsraum, and the Projektraum at the other end of the middle band,
 * which is the same solver because it is the same room with a different sign on
 * the door.
 *
 * The table runs the long way down whichever axis the room is long on, pushed
 * off centre toward the blank wall — so the shortcut through here is a genuine
 * decision rather than a straight corridor with furniture beside it. You come in
 * at one corner, you have several metres of veneer in the way, and the only line
 * through is round it.
 *
 * Both rooms are entered at one corner and left at the opposite one, so which
 * wall is blank matters more than it looks: the screen and the credenza go on
 * it, and the racing line goes down the other side. `firstBacking` is asked
 * rather than told, because the board room's south wall is plasterboard and the
 * project room's is glass, and nothing is ever fixed to a Systemtrennwand.
 *
 * The room was cleared after the last meeting and then half re-set for the next
 * one, which is the state a meeting room is in for most of its life: the chairs
 * squared up, the glasses out, and one chair still turned away from the table
 * where somebody sat sideways to talk to the room.
 */

import { BOARD } from '../metrics';
import type { Room } from '../plan';
import * as B from '../props/board';
import * as S from '../props/shared';
import { facing, place, solid, looseChair, type Dress } from './common';
import { jitter, range, type Rng } from '../rng';

export function dressBoard(room: Room, out: Dress, rng: Rng): void {
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;

  // Which way the table runs. A room narrower than about twelve metres cannot
  // take a six-metre table across it and still be walked round at both ends, so
  // in a narrow one the table runs down the room instead of across it. That is
  // not a compromise — it is what a long thin meeting room is always laid out
  // as, and it is why the two rooms in this band do not read as the same room.
  const width = room.x1 - room.x0;
  const depth = room.z1 - room.z0;
  const alongZ = width < 12;
  const span = alongZ ? depth : width;
  const tableLength = Math.min(BOARD.tableLength, span - 4.6);

  // Pushed toward the blank wall, leaving the run past it on the other side.
  const tx = alongZ ? room.x0 + 2.6 : cx;
  const tz = cz;

  // The table's long axis and the direction across it, so the seating below is
  // written once rather than twice.
  const ax = alongZ ? 0 : 1;
  const az = alongZ ? 1 : 0;
  const lx = alongZ ? 1 : 0;
  const lz = alongZ ? 0 : 1;
  const at = (u: number, v: number): [number, number] => [tx + ax * u + lx * v, tz + az * u + lz * v];

  // The prop's own origin runs down -Z, so it only needs turning when the table
  // is running across the room.
  out.group.add(place(B.conferenceTable(tableLength), tx, 0, tz, alongZ ? 0 : Math.PI / 2));
  out.collision.push({
    label: 'board.table',
    size: alongZ
      ? [BOARD.tableWidth, BOARD.tableHeight, tableLength]
      : [tableLength, BOARD.tableHeight, BOARD.tableWidth],
    centre: [tx, BOARD.tableHeight / 2, tz],
  });

  // Seats down both sides at the pitch the chairs actually take, plus one at
  // each end.
  const perSide = Math.max(2, Math.floor(tableLength / BOARD.seatPitch) - 1);
  const seatYaw = (side: -1 | 1) => (alongZ ? side * -Math.PI / 2 : side === -1 ? 0 : Math.PI);

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < perSide; i++) {
      const u = -((perSide - 1) / 2) * BOARD.seatPitch + i * BOARD.seatPitch;
      // Most are squared up against the table; one or two got left turned out.
      const turned = rng() > 0.82;
      const pull = turned ? range(rng, 0.25, 0.5) : range(rng, -0.02, 0.1);
      const [x, z] = at(u + jitter(rng, 0.05), side * (BOARD.tableWidth / 2 + 0.42 + pull));
      looseChair(
        out,
        B.conferenceChair(rng),
        `board.chair.${side}.${i}`,
        x,
        z,
        seatYaw(side) + (turned ? jitter(rng, 1.6) : jitter(rng, 0.07)),
        14,
        0.33,
      );
    }
    // The end chairs, which are the ones that matter.
    const [ex, ez] = at(side * (tableLength / 2 + 0.45), jitter(rng, 0.06));
    looseChair(
      out,
      B.conferenceChair(rng),
      `board.chair.end.${side}`,
      ex,
      ez,
      seatYaw(side) + Math.PI / 2,
      14,
      0.33,
    );
  }

  // Place settings, but only where somebody was actually sitting. A fully laid
  // table reads as a photograph; a half-laid one reads as a Tuesday.
  for (let i = 0; i < perSide; i++) {
    for (const side of [-1, 1] as const) {
      if (rng() > 0.55) continue;
      const u = -((perSide - 1) / 2) * BOARD.seatPitch + i * BOARD.seatPitch;
      const [x, z] = at(u, side * (BOARD.tableWidth / 2 - 0.28));
      out.group.add(place(B.placeSetting(rng), x, BOARD.tableHeight, z, seatYaw(side)));
      if (rng() > 0.5) {
        const [gx, gz] = at(u + jitter(rng, 0.12), side * (BOARD.tableWidth / 2 - 0.52));
        out.group.add(place(B.tumbler(), gx, BOARD.tableHeight, gz, 0));
      }
    }
  }

  // Water down the middle, and the spider in the exact centre where it lives.
  for (const du of [-tableLength / 3, 0.4, tableLength / 3]) {
    const [x, z] = at(du + jitter(rng, 0.1), jitter(rng, 0.08));
    out.group.add(place(B.carafe(), x, BOARD.tableHeight, z, 0));
  }
  out.group.add(place(B.conferencePhone(), tx, BOARD.tableHeight, tz, jitter(rng, 0.6)));

  // ---- the blank wall -------------------------------------------------------
  // Screen, credenza and beamer all belong to the one wall in the room with no
  // glass and no door in it, which on this band is the west one in both rooms.
  const blankX = room.x0 + 0.09;
  out.group.add(place(B.projectionScreen(), blankX, 0, cz - 2.4, facing('west')));
  out.group.add(place(B.beamer(0.35), tx, room.ceiling, tz, alongZ ? 0 : Math.PI / 2));

  const credZ = cz + 2.6;
  solid(out, B.credenza(2.4), 'board.credenza', [BOARD.credenzaDepth, BOARD.credenzaHeight, 2.4], [room.x0 + BOARD.credenzaDepth / 2 + 0.04, 0, credZ], facing('west'));
  for (let i = 0; i < 6; i++) {
    out.group.add(place(B.tumbler(), room.x0 + BOARD.credenzaDepth / 2 + 0.04, BOARD.credenzaHeight, credZ - 0.9 + i * 0.14, 0));
  }

  // Flipchart in the corner by the screen. No pin wall: the south elevation is
  // the corridor wall with the doors in it, and a 2.4 m board hung on it lands
  // across a doorway — which is what it was doing.
  solid(out, B.flipchart(rng), 'board.flipchart', [0.7, 1.75, 0.5], [room.x0 + 0.9, 0, room.z0 + 1.1], range(rng, 0.4, 0.9));

  out.group.add(place(S.wallClock(0.3), blankX - 0.01, 2.2, room.z1 - 1.4, facing('west')));

  // One large plant in the corner behind the head of the table, which is where
  // the good plant always goes.
  out.dynamic.push({
    label: 'board.plant',
    object: S.plant(rng, { scale: 1.25, smart: true }),
    shape: { kind: 'cylinder', halfHeight: 0.4, radius: 0.2 },
    centreOffset: 0.4,
    mass: 11,
    position: [room.x0 + 0.7, 0, room.z1 - 0.8],
    yaw: rng() * Math.PI * 2,
    linearDamping: 0.6,
    angularDamping: 0.5,
  });
}
