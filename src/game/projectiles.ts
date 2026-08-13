/**
 * Items, once they have left somebody's hands.
 *
 * Five kinds and four completely different ways of moving, which is the point:
 * an item that is only a different colour of the same projectile is not a second
 * item. So the invite really does bounce off the walls, the microwave really is
 * thrown on an arc and falls, the module follows the corridors rather than the
 * line of sight, and the puddle does not move at all.
 *
 * ---- how each of them travels --------------------------------------------
 *
 *   sync invite   a rigid body, thrown flat, restitution turned up and combined by
 *                *max* so it keeps its bounce against a building authored at 0.08.
 *                The ricochet is the item; a card that stopped at the first
 *                Stellwand would be a worse puddle.
 *   microwave   a rigid body too, but heavy and thrown on an arc, with a fuse.
 *                It goes off where it lands rather than where it was aimed, which
 *                is what makes it a bomb rather than a slow shell.
 *   training module     not a body at all. It flies the *route* — a distance along the
 *                lap, easing across to the target's lane — which is the one
 *                decision in this file worth defending, below.
 *   coffee spill doesn't travel. Sits where it was dropped for twenty seconds.
 *   fire extinguisher never becomes an object: it is a shove and a cone, resolved on
 *                the frame it is used, plus a cloud that is purely something to
 *                look at.
 *
 * ---- why the module flies the route --------------------------------------
 *
 * The obvious homing missile steers toward the target in world space, and in a
 * building it is useless: the lap is 390 m of rooms joined by 2.5 m doorways, so
 * a projectile aimed straight at a chair two rooms ahead spends its whole life
 * inside a wall. Making it a physics body and hoping does not help either —
 * it just dies against the first partition.
 *
 * What is already here is the thing that solves it. `routePath.ts` turns the lap
 * into a single distance, the rivals are *defined* as a distance along it, and
 * `main.ts` accumulates the player's on the same scale. So the module is a
 * distance too: it advances along the route, which by construction goes through
 * every doorway the right way round, and eases sideways onto its target's line as
 * it closes. It can no more clip a wall than a rival can, and it needs no
 * steering, no avoidance, and no collider.
 *
 * ---- and why hits are distance tests --------------------------------------
 *
 * Not contact events, even for the two that are real bodies. There are five
 * chairs and their positions are already in hand every substep, so a hit is five
 * subtractions — against a contact-event pipeline that would have to special-case
 * the kinematic rivals (which generate no dynamic contacts worth reading), the
 * owner's own body for the first tenth of a second, and the difference between
 * hitting a chair and hitting the wall behind it. The distance test is shorter,
 * it is the same rule for every item, and it is the same rule for the player and
 * the field, which is the part that actually matters.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import type { ItemKind } from './items';
import type { Racer } from './seat';
import type { Physics } from './physics';

/** The route, as much of it as this needs. `skins/clay/routePath.ts` builds it. */
export type Track = {
  total: number;
  pointAt(s: number, out: THREE.Vector3): THREE.Vector3;
  headingAt(s: number): number;
  nearest(at: THREE.Vector3, from: number, window: number): { s: number; d: number };
};

/**
 * The prototypes, built by the skin and handed in.
 *
 * Same arrangement as `rivals.ts`, which takes its chairs from the caller: this
 * file is about how an item behaves and `skins/clay/itemArt.ts` is about what it
 * looks like, and neither should have to import the other to work.
 */
export type ItemArt = {
  binder: THREE.Object3D;
  card: THREE.Object3D;
  microwave: THREE.Object3D;
  extinguisher: THREE.Object3D;
  /** A new one each time: every puddle is its own splash. */
  puddle(): THREE.Object3D;
  cloud(kind: 'powder' | 'stink'): THREE.Mesh;
};

/** What an item is allowed to do to a chair. Implemented by `main.ts`. */
export type ItemEffects = {
  vulnerable(id: number): boolean;
  /** A trailed item ate the hit. The projectile still dies. */
  absorb(id: number): boolean;
  stun(id: number, seconds: number, kind: ItemKind): void;
  /** A push in a world direction, m/s. */
  shove(id: number, dx: number, dz: number, speed: number): void;
  /** Straight speed along the chair's own facing, m/s, held for `seconds`. */
  push(id: number, speed: number, seconds: number): void;
  /** Powder over it, seconds. A screen for the player and a cough for a rival. */
  blind(id: number, seconds: number): void;
};

const TUNING = {
  /*
   * ---- the extinguisher ----------------------------------------------------
   *
   * 3.4 m/s against a 6.0 top speed and a 2.6 drift boost, so it is the largest
   * single push in the game and unmistakably worth more than a good corner. Held
   * for 1.4 s, during which `chair.ts` lifts its own ceiling — without the hold
   * the overspeed drag takes three quarters of it back inside a second and the
   * item reads as a tap rather than as a shove.
   */
  shove: 3.4,
  shoveHold: 1.4,
  /** How far the discharge reaches, and how wide. 50° either side of straight back. */
  coneReach: 9,
  coneCos: Math.cos(0.87),
  /** Seconds of powder on the screen. Long enough to cost a corner, not a lap. */
  blind: 2.4,

  /* ---- the invite ---------------------------------------------------------- */
  cardSpeed: 12,
  cardLife: 7,
  cardStun: 1.2,
  cardShove: 1.6,

  /* ---- the microwave ------------------------------------------------------- */
  /** Thrown forward flat-ish; dropped backwards it just falls out of your lap. */
  bombSpeed: 8.5,
  bombLift: 2.6,
  /** Seconds before it goes off wherever it happens to be. */
  fuse: 2.5,
  blastRadius: 4,
  blastStun: 1.4,
  blastShove: 4.5,

  /* ---- the module ---------------------------------------------------------- */
  /**
   * 11 m/s, comfortably above the 8.6 m/s a chair can reach with everything it
   * has. A homing item that can be outrun is a homing item that resolves as a
   * timeout thirty seconds later, in a different room, on somebody else.
   */
  binderSpeed: 11,
  binderLife: 9,
  binderStun: 1.7,
  /** Seconds to slide from the lane it was launched on to the target's. */
  binderLane: 0.6,

  /* ---- the puddle ---------------------------------------------------------- */
  puddleLife: 24,
  puddleStun: 1.05,
  /** How near the middle of it you have to be. Its art is about 0.5 m across. */
  puddleReach: 0.62,

  /** How far behind a chair a dropped item lands. Clear of its own castors. */
  dropBack: 1.3,
  /** And how far ahead a thrown one starts, clear of its own collider. */
  throwAhead: 1.1,
  /** Seconds during which a projectile cannot hit the chair that threw it. */
  ownerGrace: 0.4,
  /** How near a chair's floor origin an item has to pass to count as a hit. */
  reach: 0.85,
  /** And how many storeys apart they may be. The car park is above the deck. */
  band: 1.5,
} as const;

type Flying = {
  kind: ItemKind;
  owner: number;
  object: THREE.Object3D;
  body: RAPIER.RigidBody;
  life: number;
  age: number;
};

type Homing = {
  owner: number;
  target: number;
  object: THREE.Object3D;
  /** Distance along the route, and which way along it. */
  s: number;
  direction: 1 | -1;
  /** Metres off the route's centre line, easing toward the target's. */
  lane: number;
  life: number;
  age: number;
};

type Puddle = {
  owner: number;
  object: THREE.Object3D;
  life: number;
  age: number;
};

type Cloud = {
  mesh: THREE.Mesh;
  age: number;
  span: number;
  from: number;
  to: number;
  peak: number;
};

export type Projectiles = {
  root: THREE.Group;
  /** Throw something. `backwards` sends it out the back. */
  fire(kind: ItemKind, owner: Racer, backwards: boolean): void;
  /** Call from inside the fixed physics step. */
  update(h: number, racers: readonly Racer[]): void;
  /**
   * Draw whatever a chair is dragging behind it, or nothing.
   *
   * Called on the frame rather than in the step: it is a position, not a
   * simulation, and nothing collides with it — the shield is resolved in
   * `items.absorb` at the moment of the hit, not by this object being in the way.
   *
   * Keyed by seat, because more than one chair in the field can be dragging one
   * at a time. It was a single object for as long as the only chair that could
   * trail was the one at the keyboard; the moment a second person is in the room
   * that assumption puts both of their shields in the same place.
   */
  trail(id: number, kind: ItemKind | null, at: THREE.Vector3, yaw: number): void;
  reset(): void;
};

export function createProjectiles(
  physics: Physics,
  track: Track,
  art: ItemArt,
  effects: ItemEffects,
): Projectiles {
  const world = physics.world;
  const root = new THREE.Group();

  const flying: Flying[] = [];
  const homing: Homing[] = [];
  const puddles: Puddle[] = [];
  const clouds: Cloud[] = [];

  const at = new THREE.Vector3();
  const to = new THREE.Vector3();
  const point = new THREE.Vector3();
  const probe = new THREE.Vector3();

  /** The item each chair is dragging, if any. One object per seat, re-dressed. */
  const trailed = new Map<number, { kind: ItemKind; object: THREE.Object3D }>();

  /**
   * The field as of the last step.
   *
   * `fire` is called from the frame — a key press, or a rival's decision made in
   * `items.ts` — and needs to know where everybody is to aim a cone or pick a
   * target. Holding the list rather than threading it through every call site
   * costs one assignment a substep and keeps `fire(kind, owner, backwards)` the
   * same three arguments the item rules already speak in.
   */
  let field: readonly Racer[] = [];

  /** three's convention: an unrotated object faces −Z. */
  const facing = (yaw: number, back: boolean, out: THREE.Vector3) =>
    out.set(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(back ? -1 : 1);

  function prototype(kind: ItemKind): THREE.Object3D {
    switch (kind) {
      case 'training':
        return art.binder;
      case 'huddle':
        return art.card;
      case 'microwave':
        return art.microwave;
      default:
        return art.extinguisher;
    }
  }

  /**
   * A hit, resolved the same way for every item and every chair.
   *
   * Returns whether the projectile should consider itself spent — which is true
   * even when a shield ate the hit, because an item that survives being blocked
   * is an item you cannot block.
   */
  function land(id: number, kind: ItemKind, seconds: number, from: THREE.Vector3, shove: number): boolean {
    if (!effects.vulnerable(id)) return false;
    if (effects.absorb(id)) return true;
    effects.stun(id, seconds, kind);
    if (shove > 0) {
      const dx = probe.x - from.x;
      const dz = probe.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      effects.shove(id, dx / len, dz / len, shove);
    }
    return true;
  }

  /** Everyone this thing could hit: near enough, on this floor, and not immune. */
  function nearest(
    racers: readonly Racer[],
    x: number,
    y: number,
    z: number,
    reach: number,
    skip: number,
  ): Racer | null {
    let best: Racer | null = null;
    let bestD = reach * reach;
    for (const racer of racers) {
      if (racer.id === skip || racer.finished) continue;
      if (Math.abs(racer.position.y - y) > TUNING.band) continue;
      const dx = racer.position.x - x;
      const dz = racer.position.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = racer;
      }
    }
    return best;
  }

  function puff(kind: 'powder' | 'stink', x: number, y: number, z: number, to_: number, span: number): void {
    const mesh = art.cloud(kind);
    mesh.position.set(x, y, z);
    mesh.visible = true;
    root.add(mesh);
    clouds.push({
      mesh,
      age: 0,
      span,
      from: 0.5,
      to: to_,
      peak: (mesh.material as THREE.MeshBasicMaterial).opacity,
    });
  }

  /** A rigid body for the two items that are ones, thrown from `owner`. */
  function throwBody(kind: ItemKind, owner: Racer, backwards: boolean): void {
    const object = prototype(kind).clone();
    root.add(object);

    facing(owner.yaw, backwards, to);
    const bomb = kind === 'microwave';
    // Dropped items go down at the owner's feet; thrown ones start clear of the
    // collider that is about to be behind them.
    const reach = backwards ? TUNING.dropBack : TUNING.throwAhead;
    const x = owner.position.x + to.x * reach;
    const z = owner.position.z + to.z * reach;
    const y = owner.position.y + (bomb ? 0.55 : 0.3);

    const speed = backwards ? (bomb ? 1.5 : TUNING.cardSpeed * 0.75) : bomb ? TUNING.bombSpeed : TUNING.cardSpeed;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinvel(to.x * speed, bomb && !backwards ? TUNING.bombLift : 0, to.z * speed)
        .setLinearDamping(bomb ? 0.05 : 0.12)
        .setAngularDamping(bomb ? 0.7 : 0.45)
        .setCanSleep(false),
    );

    const desc = bomb
      ? RAPIER.ColliderDesc.cuboid(0.22, 0.13, 0.16).setMass(5).setRestitution(0.18)
      : RAPIER.ColliderDesc.cuboid(0.15, 0.02, 0.105).setMass(0.25).setRestitution(0.86);
    world.createCollider(
      desc
        .setFriction(0.06)
        // Combined by max rather than by the default average, which is what makes
        // the ricochet real: the building is authored at 0.08 restitution so a
        // card at 0.86 would meet a wall at 0.47 and be flat after two bounces.
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max),
      body,
    );

    flying.push({ kind, owner: owner.id, object, body, life: bomb ? TUNING.fuse : TUNING.cardLife, age: 0 });
  }

  /** The blast, wherever the microwave got to. */
  function detonate(item: Flying, racers: readonly Racer[]): void {
    const p = item.body.translation();
    puff('stink', p.x, p.y, p.z, TUNING.blastRadius, 0.85);

    at.set(p.x, p.y, p.z);
    for (const racer of racers) {
      if (racer.finished) continue;
      if (Math.abs(racer.position.y - p.y) > TUNING.band) continue;
      const dx = racer.position.x - p.x;
      const dz = racer.position.z - p.z;
      if (Math.hypot(dx, dz) > TUNING.blastRadius) continue;
      // Including whoever threw it. A fish in a microwave is not a directional
      // weapon and pretending otherwise would be the one dishonest item here.
      probe.set(racer.position.x, racer.position.y, racer.position.z);
      land(racer.id, 'microwave', TUNING.blastStun, at, TUNING.blastShove);
    }
  }

  function drop(item: Flying): void {
    root.remove(item.object);
    world.removeRigidBody(item.body);
  }

  return {
    root,

    fire(kind, owner, backwards) {
      switch (kind) {
        case 'extinguisher': {
          // The shove is the item; the cone is what you were thinking about when
          // you chose the moment.
          effects.push(owner.id, TUNING.shove, TUNING.shoveHold);
          facing(owner.yaw, true, to);
          puff(
            'powder',
            owner.position.x + to.x * 1.1,
            owner.position.y + 0.6,
            owner.position.z + to.z * 1.1,
            3.4,
            1.1,
          );
          // Everyone in the discharge is resolved against the racer list held
          // from the last step — see `update`. Firing between steps is fine: a
          // chair moves 72 mm in one.
          for (const racer of field) {
            if (racer.id === owner.id || racer.finished) continue;
            if (Math.abs(racer.position.y - owner.position.y) > TUNING.band) continue;
            const dx = racer.position.x - owner.position.x;
            const dz = racer.position.z - owner.position.z;
            const len = Math.hypot(dx, dz);
            if (len > TUNING.coneReach || len < 0.2) continue;
            if ((dx / len) * to.x + (dz / len) * to.z < TUNING.coneCos) continue;
            if (!effects.vulnerable(racer.id)) continue;
            effects.blind(racer.id, TUNING.blind);
          }
          return;
        }

        case 'puddle': {
          const object = art.puddle();
          facing(owner.yaw, true, to);
          object.position.set(
            owner.position.x + to.x * TUNING.dropBack,
            owner.position.y,
            owner.position.z + to.z * TUNING.dropBack,
          );
          object.rotation.y = owner.yaw;
          root.add(object);
          puddles.push({ owner: owner.id, object, life: TUNING.puddleLife, age: 0 });
          return;
        }

        case 'training': {
          /*
           * Whoever is next up the road, and failing that whoever is next down
           * it.
           *
           * The leader draws this at five percent and would otherwise be handed
           * an item with nothing to do — and an item that fizzles is worse than
           * no item, because you spent a piñata on it. A compliance module that
           * turns round and finds the nearest person instead is both a working
           * answer and, of the two, the one that is actually in character.
           */
          let target: Racer | null = null;
          let bestGap = Infinity;
          for (const racer of field) {
            if (racer.id === owner.id || racer.finished) continue;
            const gap = racer.progress - owner.progress;
            if (gap > 1.5 && gap < bestGap) {
              bestGap = gap;
              target = racer;
            }
          }
          let direction: 1 | -1 = 1;
          if (!target) {
            direction = -1;
            bestGap = Infinity;
            for (const racer of field) {
              if (racer.id === owner.id || racer.finished) continue;
              const gap = owner.progress - racer.progress;
              if (gap > 1.5 && gap < bestGap) {
                bestGap = gap;
                target = racer;
              }
            }
          }
          if (!target) return;

          const object = art.binder.clone();
          root.add(object);
          probe.set(owner.position.x, owner.position.y, owner.position.z);
          const s = track.nearest(probe, 0, track.total / 2).s;
          homing.push({
            owner: owner.id,
            target: target.id,
            object,
            s,
            direction,
            lane: 0,
            life: TUNING.binderLife,
            age: 0,
          });
          return;
        }

        default:
          throwBody(kind, owner, backwards);
      }
    },

    update(h, racers) {
      field = racers;

      // -- the two that are bodies -------------------------------------------
      for (let i = flying.length - 1; i >= 0; i--) {
        const item = flying[i]!;
        item.age += h;
        item.life -= h;

        const p = item.body.translation();
        const r = item.body.rotation();
        item.object.position.set(p.x, p.y, p.z);
        item.object.quaternion.set(r.x, r.y, r.z, r.w);

        const skip = item.age < TUNING.ownerGrace ? item.owner : -1;
        const struck = nearest(racers, p.x, p.y, p.z, TUNING.reach, skip);

        if (item.kind === 'microwave') {
          // Contact or fuse, whichever comes first — and both end the same way,
          // which is why the contact case does not stun anybody directly.
          if (struck || item.life <= 0) {
            detonate(item, racers);
            drop(item);
            flying.splice(i, 1);
          }
          continue;
        }

        if (struck) {
          at.set(p.x, p.y, p.z);
          probe.set(struck.position.x, struck.position.y, struck.position.z);
          if (land(struck.id, item.kind, TUNING.cardStun, at, TUNING.cardShove)) {
            drop(item);
            flying.splice(i, 1);
            continue;
          }
        }
        if (item.life <= 0) {
          drop(item);
          flying.splice(i, 1);
        }
      }

      // -- the module ---------------------------------------------------------
      for (let i = homing.length - 1; i >= 0; i--) {
        const item = homing[i]!;
        item.age += h;
        item.life -= h;

        const target = racers[item.target];
        if (!target || target.finished) {
          root.remove(item.object);
          homing.splice(i, 1);
          continue;
        }

        item.s += TUNING.binderSpeed * item.direction * h;
        track.pointAt(item.s, point);

        /*
         * Across to the target's own line.
         *
         * The target's offset from the centre of the route is measured against
         * the route's right-hand normal at the module's own position rather than
         * at the target's — the two are within a few degrees of each other at
         * this range, and using one point means the lane is a continuous number
         * even as the module crosses a corner where the route's heading swings.
         */
        const yaw = track.headingAt(item.s);
        const nx = Math.cos(yaw);
        const nz = -Math.sin(yaw);
        const wanted = (target.position.x - point.x) * nx + (target.position.z - point.z) * nz;
        item.lane += (wanted - item.lane) * Math.min(1, h / TUNING.binderLane);

        const x = point.x + nx * item.lane;
        const z = point.z + nz * item.lane;
        item.object.position.set(x, point.y + 0.62, z);
        // Nose first, and rolling, because a binder held flat and level in flight
        // reads as a menu icon rather than as something thrown.
        item.object.rotation.set(0, yaw + (item.direction < 0 ? Math.PI : 0), item.age * 7);

        /*
         * Two ways to land it, and the second one is the one that matters.
         *
         * A radius alone does not work, and it took a 101 m chase to see why: the
         * module advances its own route distance at a flat 11 m/s and the target is
         * doing five and a half, so the closing is entirely in route-space — and
         * route-space is exactly where a radius measured across the floor stops
         * meaning anything. Measured, it came down from 62 m to under 7 and then went
         * back out to 11 without ever tripping a 1.15 m test: it had gone *past*, on a
         * lane offset, round the outside of a corner where two points a few metres
         * apart along the route are much further apart across the room.
         *
         * So the real test is whether it has caught up *along the lap*, which is the
         * only sense in which one of these ever catches anything. The radius stays as
         * the early out for a target that wanders into it side-on.
         */
        const reached = track.nearest(probe.set(target.position.x, target.position.y, target.position.z), item.s, 26).s;
        const caught = item.direction > 0 ? item.s >= reached : item.s <= reached;

        const dx = target.position.x - x;
        const dz = target.position.z - z;
        if ((caught || Math.hypot(dx, dz) < 1.15) && Math.abs(target.position.y - point.y) < TUNING.band) {
          at.set(x, point.y, z);
          probe.set(target.position.x, target.position.y, target.position.z);
          if (land(target.id, 'training', TUNING.binderStun, at, 0)) {
            root.remove(item.object);
            homing.splice(i, 1);
            continue;
          }
        }
        if (item.life <= 0) {
          root.remove(item.object);
          homing.splice(i, 1);
        }
      }

      // -- puddles ------------------------------------------------------------
      for (let i = puddles.length - 1; i >= 0; i--) {
        const item = puddles[i]!;
        item.age += h;
        item.life -= h;
        const p = item.object.position;
        const skip = item.age < TUNING.ownerGrace ? item.owner : -1;
        const struck = nearest(racers, p.x, p.y, p.z, TUNING.puddleReach, skip);
        if (struck) {
          at.copy(p);
          probe.set(struck.position.x, struck.position.y, struck.position.z);
          if (land(struck.id, 'puddle', TUNING.puddleStun, at, 0)) {
            root.remove(item.object);
            puddles.splice(i, 1);
            continue;
          }
        }
        if (item.life <= 0) {
          root.remove(item.object);
          puddles.splice(i, 1);
        }
      }

      // -- clouds, which are only ever looked at -------------------------------
      for (let i = clouds.length - 1; i >= 0; i--) {
        const cloud = clouds[i]!;
        cloud.age += h;
        const u = Math.min(1, cloud.age / cloud.span);
        // Out fast then slow, the way anything that disperses does.
        const grow = 1 - (1 - u) * (1 - u) * (1 - u);
        cloud.mesh.scale.setScalar(cloud.from + (cloud.to - cloud.from) * grow);
        (cloud.mesh.material as THREE.MeshBasicMaterial).opacity = cloud.peak * (1 - u * u);
        if (u >= 1) {
          root.remove(cloud.mesh);
          (cloud.mesh.material as THREE.Material).dispose();
          clouds.splice(i, 1);
        }
      }
    },

    trail(id, kind, at_, yaw) {
      let mine = trailed.get(id);
      if (!kind) {
        if (mine) {
          root.remove(mine.object);
          trailed.delete(id);
        }
        return;
      }
      if (!mine || mine.kind !== kind) {
        if (mine) root.remove(mine.object);
        const object = prototype(kind).clone();
        root.add(object);
        mine = { kind, object };
        trailed.set(id, mine);
      }
      facing(yaw, true, to);
      mine.object.position.set(at_.x + to.x * 1.05, at_.y + 0.34, at_.z + to.z * 1.05);
      mine.object.rotation.set(0, yaw, 0);
    },

    reset() {
      for (const item of flying) drop(item);
      flying.length = 0;
      for (const item of homing) root.remove(item.object);
      homing.length = 0;
      for (const item of puddles) root.remove(item.object);
      puddles.length = 0;
      for (const cloud of clouds) {
        root.remove(cloud.mesh);
        (cloud.mesh.material as THREE.Material).dispose();
      }
      clouds.length = 0;
      for (const mine of trailed.values()) root.remove(mine.object);
      trailed.clear();
      field = [];
    },
  };
}
