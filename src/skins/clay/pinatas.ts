/**
 * The mystery boxes: six rows of three, hanging in the corridors.
 *
 * ---- where they go, and why nobody typed the coordinates -------------------
 *
 * A row is authored as a *fraction of the lap* and then moved until it fits.
 * Six numbers between 0 and 1 is the whole of the layout, and everything else —
 * which room a row lands in, which floor, which way it faces — falls out of the
 * route, which is the same one the rivals drive and the same one `race.ts` times.
 *
 * That is not laziness, it is the only version that stays correct. The lap is a
 * building: 390 m of rooms joined by doorways two and a half metres wide, with a
 * hairpin in a reception hall and two ramps between floors. Three boxes abreast
 * at a hand-picked spot is three boxes abreast until somebody moves a desk, and
 * then it is a wall of pickups you cannot pass, in a doorway, forever. So each
 * row asks the solver whether a chair could actually stand in each of its three
 * lanes, and if it could not, the row walks up and down the route until it finds
 * somewhere it could. `dev/routeTest.ts` has been doing exactly this for the
 * racing line since before there were items; this is the same question asked
 * three times per row.
 *
 * ---- and the rules they follow --------------------------------------------
 *
 * The rules the old checkpoint markers followed were for a *checkpoint*, and a pickup is
 * not one, so two of them are deliberately broken here:
 *
 *  - **All of them are on screen**, not one. A checkpoint is a target and a map
 *    of targets is useless; a box is a choice, and a row you can see from thirty
 *    metres out is a row you can pick a line through. What is culled is by
 *    distance, so the far side of the building is not being drawn at you.
 *  - **They come back.** Five seconds, which is long enough that a row cannot be
 *    farmed by circling it and short enough that the field behind you is not
 *    driving through an empty corridor.
 *  - **It reacts when taken** — that one is kept, and it is the only one that was
 *    ever really about pickups. A piñata cannot swell to four times its size the
 *    way a donut does, because a piñata that inflates is a balloon. It bursts.
 */

import * as THREE from 'three';

import type { Racer } from '../../game/items';
import type { Physics } from '../../game/physics';
import { CHAIR } from '../../office/metrics';
import { confetti, pinata } from './itemArt';
import type { RoutePath } from './routePath';

/**
 * Where the rows go, as fractions of the lap.
 *
 * Spread rather than even: the gaps are wider through the middle third, which is
 * the open-plan and the long run where a chair is at speed and a decision has
 * room to play out, and tighter around the two ramps, where the field bunches and
 * an item is what turns a queue back into a race.
 */
const ROWS = [0.09, 0.24, 0.39, 0.55, 0.71, 0.87] as const;

/**
 * Three abreast, and the offsets are off the route's own centre line.
 *
 * 780 mm apart, which is set by the piñata rather than by the corridor: the star
 * is 640 mm across its points, so anything under about 0.7 has them interpenetrating
 * and the row reads as one lumpy object instead of as three things to choose
 * between. 1.56 m of row plus the width of a box is still inside the narrowest
 * doorway on the lap, and the clearance search below moves any row where it is not.
 */
const LANES = [-0.78, 0, 0.78] as const;

/**
 * How far a row may walk from where it was asked for, and in what steps.
 *
 * Ten metres either way. Beyond that a row has not been nudged, it has been moved
 * to a different part of the lap, and the six fractions above stop meaning
 * anything — better to drop the row and say so than to silently relocate it.
 */
const SEARCH = 10;
const SEARCH_STEP = 0.5;

/**
 * Above the floor.
 *
 * Chest height on the sitter rather than head height, and that is about the
 * middle lane: at 0.86 the box on the centre line hung exactly where the driver's
 * head is on screen, so the one you were driving straight at was the one you
 * could not see. The donut solves the same problem by having a hole in it and
 * hanging at 1.05; a piñata is solid, so it drops instead.
 */
const HOVER = 0.72;

/**
 * How near the middle of one you have to be, in plan.
 *
 * Deliberately wider than half the lane spacing, so the gaps between the three
 * are not dead ground and a row cannot be driven through by threading it. That
 * makes a chair on the middle lane eligible for all three at once — which is why
 * the pickup below takes the *nearest* box in range rather than the first one it
 * finds. Taking the first meant driving into the middle piñata and watching the
 * left-hand one burst, every time.
 */
const REACH = 0.72;
/** And how many storeys. The deck and Ebene 5 share a footprint. */
const BAND = 1.4;

/** Seconds before a taken box comes back, and how long the burst lasts. */
const RESPAWN = 5;
const BURST = 0.7;

/**
 * Beyond this, don't draw it.
 *
 * Eighteen piñatas is six draws each after the collapse, which is a hundred and
 * eight — real money in a scene that also carries a floorplate, a car park and
 * five rigged figures. Forty metres keeps every row you could act on and drops
 * the four rows that are in other rooms.
 */
const SIGHT = 40;

type Box = {
  object: THREE.Object3D;
  /** Where it hangs, and the floor it hangs over. */
  at: THREE.Vector3;
  phase: number;
  /** Seconds until it comes back, or 0 if it is up. */
  gone: number;
  /**
   * 0 to 1 as it grows back into place.
   *
   * A box that reappears at full size is a box that was not there and then was,
   * which reads as a glitch rather than as a respawn — the same argument
   * the checkpoint markers made for popping on the way out, applied to the way in.
   */
  grow: number;
};

type Burst = {
  group: THREE.Group;
  scraps: THREE.Object3D[];
  headings: THREE.Vector3[];
  /** −1 when idle. */
  age: number;
};

export type Pinatas = {
  group: THREE.Group;
  /**
   * @param wants whether this chair is able to carry anything — a box standing in
   *              front of a chair that is already holding something is left
   *              standing, which is what every game of this kind does and is the
   *              reason a shield has a cost.
   * @param onTake called with the chair's id on the frame it takes one.
   */
  update(
    dt: number,
    racers: readonly Racer[],
    wants: (id: number) => boolean,
    onTake: (id: number) => void,
  ): void;
  reset(): void;
};

export function createPinatas(track: RoutePath, physics: Physics): Pinatas {
  const group = new THREE.Group();
  const boxes: Box[] = [];

  const point = new THREE.Vector3();
  const radius = CHAIR.baseDiameter / 2;

  /** Could a chair stand in all three lanes of this row? */
  function clear(s: number): boolean {
    const yaw = track.headingAt(s);
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    track.pointAt(s, point);
    for (const lane of LANES) {
      const blocked = physics.obstruction(point.x + nx * lane, point.y, point.z + nz * lane, radius);
      if (blocked.length) return false;
    }
    return true;
  }

  const prototype = pinata();

  for (const fraction of ROWS) {
    const wanted = fraction * track.total;

    // Out from the asked-for spot in both directions at once, so a row that has
    // to move ends up as near as it can be to where it was designed rather than
    // wherever the first clear sample happened to be.
    let found: number | null = null;
    for (let offset = 0; offset <= SEARCH && found === null; offset += SEARCH_STEP) {
      for (const s of offset === 0 ? [wanted] : [wanted + offset, wanted - offset]) {
        if (clear(s)) {
          found = s;
          break;
        }
      }
    }

    if (found === null) {
      // Loud, and only in development: a row that cannot be placed means the lap
      // has no three-wide stretch within twenty metres of a sixth of its length,
      // which is a fact about the building somebody needs to know.
      if (import.meta.env.DEV) {
        console.warn(`[pinatas] no clear row within ${SEARCH} m of ${(fraction * 100).toFixed(0)}% of the lap`);
      }
      continue;
    }

    const yaw = track.headingAt(found);
    const nx = Math.cos(yaw);
    const nz = -Math.sin(yaw);
    track.pointAt(found, point);

    LANES.forEach((lane, i) => {
      // Clones share the prototype's geometry and its five materials, so the
      // eighteenth of these costs a matrix and nothing else.
      const object = prototype.clone();
      const at = new THREE.Vector3(point.x + nx * lane, point.y, point.z + nz * lane);
      object.position.set(at.x, at.y + HOVER, at.z);
      group.add(object);
      boxes.push({ object, at, phase: i * 2.1 + boxes.length * 0.37, gone: 0, grow: 1 });
    });
  }

  /**
   * Four bursts, reused.
   *
   * Three chairs can take the three boxes of one row on the same frame and a
   * fourth can be a lap behind doing the same thing, so four is the number at
   * which running out stops being possible in practice. Building them up front
   * rather than on the frame a box is taken is the difference between a burst and
   * a hitch followed by a burst.
   */
  const bursts: Burst[] = Array.from({ length: 4 }, () => {
    const made = confetti();
    group.add(made.group);
    return { ...made, age: -1 };
  });

  function burstAt(at: THREE.Vector3): void {
    const free = bursts.find((b) => b.age < 0) ?? bursts[0]!;
    free.age = 0;
    free.group.position.copy(at);
    free.group.visible = true;
    for (const scrap of free.scraps) {
      scrap.position.set(0, 0, 0);
      scrap.scale.setScalar(1);
      scrap.rotation.set(0, 0, 0);
    }
  }

  return {
    group,

    update(dt, racers, wants, onTake) {
      const player = racers[0];

      for (const box of boxes) {
        if (box.gone > 0) {
          box.gone -= dt;
          if (box.gone > 0) {
            box.object.visible = false;
            continue;
          }
          box.gone = 0;
          box.grow = 0;
        }
        if (box.grow < 1) box.grow = Math.min(1, box.grow + dt / 0.35);

        let near = true;
        if (player) {
          const dx = player.position.x - box.at.x;
          const dy = player.position.y - box.at.y;
          const dz = player.position.z - box.at.z;
          near = dx * dx + dy * dy + dz * dz < SIGHT * SIGHT;
        }
        box.object.visible = near;
        if (!near) continue;

        box.phase += dt;
        // Spun about two axes rather than one. A piñata turning about Y alone
        // presents the same silhouette for the whole approach and reads as a
        // static prop with an animation on it; a slow tumble is what makes it
        // obvious the thing is hanging from something.
        box.object.rotation.set(Math.sin(box.phase * 0.6) * 0.3, box.phase * 1.1, Math.sin(box.phase * 0.9) * 0.16);
        box.object.position.y = box.at.y + HOVER + Math.sin(box.phase * 1.5) * 0.06;

        // Overshooting slightly on the way in, so it lands rather than arrives.
        box.object.scale.setScalar(box.grow < 1 ? box.grow * (1.18 - box.grow * 0.18) : 1);

      }

      /*
       * Pickups, in a second pass over the chairs rather than inside the one over
       * the boxes.
       *
       * Because the answer to "which box did that chair take" is the nearest one,
       * and the nearest one is not knowable until every box has been considered.
       * Box-first meant the lowest-numbered box in range won, so a chair driving
       * squarely into the middle piñata burst the left-hand one and left the middle
       * one hanging — every time, on every row.
       */
      for (const racer of racers) {
        if (racer.finished || !wants(racer.id)) continue;

        let taken: Box | null = null;
        let bestD = REACH * REACH;
        for (const box of boxes) {
          if (box.gone > 0 || box.grow < 0.6) continue;
          if (Math.abs(racer.position.y - box.at.y) > BAND) continue;
          const dx = racer.position.x - box.at.x;
          const dz = racer.position.z - box.at.z;
          const d = dx * dx + dz * dz;
          if (d < bestD) {
            bestD = d;
            taken = box;
          }
        }
        if (!taken) continue;

        onTake(racer.id);
        taken.gone = RESPAWN;
        taken.object.visible = false;
        point.set(taken.at.x, taken.at.y + HOVER, taken.at.z);
        burstAt(point);
      }

      for (const burst of bursts) {
        if (burst.age < 0) continue;
        burst.age += dt;
        const u = Math.min(1, burst.age / BURST);
        for (let i = 0; i < burst.scraps.length; i++) {
          const scrap = burst.scraps[i]!;
          const heading = burst.headings[i]!;
          // Thrown, then falling. The 4.4 is not gravity — it is a scrap of paper
          // in air, which is most of a metre per second slower than a stone and
          // is what stops the burst reading as a shower of gravel.
          scrap.position.set(
            heading.x * burst.age,
            heading.y * burst.age - 4.4 * burst.age * burst.age * 0.5,
            heading.z * burst.age,
          );
          scrap.rotation.set(burst.age * (5 + i), burst.age * (3 + i * 0.5), 0);
          scrap.scale.setScalar(1 - u * u);
        }
        if (u >= 1) {
          burst.age = -1;
          burst.group.visible = false;
        }
      }
    },

    reset() {
      for (const box of boxes) {
        box.gone = 0;
        box.grow = 1;
        box.object.visible = true;
        box.object.scale.setScalar(1);
      }
      for (const burst of bursts) {
        burst.age = -1;
        burst.group.visible = false;
      }
    },
  };
}
