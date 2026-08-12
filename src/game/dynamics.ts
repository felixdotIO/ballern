/**
 * Loose furniture as dynamic bodies.
 *
 * Unlike the player's chair, none of these lock their rotation — a bin that
 * skitters across the carpet and a plant that goes over are most of what makes
 * hitting things feel worth doing, and a chair that stays bolt upright after
 * being rammed reads as scenery rather than as furniture.
 *
 * Each prop's visual is hung inside a holder group and pushed down by the
 * collider's centre offset, so when the body rolls the mesh rolls about the
 * same point rather than pivoting around its own feet.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import type { DynamicProp } from '../office/collision';
import { collapse } from '../render/batch';

export type Dynamics = {
  root: THREE.Group;
  /** Copy body transforms onto the meshes. Sleeping bodies are skipped. */
  sync(): void;
  reset(): void;
  /** Which prop the nth child of `root` is, so a failing check can name it. */
  labelOf(index: number): string | undefined;
};

export function createDynamics(world: RAPIER.World, props: readonly DynamicProp[]): Dynamics {
  const root = new THREE.Group();
  const entries: { body: RAPIER.RigidBody; holder: THREE.Group; home: DynamicProp }[] = [];

  for (const prop of props) {
    const holder = new THREE.Group();
    // A loose prop is a rigid body, so its parts never move relative to each
    // other — which means the whole thing can be one mesh per material without
    // giving anything up. A stacking chair goes from ten draws to two, and
    // there are a hundred and twenty of them.
    const visual = collapse(prop.object, { detail: 'high' });
    visual.position.y = -prop.centreOffset;
    holder.add(visual);
    root.add(holder);

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(prop.position[0], prop.position[1] + prop.centreOffset, prop.position[2])
        .setRotation({ x: 0, y: Math.sin(prop.yaw / 2), z: 0, w: Math.cos(prop.yaw / 2) })
        .setLinearDamping(prop.linearDamping)
        .setAngularDamping(prop.angularDamping),
    );
    // Deliberately no continuous collision detection, unlike the player's
    // chair. CCD is a swept query against the whole static broad-phase every
    // substep, and with a hundred and thirty loose props on the floorplate the
    // cost of switching it on for all of them is an order of magnitude more
    // than the cost of the collisions themselves. It also buys nothing: a bin
    // leaves at eight metres a second, which is 67 mm per substep against a
    // 200 mm wall. Only the thing doing thirteen needs sweeping.
    //
    // Cheap once they settle, either way: an untouched room costs nothing
    // because every body falls asleep and stops being simulated.

    const desc =
      prop.shape.kind === 'box'
        ? RAPIER.ColliderDesc.cuboid(prop.shape.size[0] / 2, prop.shape.size[1] / 2, prop.shape.size[2] / 2)
        : RAPIER.ColliderDesc.cylinder(prop.shape.halfHeight, prop.shape.radius);

    world.createCollider(desc.setMass(prop.mass).setFriction(0.55).setRestitution(0.12), body);
    entries.push({ body, holder, home: prop });
  }

  const sync = () => {
    for (const { body, holder } of entries) {
      if (body.isSleeping()) continue;
      const p = body.translation();
      const r = body.rotation();
      holder.position.set(p.x, p.y, p.z);
      holder.quaternion.set(r.x, r.y, r.z, r.w);
    }
  };

  // Place the meshes once up front, so nothing is at the origin on frame one.
  for (const { body, holder } of entries) {
    const p = body.translation();
    const r = body.rotation();
    holder.position.set(p.x, p.y, p.z);
    holder.quaternion.set(r.x, r.y, r.z, r.w);
  }

  return {
    root,
    sync,
    labelOf: (index) => entries[index]?.home.label,
    reset() {
      for (const { body, home } of entries) {
        body.setTranslation({ x: home.position[0], y: home.position[1] + home.centreOffset, z: home.position[2] }, true);
        body.setRotation({ x: 0, y: Math.sin(home.yaw / 2), z: 0, w: Math.cos(home.yaw / 2) }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      }
      sync();
    },
  };
}
