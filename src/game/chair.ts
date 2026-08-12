/**
 * The player's chair: the driving model, wrapped around the shared task-chair
 * prop. The mesh is the same builder every chair in the room uses, so replacing
 * it with the Blender asset later changes both at once.
 *
 * The driving model is arcade, not simulation. Rotation is locked in the solver
 * and heading is driven directly, so the chair can never tip, spin out
 * unrecoverably, or get wedged on its own castors — three failure modes that
 * would be authentic and also miserable to play.
 */

import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

import { CHAIR } from '../office/metrics';
import { raceChair } from '../render/kit';
import { makeRng, seedFrom } from '../office/rng';
import type { Physics } from './physics';

/** Collider is a capsule sized off the five-star base, not off the sitter. */
const RADIUS = CHAIR.baseDiameter / 2;
const HALF_HEIGHT = 0.22;
const CENTRE_Y = HALF_HEIGHT + RADIUS;

/**
 * How far the body's centre sits above the floor the castors are on.
 *
 * Exported because the body's translation is what everything in the sim loop
 * has to hand and the *floor* is what it wants to know about: which level the
 * chair is on, which gate it may take, how high the camera may rise. Subtracting
 * this is the difference between the two, and it is worth naming rather than
 * repeating 0.55 in three files.
 */
export const FLOOR_OFFSET = CENTRE_Y;

const DRIVE = {
  // Deliberately unhurried. 9 m/s crossed a 20 m bay in barely two seconds,
  // which left no time to read the room — and reading the room is the point of
  // having built it. 6 m/s is still a hard sprint for something on castors.
  maxSpeed: 6.0,
  maxReverse: 2.2,
  accel: 5.6,
  brake: 11.0,
  /** Castors on carpet. This is why an office chair is exhausting to push. */
  rollingDrag: 1.3,
  steerRate: 2.7,
  /** You can still spin on the spot, just slowly — chairs do that. */
  minSteerAuthority: 0.3,
  /** Fraction of sideways velocity surviving one second. */
  gripRetainPerSecond: 0.02,
  driftRetainPerSecond: 0.55,
  boostPerChargeUnit: 0.95,
  maxBoost: 2.6,
  /** Anything above the speed ceiling bleeds off at this rate. */
  overspeedDrag: 3.0,
  /**
   * How far a slope moves the speed ceiling, in m/s per m/s² of gravity along
   * the chair's facing.
   *
   * The ramps are the reason this exists, and it is the difference between a
   * ramp and a picture of one. Left to the acceleration term alone, a 13.6%
   * gradient contributes 1.3 m/s² and the overspeed drag takes 3.0 m/s² back
   * off anything over the top speed — so the descent gains exactly nothing, the
   * climb is out-accelerated by the throttle within half a second, and both
   * ramps become texture you drive across at a constant six metres a second.
   *
   * What actually happens to a thing on castors is that the slope, not the
   * drive, is what sets its speed: you cannot walk an office chair up a garage
   * ramp at walking pace and you cannot hold one back going down. So the slope
   * moves the ceiling. At 13.6% that is 6.0 m/s on the flat against 4.2 up and
   * 7.8 down, which costs about a second and a half on the climb and hands most
   * of it back on the descent — and, more to the point, is felt.
   */
  slopeSpeedGain: 1.4,

  /*
   * ---- being in the air --------------------------------------------------
   *
   * Three things change the moment the castors leave the floor, and each of them
   * is the difference between a jump and a hiccup.
   *
   * Nothing slows you down. No rolling drag, no slope, no grip: a chair in the
   * air is a projectile, and the solver already owns the only force acting on
   * it. Left in, the drag alone bled half a metre a second out of every hop and
   * the landing felt like arriving at a wall.
   *
   * You can spin. Steering authority off the ground is not the tyre-limited
   * thing it is on carpet — it is a person kicking their legs — so it is
   * generous and *only* rotates the chair. The velocity keeps its own direction,
   * which is what makes a spin a spin rather than a mid-air turn.
   *
   * Landing something pays. Air time and rotation both bank into one shove of
   * speed on touchdown, and the cap is deliberately below a full drift boost: a
   * ramp is a reason to take the fast line, not a replacement for driving well.
   */
  /*
   * Rotation off the ground, rad/s. Nearly three times the grounded rate.
   *
   * Not a tyre-limited number — there is no tyre — but a person swinging their
   * legs and hips, which is both quicker and less precise than steering. It is
   * set so that the air a kicker actually gives is enough for a half turn if you
   * commit to it from the lip: 7 rad/s against 0.45 s is 180°, with the rest of
   * the jump spent getting it back round to face the landing.
   */
  airSteerRate: 7.0,
  /** How long off the floor before it counts as a jump at all. */
  trickAir: 0.22,
  /*
   * m/s of landing boost per second of air, and per whole turn.
   *
   * Set so that a jump taken well is worth taking. The climb costs about 1.5 m/s
   * even at the shallowest angle worth building, so a payout that only broke even
   * would leave every ramp on the lap as something to steer around — and a track
   * feature nobody uses is worse than one that was never built. Half a second of
   * air pays 1.2 back, and landing it with a full turn in pays another one, which
   * puts a clean jump slightly ahead of the flat line and a clumsy one behind it.
   */
  boostPerAirSecond: 2.4,
  boostPerHalfTurn: 1.1,
  maxTrickBoost: 2.6,
} as const;

/** m/s². The one physical constant the driving model does not make up. */
const GRAVITY = 9.81;

/**
 * How far off level a surface may be and still count as something to drive on.
 *
 * The probe finds walls, kerbs, wheel stops and the lip of the drainage channel
 * as readily as it finds the ramp, and a normal that is nearly horizontal
 * belongs to something the chair has hit rather than something it is standing
 * on. Without this the first wall clipped at speed reads as a cliff and hands
 * the driving model an enormous slope term.
 */
const DRIVABLE_NORMAL_Y = 0.5;
/** And a ceiling on the term itself, so no single freak contact can launch it. */
const MAX_SLOPE_PULL = 3.0;

/**
 * What the chair knows about itself, expressed in its own frame so the driver
 * animation never has to do vector maths to work out which way it is sliding.
 */
export type Telemetry = {
  /** Speed along the chair's facing. Negative when reversing. */
  along: number;
  /** Sideways speed, positive to the chair's right. */
  lateralRight: number;
  /** Accumulated drift charge. */
  charge: number;
  /** Sudden loss of forward speed this step, in m/s. Impacts spike this. */
  impact: number;
  /** Nothing under the castors. The driver animation stops paddling on this. */
  airborne: boolean;
  /** Seconds since the castors left the floor, 0 on the ground. */
  air: number;
};

/**
 * A jump, once it has been landed.
 *
 * Emitted on the touchdown rather than at the lip, because an aerial you did not
 * land is not a trick — it is a crash, and rewarding it would make the ramps a
 * way of skipping the driving rather than a reason to do it well.
 */
export type Trick = {
  /** Seconds off the ground. */
  air: number;
  /**
   * How far the chair turned while it was off the floor, degrees, unsigned.
   *
   * Degrees rather than whole spins, and that is a measurement rather than a
   * preference: the ramps give about four tenths of a second of air, and no rate
   * of mid-air rotation that still looks like a person kicking a chair round gets
   * a full turn done in that. Scoring in 360s would have meant scoring nothing,
   * every time, forever. A half turn is achievable, reads clearly, and is worth
   * paying for.
   */
  degrees: number;
  /** How much speed the landing paid out, m/s. */
  boost: number;
};

export type Input = {
  throttle: number; // -1..1
  steer: number; // -1..1
  drift: boolean;
};

export type Chair = {
  object: THREE.Group;
  /** Exposed so the camera's occlusion ray can exclude the player's own body. */
  body: RAPIER.RigidBody;
  update(h: number, input: Input): void;
  sync(): void;
  speed(): number;
  driftCharge(): number;
  /** Sim state the driver's animation reads. All in chair-local terms. */
  telemetry(): Telemetry;
  /**
   * The last landed jump, once. Consumed by whoever reports it.
   *
   * Handed over rather than pushed, for the same reason `race.takeSplit` is: the
   * landing happens inside a fixed substep and the thing that wants to say so is
   * a DOM node updated once a frame. A callback from in there would fire up to
   * eight times between two paints.
   */
  takeTrick(): Trick | null;
  reset(): void;
  /**
   * Drop the chair somewhere with a heading and a starting speed. Used for
   * race grid positions, respawns, and the tunnelling test.
   *
   * `y` is the floor it is being stood on, not where its middle goes. It
   * defaults to the office floor, which is where everything that asks for a
   * respawn still means — but it has to be askable, because a chair reset while
   * it is on Ebene 5 and put back at deck height is a chair placed inside three
   * metres of concrete.
   */
  place(x: number, z: number, heading: number, speed?: number, y?: number): void;
};

export function createChair(
  physics: Physics,
  spawn: { position: readonly [number, number, number]; yaw: number },
): Chair {
  const world = physics.world;

  /*
   * The player's chair is the same asset as every chair standing at a desk, with
   * the armrests left off — see the note at the top of `kit/build_chair.py`.
   *
   * The cast sits with its hands forward in its lap, which is how anybody sits on
   * a chair that has no arms, so on the armed version the forearms passed straight
   * through both pads: 195 figure vertices inside the post and 254 inside the pad,
   * measured, on every frame. Taking the arms off the thing being driven is a
   * smaller lie than a driver whose elbows are inside the furniture, and it leaves
   * the thirty-odd chairs in the rooms exactly as they were.
   */
  const object = raceChair(makeRng(seedFrom('player.chair'))).group;

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.position[0], CENTRE_Y, spawn.position[2])
      // Heading is driven directly rather than by torque. Locking rotation in
      // the solver is what stops the chair tipping or pinwheeling on contact.
      .lockRotations()
      .setLinearDamping(0)
      .setCanSleep(false),
  );
  // Continuous collision detection. Without this a fast chair can pass through
  // a partition between two substeps no matter how thick the collider is.
  body.enableCcd(true);

  world.createCollider(
    // Person plus chair. Heavy relative to a 1.2 kg bin, so shoving furniture
    // out of the way feels like the chair won rather than like it bounced.
    RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setMass(95).setFriction(0.02).setRestitution(0.1),
    body,
  );

  let yaw = spawn.yaw;
  let charge = 0;
  let boosting = false;
  const telemetry: Telemetry = { along: 0, lateralRight: 0, charge: 0, impact: 0, airborne: false, air: 0 };

  /** The jump in progress, and the one waiting to be reported. */
  let air = 0;
  let spun = 0;
  let landed: Trick | null = null;
  const right = new THREE.Vector3();

  const forward = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const probe = new THREE.Vector3();
  const ground = new THREE.Vector3(0, 1, 0);

  function currentForward(): THREE.Vector3 {
    // three's convention: an unrotated object faces -Z.
    return forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  /**
   * Gravity resolved along the chair's own facing, on whatever it is standing
   * on. Zero on the flat, positive pointing downhill, negative uphill.
   *
   * The surface comes from a ray rather than from the plan, so this is right on
   * the ramps, right on their transitions, and right on anything sloping that
   * gets built later without a line of it having to be kept in step. Only the
   * horizontal part is wanted: `along` is a speed in plan, because the solver
   * owns the vertical.
   */
  function slopeAlong(fwd: THREE.Vector3): number {
    const p = body.translation();
    probe.set(p.x, p.y, p.z);
    if (!physics.groundNormal(probe, HALF_HEIGHT + RADIUS + 0.3, body, ground)) return 0;
    if (ground.y < DRIVABLE_NORMAL_Y) return 0;

    const pull = GRAVITY * ground.y * (ground.x * fwd.x + ground.z * fwd.z);
    return Math.max(-MAX_SLOPE_PULL, Math.min(MAX_SLOPE_PULL, pull));
  }

  /**
   * Whether anything is under the castors.
   *
   * A tighter reach than the slope probe on purpose: `slopeAlong` wants to know
   * about the surface it is *approaching* over a 300 mm look-ahead, and this
   * wants to know whether the chair is standing on one right now. Sharing one
   * probe made the chair count as grounded for the whole first third of every
   * jump, which is exactly the third where the air time is decided.
   */
  function onGround(): boolean {
    const p = body.translation();
    probe.set(p.x, p.y, p.z);
    return physics.groundNormal(probe, HALF_HEIGHT + RADIUS + 0.06, body, ground);
  }

  function update(h: number, input: Input): void {
    const v = body.linvel();
    velocity.set(v.x, 0, v.z);
    const fwd = currentForward();

    let along = velocity.dot(fwd);
    lateral.copy(velocity).addScaledVector(fwd, -along);

    const grounded = onGround();

    /*
     * In the air, and nothing else in this function applies.
     *
     * Handled first and returned from rather than threaded through the drive
     * model with a flag, because almost every line below is about a contact
     * patch that does not exist: the throttle has nothing to push against, the
     * slope is of a floor a foot underneath, and the grip term would quietly
     * delete the sideways velocity that a spin is made of. The solver keeps the
     * ballistic arc; all this does is let you turn while it happens and count
     * what you did.
     */
    if (!grounded) {
      air += h;
      const turn = input.steer * DRIVE.airSteerRate * h;
      yaw -= turn;
      spun += Math.abs(turn);

      telemetry.impact = 0;
      telemetry.along = along;
      right.set(-fwd.z, 0, fwd.x);
      telemetry.lateralRight = lateral.dot(right);
      telemetry.charge = charge;
      telemetry.airborne = true;
      telemetry.air = air;

      body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      return;
    }

    // Down. Anything worth calling a jump pays out here, once.
    if (air > 0) {
      if (air >= DRIVE.trickAir) {
        const degrees = (spun * 180) / Math.PI;
        const boost = Math.min(
          DRIVE.maxTrickBoost,
          air * DRIVE.boostPerAirSecond + (degrees / 180) * DRIVE.boostPerHalfTurn,
        );
        along += boost * Math.sign(along || 1);
        landed = { air, degrees, boost };
      }
      air = 0;
      spun = 0;
      telemetry.airborne = false;
      telemetry.air = 0;
    }

    // What the slope is doing, before anything else asks how fast the chair may
    // go — because on a ramp that is the thing setting the answer.
    const slope = slopeAlong(fwd);
    const cap = Math.max(1.5, DRIVE.maxSpeed + slope * DRIVE.slopeSpeedGain);

    // Steering. Authority scales with speed so the chair is twitchy when it is
    // actually moving, but can still be shuffled around at a standstill.
    const authority = Math.max(DRIVE.minSteerAuthority, Math.min(1, Math.abs(along) / 3));
    yaw -= input.steer * DRIVE.steerRate * authority * h;

    // Throttle. It can never push past the top speed on its own — only a drift
    // boost may, and the overspeed drag below is what bleeds that back down.
    // Without this cap the throttle simply out-accelerates the drag and the
    // chair keeps climbing to the hard ceiling.
    if (input.throttle > 0) {
      along = Math.min(along + DRIVE.accel * input.throttle * h, Math.max(cap, along));
    } else if (input.throttle < 0) {
      // Brake hard while still rolling forward, then reverse — and both are the
      // same key, because a chair has no gears.
      //
      // The sign here was wrong and reverse never worked: with the throttle at
      // -1 the second branch evaluated to a *positive* acceleration, so holding
      // S at a standstill crept the chair forwards. Subtracting unconditionally
      // is what the two cases actually have in common; only the rate differs.
      const rate = along > 0 ? DRIVE.brake : DRIVE.accel * 0.6;
      along = Math.max(along - rate * -input.throttle * h, -DRIVE.maxReverse);
    } else {
      const drag = DRIVE.rollingDrag * h;
      along = Math.abs(along) <= drag ? 0 : along - Math.sign(along) * drag;
    }

    // Gravity gets its say whatever the throttle is doing, which is what makes
    // a chair left alone on a ramp roll down it.
    along += slope * h;

    // Grip. Drifting keeps most of the sideways velocity, which is the whole
    // appeal of a chair on a hard-wearing loop pile.
    const retain = input.drift ? DRIVE.driftRetainPerSecond : DRIVE.gripRetainPerSecond;
    lateral.multiplyScalar(Math.pow(retain, h));

    // Drift charge accumulates from how sideways the chair actually is, not
    // from holding the button.
    const slide = lateral.length();
    if (input.drift && slide > 1) {
      charge += slide * h;
      boosting = true;
    } else if (boosting) {
      along += Math.min(charge * DRIVE.boostPerChargeUnit, DRIVE.maxBoost) * Math.sign(along || 1);
      charge = 0;
      boosting = false;
    }

    /*
     * Overspeed bleeds off against the *flat* ceiling, not the slope's.
     *
     * This drag exists for one job: to take back a drift boost over a couple of
     * seconds instead of leaving it on the clock forever. On a climb the slope
     * has already lowered the ceiling — that is the whole point of it — and
     * measuring the drag against the lowered figure charged the gradient twice.
     * A kicker showed exactly how much: 22° took a chair arriving at 6 m/s down
     * to 1.8 over 1.3 m of ply, because the slope term subtracted 3 m/s² and the
     * drag subtracted another 3 for being "over" a ceiling of 1.8. Gravity on a
     * 22° slope is 3.4 m/s² and nothing else is acting on it, so the honest
     * answer is about 4.7 at the lip — enough momentum to jump with.
     *
     * The long ramps are unaffected. The throttle still cannot push past the
     * slope's cap, so the garage's 13.6% climb still settles at the 4.2 m/s the
     * note above describes; what has changed is that arriving at it fast is no
     * longer punished for the arriving.
     */
    const flat = Math.max(cap, DRIVE.maxSpeed);
    const ceiling = flat + DRIVE.maxBoost;
    if (along > flat) along = Math.max(flat, along - DRIVE.overspeedDrag * h);
    along = Math.max(-DRIVE.maxReverse, Math.min(ceiling, along));

    // Record before the solver gets it, so an impact shows up as the gap
    // between what we asked for and what we had last step.
    right.set(-fwd.z, 0, fwd.x);
    telemetry.impact = Math.max(0, telemetry.along - along);
    telemetry.along = along;
    telemetry.lateralRight = lateral.dot(right);
    telemetry.charge = charge;

    velocity.copy(lateral).addScaledVector(fwd, along);
    // y is left to the solver so gravity, ramps and kerbs keep working.
    body.setLinvel({ x: velocity.x, y: v.y, z: velocity.z }, true);
    body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  }

  function sync(): void {
    const p = body.translation();
    object.position.set(p.x, p.y - CENTRE_Y, p.z);
    object.rotation.y = yaw;
  }

  return {
    object,
    body,
    update,
    sync,
    speed() {
      const v = body.linvel();
      return Math.hypot(v.x, v.z);
    },
    driftCharge() {
      return charge;
    },
    telemetry() {
      return telemetry;
    },
    takeTrick() {
      const trick = landed;
      landed = null;
      return trick;
    },
    reset() {
      this.place(spawn.position[0], spawn.position[2], spawn.yaw, 0);
    },
    place(x, z, heading, speed = 0, y = 0) {
      body.setTranslation({ x, y: y + CENTRE_Y, z }, true);
      yaw = heading;
      const fwd = currentForward();
      body.setLinvel({ x: fwd.x * speed, y: 0, z: fwd.z * speed }, true);
      body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      charge = 0;
      boosting = false;
      // A chair put back on the grid is not mid-jump, and must not pay out for
      // the one it was on when the race was restarted.
      air = 0;
      spun = 0;
      landed = null;
      telemetry.airborne = false;
      telemetry.air = 0;
    },
  };
}
