/**
 * A clock the whole room agrees on.
 *
 * ---- why this exists at all -----------------------------------------------
 *
 * Two machines have to answer "when does the flag drop" with the same number, and
 * `Date.now()` on two laptops is routinely seconds apart. So the room's own clock is
 * the authority and every client measures its offset from it.
 *
 * ---- and why it is not a tick counter -------------------------------------
 *
 * The obvious thing for a networked game is a shared tick: everyone on step 4,132,
 * everyone stepping in unison. This game cannot have one and does not need one.
 *
 * Cannot, because `physics.step` drains a wall-clock accumulator — a machine holding
 * 144 fps and one struggling at 40 run a different number of substeps for the same
 * second, by design (see the note on `FIXED_STEP`). Making the tick shared would
 * mean rewriting the one part of the simulation that is demonstrably correct.
 *
 * Does not need one, because nothing here replays anybody's inputs. Poses arrive
 * stamped with a time and are interpolated between; a time is all that is required
 * for that, and a time is a far weaker thing to have to agree on than a step index.
 *
 * ---- the estimator --------------------------------------------------------
 *
 * NTP's trick, minus everything that makes NTP hard. Send a ping, note when it left
 * and when the reply came back, and take the room's stamp as having been true at the
 * midpoint. The error in that is half the *asymmetry* of the round trip rather than
 * half the round trip, which on any ordinary connection is small.
 *
 * The catch is that one sample is only as good as the packet it rode on: a single
 * ping that queued behind something is off by however long it queued. So the offsets
 * are kept, and the one from the **fastest** round trip wins rather than the mean. A
 * fast round trip is one that did not queue, and its midpoint is the honest one; the
 * average is dragged around by exactly the samples worth ignoring.
 */

/** How many round trips to remember. */
const SAMPLES = 8;

export type Clock = {
  /**
   * The room's clock, now, in seconds.
   *
   * Before any ping has come back this is local time plus nothing, which is wrong
   * but monotonic — and nothing time-critical happens before the lobby has been
   * open for a few seconds.
   */
  now(): number;
  /** Best round-trip seen, seconds. For showing a latency, and for judging trust. */
  rtt(): number;
  /** Whether enough has come back to trust `now` with a race start. */
  ready(): boolean;
  /** Call when a ping goes out. */
  sent(id: number): void;
  /** Call with the room's stamp when the matching pong arrives. */
  heard(id: number, server: number): void;
  reset(): void;
};

export function createClock(): Clock {
  /** id -> local time the ping left, seconds. */
  const inFlight = new Map<number, number>();
  /** { offset, rtt } for the last few round trips. */
  let samples: { offset: number; rtt: number }[] = [];

  const local = (): number => performance.now() / 1000;

  /** The sample from the fastest round trip. See the header. */
  function best(): { offset: number; rtt: number } | null {
    let winner: { offset: number; rtt: number } | null = null;
    for (const s of samples) if (!winner || s.rtt < winner.rtt) winner = s;
    return winner;
  }

  return {
    now() {
      const b = best();
      return local() + (b ? b.offset : 0);
    },
    rtt() {
      return best()?.rtt ?? 0;
    },
    ready() {
      // Three is enough to have thrown away a bad one and still have a fast one.
      return samples.length >= 3;
    },
    sent(id) {
      inFlight.set(id, local());
      // A ping that never came back must not sit here forever holding an id.
      if (inFlight.size > SAMPLES * 4) {
        const oldest = inFlight.keys().next().value;
        if (oldest !== undefined) inFlight.delete(oldest);
      }
    },
    heard(id, server) {
      const left = inFlight.get(id);
      if (left === undefined) return;
      inFlight.delete(id);
      const back = local();
      const rtt = back - left;
      // The room's stamp was true at the midpoint of the round trip, so the offset
      // is that stamp minus where our own clock was at that midpoint.
      const offset = server - (left + rtt / 2);
      samples.push({ offset, rtt });
      if (samples.length > SAMPLES) samples.shift();
    },
    reset() {
      inFlight.clear();
      samples = [];
    },
  };
}
