/**
 * The three things items put on the screen.
 *
 * A layer of its own rather than six more members on `ClayHud`, and that is not
 * filing — two of these are the only elements in the game that are *allowed* to
 * get in the way. The note at the top of `hud.ts` sets the rule the instruments
 * follow: nothing in the middle third of the frame except the two things allowed
 * to stop you reading the room. The powder and the module are a third and a
 * fourth, they exist precisely to stop you reading the room, and keeping them out
 * of the file that argues the opposite keeps that argument honest.
 *
 *   slot     what you are carrying. Top centre, which is the one corner of the
 *            frame nothing else uses and the place every game of this kind has
 *            put it since 1992.
 *   powder   a fire extinguisher went off in front of you. The screen whites out from
 *            the edges in and clears over a couple of seconds.
 *   module   a mandatory training module landed. A compliance card over the
 *            middle of the screen with a progress bar, for exactly as long as
 *            the spin-out lasts.
 *
 * ---- and no key legend --------------------------------------------------
 *
 * The slot used to spell out "E throw · Q behind · hold E to shield" for the
 * first two pickups of a session, on the argument that items add a verb nothing
 * else teaches. The argument was right and the place was wrong: a caption that
 * appears on the thing you have just won, in the corner of the frame, at the
 * exact moment you are looking at the road, is read by nobody and cluttered the
 * one piece of interface that has to be readable at a glance.
 *
 * Controls are explained where somebody is actually reading — the briefing on the
 * character select, which is up before every race and which nothing is chasing
 * you through. `hud.ts` gets its rule back: there are no key legends in the game.
 */

import { ITEMS, type ItemKind } from '../../game/items';
import { el, FAMILY, installLook } from './look';

/**
 * The five glyphs, on a 24-unit grid.
 *
 * ---- why these are drawn the way they are ---------------------------------
 *
 * They are read at 22 px, in the top corner of the frame, by somebody whose eyes
 * are on a corridor — so every one of them is a **silhouette first** and a
 * drawing second. Three rules came out of that and all three cost something:
 *
 *  - **No two share an outline.** The binder is portrait, the invite is
 *    landscape, the microwave is a wide box, the extinguisher is a tall bottle,
 *    the spill is horizontal and bottom-weighted. That is the whole reason the
 *    training module is a ring binder rather than the certificate it wants to be:
 *    a certificate and an invite are the same rectangle, and at this size the
 *    same rectangle is the same item.
 *  - **Detail is cut as holes, not drawn as lines.** A 1 px stroke on a 22 px
 *    glyph disappears the moment the buffer scale drops, and the quality
 *    controller drops it. Everything here is solid fill with `evenodd` holes, so
 *    the disc's own colour shows through and the contrast is the full range
 *    rather than a hairline.
 *  - **One idea each.** The microwave has a fish in the window and no dial
 *    detail; the binder has two rings and an exclamation and no spine label. What
 *    got cut is the stuff that turns to mud.
 */
const ICONS: Record<ItemKind, string> = {
  /* A bottle with a carry handle and a horn out of the top right. */
  extinguisher: `
    <path d="M9.1 7.8h5.8a2.4 2.4 0 0 1 2.4 2.4v8.4a2.4 2.4 0 0 1-2.4 2.4H9.1a2.4 2.4 0 0 1-2.4-2.4v-8.4a2.4 2.4 0 0 1 2.4-2.4Z"/>
    <path d="M10.7 5.1h2.6v2.7h-2.6Z"/>
    <path d="M8.9 3.2h6.3a1 1 0 1 1 0 2H8.9a1 1 0 1 1 0-2Z"/>
    <path d="M15.4 3.5 21.4 5.6l-1.2 3.3-2.1-.75.55-1.55-3.7-1.3Z"/>`,

  /*
   * A wide oven, its door cut out, with a fish in the gap.
   *
   * The window takes two thirds of the width and the fish nearly fills it, which
   * is a correction: the first cut gave the door a realistic share of the front
   * and three control bars beside it, and the fish came out eight pixels long —
   * a box with a speck in it. Nobody reads a speck. The oven only has to be
   * *enough* oven for the fish to be inside something.
   */
  microwave: `
    <path fill-rule="evenodd" d="M1.4 5.4h21.2a1.7 1.7 0 0 1 1.7 1.7v9.8a1.7 1.7 0 0 1-1.7 1.7H1.4A1.7 1.7 0 0 1-.3 16.9V7.1a1.7 1.7 0 0 1 1.7-1.7Zm1.8 2.3v8.6h13.9V7.7H3.2Z"/>
    <path d="M18.7 8.6h3v1.7h-3Zm0 3h3v4.1h-3Z"/>
    <path d="M4.4 12c2-3.3 6.2-3.9 8.7-1.7l2.5-2.1v7.6l-2.5-2.1c-2.5 2.2-6.7 1.6-8.7-1.7Z"/>`,

  /*
   * A portrait binder, with a slot down the spine and one exclamation.
   *
   * The two ring holes are gone. They were the detail that said "binder" and at
   * 22 px they said nothing at all — two sub-pixel dots that closed up into the
   * spine and left the glyph looking chipped. What survives the size is the
   * *proportion* (the narrowest shape in the set, against the calendar's widest)
   * and one mark, made big enough to actually be a mark.
   */
  training: `
    <path fill-rule="evenodd" d="M6.4 2.2h11.2a2.1 2.1 0 0 1 2.1 2.1v15.4a2.1 2.1 0 0 1-2.1 2.1H6.4a2.1 2.1 0 0 1-2.1-2.1V4.3a2.1 2.1 0 0 1 2.1-2.1Zm1.5 3.2v13.2h1.1V5.4H7.9Zm3.35 1.1h2.9v8h-2.9Zm-.15 10.35a1.6 1.6 0 1 1 3.2 0 1.6 1.6 0 1 1-3.2 0Z"/>`,

  /*
   * Bottom-weighted: a pool, with the cup that made it lying in it.
   *
   * The pool is half again as deep as it was and the cup is smaller and tipped
   * further, and both changes are the same fix — at the first proportions the cup
   * was the whole glyph and the pool was a hairline under it, so it read as "a
   * cup", which is a drink rather than a hazard. The spill is the item; the cup
   * is only the explanation.
   */
  puddle: `
    <path d="M1.9 17.4c0-2.15 4.5-3.5 10.1-3.5s10.1 1.35 10.1 3.5-4.5 3.5-10.1 3.5S1.9 19.55 1.9 17.4Z"/>
    <g transform="rotate(-56 8.4 8.2)">
      <path d="M6.2 2.4h4.9l-.9 7.3a1.6 1.6 0 0 1-1.6 1.45h-.15A1.6 1.6 0 0 1 6.85 9.7Z"/>
    </g>`,

  /* A landscape calendar with the hour already blocked out. */
  huddle: `
    <path d="M7.3 1.9a1.05 1.05 0 0 1 1.05 1.05V5.1H6.25V2.95A1.05 1.05 0 0 1 7.3 1.9Zm9.4 0a1.05 1.05 0 0 1 1.05 1.05V5.1h-2.1V2.95A1.05 1.05 0 0 1 16.7 1.9Z"/>
    <path fill-rule="evenodd" d="M3.5 4.5h17a1.85 1.85 0 0 1 1.85 1.85v13.3A1.85 1.85 0 0 1 20.5 21.5h-17a1.85 1.85 0 0 1-1.85-1.85V6.35A1.85 1.85 0 0 1 3.5 4.5Zm.6 5.4v9.75h15.8V9.9H4.1Z"/>
    <path d="M6.1 12.2h6.4v2.7H6.1Z"/>`,
};

const CSS = `
#items {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 11;
  font-family: ${FAMILY};
  color: var(--paper);
  -webkit-font-smoothing: antialiased;
}
#items.away { opacity: 0; transition: opacity 220ms ease; }

/* -- the slot -------------------------------------------------------------- */

#items .slot {
  position: absolute;
  top: 26px;
  left: 50%;
  transform: translateX(-50%) scale(1);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  opacity: 0;
  transition: opacity 160ms ease;
}
#items .slot.has { opacity: 1; }
/* Landed rather than faded in: a pickup is an event and the slot is the only
   confirmation of it that is not behind the driver by the time you look. */
#items .slot.fresh { animation: itemLand 420ms var(--pop); }
@keyframes itemLand {
  from { transform: translateX(-50%) scale(0.55); }
  to   { transform: translateX(-50%) scale(1); }
}

/*
 * The token: a disc of the item's own colour with the item drawn on it.
 *
 * Three things identify a pickup here and they work at three different distances:
 * the **colour** is what you catch without looking, the **glyph** is what you read
 * in the quarter second you can spare, and the **word** is what settles it the
 * first few times before you have learnt the other two. Dropping any of the three
 * costs somebody something — the colour alone cannot separate two reds, and the
 * word alone cannot be read at all while you are cornering.
 *
 * The disc is bigger than it was to give the glyph room: 44 px carrying a 24 px
 * drawing, where 38 px carrying nothing was fine.
 */
#items .slot .token {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid rgba(246, 239, 226, 0.85);
  box-shadow: 0 2px 10px rgba(20, 14, 8, 0.6), inset 0 0 0 3px rgba(20, 14, 8, 0.28);
  transition: background-color 120ms linear;
  display: grid;
  place-items: center;
}
#items .slot .token svg {
  width: 24px;
  height: 24px;
  display: block;
  /* Paper, not white: the same ink the rest of the interface is set in, so a
     pickup belongs to the HUD rather than looking like a system icon. The drop
     shadow is what keeps the glyph off the two darkest discs — the coffee brown
     and the extinguisher red are close enough in value to paper's shadow that a
     flat fill on them reads as a smudge. */
  fill: var(--paper);
  filter: drop-shadow(0 1px 1.5px rgba(20, 14, 8, 0.55));
}
/* Ringed while it is being dragged behind you, so a shield looks like one. */
#items .slot.shield .token {
  animation: itemShield 900ms ease-in-out infinite;
}
@keyframes itemShield {
  0%, 100% { box-shadow: 0 2px 10px rgba(20, 14, 8, 0.6), 0 0 0 3px rgba(246, 239, 226, 0.5); }
  50%      { box-shadow: 0 2px 10px rgba(20, 14, 8, 0.6), 0 0 0 9px rgba(246, 239, 226, 0); }
}

#items .slot .name { font-size: 14px; letter-spacing: 0.02em; text-shadow: var(--cast); }

/* -- the powder ------------------------------------------------------------ */

/*
 * From the edges in, not a flat white wash.
 *
 * A uniform overlay at 80% reads as the brightness being turned up; a cloud with
 * a hole near the middle reads as being *in* something, and leaves just enough of
 * the road visible that the two seconds are survivable rather than a black-out
 * with the colour inverted.
 */
#items .powder {
  position: absolute;
  inset: -10%;
  opacity: 0;
  background:
    radial-gradient(58% 52% at 47% 46%, rgba(255,255,255,0) 34%, rgba(255,255,255,0.96) 96%),
    radial-gradient(30% 34% at 22% 68%, rgba(255,255,255,0.9), rgba(255,255,255,0) 70%),
    radial-gradient(26% 30% at 78% 30%, rgba(255,255,255,0.86), rgba(255,255,255,0) 70%),
    radial-gradient(22% 26% at 66% 76%, rgba(255,255,255,0.8), rgba(255,255,255,0) 72%);
  filter: blur(2px);
}

/* -- the module ------------------------------------------------------------ */

/*
 * ---- the compliance module ------------------------------------------------
 *
 * The one item that stops the game rather than shoving it, so it is the one that
 * has to earn the interruption. It was a panel with four lines of text stacked on
 * it and a hairline progress bar, which is a *label* for a training module rather
 * than a training module — nothing about it said the thing the joke depends on,
 * which is that somebody has been made to sit through corporate e-learning in the
 * middle of a race.
 *
 * So it is drawn as the software it is pretending to be: a titled header strip with
 * a seal in it, a body, and a footer where the progress and the clock live. The
 * chrome is what sells it. A card with a header bar reads as an application; the
 * same words with no bar read as a notification.
 *
 * ---- and it asks you something now ---------------------------------------
 *
 * It used to have nothing on it to do, deliberately, on the argument that waiting
 * *is* the joke. That argument was wrong in the one way that matters: waiting is
 * the joke for about two seconds, and this card is up for longer than that, every
 * time, with the race carrying on behind it. An interruption with nothing to do in
 * it stops being a gag on the second showing and becomes the thing you dread.
 *
 * A question fixes both halves. It is funnier — corporate e-learning is only
 * really itself when it is making you click the obviously correct answer to a
 * question about a USB stick in a car park — and it turns a flat punishment into
 * something you can drive out of. Right answer and you are gone; wrong answer and
 * the bar goes back to nought, which is exactly what the real software does.
 *
 * The keys are 1/2/3 and they are drawn as keycaps, because the player has both
 * hands on the driving keys and no cursor. Nothing here is clickable and nothing
 * should be.
 */
#items .module {
  position: absolute;
  top: 46%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.94);
  width: min(420px, 82vw);
  padding: 0;
  overflow: hidden;
  text-align: left;
  opacity: 0;
  border: 1px solid rgba(246, 239, 226, 0.13);
  transition: opacity 130ms ease, transform 240ms var(--pop);
}
#items .module.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }

/* The header strip: the bit that makes it an application rather than a message. */
#items .module .top {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 16px;
  background: rgba(246, 239, 226, 0.07);
  border-bottom: 1px solid rgba(246, 239, 226, 0.11);
}
#items .module .seal {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: var(--pink);
  color: #fff;
  font: 800 12px/22px ${FAMILY};
  text-align: center;
  letter-spacing: 0;
}
#items .module .eyebrow {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--paper-2);
}
/* Pushed to the right of the strip, where an application puts its status. */
#items .module .state {
  margin-left: auto;
  font-size: 10.5px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--pink);
}

#items .module .body { padding: 15px 16px 14px; }
#items .module h2 { margin: 0; font-size: 23px; line-height: 1.1; letter-spacing: -0.02em; }
#items .module p {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.4;
  color: var(--paper-2);
  /* Two lines at this width, and it must stay two: the card is on screen for as
     long as the spin-out and a paragraph that reflows to three shifts the bar. */
  max-width: 34em;
}

/* -- the question ---------------------------------------------------------- */

#items .module .quiz {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 5px;
}
#items .module .opt {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: 6px;
  background: rgba(246, 239, 226, 0.05);
  border: 1px solid rgba(246, 239, 226, 0.08);
  font-size: 12.5px;
  line-height: 1.25;
  color: var(--paper-2);
  transition: background 120ms linear, border-color 120ms linear, color 120ms linear;
}
/* The keycap. It is the whole of the affordance — there is no pointer here. */
#items .module .opt .key {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: rgba(246, 239, 226, 0.12);
  border-bottom: 2px solid rgba(0, 0, 0, 0.35);
  color: var(--paper);
  font: 700 11px/17px ${FAMILY};
  text-align: center;
  font-variant-numeric: tabular-nums;
}
/* Answered right: the card is about to go, so this only has to register. */
#items .module .opt.right {
  background: rgba(74, 168, 104, 0.22);
  border-color: rgba(74, 168, 104, 0.55);
  color: var(--paper);
}
#items .module .opt.right .key { background: rgba(74, 168, 104, 0.6); }
/* Answered wrong: struck through and left there, because the retry has to be
   able to see what has already been tried. */
#items .module .opt.wrong {
  background: rgba(216, 69, 47, 0.16);
  border-color: rgba(216, 69, 47, 0.5);
  color: var(--paper-3);
  text-decoration: line-through;
  text-decoration-color: rgba(216, 69, 47, 0.8);
}
#items .module .opt.wrong .key { background: rgba(216, 69, 47, 0.5); }

#items .module .bar {
  margin-top: 14px;
  height: 6px;
  border-radius: 3px;
  background: rgba(246, 239, 226, 0.14);
  overflow: hidden;
}
#items .module .bar i {
  display: block;
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, var(--amber) 0%, var(--pink) 100%);
  /* No transition: the width is written every frame off the real timer, and easing
     a value that is already smooth only makes it lag the thing it is reporting. */
}
#items .module .foot {
  margin-top: 9px;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--paper-3);
}
/* The number that answers the only question anybody has: how much longer. */
#items .module .left {
  font-size: 12.5px;
  letter-spacing: 0.06em;
  color: var(--paper);
  font-variant-numeric: tabular-nums;
}

#items .hidden { display: none; }
`;

/**
 * The question bank.
 *
 * Every one of these is a real security-awareness question with a real correct
 * answer, and that is the joke rather than a departure from it: the humour in
 * mandatory training is that it is completely sincere. Nothing here is a trick,
 * because a trick question would make failing feel unfair at the one moment the
 * player is already being punished, and the wrong answers have to be *obviously*
 * wrong for the card to be readable in the two seconds it deserves.
 *
 * Kept short on purpose. Three options at twelve-point on a 420 px card is the
 * most that fits without the bar moving, and a player reading this is not
 * stationary in any sense that matters.
 */
type Question = {
  ask: string;
  options: readonly [string, string, string];
  /** Index into `options`. */
  right: 0 | 1 | 2;
};

const QUESTIONS: readonly Question[] = [
  {
    ask: 'A mail from the Geschäftsführung asks you to send the Q4 payroll file to a private address. It is marked urgent.',
    options: ['Send it — it is from the boss', 'Verify by phone on a known number', 'Forward it to your own inbox first'],
    right: 1,
  },
  {
    ask: 'You find a USB stick in the Parkhaus labelled “Gehälter 2026”.',
    options: ['Plug it in to find the owner', 'Hand it to IT unopened', 'Try it on a colleague’s machine'],
    right: 1,
  },
  {
    ask: 'Somebody rings claiming to be IT and asks you to read out your MFA code.',
    options: ['Read it out — they are internal', 'Never share it; report the call', 'Give them the first three digits'],
    right: 1,
  },
  {
    ask: 'A visitor with no badge follows you through the barrier at reception.',
    options: ['Hold the door, they look busy', 'Lend them your badge', 'Ask them to sign in at reception'],
    right: 2,
  },
  {
    ask: 'Your password expires today. Which one is acceptable?',
    options: ['A long passphrase in the manager', 'Sommer2026!', 'The old one with a 2 on the end'],
    right: 0,
  },
];

/**
 * What a wrong answer costs, in seconds, and it is deliberately small.
 *
 * The module already stops you dead for its own duration; this is a penalty on
 * top of a penalty, and stacking those is how an item stops being an obstacle
 * and starts being a lost race. A second and a half is long enough to be felt as
 * a consequence and short enough that guessing is still better than sitting
 * there, which is the behaviour worth encouraging — the card should always be
 * something you *do*.
 *
 * Exported because `main.ts` has to add exactly the same number to the chair's
 * spin-out. The card and the simulation agreeing to the frame is the rule this
 * whole overlay is written under; two constants a file apart is how that rule
 * gets broken six months from now.
 */
export const WRONG_ANSWER_PENALTY = 1.5;

export type ItemHud = {
  /** Called once a frame. */
  update(dt: number, held: ItemKind | null, trailing: boolean): void;
  /** Powder over the screen. */
  blind(seconds: number): void;
  /** The compliance module, for as long as the spin-out lasts. */
  module(seconds: number): void;
  /**
   * Answer the question on the card, if there is one up.
   *
   * Returns what happened so the caller can apply it to the chair: `'correct'`
   * means the stall is over and the chair should be released, `'wrong'` means
   * `WRONG_ANSWER_PENALTY` has been added here and must be added there too, and
   * `null` means there was no card, no question, or that option has already been
   * tried — in which case nothing happened and nothing should.
   */
  answer(index: number): 'correct' | 'wrong' | null;
  setVisible(visible: boolean): void;
  reset(): void;
};

export function createItemHud(): ItemHud {
  installLook();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = el('div');
  root.id = 'items';
  root.classList.add('away');

  const token = el('div', 'token');
  const name = el('div', 'name hd');
  const slot = el('div', 'slot');
  slot.append(token, name);

  const powder = el('div', 'powder');

  const module = el('div', 'panel module');

  // The header strip. A seal, what it is, and a status off to the right — the three
  // things every piece of compliance software puts across its top.
  const top = el('div', 'top');
  // Held rather than built inline: the status is the one part of the strip that
  // changes, and it changes on every answer.
  const state = el('div', 'state ui', 'In progress');
  top.append(el('div', 'seal', '!'), el('div', 'eyebrow ui', 'Mandatory Training'), state);

  const fill = el('i');
  const bar = el('div', 'bar');
  bar.append(fill);

  // How long is left, in seconds, and it is the only number on the card anybody
  // actually wants. It was not there at all: the bar filled and you were expected to
  // infer the rest from how fast it was moving.
  const remaining = el('span', 'left', '');

  const foot = el('div', 'foot ui');
  foot.append(el('span', '', 'Module 1 of 1'), remaining);

  // The question, and the three answers under it. Built once and rewritten per
  // module rather than rebuilt: this appears a handful of times a race, and a
  // node that is replaced is a node whose transition restarts from nothing.
  const ask = el('p', 'ui', '');
  const quiz = el('ul', 'quiz ui');
  const options = [0, 1, 2].map((i) => {
    const opt = el('li', 'opt');
    const label = el('span', '', '');
    opt.append(el('span', 'key', String(i + 1)), label);
    quiz.append(opt);
    return { opt, label };
  });

  const body = el('div', 'body');
  body.append(el('h2', 'hd', 'Information Security 2026'), ask, quiz, bar, foot);
  module.append(top, body);

  root.append(slot, powder, module);
  document.body.append(root);

  let shown: ItemKind | null = null;

  let powderFor = 0;
  let powderSpan = 1;
  let moduleFor = 0;
  let moduleSpan = 1;
  /** The question currently on the card, or null when there is no card up. */
  let quizzed: Question | null = null;
  /** Options already tried and got wrong, so a retry cannot re-answer them. */
  const spent = new Set<number>();

  return {
    setVisible(visible) {
      root.classList.toggle('away', !visible);
    },

    update(dt, held, trailing) {
      if (held !== shown) {
        shown = held;
        slot.classList.toggle('has', held !== null);
        if (held) {
          const item = ITEMS[held];
          token.style.backgroundColor = `#${item.colour.toString(16).padStart(6, '0')}`;
          // Rewritten rather than toggled between five prebuilt nodes: this runs
          // once per pickup — a dozen times a race — and five hidden SVGs kept in
          // the tree to save an innerHTML that costs microseconds is the kind of
          // saving that only ever buys a bug where one of them is left visible.
          token.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[held]}</svg>`;
          name.textContent = item.short;
          // Restarting the landing animation means taking the class off and
          // forcing a reflow before putting it back; without the read the browser
          // coalesces both writes and nothing plays from the second pickup on.
          slot.classList.remove('fresh');
          void slot.offsetWidth;
          slot.classList.add('fresh');
        }
      }
      slot.classList.toggle('shield', trailing && held !== null);

      if (powderFor > 0) {
        powderFor -= dt;
        const u = 1 - Math.max(0, powderFor) / powderSpan;
        // Full almost at once and then clearing, which is what a cloud you have
        // driven into does. Eased out hard so the last third is nearly gone —
        // holding it at half opacity for two seconds is unplayable in a way that
        // whiting out completely for a quarter of one is not.
        const alpha = Math.min(1, (1 - u) * 3.2) * (1 - u * u * 0.15);
        powder.style.opacity = alpha.toFixed(3);
        if (powderFor <= 0) powder.style.opacity = '0';
      }

      if (moduleFor > 0) {
        moduleFor -= dt;
        const done = 1 - Math.max(0, moduleFor) / moduleSpan;
        fill.style.width = `${(done * 100).toFixed(1)}%`;
        // Rounded up, so the last whole second is shown as 1 rather than 0 — a
        // counter that reads zero while the card is still up is a card that looks
        // stuck at the exact moment somebody is waiting on it.
        remaining.textContent = `${Math.max(1, Math.ceil(moduleFor))}s left`;
        if (moduleFor <= 0) module.classList.remove('on');
      }
    },

    blind(seconds) {
      powderFor = seconds;
      powderSpan = seconds;
    },

    module(seconds) {
      moduleFor = seconds;
      moduleSpan = seconds;
      fill.style.width = '0%';

      // A fresh question every time. Not seeded — see the note on `itemPlay`'s
      // generator in main.ts: the building is reproducible and a race is not,
      // and drawing the same question in the same order every lap is exactly the
      // thing somebody would notice on their third race.
      quizzed = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]!;
      spent.clear();
      ask.textContent = quizzed.ask;
      for (const [i, { opt, label }] of options.entries()) {
        label.textContent = quizzed.options[i]!;
        opt.classList.remove('right', 'wrong');
      }
      state.textContent = 'In progress';

      module.classList.add('on');
    },

    answer(index) {
      if (moduleFor <= 0 || !quizzed) return null;
      if (index < 0 || index > 2 || spent.has(index)) return null;

      if (index === quizzed.right) {
        options[index]!.opt.classList.add('right');
        state.textContent = 'Passed';
        // Down rather than hidden: the card goes on the same frame the chair is
        // released, because the two have to agree — see `stun` in main.ts — and
        // a card that lingers for a flourish is a card you are driving behind.
        moduleFor = 0;
        quizzed = null;
        module.classList.remove('on');
        return 'correct';
      }

      spent.add(index);
      options[index]!.opt.classList.add('wrong');
      state.textContent = 'Failed — retry';
      // Back to nought, which is the whole of the punishment and is what the real
      // software does. The span grows with the remaining time so the bar still
      // reads as a fraction of what is actually left rather than of what was
      // originally asked for.
      moduleFor += WRONG_ANSWER_PENALTY;
      moduleSpan = moduleFor;
      fill.style.width = '0%';
      return 'wrong';
    },

    reset() {
      shown = null;
      slot.classList.remove('has', 'shield', 'fresh');
      powderFor = 0;
      powder.style.opacity = '0';
      moduleFor = 0;
      module.classList.remove('on');
      quizzed = null;
      spent.clear();
    },
  };
}
