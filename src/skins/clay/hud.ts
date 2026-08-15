/**
 * The interface.
 *
 * The structure and every performance decision are the shipped game's own HUD — DOM
 * over the canvas so text stays crisp at whatever buffer scale the quality controller
 * has settled on, every write guarded on the string having changed, and nothing in
 * the middle third of the frame except the two things allowed to stop you reading the
 * room. Those parts of that file were right and are not re-argued here.
 *
 * What changed is that **the panels are gone**. Every earlier pass put each read-out
 * on a card — glass, then moulded resin, then a keylined ticket — and six cards in
 * the corners of a rendered scene look like six cards, however well drawn they are.
 * The benchmark for this kind of game is art of rally, whose interface is praised for
 * being clean, undecorated and out of the way, and it achieves that by being type
 * over the road and almost nothing else.
 *
 * So: paper-coloured type with a three-stage cast shadow (see `--cast` in `look.ts`)
 * straight over the room, and a ground only for the two things that are genuinely
 * tables — the plan, which is a drawing, and the result, which is a list of times.
 * One family, tabular figures, one accent.
 *
 *   lap        a tight numeral and a row of dashes, one per gate, filled as you take
 *              them: the rule the race enforces, stated without a sentence
 *   clock      the running time large, the last and best laps small beneath it, best
 *              in amber
 *   speed      `gauge.ts`
 *   wayfinder  an amber arrow and the room's own name — the floor is signed in these
 *              words, so the HUD uses them
 *   plan       the building's Flucht- und Rettungsplan, reprinted paper-on-dark
 *
 * There are no key legends anywhere, and no resolution read-out. The game is four
 * fingers on WASD and a thumb on the space bar; a permanent row of captions spelling
 * that out is the interface apologising for itself, and a line about render scale is a
 * footnote from a different document.
 */

import type * as THREE from 'three';

import { CHARGE_FULL, type Trick } from '../../game/chair';
import { BEAT, formatTime, type Race } from '../../game/race';
import { GATES } from '../../office/plan';
import { createMinimap, MINIMAP_CSS } from '../../ui/minimap';
import { createGauge } from './gauge';
import { createOdometer, el, FAMILY, installLook } from './look';

/**
 * Drift charge that fills the inner ring, in the units `chair.driftCharge()` returns.
 *
 * Taken from the ladder itself rather than written down, and that is the whole
 * point of importing it: the ring is full at the top rung, so a full ring means
 * "the biggest boost is in your hand" and nothing past it is promised. When the
 * thresholds move, this moves with them.
 */

/** How long the GO stays up, in seconds of race clock. */
const GO_FOR = 0.85;

/** The wayfinder's arrow. One shape, spun; amber, because amber is the pointing. */
const ARROW = `
<svg viewBox="0 0 26 26" fill="none" aria-hidden="true">
  <g class="dial">
    <path d="M13 3 L22.4 21.6 Q22.9 22.7 21.8 22.2 L13 18.4 L4.2 22.2 Q3.1 22.7 3.6 21.6 Z"
          fill="var(--amber)" />
  </g>
</svg>`;

const CSS = `
#hud {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  font-family: ${FAMILY};
  color: var(--paper);
  -webkit-font-smoothing: antialiased;
  transition: opacity 220ms ease;
}
#hud.away { opacity: 0; }

#hud .zone { position: absolute; display: flex; }
#hud .tl { top: 30px; left: 34px; }
#hud .tr { top: 30px; right: 34px; flex-direction: column; align-items: flex-end; }
#hud .bl { bottom: 30px; left: 30px; }
#hud .br { bottom: 30px; right: 34px; flex-direction: column; align-items: flex-end; }
#hud .bc { bottom: 40px; left: 50%; transform: translateX(-50%); flex-direction: column; align-items: center; gap: 12px; }

/* -- lap ------------------------------------------------------------------- */

/*
 * One instrument, two cells, read in a single glance across.
 *
 * A rule between them rather than a gap alone: two numbers side by side with
 * only air in between read as one four-digit number for the fraction of a second
 * it takes to separate them, and that fraction is the whole budget this thing
 * has. The rule is the cheapest possible full stop.
 */
#hud .lap { display: flex; align-items: stretch; gap: 18px; }
#hud .lap .cell + .cell {
  padding-left: 18px;
  border-left: 1px solid rgba(246, 239, 226, 0.18);
}
#hud .lap .cap {
  display: block;
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--paper-3);
  margin-bottom: 3px;
}
/* Baseline, so the big numeral and its total sit on one line however they wrap. */
#hud .lap .read { display: flex; align-items: baseline; gap: 4px; }
#hud .lap .now,
#hud .lap .p {
  font-size: 36px;
  line-height: 0.86;
  letter-spacing: -0.02em;
  font-variation-settings: 'opsz' 96;
}
#hud .lap .of { font-size: 15px; color: var(--paper-3); }

/*
 * Amber when you are leading and paper otherwise: one colour change, at the one
 * threshold anybody cares about. It is on the numeral alone — colouring the
 * caption as well doubles the signal and halves how quickly it is seen.
 */
#hud .lap .place.lead .p { color: var(--amber); }


/* -- clock ----------------------------------------------------------------- */

#hud .clock { text-align: right; }
#hud .clock .total { font-size: 46px; line-height: 0.94; font-variation-settings: 'opsz' 96; letter-spacing: -0.025em; }
#hud .clock .rows { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
#hud .clock .rows div { display: flex; align-items: baseline; justify-content: flex-end; gap: 10px; }
#hud .clock .rows span { font-size: 13px; color: var(--paper-2); }
#hud .clock .rows em { font-style: normal; font-size: 17px; }
#hud .clock .best.has em { color: var(--amber); }

/* -- wayfinder ------------------------------------------------------------- */

#hud .sign { display: flex; align-items: center; gap: 10px; }
#hud .sign svg { width: 26px; height: 26px; display: block; flex: none; filter: drop-shadow(0 2px 6px rgba(20, 14, 8, 0.55)); }
/* No transition on the rotation: it tracks a real bearing, and easing a bearing makes
   it point at where you were rather than at where the gate is. */
#hud .sign .dial { transform-origin: 50% 50%; }
#hud .sign .name { font-size: 19px; letter-spacing: -0.005em; }

#hud .warn {
  color: var(--pink);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.01em;
  animation: hudBlink 780ms steps(1, end) infinite;
}
@keyframes hudBlink { 0%, 62% { opacity: 1; } 62.01%, 100% { opacity: 0.25; } }

/* -- centre ---------------------------------------------------------------- */

/* Nothing sits at the optical centre: the chase camera puts the driver's head and
   shoulders dead in the middle of frame, so a countdown centred on the viewport is a
   countdown printed on the back of a chair. */
#hud .centre {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 13vh;
  gap: 16px;
  text-align: center;
}

#hud .count-in {
  font-size: 132px;
  line-height: 1;
  font-variation-settings: 'opsz' 96;
  letter-spacing: -0.05em;
  /* Scaled and faded per tick from script, so the number lands on the beat rather than
     on whatever frame the animation happened to start. */
}
#hud .count-in.go { color: var(--amber); font-size: 104px; letter-spacing: -0.03em; }

#hud .split .name { font-size: 15px; color: var(--paper-2); }
#hud .split .time { display: block; margin-top: 2px; font-size: 52px; line-height: 1; font-variation-settings: 'opsz' 96; letter-spacing: -0.03em; }
#hud .split.record .time { color: var(--amber); }
#hud .split .flag { display: block; margin-top: 4px; font-size: 14px; color: var(--amber); }

/*
 * -- the jumps -------------------------------------------------------------
 *
 * Two states of one instrument, and they are deliberately not the same thing.
 *
 * While the chair is off the floor the air time counts up, live, in the amber
 * the gauge uses for speed — a number that is still moving is what tells you the
 * jump is still happening, and it is the only readout in the game that rewards
 * being watched rather than glanced at. On the landing it is replaced by what the
 * jump was worth, which is a statement rather than a measurement, so it holds
 * still and then goes.
 *
 * Left of centre and just above the middle, which is the one part of the frame
 * nothing else uses: the gauge is bottom left, the plan bottom right, the clock
 * top right, the wayfinder bottom centre, and the countdown is long finished by
 * the time anybody reaches a ramp.
 */
#hud .air {
  position: absolute;
  left: 50%;
  top: 34%;
  transform: translateX(-50%);
  text-align: center;
  white-space: nowrap;
}
#hud .air .cap { display: block; font-size: 13px; letter-spacing: 0.16em; color: var(--paper-2); }
#hud .air .time {
  display: block;
  margin-top: -2px;
  font-size: 44px;
  line-height: 1;
  font-variation-settings: 'opsz' 96;
  letter-spacing: -0.03em;
  color: var(--amber);
}
#hud .air .score { display: block; margin-top: 2px; font-size: 15px; color: var(--paper-2); }
#hud .air.landed .time { color: var(--pink); }
#hud .air.landed .score { color: var(--amber); }
/*
 * And the one that went wrong, which has to read as wrong at a glance.
 *
 * A bail is the only thing this HUD ever reports as a *failure*, and it gets no
 * colour of its own: the amber and the pink are what the screen says when
 * something went well, so the quickest way to say it did not is to take the
 * colour away and let the word carry it.
 */
#hud .air.bailed .time { color: var(--paper-3); }
#hud .air.bailed .score { color: var(--paper); letter-spacing: 0.18em; }

/* -- the result, which is a table and so gets a ground --------------------- */

#hud .result {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 528px;
  padding: 22px 26px 24px;
  text-align: left;
}

/*
 * The place, at the size the thing everybody asks first deserves.
 *
 * This was a 14 px subtitle reading "1st of 5 · 3 laps · Level 6", which is four
 * facts at one weight where only one of them is the answer. Two of the four were
 * furniture — the lap count is on the HUD for the whole race and the floor is
 * the only floor there is — and the ordinal, the single thing a person came to
 * this card to read, was set smaller than the lap times underneath it.
 *
 * So the numeral is the card now: 72 px, amber on a win, with the suffix riding
 * high off its shoulder the way a race result is actually printed. Nothing at
 * all is set beside it. "Won" went first, because a word restating a numeral
 * three times its height is the card explaining its own headline; "of 5" went
 * after it, because the board directly underneath is five rows long and counting
 * them is not work. A headline that needs a subtitle is two headlines.
 */
#hud .result .crown { display: flex; align-items: baseline; }
#hud .result .pos {
  font-size: 72px;
  line-height: 0.82;
  letter-spacing: -0.04em;
  font-variation-settings: 'opsz' 96;
  color: var(--paper);
}
#hud .result .pos sup { font-size: 0.36em; letter-spacing: 0; margin-left: 0.04em; vertical-align: super; }
#hud .result.won .pos { color: var(--amber); }
#hud .result .sub { font-size: 13px; color: var(--paper-3); letter-spacing: 0.14em; text-transform: uppercase; }

/*
 * The two halves, side by side.
 *
 * They answer different questions — who you beat, and how you drove — and
 * stacking them made the card a column you scroll with your eyes, with the lap
 * times pushed so far down that the total ended up below the fold of anybody's
 * attention. Beside each other they are read in one glance, and the card gets
 * back the height it was spending on nothing.
 *
 * Equal columns rather than content-sized, because the standings are five rows
 * and the laps are three: sized to their contents the divider would sit off
 * centre and move every time the field or the lap count changed. A rule down the
 * middle at a fixed place is the thing that makes two lists read as one table.
 *
 * The shorter column hangs from the top rather than centring. Centred, the lap
 * times would float against the middle of the names, which is the one
 * arrangement that looks like a mistake rather than a choice.
 */
#hud .result .split {
  margin: 18px 0 0;
  padding: 0 0 16px;
  border-bottom: 1px solid rgba(246, 239, 226, 0.16);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

/*
 * And who else came in, which the card never said.
 *
 * A finishing position is a comparison, and a card that reports one without the
 * field is asking the player to take its word for it. The roster is the point of
 * the game — you beat the sales guy, or the office dog beat you — so the names
 * go on, in order, with your own row lit.
 */
#hud .result .board {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
#hud .result .board li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14.5px;
  color: var(--paper-3);
}
#hud .result .board i {
  font-style: normal;
  min-width: 15px;
  font-size: 13px;
  color: var(--paper-3);
}
#hud .result .board .me { color: var(--paper); font-weight: 700; }
#hud .result .board .me i { color: var(--amber); }
#hud .result .board .you {
  margin-left: auto;
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--amber);
}

/* Inside the split it is a column, not a block, and it carries the rule. */
#hud .result .log {
  margin: 0;
  padding-left: 24px;
  border-left: 1px solid rgba(246, 239, 226, 0.14);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
#hud .result .log div { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
#hud .result .log span { font-size: 15px; color: var(--paper-2); }
#hud .result .log em { font-style: normal; font-size: 19px; }
#hud .result .log .record span, #hud .result .log .record em { color: var(--amber); }
#hud .result .sum {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid rgba(246, 239, 226, 0.16);
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}
#hud .result .sum span { font-size: 15px; color: var(--paper-2); }
#hud .result .sum em { font-style: normal; font-size: 34px; line-height: 1; font-variation-settings: 'opsz' 96; letter-spacing: -0.02em; }

/*
 * The party.
 *
 * Three laps of an office is a small thing to win and the card was reporting it
 * like a receipt. Winning should be *loud* — so the paper comes down over the
 * whole screen rather than politely inside the panel, which is the difference
 * between a card with confetti on it and a room with confetti in it.
 *
 * A fixed layer that clips its own overflow, rather than clipping to the card,
 * and nothing in here takes a pointer: this sits over the result and the result
 * is the thing being read.
 *
 * The pieces are plain divs animated off the Web Animations API rather than a
 * keyframe each: forty elements needing forty different durations, delays,
 * drifts and spins is exactly the case a stylesheet cannot express and a loop
 * can. They are removed when the last one lands, so nothing is left animating
 * behind a menu.
 */
#hud .party {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 1;
}
#hud .party b {
  position: absolute;
  top: -24px;
  display: block;
  border-radius: 1px;
  will-change: transform, opacity;
}

/*
 * The glow behind a win, which is the one piece of this that is not literal.
 *
 * A warm bloom sat under the panel and behind the confetti: it lifts the card off
 * the room without touching its own background, and it is the reason the amber
 * numeral reads as lit rather than merely coloured. Only on a win — second place
 * gets the paper and not the sunrise.
 */
#hud .result.won::before {
  content: '';
  position: absolute;
  inset: -60px -50px;
  z-index: -1;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(242, 160, 43, 0.30), rgba(242, 160, 43, 0) 78%);
  pointer-events: none;
}

/* -- the plan -------------------------------------------------------------- */

${MINIMAP_CSS}

/*
 * Reprinted, and after the imported sheet so these win at equal specificity. The
 * game's plan is a 300 mm hairline at 1:400 over a daylight scene, which is right
 * there and a shimmer here; every stroke is roughly tripled and the whole thing is
 * paper on a dark ground. The route stays signal green and the marker stays the red
 * that every *Sie sind hier* dot in Germany is printed in.
 */
#hud .map { padding: 12px 13px 10px; display: flex; flex-direction: column; align-items: center; gap: 9px; }
#hud .map .label { font-size: 12.5px; font-weight: 600; color: var(--paper-2); }
#hud .map .sheet { display: none; }
#hud .map .sheet.on { display: block; }
#hud .map .room, #hud .map .deck { fill: none; stroke: rgba(246, 239, 226, 0.3); stroke-width: 0.5; }
#hud .map .deck { stroke-dasharray: 1.4 1; }
#hud .map .core { fill: rgba(246, 239, 226, 0.16); stroke: none; }
#hud .map .ramp { fill: none; stroke: rgba(246, 239, 226, 0.34); stroke-width: 0.45; stroke-dasharray: 0.9 0.9; }
#hud .map .route { fill: none; stroke: var(--green); stroke-width: 1.6; opacity: 1; }
#hud .map .finish { stroke: var(--paper); stroke-width: 1; opacity: 0.8; }
#hud .map .target { fill: none; stroke: var(--amber); stroke-width: 1; }
#hud .map .here { fill: var(--pink); stroke: none; }

/*
 * Last in the sheet, and that is load-bearing rather than tidy: this rule and the ones
 * that set a display mode are the same specificity, so the later of the two wins. With
 * it near the top the split card sat on screen for a whole race with a stale lap time
 * on it.
 */
#hud .hidden { display: none; }
`;

/**
 * One row of the finishing order.
 *
 * Names rather than seat ids, because the card is read by a person and "seat 3"
 * is not who beat them. Handed over already sorted — the ordering is a question
 * about the race, which `main.ts` owns, not about the interface.
 */
export type Standing = {
  /** 1-based, and its own field rather than the array index, so a tie could share one. */
  place: number;
  name: string;
  /** The chair at this keyboard. Exactly one row has it. */
  you: boolean;
};

export type ClayHud = {
  /**
   * Where to find the finishing order when the flag falls.
   *
   * A provider rather than an argument to `update`, and the reason is the call
   * rate: the result card is built once, on the frame the race ends, while
   * `update` runs 60 times a second for the whole race. Passing the standings in
   * would mean sorting the field and allocating five rows every frame so that
   * one frame in ten thousand could read them.
   */
  standings(provider: () => readonly Standing[]): void;
  /** Called once a frame with everything on screen. */
  update(
    race: Race,
    dt: number,
    kmh: number,
    charge: number,
    bearing: number,
    at: THREE.Vector3,
    yaw: number,
    /** Seconds off the floor right now, and the last landing to report. */
    airTime: number,
    trick: Trick | null,
    /** Where the player is in the field, 1-based, and how big the field is. */
    position: number,
    field: number,
  ): void;
  /** Out of the way while the menu is up. */
  setVisible(visible: boolean): void;
};

export function createClayHud(): ClayHud {
  installLook();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = el('div');
  root.id = 'hud';
  // Born hidden. It is created while the title card is still on screen and the first
  // frame is what sets its visibility, so starting visible means one fade-out of the
  // whole instrument set across the hero shot every time the game loads.
  root.classList.add('away');

  // -- lap -------------------------------------------------------------------
  /*
   * Two readings, side by side, built the same way.
   *
   * They used to be stacked: "Lap" and its number on one line, "Pos" and its
   * number under it, at two different sizes with the labels inline. That put the
   * two numbers a whole line apart vertically, which is the one axis a glance
   * mid-corner cannot spare — and set them at 34 and 30 px with different
   * captions, so they read as a heading with a footnote rather than as a pair.
   *
   * They are a pair. Same question asked twice: how far through, and how it is
   * going. So they are one instrument with two cells, captions above at one
   * size, numerals below at one size, on a shared baseline with a rule between
   * them — which is the same arrangement the result card uses for the standings
   * and the splits, and for the same reason.
   *
   * The row of checkpoint pips that sat between them is gone with the
   * checkpoints: it was a progress bar for a rule that no longer exists.
   */
  const cell = (caption: string, value: HTMLElement, of: HTMLElement, extra = ''): HTMLElement => {
    const box = el('div', `cell${extra ? ` ${extra}` : ''}`);
    const read = el('div', 'read');
    read.append(value, of);
    box.append(el('span', 'cap ui', caption), read);
    return box;
  };

  const lapValue = el('b', 'now num', '1');
  const lapOf = el('i', 'of num');
  const placeValue = el('b', 'p num', '1');
  const placeOf = el('i', 'of num');
  const place = cell('Pos', placeValue, placeOf, 'place');

  const lap = el('div', 'lap float');
  lap.append(cell('Lap', lapValue, lapOf), place);

  const tl = el('div', 'zone tl');
  tl.append(lap);

  // -- clock -----------------------------------------------------------------
  // No caption over it. A running clock in the corner of a racing game is a clock.
  const total = createOdometer('total num');
  total.set('0:00.00');
  const lastCell = createOdometer('num');
  lastCell.set('—');
  const bestCell = createOdometer('num');
  bestCell.set('—');

  const lastRow = el('div');
  const lastValue = el('em', 'num');
  lastValue.append(lastCell.element);
  lastRow.append(el('span', 'ui', 'Last'), lastValue);

  const bestRow = el('div', 'best');
  const bestValue = el('em', 'num');
  bestValue.append(bestCell.element);
  bestRow.append(el('span', 'ui', 'Best'), bestValue);

  const rows = el('div', 'rows');
  rows.append(lastRow, bestRow);
  const clock = el('div', 'clock float');
  clock.append(total.element, rows);

  const tr = el('div', 'zone tr');
  tr.append(clock);

  // -- speed -----------------------------------------------------------------
  const gauge = createGauge();
  const bl = el('div', 'zone bl');
  bl.append(gauge.element);

  // -- the plan --------------------------------------------------------------
  const minimap = createMinimap();
  minimap.element.classList.add('panel');
  const br = el('div', 'zone br');
  br.append(minimap.element);

  // -- wayfinder -------------------------------------------------------------
  const sign = el('div', 'sign float', ARROW);
  const dial = sign.querySelector('.dial') as SVGGElement;
  const gateName = el('span', 'name hd', GATES[1]!.label);
  sign.append(gateName);
  const warn = el('div', 'warn float hidden', 'Wrong Way');
  const bc = el('div', 'zone bc');
  bc.append(warn, sign);

  // -- centre ----------------------------------------------------------------
  const centre = el('div', 'centre');
  const countIn = el('div', 'count-in num float hidden');
  const split = el('div', 'split float hidden');
  const splitName = el('span', 'name ui', 'Lap 1');
  const splitTime = createOdometer('time num');
  splitTime.set('0:00.00');
  const splitFlag = el('span', 'flag ui hidden', 'Fastest Lap');
  split.append(splitName, splitTime.element, splitFlag);

  // -- jumps -----------------------------------------------------------------
  const air = el('div', 'air float hidden');
  const airCap = el('span', 'cap ui', 'Air');
  const airTime = el('b', 'time num', '0.00');
  const airScore = el('span', 'score ui hidden');
  air.append(airCap, airTime, airScore);

  const result = el('div', 'panel result hidden');
  centre.append(countIn, split, result);

  root.append(tl, tr, bl, br, bc, centre, air);
  document.body.append(root);

  // ---------------------------------------------------------------------------

  const last = { lap: -1, gate: -1, wrong: false, phase: '', countText: '', place: -1 };

  /** Write the air clock only when it changed. It is written every frame. */
  function airTime_(text: string): void {
    if (airText !== text || airTime.textContent !== text) {
      airText = text;
      airTime.textContent = text;
    }
  }

  /** Seconds left on the split card, counted down off the frame delta. */
  let splitFor = 0;
  /** And on the landed-trick card, which is the same trick with a shorter fuse. */
  let trickFor = 0;
  let airText = '';

  const setHidden = (node: Element, hidden: boolean) => node.classList.toggle('hidden', hidden);

  /** Where the player finished. Written by `update` on the frame the flag falls. */
  let finishedAt = 1;
  /** Empty until `main.ts` registers one, which it does before the first race. */
  let standingsOf: () => readonly Standing[] = () => [];

  /** Ordinal suffix, for a field that will never be big enough to need the teens rule. */
  const SUFFIX = ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th'] as const;

  /**
   * Paper over the whole screen, for as long as it takes to land.
   *
   * Sized and coloured off the game's own palette rather than a rainbow: this
   * room is amber, flame, green and pink, and confetti in colours the building
   * does not contain reads as a widget somebody dropped on top of it.
   *
   * Everything is randomised per piece — column, size, fall time, delay, drift,
   * spin, and which way up it starts — because forty identical arcs is a curtain
   * rather than a celebration. The layer removes itself on the last landing.
   */
  function party(pieces: number): void {
    const layer = el('div', 'party');
    const colours = ['var(--amber)', 'var(--hot)', 'var(--paper)', 'var(--green)', 'var(--pink)'];
    let longest = 0;

    for (let i = 0; i < pieces; i++) {
      const piece = el('b') as HTMLElement;
      const wide = 5 + Math.random() * 6;
      piece.style.width = `${wide.toFixed(1)}px`;
      // Half of them are ribbons rather than squares, which is what stops a fall
      // of rectangles reading as a fall of one rectangle.
      piece.style.height = `${(wide * (Math.random() < 0.5 ? 0.42 : 1.5)).toFixed(1)}px`;
      piece.style.background = colours[i % colours.length]!;
      piece.style.left = `${(Math.random() * 100).toFixed(2)}%`;

      const fall = 2200 + Math.random() * 2400;
      const delay = Math.random() * 900;
      longest = Math.max(longest, fall + delay);

      piece.animate(
        [
          { transform: `translate3d(0, 0, 0) rotate(${(Math.random() * 360).toFixed(0)}deg)`, opacity: 1 },
          {
            transform:
              `translate3d(${(Math.random() * 220 - 110).toFixed(0)}px, 105vh, 0) ` +
              `rotate(${(Math.random() * 1080 - 540).toFixed(0)}deg)`,
            opacity: 1,
          },
        ],
        {
          duration: fall,
          delay,
          // Gravity, near enough. A linear fall is a lift descending.
          easing: 'cubic-bezier(0.32, 0.02, 0.62, 0.4)',
          fill: 'forwards',
        },
      );
      layer.append(piece);
    }

    root.append(layer);
    setTimeout(() => layer.remove(), longest + 200);
  }

  function renderResult(race: Race): void {
    const log = race.splits
      .map(
        (t, i) =>
          `<div class="${t === race.best ? 'record' : ''}"><span class="ui">Lap ${i + 1}</span>` +
          `<em class="num">${formatTime(t)}</em></div>`,
      )
      .join('');

    // The headline is the position, and now at the size that says so. A race has an
    // outcome and burying it under the lap log is the one thing a result screen must
    // not do — the first thing anybody looks for after three laps is whether they won.
    const won = finishedAt === 1;
    const board = standingsOf()
      .map(
        (s) =>
          `<li class="${s.you ? 'me' : ''}"><i class="num">${s.place}</i>` +
          `<span>${s.name}</span>${s.you ? '<em class="you">You</em>' : ''}</li>`,
      )
      .join('');

    result.classList.toggle('won', won);
    result.innerHTML =
      `<div class="crown"><b class="pos num">${finishedAt}<sup>${SUFFIX[finishedAt] ?? 'th'}</sup></b></div>` +
      `<div class="split"><ol class="board">${board}</ol>` +
      `<div class="log">${log}</div></div>` +
      `<div class="sum"><span class="ui">Total</span>` +
      `<em class="num">${formatTime(race.totalTime)}</em></div>`;

    /*
     * The card arrives, rather than appearing.
     *
     * The numeral overshoots and the rows come in behind it on a stagger, which is
     * the whole difference between a result and an announcement. Off the Web
     * Animations API for the same reason the confetti is: this runs on an element
     * that was rebuilt by `innerHTML` a line ago, and a CSS class would have to be
     * removed before it could be re-added — which the second race of a session
     * would never see.
     */
    result.querySelector('.pos')?.animate(
      [
        { transform: 'scale(0.4) rotate(-9deg)', opacity: 0 },
        { transform: 'scale(1.12) rotate(2deg)', opacity: 1, offset: 0.62 },
        { transform: 'scale(1) rotate(0deg)', opacity: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
    );

    result.querySelectorAll('.board li').forEach((row, i) => {
      row.animate(
        [
          { transform: 'translateX(-10px)', opacity: 0 },
          { transform: 'translateX(0)', opacity: 1 },
        ],
        { duration: 300, delay: 180 + i * 70, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'backwards' },
      );
    });

    // Loud for a win, a handful for the rest of the podium, nothing for the back
    // half of the grid — confetti for fifth of five is the card being sarcastic.
    if (finishedAt === 1) party(90);
    else if (finishedAt <= 3) party(26);
  }

  return {
    standings(provider) {
      standingsOf = provider;
    },

    setVisible(visible) {
      root.classList.toggle('away', !visible);
    },

    update(race, dt, kmh, charge, bearing, at, yaw, airTime, trick, position, field) {
      minimap.update(at.x, at.y, at.z, yaw, race.gateAt, race.gateLevel);
      gauge.update(kmh, charge / CHARGE_FULL);

      const phase = race.phase;

      if (phase !== last.phase) {
        last.phase = phase;
        setHidden(result, phase !== 'finished');
        // The instruments are for driving. On the result they would be a second answer
        // to a question already answered in the middle of the screen.
        setHidden(bc, phase !== 'racing');
        if (phase === 'finished') {
          finishedAt = position;
          renderResult(race);
        }
        // A split belongs to the lap that produced it. Nothing that ends a race or
        // starts one may leave it hanging over what comes next.
        if (phase !== 'racing') {
          splitFor = 0;
          setHidden(split, true);
        }
      }

      // -- countdown ---------------------------------------------------------
      const go = phase === 'racing' && race.totalTime < GO_FOR;
      if (phase === 'countdown' || go) {
        // Which numeral, in beats rather than in seconds — see `BEAT` in race.ts. The
        // two were the same number for as long as a beat was a second, and this is
        // the line that quietly assumed it.
        const text = go ? 'Go' : String(Math.max(1, Math.ceil(race.countdown / BEAT)));
        if (text !== last.countText) {
          last.countText = text;
          countIn.textContent = text;
          countIn.classList.toggle('go', go);
        }
        setHidden(countIn, false);

        // Driven off the clock it is counting rather than off a CSS animation — an
        // animation started on whatever frame the class changed drifts out of step
        // within two ticks, and a countdown a frame out of step with itself is the one
        // piece of interface a player notices every single time.
        const intoBeat = race.countdown - Math.floor(race.countdown / BEAT) * BEAT;
        const elapsed = go ? race.totalTime : BEAT - intoBeat;
        const span = go ? GO_FOR : BEAT;
        // Snappier than it was, and proportional to the beat rather than fixed: at
        // 0.62s a settle that took 0.16 spent a quarter of the numeral's life still
        // arriving, which is exactly the softness that reads as lag.
        const settle = Math.min(1, elapsed / (span * 0.17));
        const leave = Math.max(0, (elapsed - span * 0.62) / (span * 0.38));
        countIn.style.transform = `scale(${(1.34 - 0.34 * settle).toFixed(3)})`;
        countIn.style.opacity = (Math.min(1, elapsed / (span * 0.1)) * (1 - leave * 0.92)).toFixed(3);
      } else if (last.countText !== '') {
        last.countText = '';
        setHidden(countIn, true);
      }

      // -- lap ---------------------------------------------------------------
      if (race.lap !== last.lap) {
        last.lap = race.lap;
        lapValue.textContent = String(race.lap);
        lapOf.textContent = `/${race.laps}`;
      }

      if (position !== last.place) {
        last.place = position;
        placeValue.textContent = String(position);
        placeOf.textContent = `/${field}`;
        place.classList.toggle('lead', position === 1);
      }

      // -- clock -------------------------------------------------------------
      // The odometers guard themselves, per character — see `look.ts`.
      total.set(formatTime(race.totalTime));
      lastCell.set(race.splits.length ? formatTime(race.splits[race.splits.length - 1]!) : '—');
      bestCell.set(race.best === null ? '—' : formatTime(race.best));
      bestRow.classList.toggle('has', race.best !== null);

      // -- wayfinder ---------------------------------------------------------
      if (race.gate !== last.gate) {
        last.gate = race.gate;
        gateName.textContent = GATES[race.gate]!.label;
      }
      dial.style.transform = `rotate(${(bearing * 57.29577951308232).toFixed(1)}deg)`;

      if (race.wrongWay !== last.wrong) {
        last.wrong = race.wrongWay;
        setHidden(warn, !race.wrongWay);
      }

      // -- jumps -------------------------------------------------------------
      //
      // A landing takes precedence over an ongoing jump for as long as its card
      // is up, so a second hop taken straight off the first does not wipe the
      // score for the one you just landed before you have read it.
      if (trick) {
        trickFor = 1.5;
        air.classList.toggle('landed', trick.clean);
        air.classList.toggle('bailed', !trick.clean);
        airText = trick.air.toFixed(2);
        airTime_(airText);
        // Rotation only when there was some worth mentioning. Below about a
        // quarter turn it is a correction rather than a trick, and printing "12°"
        // on every hop makes the whole readout look like instrumentation noise.
        const turn = trick.degrees >= 60 ? `${Math.round(trick.degrees / 15) * 15}\u00b0 \u00b7 ` : '';
        // Flips first, because a flip is the thing you *decided* to do — the air
        // and the spin are mostly what the ramp handed you. And on a bail there is
        // no figure at all, because the figure is nothing: what the card has to say
        // is which mistake it was, and there is only one way to bail a flip.
        const flip = trick.flips > 0 ? `${trick.flips > 1 ? `${trick.flips}× ` : ''}FLIP · ` : '';
        airScore.textContent = trick.clean
          ? `${flip}${turn}+${trick.boost.toFixed(1)} m/s`
          : 'BAILED';
        setHidden(airScore, false);
        setHidden(air, false);
      } else if (trickFor > 0) {
        trickFor -= dt;
        air.style.opacity = String(Math.min(1, trickFor / 0.4));
        if (trickFor <= 0) {
          setHidden(air, true);
          air.classList.remove('landed');
          air.classList.remove('bailed');
          setHidden(airScore, true);
        }
      } else if (airTime > 0.12) {
        // Not from the first millisecond: a chair crossing a threshold strip
        // leaves the floor for two hundredths, and a readout that flickers on
        // every kerb is noise rather than an instrument.
        air.style.opacity = '1';
        air.classList.remove('landed');
        setHidden(airScore, true);
        setHidden(air, false);
        airTime_(airTime.toFixed(2));
      } else if (!air.classList.contains('hidden')) {
        setHidden(air, true);
      }

      // -- split -------------------------------------------------------------
      const fresh = race.takeSplit();
      if (fresh && phase !== 'finished') {
        splitName.textContent = `Lap ${fresh.lap}`;
        splitTime.set(formatTime(fresh.time));
        split.classList.toggle('record', fresh.best);
        setHidden(splitFlag, !fresh.best);
        setHidden(split, false);
        splitFor = 2.2;
      }
      if (splitFor > 0) {
        splitFor -= dt;
        split.style.opacity = String(Math.min(1, splitFor / 0.45));
        if (splitFor <= 0) setHidden(split, true);
      }
    },
  };
}
