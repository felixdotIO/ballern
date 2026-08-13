/**
 * The room server: one Durable Object per room code.
 *
 * ---- why a Durable Object and not a box with node on it -------------------
 *
 * A room is a small piece of state that a handful of sockets have to agree on, and
 * "one addressable object, single-threaded, that WebSockets can be attached to" is
 * precisely what a Durable Object is. The room code maps to the object's id, so
 * `/room/ABCD` is the room — no registry, no lookup, no lock. When nobody is racing,
 * hibernation puts it away and it costs nothing.
 *
 * The game is a static Vite build and can live on Netlify, which cannot host this:
 * Functions and Edge Functions are request-response, and a race is a socket held
 * open for four minutes. Hence one small always-on thing, somewhere else.
 *
 * ---- what it does and does not do -----------------------------------------
 *
 * It is a relay with a guest list. It knows who is in the room, who the host is, and
 * how to pass a message on. It knows nothing about chairs, laps, items or the
 * building, and it must stay that way: the moment the room server has an opinion
 * about the race, it needs the floorplate, the physics and four megabytes of
 * geometry in order to have it.
 *
 * The two things it does enforce are the two that are not the game: **only the host
 * may start or hand out effects**, and **two people may not pick the same driver**.
 * Both are cheap here and both are miserable to resolve after the fact.
 */

import {
  CODE_ALPHABET,
  CODE_LENGTH,
  NAME_MAX,
  PROTOCOL_VERSION,
  type ClientMessage,
  type Member,
  type ServerMessage,
} from '../src/net/protocol';

export type Env = { ROOMS: DurableObjectNamespace };

/** The most chairs the grid holds. See `GRID_SLOTS` — it is the floor's limit. */
const CAPACITY = 5;

/** Per-connection bookkeeping the guest list does not need to carry. */
type Attachment = {
  id: string;
  /**
   * When this connection said hello, as a room-local ordering key.
   *
   * `getWebSockets()` makes no promise about order — measured, it comes back
   * newest-first — so "the oldest connection" cannot be read off it. Without a key
   * of its own, host succession picks whoever joined *last* and the grid is dealt
   * backwards. Stamped at hello rather than at accept, because a socket that has not
   * introduced itself is not in the room yet.
   */
  joined: number;
  name: string;
  rider: number;
  ride: number;
  ready: boolean;
  seat: number;
};

export class Room {
  private readonly state: DurableObjectState;
  /** Who is host. The oldest connection still open; see `electHost`. */
  private host: string | null = null;
  private code = '';

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.code = url.pathname.split('/').filter(Boolean).pop() ?? '';

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Hibernation rather than a held reference: an idle room should cost nothing,
    // and a race that goes quiet for a minute must not be evicted mid-lap.
    this.state.acceptWebSocket(server);

    const id = crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id, joined: 0, name: '', rider: -1, ride: 0, ready: false, seat: -1 } satisfies Attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // -- the guest list -------------------------------------------------------

  private sockets(): WebSocket[] {
    return this.state.getWebSockets();
  }

  private attach(ws: WebSocket): Attachment | null {
    return (ws.deserializeAttachment() as Attachment | null) ?? null;
  }

  private members(except?: WebSocket): Member[] {
    const out: (Member & { joined: number })[] = [];
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      const a = this.attach(ws);
      // A socket that has not said hello yet is connected but not *present* — it has
      // no name and no driver, and putting it in the list makes an empty row appear
      // in everybody's lobby for as long as the handshake takes.
      if (a && a.rider >= 0) out.push({ ...a });
    }
    // Join order, so the list is the same on every screen and the grid is dealt in
    // the order people arrived. See `Attachment.joined`.
    out.sort((x, y) => x.joined - y.joined || (x.id < y.id ? -1 : 1));
    return out.map(({ joined: _joined, ...m }) => m);
  }

  /**
   * The host is whoever has been here longest.
   *
   * Read off `members()`, which sorts by `joined` — *not* off `getWebSockets()`,
   * which measured comes back newest-first and would hand the room to whoever
   * arrived last. Sticky while the incumbent is still connected, so a new arrival
   * never takes the room off the person already running it.
   *
   * Succession is automatic on a disconnect, but note that a *race* does not survive
   * its host leaving: the host is the machine simulating the computer's chairs and
   * adjudicating items, and a new one cannot pick that up mid-lap. The beta says so
   * out loud rather than pretending otherwise.
   */
  private electHost(except?: WebSocket): void {
    const present = this.members(except);
    if (!present.length) {
      this.host = null;
      return;
    }
    if (this.host && present.some((m) => m.id === this.host)) return;
    this.host = present[0]!.id;
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A socket that has gone away is not an error worth unwinding a broadcast for.
    }
  }

  private broadcast(message: ServerMessage, except?: WebSocket): void {
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      const a = this.attach(ws);
      if (!a || a.rider < 0) continue;
      this.send(ws, message);
    }
  }

  private announce(except?: WebSocket): void {
    this.electHost(except);
    this.broadcast({ type: 'members', host: this.host ?? '', members: this.members(except) }, except);
  }

  // -- messages -------------------------------------------------------------

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    const me = this.attach(ws);
    if (!me) return;

    switch (msg.type) {
      case 'hello': {
        if (msg.version !== PROTOCOL_VERSION) {
          this.send(ws, { type: 'error', reason: 'This room is running a different version of the game.' });
          ws.close(1002, 'version');
          return;
        }
        if (this.members().length >= CAPACITY && me.rider < 0) {
          this.send(ws, { type: 'error', reason: 'That room is full.' });
          ws.close(1000, 'full');
          return;
        }
        me.joined = Date.now();
        me.name = String(msg.name ?? '').slice(0, NAME_MAX);
        me.rider = this.freeRider(msg.rider, me.id);
        me.ride = msg.ride | 0;
        ws.serializeAttachment(me);
        this.electHost();
        this.send(ws, {
          type: 'welcome',
          you: me.id,
          host: this.host ?? '',
          room: this.code,
          members: this.members(),
        });
        this.announce();
        return;
      }

      case 'pick': {
        me.rider = this.freeRider(msg.rider, me.id);
        me.ride = msg.ride | 0;
        // Changing your mind un-readies you. Otherwise somebody can be marked ready
        // for a driver they are no longer sitting on.
        me.ready = false;
        ws.serializeAttachment(me);
        this.announce();
        return;
      }

      case 'ready': {
        me.ready = !!msg.ready;
        ws.serializeAttachment(me);
        this.announce();
        // Everybody said yes, so nothing is waiting on anything. Pressing ready and
        // then watching for somebody else to press a second button is a room full of
        // people looking at each other.
        const present = this.members();
        if (present.length && present.every((m) => m.ready)) this.begin();
        return;
      }

      case 'start': {
        // The host may go without waiting — somebody is always still picking a chair.
        if (me.id !== this.host) return;
        this.begin();
        return;
      }

      case 'pose': {
        // Relayed unopened. The room has no way to judge whether a pose is true and
        // no business trying: a client owns its own chair.
        this.broadcast({ type: 'pose', pose: msg.pose }, ws);
        return;
      }

      case 'effect': {
        if (me.id !== this.host) return;
        this.broadcast({ type: 'effect', effect: msg.effect }, ws);
        return;
      }

      case 'lap': {
        this.broadcast(
          { type: 'lap', seat: msg.seat, lap: msg.lap, time: msg.time, finished: msg.finished },
          ws,
        );
        return;
      }

      case 'ping': {
        this.send(ws, { type: 'pong', id: msg.id, server: Date.now() / 1000 });
        return;
      }
    }
  }

  /**
   * Deal the grid and drop the flag.
   *
   * Reached two ways — everybody readying up, or the host going without them — and
   * it has to be the same code both times, because what it settles is what the race
   * *is*: who is in which seat, and the instant it begins.
   *
   * Ready flags are cleared on the way out, so the race that just started cannot
   * immediately start again when the next `ready` arrives.
   */
  private begin(): void {
    const present = this.members();
    if (!present.length) return;
    // Lobby order is grid order: first in, first slot.
    const seating = present.map((m, i) => ({ id: m.id, seat: i }));
    for (const ws of this.sockets()) {
      const a = this.attach(ws);
      if (!a) continue;
      const seat = seating.find((s) => s.id === a.id);
      a.seat = seat ? seat.seat : -1;
      a.ready = false;
      ws.serializeAttachment(a);
    }
    this.broadcast({
      type: 'start',
      seed: (Math.random() * 0xffffffff) >>> 0,
      /*
       * Far enough out that the slowest client has the message before it fires, and
       * no further. It was a second and a half, which is a second and a half of
       * nothing on screen before a countdown that is itself a wait — the two
       * together were most of why starting a race felt slow. 600 ms covers a
       * transatlantic round trip with room to spare, and the countdown absorbs
       * whatever skew is left.
       */
      at: Date.now() / 1000 + 0.6,
      seating,
    });
  }

  /**
   * The driver somebody asked for, or the nearest one nobody else has.
   *
   * Uniqueness is enforced rather than negotiated: the roster is seven and the grid
   * is five, so there is always a free one, and two identical drivers on a grid is a
   * race you cannot follow. Handing back a different index than was asked for is
   * fine — the lobby redraws from the guest list, so the client sees what it got.
   */
  private freeRider(wanted: number, mine: string): number {
    const taken = new Set(
      this.members().filter((m) => m.id !== mine).map((m) => m.rider),
    );
    const start = Number.isInteger(wanted) && wanted >= 0 ? wanted : 0;
    for (let i = 0; i < 7; i++) {
      const candidate = (start + i) % 7;
      if (!taken.has(candidate)) return candidate;
    }
    return start;
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const me = this.attach(ws);
    if (me) this.broadcast({ type: 'left', id: me.id }, ws);
    // Excluded explicitly: a closing socket is still in `getWebSockets()` at this
    // point, so without this the guest list that goes out still has the person who
    // just left on it — and the last word everyone hears is the wrong one.
    this.announce(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] !== 'room' || !parts[1]) {
      return new Response('ballern rooms', { status: 200 });
    }

    const code = parts[1].toUpperCase();
    const valid =
      code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));
    if (!valid) return new Response('bad room code', { status: 400 });

    // The code *is* the address. Same letters, same object, anywhere in the world.
    const id = env.ROOMS.idFromName(code);
    return env.ROOMS.get(id).fetch(new Request(new URL(`/room/${code}`, url), request));
  },
};
