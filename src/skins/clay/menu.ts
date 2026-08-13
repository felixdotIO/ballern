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
 * bar the full width of the rail, because the last thing a title screen should make you
 * do is hunt for the button that starts the game. It is filled whether or not it is
 * selected — being the primary action is a property of the button, not of the cursor —
 * and selection shows as a ring around it.
 *
 * **And all of it is set in the logo's terms.** The emblem was hung at the top of this
 * rail and shared nothing with what came under it: it leans, the rail was upright; it
 * is a saturated brand colour, the rail was amber; its letters are heavy caps, the rail
 * was set in sentence case. That reads as a logo dropped onto somebody else's screen,
 * because that is what it was. So the things the emblem is made of are what the screen
 * is made of — the lean on every display element, the flame's vermilion wherever the
 * pointing happens, caps for the names, and a run of tapered speed slashes where the
 * hairline used to be.
 *
 * The emblem has been redrawn once since, and this screen was rebuilt with it rather
 * than repainted: the old one was chrome, so the bar had a gradient and a bevel and
 * the slashes were a chequered flag; the new one is flat two-colour vinyl with no
 * highlight anywhere in it, so the bar is flat vermilion with the label knocked out in
 * black, and the chequer is gone because there is not a square in the artwork. A logo
 * change that only changes hex values is a logo change that leaves the furniture
 * behind, and the furniture is what people actually see.
 *
 * Amber is not gone: it is the light of the room the slashes are drawn on, so it runs
 * between them in the burst behind the emblem, and it goes back to being the only
 * accent the moment the race starts.
 *
 * Motion is one curve: a plain ease-out, a little long, no overshoot. The wordmark comes
 * down, the rail comes up, and the only thing still allowed to bounce is a pip, which is
 * a 10 px tick and can afford it.
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
    rider: Picker;
    ride: Picker;
  };
};

/**
 * One roster, and everything the screen needs to show all of it at once.
 *
 * `art` is a picture per entry, in the roster's own order — data URLs, rendered off
 * the assets at startup by `portraits.ts`. `choose` takes an absolute index rather
 * than a direction because the screen is a grid now: clicking the fourth chair means
 * the fourth chair, not "three to the right of wherever you were". The direction
 * comes along beside it anyway, because the 3D chair swivels the way you moved.
 */
export type Picker = {
  label(): string;
  index(): number;
  count(): number;
  art: readonly string[];
  choose(index: number, direction: 1 | -1): void;
};

export type Menu = {
  readonly open: boolean;
  show(): void;
  hide(): void;
};

type Row =
  | { kind: 'pick'; label: string; pick: Picker }
  | { kind: 'button'; label: string; primary?: boolean; enter(): void };

/*
 * The chevron in the start bar — doubled, because the emblem's tail is a run of
 * repeating marks and one chevron on a leaning bar reads as a disclosure arrow.
 */
const CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 11.5 12 4 18.5"/><path d="M13 5.5 20.5 12 13 18.5"/></svg>`;

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
   * under 30vw, and the emblem now fills that width instead of nearly filling it. What
   * runs under it is a few pixels wider than it at every window width between the two
   * clamps, which is the grid, and deliberately a near-miss: a line that ends exactly on
   * the emblem's right edge looks like a coincidence nobody trusts, one that runs a few
   * pixels past it looks drawn. It is moot for the slashes, which fade out rather than
   * ending, but it is why the rail is this wide and not some other width.
   */
  --rail: clamp(330px, 30vw, 430px);
  --edge: max(5vw, 34px);

  /*
   * The counter-lean. Every leaning box carries \`--lean\` on itself and hands this
   * to what is written inside it, so a label reads level on a bar that does not.
   * Type takes the shear directly, which is where it belongs — but a chevron, an
   * arrow glyph or an icon inside a sheared box only reads as a rendering fault, so
   * those are put back upright.
   */
  --plumb: calc(-1 * var(--lean));

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
 * The burst behind the wordmark, and it is the emblem's own burst now.
 *
 * The emblem is a flame with speed slashes trailing off it, so what stands behind it
 * is speed slashes: near-horizontal streaks in the flame's vermilion, sheared to the
 * same eleven degrees as everything else and thrown out to the left, which is the
 * direction the artwork's own streaks trail. A second, wider set in amber runs
 * between them at half the strength — that amber is not a leftover, it is the light
 * of the room the streaks are drawn on, and it is what stops a vermilion burst
 * reading as a red stain over a golden hall.
 *
 * The previous emblem was a star, and this was a conic sunburst radiating from behind
 * it: the right answer to a different logo, and a decoration under this one. Masked
 * to a soft ellipse so it never reaches an edge and never reads as a pattern.
 */
#menu .rays {
  position: absolute;
  inset: -30%;
  background:
    repeating-linear-gradient(
      -101deg,
      rgba(238, 82, 33, 0.2) 0 3px,
      transparent 3px 26px
    ),
    repeating-linear-gradient(
      -101deg,
      rgba(242, 160, 43, 0.1) 0 7px,
      transparent 7px 40px
    );
  -webkit-mask-image: radial-gradient(58% 30% at 24% 17%, #000 4%, transparent 72%);
  mask-image: radial-gradient(58% 30% at 24% 17%, #000 4%, transparent 72%);
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
    radial-gradient(46% 34% at 17% 15%, rgba(238, 82, 33, 0.17), transparent 70%),
    radial-gradient(58% 44% at 15% 16%, rgba(242, 160, 43, 0.12), transparent 68%),
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
/* -- the briefing ---------------------------------------------------------- */

/*
 * A sheet, not a rail item.
 *
 * The rail is a list of decisions — who, what, go — and prose is not a decision.
 * The briefing is the one screen in the game with something to *read*, so it gets
 * the other half of the frame: the side the driver is standing in, dimmed behind
 * it, because the moment you are reading you are no longer choosing a driver.
 *
 * It is opened deliberately and closed by anything. Nobody should ever be trapped
 * in a text panel one key press from a race.
 */
#menu .briefing {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: max(4vh, 28px) var(--edge) max(6vh, 34px);
  background: linear-gradient(90deg, rgba(14, 9, 5, 0.55) 0%, rgba(14, 9, 5, 0.88) 45%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms var(--ease);
}
#menu .briefing.on { opacity: 1; pointer-events: auto; }

#menu .briefing .sheet {
  width: min(560px, 92%);
  max-height: 100%;
  overflow-y: auto;
  color: var(--paper);
}
#menu .briefing h2 {
  margin: 0;
  font-size: clamp(26px, 3.4vw, 40px);
  line-height: 1.02;
  letter-spacing: -0.02em;
}
#menu .briefing .kicker {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--hot);
  margin-bottom: 6px;
}
#menu .briefing p {
  margin: 14px 0 0;
  font-size: 15px;
  line-height: 1.5;
  color: var(--paper-2);
  max-width: 46ch;
}
/*
 * The last line of the memo, which is the only one anybody has to remember.
 *
 * Full paper rather than the body's 68%, and that is the whole of the styling: the
 * page is three paragraphs of dry office prose and then a sentence about it being
 * the last time. Bringing it up to the headline's weight lets the eye find it after
 * skimming, which is what everybody does with a page of text in front of a race.
 */
#menu .briefing p.sting {
  color: var(--paper);
  font-size: 16.5px;
  margin-top: 18px;
}
#menu .briefing h3 {
  margin: 22px 0 0;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--paper-3);
}
#menu .briefing dl {
  margin: 8px 0 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 5px 16px;
  align-items: baseline;
  font-size: 14.5px;
}
#menu .briefing dt {
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  color: var(--paper);
}
#menu .briefing dd { margin: 0; color: var(--paper-2); }
#menu .briefing .dismiss {
  margin-top: 24px;
  font-size: 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--paper-3);
}

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
 * wordmark leads because it is the title, the flag follows it because it belongs
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
     artwork's own ratio, so the flag underneath sits where it always did. */
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
  /* Tighter and harder than the chrome emblem wanted. Flat vinyl over a lit room
     needs an edge to sit on rather than a glow to float in — a wide soft shadow under
     a shape with no depth of its own just makes it look like it is peeling. */
  filter: drop-shadow(0 3px 10px rgba(20, 14, 8, 0.62));
}
#menu .flag {
  transform: skewX(var(--lean)) scaleX(0.82);
  transform-origin: left center;
  transition: transform 520ms var(--ease) 60ms;
}
#menu.on .flag { transform: skewX(var(--lean)); }

/*
 * And the thing that closes the block off — which was a hairline, then a checkered
 * flag, and is three speed slashes now.
 *
 * The job has not changed in any of those passes. "ONE" is a short last line under a
 * wide emblem, so the lockup rags badly at the bottom left and reads unfinished
 * without something to sit on; and whatever sits there also states the column,
 * because everything below it is set to the same two edges.
 *
 * What changes each time is which piece of the emblem is available to do it, and it
 * has to be a piece of the emblem or the screen goes back to having two designers.
 * The chequered tail belonged to a logo that no longer exists — there is not one
 * square anywhere in the new one — and what has replaced it is a run of tapered
 * streaks trailing off the words. So: three of those, longest at the top, each fading
 * out to nothing rather than stopping, sheared with everything else. A flag going
 * past rather than a flag planted, which was the point of the checker too.
 *
 * Three, not one. A single streak under a wordmark is an underline, and an underline
 * is a text decoration; three of unequal length is motion.
 */
#menu .flag {
  margin-top: 20px;
  height: 15px;
  background-image:
    linear-gradient(90deg, var(--hot) 0%, rgba(238, 82, 33, 0) 100%),
    linear-gradient(90deg, var(--hot) 0%, rgba(238, 82, 33, 0) 100%),
    linear-gradient(90deg, var(--hot) 0%, rgba(238, 82, 33, 0) 100%);
  background-size: 100% 3px, 64% 3px, 38% 3px;
  background-position: 0 0, 0 6px, 0 12px;
  background-repeat: no-repeat;
  filter: drop-shadow(0 2px 6px rgba(20, 14, 8, 0.6));
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
#menu:not(.on) .flag,
#menu:not(.on) .deck { transition-delay: 0ms; }

#menu .picks { display: flex; flex-direction: column; gap: 36px; }
#menu .acts { display: flex; flex-direction: column; gap: 12px; }

/* -- a picker: the whole roster, laid out ---------------------------------- */

#menu .pick .cap {
  display: block;
  width: fit-content;
  font-weight: 700;
  font-variation-settings: 'opsz' 14;
  font-size: 11.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--paper-3);
  text-shadow: 0 2px 6px rgba(20, 14, 8, 0.85);
  /* Leaning from the baseline out, so the caption and the row below it share a left
     edge at the line they actually sit on rather than at the top of the caption. */
  transform: skewX(var(--lean));
  transform-origin: left bottom;
  transition: color 200ms var(--ease);
}
#menu .pick.on .cap { color: var(--hot); }

/*
 * The selected row lifts a hair off the rail.
 *
 * Two pixels and a slightly brighter caption, which sounds like nothing and is the
 * difference between a list where you know which row the arrow keys will act on and
 * one where you have to read the colours to find out.
 */
#menu .pick {
  transform: translateY(2px);
  transition: transform 260ms var(--ease);
}
#menu .pick.on { transform: translateY(0); }

/* -- the tiles ------------------------------------------------------------- */

#menu .pick .grid {
  display: flex;
  gap: 5px;
  margin-top: 9px;
  width: fit-content;
}

/*
 * A tile is a sheared frame with an upright picture in it.
 *
 * Both halves of that are deliberate. The frame leans because everything on this
 * screen leans — a grid of squares under an emblem cut at eleven degrees is the one
 * element that would announce it had been added later. The *picture* does not lean,
 * because a sheared face is a broken face: this is the one place on the screen where
 * the counter-lean is not a nicety but the whole reason the shear is affordable.
 *
 * The image is scaled up inside its frame rather than fitted to it. A rectangle
 * sheared eleven degrees leaves a triangle of nothing in two corners, and 1.18 is
 * what covers them at this aspect — cheaper and steadier than clipping each tile to
 * its own parallelogram path.
 */
#menu .pick .tile {
  flex: none;
  /*
   * 50 px, which is what seven of them plus their gaps come to inside the rail — the
   * roster's own length sets this, not taste. It is worth every pixel it can get: a
   * head rendered at 46 was a thumbnail of a thumbnail, and the entire argument for
   * showing the roster is that you can tell one of them from another at a glance.
   */
  width: 50px;
  height: 50px;
  padding: 0;
  border: 1.5px solid rgba(246, 239, 226, 0.16);
  border-radius: 3px;
  background: rgba(20, 14, 8, 0.5);
  overflow: hidden;
  cursor: pointer;
  transform: skewX(var(--lean));
  transition:
    background-color 200ms var(--ease),
    border-color 200ms var(--ease),
    transform 220ms var(--ease),
    box-shadow 220ms var(--ease);
}
#menu .pick .tile img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: skewX(var(--plumb)) scale(1.18);
  /* Off, until it is the one you have got. A roster of eleven full-colour heads all
     shouting at once is a sticker album; the greyed ones are the list, and the lit
     one is the answer. */
  filter: grayscale(0.5) brightness(0.86) contrast(0.98);
  transition: filter 220ms var(--ease);
}
#menu .pick .tile:hover {
  border-color: rgba(246, 239, 226, 0.4);
  transform: skewX(var(--lean)) translateY(-2px);
}
#menu .pick .tile:hover img { filter: grayscale(0.15) brightness(1); }

/*
 * And the one you have got: filled with the flame, lifted out of the row, and its
 * picture given back its colour. Three changes on one element, which is the amount a
 * 46 px square needs to be unmistakable at a glance across a screen.
 */
#menu .pick .tile.at {
  border-color: transparent;
  background: var(--hot);
  transform: skewX(var(--lean)) translateY(-3px) scale(1.06);
  box-shadow: 0 10px 22px -10px rgba(238, 82, 33, 0.95);
}
#menu .pick .tile.at img { filter: none; }
/* Tabbed to rather than clicked. A ring, in the colour everything selected uses, and
   only for keyboard focus — a halo that appears on every mouse click is the reason so
   many people turn focus rings off. */
#menu .tile:focus-visible,
#menu .start:focus-visible,
#menu .chip:focus-visible {
  outline: 2px solid var(--hot);
  outline-offset: 3px;
}

/* -- and its name ---------------------------------------------------------- */

/*
 * Under the row rather than beside it, and set the way the emblem sets a word: caps,
 * heavy, slightly narrowed, leaning.
 *
 * Caps because every word in the logo is one, and because these are titles — "The
 * Summer Intern" is a driver, not a sentence. Narrowed to 90% because caps are wide
 * and the rail is not. The shear is taken from the baseline out for the same reason
 * the caption's is: it is a left-aligned column, and a shear about the middle would
 * pull every long name a few pixels off the margin the short ones sit on.
 */
#menu .pick .name {
  display: block;
  margin-top: 9px;
  font-weight: 800;
  font-variation-settings: 'opsz' 40;
  font-stretch: 90%;
  font-size: clamp(20px, 1.55vw, 25px);
  line-height: 1.12;
  letter-spacing: 0.005em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: var(--cast);
  transform: skewX(var(--lean));
  transform-origin: left bottom;
  will-change: transform, opacity;
}

/* -- the way in ------------------------------------------------------------ */

/*
 * Filled always, not only when selected. The old capsule was a ghost until the cursor
 * found it, which meant the one control nobody should have to look for was styled as
 * though it were optional. Selection is a ring instead — a state on top of a role,
 * rather than a state standing in for one.
 *
 * And it is the emblem's bar: sheared, cornered at 3 px rather than rounded to a pill,
 * **flat vermilion with the label knocked out of it in black.** That last part is the
 * whole change from the pass before, and it is not a recolour. The old bar was three
 * pinks in a vertical gradient with a white hairline along the top edge and a dark one
 * along the bottom, because the old emblem was chrome and had a top bevel and an
 * extrusion to imitate. This one has neither: it is two flat colours with a hard edge
 * between them, and every gradient, inset and highlight that was there to echo a bevel
 * is now echoing something that does not exist. Vinyl has no highlight.
 *
 * Black on the orange rather than paper, for the same reason: it is what the artwork
 * does. It also happens to be the better of the two — ink on this vermilion is 4.8:1
 * where paper is 3.1 — but that is a bonus rather than the argument.
 */
#menu .start {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  height: 62px;
  padding: 0 24px 0 26px;
  border: none;
  border-radius: 3px;
  background: var(--hot);
  color: var(--ink);
  font-family: ${FAMILY};
  font-weight: 800;
  font-variation-settings: 'opsz' 40;
  font-stretch: 92%;
  font-size: 20px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  transform: skewX(var(--lean));
  /* One shadow, and it is the light the bar throws rather than an edge on it. */
  box-shadow: 0 16px 34px -16px rgba(238, 82, 33, 0.9);
  cursor: pointer;
  transition:
    box-shadow 260ms var(--ease),
    background-color 200ms var(--ease),
    transform 220ms var(--ease);
}
/* The label and the chevron sit level on it; only the bar leans. */
#menu .start > * { transform: skewX(var(--plumb)); }
#menu .start.on {
  box-shadow:
    0 0 0 2px rgba(246, 239, 226, 0.62),
    0 18px 40px -14px rgba(238, 82, 33, 0.95);
}
/* A tint of the one colour, not a brightness filter: filters lift the black label
   with the bar, and the label is meant to stay the darkest thing on the screen. */
#menu .start:hover { background: var(--hot-lift); }
#menu .start:active {
  background: var(--hot-deep);
  transform: skewX(var(--lean)) translateY(2px);
}
#menu .start svg { width: 22px; height: 22px; display: block; }
#menu .start svg path {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Secondary — which is the restart, and only ever the restart, now that the guides
   switch is gone. Full rail width, same shape as the start, quieter and unfilled. */
#menu .chip {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 48px;
  padding: 0 22px;
  border: 1.5px solid rgba(246, 239, 226, 0.18);
  border-radius: 3px;
  background: rgba(20, 14, 8, 0.46);
  color: var(--paper);
  font-family: ${FAMILY};
  font-weight: 700;
  font-variation-settings: 'opsz' 18;
  font-size: 14px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transform: skewX(var(--lean));
  cursor: pointer;
  transition:
    border-color 220ms var(--ease),
    background-color 220ms var(--ease),
    transform 220ms var(--ease);
}
#menu .chip > * { transform: skewX(var(--plumb)); }
#menu .chip.on { border-color: var(--hot); background: rgba(20, 14, 8, 0.72); }
#menu .chip:active { transform: skewX(var(--lean)) translateY(2px); }
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
  /*
   * The slashes state the column in the wide layout — they run off the left margin,
   * the width of the rail, because that is the edge everything below them is set to.
   * Centred there is no column to state, so they shrink to a mark under the emblem
   * and are centred as a block, which is the same call the splash makes. Still ranged
   * left inside that block and still fading right: a streak trails, and one that
   * tapers at both ends is a leaf.
   */
  #menu .flag {
    width: clamp(120px, 26vw, 170px);
    margin-left: auto;
    margin-right: auto;
    transform-origin: center;
  }
  #menu.on .flag { transform: skewX(var(--lean)); }

  /* A name has the window's own margins out of its way here rather than one rail
     edge, so it is set smaller — "The Summer Intern" is seventeen characters and an
     ellipsis on a driver's name is not a name. */
  #menu .pick .name { text-align: center; font-size: clamp(17px, 4.6vw, 24px); }
  /* Shrink-to-fit boxes, so \`text-align\` on the rail cannot reach them — centring a
     box that is only as wide as its contents is a margin, not an alignment. */
  #menu .pick .cap,
  #menu .pick .grid { margin-left: auto; margin-right: auto; }
  /* And they lean about their own middle here, not their left edge, or the shear
     walks each line a few pixels off the centre the one above it is on. */
  #menu .pick .cap,
  #menu .pick .name { transform-origin: bottom center; }
  /* Tracking lands after the last letter too, so a centred caption sits half a space
     left of centre. Paid back at the front. */
  #menu .pick .cap { text-indent: 0.18em; }
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
  /* The slashes close up: 2 px streaks 4 px apart rather than 3 and 6. Still three
     of them — two is a pair of rules, and a pair of rules is a table. */
  #menu .flag {
    margin-top: 14px;
    height: 10px;
    background-size: 100% 2px, 64% 2px, 38% 2px;
    background-position: 0 0, 0 4px, 0 8px;
  }
  #menu .deck { gap: 30px; }
  #menu .picks { gap: 24px; }
  #menu .pick .grid { margin-top: 7px; gap: 4px; }
  #menu .pick .tile { width: 42px; height: 42px; }
  #menu .pick .name { margin-top: 6px; font-size: clamp(18px, 1.45vw, 22px); }
  #menu .start { height: 54px; font-size: 18px; }
  #menu .chip { height: 42px; font-size: 13px; }
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
  rail.append(brand, el('div', 'flag'), deck);

  const art = el('div', 'art');
  art.append(el('div', 'rays'), el('div', 'wash'), el('div', 'vig'));

  /*
   * The briefing: the one screen in this game with something to read on it.
   *
   * It carries two things that had nowhere sensible to live. The controls were
   * being taught by a caption on the item slot, mid-race, in the corner of the
   * frame — the worst place to put a sentence in the whole product. And the
   * *reason for any of this* was nowhere at all: a player arrived at a character
   * select for a race between office chairs with no idea why office chairs.
   *
   * A game does not need a story. It does need somebody to have decided what it
   * is, and to have written that down where it can be found without being made
   * compulsory — which is what a briefing behind a menu row is.
   */
  const briefing = el('div', 'briefing');
  const sheet = el('div', 'sheet');
  sheet.innerHTML = `
    <div class="kicker">Level 6 · Internal memo · Please do not forward</div>
    <h2 class="hd">Three laps. One mug.</h2>
    <p>It started at the Sommerfest. Facilities bet the boss a crate of Sprudel that
       nobody could get a task chair from Reception to the Teeküche without putting a
       foot down. The boss did it in forty seconds. On carpet. Holding a plate.</p>
    <p>By Wednesday there was a route. By Friday there were rules, because the sales
       guy went through the canteen and everybody agreed that did not count. There is
       a timekeeper now. There is a trophy, and the trophy is the mug from the third
       kitchen — <b>WORLD&rsquo;S OKAYEST EMPLOYEE</b> — and seven people have booked
       the afternoon off to win it.</p>
    <p>The lease ends Friday. The movers come Monday. Until then Level&nbsp;6 is not an
       office, it is a circuit: three laps through every room you have ever sat in, out
       onto the Parkdeck, down through Ebene&nbsp;5 and back past your own desk. Your
       colleagues came down to watch. They are standing exactly where people used to
       cut the corner.</p>
    <p class="sting">Drive the whole thing. Nobody gets to drive it again.</p>

    <h3>Driving</h3>
    <dl>
      <dt>W A S D</dt><dd>steer and drive — arrow keys work too</dd>
      <dt>Space</dt><dd>hold to drift. Hold it longer for a bigger boost: three
        levels, and the third takes a whole corner to earn</dd>
      <dt>R</dt><dd>back to the grid</dd>
      <dt>Esc</dt><dd>this screen</dd>
    </dl>

    <h3>In the air</h3>
    <p>Every ramp pays out on the landing: for the hang time, for how far round you
       got, and for anything you brought all the way over. Keep holding Space off a
       jump and the chair flips as many times as there is room for — it will not start
       one it cannot finish. Come down on the backrest anyway and you get nothing and
       lose half your speed.</p>
    <dl>
      <dt>Space</dt><dd>in the air it is not drift, it is a flip. Hold it to keep
        flipping</dd>
      <dt>Space + S</dt><dd>backwards instead</dd>
      <dt>A D</dt><dd>spin, once the castors are off the floor</dd>
    </dl>

    <h3>Piñatas</h3>
    <p>Drive through one and you get something. What you get depends on where you are
       lying — last place draws the things that close a gap, the leader draws the things
       that defend one. Everybody throws, including them.</p>
    <dl>
      <dt>E</dt><dd>throw it forwards</dd>
      <dt>Q</dt><dd>throw it behind you</dd>
      <dt>Hold E</dt><dd>drag it behind you as a shield until you want it</dd>
    </dl>
    <div class="dismiss">Any key to go back</div>`;
  briefing.append(sheet);
  briefing.addEventListener('click', () => read(false));

  root.append(art, rail, briefing);
  document.body.append(root);

  let open = false;
  /** Whether the briefing sheet is over the top of the menu. */
  let reading = false;
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
        // The lean is restated in both frames because a keyframe replaces the transform
        // it lands on rather than adding to it, and the name carries one from the sheet.
        // It is the same eleven degrees `--lean` sets; if that moves, this moves.
        { transform: `skewX(-11deg) translateX(${direction * 7}px)`, opacity: 0.15 },
        { transform: 'skewX(-11deg) translateX(0)', opacity: 1 },
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
        const value = row.pick.label();
        if (name.textContent !== value) name.textContent = value;

        const at = row.pick.index();
        node.querySelectorAll('.tile').forEach((tile, n) => tile.classList.toggle('at', n === at));
      }
    }
  }

  /**
   * Take one of them, and make the screen say so three times over.
   *
   * The name fades in from the side it arrived from, the chair in the room swivels
   * that way, and the tile itself pops — three signals for one act, which sounds
   * excessive and is the difference between a picker that responds and one that
   * merely updates. Two of them are on the thing you were looking at (the tile you
   * clicked, the name under it) and one is on the thing you are choosing *for* (the
   * driver in the chair), which is the one that makes it a character select.
   *
   * `to` is absolute and wraps, so the same call serves a click on the seventh tile
   * and a right-arrow off the end of the row.
   */
  function take(i: number, to: number, direction: 1 | -1): void {
    const row = rows[i];
    if (row?.kind !== 'pick') return;
    const count = row.pick.count();
    const next = ((to % count) + count) % count;
    if (next === row.pick.index()) return;

    row.pick.choose(next, direction);
    paint();

    const node = nodes[i]!;
    const name = node.querySelector('.name');
    if (name) bump(name, direction);

    // The tile takes the same overshoot the pips used to, at the size a 46 px square
    // can carry: enough to catch the eye moving along the row, not enough to shove
    // its neighbours.
    const tile = node.querySelectorAll('.tile')[next];
    tile?.animate(
      [
        { transform: `skewX(-11deg) translateY(-3px) scale(1.24) rotate(${direction * -2}deg)` },
        { transform: 'skewX(-11deg) translateY(-3px) scale(1.06)' },
      ],
      { duration: 260, easing: 'cubic-bezier(0.34, 1.5, 0.64, 1)' },
    );
  }

  /** Walk a picker by one, wrapping. What the arrow keys and the wheel do. */
  function step(i: number, direction: 1 | -1): void {
    const row = rows[i];
    if (row?.kind !== 'pick') return;
    take(i, row.pick.index() + direction, direction);
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

        /*
         * The whole roster, laid out at once.
         *
         * This was a nameplate with an arrow either side of it, and the arrows were the
         * thing everybody disliked about the screen. Fairly: two 40 px boxes marked ◀
         * and ▶, floating in the middle of the rail, are a *stepper* — the control you
         * put on a number field — and a stepper says the list is long, ordered, and not
         * worth showing. This list is seven people with different heads, which is the
         * most interesting thing on the screen, and the stepper hid six of them behind
         * a button press each.
         *
         * So all of them are on screen, in a row, with the one you have got lit up:
         * which is how every character select since Street Fighter II has done it, and
         * it is not a coincidence. You can *see* the roster, count it, pick the dog
         * directly, and — the part a stepper can never do — notice that there is a dog.
         */
        const grid = el('div', 'grid');
        row.pick.art.forEach((art, n) => {
          const tile = el('button', 'tile') as HTMLButtonElement;
          tile.type = 'button';
          const image = el('img');
          (image as HTMLImageElement).src = art;
          (image as HTMLImageElement).alt = '';
          (image as HTMLImageElement).draggable = false;
          tile.append(image);
          tile.addEventListener('click', () => {
            index = i;
            take(i, n, n >= row.pick.index() ? 1 : -1);
          });
          grid.append(tile);
        });

        const name = el('b', 'name');
        pick.append(el('span', 'cap', row.label), grid, name);
        select(pick);

        /*
         * And the wheel steps it.
         *
         * A row of things you choose between is a carousel, and every carousel on every
         * other screen this player has used today responds to a scroll. Accumulated
         * rather than acted on per event, because a trackpad emits dozens of two-pixel
         * deltas per flick and one flick should mean one driver, not five.
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
      { kind: 'pick', label: 'Driver', pick: g.rider },
      { kind: 'pick', label: 'Chair', pick: g.ride },
      // On the line and on the result there is nothing to go back to, so starting and
      // restarting are the same button and only one is offered. Mid-race they are
      // genuinely different — and stacked rather than sat side by side, the primary one
      // goes on top, where the eye already is coming down the rail. The destructive one
      // is below it and unfilled, which is a clearer separation than left-and-right ever
      // was.
      ...(racing
        ? ([
            { kind: 'button', label: 'Resume', primary: true, enter: () => (hide(), hooks.resume()) },
            { kind: 'button', label: 'Briefing', enter: () => read(true) },
            { kind: 'button', label: 'Restart', enter: () => (hide(), hooks.restart()) },
          ] as Row[])
        : ([
            { kind: 'button', label: 'Start Race', primary: true, enter: () => (hide(), hooks.start()) },
            { kind: 'button', label: 'Briefing', enter: () => read(true) },
          ] as Row[])),
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
    reading = false;
    briefing.classList.remove('on');
    root.classList.remove('on');
  }

  /**
   * Open or close the briefing.
   *
   * Closed by *any* key rather than by a named one, and that is deliberate: it is
   * a page of prose one key press away from a race, and the worst thing a text
   * panel can do is make somebody hunt for the way out of it. There is nothing to
   * choose in here, so every key means the same thing.
   */
  function read(on: boolean): void {
    reading = on;
    briefing.classList.toggle('on', on);
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

      if (reading) {
        e.preventDefault();
        read(false);
        return;
      }

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
