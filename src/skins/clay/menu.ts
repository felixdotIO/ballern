/**
 * The front end: pick who is driving and what they are driving, then go.
 *
 * One screen, a character select, laid out as a **left rail against the model**. The
 * camera in `main.ts` already composes for exactly this — it aims off the chair so the
 * figure sits in the right third "and the menu's type into the empty left" — and the rail
 * is the interface finally taking the frame the shot was built to hand it.
 *
 * The pass before this one hung the two pickers off the model itself: the driver's name
 * projected over his head, the chair's under its castors. A good idea that does not
 * survive contact with a real building. The projection is only ever a suggestion — a card
 * is 340 px wide and its anchor is a point — so every edge of the frame needed a clamp,
 * and the clamps are what you saw: the chair's card shoved four hundred pixels into empty
 * carpet to keep it off the left edge, sharing no margin, no baseline and no alignment
 * with anything else on screen. Two labels, two positions, nothing lining up with either.
 *
 * So the arrangement is a grid now, and it is a plain one. Everything the menu owns lives
 * in a single column pinned to the left margin, and every item in it shares one left edge
 * and one right edge:
 *
 *   top       the wordmark, closed off by a hairline the width of the rail
 *   bottom    the two pickers, then the way in
 *
 * Which means the vertical key order and the vertical layout are finally the same list —
 * up and down walk the column you can see, rather than a list that only existed in the
 * keyboard handler.
 *
 * The way in is still deliberately not shaped like anything else here. The pickers are
 * type with a pair of arrows ranged off the rail's right edge; the start is a filled
 * amber capsule the full width of the rail, because the last thing a title screen should
 * make you do is hunt for the button that starts the game. It is amber whether or not it
 * is selected — being the primary action is a property of the button, not of the cursor —
 * and selection shows as a ring around it.
 *
 * Motion is one curve: a plain ease-out, a little long, no overshoot. The wordmark comes
 * down, the rail comes up, and the only thing still allowed to bounce is a pip, which is
 * 6 px across and can afford it.
 */

import { el, FAMILY, installLook } from './look';

export type MenuHooks = {
  /** Whether there is a race in progress to go back to. */
  state(): { racing: boolean };
  /** Leave the line: countdown, then go. */
  start(): void;
  resume(): void;
  restart(): void;
  /** Who is driving and what they are driving — see `garage.ts`. */
  garage: {
    rider: { label(): string; index(): number; count(): number; cycle(d: 1 | -1): void };
    ride: { label(): string; index(): number; count(): number; cycle(d: 1 | -1): void };
  };
};

export type Menu = {
  readonly open: boolean;
  show(): void;
  hide(): void;
};

type Row =
  | {
      kind: 'pick';
      label: string;
      value(): string;
      index(): number;
      count(): number;
      cycle(direction: 1 | -1): void;
    }
  | { kind: 'button'; label: string; primary?: boolean; enter(): void };

/** The chevron in the start capsule. One shape, no outline, no badge. */
const CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.5 17 12l-8.5 7.5"/></svg>`;

const CSS = `
#menu {
  position: fixed;
  inset: 0;
  z-index: 20;
  font-family: ${FAMILY};
  color: var(--paper);
  opacity: 0;
  pointer-events: none;

  /*
   * The two numbers the whole screen is measured in.
   *
   * The rail is sized off the wordmark it used to carry as type: "CHAIR FORCE"
   * in Bricolage at 800 measures 5.67 times its own font size, so 5.67 × 5.2vw is a hair
   * under 30vw, and the hairline under the wordmark lands a few pixels wide of the type
   * above it at every window width between the two clamps. That near-miss is the grid,
   * and it is deliberately a near-miss: a rule that ends exactly on the R of FORCE looks
   * like a coincidence nobody trusts, one that runs a few pixels past it looks drawn.
   */
  --rail: clamp(330px, 30vw, 430px);
  --edge: max(5vw, 34px);

  /* One curve for the whole screen: a plain ease-out, no overshoot. */
  --ease: cubic-bezier(0.22, 0.61, 0.36, 1);
  /*
   * Out faster than in, which is the oldest rule in interface animation and the
   * one most often broken: arriving is an event and wants time, leaving is an
   * interruption and wants to be gone. 300 in, 170 out — and the way out is the
   * frame the countdown starts on, so anything slower is a menu the player is
   * already racing behind.
   */
  transition: opacity 300ms var(--ease);
}
#menu.on { opacity: 1; pointer-events: auto; }
#menu:not(.on) { transition-duration: 170ms; }

/* -- the key art ----------------------------------------------------------- */

#menu .art { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
/*
 * A sunburst behind the wordmark: rays at 13% amber, masked to a soft disc so it never
 * reaches an edge and never reads as a pattern. It reads as light coming off the type,
 * and it is the whole of the "artwork" — the illustration is the room, which is already
 * there and already lit.
 */
#menu .rays {
  position: absolute;
  inset: -30%;
  background: repeating-conic-gradient(
    from -20deg at 24% 17%,
    rgba(242, 160, 43, 0.13) 0deg 3deg,
    transparent 3deg 13deg
  );
  -webkit-mask-image: radial-gradient(closest-side at 24% 17%, #000 6%, transparent 60%);
  mask-image: radial-gradient(closest-side at 24% 17%, #000 6%, transparent 60%);
}
/*
 * The scrim, and it runs sideways now rather than only down.
 *
 * Type sits in one column against the left edge, so that is where the ground belongs: a
 * horizontal fall from nearly opaque at the margin to nothing by 62% of the width, which
 * is short of the model in every window this layout runs in. The vertical pair are kept
 * but taken back — the top one only has a wordmark to carry, and the bottom one is there
 * for the narrow layout, where the rail slides under the figure.
 */
#menu .wash {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(50% 38% at 15% 15%, rgba(242, 160, 43, 0.14), transparent 68%),
    linear-gradient(
      90deg,
      rgba(14, 9, 4, 0.84) 0%,
      rgba(14, 9, 4, 0.66) 24%,
      rgba(14, 9, 4, 0.28) 45%,
      rgba(14, 9, 4, 0) 62%
    ),
    linear-gradient(rgba(14, 9, 4, 0.5) 0%, rgba(14, 9, 4, 0) 28%),
    linear-gradient(rgba(14, 9, 4, 0) 60%, rgba(14, 9, 4, 0.34) 82%, rgba(14, 9, 4, 0.74) 100%);
}
#menu .vig {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 200px 40px rgba(10, 6, 2, 0.55);
}

/* -- the rail -------------------------------------------------------------- */

/*
 * One column, full height, with the wordmark at the top and everything else pushed to the
 * bottom by a single \`margin-top: auto\`. No card, no panel: the scrim is the ground.
 */
#menu .rail {
  position: absolute;
  left: var(--edge);
  top: max(4vh, 28px);
  bottom: max(6vh, 34px);
  width: var(--rail);
  display: flex;
  flex-direction: column;
}

/* -- the wordmark ---------------------------------------------------------- */

/*
 * Everything on the rail travels the same 14 px and takes the same 460 ms; the
 * only difference between them is when they start.
 *
 * Staggering is what turns four things moving into one thing arriving. The
 * wordmark leads because it is the title, the rule follows it because it belongs
 * to it, and the deck comes last because it is what you are being handed — 60 ms
 * apart, which is under the threshold where a stagger starts reading as a queue.
 * On the way out nothing is staggered at all: the delays are dropped so the whole
 * screen leaves together, because a menu that dismantles itself in sequence is a
 * menu you are waiting for.
 */
#menu .brand {
  margin: 0;
  /* The rail was sized off the wordmark set as type, and it still is — the logo
     just fills that width instead of nearly filling it. Height follows from the
     artwork's own ratio, so the rule underneath sits where it always did. */
  width: 100%;
  transform: translateY(-12px);
  transition: transform 460ms var(--ease);
}
#menu.on .brand { transform: none; }
#menu .brand img {
  display: block;
  /* Hugging, not filling: with width:100% and a height cap, object-fit contain
     letterboxes the emblem inside a box wider than itself, and the hairline below
     then measures the box rather than the artwork. */
  width: auto;
  max-width: 100%;
  height: auto;
  /* The rail is the width the logo wants in the wide layout. In the narrow one
     the rail *is* the screen, and a logo at 100% of that buries the driver, so
     the viewport's height gets the final say. A wide emblem needs less of that
     height than the stacked wordmark it replaced. */
  max-height: min(24vh, 200px);
  object-fit: contain;
  /* The same cast the type carried, as a shadow the shape can actually take. */
  filter: drop-shadow(0 6px 18px rgba(20, 14, 8, 0.55));
}
#menu .rule { transform: scaleX(0.82); transform-origin: left; transition: transform 520ms var(--ease) 60ms; }
#menu.on .rule { transform: none; }

/*
 * And the line that closes the block off.
 *
 * "ONE" is three characters under an eleven-character line, which leaves a notch the
 * width of eight letters with nothing under it — the wordmark reads unfinished, which is
 * most of why the old screen looked unplanned. A hairline the width of the rail resolves
 * the rag and, more usefully, states the column: everything below it is set to the same
 * two edges. It fades out to the right rather than stopping, because a rule with a hard
 * end in open carpet is a rule you have to explain.
 */
#menu .rule {
  margin-top: 24px;
  height: 1px;
  background: linear-gradient(90deg, rgba(246, 239, 226, 0.36), rgba(246, 239, 226, 0.05));
}

/* -- the deck: everything you can actually operate -------------------------- */

/*
 * The three gaps down the rail are 10 / 36 / 44, and they are in that order on purpose.
 * A picker is a caption, a name and a row of pips, and it only reads as one object if the
 * air inside it is clearly less than the air around it — the first cut had 12 inside and
 * 26 between, close enough that the four elements read as one undifferentiated ladder and
 * you had to use the type sizes to work out where a picker started. Groups are made of
 * ratios, not of gaps.
 */
#menu .deck {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 44px;
  transform: translateY(14px);
  transition: transform 460ms var(--ease) 120ms;
}
#menu.on .deck { transform: none; }
/* Leaving: no stagger, nothing held back. */
#menu:not(.on) .rule,
#menu:not(.on) .deck { transition-delay: 0ms; }

#menu .picks { display: flex; flex-direction: column; gap: 36px; }
#menu .acts { display: flex; flex-direction: column; gap: 12px; }

/* -- a picker -------------------------------------------------------------- */

#menu .pick .cap {
  display: block;
  font-weight: 600;
  font-variation-settings: 'opsz' 14;
  font-size: 11.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--paper-3);
  text-shadow: 0 2px 6px rgba(20, 14, 8, 0.85);
  transition: color 200ms var(--ease);
}
#menu .pick.on .cap { color: var(--amber); }

/*
 * The selected row lifts a hair off the rail.
 *
 * Two pixels and a slightly brighter caption, which sounds like nothing and is
 * the difference between a list where you know which row the arrow keys will act
 * on and one where you have to read the colours to find out. It is on the row
 * rather than on the name so the caption, the name and the pips move together —
 * moving only the name reads as the text being nudged rather than as the row
 * being chosen.
 */
#menu .pick {
  transform: translateY(2px);
  transition: transform 260ms var(--ease);
}
#menu .pick.on { transform: translateY(0); }

#menu .pick .line { display: flex; align-items: center; margin-top: 5px; }
#menu .pick .name {
  flex: 1 1 auto;
  min-width: 0;
  order: 1;
  margin-right: 16px;
  font-weight: 700;
  font-variation-settings: 'opsz' 40;
  font-size: clamp(24px, 1.95vw, 31px);
  line-height: 1.12;
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: var(--cast);
  cursor: pointer;
  will-change: transform, opacity;
}
/*
 * Both arrows ranged off the right edge of the rail, rather than one either side of the
 * name. Flanking looks tidier in a mockup and is worse in use: the names are between six
 * and twenty characters, so the right-hand arrow walks half the rail every time you press
 * it and you end up chasing the control you are already using. Pinned, only the gap
 * between the name and the pair changes.
 */
#menu .pick .arw {
  flex: none;
  order: 2;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border: 1.5px solid rgba(246, 239, 226, 0.2);
  border-radius: 50%;
  background: rgba(20, 14, 8, 0.46);
  box-shadow: 0 6px 18px -8px rgba(12, 7, 3, 0.85);
  color: var(--paper-2);
  font-family: ${FAMILY};
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition:
    background-color 200ms var(--ease),
    border-color 200ms var(--ease),
    color 200ms var(--ease),
    transform 200ms var(--ease);
}
#menu .pick .arw.r { order: 3; margin-left: 8px; }
#menu .pick.on .arw { background: var(--amber); border-color: transparent; color: var(--ink); }
#menu .pick .arw:hover { transform: scale(1.08); }
#menu .pick .arw:active { transform: scale(0.9); }
/* Tabbed to rather than clicked. A ring, in the amber everything selected uses,
   and only for keyboard focus — a halo that appears on every mouse click is the
   reason so many people turn focus rings off. */
#menu .arw:focus-visible,
#menu .start:focus-visible,
#menu .chip:focus-visible {
  outline: 2px solid var(--amber);
  outline-offset: 3px;
}

#menu .pick .pips { display: flex; gap: 5px; margin-top: 10px; }
#menu .pick .pips i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(246, 239, 226, 0.3);
  box-shadow: 0 1px 3px rgba(20, 14, 8, 0.6);
  /* The one thing small enough to still be allowed a bounce. */
  transition: background-color 180ms var(--ease), transform 260ms cubic-bezier(0.34, 1.5, 0.64, 1);
}
#menu .pick .pips i.at { background: var(--amber); transform: scale(1.4); }

/* -- the way in ------------------------------------------------------------ */

/*
 * Filled amber always, not only when selected. The old capsule was a ghost until the
 * cursor found it, which meant the one control nobody should have to look for was styled
 * as though it were optional. Selection is a ring instead — a state on top of a role,
 * rather than a state standing in for one.
 */
#menu .start {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  height: 64px;
  padding: 0 24px 0 28px;
  border: none;
  border-radius: 999px;
  background: var(--amber);
  color: var(--ink);
  font-family: ${FAMILY};
  font-weight: 700;
  font-variation-settings: 'opsz' 40;
  font-size: 21px;
  letter-spacing: -0.005em;
  box-shadow: 0 16px 34px -16px rgba(242, 160, 43, 0.8);
  cursor: pointer;
  transition:
    box-shadow 260ms var(--ease),
    filter 200ms var(--ease),
    transform 220ms var(--ease);
}
#menu .start.on {
  box-shadow:
    0 0 0 2px rgba(246, 239, 226, 0.55),
    0 18px 40px -14px rgba(242, 160, 43, 0.9);
}
#menu .start:hover { filter: brightness(1.06); }
#menu .start:active { transform: translateY(2px); }
#menu .start svg { width: 24px; height: 24px; display: block; }
#menu .start svg path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Secondary — which is the restart, and only ever the restart, now that the guides
   switch is gone. Full rail width, same shape as the start, quieter and unfilled. */
#menu .chip {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 50px;
  padding: 0 22px;
  border: 1.5px solid rgba(246, 239, 226, 0.18);
  border-radius: 999px;
  background: rgba(20, 14, 8, 0.46);
  color: var(--paper);
  font-family: ${FAMILY};
  font-weight: 600;
  font-variation-settings: 'opsz' 18;
  font-size: 15.5px;
  cursor: pointer;
  transition:
    border-color 220ms var(--ease),
    background-color 220ms var(--ease),
    transform 220ms var(--ease);
}
#menu .chip.on { border-color: var(--amber); background: rgba(20, 14, 8, 0.72); }
#menu .chip:active { transform: translateY(2px); }
#menu .chip svg { width: 20px; height: 20px; display: block; }
#menu .chip svg path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  opacity: 0.75;
}

/* -- narrow ---------------------------------------------------------------- */

/*
 * Below 13:10 the shot stops offsetting the chair — see \`showcase\` in main.ts, which
 * drops the aim offset to a third on a narrow window because there is no right third to
 * put anything in. So there is no empty left either, and the rail centres and sits under
 * the figure, where the bottom half of the scrim is already waiting for it. The arrows go
 * back to flanking the name, which is what a centred row wants.
 */
@media (max-width: 900px), (max-aspect-ratio: 13 / 10) {
  #menu {
    --edge: max(4vw, 22px);
    --rail: min(440px, calc(100vw - 2 * var(--edge)));
  }
  #menu .rail { left: 50%; transform: translateX(-50%); text-align: center; }
  #menu .brand .one { justify-content: center; }
  /*
   * Here the type is over the figure rather than beside it, so the bottom of the scrim
   * has to do the work the left of it does in the wide layout. Two thirds of the frame,
   * and dark enough at the foot to carry a caption across a sunlit trouser leg.
   */
  #menu .wash {
    background:
      radial-gradient(60% 26% at 50% 8%, rgba(242, 160, 43, 0.13), transparent 70%),
      linear-gradient(rgba(14, 9, 4, 0.72) 0%, rgba(14, 9, 4, 0.2) 18%, rgba(14, 9, 4, 0) 34%),
      linear-gradient(
        rgba(14, 9, 4, 0) 34%,
        rgba(14, 9, 4, 0.34) 56%,
        rgba(14, 9, 4, 0.72) 76%,
        rgba(14, 9, 4, 0.88) 100%
      );
  }
  #menu .rule {
    background: linear-gradient(
      90deg,
      rgba(246, 239, 226, 0.04),
      rgba(246, 239, 226, 0.3),
      rgba(246, 239, 226, 0.04)
    );
  }
  /* A name has two 38 px arrows and the window's own margins out of its way here rather
     than one rail edge, so it is set smaller — "The Summer Intern" is seventeen
     characters and an ellipsis on a driver's name is not a name. */
  #menu .pick .name { text-align: center; margin: 0 10px; font-size: clamp(19px, 5.6vw, 27px); }
  #menu .pick .arw { order: 0; }
  #menu .pick .arw.r { order: 3; margin-left: 0; }
  #menu .pick .pips { justify-content: center; }
  /* A caption at 34% paper is a whisper against a carpet and legible; against a sunlit
     trouser leg, which is where it lands in this layout, it is not. */
  #menu .pick .cap { color: var(--paper-2); }
  #menu .start { justify-content: center; gap: 14px; padding: 0 26px; }
  #menu .chip { justify-content: center; }
}

/* -- short ----------------------------------------------------------------- */

/*
 * The rail is a column with a wordmark pinned to the top of it and everything else pushed
 * to the bottom, which means it does not scroll, it collides — and the case that collides
 * is the pause menu, which has four rows where the title screen has three. At 1100 × 560,
 * back when there was a guides switch below the restart, the hairline went under the
 * wordmark and the switch went off the bottom edge. One row lighter it now fits at that
 * size — and the notch stays, because the margin it was buying is what makes 1100 × 480
 * fit too.
 *
 * So on a short window the whole rail is taken in a notch: the same arrangement, the same
 * order, the same ratios between the gaps, all of it about fifteen percent tighter. The
 * wordmark is the one thing that also gets a *height* cap, because it is two lines of
 * display type and it is by far the largest single thing competing for the column.
 *
 * Last in the sheet on purpose. A window can be both narrow and short — a 700 × 500 one
 * is — and when the two disagree the smaller of the two should win.
 */
@media (max-height: 700px) {
  #menu .rule { margin-top: 18px; }
  #menu .deck { gap: 30px; }
  #menu .picks { gap: 24px; }
  #menu .pick .name { font-size: clamp(22px, 1.8vw, 27px); }
  #menu .pick .pips { margin-top: 8px; }
  #menu .start { height: 56px; font-size: 19px; }
  #menu .chip { height: 44px; font-size: 15px; }
}
`;

export function createMenu(hooks: MenuHooks): Menu {
  installLook();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = el('div');
  root.id = 'menu';

  const brand = el('h1', 'brand');
  brand.innerHTML = `<img src="/art/logo.webp" alt="Chair Force One" />`;

  const picks = el('div', 'picks');
  const acts = el('div', 'acts');
  const deck = el('div', 'deck');
  deck.append(picks, acts);

  const rail = el('div', 'rail');
  rail.append(brand, el('div', 'rule'), deck);

  const art = el('div', 'art');
  art.append(el('div', 'rays'), el('div', 'wash'), el('div', 'vig'));

  root.append(art, rail);
  document.body.append(root);

  let open = false;
  let index = 0;
  let rows: Row[] = [];
  let nodes: HTMLElement[] = [];

  // ---------------------------------------------------------------------------

  /**
   * The name, changed rather than thrown.
   *
   * A fade across four pixels, not a slide across ten: the old one snapped in on an
   * overshoot and, held down, turned the nameplate into a flicker. Driven off the Web
   * Animations API rather than a CSS class because a class has to be removed before it
   * can be re-added, and somebody holding the arrow key outruns the transition — which
   * leaves the animation running once and then never again.
   */
  function bump(node: Element, direction: 1 | -1): void {
    node.animate(
      [
        { transform: `translateX(${direction * 7}px)`, opacity: 0.15 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      // 190 rather than 260: held down, the arrow key repeats at about 30 a
      // second on a stock keyboard, and any transition longer than the repeat
      // interval means the name never finishes arriving before it changes again —
      // which reads as a smear rather than as a list being walked.
      { duration: 190, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
  }

  function paint(): void {
    for (const [i, row] of rows.entries()) {
      const node = nodes[i]!;
      node.classList.toggle('on', i === index);

      if (row.kind === 'pick') {
        const name = node.querySelector('.name')!;
        const value = row.value();
        if (name.textContent !== value) name.textContent = value;

        const at = row.index();
        node.querySelectorAll('.pips i').forEach((pip, n) => pip.classList.toggle('at', n === at));
      }
    }
  }

  /**
   * Step a picker, and fade the name in from the side it came from.
   *
   * The pip that has just been left gets a shove in the same direction. It is two
   * lines and it is the only thing on the screen that says which way you are
   * moving through a list — the name arriving from the left could as easily be a
   * name arriving.
   */
  function step(i: number, direction: 1 | -1): void {
    const row = rows[i];
    if (row?.kind !== 'pick') return;
    const was = row.index();
    row.cycle(direction);
    paint();

    const node = nodes[i]!;
    const name = node.querySelector('.name');
    if (name) bump(name, direction);

    const left = node.querySelectorAll('.pips i')[was];
    left?.animate(
      [{ transform: `scale(1.4) translateX(${direction * -2}px)` }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' },
    );
  }

  function render(): void {
    picks.replaceChildren();
    acts.replaceChildren();

    nodes = rows.map((row, i) => {
      // Hovering anything in a row selects it, so the arrow keys always act on whatever
      // the cursor is over.
      const select = (node: HTMLElement) =>
        node.addEventListener('mouseenter', () => {
          index = i;
          paint();
        });

      if (row.kind === 'pick') {
        const pick = el('div', 'pick');

        // Written left, name, right, and reordered in CSS: the wide layout ranges both
        // arrows off the rail's right edge, the narrow one puts them back either side of
        // a centred name. Same three nodes, same reading order for anything that walks
        // the DOM.
        const left = el('button', 'arw l', '◀');
        const right = el('button', 'arw r', '▶');
        const name = el('b', 'name');

        const line = el('div', 'line');
        line.append(left, name, right);

        const pips = el('div', 'pips');
        for (let n = 0; n < row.count(); n++) pips.append(el('i'));

        pick.append(el('span', 'cap', row.label), line, pips);

        left.addEventListener('click', () => {
          index = i;
          step(i, -1);
        });
        // Clicking the name means the same thing Enter does on it: the next one.
        for (const node of [right, name]) {
          node.addEventListener('click', () => {
            index = i;
            step(i, 1);
          });
        }
        select(pick);

        /*
         * And the wheel steps it.
         *
         * A row of things with two arrows on it is a carousel, and every carousel
         * on every other screen this player has used today responds to a scroll.
         * Accumulated rather than acted on per event, because a trackpad emits
         * dozens of two-pixel deltas per flick and one flick should mean one
         * driver, not five.
         */
        let wheel = 0;
        pick.addEventListener(
          'wheel',
          (e) => {
            e.preventDefault();
            index = i;
            wheel += e.deltaY + e.deltaX;
            while (Math.abs(wheel) >= 40) {
              const direction = wheel > 0 ? 1 : -1;
              wheel -= direction * 40;
              step(i, direction);
            }
            paint();
          },
          { passive: false },
        );

        picks.append(pick);
        return pick;
      }

      const button = el('button', row.primary ? 'start' : 'chip');
      button.append(el('span', undefined, row.label));
      if (row.primary) button.insertAdjacentHTML('beforeend', CHEVRON);
      button.addEventListener('click', () => {
        index = i;
        row.enter();
      });
      select(button);
      acts.append(button);
      return button;
    });

    // Selection opens on the way in, so Enter is always "go" — nobody arriving at a title
    // screen wants their first keystroke to change a shirt.
    index = rows.findIndex((r) => r.kind === 'button' && r.primary);
    if (index < 0) index = 0;
    paint();
  }

  function build(): void {
    const { racing } = hooks.state();
    const g = hooks.garage;

    // The order here is the order down the rail *and* the order the arrow keys walk,
    // which is the point of the rail: one list, in one place, in one direction.
    rows = [
      {
        kind: 'pick',
        label: 'Driver',
        value: () => g.rider.label(),
        index: () => g.rider.index(),
        count: () => g.rider.count(),
        cycle: (d) => g.rider.cycle(d),
      },
      {
        kind: 'pick',
        label: 'Chair',
        value: () => g.ride.label(),
        index: () => g.ride.index(),
        count: () => g.ride.count(),
        cycle: (d) => g.ride.cycle(d),
      },
      // On the line and on the result there is nothing to go back to, so starting and
      // restarting are the same button and only one is offered. Mid-race they are
      // genuinely different — and stacked rather than sat side by side, the primary one
      // goes on top, where the eye already is coming down the rail. The destructive one
      // is below it and unfilled, which is a clearer separation than left-and-right ever
      // was.
      ...(racing
        ? ([
            { kind: 'button', label: 'Resume', primary: true, enter: () => (hide(), hooks.resume()) },
            { kind: 'button', label: 'Restart', enter: () => (hide(), hooks.restart()) },
          ] as Row[])
        : ([{ kind: 'button', label: 'Start Race', primary: true, enter: () => (hide(), hooks.start()) }] as Row[])),
    ];

    render();
  }

  function show(): void {
    if (open) return;
    open = true;
    build();
    root.classList.add('on');
  }

  function hide(): void {
    if (!open) return;
    open = false;
    root.classList.remove('on');
  }

  // ---------------------------------------------------------------------------
  // Keys, in the capture phase. While the menu is up nothing below it hears anything.
  // ---------------------------------------------------------------------------

  document.addEventListener(
    'keydown',
    (e) => {
      if (!open) {
        if (e.code === 'Escape') {
          e.preventDefault();
          show();
        }
        return;
      }

      e.stopPropagation();
      const row = rows[index];

      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW':
          index = (index - 1 + rows.length) % rows.length;
          paint();
          break;
        case 'ArrowDown':
        case 'KeyS':
          index = (index + 1) % rows.length;
          paint();
          break;
        case 'ArrowLeft':
        case 'KeyA':
          step(index, -1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          step(index, 1);
          break;
        case 'Enter':
        case 'NumpadEnter':
        case 'Space':
          // On a picker, confirming means "the next one" — there is nothing else it could
          // mean, and it saves reaching for the arrows to browse.
          if (row?.kind === 'pick') step(index, 1);
          else row?.enter();
          break;
        case 'Escape':
          // Nothing to go back to before the first race has been started: a menu that can
          // be dismissed onto a frozen grid is a dead end.
          if (hooks.state().racing) {
            hide();
            hooks.resume();
          }
          break;
        default:
          return;
      }

      e.preventDefault();
    },
    true,
  );

  return {
    get open() {
      return open;
    },
    show,
    hide,
  };
}
