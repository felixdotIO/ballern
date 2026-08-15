/**
 * The minimap, which is a Flucht- und Rettungsplan.
 *
 * Every German office building posts one of these by the lifts on every floor:
 * the floorplate in plan, north up, the rooms outlined and named, the escape
 * route drawn over it in signal green, and a red dot saying *Sie sind hier*.
 * This game is a race around the escape route of a German office building. The
 * map it needs and the map the building already has are the same map, so this
 * is that one, at 1:400 instead of 1:100.
 *
 * Two consequences, both of them the reason to do it this way:
 *
 *  - It is north up and it never rotates. A rotating minimap is better for
 *    finding the next corner and worse for everything else, and the thing this
 *    is being asked to convey is not the next corner — the wayfinder arrow
 *    does that — it is *where in the building you are*, which is a question
 *    about the building and has to be answered in the building's own frame.
 *  - It costs nothing. Each plan is one SVG built once at startup; the only
 *    thing that moves per frame is a transform on the marker, which the browser
 *    composites without touching layout. No canvas, no redraw, no draw calls.
 *
 * And one sheet per level, because that is not a stylistic choice either — it
 * is what the thing is. A plan is a horizontal cut through a building and
 * physically cannot show what is under it, which is why the real ones are
 * printed one to a floor with the level named in the corner. Drawing both
 * levels of the Parkhaus on one sheet put the deck's aisle and Ebene 5's out
 * lane three hundred millimetres apart, running opposite ways, with no way of
 * telling which was which. Now the sheet changes when you do, exactly as it
 * would if you walked down the stairs and looked at the one screwed to the wall
 * at the bottom.
 */

import { CORE, GATES, LEVELS, PARKHAUS, ROOMS, ROUTE, EXTENTS, RAMPS, type Room } from '../office/plan';

/**
 * Plan height in CSS pixels, shared by every sheet.
 *
 * Height rather than width, and that is the one sizing decision worth stating.
 * Each sheet is drawn to its own extents — the office floor is 66 m across, the
 * Parkhaus is 21 — so a shared *width* would draw the car park at a third of
 * the scale it deserves and waste two thirds of the plate on nothing. Sharing
 * the height instead lets each level fill its sheet, and keeps the plate the
 * same height in the corner of the screen, so nothing in the HUD jumps when you
 * drive down a ramp.
 */
const HEIGHT = 137;
/** Breathing room inside the plate, in world metres. */
const PAD = 1.5;

export type Minimap = {
  element: HTMLElement;
  /**
   * Where the chair is, which way it is pointing, and what it is heading for.
   *
   * `y` picks the sheet, and `gateLevel` is the floor the next gate stands on —
   * which is not always the floor you are on. The ping has to stay on its own
   * sheet or the map would show you a target on the level you are looking at
   * that is really three metres above it.
   */
  update(x: number, y: number, z: number, yaw: number, gate: readonly [number, number], gateLevel: number): void;
};

/** What a sheet is a plan of, in world metres. */
type Extents = { x0: number; z0: number; x1: number; z1: number };

/** World metres to plan units. The viewBox is in world metres, so: nothing. */
const px = (v: number) => v.toFixed(2);

/** Halfway between the two levels: which sheet a height belongs to. */
const CUT = LEVELS.garage / 2;

type Sheet = {
  label: string;
  /** Which floor this sheet is a cut through. */
  level: number;
  element: HTMLElement;
  here: SVGPathElement;
  target: SVGCircleElement;
};

/**
 * One sheet: the rooms on that level, the core, the route across it, and the
 * ramps in and out.
 *
 * The route is drawn per level rather than whole, so each sheet carries only
 * the part of the lap that happens on it. The ramps are what is left over —
 * they belong to neither level and connect both — so they are drawn on both, as
 * the open slots they are, which is also how a real plan shows a ramp.
 */
function buildSheet(
  label: string,
  level: number,
  rooms: readonly Room[],
  withCore: boolean,
  extents: Extents,
): Sheet {
  const spanX = extents.x1 - extents.x0 + PAD * 2;
  const spanZ = extents.z1 - extents.z0 + PAD * 2;
  const width = Math.round((HEIGHT * spanX) / spanZ);

  const plan = rooms
    .map(
      (r) =>
        `<rect class="${r.kind === 'deck' || r.kind === 'garage' ? 'deck' : 'room'}" x="${px(r.x0)}" y="${px(r.z0)}" ` +
        `width="${px(r.x1 - r.x0)}" height="${px(r.z1 - r.z0)}" />`,
    )
    .join('');

  // The core is drawn solid because it is solid: it is the one thing on the
  // floor you cannot drive into, and a plan that does not say so is lying.
  const core = withCore
    ? `<rect class="core" x="${px(CORE.x0)}" y="${px(CORE.z0)}" ` +
      `width="${px(CORE.x1 - CORE.x0)}" height="${px(CORE.z1 - CORE.z0)}" />`
    : '';

  // Both ramps, on both sheets, hatched — a plan shows the hole in the slab it
  // is a cut through, whichever end of it you are standing on.
  const ramps = RAMPS.map(
    (r) =>
      `<rect class="ramp" x="${px(r.x0)}" y="${px(r.zHigh)}" ` +
      `width="${px(r.x1 - r.x0)}" height="${px(r.landingLow - r.zHigh)}" />`,
  ).join('');

  // The lap, but only the runs that happen on this level. Broken into polylines
  // wherever it leaves — which is what puts a visible gap at each ramp, and the
  // gap is the most useful thing on the sheet.
  const runs: string[][] = [];
  let run: string[] = [];
  for (const [x, z, y] of ROUTE) {
    const on = level < CUT ? y < CUT : y >= CUT;
    if (on) run.push(`${px(x)},${px(z)}`);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);
  const route = runs
    .filter((r) => r.length > 1)
    .map((r) => `<polyline class="route" points="${r.join(' ')}" />`)
    .join('');

  // The line and finish, as the chequer it is on the floor — office level only.
  const start = GATES[0]!;
  const finish =
    (start.y ?? 0) >= CUT && level >= CUT
      ? `<line class="finish" x1="${px(start.at[0] + start.normal[1] * start.halfWidth)}" ` +
        `y1="${px(start.at[1] - start.normal[0] * start.halfWidth)}" ` +
        `x2="${px(start.at[0] - start.normal[1] * start.halfWidth)}" ` +
        `y2="${px(start.at[1] + start.normal[0] * start.halfWidth)}" />`
      : '';

  const element = document.createElement('div');
  element.className = 'sheet';
  element.innerHTML =
    `<svg viewBox="${px(extents.x0 - PAD)} ${px(extents.z0 - PAD)} ${px(spanX)} ` +
    `${px(spanZ)}" width="${width}" height="${HEIGHT}">` +
    `<g>${plan}${ramps}${core}${route}${finish}` +
    // Drawn last so nothing is over them.
    `<circle class="target" r="0.9" cx="0" cy="0" />` +
    // A metre and a half long, which is about a chair — the marker is to scale,
    // which is why it is legible without being a cartoon arrow.
    `<path class="here" d="M 0 -1.5 L 1.15 1.4 L 0 0.75 L -1.15 1.4 Z" />` +
    `</g></svg>`;

  return {
    label,
    level,
    element,
    here: element.querySelector('.here') as SVGPathElement,
    target: element.querySelector('.target') as SVGCircleElement,
  };
}

export function createMinimap(): Minimap {
  const upper = ROOMS.filter((r) => (r.base ?? 0) >= CUT);
  const lower = ROOMS.filter((r) => (r.base ?? 0) < CUT);

  // Named the way the building names them: the office floor is the sixth, and
  // the deck it opens onto is the top of the Parkhaus at the same level.
  const whole = { x0: EXTENTS.minX, z0: EXTENTS.minZ, x1: EXTENTS.maxX, z1: EXTENTS.maxZ };
  // Ebene 5 is only the Parkhaus: there is no building down there to draw, and
  // drawing the space where one would be if you went up three metres is exactly
  // the confusion a per-level sheet exists to remove.
  const parkhaus = { x0: PARKHAUS.x0, z0: PARKHAUS.z0, x1: PARKHAUS.x1, z1: PARKHAUS.z1 };
  const sheets = [
    /*
     * Named for what the room is, not for what floor it is on.
     *
     * These read "Level 6" and "Level 5", which is the number on the lift button
     * and tells a driver nothing: mid-lap, glancing at a 90 mm plan, the only
     * question is whether the sheet in front of them is the one they are on, and
     * "am I in the office or the car park" answers that instantly where a floor
     * number needs translating first. The building's own storey numbers still
     * live in `metrics.ts`, which is where a dimension belongs.
     */
    buildSheet('Office', LEVELS.floor, upper, true, whole),
    buildSheet('Car park', LEVELS.garage, lower, false, parkhaus),
  ];

  const element = document.createElement('div');
  element.className = 'plate map';
  const caption = document.createElement('span');
  caption.className = 'label';
  element.append(caption);
  for (const sheet of sheets) element.append(sheet.element);

  let showing = -1;

  return {
    element,
    update(x, y, z, yaw, gate, gateLevel) {
      // Which sheet, and only touch the DOM when it actually changes.
      const wanted = y < CUT ? 1 : 0;
      if (wanted !== showing) {
        showing = wanted;
        for (const [i, sheet] of sheets.entries()) sheet.element.classList.toggle('on', i === wanted);
        caption.textContent = `Escape Plan · ${sheets[wanted]!.label}`;
      }

      const sheet = sheets[wanted]!;
      // The plan's +Y runs the way the world's +Z runs, so a marker drawn
      // pointing up matches a chair facing -Z at zero rotation, and every yaw
      // after that is the negative of the world's. Getting this the wrong way
      // round gives a marker that is right at the four cardinals and mirrored
      // everywhere else, which is the kind of bug that survives a whole lap.
      // Wrapped, because the chair's heading is never normalised — it is a
      // running total, and after ten minutes of left-handers it is a five-digit
      // number. A rotation of 2066.7° draws the same as one of 266.7° and reads
      // like a bug in a debugger, which is the same reason to fix it.
      const spin = (((-yaw * 180) / Math.PI) % 360).toFixed(1);
      sheet.here.setAttribute('transform', `translate(${px(x)} ${px(z)}) rotate(${spin})`);

      // The ping only when the thing being pointed at is on the sheet you are
      // looking at. On the ramps that means it goes out for a couple of seconds,
      // which is correct: there is nothing on this floor to point at.
      const sameLevel = (gateLevel < CUT) === (y < CUT);
      sheet.target.setAttribute('cx', px(gate[0]));
      sheet.target.setAttribute('cy', px(gate[1]));
      // A class rather than the opacity attribute: the ping animates its own
      // opacity, and a CSS animation beats a presentation attribute every time —
      // which left the marker for a gate on the *other* level pulsing away in
      // the margin of a sheet it is not on.
      sheet.target.classList.toggle('off', !sameLevel);
    },
  };
}

/** The plan's own styles, folded into the HUD's sheet. */
export const MINIMAP_CSS = `
#hud .map { padding: 8px 9px 7px; gap: 6px; align-items: center; }
#hud .map svg { display: block; overflow: visible; }

/* One sheet at a time. Both are built once and neither is ever rebuilt; the
   swap is a class, so changing level costs nothing at all. */
#hud .map .sheet { display: none; }
#hud .map .sheet.on { display: block; }

/* Rooms are drawn the way a plan draws them: a hairline outline and nothing
   else. Filling them would make the plan the loudest thing on screen, and it is
   the least urgent. */
#hud .map .room,
#hud .map .deck {
  fill: rgba(240, 234, 217, 0.05);
  stroke: rgba(240, 234, 217, 0.34);
  stroke-width: 0.3;
}
#hud .map .deck { fill: rgba(240, 234, 217, 0.02); stroke-dasharray: 1.1 0.8; }
#hud .map .core { fill: rgba(240, 234, 217, 0.34); stroke: none; }

/* A ramp is a hole in the slab this sheet is a cut through, and a plan draws it
   as one — open, outlined, on the sheet at both ends of it. */
#hud .map .ramp {
  fill: rgba(240, 234, 217, 0.03);
  stroke: rgba(240, 234, 217, 0.5);
  stroke-width: 0.25;
  stroke-dasharray: 0.7 0.7;
}

/* Signal green, because that is the colour an escape route is drawn in and
   because it is already in the building — the running-man signs over these
   very doors are lit in it. */
#hud .map .route {
  fill: none;
  stroke: #6fae62;
  stroke-width: 0.85;
  stroke-linejoin: round;
  stroke-linecap: round;
  opacity: 0.85;
}
#hud .map .finish { stroke: var(--ink); stroke-width: 0.7; opacity: 0.8; }

#hud .map .target.off { display: none; }
#hud .map .target {
  fill: none;
  stroke: var(--signal);
  stroke-width: 0.55;
  animation: ping 1.4s ease-out infinite;
}
@keyframes ping { 0% { opacity: 1; r: 0.7; } 100% { opacity: 0; r: 2.6; } }

#hud .map .here {
  fill: var(--signal);
  stroke: rgba(18, 19, 14, 0.85);
  stroke-width: 0.3;
  paint-order: stroke;
}
`;
