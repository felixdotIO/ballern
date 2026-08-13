/**
 * What is in the piñata, and who decides to throw it.
 *
 * This file is the rules and none of the consequences: no geometry, no physics,
 * no DOM. It owns five kinds, the odds of drawing each from a given place in the
 * field, one slot per chair, and the small brain that makes a rival throw. What
 * actually flies through the room is `game/projectiles.ts`, and what it looks
 * like is `skins/clay/itemArt.ts`.
 *
 * ---- the five ------------------------------------------------------------
 *
 * Every one of them is something that exists on this floor, which is the rule
 * `office/props/jumps.ts` sets out for the ramps and there is no reason items
 * should be exempt. Two of them are already modelled and standing in the
 * building: there is a fire extinguisher on a bracket by the door of every room
 * (`office/shell.ts`) and a microwave in the kitchen (`office/props/kitchen.ts`).
 *
 *   Extinguisher   one full shove, and the discharge goes out the *back* — a
 *                  cone of powder that whites out anybody following you. The only
 *                  item on the list where using it well means thinking about who
 *                  is behind, which is why it is the interesting one.
 *   Microwave      a fish, in a microwave, on a fuse. Thrown or dropped; goes off
 *                  in four metres of stink and spins out everyone in it.
 *   Training       a mandatory security-awareness module. Homes on the next chair
 *                  ahead and stops it dead while it completes the training.
 *   Coffee         dropped behind. Grip goes; so does the line you were on.
 *   Quick Sync     a calendar invite that skitters across the carpet and
 *                  ricochets off the walls until it finds somebody to pull into a
 *                  meeting.
 *
 * The names on screen are English and the building they are found in is not: the
 * doors are still signed *Damen*, *Herren* and *6.01 Großraum*, because that is
 * what is printed on the doors of the building this is set in. The interface is
 * the player's language; the set is its own.
 *
 * ---- why the odds are a table and not a die -------------------------------
 *
 * The single decision that makes items a race rather than a lottery: what you
 * draw depends on where you are. The leader draws the things that defend a lead —
 * a puddle to leave in a doorway, an invite to fire behind — and almost never
 * draws the microwave. The back marker draws the things that close a gap. This is
 * how every kart racer has done it since the first one, and it is the whole
 * reason a five-chair field stays close for three laps without the rubber band in
 * `rivals.ts` having to be cranked up past the 12% it can get away with.
 */

import type { Racer } from './seat';

export type ItemKind = 'extinguisher' | 'microwave' | 'training' | 'puddle' | 'huddle';

export const ITEMS: Record<ItemKind, { label: string; short: string; colour: number }> = {
  /*
   * `short` is what the slot prints under the icon and `label` is the full name,
   * which is what the thing would actually be called if somebody handed it to
   * you. One or two words for the short one: it is set at 14 px under a 44 px
   * token and read in peripheral vision at six metres a second, so anything that
   * wraps to a second line is not a label, it is a paragraph.
   *
   * Colours are the pickup's own, used by the HUD slot and by the art. Each is
   * the colour of the actual object: RAL 3000 for the extinguisher, because
   * `office/materials.ts` calls that "the one saturated red the building is
   * allowed" and an item is exactly the place to spend it.
   */
  extinguisher: { label: 'Fire Extinguisher', short: 'Extinguisher', colour: 0x9d1f1f },
  microwave: { label: 'Fish in the Microwave', short: 'Microwave', colour: 0x8fa6b4 },
  training: { label: 'Mandatory Training', short: 'Training', colour: 0xd8452f },
  puddle: { label: 'Coffee Spill', short: 'Coffee', colour: 0x6b4423 },
  huddle: { label: '“Quick Sync?”', short: 'Quick Sync', colour: 0x3f8fd0 },
};

/**
 * Weights by place, 1st at the top.
 *
 * Read down a column and you can see the design: the puddle and the invite drain
 * away as you drop back, the extinguisher is useful everywhere and so is roughly
 * flat, and the two that actually take somebody out are concentrated at the sharp
 * end of the grid where a player needs them.
 *
 * The field is five, so there are five rows. Anything asked for outside that
 * range clamps, which matters because `placeOf` is 1-based and a finished race
 * can report a place for a chair that has already parked.
 */
const ODDS: readonly (readonly [ItemKind, number][])[] = [
  // 1st
  [
    ['puddle', 45],
    ['huddle', 35],
    ['extinguisher', 15],
    ['training', 5],
  ],
  // 2nd
  [
    ['puddle', 30],
    ['huddle', 30],
    ['extinguisher', 25],
    ['training', 12],
    ['microwave', 3],
  ],
  // 3rd
  [
    ['puddle', 20],
    ['huddle', 25],
    ['extinguisher', 30],
    ['training', 18],
    ['microwave', 7],
  ],
  // 4th
  [
    ['puddle', 10],
    ['huddle', 15],
    ['extinguisher', 35],
    ['training', 28],
    ['microwave', 12],
  ],
  // 5th
  [
    ['puddle', 5],
    ['huddle', 8],
    ['extinguisher', 35],
    ['training', 32],
    ['microwave', 20],
  ],
];

/** One draw, from a place in the field. */
export function drawItem(place: number, rng: () => number): ItemKind {
  const row = ODDS[Math.max(0, Math.min(ODDS.length - 1, Math.round(place) - 1))]!;
  let total = 0;
  for (const [, w] of row) total += w;
  let roll = rng() * total;
  for (const [kind, w] of row) {
    roll -= w;
    if (roll <= 0) return kind;
  }
  return row[0]![0];
}

export type Slot = {
  /** What it is carrying, if anything. */
  held: ItemKind | null;
  /**
   * True while the player is holding the fire key and dragging the item behind
   * them as a shield.
   *
   * The one concession that makes a rival's homing module survivable. Without
   * somewhere to put an item other than "thrown", a training module you cannot dodge is
   * the blue shell everybody has always hated, and the field throws four of them
   * a lap.
   */
  trailing: boolean;
  /** Seconds before this chair may be hit again. See RECOVERY. */
  immune: number;
  /** Seconds a rival still means to wait before using what it drew. */
  thinking: number;
};

/**
 * Seconds of grace after a hit.
 *
 * Long enough to cover the spin-out and a moment after it, so a chair that has
 * just been stopped in a doorway cannot be stopped again by the next thing
 * through it. Being hit twice in three seconds is not difficulty, it is the game
 * taking the controller away.
 */
const RECOVERY = 2.6;

/**
 * No items for the first few seconds of a race.
 *
 * The grid is two-by-two in a reception hall and the player starts at the back of
 * it. A microwave going off in the middle of that before anybody has reached the
 * first corner is not a race, it is a pile-up, and it happens in the one part of
 * the lap where there is nowhere to go.
 */
const GRACE = 4;

export type ItemPlay = {
  readonly slots: readonly Slot[];
  /**
   * What a given chair is carrying.
   *
   * Asked by id rather than answered for seat 0, because the chair the HUD draws
   * for is whichever one is being driven on *this* screen, and in a room that is
   * not necessarily the first one on the grid.
   */
  heldBy(id: number): ItemKind | null;
  /** A chair took a piñata. Ignored if it is already carrying something. */
  give(id: number, place: number): boolean;
  /** Can this chair take a piñata at all? Used to leave the box standing. */
  wants(id: number): boolean;
  /** A person pressed the key. `backwards` is the Q. */
  use(id: number, backwards: boolean): void;
  /** A person is holding the fire key, so the item trails rather than flies. */
  trail(id: number, down: boolean): void;
  /** A chair has been hit: drop what it was carrying and start its grace period. */
  struck(id: number): void;
  /**
   * Did a trailed item eat this hit?
   *
   * The shield, and the whole of it: if the chair was dragging something behind
   * it, that thing is destroyed and the hit does not land. Called before the stun
   * rather than after, so a shield that works is a shield that shows nothing at
   * all happening to you.
   */
  absorb(id: number): boolean;
  /** Whether a chair may be hit right now. */
  vulnerable(id: number): boolean;
  /** Where everybody stands, 1-based, indexed by racer id. */
  placeOf(id: number): number;
  update(h: number, racers: readonly Racer[], elapsed: number): void;
  reset(): void;
};

export function createItemPlay(options: {
  size: number;
  rng: () => number;
  /**
   * Is this seat being driven by a person?
   *
   * A predicate rather than a set taken once, because who is in which seat is
   * decided in a lobby and can differ from one race to the next, and a rule that
   * cached the answer at construction would be wrong on the second race.
   *
   * Two rules hang off it, and both used to be spelled `id === 0`: a person draws
   * an item and may use it immediately, where a rival waits a beat; and a person
   * throws by pressing a key, where a rival decides for itself. Neither is about
   * being *first* on the grid, which is all `id === 0` ever actually meant.
   */
  human(id: number): boolean;
  /** Throw something. `backwards` fires it out the back. */
  fire(kind: ItemKind, owner: Racer, backwards: boolean): void;
}): ItemPlay {
  const { size, rng, human, fire } = options;

  const slots: Slot[] = Array.from({ length: size }, () => ({
    held: null,
    trailing: false,
    immune: 0,
    thinking: 0,
  }));

  /** Places by racer id, rewritten every step. */
  const places = new Int32Array(size).fill(1);
  /** The racers as of the last update, so `usePlayer` has somebody to throw for. */
  let field: readonly Racer[] = [];
  let clock = 0;

  /** Signed gap in metres: positive means `other` is up the road from `racer`. */
  const gapTo = (racer: Racer, other: Racer) => other.progress - racer.progress;

  /**
   * What a rival does with what it drew.
   *
   * Deliberately not clever. A chair on rails cannot miss and cannot mistime, so
   * every ounce of competence here is felt by the player as unfairness — the
   * interesting decisions all live at the other end of the throw. What this does
   * is wait a beat, check there is somebody worth throwing at, and throw.
   */
  function rivalPlay(racer: Racer, slot: Slot): void {
    const kind = slot.held;
    if (!kind) return;

    // Nothing at a chair that is already spinning, and nothing at all from a
    // chair that has parked on the line.
    const live = field.filter((r) => r.id !== racer.id && !r.finished && r.stunned <= 0);

    switch (kind) {
      case 'puddle':
        // Always worth leaving, and always behind.
        slot.held = null;
        fire(kind, racer, true);
        return;

      case 'extinguisher': {
        // Fired for the shove either way; the powder is a bonus that decides the
        // *timing*. Wait for somebody in the wake if there is one coming, but
        // never sit on it for longer than the think time already spent.
        slot.held = null;
        fire(kind, racer, false);
        return;
      }

      case 'training': {
        // Only useful up the road. Held — not wasted — if this chair is leading.
        const ahead = live.filter((r) => gapTo(racer, r) > 2);
        if (!ahead.length) {
          slot.thinking = 1.2;
          return;
        }
        slot.held = null;
        fire(kind, racer, false);
        return;
      }

      case 'huddle':
      case 'microwave': {
        // Whichever direction has somebody near enough to be worth it. Forward
        // first, because a chair that only ever throws backwards reads as
        // defensive and the field is meant to be coming after you.
        const forward = live.some((r) => {
          const g = gapTo(racer, r);
          return g > 1 && g < 26;
        });
        const back = live.some((r) => {
          const g = gapTo(racer, r);
          return g < -1 && g > -16;
        });
        if (!forward && !back) {
          slot.thinking = 0.9;
          return;
        }
        slot.held = null;
        fire(kind, racer, !forward);
        return;
      }
    }
  }

  return {
    slots,

    heldBy(id) {
      return slots[id]?.held ?? null;
    },

    wants(id) {
      const slot = slots[id];
      return !!slot && slot.held === null;
    },

    give(id, place) {
      const slot = slots[id];
      if (!slot || slot.held !== null) return false;
      slot.held = drawItem(place, rng);
      // A rival waits a beat before using what it drew, staggered per chair so
      // four of them taking the same row do not all throw on the same frame —
      // which reads as one event rather than four, and is unsurvivable besides.
      slot.thinking = human(id) ? 0 : 0.5 + rng() * 1.1;
      return true;
    },

    use(id, backwards) {
      const slot = slots[id];
      const me = field[id];
      if (!slot || !me || !slot.held) return;
      const kind = slot.held;
      slot.held = null;
      slot.trailing = false;
      fire(kind, me, backwards);
    },

    trail(id, down) {
      const slot = slots[id];
      if (slot) slot.trailing = down && slot.held !== null;
    },

    struck(id) {
      const slot = slots[id];
      if (!slot) return;
      // Whatever you were carrying is gone. It is what every game of this kind
      // does and it is the reason holding an item has a cost: a shield you never
      // spend is a shield you eventually lose.
      slot.held = null;
      slot.trailing = false;
      slot.immune = RECOVERY;
    },

    absorb(id) {
      const slot = slots[id];
      if (!slot || !slot.trailing || !slot.held) return false;
      slot.held = null;
      slot.trailing = false;
      // No grace period on an absorbed hit. The shield already cost you the item;
      // charging two and a half seconds of invulnerability on top would make
      // holding one strictly better than using one.
      return true;
    },

    vulnerable(id) {
      const slot = slots[id];
      const racer = field[id];
      if (!slot || !racer) return false;
      return slot.immune <= 0 && !racer.finished && clock >= GRACE;
    },

    placeOf(id) {
      return places[id] ?? 1;
    },

    update(h, racers, elapsed) {
      field = racers;
      clock = elapsed;

      // Everybody's place, from the one number a chair is. Sorted rather than
      // counted so the whole field is ranked in one pass — `rivals.placeOf` does
      // the counting version for the player alone, and the two agree because they
      // are reading the same quantity.
      const order = racers.map((r) => r.id).sort((a, b) => racers[b]!.progress - racers[a]!.progress);
      for (let i = 0; i < order.length; i++) places[order[i]!] = i + 1;

      for (const racer of racers) {
        const slot = slots[racer.id];
        if (!slot) continue;
        // Clamped, not merely decremented. Both of these are read from outside —
        // the HUD, the dev handle, a rival's decision to throw — and a timer that
        // settles at −0.01 rather than 0 is a timer that reads as still running.
        if (slot.immune > 0) slot.immune = Math.max(0, slot.immune - h);
        if (slot.thinking > 0) slot.thinking = Math.max(0, slot.thinking - h);

        // A person throws by pressing a key; everyone else decides here.
        if (human(racer.id) || !slot.held) continue;
        if (clock < GRACE || racer.stunned > 0 || racer.finished) continue;
        if (slot.thinking > 0) continue;
        rivalPlay(racer, slot);
      }
    },

    reset() {
      clock = 0;
      for (const slot of slots) {
        slot.held = null;
        slot.trailing = false;
        slot.immune = 0;
        slot.thinking = 0;
      }
      places.fill(1);
    },
  };
}
