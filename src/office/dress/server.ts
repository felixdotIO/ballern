/**
 * EDV-Raum.
 *
 * Two rack rows facing each other across a cold aisle, split in the middle by a
 * service lane wide enough to get a pallet truck down — which is also the only
 * way through the room, and therefore the shortcut. Racing a chair between two
 * rows of live equipment at head height is the most obviously stupid thing on
 * the lap, and the room earns that by being laid out exactly the way a real one
 * is: hot aisle, cold aisle, service lane, everything on the 600 grid.
 *
 * The room is deliberately not tidy. A comms room that has been in service for
 * five years has a lifted floor tile, a rack somebody left open, cable running
 * where no drawing shows it, and a KVM trolley abandoned mid-job.
 */

import { SERVER } from '../metrics';
import { SERVER_LADDER_Y } from '../ceilings';
import type { Room } from '../plan';
import * as V from '../props/server';
import * as P from '../props/office';
import * as S from '../props/shared';
import { facing, place, solid, looseChair, type Dress } from './common';
import { jitter, range, type Rng } from '../rng';

/** One block of racks bolted together into a suite, with its own collider. */
function rackRow(
  out: Dress,
  x0: number,
  count: number,
  z: number,
  /** π when the fronts face +Z. */
  yaw: number,
  rng: Rng,
  label: string,
): void {
  for (let i = 0; i < count; i++) {
    const x = x0 + (i + 0.5) * SERVER.rackWidth;
    // Roughly half the cabinets still have their doors on. The ones that do not
    // are the ones somebody is currently working in.
    out.group.add(place(V.rack(rng, { door: rng() > 0.45, fill: range(rng, 0.35, 0.95) }), x, 0, z, yaw));

    // Patching drops from the ladder into every third cabinet.
    if (i % 3 === 1) {
      out.group.add(place(V.cableDrop(SERVER_LADDER_Y, SERVER.rackHeight, rng), x, 0, z + (yaw === 0 ? 0.2 : -0.2), 0));
    }
  }

  out.collision.push({
    label,
    size: [count * SERVER.rackWidth, SERVER.rackHeight, SERVER.rackDepth],
    centre: [x0 + (count * SERVER.rackWidth) / 2, SERVER.rackHeight / 2, z],
  });
}

export function dressServer(room: Room, out: Dress, rng: Rng): void {
  // The service lane, straight through the middle, lined up with both doors.
  // Everything else is set out from it.
  const laneWest = 43.0;
  const laneEast = 47.2;

  // Two suites facing each other across a cold aisle, which is the whole point
  // of the layout: cold air comes up between them and hot air goes out the back
  // of both. Getting the fronts facing the wrong way is the tell that somebody
  // has drawn a server room without having stood in one.
  // Five a side, with the service lane down the middle of the room and both
  // doors on its centre line. That the lane, the equipment door and the
  // corridor door all agree is not decoration: it is the only way a rack ever
  // got into this room, and it is why the room can be driven straight through.
  // Four suites in the east half, in two hot/cold pairs.
  rackRow(out, laneEast, 7, 16.6, Math.PI, rng, 'server.suite.a');
  rackRow(out, laneEast, 7, 19.2, 0, rng, 'server.suite.b');
  rackRow(out, laneEast, 7, 24.4, Math.PI, rng, 'server.suite.c');
  rackRow(out, laneEast, 7, 26.0, 0, rng, 'server.suite.d');

  // And three more in the west half, which is what a room this size in a
  // building this age looks like after five years: it does not stay half empty.
  // The floor was laid out for eight suites on the 600 grid and seven of them
  // have been taken, so the space that is left is the service lane and the two
  // metres in front of the CRAC, and nothing else.
  rackRow(out, 37.0, 6, 15.6, Math.PI, rng, 'server.suite.e');
  rackRow(out, 37.0, 6, 18.2, 0, rng, 'server.suite.f');
  rackRow(out, 36.9, 5, 25.8, Math.PI, rng, 'server.suite.g');

  // The comms suite: patch cabinets rather than servers, at the head of the
  // room where the risers come in, doors off and the fibre trays full.
  rackRow(out, 41.2, 3, 26.4, 0, rng, 'server.suite.patch');

  // Cooling and power, against the flank walls where the pipework comes in.
  solid(out, V.crac(), 'server.crac', [SERVER.cracSize[0], SERVER.cracSize[1], SERVER.cracSize[2]], [room.x0 + 0.45, 0, 26.4], facing('west'));
  solid(out, V.ups(), 'server.ups.a', [0.44, 1.3, 0.75], [room.x1 - 0.45, 0, 21.2], facing('east'));
  solid(out, V.ups(), 'server.ups.b', [0.44, 1.3, 0.75], [room.x1 - 0.45, 0, 21.8], facing('east'));
  solid(out, V.ups(), 'server.ups.c', [0.44, 1.3, 0.75], [room.x1 - 0.45, 0, 22.4], facing('east'));
  // Second CRAC on the north wall between the two west suites and the door,
  // because one unit has never cooled a room and the N+1 is the point.
  solid(out, V.crac(), 'server.crac.b', [SERVER.cracSize[0], SERVER.cracSize[1], SERVER.cracSize[2]], [room.x0 + 0.45, 0, 24.0], facing('west'));

  // Löschanlage in the corner furthest from the door, as the standard wants.
  out.group.add(place(V.gasCylinders(3), 51.4, 0, room.z0 + 0.45, 0));
  out.collision.push({ label: 'server.cylinders', size: [0.95, 1.4, 0.3], centre: [51.4, 0.7, room.z0 + 0.45] });
  out.group.add(place(V.gasCylinders(2), 43.6, 0, room.z0 + 0.45, 0));
  out.collision.push({ label: 'server.cylinders.b', size: [0.65, 1.4, 0.3], centre: [43.6, 0.7, room.z0 + 0.45] });

  // Brandmeldezentrale beside the main door, at eye height, where it is legible
  // from the corridor through the vision panel.
  out.group.add(place(V.alarmPanel(), 38.6, 1.55, room.z1 - 0.07, facing('south')));

  // The KVM trolley, left in the lane facing whichever rack was the problem.
  solid(out, V.kvmConsole(), 'server.kvm', [0.72, 1.3, 0.58], [50.0, 0, 21.9], Math.PI + jitter(rng, 0.4));
  solid(out, V.kvmConsole(), 'server.kvm.b', [0.72, 1.3, 0.58], [39.4, 0, 16.9], jitter(rng, 0.5));

  // The lifted tile, and the hole it came out of. There is always exactly one.
  out.group.add(place(V.floorVoid(rng), 48.8, 0, 21.8, 0));
  out.group.add(place(V.liftedTile(rng), 49.4, 0, 22.6, jitter(rng, 0.7)));

  // The stuff nobody has taken away: flattened boxes, spare rails, a pallet of
  // something that arrived in March.
  out.group.add(place(V.serverClutter(rng), 45.4, 0, 26.6, jitter(rng, 0.5)));
  out.collision.push({ label: 'server.clutter', size: [0.8, 0.5, 0.6], centre: [45.4, 0.25, 26.6] });
  out.group.add(place(V.serverClutter(rng), 44.2, 0, 15.0, jitter(rng, 0.9)));
  out.collision.push({ label: 'server.clutter.b', size: [0.8, 0.5, 0.6], centre: [44.2, 0.25, 15.0] });

  // A second lifted tile, and the void it came out of, over by the patch suite
  // where somebody was chasing a cable this afternoon and has not come back.
  out.group.add(place(V.floorVoid(rng), 40.6, 0, 24.6, 0));
  out.group.add(place(V.liftedTile(rng), 41.4, 0, 24.0, jitter(rng, 0.8)));

  // A monitor and keyboard parked on top of the end cabinet, which is where
  // they live between jobs.
  out.group.add(place(S.paperStack(rng), 50.6, SERVER.rackHeight + 0.01, 20.6, jitter(rng, 0.5)));

  // Cable ladder to rack drops at the ends of the suites, so the ladder the
  // ceiling drew is visibly carrying something into something.
  for (const [x, z] of [[25.7, 18.4], [34.3, 20.2]] as const) {
    out.group.add(place(V.cableDrop(SERVER_LADDER_Y, 1.4, rng), x, 0, z, 0));
  }

  // A task chair wheeled in from the office and left in front of the cabinet
  // somebody was working in. It is the only soft thing in the room and it does
  // not belong here, which is exactly why it is the detail that lands.
  looseChair(out, P.taskChair(rng).group, 'server.chair', laneWest + 1.1, 19.6, range(rng, 1.8, 2.6));
}
