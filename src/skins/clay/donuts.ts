/**
 * The checkpoints, as donuts you drive through.
 *
 * `race.ts` already knows what a checkpoint is: a plane in plan and a band in
 * section, taken in order, eleven of them a lap. What it had no way to *look at*
 * was any of them: the gates were once marked by hazard tape on the floor, which
 * is correct for a building and nearly useless as a target, because at a low
 * chase camera the floor two metres ahead is three pixels tall.
 *
 * These are now the only thing in the world that marks a checkpoint at all.
 * `office/trackmarks.ts` grew a set of pink rings at the same eleven gates and
 * they have since been deleted, along with the escape-route signage that pointed
 * between them — one checkpoint should have one appearance, and this is it.
 *
 * So: one donut, hovering at chest height in the middle of every gate. It is
 * purely visual. Nothing here touches the race, nothing here has a collider,
 * and the gate is still taken by the same plane crossing it always was — the
 * donut is the checkpoint made visible, not a second mechanic that could
 * disagree with the first. That distinction is worth being strict about,
 * because a collectable with its own trigger volume is a collectable that can
 * be picked up without the lap counting, and then there are two truths.
 *
 * Three rules it follows, and they are the rules for any pickup:
 *
 *  - **Exactly one is on screen.** The gate you are being asked for, and
 *    nothing else. The whole set visible at once is a map of the lap, and a map
 *    is the opposite of what a target is for — see the note in `update`.
 *  - **The next one is lit.** A small warm point light travels to whichever gate
 *    is due, so the target glows from around the corner before its geometry is
 *    on screen. In a windowless core that light is doing more navigation than
 *    the HUD chevron is.
 *  - **It reacts when taken.** Scale up, spin up, fade out, over a third of a
 *    second. A pickup that simply vanishes reads as a bug the first three times
 *    you see it.
 */

import * as THREE from 'three';

import type { Gate } from '../../office/plan';
import { makeRng, range, seedFrom } from '../../office/rng';

/**
 * Ring radius and tube radius, in metres — an 860 mm donut with a 420 mm hole.
 *
 * Which is enormous for a pastry and correct for this, because it has two jobs
 * and the sizes for them disagree. As a *collectable* it wants to be donut-sized
 * and charming. As a *checkpoint* it has to be legible at six metres a second
 * from three and a half metres of boom, and it has to be something the chair
 * plainly goes through rather than past. The second job wins, and the reason it
 * still reads as a donut at that size is the sprinkles: nothing else in the
 * building has anything on it that small, so the scale cue comes from them.
 */
const RADIUS = 0.32;
const TUBE = 0.11;
/** Height above the gate's own floor. Puts the driver's hat through the hole. */
const HOVER = 1.05;

const DOUGH = 0xd9a35c;
const ICING = 0xe8617f;
/** Sprinkles. Four, hot, and the only fully saturated colours in the frame. */
const SPRINKLES = [0xffd447, 0x53c3f0, 0xfff2e0, 0x7be08a];

/**
 * Seconds a collected donut takes to blow up and disappear.
 *
 * 0.34 was too quick and too small to register. At six metres a second the donut
 * leaves the frame behind you at almost the same moment it is taken, so a third of
 * a second of modest growth happened mostly off-screen and the only confirmation
 * left was a hole in a row of dashes in the corner of the HUD. Taking a checkpoint
 * is the one thing in the game worth confirming: it is now half a second, it goes
 * to four and a half times its size rather than two and a half, and it spins twice
 * as far while it does it — big enough to catch in the wing of your eye.
 */
const POP = 0.52;

/**
 * Never draw one you are already standing in.
 *
 * `Ziel` is the finish line and the finish line is the grid — `SPAWN` and
 * `GATES[0]` are both at 61.0, 38.0 — so on the standing start the very first
 * donut is hanging around the driver's shoulders before the countdown has even
 * run. It reads as a bug, it hides the chair in the one shot everybody sees
 * first, and it is pointing at a checkpoint that is under him.
 *
 * A distance test rather than a special case for gate zero, because gate zero
 * is a real checkpoint on laps two and three and should be marked then. Three
 * metres is inside the pop radius anyway, so this only ever suppresses a donut
 * nobody could act on.
 */
const TOO_CLOSE = 3;

type Donut = {
  group: THREE.Group;
  /** Child of `group`; carries the roll so the root keeps the gate's bearing. */
  spin: THREE.Group;
  /** Per-instance so a single donut can fade without taking the others. */
  materials: THREE.MeshStandardMaterial[];
  /** Phase offset, so twelve donuts do not bob in lockstep. */
  phase: number;
  /** −1 when idle; otherwise seconds since it was taken. */
  popping: number;
};

export type Donuts = {
  group: THREE.Group;
  /**
   * Call once a frame with the race's own state.
   *
   * `next` is `race.gate` — the index of the gate being asked for — and `lap`
   * is `race.lap`. Everything else is derived: a change in `next` means the
   * previous one was taken, and a change in `lap` means they all come back.
   */
  update(dt: number, next: number, lap: number, at: THREE.Vector3): void;
  /** Put them all back. For the restart key. */
  reset(): void;
  dispose(): void;
};

export function createDonuts(gates: readonly Gate[]): Donuts {
  const group = new THREE.Group();
  const rng = makeRng(seedFrom('clay.donuts'));

  // One geometry set, shared by all twelve. The materials are not shared —
  // fading one donut out has to leave the other eleven alone.
  const ringGeo = new THREE.TorusGeometry(RADIUS, TUBE, 16, 32);
  const icingGeo = new THREE.TorusGeometry(RADIUS, TUBE * 0.95, 16, 32);
  const sprinkleGeo = new THREE.CapsuleGeometry(0.009, 0.026, 3, 6);
  const owned: THREE.BufferGeometry[] = [ringGeo, icingGeo, sprinkleGeo];

  /**
   * Clay, with a little glow of its own.
   *
   * The emissive is the fix for a mistake worth recording: the first pass lit
   * these with the travelling point light alone, at an intensity chosen to fill
   * the corridor — and the light was *inside the donut*, 70 mm from its own
   * tube, so the icing went to white and the bloom pass turned a 440 mm pastry
   * into a two-metre neon ring. A pickup should glow because it is glowing, not
   * because something is shining on it from point-blank range.
   */
  const clay = (color: number, emissive = 0) =>
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: emissive,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      opacity: 1,
    });

  const donuts: Donut[] = gates.map((gate) => {
    const root = new THREE.Group();
    root.position.set(gate.at[0], (gate.y ?? 0) + HOVER, gate.at[1]);

    /**
     * Stand it up, facing the way you come through.
     *
     * A torus is built in the XY plane with its hole down local +Z, so leaving
     * it unrotated and turning the *root* to face the gate normal puts the hole
     * along the direction of travel — which is the only orientation that makes
     * this a thing you drive through rather than a thing you drive under.
     *
     * The first pass laid it flat like a donut on a plate and then span it
     * about Y. Both were wrong and for the same reason: a checkpoint has a
     * direction and the shape has to carry it.
     */
    root.rotation.y = Math.atan2(gate.normal[0], gate.normal[1]);

    /** Spins about the hole axis, so the face keeps looking at you the whole
     *  way in and the sprinkles ride round rather than sliding off. */
    const spin = new THREE.Group();
    root.add(spin);

    const doughMat = clay(DOUGH, 0.08);
    const icingMat = clay(ICING, 0.28);
    const materials = [doughMat, icingMat];

    const ring = new THREE.Mesh(ringGeo, doughMat);
    ring.castShadow = true;
    spin.add(ring);

    // Iced on the face you approach — local −Z, since +Z is the way you leave.
    // Squashed and set slightly proud, which is what icing poured onto a ring
    // actually is, and cut narrower than the dough so a band of it still shows
    // round the outside. An earlier version used a *fatter* torus for the icing
    // and covered the dough from every angle: a donut with no dough on it is a
    // pink lifebuoy, and that is exactly what it looked like.
    const icing = new THREE.Mesh(icingGeo, icingMat);
    icing.scale.set(1, 1, 0.55);
    icing.position.z = -0.042;
    icing.castShadow = true;
    spin.add(icing);

    for (let i = 0; i < 18; i++) {
      const a = range(rng, 0, Math.PI * 2);
      const r = RADIUS + range(rng, -TUBE * 0.5, TUBE * 0.5);
      const mat = clay(SPRINKLES[Math.floor(rng() * SPRINKLES.length)]!, 0.35);
      materials.push(mat);
      const s = new THREE.Mesh(sprinkleGeo, mat);
      s.position.set(Math.cos(a) * r, Math.sin(a) * r, -0.088);
      s.rotation.set(0, 0, range(rng, 0, Math.PI));
      spin.add(s);
    }

    group.add(root);
    return { group: root, spin, materials, phase: range(rng, 0, Math.PI * 2), popping: -1 };
  });

  /**
   * One light, travelling.
   *
   * Not one per donut: three.js compiles a program per light count, so twelve
   * would be twelve more evaluations per fragment for eleven glows nobody can
   * see — the same bargain `render/lights.ts` makes for the building's own
   * fittings, for the same reason.
   *
   * Its job is the *room*, not the donut — the donut glows on its own emissive.
   * So it is weak and it reaches a long way, which is what puts a warm patch on
   * the carpet and the wall around a checkpoint and lets you find one before its
   * geometry is on screen.
   */
  const glow = new THREE.PointLight(0xffb0a0, 2.0, 8, 2);
  group.add(glow);

  let lastNext = -1;
  let lastLap = -1;

  /** Reset the pop state. Visibility is decided per frame, not here. */
  const restore = () => {
    for (const d of donuts) {
      d.popping = -1;
      d.group.scale.setScalar(1);
      for (let i = 0; i < d.materials.length; i++) {
        const m = d.materials[i]!;
        m.opacity = 1;
        m.emissiveIntensity = i === 0 ? 0.08 : i === 1 ? 0.28 : 0.35;
      }
    }
  };

  restore();

  return {
    group,

    update(dt, next, lap, at) {
      // A new lap puts every donut back, and it has to run before the pop
      // below: crossing the last gate is both "one taken" and "lap over", and
      // resolving them the other way round leaves the finish-line donut missing
      // for the whole of the following lap.
      if (lap !== lastLap) {
        restore();
        lastLap = lap;
        lastNext = next;
      }

      // The gate being asked for changed, so the one that was being asked for
      // has been driven through.
      if (next !== lastNext) {
        const taken = donuts[lastNext];
        if (taken && taken.popping < 0) taken.popping = 0;
        lastNext = next;
      }

      const active = donuts[next];
      const standingInIt = !!active && active.group.position.distanceTo(at) < TOO_CLOSE;

      if (active && !standingInIt) {
        glow.visible = true;
        glow.position.copy(active.group.position);
      } else {
        glow.visible = false;
      }

      for (let i = 0; i < donuts.length; i++) {
        const d = donuts[i]!;

        /**
         * One donut on screen at a time — the one you are being asked for, plus
         * whichever is mid-pop.
         *
         * Eleven of them hanging in the air at once is a map of the lap, and a
         * map is the opposite of what a target is for: with the whole set
         * visible the eye has no idea which is next, and the two furthest along
         * the route are often the most prominent because they happen to be down
         * a long sightline. One at a time and there is no question.
         */
        d.group.visible = (i === next && !standingInIt) || d.popping >= 0;
        if (!d.group.visible) continue;

        d.phase += dt * (i === next ? 2.2 : 0.9);
        d.spin.rotation.z = d.phase;
        d.group.position.y =
          (gates[i]!.y ?? 0) + HOVER + Math.sin(d.phase * 0.8) * (i === next ? 0.07 : 0.035);

        if (d.popping >= 0) {
          d.popping += dt;
          const u = Math.min(1, d.popping / POP);
          /*
           * Out fast and up: the scale runs away while the alpha falls, which reads
           * as the thing bursting rather than as it being deleted.
           *
           * The growth is eased out rather than squared, so the first sixth of the
           * pop is the loud part — that is the frame you actually see, and the old
           * `u * u` spent it barely moving and then did all the growing after the
           * donut was already behind you. The fade is held back over the same
           * curve for the same reason: something that is already transparent by the
           * time it is big has not confirmed anything.
           */
          const burst = 1 - (1 - u) * (1 - u) * (1 - u);
          d.group.scale.setScalar(1 + burst * 3.5);
          d.spin.rotation.z = d.phase + burst * 12;
          for (const m of d.materials) {
            m.opacity = 1 - burst * burst;
            // Emissive does not honour opacity, so a fading donut that keeps its
            // glow fades to a bright ghost and then snaps out. Take it down too.
            // And it flares on the way out: a checkpoint that dims as it goes reads
            // as a light being switched off rather than as a thing being collected.
            const flare = 1 + Math.max(0, 1 - u * 4) * 2.4;
            m.emissiveIntensity = (1 - burst * burst) * flare * (m === d.materials[1] ? 0.28 : 0.2);
          }
          if (u >= 1) {
            d.popping = -1;
            d.group.visible = false;
          }
        }
      }
    },

    reset() {
      restore();
      lastNext = -1;
      lastLap = -1;
    },

    dispose() {
      for (const d of donuts) for (const m of d.materials) m.dispose();
      for (const g of owned) g.dispose();
      glow.dispose();
      group.clear();
    },
  };
}
