/**
 * The socket, and the small amount of state a client keeps about the room.
 *
 * Deliberately dumb. It owns the connection, the guest list, the clock samples and
 * nothing else — no chairs, no seats, no opinion about the race. Everything it
 * learns it hands out through callbacks, so `main.ts` stays the only file that knows
 * how a message becomes a thing happening on the floor.
 *
 * Reconnection is not attempted mid-race and that is a decision rather than an
 * omission. A client that drops out for three seconds and comes back has missed
 * three seconds of other people's poses, which is recoverable, and three seconds of
 * its own driving, which is not — it would arrive holding a position the rest of the
 * room resolved differently. For a beta the honest behaviour is to say the
 * connection went and stop, rather than to rejoin a race that has moved on.
 */

import { createClock, type Clock } from './clock';
import {
  PROTOCOL_VERSION,
  cleanName,
  type ClientMessage,
  type Effect,
  type Member,
  type SeatPose,
  type ServerMessage,
} from './protocol';

/** Where the room server lives. Unset in a checkout with no worker configured. */
export const ROOM_URL: string | undefined =
  (import.meta.env.VITE_ROOM_URL as string | undefined) || undefined;

/** Whether multiplayer can be offered at all. The menu row reads this. */
export const MULTIPLAYER_AVAILABLE = !!ROOM_URL;

export type RoomHandlers = {
  /** The guest list, the host or the connection changed. Redraw the lobby. */
  changed(): void;
  started(message: { seed: number; at: number; seating: { id: string; seat: number }[] }): void;
  pose(pose: SeatPose): void;
  effect(effect: Effect): void;
  lap(seat: number, lap: number, time: number, finished: boolean): void;
};

export type Room = {
  readonly clock: Clock;
  readonly code: string;
  readonly you: string;
  readonly members: readonly Member[];
  readonly connected: boolean;
  readonly error: string | null;
  isHost(): boolean;
  /** Your own row in the guest list, once the room has acknowledged you. */
  me(): Member | null;

  pick(rider: number, ride: number): void;
  setReady(ready: boolean): void;
  start(): void;
  sendPose(pose: SeatPose): void;
  sendEffect(effect: Effect): void;
  sendLap(seat: number, lap: number, time: number, finished: boolean): void;
  leave(): void;
};

/** Ping this often while the lobby is open, to keep the clock estimate fresh. */
const PING_EVERY = 2000;

export function joinRoom(
  code: string,
  identity: { name: string; rider: number; ride: number },
  handlers: RoomHandlers,
): Room {
  if (!ROOM_URL) throw new Error('no room server configured (VITE_ROOM_URL)');

  const clock = createClock();
  const socket = new WebSocket(`${ROOM_URL.replace(/\/$/, '')}/room/${code}`);

  let you = '';
  let host = '';
  let members: Member[] = [];
  let connected = false;
  let error: string | null = null;
  let pings = 0;
  let pinger: ReturnType<typeof setInterval> | null = null;

  const send = (message: ClientMessage): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  socket.addEventListener('open', () => {
    connected = true;
    send({
      type: 'hello',
      version: PROTOCOL_VERSION,
      name: cleanName(identity.name),
      rider: identity.rider,
      ride: identity.ride,
    });
    pinger = setInterval(() => {
      const id = ++pings;
      clock.sent(id);
      send({ type: 'ping', id });
    }, PING_EVERY);
    // One straight away, so the clock has something before the first interval.
    const first = ++pings;
    clock.sent(first);
    send({ type: 'ping', id: first });
    handlers.changed();
  });

  socket.addEventListener('message', (event) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case 'welcome':
        you = msg.you;
        host = msg.host;
        members = msg.members;
        handlers.changed();
        return;
      case 'members':
        host = msg.host;
        members = msg.members;
        handlers.changed();
        return;
      case 'start':
        handlers.started(msg);
        return;
      case 'pose':
        handlers.pose(msg.pose);
        return;
      case 'effect':
        handlers.effect(msg.effect);
        return;
      case 'lap':
        handlers.lap(msg.seat, msg.lap, msg.time, msg.finished);
        return;
      case 'pong':
        clock.heard(msg.id, msg.server);
        return;
      case 'left':
        members = members.filter((m) => m.id !== msg.id);
        handlers.changed();
        return;
      case 'error':
        error = msg.reason;
        handlers.changed();
        return;
    }
  });

  const shut = (reason: string | null): void => {
    connected = false;
    if (pinger !== null) clearInterval(pinger);
    pinger = null;
    if (reason && !error) error = reason;
    handlers.changed();
  };

  socket.addEventListener('close', () => shut('The room closed the connection.'));
  socket.addEventListener('error', () => shut('Could not reach the room server.'));

  return {
    clock,
    code,
    get you() {
      return you;
    },
    get members() {
      return members;
    },
    get connected() {
      return connected;
    },
    get error() {
      return error;
    },
    isHost() {
      return !!you && you === host;
    },
    me() {
      return members.find((m) => m.id === you) ?? null;
    },
    pick: (rider, ride) => send({ type: 'pick', rider, ride }),
    setReady: (ready) => send({ type: 'ready', ready }),
    start: () => send({ type: 'start' }),
    sendPose: (pose) => send({ type: 'pose', pose }),
    sendEffect: (effect) => send({ type: 'effect', effect }),
    sendLap: (seat, lap, time, finished) => send({ type: 'lap', seat, lap, time, finished }),
    leave() {
      shut(null);
      try {
        socket.close(1000, 'left');
      } catch {
        /* already gone */
      }
    },
  };
}

/** A fresh room code. Only the creator makes one; joiners are given it. */
export function newRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
