/**
 * The driver's pose, derived entirely from what the chair is already doing.
 *
 * Nothing here plays a clip. Every value is computed from sim state we compute
 * anyway — cornering load, sideways slip, drift charge, throttle, impacts — and
 * driven onto the rig as additive offsets. Procedural secondary motion reads far
 * more alive than canned animation for something like this, because it is
 * always exactly in phase with what the player just did: the body is thrown
 * before the player consciously registers the corner.
 *
 * This module is deliberately independent of any mesh. It emits joint angles
 * and scalars; binding them to bones happens wherever the rig is loaded, so the
 * whole system can be built and tuned before a single character asset exists.
 *
 * Sign convention throughout: positive is to the driver's right, and positive
 * pitch is forward, over the knees.
 */

import type { Input, Telemetry } from './chair';

export type DriverPose = {
  /** Torso roll. The body is thrown to the outside of a corner. */
  lean: number;
  /** Torso pitch. Back under acceleration, forward under braking and impact. */
  pitch: number;
  /** Head turns toward the apex ahead of the chair — drivers look where they
   *  are going, and it is the clearest read that someone is in control. */
  headYaw: number;
  /** 0–1. Arms lock against the armrests as drift charge builds. */
  brace: number;
  /** 0–1. How hard he is paddling — the amplitude of the leg swing, not its
   *  phase. Zero means both feet stay exactly where the model was posed. */
  paddle: number;
  /** −1…1. Where in the stroke he is: +1 is the left leg fully forward, −1 the
   *  right. Split from `paddle` because a single oscillating 0–1 value cannot
   *  say which leg is which, and both legs have to be driven from it. */
  stroke: number;
  /** 0–1, spikes then decays. Whole-body flinch on hitting something. */
  flinch: number;
  /** 0–1. How hard the air is moving past him. The tie rides on this: streamed
   *  out at speed, hanging down at a standstill. */
  airflow: number;
  /** −1…1. Ripple for anything made of cloth. Faster the quicker he is going. */
  flutter: number;
};

const TUNING = {
  /** Cornering load: how hard the body is thrown per unit of speed × steering. */
  leanPerCorneringLoad: 0.034,
  /** Extra roll from actual sideways slip, which is what sells a drift. */
  leanPerSlip: 0.028,
  maxLean: 0.42,

  pitchPerThrottle: 0.11,
  pitchPerFlinch: 0.28,
  maxPitch: 0.34,

  headYawPerSteer: 0.34,
  /** Mid-drift the head leads much further, toward where the slide is going. */
  headYawPerSlip: 0.05,
  maxHeadYaw: 0.72,

  /** Drift charge at which the brace is fully locked. */
  braceFullCharge: 2.4,

  /**
   * Paddling fades with speed but never stops while he is still pushing.
   *
   * It used to cut out entirely above 2.6 m/s, which the chair reaches in well
   * under a second — so the one animation that says "this is being propelled by
   * a man's legs" was over before the player had finished pressing the key, and
   * for the whole rest of the drive he sat with his feet stuck out, motionless.
   * You do not stop kicking when an office chair is rolling; you kick less
   * frantically.
   */
  paddleFadesBySpeed: 6.0,
  paddleFloor: 0.34,
  paddleRate: 9.0,
  /** The stroke never slows below this fraction of its full rate. */
  paddleRateFloor: 0.45,

  /** Speed at which the tie is streaming out flat behind him. */
  airflowAtSpeed: 4.2,
  /** Cloth ripples this fast standing still, and this much faster flat out. */
  flutterRate: 5.0,
  flutterRatePerAirflow: 11.0,

  /** Speed lost in one step that counts as a full-strength flinch. */
  flinchAtImpact: 3.0,
  flinchDecayPerSecond: 4.5,

  /** Smoothing, as the fraction of error remaining after one second. */
  torsoSmoothing: 0.0002,
  headSmoothing: 0.002,
  braceSmoothing: 0.0008,
};

export type Driver = {
  pose: DriverPose;
  update(h: number, telemetry: Telemetry, input: Input): void;
  reset(): void;
};

/** Frame-rate independent approach: same fraction closed per second, always. */
const approach = (current: number, target: number, remainingPerSecond: number, h: number) =>
  current + (target - current) * (1 - Math.pow(remainingPerSecond, h));

export function createDriver(): Driver {
  const pose: DriverPose = {
    lean: 0, pitch: 0, headYaw: 0, brace: 0,
    paddle: 0, stroke: 0, flinch: 0, airflow: 0, flutter: 0,
  };
  let paddlePhase = 0;
  let flutterPhase = 0;

  return {
    pose,

    update(h, t, input) {
      // Cornering load is speed × steering — the same product that produces
      // lateral acceleration in the sim, so the lean is in phase with the force
      // rather than with the button.
      const cornering = input.steer * t.along * TUNING.leanPerCorneringLoad;
      const slip = t.lateralRight * TUNING.leanPerSlip;
      // Negative: steering right throws the body left.
      const leanTarget = clamp(-cornering + slip, -TUNING.maxLean, TUNING.maxLean);
      pose.lean = approach(pose.lean, leanTarget, TUNING.torsoSmoothing, h);

      // Impacts are instantaneous, so they set the flinch rather than easing
      // toward it — then it bleeds off on its own.
      if (t.impact > 0) {
        pose.flinch = Math.max(pose.flinch, clamp(t.impact / TUNING.flinchAtImpact, 0, 1));
      }
      pose.flinch = Math.max(0, pose.flinch - TUNING.flinchDecayPerSecond * h);

      const pitchTarget = clamp(
        -input.throttle * TUNING.pitchPerThrottle + pose.flinch * TUNING.pitchPerFlinch,
        -TUNING.maxPitch,
        TUNING.maxPitch,
      );
      pose.pitch = approach(pose.pitch, pitchTarget, TUNING.torsoSmoothing, h);

      const headTarget = clamp(
        input.steer * TUNING.headYawPerSteer + t.lateralRight * TUNING.headYawPerSlip,
        -TUNING.maxHeadYaw,
        TUNING.maxHeadYaw,
      );
      pose.headYaw = approach(pose.headYaw, headTarget, TUNING.headSmoothing, h);

      pose.brace = approach(
        pose.brace,
        input.drift ? clamp(t.charge / TUNING.braceFullCharge, 0, 1) : 0,
        TUNING.braceSmoothing,
        h,
      );

      // Paddling: feet only reach the carpet when you are slow enough to bother,
      // and the stroke slows as the chair picks up speed — which is exactly how
      // pushing an office chair actually feels.
      //
      // The amplitude and the phase decay separately when he stops pushing. The
      // amplitude going to zero is what returns both legs to the pose they were
      // modelled in; letting the phase unwind on its own means he finishes the
      // stroke he was in rather than snapping mid-kick.
      const speed = Math.abs(t.along);
      // Not while he is off the ground: a foot pushing at a carpet a metre
      // below him is the one thing that would give the jumps away. He braces
      // instead — the same pose the drift charge puts him in, which is what
      // anyone does with their arms when a chair leaves the floor.
      if (t.airborne) {
        pose.paddle = approach(pose.paddle, 0, 0.0001, h);
        pose.stroke = approach(pose.stroke, 0, 0.004, h);
        pose.brace = approach(pose.brace, 1, TUNING.braceSmoothing, h);
      } else if (input.throttle > 0) {
        const urgency = clamp(1 - speed / TUNING.paddleFadesBySpeed, TUNING.paddleFloor, 1);
        const rate = Math.max(urgency, TUNING.paddleRateFloor);
        paddlePhase += TUNING.paddleRate * rate * h;
        pose.paddle = urgency;
        pose.stroke = Math.sin(paddlePhase);
      } else {
        pose.paddle = approach(pose.paddle, 0, 0.0005, h);
        pose.stroke = approach(pose.stroke, 0, 0.02, h);
      }

      // Airflow, and the ripple it puts through anything loose. Taken from
      // speed rather than from throttle: the tie does not know whether he is
      // still pushing, only how fast the room is going past.
      pose.airflow = approach(
        pose.airflow,
        clamp(speed / TUNING.airflowAtSpeed, 0, 1),
        0.02,
        h,
      );
      flutterPhase += (TUNING.flutterRate + TUNING.flutterRatePerAirflow * pose.airflow) * h;
      pose.flutter = Math.sin(flutterPhase);
    },

    reset() {
      pose.lean = 0;
      pose.pitch = 0;
      pose.headYaw = 0;
      pose.brace = 0;
      pose.paddle = 0;
      pose.stroke = 0;
      pose.flinch = 0;
      pose.airflow = 0;
      pose.flutter = 0;
      paddlePhase = 0;
      flutterPhase = 0;
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
