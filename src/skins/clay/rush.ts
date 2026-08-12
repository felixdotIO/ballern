/**
 * The speed layer: what the screen does that the simulation does not.
 *
 * ---- why this exists at all -----------------------------------------------
 *
 * Because 6.0 m/s is 21.6 km/h, and no amount of arguing makes that a number that
 * *feels* fast. `chair.ts` sets it there deliberately and is right to — 9 m/s
 * crossed a bay before the room could be read — so the speed is not the thing to
 * change. What was missing is everything a game normally does to sell a speed it
 * has already chosen.
 *
 * Almost all of the sensation of going fast is peripheral. The eye reads velocity
 * from the edges of the frame, from how the field of view behaves under
 * acceleration, and from whether anything *happens* at the moment you gain speed.
 * The rig had one of those three: an FOV that widened smoothly with speed, which
 * is so gradual it reads as a lens rather than as an event. So the middle of the
 * screen is left alone — `hud.ts` is emphatic that nothing may sit there — and
 * everything here happens at the rim.
 *
 * Three things, none of which touches the simulation:
 *
 *   streaks  a rim of motion that fades in above walking pace and hardens with
 *            speed. Nothing at all until 4 m/s, so the room is clean whenever you
 *            are actually reading it.
 *   surge    a flash and a hard pull of streaks on the frame a drift boost fires,
 *            tinted by the rung — this is the payoff for the whole drift ladder
 *            and it is the one moment the screen is allowed to shout.
 *   charge   a rim glow that builds while a drift is charging and steps colour at
 *            each rung, so the ladder is legible without looking away from the
 *            road. Amber, pink, white — the same three the sparks use.
 */

import { DRIFT_TIERS } from '../../game/chair';
import { el, installLook } from './look';

/** Below this there is nothing on screen at all, m/s. */
const QUIET = 4.0;
/** And by this the streaks are at full strength. */
const FLAT_OUT = 8.6;

/**
 * The rung colours, and they are the pickups' own.
 *
 * `itemArt.ts` calls that set the only fully saturated colours in the frame and
 * spends them on pickups. A mini-turbo is the same kind of event —
 * loud, brief, earned — so it draws on the same four rather than introducing a
 * fifth register nobody has been taught.
 */
const RUNGS = ['#f2a02b', '#ee3e7b', '#fff2e0'];

const CSS = `
#rush {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9;
  opacity: 0;
}

/*
 * The streaks: a rim, not a wash.
 *
 * A conic gradient repeated round the frame gives radial spokes for one painted
 * element and no per-frame work — the whole thing is two custom properties the
 * loop writes. It is masked to the edges by a radial alpha so the middle third of
 * the screen stays exactly as clean as hud.ts requires.
 */
#rush .streaks {
  position: absolute;
  inset: -12%;
  background: repeating-conic-gradient(
    from 0deg at 50% 50%,
    rgba(255, 255, 255, 0.55) 0deg 0.5deg,
    rgba(255, 255, 255, 0) 0.5deg 2.6deg
  );
  -webkit-mask-image: radial-gradient(closest-side, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 96%);
  mask-image: radial-gradient(closest-side, rgba(0,0,0,0) 42%, rgba(0,0,0,1) 96%);
  will-change: opacity, transform;
}

/*
 * The surge, on the frame a boost lands.
 *
 * A tinted bloom from the edges in, over the streaks. It is scaled *up* as it
 * fades, which is what makes it read as something rushing past rather than as the
 * brightness being turned up — the same trick a bursting piñata uses.
 */
#rush .surge {
  position: absolute;
  inset: -20%;
  opacity: 0;
  background: radial-gradient(closest-side, rgba(0,0,0,0) 46%, currentColor 100%);
  will-change: opacity, transform;
}

/* And the charge glow, which is the ladder made visible while you are on it. */
#rush .charge {
  position: absolute;
  inset: -6%;
  opacity: 0;
  background: radial-gradient(closest-side, rgba(0,0,0,0) 62%, currentColor 100%);
  will-change: opacity;
}
`;

export type Rush = {
  /**
   * Call once a frame.
   *
   * @param kmh    the gauge's own figure, so the two never disagree
   * @param charge drift charge in `chair.driftCharge()`'s units
   * @param tier   the rung being held right now, 0 when not drifting
   * @param fired  the rung a boost just fired at, or 0 — `chair.takeBoost()`
   */
  update(dt: number, kmh: number, charge: number, tier: number, fired: number): void;
  setVisible(visible: boolean): void;
  reset(): void;
};

export function createRush(): Rush {
  installLook();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = el('div');
  root.id = 'rush';
  const streaks = el('div', 'streaks');
  const surge = el('div', 'surge');
  const charge = el('div', 'charge');
  root.append(streaks, surge, charge);
  document.body.append(root);

  /** Seconds left on the surge, and how big it was. */
  let surgeFor = 0;
  let surgeSpan = 0.5;
  /** Eased, so a stutter in the frame rate is not a flicker in the rim. */
  let shown = 0;
  let visible = false;

  return {
    setVisible(next) {
      visible = next;
      root.style.opacity = next ? '1' : '0';
    },

    update(dt, kmh, chargeNow, tier, fired) {
      if (!visible) return;

      // -- streaks -----------------------------------------------------------
      const speed = kmh / 3.6;
      const want = Math.max(0, Math.min(1, (speed - QUIET) / (FLAT_OUT - QUIET)));
      // Toward the target rather than at it: the chair gains and loses speed in
      // steps of a substep, and a rim that tracks it exactly shimmers.
      shown += (want - shown) * Math.min(1, dt / 0.18);
      streaks.style.opacity = (shown * 0.5).toFixed(3);
      // Drawn from further out as it strengthens, so the spokes lengthen into the
      // corners rather than simply getting brighter.
      streaks.style.transform = `scale(${(1 + shown * 0.16).toFixed(3)})`;

      // -- the ladder, while it is being climbed -----------------------------
      if (tier > 0 || chargeNow > 0.05) {
        const top = DRIFT_TIERS[DRIFT_TIERS.length - 1]!.at;
        const along = Math.max(0, Math.min(1, chargeNow / top));
        charge.style.color = RUNGS[Math.max(0, Math.min(RUNGS.length - 1, tier - 1))]!;
        // Held back until the first rung is nearly in hand: a glow that starts the
        // instant the button goes down is a glow that means nothing.
        charge.style.opacity = (Math.max(0, along - 0.18) * 0.5).toFixed(3);
      } else {
        charge.style.opacity = '0';
      }

      // -- the surge ---------------------------------------------------------
      if (fired > 0) {
        surgeFor = 0.34 + fired * 0.1;
        surgeSpan = surgeFor;
        surge.style.color = RUNGS[Math.min(RUNGS.length - 1, fired - 1)]!;
      }
      if (surgeFor > 0) {
        surgeFor -= dt;
        const u = 1 - Math.max(0, surgeFor) / surgeSpan;
        // Loud immediately, gone smoothly: the frame it lands on is the one that
        // has to register, and everything after it is the tail.
        surge.style.opacity = (Math.max(0, 1 - u * u) * 0.62).toFixed(3);
        surge.style.transform = `scale(${(1 + u * 0.3).toFixed(3)})`;
        if (surgeFor <= 0) surge.style.opacity = '0';
      }
    },

    reset() {
      surgeFor = 0;
      shown = 0;
      streaks.style.opacity = '0';
      surge.style.opacity = '0';
      charge.style.opacity = '0';
    },
  };
}
