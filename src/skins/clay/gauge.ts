/**
 * The speedometer.
 *
 * Three earlier versions of this were a *thing*: a moulded glass dial, then a toon
 * dial with a fat outline, then an aviation instrument screwed to a paper plate with
 * slot-head screws at the corners. Each was more elaborate than the last and each
 * looked more like an ornament sitting on the game — because a chair doing 22 km/h
 * does not need a bezel, four screws and three coloured bands to be read. It needs
 * one number and one arc. Everything else was a costume.
 *
 * So this is the arc and the number, floating, with no panel at all:
 *
 *  - A 260° **track** in paper at low strength, with the part of the scale the chair
 *    cannot reach on the throttle alone left visibly emptier. That is the airspeed
 *    indicator's caution band saying the same thing with a tenth of the ink.
 *  - The **value arc** over it in amber, round-capped, honest and unsprung — 6 units
 *    wide, so it reads from across a room.
 *  - The **speed** in the middle, tabular, tight, at 56 px: after the room itself it
 *    is the biggest thing on screen, which is the correct order of importance.
 *  - An inner ring in pink for the **drift charge**, which pulses once there is
 *    enough of it to be worth spending. Pink is the donuts, and in this interface
 *    pink means energy.
 *
 * Legibility over a sunlit floor comes from a soft radial darkening behind the whole
 * instrument rather than from a card: it reads as the room falling away, not as a
 * widget parked on top of it.
 *
 * The numbers the arc is drawn from are the driving model's own and unchanged: 21.6
 * km/h is 6.0 m/s, everything the castors give on the throttle, and a drift boost is
 * the only way past it.
 */

import { createOdometer, el } from './look';

/** Top of the scale, km/h. The solver's ceiling is 8.6 m/s ≈ 31. */
const FULL = 32;
/** Everything the throttle alone will give: 6.0 m/s. Past this you are on a boost. */
const NORMAL = 21.6;

/** Degrees either side of straight down that the scale does not cover. */
const GAP = 50;
const START = -180 + GAP;
const SPAN = 360 - GAP * 2;

const C = 86;
const R_TRACK = 68;
const R_BOOST = 55;
const R_TICK = 78;

/** Polar, with zero at six o'clock and positive going clockwise. */
function polar(deg: number, r: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.sin(rad), C - r * Math.cos(rad)];
}

const at = (kmh: number) => START + SPAN * Math.min(1, Math.max(0, kmh / FULL));
const arcLength = (r: number, deg: number) => (deg / 180) * Math.PI * r;

function arcPath(from: number, to: number, r: number): string {
  const [x0, y0] = polar(from, r);
  const [x1, y1] = polar(to, r);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** Four marks, at the tens. Any more is a texture rather than a scale. */
function ticks(): string {
  let out = '';
  for (let v = 0; v <= 30; v += 10) {
    const [x0, y0] = polar(at(v), R_TICK);
    const [x1, y1] = polar(at(v), R_TICK - 7);
    out +=
      `<line x1="${x0.toFixed(2)}" y1="${y0.toFixed(2)}" ` +
      `x2="${x1.toFixed(2)}" y2="${y1.toFixed(2)}" />`;
  }
  return `<g class="ticks">${out}</g>`;
}

const CSS = `
.spd {
  position: relative;
  width: 172px;
  height: 172px;
  display: grid;
  place-items: center;
}
/* The room falling away behind the instrument, so paper-coloured type holds over a
   sunlit carpet without a card under it. */
.spd::before {
  content: '';
  position: absolute;
  inset: -26px;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(18, 12, 6, 0.58), rgba(18, 12, 6, 0) 80%);
  pointer-events: none;
}
.spd svg { position: absolute; inset: 0; width: 172px; height: 172px; overflow: visible; }

.spd .bed,
.spd .track,
.spd .beyond,
.spd .value,
.spd .charge {
  fill: none;
  stroke-linecap: round;
}
/*
 * A dark bed under the whole sweep, and it is not decoration: a 6-unit stroke at 22%
 * paper is invisible over a carpet with the late sun on it, which is exactly where the
 * bottom-left corner of this frame spends most of a lap. The radial darkening behind
 * the instrument is not enough on its own — the arc needs its own ground, the way a
 * white line on a road is painted on tarmac and not on grass.
 */
.spd .bed { stroke: rgba(20, 14, 8, 0.45); stroke-width: 11; }
.spd .track { stroke: rgba(246, 239, 226, 0.34); stroke-width: 6; }
/* The part of the scale a throttle cannot reach, left emptier rather than coloured
   in — an airspeed indicator's caution band at a tenth of the ink. */
.spd .beyond { stroke: rgba(246, 239, 226, 0.14); stroke-width: 6; }
.spd .value { stroke: var(--amber); stroke-width: 6; transition: stroke 200ms linear; }
/* Past what the castors give, the arc is running on stored drift, so it turns the
   colour this interface uses for energy. */
.spd.over .value { stroke: var(--pink); }

.spd .charge { stroke: var(--pink); stroke-width: 3.5; }
.spd.ready .charge { animation: spdReady 900ms ease-in-out infinite; }
@keyframes spdReady { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }

.spd .ticks line { stroke: rgba(246, 239, 226, 0.55); stroke-width: 2; stroke-linecap: round; }

.spd .read { position: relative; text-align: center; line-height: 1; pointer-events: none; }
.spd .read b {
  display: block;
  font-size: 56px;
  font-variation-settings: 'opsz' 96;
  letter-spacing: -0.03em;
}
.spd .read i {
  display: block;
  margin-top: 5px;
  font-style: normal;
  font-size: 12.5px;
  color: var(--paper-2);
  text-shadow: 0 1px 3px rgba(20, 14, 8, 0.6);
}
`;

export type Gauge = {
  element: HTMLElement;
  /**
   * @param kmh   road speed
   * @param drift drift charge, 0…1
   */
  update(kmh: number, drift: number): void;
};

let styled = false;

export function createGauge(): Gauge {
  if (!styled) {
    styled = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.append(style);
  }

  const trackLen = arcLength(R_TRACK, SPAN);
  const boostLen = arcLength(R_BOOST, SPAN);

  const element = el('div', 'spd float');
  element.innerHTML = `
<svg viewBox="0 0 172 172" aria-hidden="true">
  <path class="bed" d="${arcPath(START, START + SPAN, R_TRACK)}" />
  <path class="bed" d="${arcPath(START, START + SPAN, R_BOOST)}" />
  <path class="track" d="${arcPath(START, at(NORMAL), R_TRACK)}" />
  <path class="beyond" d="${arcPath(at(NORMAL), START + SPAN, R_TRACK)}" />
  ${ticks()}
  <path class="value" d="${arcPath(START, START + SPAN, R_TRACK)}"
        stroke-dasharray="0 ${(trackLen + 1).toFixed(2)}" />
  <path class="charge" d="${arcPath(START, START + SPAN, R_BOOST)}"
        stroke-dasharray="0 ${(boostLen + 1).toFixed(2)}" />
</svg>`;

  const read = el('div', 'read num');
  const number = createOdometer();
  number.set('0');
  const value = el('b');
  value.append(number.element);
  read.append(value, el('i', 'ui', 'km/h'));
  element.append(read);

  const arc = element.querySelector('.value') as SVGPathElement;
  const charge = element.querySelector('.charge') as SVGPathElement;

  /**
   * A dash of zero length with a round cap is a dot, drawn at the start of the path —
   * which on both of these arcs is a mark sitting exactly where the scale reads zero.
   * So the cap comes off when there is nothing to draw.
   *
   * Set as an inline style rather than the attribute: a presentation attribute loses
   * to any rule in a stylesheet, and the round cap is set in one above.
   */
  const cap = (node: SVGElement, length: number) => {
    node.style.strokeLinecap = length < 0.8 ? 'butt' : 'round';
  };

  let shownArc = -1;
  let shownCharge = -1;
  let shownNumber = -1;

  return {
    element,

    update(kmh, drift) {
      const filled = Math.round(arcLength(R_TRACK, at(kmh) - START) * 4) / 4;
      if (filled !== shownArc) {
        shownArc = filled;
        arc.setAttribute('stroke-dasharray', `${filled.toFixed(2)} ${(trackLen + 1).toFixed(2)}`);
        cap(arc, filled);
      }
      element.classList.toggle('over', kmh > NORMAL);

      const rounded = Math.round(kmh);
      if (rounded !== shownNumber) {
        shownNumber = rounded;
        number.set(String(rounded));
      }

      const lit = Math.round(arcLength(R_BOOST, SPAN * Math.min(1, drift)) * 4) / 4;
      if (lit !== shownCharge) {
        shownCharge = lit;
        charge.setAttribute('stroke-dasharray', `${lit.toFixed(2)} ${(boostLen + 1).toFixed(2)}`);
        cap(charge, lit);
        // Worth spending, rather than merely started: below about two thirds the boost
        // is small enough that telling the player to go and use it is bad advice.
        element.classList.toggle('ready', drift > 0.66);
      }
    },
  };
}
