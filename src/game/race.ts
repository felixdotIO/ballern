/**
 * Three laps of a German office floor, timed.
 *
 * The rules are the ones every racing game has agreed on since Pole Position,
 * and they are worth stating because getting any of them subtly wrong is the
 * difference between a track and a room you drive around in:
 *
 *  - The lap counts when you cross the line having actually driven a lap's worth
 *    of road to get there. See `completeLap` for why that replaced a checkpoint
 *    sequence, and what the sequence was doing wrong.
 *  - The clock starts on GO and never stops until the last crossing.
 *  - A lap's time is the gap between two crossings of the line, not the sum of
 *    anything. Timing has to survive a crash, a reverse and a reset.
 *  - The final lap ends the moment the finish plane is crossed, not on the frame
 *    the renderer notices — which is why crossings are resolved by intersecting
 *    the segment the chair actually travelled this substep.
 *
 * That last point is the whole reason this runs inside the fixed physics step
 * rather than on the frame. At 8.6 m/s and 120 Hz the chair moves 72 mm a
 * substep; resolving the crossing to the segment puts the recorded time within
 * about 8 ms of the truth, and resolving it to the frame would put it within 17
 * on a good frame and 50 on a bad one. A lap timer that depends on your frame
 * rate is not a lap timer.
 */

import type * as THREE from 'three';

import { GATES, LAPS, ROUTE } from '../office/plan';

export type Phase =
  /** On the grid, engine off, clock at zero. */
  | 'grid'
  /** Counting down. The chair is held; the clock still is not running. */
  | 'countdown'
  | 'racing'
  | 'finished';

export type Race = {
  /**
   * Advance by one fixed substep. Call from inside the physics step.
   *
   * `road` is how far along the route the chair has driven, in metres from the
   * start line. It is what a lap is now counted in — see `completeLap`.
   */
  update(
    h: number,
    x: number,
    y: number,
    z: number,
    headingX: number,
    headingZ: number,
    speed: number,
    road: number,
  ): void;
  /** Leave the grid. Ignored unless we are on it. */
  start(): void;
  /** Back to the grid, clock cleared. */
  reset(): void;

  readonly phase: Phase;
  /** True while the player should be allowed to drive. */
  readonly live: boolean;
  /** Seconds left on the countdown, for the numbers on screen. */
  readonly countdown: number;
  /** 1-based, and clamped to LAPS once finished. */
  readonly lap: number;
  readonly laps: number;
  /** Elapsed on the current lap, seconds. */
  readonly lapTime: number;
  readonly totalTime: number;
  /** Every completed lap, in order. */
  readonly splits: readonly number[];
  readonly best: number | null;
  /**
   * The next named place on the route, as an index into GATES.
   *
   * A signpost, not a rule. Nothing is required of it, nothing is invalidated by
   * missing it, and it is derived from how far round you are rather than from a
   * sequence you have to satisfy — see the note above `completeLap`.
   */
  readonly gate: number;
  /** Where that gate is. */
  readonly gateAt: readonly [number, number];
  /** And which floor it stands on, which is not always the one you are on. */
  readonly gateLevel: number;
  /**
   * What the guidance chevron should point at: a few metres past the gate,
   * along the way through it.
   *
   * Aiming at the gate itself makes the chevron useless exactly where it is
   * needed — the bearing to a point you are two metres from swings through
   * ninety degrees in a heartbeat, so the arrow spins as you arrive. Aiming
   * through the gate keeps it steady on approach and hands you the exit line on
   * the way out, which is the thing you actually wanted to know.
   */
  readonly gateAim: readonly [number, number];
  /** Driving against the route. Purely advisory — nothing is invalidated. */
  readonly wrongWay: boolean;
  /**
   * Set on the substep a lap is completed and cleared once read, so the HUD can
   * flash a split without having to diff the array itself.
   */
  takeSplit(): { lap: number; time: number; best: boolean } | null;
};

/**
 * How long one numeral of the 3-2-1 is on screen, seconds.
 *
 * It used to be a whole second, implicitly — the countdown was three seconds and the
 * number shown was `ceil` of what was left, so the beat and the unit were the same
 * thing and neither could move without the other. Three seconds of waiting is a long
 * time in front of a grid you are already looking at, and on top of the room's own
 * lead-in it was most of why starting felt slow.
 *
 * 0.62 is about as quick as three numerals can go and still be read as three rather
 * than as a flicker: near enough a beat at 96 bpm, which is the rate a person counts
 * themselves in at. The whole thing is now under two seconds.
 */
export const BEAT = 0.62;

/**
 * Seconds of 3-2-1 before the clock starts.
 *
 * Three beats exactly, so the first frame reads 3 rather than 4. The GO is not part
 * of it — it belongs to the first moment of the race, not to the last of the wait.
 */
const COUNTDOWN = BEAT * 3;

/** How far past a gate the guidance chevron aims. */
const AIM_THROUGH = 6;

/** How far off the line you may be and still be reversing, before we say so. */
const WRONG_WAY_SPEED = 1.6;
/** And how long you have to keep doing it. Stops a spin reading as a mistake. */
const WRONG_WAY_GRACE = 0.9;

/**
 * How far above or below a gate's own floor you may be and still cross it.
 *
 * Half a storey, near enough: generous enough that a chair airborne off a kerb
 * or still settling onto a slab takes the gate it obviously went through, and
 * tight enough that the two levels of the Parkhaus can never be confused for
 * each other. Without it the deck's aisle gate and Ebene 5's are the same
 * plane, and three laps of the top deck is a legal race.
 */
const GATE_BAND = 1.35;

/**
 * How much a metre of height counts for against a metre in plan when deciding
 * which bit of the route you are on.
 *
 * Three, and it is not a nicety. The deck's aisle and Ebene 5's out lane are
 * three hundred millimetres apart on the map, three metres apart in the
 * building, and driven in opposite directions. Weighted at one they are
 * effectively the same segment and a perfect lap of the aisle reports as
 * driving the wrong way; weighted at three the level you are actually on wins
 * by a mile and the test goes back to being about direction.
 */
const LEVEL_WEIGHT = 3;

/**
 * Which route segment a point is nearest, and how far along it.
 *
 * Only used for the wrong-way test, so it can be the naive O(n) scan: sixty
 * segments, once per substep, is nothing next to the solver it sits inside.
 */
function routeHeading(x: number, y: number, z: number, out: [number, number]): void {
  let bestD = Infinity;
  let bestI = 0;
  let bestT = 0;

  for (let i = 0; i < ROUTE.length; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[(i + 1) % ROUTE.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const dy = b[2] - a[2];
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    const px = a[0] + dx * t - x;
    const pz = a[1] + dz * t - z;
    const py = (a[2] + dy * t - y) * LEVEL_WEIGHT;
    const d = px * px + pz * pz + py * py;
    if (d < bestD) {
      bestD = d;
      bestI = i;
      bestT = t;
    }
  }

  const a = ROUTE[bestI]!;
  const b = ROUTE[(bestI + 1) % ROUTE.length]!;
  let dx = b[0] - a[0];
  let dz = b[1] - a[1];

  // Right on a vertex the tangent of one segment is a poor guide — you are in
  // the corner, and the corner is where the next segment already matters.
  if (bestT > 0.92) {
    const c = ROUTE[(bestI + 2) % ROUTE.length]!;
    dx += c[0] - b[0];
    dz += c[1] - b[1];
  }

  const len = Math.hypot(dx, dz) || 1;
  out[0] = dx / len;
  out[1] = dz / len;
}

/**
 * How far along the route each gate stands, in metres from the start line.
 *
 * Computed once off the polyline rather than authored, because a gate's arc
 * length is not a fact anybody should have to keep in step by hand: move a wall
 * in `plan.ts`, the route bends, and these follow.
 *
 * Only the signpost uses them now. They are what lets "the next place you are
 * heading for" be a question about where you are, rather than about which planes
 * you have satisfied.
 */
const GATE_S: number[] = (() => {
  let cum = 0;
  const at: number[] = [];
  const marks = GATES.map(() => ({ s: 0, d: Infinity }));
  for (let i = 0; i < ROUTE.length; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[(i + 1) % ROUTE.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    // Sampled rather than solved: 0.5 m is far finer than any decision made off
    // the result, and it keeps this to eight lines nobody has to re-derive.
    for (let t = 0; t < len; t += 0.5) {
      const k = len > 1e-6 ? t / len : 0;
      const px = a[0] + (b[0] - a[0]) * k;
      const pz = a[1] + (b[1] - a[1]) * k;
      const py = a[2] + (b[2] - a[2]) * k;
      for (let g = 0; g < GATES.length; g++) {
        const gate = GATES[g]!;
        const dy = (py - (gate.y ?? 0)) * LEVEL_WEIGHT;
        const d = (px - gate.at[0]) ** 2 + (pz - gate.at[1]) ** 2 + dy * dy;
        if (d < marks[g]!.d) {
          marks[g]!.d = d;
          marks[g]!.s = cum + t;
        }
      }
    }
    cum += len;
  }
  for (const m of marks) at.push(m.s);
  return at;
})();

/** Total length of one lap of the racing line, in metres. */
const LAP_LENGTH: number = (() => {
  let cum = 0;
  for (let i = 0; i < ROUTE.length; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[(i + 1) % ROUTE.length]!;
    cum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return cum;
})();

/**
 * How much of a lap you must have driven for a crossing of the line to count.
 *
 * Three quarters, and the slack is deliberate. The road figure is a projection
 * onto the racing line, so cutting a corner tightly measures a little short of
 * the line's own length, and demanding the full distance would refuse a lap
 * somebody genuinely drove. Three quarters is far more than any legal line can
 * save and far less than any shortcut worth taking would skip.
 */
const LAP_SHARE = 0.75;

export function createRace(): Race {
  let phase: Phase = 'grid';
  let countdown = COUNTDOWN;
  let lap = 1;
  let lapTime = 0;
  let totalTime = 0;
  let gate = 1;
  let wrongWayFor = 0;
  let splits: number[] = [];
  let best: number | null = null;
  let pending: { lap: number; time: number; best: boolean } | null = null;

  // The previous substep's position, so a crossing is a segment against a plane
  // rather than a point on one side of it.
  /** Road distance at the last counted crossing. What a lap is measured from. */
  let roadAtLap = 0;

  let px = 0;
  let pz = 0;
  let seeded = false;

  const tangent: [number, number] = [1, 0];

  /**
   * Did the segment from (px,pz) to (x,z) pass through gate `g` the right way?
   *
   * The lateral test is against the *crossing point*, not against either end.
   * Testing the endpoints lets a chair clip the corner of a doorway at speed and
   * register a gate it never actually went through.
   *
   * Height is tested first and against the chair rather than against the
   * segment, because it is not a near-miss question: you are either on the gate's
   * level or on a different one, and a gate is only ever asked about when it is
   * the one being looked for.
   */
  function crossed(g: (typeof GATES)[number], x: number, y: number, z: number): boolean {
    if (Math.abs(y - (g.y ?? 0)) > GATE_BAND) return false;

    const nx = g.normal[0];
    const nz = g.normal[1];
    const before = (px - g.at[0]) * nx + (pz - g.at[1]) * nz;
    const after = (x - g.at[0]) * nx + (z - g.at[1]) * nz;
    if (before >= 0 || after < 0) return false;

    const t = before === after ? 0 : before / (before - after);
    const hitX = px + (x - px) * t;
    const hitZ = pz + (z - pz) * t;
    // Across the plane: the normal turned ninety degrees.
    const lateral = (hitX - g.at[0]) * -nz + (hitZ - g.at[1]) * nx;
    return Math.abs(lateral) <= g.halfWidth;
  }

  /**
   * ---- why the checkpoints are gone ----------------------------------------
   *
   * The rule used to be: cross all fourteen gates, in order, the right way
   * round. It is the classic answer and it was quietly ruining races.
   *
   * A gate is an invisible plane of a fixed width, and several of them were
   * barely wider than the chair — "Open Plan South" was 2.9 m, in an open-plan
   * room, where there is no doorway to justify any particular number. Only the
   * *expected* gate was ever tested, so missing one did not cost you a gate, it
   * jammed the sequence for the rest of the race: you could drive three perfect
   * laps afterwards and the counter would never move again. Simulated on the
   * real route, driving 1.5 m off the racing line — about one chair's width, in
   * a room the size of a tennis court — completed **zero** laps out of three,
   * and there was nothing on screen to say why.
   *
   * So the lap is counted in the one quantity that is already continuous,
   * already correct, and already trusted by the standings: distance driven
   * along the route. Cross the line having driven a lap's worth of road, and it
   * is a lap. Reversing over the line gains nothing, because road goes *down*
   * when you drive backwards. Cutting across the floorplate gains nothing,
   * because road is measured on the route and the nearest-point search is
   * windowed — it does not follow a chair that teleports across a room.
   *
   * The plane crossing survives, and only for what it was always best at:
   * stamping the exact moment. Resolving the finish to the segment the chair
   * travelled puts the recorded time within about 8 ms, which is the whole
   * argument at the top of this file. What it no longer does is decide whether
   * the lap was legal.
   */
  function completeLap(): void {
    const time = lapTime;
    splits.push(time);
    const isBest = best === null || time < best;
    if (isBest) best = time;
    pending = { lap: splits.length, time, best: isBest };

    if (splits.length >= LAPS) {
      phase = 'finished';
      lap = LAPS;
    } else {
      lap = splits.length + 1;
      lapTime = 0;
    }
  }

  return {
    update(h, x, y, z, headingX, headingZ, speed, road) {
      if (!seeded) {
        px = x;
        pz = z;
        roadAtLap = road;
        seeded = true;
      }

      if (phase === 'countdown') {
        countdown -= h;
        if (countdown <= 0) {
          countdown = 0;
          phase = 'racing';
        }
      }

      if (phase === 'racing') {
        lapTime += h;
        totalTime += h;

        /*
         * One plane, and a distance to justify it. GATES[0] is the finish line;
         * nothing else is tested any more, by anything.
         */
        if (crossed(GATES[0]!, x, y, z) && road - roadAtLap >= LAP_LENGTH * LAP_SHARE) {
          roadAtLap = road;
          completeLap();
        }

        /*
         * And the signpost follows the chair rather than leading it: the next
         * named place is simply the first one further round the lap than you
         * are. It cannot jam, because there is no state in it to jam — miss a
         * doorway and it names the one after, which is what a sign should do.
         */
        const round = ((road % LAP_LENGTH) + LAP_LENGTH) % LAP_LENGTH;
        let next = 0;
        for (let i = 0; i < GATE_S.length; i++) {
          if (GATE_S[i]! > round) {
            next = i;
            break;
          }
        }
        gate = next;

        routeHeading(x, y, z, tangent);
        const against = headingX * tangent[0] + headingZ * tangent[1] < -0.35;
        wrongWayFor = against && speed > WRONG_WAY_SPEED ? wrongWayFor + h : 0;
      } else {
        wrongWayFor = 0;
      }

      px = x;
      pz = z;
    },

    start() {
      if (phase !== 'grid') return;
      phase = 'countdown';
      countdown = COUNTDOWN;
    },

    reset() {
      phase = 'grid';
      countdown = COUNTDOWN;
      lap = 1;
      lapTime = 0;
      totalTime = 0;
      gate = 1;
      wrongWayFor = 0;
      splits = [];
      best = null;
      pending = null;
      // `roadAtLap` is re-seeded from the first update rather than zeroed: a
      // restart puts the chair back on its slot, which is a *negative* road
      // position, and zeroing here would credit the player with the grid's own
      // depth on the way to the first crossing.
      seeded = false;
    },

    get phase() {
      return phase;
    },
    get live() {
      return phase === 'racing';
    },
    get countdown() {
      return countdown;
    },
    get lap() {
      return lap;
    },
    get laps() {
      return LAPS;
    },
    get lapTime() {
      return lapTime;
    },
    get totalTime() {
      return totalTime;
    },
    get splits() {
      return splits;
    },
    get best() {
      return best;
    },
    get gate() {
      return gate;
    },
    get gateAt() {
      return GATES[gate]!.at;
    },
    get gateLevel() {
      return GATES[gate]!.y ?? 0;
    },
    get gateAim() {
      const g = GATES[gate]!;
      return [g.at[0] + g.normal[0] * AIM_THROUGH, g.at[1] + g.normal[1] * AIM_THROUGH] as const;
    },
    get wrongWay() {
      return wrongWayFor > WRONG_WAY_GRACE;
    },
    takeSplit() {
      const p = pending;
      pending = null;
      return p;
    },
  };
}

/** mm:ss.hh, the only format a lap time has ever been written in. */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds - m * 60);
  const cs = Math.floor((seconds - m * 60 - s) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Clockwise screen angle from straight ahead to a point on the floor, radians.
 *
 * Zero is dead ahead and a quarter turn is off to the right, which is what a
 * chevron drawn pointing up and spun by CSS wants. Sign matters and is easy to
 * get backwards: three's world is right-handed with the camera looking down -Z,
 * and screen-clockwise runs the other way round from world yaw.
 */
export function bearingTo(camera: THREE.Camera, x: number, z: number, from: THREE.Vector3): number {
  // Camera yaw taken from where it is looking rather than from its rotation —
  // the chase camera is aimed with lookAt, and its Euler order makes rotation.y
  // alone a lie the moment the shot is tilted.
  const e = camera.matrixWorld.elements;
  const cam = Math.atan2(-e[8]!, -e[10]!);
  const relative = cam - Math.atan2(x - from.x, z - from.z);
  // Wrapped to a half turn either way, so the chevron always takes the short way
  // round and a raw -270° never reaches the stylesheet.
  return Math.atan2(Math.sin(relative), Math.cos(relative));
}
