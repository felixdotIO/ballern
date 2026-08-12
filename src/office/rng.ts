/**
 * Seeded RNG. Every piece of variation in the building — tile tone, chair
 * angle, which desk belongs to whom — is drawn from a seeded stream so that a
 * given floorplate always dresses itself identically. Reproducibility is what
 * makes the validation gates meaningful: a room that passed yesterday is the
 * same room today.
 */

export type Rng = () => number;

/** mulberry32 — small, fast, good enough for set dressing. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a stable child seed from a string key, so seeds can be named. */
export function seedFrom(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

/** Symmetric jitter, for the ±3° / ±40 mm rule on human-touched objects. */
export const jitter = (rng: Rng, amount: number) => (rng() * 2 - 1) * amount;

export function pick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error('pick() called on an empty list');
  return item;
}
