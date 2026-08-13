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
  /** The largest single boost anything can hand out. Sets the speed ceiling. */
  maxBoost: 4.2,
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
  /**
   * And per flip brought all the way over.
   *
   * The largest single term of the three, on purpose: the air is what the ramp
   * gave you and the spin is nearly free, but a flip is the only one of them you
   * can decline — and the only one that can cost you the landing. A thing you can
   * fail has to pay more than a thing you cannot.
   */
  boostPerFlip: 1.4,
  /**
   * The ceiling, raised from 2.6 with the flips.
   *
   * 2.6 was set against air and spin alone, where a good jump landed on about 2.3
   * and the cap was a backstop nobody reached. With a flip worth 1.4 on top it
   * stopped being a backstop and started being the *whole* payout — a clean flip
   * and a sloppy one paid the same 2.6, which is the one thing a trick system must
   * never do. 3.8 puts the cap back above what a good jump earns and leaves it
   * doing its original job, which is to keep a big kicker off the drift ladder's
   * top rung. A full drift boost is still worth more.
   */
  maxTrickBoost: 3.8,

  /*
   * ---- flips ---------------------------------------------------------------
   *
   * The spin above is a *held* rotation: hold left, keep turning, and the payout
   * counts up with the degrees. That is right for a spin, because a spin is a
   * quantity — you can be a bit sideways. A flip is not a quantity. You either
   * bring it all the way round or you land on your face, so it is a thing you
   * *commit* to and then either finish or do not.
   *
   * So a flip is fired rather than held: one press of the throttle in the air
   * starts a whole turn about the chair's own right axis, and it runs to
   * completion on its own. Forward on W, backward on S, and it chains — the
   * moment one comes round the next press starts another.
   *
   * Fired on the *edge* rather than on the axis, and that is the whole of why it
   * is playable. Almost everybody goes up a ramp with the throttle pinned, and a
   * held throttle that flipped you would mean the game punishing the one input
   * every player already has held down. A key that is already down when the
   * castors leave the floor is not a press. Letting go and pressing again is, and
   * that is a gesture you can decide to make with the ramp already under you.
   */
  /**
   * Rotation once a flip is under way, rad/s.
   *
   * 14 brings a whole turn round in 0.45 s, which is not a number picked for how
   * it looks — it is the air a kicker on this floor actually gives. Slower and a
   * flip is a thing you can only ever bail; much faster and it is a strobe. As it
   * stands one flip off a standard ramp is *just* landable and two is for the big
   * kicker in the garage, which is the right shape for a trick.
   */
  flipRate: 14,
  /**
   * How near level the seat has to be on touchdown, radians.
   *
   * 0.7 is 40°, which is generous, and deliberately: the rule has to be legible
   * from inside a moving chair with a camera rolling behind it, and a tight window
   * makes a flip a coin toss rather than a decision. It is still a real rule —
   * land halfway round and the jump pays nothing and takes speed off you.
   */
  uprightWindow: 0.7,
  /** What is left of your speed when you land one on its back. */
  bailKeep: 0.55,

  /*
   * ---- being hit -----------------------------------------------------------
   *
   * A spin-out, not a stop. The chair keeps going where it was going and stops
   * being steered, which is both what happens to a person on castors who is hit
   * by something and the only version that is survivable: a chair that halts dead
   * in a 2.5 m doorway is a chair the entire field then has to drive around, and
   * you spend the recovery looking at a wall rather than at the road.
   *
   * 9 rad/s is a turn and a half over a 1.05 s puddle and two and a half over a
   * 1.7 s module — unmistakable, and slow enough that the room is still readable
   * through it, which matters because the camera is going round with you.
   */
  stunSpin: 9,
  /** What it coasts down to while it spins, and how fast it gets there. */
  stunSpeed: 1.4,
  stunBrake: 5.5,
} as const;

/**
 * The drift ladder, and it is the one mechanic in this game that has to be worth
 * doing over and over.
 *
 * ---- why a ladder and not a number ---------------------------------------
 *
 * The charge used to buy speed linearly: hold the slide, get `charge × 0.95`
 * capped at 2.6. That is a *reward*, and a reward is not a mechanic — it pays the
 * same whether you thought about it or not, so there is no moment in a corner
 * where anything is at stake. The lap was a series of corners you took as well as
 * you could and were paid for accordingly, which is exactly the flat, uneventful
 * feeling this is meant to fix.
 *
 * Three thresholds turn the same corner into a held decision. At any instant you
 * know which rung you are on and what the next one is worth, and letting go is a
 * choice: take 1.6 now, or stay sideways through the apex — where the wall is —
 * for 2.9, or commit to the whole corner for 4.2. Nothing about the driving model
 * changed; what changed is that there is now a question being asked continuously,
 * and the answer is different depending on whether the doorway ahead is wide.
 *
 * The gaps widen as you climb (0.6, then 0.9, then 1.2 of charge) while the
 * payouts do not quite keep pace. That is deliberate and it is what stops the top
 * rung being the only one worth having: the third tier costs twice what the first
 * does and pays a little over twice, so it is worth going for when the road allows
 * and never worth throwing a corner away for.
 *
 * The top of the ladder is 4.2 m/s onto a 6.0 m/s chair — a 70% overspeed, held
 * for a second and a bit before `overspeedDrag` takes it back. That is a real
 * event, which is the point: the old 2.6 arrived and left without being noticed.
 */
/*
 * The thresholds are **metres slid sideways**, which is what `charge` has always
 * accumulated — `charge += slide · h`. Reading them as distances is worth doing
 * because it is the only way to tell whether they are set sensibly: the top rung
 * asks for 7.2 m of sideways travel, which is most of the way round a real corner
 * and cannot be had by flicking the button on a straight.
 *
 * The first values here were 0.6, 1.5 and 2.7 and they were far too cheap.
 * Measured on open floor, a slide develops about 4 m of sideways travel a second,
 * so the whole ladder was climbed in 0.7 s — the top rung arrived before a corner
 * had properly begun, every rung was reached on every corner, and a ladder that is
 * always fully climbed is the flat reward it replaced. At 1.5 / 4.0 / 7.2 the
 * rungs land around 0.5 s, 1.1 s and 1.9 s of committed drift, which is one
 * ordinary corner, one long one, and one you have to plan.
 */
export const DRIFT_TIERS = [
  { at: 1.5, boost: 1.6, hold: 0.55 },
  { at: 3.6, boost: 2.9, hold: 0.85 },
  { at: 5.8, boost: 4.2, hold: 1.2 },
] as const;

/**
 * How much of the sideways velocity the castors redirect forward on the exit.
 *
 * ---- the thing that was actually wrong with drifting ----------------------
 *
 * Traced on open floor, a drift does not cost you any speed at all: entering at
 * 6.0 m/s the chair is doing 6.96 a second later. What it does is *point* that
 * speed sideways — `along` falls to 1.3 while the slide climbs past 6.5. Then the
 * moment the drift ends, `gripRetainPerSecond` deletes 98% of the sideways
 * component in a second, and all of that speed simply ceases to exist. You come
 * out of a corner at 1.3 m/s, are handed a 2.9 m/s boost, and arrive at 4.2 —
 * slower than the 6.0 you would have had by not drifting at all.
 *
 * Which means the most interesting thing in the game was strictly punished, and
 * no amount of tiering the reward fixes a move that is a net loss. It is the
 * whole answer to "driving feels slowish and static": the fast line was to never
 * do the fun thing.
 *
 * So the exit redirects rather than scrubs. Half the sideways speed is turned
 * into forward speed — the castors biting and the momentum going where the chair
 * is now pointing, which is also roughly what happens to a real chair — and only
 * the rest is lost. On a good slide that is another 3 m/s on top of the rung, so
 * a committed drift now leaves a corner *faster* than a tidy one, which is the
 * only arrangement under which anybody will ever choose to do it.
 */
const DRIFT_RECOVER = 0.5;

/** Charge at which the gauge's ring is full: the top rung, and no further. */
export const CHARGE_FULL = DRIFT_TIERS[DRIFT_TIERS.length - 1]!.at;

/** Which rung a given charge has reached, 0 to 3. */
export function tierOf(charge: number): number {
  let tier = 0;
  for (const step of DRIFT_TIERS) if (charge >= step.at) tier++;
  return tier;
}

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
  /**
   * Whole flips brought all the way round before touchdown.
   *
   * Counted on completion rather than as an angle, which is the difference
   * between a flip and the spin above: a spin that is 200° round is worth 200°,
   * and a flip that is 200° round is worth nothing at all, because it is a chair
   * about to land on somebody's head. Only the ones that came back to level are
   * in here, so a bail reports the flips it *did* finish and no credit for the one
   * it was in the middle of.
   */
  flips: number;
  /** How much speed the landing paid out, m/s. Zero on a bail. */
  boost: number;
  /**
   * Whether it came down on its castors.
   *
   * False means the seat was past `uprightWindow` at touchdown: no payout, and a
   * bite taken out of the speed. Reported rather than swallowed because the screen
   * has to say *why* a jump paid nothing, or a bail is indistinguishable from a
   * bug.
   */
  clean: boolean;
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
  /** Which rung the charge has climbed to right now, 0–3. For the sparks. */
  driftTier(): number;
  /**
   * The rung a boost just fired at, once, then 0.
   *
   * Handed over rather than pushed, for the reason `takeTrick` and `race.takeSplit`
   * are: the release happens inside a fixed substep and everything that wants to
   * react to it — a camera punch, a flash, a sound — happens once a frame.
   */
  takeBoost(): number;
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

  /*
   * ---- what an item is allowed to do to it ---------------------------------
   *
   * Three verbs, and they are deliberately three rather than one general-purpose
   * "apply a force": the driving model owns the velocity outright — it writes
   * `setLinvel` every substep from its own `along` and `lateral` — so anything
   * pushed in from outside through the solver is overwritten before the next
   * frame draws. Each of these instead posts into the model and is picked up at
   * the top of the next step, which is why all three are safe to call from a key
   * handler on the frame.
   */
  /** Spun out: no control at all for `seconds`, on top of any already left. */
  stun(seconds: number): void;
  /** Seconds of spin-out left. Zero when it is being driven. */
  stunned(): number;
  /**
   * Straight speed along the facing, m/s, with the speed ceiling lifted by the
   * same amount for `hold` seconds.
   *
   * The hold is the whole of what makes the fire extinguisher a shove rather than a
   * tap. `overspeedDrag` exists to take a drift boost back over a couple of
   * seconds, and without lifting the ceiling with it, it takes three quarters of
   * a 3.4 m/s push back inside one.
   */
  push(speed: number, hold: number): void;
  /** A shove in a world direction, m/s. Blasts, and nothing else so far. */
  shove(dx: number, dz: number, speed: number): void;

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

  /**
   * The flip: how far round the seat is, which way it is going, and how many it
   * has finished this jump.
   *
   * `pitch` outlives the jump by a fraction of a second — it is what the mesh is
   * drawn at, and a chair that snaps level the instant a castor touches is a chair
   * that teleports. On touchdown it is reduced to the residual angle and eased out
   * from there. See `sync`, which is the only thing that reads it.
   */
  let pitch = 0;
  /** Which way the flip in progress is going: +1 forward, −1 back, 0 for none. */
  let flipping = 0;
  /** Radians still owed on the flip in progress. */
  let flipLeft = 0;
  let flips = 0;
  /**
   * The throttle as it was last step, so a flip can be fired on the press.
   *
   * Seeded from the input rather than from zero on take-off — see `flipRate` for
   * why a key that was already down is not a press.
   */
  let lastThrottle = 0;
  /** Scratch for `sync`: the mesh origin's offset from the body's centre. */
  const lift = new THREE.Vector3();
  // Heading first, then the flip about the chair's own right axis — see `sync`.
  object.rotation.order = 'YXZ';

  /** Seconds of spin-out left, and the boost's remaining licence to speed. */
  let stunned = 0;
  let boostFor = 0;
  let boostBy = 0;
  /** The rung a drift boost just fired at, waiting to be reported once. */
  let fired = 0;
  /** Posted by `push` and `shove`, consumed at the top of the next step. */
  let pending = 0;
  let pendingX = 0;
  let pendingZ = 0;

  /** What the chair is holding while it is spun out: nothing at all. */
  const LIMP: Input = { throttle: 0, steer: 0, drift: false };

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

  function update(h: number, given: Input): void {
    if (stunned > 0) stunned -= h;
    if (boostFor > 0) boostFor -= h;
    /*
     * A chair being spun round is not being driven.
     *
     * Substituted here rather than tested for in each of the six places the
     * input is read, so there is exactly one line a stun has to be honoured in
     * and no branch below can forget it — including the airborne one, which is
     * its own early return and would otherwise have let a player fly a jump
     * they had just been knocked out of.
     */
    const input = stunned > 0 ? LIMP : given;

    const v = body.linvel();
    // Anything shoved in from outside arrives as part of this step's velocity,
    // before it is decomposed — see the note on `shove` in the type above.
    velocity.set(v.x + pendingX, 0, v.z + pendingZ);
    pendingX = 0;
    pendingZ = 0;
    const fwd = currentForward();

    let along = velocity.dot(fwd);
    lateral.copy(velocity).addScaledVector(fwd, -along);

    if (pending !== 0) {
      along += pending;
      pending = 0;
    }

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
      // Knocked round as well, and deliberately not added to `spun`: rotation
      // you did not ask for is not a trick, and paying a landing boost for
      // having been hit in mid-air would make the microwave a gift.
      if (stunned > 0) yaw -= DRIVE.stunSpin * h;

      /*
       * And the flip, which is the one input in this game that is a press rather
       * than a state. See `flipRate`: a throttle that is *already* held when the
       * castors leave the floor is not a press, so this compares against the last
       * step rather than against zero, and a player who went up the ramp pinned
       * has to let go and ask for it.
       *
       * Only one at a time. A second press while one is still coming round is
       * ignored rather than queued — queueing means a mashed key spends the whole
       * jump owing you flips you cannot see, and then you land on your back
       * wondering what you did.
       */
      const press = Math.sign(input.throttle);
      if (flipping === 0 && press !== 0 && press !== Math.sign(lastThrottle) && stunned <= 0) {
        flipping = press;
        flipLeft = Math.PI * 2;
      }
      if (flipping !== 0) {
        const step = Math.min(flipLeft, DRIVE.flipRate * h);
        pitch += flipping * step;
        flipLeft -= step;
        if (flipLeft <= 0) {
          flips++;
          flipping = 0;
          // Landed back on the exact angle it started from, rather than a whole
          // turn away from it, so a chain of flips cannot drift the seat off level
          // by an accumulated rounding error over four of them.
          pitch = Math.round(pitch / (Math.PI * 2)) * Math.PI * 2;
        }
      }

      telemetry.impact = 0;
      telemetry.along = along;
      right.set(-fwd.z, 0, fwd.x);
      telemetry.lateralRight = lateral.dot(right);
      telemetry.charge = charge;
      telemetry.airborne = true;
      telemetry.air = air;

      lastThrottle = input.throttle;
      body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      return;
    }

    lastThrottle = input.throttle;

    // Down. Anything worth calling a jump pays out here, once.
    if (air > 0) {
      /*
       * How far off level the seat came down, once the whole turns are taken out.
       *
       * A flip finished is a flip that put the chair back exactly where it started,
       * so a clean three-flip landing wraps to zero and a bail wraps to however far
       * round it got. Which is the only question worth asking on touchdown.
       */
      const level = Math.atan2(Math.sin(pitch), Math.cos(pitch));
      const clean = Math.abs(level) <= DRIVE.uprightWindow;

      // A landing does not pay while you are still spinning out of a hit. It is
      // the same rule as above and the same reason.
      if (air >= DRIVE.trickAir && stunned <= 0) {
        const degrees = (spun * 180) / Math.PI;
        if (clean) {
          const boost = Math.min(
            DRIVE.maxTrickBoost,
            air * DRIVE.boostPerAirSecond +
              (degrees / 180) * DRIVE.boostPerHalfTurn +
              flips * DRIVE.boostPerFlip,
          );
          along += boost * Math.sign(along || 1);
          landed = { air, degrees, flips, boost, clean: true };
        } else {
          // Landed on its back. No payout, and a bite out of the speed — which is
          // the whole reason a flip is a decision rather than a free press: the
          // ramp is worth more than the flat line only if you bring it round.
          along *= DRIVE.bailKeep;
          landed = { air, degrees, flips, boost: 0, clean: false };
        }
      }
      air = 0;
      spun = 0;
      flips = 0;
      flipping = 0;
      flipLeft = 0;
      // The whole turns go, the residual stays and is eased out below, so the seat
      // settles back onto its castors instead of snapping level on the frame a
      // castor touched.
      pitch = level;
      telemetry.airborne = false;
      telemetry.air = 0;
    }

    // Settling out of whatever the landing left. Fast — this is a chair dropping
    // the last few degrees onto its castors, not an animation.
    if (pitch !== 0) {
      pitch *= Math.pow(0.0002, h);
      if (Math.abs(pitch) < 1e-4) pitch = 0;
    }

    // What the slope is doing, before anything else asks how fast the chair may
    // go — because on a ramp that is the thing setting the answer.
    const slope = slopeAlong(fwd);
    const cap = Math.max(1.5, DRIVE.maxSpeed + slope * DRIVE.slopeSpeedGain);

    // Steering. Authority scales with speed so the chair is twitchy when it is
    // actually moving, but can still be shuffled around at a standstill.
    const authority = Math.max(DRIVE.minSteerAuthority, Math.min(1, Math.abs(along) / 3));
    yaw -= input.steer * DRIVE.steerRate * authority * h;
    // The spin-out, which is not steering and so is not scaled by the authority
    // a contact patch would give it: you are being turned, not turning.
    if (stunned > 0) yaw -= DRIVE.stunSpin * h;

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
      /*
       * Let go, and you are paid for the rung you actually reached — not for the
       * charge, and never for part of a rung. Falling just short of a threshold
       * has to pay the same as the rung below it, or the ladder is a ramp again
       * and there is nothing to aim at.
       */
      /*
       * The castors bite first, and this happens whether or not a rung was
       * reached: the redirect is what a drift exit *is*, and the rung boost is
       * what it is worth. Keeping them separate means a drift broken early still
       * hands its momentum back instead of binning it, which is what stops a
       * half-committed slide being the worst thing you can do.
       */
      const carried = lateral.length() * DRIFT_RECOVER;
      if (carried > 0.05) {
        along += carried * Math.sign(along || 1);
        lateral.multiplyScalar(1 - DRIFT_RECOVER);
      }

      const rung = tierOf(charge);
      if (rung > 0) {
        const step = DRIFT_TIERS[rung - 1]!;
        along += step.boost * Math.sign(along || 1);
        // Held on the same machinery an item's push uses: the ceiling goes up with
        // it, so the boost is something you ride rather than something the
        // overspeed drag eats in the third of a second after it lands.
        boostBy = Math.max(boostFor > 0 ? boostBy : 0, step.boost);
        boostFor = Math.max(boostFor, step.hold);
        fired = rung;
      }
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
    // Coasting down while it spins, after the drift block so a charge cannot be
    // cashed out of a hit, and before the ceiling so the clamp still applies.
    if (stunned > 0 && Math.abs(along) > DRIVE.stunSpeed) {
      along -= Math.sign(along) * DRIVE.stunBrake * h;
    }

    // An item's push lifts the ceiling by its own size for as long as it holds —
    // see `push` on the type. Everything else about the overspeed drag is
    // unchanged, so the boost still bleeds away, just from a mark that high.
    const flat = Math.max(cap, DRIVE.maxSpeed) + (boostFor > 0 ? boostBy : 0);
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

  /**
   * Put the mesh where the body is, and at whatever angle the flip has it.
   *
   * The pitch lives here and nowhere else: the solver's body stays a capsule that
   * only ever turns about Y, because a chair that could really tip is a chair that
   * catches a corner on a doorframe and ends the race on its side. What flips is
   * the *picture* — which is the same bargain the whole driving model makes, and
   * it holds for the same reason: nothing about a flip needs to be collided with.
   *
   * `YXZ` so `.rotation.y` stays the plain heading whatever the pitch is doing.
   * Half the game reads that number — the chase camera, the taxiway sign, the
   * trail an item is dragged on — and every one of them wants the yaw rather than
   * a component of some composed angle.
   */
  function sync(): void {
    const p = body.translation();
    object.rotation.set(pitch, yaw, 0);
    /*
     * And it turns about the seat, not about the castors.
     *
     * The mesh's origin is on the floor between the wheels, so a pitch written
     * straight onto it swings the whole chair around a point on the ground —
     * which is a chair being pushed over, not a chair being flipped. The body's
     * own centre is `CENTRE_Y` above that origin, so the origin is put wherever
     * rotating about the centre sends it. At zero pitch this is exactly the
     * subtraction it replaces.
     */
    lift.set(0, -CENTRE_Y, 0).applyQuaternion(object.quaternion);
    object.position.set(p.x + lift.x, p.y + lift.y, p.z + lift.z);
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
    driftTier() {
      return boosting ? tierOf(charge) : 0;
    },
    takeBoost() {
      const rung = fired;
      fired = 0;
      return rung;
    },
    telemetry() {
      return telemetry;
    },
    takeTrick() {
      const trick = landed;
      landed = null;
      return trick;
    },
    stun(seconds) {
      // The longer of the two rather than the sum: two things landing at once is
      // one accident, and adding them is how a player ends up spinning for four
      // seconds in a doorway with no idea why.
      stunned = Math.max(stunned, seconds);
      // A hit ends a boost. Keeping it would mean being knocked out of your own
      // line at the one speed that makes that unrecoverable.
      boostFor = 0;
    },
    stunned() {
      return Math.max(0, stunned);
    },
    push(speed, hold) {
      pending += speed;
      boostBy = Math.max(boostFor > 0 ? boostBy : 0, speed);
      boostFor = Math.max(boostFor, hold);
    },
    shove(dx, dz, speed) {
      pendingX += dx * speed;
      pendingZ += dz * speed;
    },
    reset() {
      // The spawn's own floor, passed through rather than defaulted to zero. Both
      // are the hall and both are the same number today, which is exactly why it
      // is worth writing: this and the menu's own `stage(false)` are two routes to
      // one grid slot, and for a long time they disagreed about how high it was.
      this.place(spawn.position[0], spawn.position[2], spawn.yaw, 0, spawn.position[1]);
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
      // the one it was on when the race was restarted — nor arrive halfway
      // through the flip it was in the middle of.
      air = 0;
      spun = 0;
      pitch = 0;
      flipping = 0;
      flipLeft = 0;
      flips = 0;
      lastThrottle = 0;
      landed = null;
      telemetry.airborne = false;
      telemetry.air = 0;
      // Nor is it spinning out of something that happened in the last race, or
      // still carrying a boost it was handed before the grid was cleared.
      stunned = 0;
      boostFor = 0;
      boostBy = 0;
      pending = 0;
      pendingX = 0;
      pendingZ = 0;
      fired = 0;
    },
  };
}
