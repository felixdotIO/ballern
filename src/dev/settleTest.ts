/**
 * Settle gate.
 *
 * Lets the world stand still and asserts that nothing in it moves.
 *
 * Every loose prop is authored by hand at a position somebody typed, and the
 * failure that produces is silent: two objects overlap by a few centimetres,
 * the solver resolves the penetration on the first frame, and they leave at
 * speed. By the time anyone looks, a traffic cone is nine metres away across
 * the deck and a pallet is somewhere else entirely — and nothing about the
 * scene says it was ever wrong, because the room dressed itself and then
 * quietly rearranged itself before the first frame was drawn.
 *
 * The check is the whole fix: a body that is not touching anything does not
 * move, so anything that moves while the player is doing nothing was placed
 * inside something.
 */

import type { Dynamics } from '../game/dynamics';

export type SettleResult = {
  bodies: number;
  /** Props that travelled further than the tolerance while nothing touched them. */
  disturbed: { label: string; moved: number; from: [number, number]; to: [number, number] }[];
};

/**
 * Generous enough to ignore a prop settling the last millimetre onto the floor
 * and a chair castor finding its rest angle; far below anything that has
 * actually been ejected.
 */
const TOLERANCE = 0.12;

export function runSettleTest(
  dynamics: Dynamics,
  tick: (dt: number) => void,
  keys: Set<string>,
  seconds = 4,
): SettleResult {
  const previousKeys = [...keys];
  keys.clear();

  dynamics.reset();
  const before = dynamics.root.children.map((h) => h.position.clone());

  for (let i = 0; i < seconds * 60; i++) tick(1 / 60);

  const disturbed: SettleResult['disturbed'] = [];
  dynamics.root.children.forEach((holder, i) => {
    const start = before[i];
    if (!start) return;
    const moved = holder.position.distanceTo(start);
    if (moved <= TOLERANCE) return;
    disturbed.push({
      label: dynamics.labelOf(i) ?? `#${i}`,
      moved: +moved.toFixed(2),
      from: [+start.x.toFixed(2), +start.z.toFixed(2)],
      to: [+holder.position.x.toFixed(2), +holder.position.z.toFixed(2)],
    });
  });

  keys.clear();
  for (const k of previousKeys) keys.add(k);
  dynamics.reset();

  return { bodies: before.length, disturbed };
}
