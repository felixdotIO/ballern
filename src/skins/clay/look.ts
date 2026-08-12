/**
 * The interface's design system.
 *
 * Five passes got here and each one failed the same way, so it is worth writing the
 * sequence down: Helvetica on dark plates (the shipped game's idiom, cold over clay),
 * a soft serif on frosted glass (a dashboard), rounded cartoon type on brown pills
 * (any casual game's UI, therefore no game's), and a boarding pass in Archivo
 * Expanded and Space Mono — a nice concept executed in two faces that fight the
 * scene: a blocky wide gothic and a quirky slab mono, both of them shouting where
 * the room they sit over is warm, soft and quiet.
 *
 * This pass is built on a benchmark rather than on a mood. The closest thing to this
 * game that exists — a stylised, low-poly, warmly-lit driving game — is **art of
 * rally**, and what reviewers single out about it is that the interface is clean and
 * undecorated and gets out of the way of the driving. That is the standard, and it
 * gives four rules:
 *
 *  1. **Panels are the exception, not the surface.** The HUD floats: paper-coloured
 *     type with a soft ink shadow, straight over the room. Six cards stacked in the
 *     corners of a rendered scene look like six cards; the same information set as
 *     type looks like part of the game. Only the two things that are genuinely
 *     *tables* — the plan and the result — get a ground to sit on.
 *  2. **One family, used properly.** Bricolage Grotesque, variable in weight, width
 *     and optical size: at 800 and opsz 96 it is a dramatic display face, at 600 and
 *     opsz 14 it is a quiet interface face, and it carries **real tabular figures**.
 *     That last detail deleted two hacks — a hand-built fixed-pitch digit slot and a
 *     second typeface kept only because it was monospaced.
 *  3. **One accent does the pointing.** Amber, off the sun through the west glazing,
 *     marks selection and the best lap and nothing else. Pink — the checkpoint
 *     donuts, the one saturated thing in the building — is reserved for energy: the
 *     drift charge and the boost. Two accents, two meanings, no decoration.
 *  4. **Space instead of edges.** Where the last pass reached for a 3 px keyline and
 *     a hard drop shadow, this one reaches for 24 px of air and a size jump. Rules
 *     are 1 px and rare.
 *
 * The palette is the room's: paper is the light on the carpet, ink is the ceiling in
 * shadow. Nothing here is neutral grey, because a grey over a golden-hour scene
 * reads blue.
 */

/** The only family. Weight, width and optical size are all live axes. */
export const FAMILY = `'Bricolage Grotesque', 'Helvetica Neue', Helvetica, Arial, sans-serif`;

const CSS = `
@font-face {
  font-family: 'Bricolage Grotesque';
  font-style: normal;
  font-weight: 200 800;
  font-stretch: 75% 100%;
  font-display: block;
  src: url('/fonts/bricolage-latin.woff2') format('woff2');
}

:root {
  --paper: #f6efe2;
  --ink: #241c15;
  /* Paper at strengths, for type over the room. Not greys: a grey caption over a
     warm scene reads blue. */
  --paper-2: rgba(246, 239, 226, 0.68);
  --paper-3: rgba(246, 239, 226, 0.34);
  --ink-2: rgba(36, 28, 21, 0.62);
  --ink-3: rgba(36, 28, 21, 0.22);

  /* The sun through the west glazing: selection, and the best lap. */
  --amber: #f2a02b;
  /* The checkpoint donuts: energy, and nothing else. */
  --pink: #ee3e7b;
  /* Signal green, for the one thing that is genuinely a fire plan. */
  --green: #2f8f5b;

  --r: 14px;
  /*
   * The shadow that makes floating type legible over a lit room.
   *
   * Three offsets rather than one: a tight contact shadow so the glyph has an edge
   * on a bright carpet, a mid one for the shape, and a wide soft one that darkens
   * the room behind a whole block of text. This is what replaced six panels.
   */
  --cast: 0 1px 1px rgba(20, 14, 8, 0.5), 0 2px 6px rgba(20, 14, 8, 0.42),
    0 8px 26px rgba(20, 14, 8, 0.34);
  --pop: cubic-bezier(0.32, 1.5, 0.62, 1);
}

/* -- the registers --------------------------------------------------------- */

/*
 * Four settings of one family, and the optical size axis is doing real work in each:
 * a face cut for 96 px has tighter spacing and finer joins than the same face cut
 * for 14 px, and using the wrong one is most of what makes type look "off" at size.
 */
.wm {
  font-family: ${FAMILY};
  font-weight: 800;
  font-stretch: 100%;
  font-variation-settings: 'opsz' 96;
  text-transform: uppercase;
  letter-spacing: -0.022em;
  line-height: 0.92;
}
.hd {
  font-family: ${FAMILY};
  font-weight: 700;
  font-variation-settings: 'opsz' 48;
  letter-spacing: -0.015em;
}
.ui {
  font-family: ${FAMILY};
  font-weight: 600;
  font-variation-settings: 'opsz' 14;
  letter-spacing: 0;
}
/* Every figure on screen. Tabular, so a rolling clock never shifts a digit. */
.num {
  font-family: ${FAMILY};
  font-weight: 700;
  font-variation-settings: 'opsz' 40;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  letter-spacing: -0.01em;
}

/* -- the two grounds ------------------------------------------------------- */

/*
 * A panel, for the two things that are tables. Warm dark rather than paper: the
 * scene it lies over is bright and warm in the middle of the frame, and a light card
 * there competes with the room while a dark one lets the room glow past it.
 */
.panel {
  background: rgba(28, 21, 15, 0.84);
  /* Blurred, and only here. At 84% opacity the room reads through the panel as mud —
     the chair's silhouette showing faintly behind a column of lap times. Ten pixels of
     blur turns that mud back into a defocused room, which is the whole reason the panel
     is translucent rather than solid in the first place. */
  backdrop-filter: blur(11px) saturate(106%);
  -webkit-backdrop-filter: blur(11px) saturate(106%);
  border-radius: var(--r);
  box-shadow: 0 18px 44px -18px rgba(16, 10, 5, 0.9);
  color: var(--paper);
}

/* And type that floats, with the room showing through behind it. */
.float {
  color: var(--paper);
  text-shadow: var(--cast);
}
`;

let installed = false;

/** Idempotent, because the HUD and the menu both want it and neither owns it. */
export function installLook(): void {
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  style.dataset.clayLook = '';
  style.textContent = CSS;
  // First in the head, so a component's own sheet can override a token without
  // having to out-specify it.
  document.head.prepend(style);
}

/** Small DOM helper, the same one the shipped HUD used. */
export const el = (tag: string, cls?: string, html?: string): HTMLElement => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html !== undefined) node.innerHTML = html;
  return node;
};

export type Odometer = {
  element: HTMLElement;
  set(text: string): void;
};

/**
 * A number that changes every frame, written through one character at a time.
 *
 * The fixed-pitch slots this used to build are gone — Bricolage carries tabular
 * figures, so a rolling clock holds its own column — but the per-character write is
 * still worth having: a lap clock ticking over costs two `textContent` assignments a
 * frame (the centiseconds) rather than one that invalidates the whole run. Same
 * bargain the rest of the HUD makes.
 */
export function createOdometer(className?: string): Odometer {
  const element = el('span', className);
  let cells: HTMLElement[] = [];
  let shown = '';

  return {
    element,
    set(text) {
      if (text === shown) return;

      if (text.length !== shown.length) {
        cells = [...text].map((ch) => {
          const cell = el('span');
          cell.textContent = ch;
          return cell;
        });
        element.replaceChildren(...cells);
        shown = text;
        return;
      }

      for (let i = 0; i < text.length; i++) {
        if (text[i] === shown[i]) continue;
        cells[i]!.textContent = text[i]!;
      }
      shown = text;
    },
  };
}
