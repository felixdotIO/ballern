/**
 * The dressing pass: everything in the building that is not the building.
 *
 * One solver per room kind, dispatched from the plan, each with its own seeded
 * stream. Naming the seed after the room means a room dresses itself identically
 * every run and independently of every other room — so adding a table to the
 * canteen cannot silently reshuffle the office, which is the failure mode that
 * makes a seeded world impossible to art-direct.
 */

import * as THREE from 'three';

import type { CollisionVolume, DynamicProp } from './collision';
import { ROOMS, type Room } from './plan';
import { makeRng, seedFrom } from './rng';
import { collapse } from '../render/batch';
import type { Dress } from './dress/common';
import { dressBoard } from './dress/board';
import { dressDeck } from './dress/deck';
import { dressGarage } from './dress/garage';
import { dressHall } from './dress/hall';
import { dressKitchen } from './dress/kitchen';
import { dressCorridor, dressOffice } from './dress/office';
import { dressServer } from './dress/server';

export type Dressing = {
  group: THREE.Group;
  collision: CollisionVolume[];
  /** Loose furniture, handed to the solver as dynamic bodies. */
  dynamic: DynamicProp[];
};

function dressRoom(room: Room, out: Dress): void {
  const rng = makeRng(seedFrom(`dress.${room.id}`));
  switch (room.kind) {
    case 'office':
      return dressOffice(room, out, rng);
    case 'kitchen':
      return dressKitchen(room, out, rng);
    case 'server':
      return dressServer(room, out, rng);
    case 'board':
      return dressBoard(room, out, rng);
    case 'hall':
      return dressHall(room, out, rng);
    case 'corridor':
      return dressCorridor(room, out, rng);
    case 'deck':
      // The deck is dressed once for both of its rectangles, because the bay
      // layout runs across the join between them.
      return;
    case 'garage':
      return dressGarage(room, out, rng);
  }
}

export function buildDressing(): Dressing {
  const root = new THREE.Group();
  const collision: CollisionVolume[] = [];
  const dynamic: DynamicProp[] = [];

  /**
   * Each room is dressed into its own group and then collapsed to one mesh per
   * material.
   *
   * Per room rather than per floorplate, and that is the whole trade: merging
   * everything into one object would give the fewest draw calls and throw away
   * frustum culling with them, so the building would pay for the car park in
   * every frame it was nowhere near it. A room is exactly the right unit —
   * it is what the walls already cull to.
   */
  const dressInto = (label: string, fill: (out: Dress) => void) => {
    const out: Dress = { group: new THREE.Group(), collision, dynamic };
    fill(out);
    // `detail: 'high'` folds the Blender kit's LODs into the merge instead of
    // leaving each desk and chair as its own switching object. A room is the
    // unit that gets culled here, so a per-prop LOD inside it was buying a
    // triangle saving this scene is not short of and paying for it in the one
    // currency it is: draw calls.
    const merged = collapse(out.group, { detail: 'high' });
    merged.name = label;
    root.add(merged);
  };

  for (const room of ROOMS) dressInto(room.id, (out) => dressRoom(room, out));
  dressInto('deck', (out) => dressDeck(out, makeRng(seedFrom('dress.deck'))));

  return { group: root, collision, dynamic };
}
