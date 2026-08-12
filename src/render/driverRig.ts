/**
 * Binding the driver's pose onto the driver's bones.
 *
 * `game/driver.ts` emits joint angles and knows nothing about a mesh; this is
 * the other half of that deal. Every offset below is authored as "rotate this
 * bone about *the chair's* axis by this much", which is how the motion is
 * actually thought about — the leg swings fore and aft, the torso rolls into the
 * corner — rather than in whatever frame each bone's rest orientation happens to
 * leave behind.
 *
 * The offsets are added to the pose the model was built in, never replacing it.
 * At zero throttle, zero steering and a standstill every angle here is zero and
 * the figure is exactly the sculpture `kit/build_character.py` exported, with
 * his backside on the cushion and his hands on the armrests. Nothing in here can
 * pull him off the chair.
 */

import * as THREE from 'three';

import type { DriverPose } from '../game/driver';

/** Chair-space axes. Forward is -Z, the game's convention throughout. */
const AXES = {
  right: new THREE.Vector3(1, 0, 0),
  up: new THREE.Vector3(0, 1, 0),
  forward: new THREE.Vector3(0, 0, -1),
} as const;

type AxisName = keyof typeof AXES;

type Joint = {
  bone: THREE.Bone;
  /** The angles the asset was built with. Everything is measured from here. */
  rest: THREE.Quaternion;
  /** The chair's axes, expressed in this bone's parent space. */
  axis: Record<AxisName, THREE.Vector3>;
};

/**
 * How far each leg swings, per unit of paddle, in radians.
 *
 * The swing is one-sided: each leg travels away from the pose it was modelled
 * in and back, never past it. The asset has the pushing foot exactly on the
 * carpet and the other one clear of it, so those two positions are the ends of
 * the stroke and nothing here has to guess where the floor is.
 *
 * Which leg is which comes from the asset and has to match it. The character was
 * rebuilt with the roles swapped — the right foot is now the planted one, out in
 * front, and the left is folded back — and driving the old assignment against the
 * new pose put the planted foot 42 mm through the carpet.
 *
 * The two halves are not mirror images, which is why they are tuned separately.
 * A trailing leg swung forward about the hip alone drops its ankle — the leg is
 * closer to vertical at the end of the swing than at the start, so it needs more
 * of its own length — and it drops it by more than a shoe is thick. Hence a knee
 * bend nearly twice the hip swing on the recovering leg: without it the foot
 * ploughs the carpet on the way through instead of clearing it.
 */
const RECOVER = { thigh: 0.50, shin: -0.95, foot: -0.28 };
const PLANT = { thigh: -0.38, shin: 0.42, foot: 0.18 };

type Offset = { bone: string; axis: AxisName; angle: (p: DriverPose) => number };

/** How far forward each leg is through its stroke, 0–1 of full amplitude. */
const forwardSwing = (p: DriverPose) => p.paddle * (p.stroke * 0.5 + 0.5);
const backSwing = (p: DriverPose) => p.paddle - forwardSwing(p);

/**
 * How far he has picked his feet up, 0–1 of a recovery swing.
 *
 * The asset is modelled mid-push with one sole flat on the carpet, which is the
 * right pose for the moment he is pushing and the wrong one for the moment he is
 * not: nobody keeps a foot down at six metres a second, and a shoe skimming the
 * floor at that speed reads as a bug rather than as a brake. So the trailing leg
 * folds up once he stops paddling and the room is moving past.
 */
const coast = (p: DriverPose) => p.airflow * (1 - p.paddle) * 0.38;

const OFFSETS: Offset[] = [
  // Torso. Lean is a roll about the direction of travel; pitch is a bend about
  // the sideways axis. Both are split across two joints so the back reads as a
  // curve rather than as a hinge at the waist.
  { bone: 'spine', axis: 'forward', angle: (p) => p.lean * 0.55 },
  { bone: 'chest', axis: 'forward', angle: (p) => p.lean * 0.45 },
  { bone: 'spine', axis: 'right', angle: (p) => p.pitch * 0.60 },
  { bone: 'chest', axis: 'right', angle: (p) => p.pitch * 0.40 },

  // Head. It leads into the corner, and it stays level while the torso pitches
  // under it — a driver's eyes do not go where his chest goes.
  { bone: 'neck', axis: 'up', angle: (p) => p.headYaw * 0.35 },
  { bone: 'head', axis: 'up', angle: (p) => p.headYaw * 0.65 },
  { bone: 'head', axis: 'right', angle: (p) => -p.pitch * 0.45 },

  // Arms. Elbows clamp in as the drift charges: he is holding on.
  { bone: 'upperarm.L', axis: 'forward', angle: (p) => -p.brace * 0.24 },
  { bone: 'upperarm.R', axis: 'forward', angle: (p) => p.brace * 0.24 },

  // Legs, out of phase with each other. The left leg is modelled at the end of
  // its push, so it swings forward to recover; the right is modelled cocked, so
  // it swings back to plant. Knees tuck as they come up and extend as they go
  // down, which is the difference between paddling and marching.
  // The right leg is modelled planted and extended, so its stroke is the pull:
  // back under the seat, lifting as it goes. The left is modelled folded up
  // behind, so its stroke is the reach: forward and down onto the carpet.
  { bone: 'thigh.R', axis: 'right', angle: (p) => (forwardSwing(p) + coast(p)) * RECOVER.thigh },
  { bone: 'shin.R', axis: 'right', angle: (p) => (forwardSwing(p) + coast(p)) * RECOVER.shin },
  { bone: 'foot.R', axis: 'right', angle: (p) => (forwardSwing(p) + coast(p)) * RECOVER.foot },
  { bone: 'thigh.L', axis: 'right', angle: (p) => backSwing(p) * PLANT.thigh },
  { bone: 'shin.L', axis: 'right', angle: (p) => backSwing(p) * PLANT.shin },
  { bone: 'foot.L', axis: 'right', angle: (p) => backSwing(p) * PLANT.foot },

  // The headphone cable, hanging off the left can. Modelled hanging — which is
  // what a cable does when nothing is happening — so the wind's job is to blow
  // it backwards, more of it the faster he goes. Split across three bones so it
  // curls rather than swinging like a plank on a hinge.
  //
  // This was the tie before he changed clothes. Same problem, same solution: the
  // asset renamed the bones and nothing else here had to change but the numbers,
  // which are lighter now because a cable has less to it than a necktie.
  { bone: 'cable.1', axis: 'right', angle: (p) => -p.airflow * 0.34 },
  { bone: 'cable.2', axis: 'right', angle: (p) => -p.airflow * 0.44 },
  { bone: 'cable.3', axis: 'right', angle: (p) => -p.airflow * 0.46 },
  // Sideways: a ripple that needs air to exist, and a swing to the outside of
  // the corner, which is the same force throwing his own weight about.
  { bone: 'cable.2', axis: 'forward', angle: (p) => p.flutter * 0.16 * p.airflow - p.lean * 0.40 },
  { bone: 'cable.3', axis: 'forward', angle: (p) => -p.flutter * 0.22 * p.airflow - p.lean * 0.30 },
];

export type DriverRig = { apply(pose: DriverPose): void };

/**
 * Read the rest pose off the loaded rig and return something that can drive it.
 *
 * The mapping from chair axes to each bone's parent space is taken once, from
 * the rest pose, rather than recomputed per frame from the live one. It is an
 * approximation — a bone whose parent has already been rotated is being turned
 * about a very slightly stale axis — but the offsets here are small, and the
 * alternative walks the hierarchy and forces a world-matrix update per bone
 * per frame for a difference nobody can see.
 */
export function bindDriver(root: THREE.Object3D): DriverRig {
  root.updateMatrixWorld(true);

  const rootQuat = new THREE.Quaternion();
  root.getWorldQuaternion(rootQuat);

  // glTF has no dots in node names: `thigh.L` arrives as `thighL` and `tie.1` as
  // `tie1`. Matching on the Blender names silently bound nothing at all and the
  // figure just sat there, which is why the lookup is by a flattened key and why
  // a miss below is an error rather than a shrug.
  const flatten = (name: string) => name.replace(/[^a-z0-9]/gi, '').toLowerCase();

  const skeleton = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    const bone = o as THREE.Bone;
    if (bone.isBone) skeleton.set(flatten(bone.name), bone);
  });

  const joints = new Map<string, Joint>();
  const parentQuat = new THREE.Quaternion();
  const missing: string[] = [];

  for (const name of new Set(OFFSETS.map((o) => o.bone))) {
    const bone = skeleton.get(flatten(name));
    if (!bone?.parent) {
      missing.push(name);
      continue;
    }

    // A vector in chair space becomes one in this bone's parent space by going
    // out to world through the root and back in through the parent.
    bone.parent.getWorldQuaternion(parentQuat);
    const toParent = parentQuat.invert().multiply(rootQuat);

    joints.set(name, {
      bone,
      rest: bone.quaternion.clone(),
      axis: {
        right: AXES.right.clone().applyQuaternion(toParent),
        up: AXES.up.clone().applyQuaternion(toParent),
        forward: AXES.forward.clone().applyQuaternion(toParent),
      },
    });
  }

  if (missing.length) {
    throw new Error(
      `driver rig is missing bones: ${missing.join(', ')} — the asset and ` +
        'src/render/driverRig.ts have gone out of step',
    );
  }

  const driven = [...joints.values()];
  const step = new THREE.Quaternion();

  return {
    apply(pose) {
      for (const joint of driven) joint.bone.quaternion.copy(joint.rest);

      for (const offset of OFFSETS) {
        const joint = joints.get(offset.bone);
        if (!joint) continue;
        const angle = offset.angle(pose);
        if (Math.abs(angle) < 1e-4) continue;
        step.setFromAxisAngle(joint.axis[offset.axis], angle);
        // Pre-multiplied: the offset happens in the parent's frame, on top of
        // the modelled pose. Multiplying the other way would apply it in the
        // bone's own frame and turn a lean into a corkscrew.
        joint.bone.quaternion.premultiply(step);
      }
    },
  };
}
