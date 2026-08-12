/**
 * The floorplate. One level of a German speculative office building, fitted out
 * around 2004, with the top deck of the adjoining Parkhaus abutting it at the
 * same level — and, since the lap started using it, the enclosed deck below.
 *
 * This file is data. It says where every room, wall and opening is; it builds
 * nothing. Everything downstream — the shell, the dressing solvers, the
 * collision volumes, the lighting — reads from here, so there is exactly one
 * description of the building and no chance of the geometry and the colliders
 * disagreeing about where a wall is.
 *
 * Layout, and why it is this shape:
 *
 *      X→   0        21.25          36.25        52.5        66.25
 *   Z 0    ┌─────────────┬──────────────┬──────────────────────────┐
 *          │             │              │                          │
 *          │             │   KANTINE    │        GROSSRAUM         │
 *          │             │              │                          │
 *   13.75  │   PARKDECK  ├──────────────┼───────────────┬──────────┤
 *          │             │              │               │   CORE   │
 *          │             │ BESPRECHUNG  │   EDV/TECHNIK │  WC/Lift │
 *          │             │              │               │          │
 *   27.5   │             ├──────────────┴───┬───────────┴──────────┤
 *   31.25  ├─────────────┴──────────────────┤                      │
 *          │           PARKDECK             │        EMPFANG       │
 *   42.5   └────────────────────────────────┴──────────────────────┘
 *
 * Four quadrants and a core, not three thin bands. The floor used to be a north
 * strip, a middle strip chopped into five, and a corridor — which gave a plan
 * whose rooms were 3.75 m stubs and 12.5 m rungs, and a lap that could touch
 * every room only by clipping corners off most of them. This is the other way
 * round: the floorplate is cut into the smallest number of the largest rooms it
 * can carry, each one open corner to corner, and the lap crosses each of them on
 * its long diagonal.
 *
 * The core takes the south-east quadrant, against the hall, which is the only
 * place a core can go on this footprint: the lifts have to open onto the
 * reception and the risers have to drop somewhere that is not in the middle of a
 * letting. Everything else is a room. There is exactly one corridor left on the
 * floor and it is the one the building actually needs — the Rettungsweg along
 * the south, with the notch on the other side of its glass.
 *
 * The lap is one loop, ten spaces, every one of them entered at one corner and
 * left at the opposite one:
 *
 *   hall → notch → Parkdeck → Rampe ab → Ebene 5 → Rampe auf → Parkdeck →
 *   Kantine → Grossraum → EDV → Besprechung → Flur Süd → hall
 *
 * Nothing is a corner clip and nothing repeats — except the Grossraum, which is
 * thirty metres long and is driven out along the north glazing and back along
 * the south side of the desk run, because a room that size with one lane through
 * it is a corridor with windows. That is also the only hairpin on the lap that
 * is not a doorway, and it is the fastest part of the building.
 *
 * The Parkhaus in section, looking west, and the whole reason there are two
 * levels rather than one:
 *
 *   Z    0      8.75         11.25              32.5   35      42.5
 *   y 0  ══════╗                                            ╔═══════   Parkdeck
 *              ╚══╗ Rampe ab (12.2%)                     ╔══╝
 *   -2.9  ════════╩═════════════════════════════════════╩═════════    Ebene 5
 *              (and, on the other flank, Rampe auf, climbing the other way)
 *
 * The top deck is where the light is: it is six floors up, open to a sunset,
 * and everything on the lap up to that point has been lit through glass or by a
 * fluorescent tube. Ebene 5 is the opposite of it in every way that costs
 * nothing to build — 2.62 m to the soffit instead of the sky, sodium instead of
 * sun, columns at 7.5 m instead of nothing within eight metres — and that
 * contrast is the entire argument for the second level. The deck's long aisle
 * felt slower than it was because nothing was near enough to measure it
 * against; the level below is the same speed with the walls close.
 *
 * Both ramps run north–south, because 23.75 m of run at a gradient a car park
 * is allowed to have does not fit across a 21.25 m deck. That constraint is
 * what sets the shape of Ebene 5: the ramps take the two flanks, so the level
 * below is two full-width halls at the ends joined by an 11.25 m waist. Out up
 * one side of the waist, back down the other, with the column line between —
 * the same answer the Grossraum gives to the same question.
 *
 * Every coordinate in this file is a whole multiple of MODULE. That is not
 * tidiness: it is what lets partitions land on ceiling grid lines and facade
 * mullions, which is the single highest-leverage authenticity rule the project
 * has. `assertOnGrid()` at the bottom enforces it in development.
 */

import { DOOR, FACADE, GARAGE, MODULE, SECTION } from './metrics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RoomKind =
  | 'office'
  | 'kitchen'
  | 'server'
  | 'board'
  | 'hall'
  | 'corridor'
  /** Top deck of the Parkhaus, open to the sky. */
  | 'deck'
  /** Ebene 5: the enclosed parking level under it. */
  | 'garage';

/** What the floor is finished in. Drives the floor builder and the tyre noise. */
export type FloorKind =
  | 'carpet' // contract loop pile with a slate-blue circulation run
  | 'carpetRun' // the circulation tile wall to wall, as corridors are laid
  | 'carpetBoard' // heavier, darker tile, laid in a broadloom-effect ashlar
  | 'linoleum' // marmoleum sheet with a welded seam grid, plus a tiled servery
  | 'antistatic' // conductive vinyl on a 600 grid, earthed at every seam
  | 'stone' // polished granite in the hall, with a walk-off matting well
  | 'concrete'; // power-floated deck slab, painted

/** What is overhead. The deck's answer is "nothing", which is the point of it. */
export type CeilingKind =
  | 'tbar' // exposed grid, 625 mineral tile, luminaires replacing tiles
  | 'open' // no ceiling: painted soffit, cable ladder, ductwork
  | 'plaster' // MF-suspended plasterboard with a raised coffer and a cove
  | 'sky';

export type Room = {
  id: string;
  kind: RoomKind;
  /** Interior extents. Walls sit on these lines, centred on them. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /**
   * Finished floor level. Zero is the office floor and the top deck, which are
   * the same level and always were — that is what makes the deck drivable from
   * the hall without a single step.
   *
   * Omitted means zero, so every room authored before there was a second level
   * still reads correctly. It is not decoration: two rooms now occupy the same
   * rectangle in plan and are told apart by nothing else, so anything asking
   * "which room is this" has to ask in three dimensions. See `roomAt`.
   */
  base?: number;
  /** Clear finished ceiling height, above `base`. */
  ceiling: number;
  floor: FloorKind;
  ceilingKind: CeilingKind;
  /** What the Türschild says. German buildings number rooms floor.sequence. */
  label?: string;
};

/** Every finished floor level in the world, so nothing has to spell -2.9 out. */
export const LEVELS = {
  /** The office floor and the top deck. */
  floor: 0,
  /** Ebene 5, the enclosed parking level. */
  garage: GARAGE.base,
} as const;

export type OpeningKind =
  /** A structural opening with no door in it — a bulkhead over, nothing else. */
  | 'void'
  /** DIN 18101 860 leaf. */
  | 'single'
  /** 1010 leaf, as fitted where equipment has to get through. */
  | 'wide'
  /** Two 860 leaves. Board rooms, plant rooms, main entrances. */
  | 'double';

export type Opening = {
  kind: OpeningKind;
  /** Centre, along the wall's running axis. */
  at: number;
  /** Clear structural width. Ignored for doors, which derive it from the leaf. */
  width?: number;
  /** How far the leaf stands open, radians. A door found at exactly 0° or 90°
   *  is a door nobody has walked through. Omit to leave the opening empty. */
  swing?: number;
  /** Which end of the opening the leaf hangs on. */
  hinge?: 'low' | 'high';
  /** Height of the opening. Doors default to a leaf plus the frame reveal;
   *  voids default to full height with no bulkhead unless this is set. */
  height?: number;
};

/**
 * Something fixed to the face of a wall that does not go through it.
 *
 * Lift doors and locked riser doors are the reason this exists: they read as
 * openings, they matter enormously to whether a lobby looks like a lobby, and
 * they must never become a hole a chair can drive into.
 */
export type Applied = {
  kind: 'doorClosed' | 'lift' | 'riser';
  at: number;
  /** Which face it is applied to: -1 the low-coordinate side, +1 the high. */
  side: -1 | 1;
  /** Türschild text, when the builder draws one. */
  label?: string;
};

export type WallKind =
  /** Trockenbau, 100 mm, magnolia both faces. */
  | 'partition'
  /** Core: 250 mm blockwork, the only thing on the floor that is structural. */
  | 'core'
  /** Systemtrennwand: full-height glazing in a slim frame with a manifestation
   *  band. Meeting rooms have had these since long before 2004. */
  | 'glazed'
  /** Curtain wall: sill, glazing, mullions on the module, blinds, radiator. */
  | 'facade'
  /** Parkdeck edge: concrete upstand with a steel rail over. */
  | 'parapet';

export type Wall = {
  id: string;
  /** 'x' runs along X at a constant Z; 'z' runs along Z at a constant X. */
  axis: 'x' | 'z';
  /** The constant coordinate — the line the wall is centred on. */
  at: number;
  from: number;
  to: number;
  kind: WallKind;
  /** Overrides the default height for the wall kind. */
  height?: number;
  openings?: Opening[];
  applied?: Applied[];
  /** Facades only: head height of the glazing, for the taller hall. */
  head?: number;
  /**
   * Facades and parapets: which way is outdoors, -1 toward the low coordinate
   * and +1 toward the high. A curtain wall is not symmetric — the sill, the
   * radiator and the blinds are all on one face and the weather is on the
   * other — so the builder has to be told, not left to guess from the plan.
   */
  outward?: -1 | 1;
  /**
   * Glazing runs to the floor. Reception elevations do; office floors do not,
   * because a 900 sill is where the perimeter heating goes.
   */
  fullHeight?: boolean;
  /** Vertical blinds over this run. Offices get them, entrances never do. */
  blinds?: boolean;
};

// ---------------------------------------------------------------------------
// Setting out
// ---------------------------------------------------------------------------

/** X grid lines. Named, because a bare 36.25 in a wall list means nothing. */
const X = {
  deckWest: 0,
  building: 21.25, // the building's west face, where the deck stops
  westRooms: 36.25, // Kantine | Grossraum, and Besprechung | EDV below it
  hallWest: 40, // the hall's west face, under the notch
  coreWest: 52.5,
  east: 66.25, // the building's east face
} as const;
/** Z grid lines. */
const Z = {
  north: 0,
  band: 13.75, // the one line across the floorplate: north rooms meet south rooms
  midEnd: 27.5, // and the south rooms meet the corridor
  notch: 31.25, // the corridor's outer wall — the deck wraps below it
  south: 42.5,
} as const;

const H = SECTION.ceilingHeight;
/** The hall drops its grid for a plasterboard ceiling and gains half a metre.
 *  A reception with the same 2.70 lid as the offices behind it reads as a
 *  corridor that happens to have a sofa in it. */
const HALL_CEILING = 3.2;

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const ROOMS: readonly Room[] = [
  {
    id: 'office',
    kind: 'office',
    x0: X.westRooms,
    z0: Z.north,
    x1: X.east,
    z1: Z.band,
    ceiling: H,
    floor: 'carpet',
    ceilingKind: 'tbar',
    label: '6.01 Gro\u00dfraum',
  },
  {
    id: 'kitchen',
    kind: 'kitchen',
    x0: X.building,
    z0: Z.north,
    x1: X.westRooms,
    z1: Z.band,
    ceiling: H,
    floor: 'linoleum',
    ceilingKind: 'tbar',
    label: '6.02 Teek\u00fcche / Aufenthalt',
  },
  {
    // The whole south-west quarter, with the west glazing over the car deck.
    // A meeting room this size is what a floor of this size is actually let
    // with: one room big enough to put the whole department in.
    id: 'board',
    kind: 'board',
    x0: X.building,
    z0: Z.band,
    x1: X.westRooms,
    z1: Z.midEnd,
    ceiling: H,
    floor: 'carpetBoard',
    ceilingKind: 'tbar',
    label: '6.04 Besprechung',
  },
  {
    // The only quadrant with no facade at all, which is exactly what a machine
    // room wants and the reason it is the one that got it.
    id: 'server',
    kind: 'server',
    x0: X.westRooms,
    z0: Z.band,
    x1: X.coreWest,
    z1: Z.midEnd,
    ceiling: 3.0,
    floor: 'antistatic',
    ceilingKind: 'open',
    label: '6.03 EDV / Technik',
  },
  {
    id: 'corridor.south',
    kind: 'corridor',
    x0: X.building,
    z0: Z.midEnd,
    x1: X.hallWest,
    z1: Z.notch,
    ceiling: H,
    floor: 'carpetRun',
    ceilingKind: 'tbar',
  },
  {
    id: 'hall',
    kind: 'hall',
    x0: X.hallWest,
    z0: Z.midEnd,
    x1: X.east,
    z1: Z.south,
    ceiling: HALL_CEILING,
    floor: 'stone',
    ceilingKind: 'plaster',
    label: '6.00 Empfang',
  },
  {
    id: 'deck.main',
    kind: 'deck',
    x0: X.deckWest,
    z0: Z.north,
    x1: X.building,
    z1: Z.south,
    ceiling: 0,
    floor: 'concrete',
    ceilingKind: 'sky',
  },
  {
    id: 'deck.notch',
    kind: 'deck',
    x0: X.building,
    z0: Z.notch,
    x1: X.hallWest,
    z1: Z.south,
    ceiling: 0,
    floor: 'concrete',
    ceilingKind: 'sky',
  },
  {
    // Ebene 5, directly under deck.main — which is the whole reason `roomAt` had
    // to learn about height. The notch is not repeated below it: the notch is a
    // wing cantilevered off the east flank over the street, and there is nothing
    // under it but air.
    //
    // It stops short of the south hall's back wall, because the last five metres
    // of the level are not parking. See below.
    id: 'garage.main',
    kind: 'garage',
    x0: X.deckWest,
    z0: Z.north,
    x1: X.building,
    z1: 37.5,
    base: LEVELS.garage,
    ceiling: GARAGE.clearHeight,
    floor: 'concrete',
    ceilingKind: 'open',
    label: 'Ebene 5',
  },

  // -- the Parkhaus's own back-of-house, across the south end of Ebene 5 -----
  //
  // Every Parkhaus has this strip and it is always in the same place: the far
  // end of the lowest level anybody drives to, behind the stair core, where the
  // slab is cheapest and nobody wants a bay. Three rooms, blockwork, no
  // daylight, and between them they are the only spaces on the lap that belong
  // to the car park rather than to the office — which is exactly why they are
  // worth driving through. Everything up to this point has been a building
  // somebody works in; this is the bit underneath it that makes the building
  // work, and it looks nothing like the rest.
  {
    // Off the lap, and deliberately: it is a locked plant room, you see into it
    // through the louvred door as you come off the ramp, and a wall of red
    // pipework glimpsed once a lap is worth more than a wall of red pipework
    // driven through three times.
    id: 'garage.plant',
    kind: 'garage',
    x0: 5.0,
    z0: 37.5,
    x1: 10.0,
    z1: Z.south,
    base: LEVELS.garage,
    ceiling: GARAGE.clearHeight,
    floor: 'concrete',
    ceilingKind: 'open',
    label: '5.01 Sprinklerzentrale',
  },
  {
    // Mieterabteile: the cage store. The technical room on the level — a 1.6 m
    // lane between mesh with somebody's junk pressing against it, taken corner
    // to corner, and the only place on Ebene 5 where the walls are close enough
    // to touch.
    id: 'garage.store',
    kind: 'garage',
    x0: 10.0,
    z0: 37.5,
    x1: 16.25,
    z1: Z.south,
    base: LEVELS.garage,
    ceiling: GARAGE.clearHeight,
    floor: 'concrete',
    ceilingKind: 'open',
    label: '5.02 Mieterabteile',
  },
  {
    // Waschbox and the caretaker's bench in the same room, which is how a
    // Parkhaus of this age actually does it. The floor falls to a gully in the
    // middle of it and has never once been dry — the only wet surface in the
    // game, and the last thing you cross before the climb.
    id: 'garage.wash',
    kind: 'garage',
    x0: 16.25,
    z0: 37.5,
    x1: X.building,
    z1: Z.south,
    base: LEVELS.garage,
    ceiling: GARAGE.clearHeight,
    floor: 'concrete',
    ceilingKind: 'open',
    label: '5.03 Waschbox / Hausmeister',
  },
];
/**
 * The core. Lifts, stairs, both WCs and every riser on the floor, and the only
 * thing in the building that is genuinely load-bearing.
 *
 * It is not a room because it is never entered — it is the solid mass the lap
 * runs around, and giving the track something it cannot cut through is what
 * turns a big open floorplate into a circuit.
 */
export const CORE = {
  x0: X.coreWest,
  z0: Z.band,
  x1: X.east,
  z1: Z.midEnd,
} as const;

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

/** A door's clear structural opening, leaf plus a frame reveal on each jamb. */
export const openingWidth = (kind: OpeningKind, width = 2.5): number => {
  if (kind === 'void') return width;
  const leaf = kind === 'single' ? DOOR.leafWidth : kind === 'wide' ? DOOR.leafWidthWide : DOOR.leafWidth * 2;
  return leaf + DOOR.frameReveal * 2;
};

export const WALLS: readonly Wall[] = [
  // -- the one line across the floorplate ------------------------------------
  {
    /*
     * Kantine to Grossraum. One opening now, and it used to be two.
     *
     * A canteen at lunchtime has a way in and a way out with a queue standing
     * between them, which is why there were two — and the note that used to sit
     * here claimed the lower one was "the one on the lap". Measured against
     * `ROUTE`, the lap crosses this wall's line only at z=29.4 and z=36.7, which
     * are both down in the hall: it does not use *either* opening. The Grossraum
     * is entered and left across `Z.band` at the south, not through the canteen.
     *
     * Which made both of them free money. The lap runs east along the north side
     * of the Grossraum at z≈2.4 and comes back west at z≈12, so a chair that
     * ducks through the northern hole is inside the canteen alongside a leg of the
     * lap it has not driven, with the wall doing the work of hiding it.
     *
     * So the northern one is bricked up and the southern one stays. One opening is
     * still a canteen with a door; two was a canteen with a bypass through it.
     */
    id: 'part.kitchen|office',
    axis: 'z',
    at: X.westRooms,
    from: Z.north,
    to: Z.band,
    kind: 'partition',
    openings: [{ kind: 'void', at: 11.0, width: 3.75, height: 2.25 }],
  },
  {
    // Kantine to Besprechung: a pair of leaves, because the big meeting room is
    // where the catering goes when there is catering.
    id: 'part.kitchen|board',
    axis: 'x',
    at: Z.band,
    from: X.building,
    to: X.westRooms,
    kind: 'partition',
    openings: [{ kind: 'double', at: 24.0, swing: 1.5, hinge: 'low' }],
  },
  {
    // The machine room's equipment doors, off the open-plan. A pair rather than
    // the single 1010 leaf it should be, because a rack is 800 wide before you
    // have hands either side of it and nobody has ever got one through one leaf.
    // It also turns a 1.13 m hole into a 1.85 m one, which is the difference
    // between a doorway on the racing line and a wall with a rumour of a gap.
    id: 'part.office|server',
    axis: 'x',
    at: Z.band,
    from: X.westRooms,
    to: X.coreWest,
    kind: 'partition',
    openings: [{ kind: 'double', at: 46.0, swing: 1.53, hinge: 'high' }],
  },
  {
    // The core's head wall. Both WCs open off the open-plan, because after the
    // stub corridors came out there is no corridor on this side of the floor
    // for them to open off — which is how a Grossraum floor is actually planned.
    id: 'part.office|core',
    axis: 'x',
    at: Z.band,
    from: X.coreWest,
    to: X.east,
    kind: 'core',
    applied: [
      { kind: 'doorClosed', at: 55.0, side: -1, label: 'Damen' },
      { kind: 'doorClosed', at: 57.5, side: -1, label: 'Herren' },
      { kind: 'riser', at: 61.0, side: -1, label: 'ELT 6.2' },
    ],
  },

  // -- the south rooms, and what divides them --------------------------------
  {
    // Besprechung to EDV. The one door on the lap that is a decision rather than
    // a funnel: it is at the meeting room's north end, so the line through the
    // machine room has to come all the way back up the room to find it.
    id: 'part.board|server',
    axis: 'z',
    at: X.westRooms,
    from: Z.band,
    to: Z.midEnd,
    kind: 'partition',
    openings: [{ kind: 'double', at: 20.0, swing: -1.53, hinge: 'low' }],
  },
  {
    id: 'part.server|core',
    axis: 'z',
    at: X.coreWest,
    from: Z.band,
    to: Z.midEnd,
    kind: 'core',
    applied: [{ kind: 'riser', at: 25.0, side: -1, label: 'Steigezone' }],
  },
  {
    // The meeting room onto the corridor, at its west end.
    id: 'part.board|corridor.south',
    axis: 'x',
    at: Z.midEnd,
    from: X.building,
    to: X.westRooms,
    kind: 'partition',
    openings: [{ kind: 'double', at: 25.0, swing: 1.54, hinge: 'high' }],
  },
  {
    id: 'part.server|corridor.south',
    axis: 'x',
    at: Z.midEnd,
    from: X.westRooms,
    to: X.hallWest,
    kind: 'partition',
    applied: [{ kind: 'doorClosed', at: 38.0, side: 1, label: 'EDV 6.03' }],
  },
  {
    // The machine room's back, onto the reception. Blockwork with a locked door
    // in it and nothing else — which is what the whole north-west elevation of
    // every reception in this kind of building is.
    id: 'part.server|hall',
    axis: 'x',
    at: Z.midEnd,
    from: X.hallWest,
    to: X.coreWest,
    kind: 'core',
    applied: [{ kind: 'doorClosed', at: 45.0, side: 1, label: 'EDV 6.03' }],
  },
  {
    // The lift lobby. Three cars, and the whole reason the hall is where it is.
    id: 'part.core|hall',
    axis: 'x',
    at: Z.midEnd,
    from: X.coreWest,
    to: X.east,
    kind: 'core',
    applied: [
      { kind: 'lift', at: 55.5, side: 1 },
      { kind: 'lift', at: 59.0, side: 1 },
      { kind: 'lift', at: 62.5, side: 1 },
    ],
  },
  {
    id: 'part.corridor.south|hall',
    axis: 'z',
    at: X.hallWest,
    from: Z.midEnd,
    to: Z.notch,
    kind: 'partition',
    openings: [{ kind: 'void', at: 29.375, width: 3.75, height: 2.25 }],
  },

  // -- facades ---------------------------------------------------------------
  { id: 'facade.north', axis: 'x', at: Z.north, from: X.building, to: X.east, kind: 'facade', outward: -1, blinds: true },
  { id: 'facade.east', axis: 'z', at: X.east, from: Z.north, to: Z.midEnd, kind: 'facade', outward: 1, blinds: true },
  {
    // The hall's glazing runs higher than the offices', and to the floor. A
    // reception behind a 900 sill is an office with a sofa in it.
    id: 'facade.east.hall',
    axis: 'z',
    at: X.east,
    from: Z.midEnd,
    to: Z.south,
    kind: 'facade',
    height: HALL_CEILING,
    head: 3.0,
    outward: 1,
    fullHeight: true,
  },
  {
    id: 'facade.south.hall',
    axis: 'x',
    at: Z.south,
    from: X.hallWest,
    to: X.east,
    kind: 'facade',
    height: HALL_CEILING,
    head: 3.0,
    outward: 1,
    fullHeight: true,
  },
  {
    // The way in from the car. Double doors, standing open on their hold-opens
    // because it is a warm evening.
    id: 'facade.hall.west',
    axis: 'z',
    at: X.hallWest,
    from: Z.notch,
    to: Z.south,
    kind: 'facade',
    height: HALL_CEILING,
    head: 3.0,
    outward: -1,
    fullHeight: true,
    openings: [{ kind: 'double', at: 36.875, swing: 1.52, hinge: 'low' }],
  },
  {
    id: 'facade.corridor.south',
    axis: 'x',
    at: Z.notch,
    from: X.building,
    to: X.hallWest,
    kind: 'facade',
    outward: 1,
    // No door in this run. The corridor's two ends are its ways out — the hall
    // at one and the meeting room at the other — and both are inside the
    // thirty-five metres a Rettungsweg of this age is allowed. A third door
    // onto a car deck would be a door nobody has ever used.
  },
  {
    // The west flank, looking straight out at the parked cars. One opening in
    // the whole run: the canteen's fire exit, which is the way back into the
    // building off the long line. The meeting room below it has its doors onto
    // the canteen and the corridor and does not need a third.
    id: 'facade.west',
    axis: 'z',
    at: X.building,
    from: Z.north,
    to: Z.notch,
    kind: 'facade',
    outward: -1,
    blinds: true,
    openings: [{ kind: 'double', at: 5.0, swing: -1.52, hinge: 'high' }],
  },

  // -- deck edges ------------------------------------------------------------
  // The west run passes over the down ramp's slot, and stands on the ramp bay's
  // own wall where it does — see garage.ts. The deck's edge is continuous along
  // this face whether or not there is deck behind it, which is what makes the
  // Parkhaus read as one block from the street rather than as a deck with a
  // notch bitten out of its corner.
  { id: 'parapet.west', axis: 'z', at: X.deckWest, from: Z.north, to: 37.5, kind: 'parapet', outward: -1 },
  { id: 'parapet.north', axis: 'x', at: Z.north, from: X.deckWest, to: X.building, kind: 'parapet', outward: -1 },
  { id: 'parapet.south', axis: 'x', at: Z.south, from: 5.0, to: X.hallWest, kind: 'parapet', outward: 1 },
];

// ---------------------------------------------------------------------------
// The deck's own furniture, which is structural rather than dressing
// ---------------------------------------------------------------------------

/**
 * The columns in the entrance hall.
 *
 * A 26 m clear span is not a thing a 2004 spec office does — it is a thing a
 * model does, because a model has no roof to hold up. One line of columns on
 * the 7.5 m grid is what the building would actually have, and the room needs
 * them for the same reason the building does: a hall with nothing in the middle
 * of it has no depth, no scale, and nothing for the light to fall across.
 *
 * They also give the lap something to drive round, which is the third reason
 * every good reception has columns in it — and on this floorplate they do one
 * more job, which is to be the median. The hall is the only room the lap enters
 * twice, and the two lanes pass either side of this line: the pit straight to
 * the south of it and the clip into the board room to the north. Nine metres
 * and a row of columns apart is the difference between a dual carriageway and
 * two cars on the same bit of road going opposite ways.
 */
export const HALL_COLUMNS = {
  z: 33.75,
  xs: [45, 52.5, 60] as const,
  size: 0.55,
  /** Height of the dark stone plinth the shaft stands on. */
  plinth: 1.1,
} as const;

// ---------------------------------------------------------------------------
// The Parkhaus, in two levels
// ---------------------------------------------------------------------------

/** The Parkhaus footprint. Both its levels are this rectangle, exactly. */
export const PARKHAUS = { x0: X.deckWest, z0: Z.north, x1: X.building, z1: Z.south } as const;

/**
 * The two ramps.
 *
 * Both run north–south, and that is not a preference: 21.25 m of run at a
 * gradient a car park is allowed to have does not fit across a 21.25 m deck, so
 * the only axis long enough is the long one. Everything else about the shape of
 * both levels follows from that — the ramps take the two flanks, the top deck
 * keeps a spine of aisle and bays between them, and Ebene 5 becomes two
 * full-width halls joined by an 11.25 m waist.
 *
 * They are open slots through the deck rather than enclosed head-houses, which
 * is the whole difference between this and what was here before. An enclosed
 * ramp is a dark hole you take on trust. An open one is a three-metre drop with
 * a balustrade round it that you drive past on the long straight, twice a lap,
 * and can see the level below through — which means the descent is a place you
 * have already been shown rather than a corner you have to learn by falling
 * down it.
 *
 * `travel` is the way you are going when you use it, as a sign of dz: the west
 * ramp descends southbound and the east one climbs northbound. That pairing is
 * forced too. The lap enters the deck from the notch in the south and leaves it
 * through the canteen's fire exit in the north, so the aisle is driven
 * northbound; a ramp entered at the north end must therefore fall to the south,
 * and a ramp that has to deliver you back to the north must climb to it. Both
 * feet land in the south hall, which is why the level below is an out-and-back
 * rather than a circuit, and why the north hall's sweeping U is the corner the
 * whole of Ebene 5 is arranged around.
 */
export type Ramp = {
  id: string;
  /** Full width of the slot cut through the deck. */
  x0: number;
  x1: number;
  /** Z of the high end, where the deck is. */
  zHigh: number;
  /** Z of the low end, on Ebene 5. */
  zLow: number;
  /** The flat deck at the top, from here to `zHigh`. */
  landingHigh: number;
  /** The flat slab at the bottom, from `zLow` to here. */
  landingLow: number;
  /** Which way you are travelling when you use it, as a sign of dz. */
  travel: -1 | 1;
};

export const RAMPS: readonly Ramp[] = [
  {
    // Ausfahrt. The wider of the two, because it is entered off a hairpin at the
    // north end of the aisle with the whole length of that aisle behind you, and
    // because the one you arrive at fast is the one to give room to.
    id: 'ramp.down',
    x0: 0,
    x1: 5.0,
    zHigh: 8.75,
    zLow: 30.0,
    landingHigh: 5.0,
    landingLow: 33.75,
    travel: 1,
  },
  {
    // Einfahrt. 3.75 m, which is what a one-way ramp is, and narrow enough that
    // the sunset arrives through it as a slot rather than as a doorway. The
    // 1.25 m left between it and the building is the Gehweg beside the ramp,
    // which is a real thing and also the only place the deck's east balustrade
    // can stand.
    id: 'ramp.up',
    x0: 16.25,
    x1: 20.0,
    zHigh: 8.75,
    zLow: 30.0,
    landingHigh: 5.0,
    landingLow: 33.75,
    travel: -1,
  },
];

/**
 * The top deck, poured around the two ramp slots.
 *
 * The deck used to be one rectangle and cannot be any more: there are two
 * holes in it. Authoring the holes as a list of the plates that remain, rather
 * than as subtractions, is what keeps the slab builder, the weathering, the
 * paint and the collision all agreeing about where there is concrete — every
 * one of them clips to this list, so a hole cannot be open in the geometry and
 * closed in the colliders, which is the exact failure that would let a chair
 * drive across thin air.
 */
export const DECK_PLATES: readonly { x0: number; z0: number; x1: number; z1: number }[] = [
  // The north head, full width: both top landings, the turning space at the top
  // of the aisle, and the run to the canteen's fire exit.
  { x0: 0, z0: 0, x1: 21.25, z1: 8.75 },
  // The spine: the aisle and the one bay row left, between the two slots.
  { x0: 5.0, z0: 8.75, x1: 16.25, z1: 42.5 },
  // The Gehweg against the building, east of the up ramp.
  { x0: 20.0, z0: 8.75, x1: 21.25, z1: 42.5 },
  // The south hall, either side of the spine, where the lap arrives from the
  // notch and where the stair house is.
  { x0: 0, z0: 33.75, x1: 5.0, z1: 42.5 },
  { x0: 16.25, z0: 33.75, x1: 20.0, z1: 42.5 },
];

/**
 * Stair and lift head-house serving the Parkhaus.
 *
 * Moved out of the north-west corner, which is now the hairpin at the top of
 * the down ramp, into the south-west — next to the way into the building, which
 * is where anybody who has parked is walking anyway. It runs the full height of
 * the Parkhaus, so on Ebene 5 it is the solid mass the south hall turns around.
 */
export const DECK_STAIR = { x0: 0, z0: 37.5, x1: 5.0, z1: 42.5, height: 3.1 } as const;

/**
 * The columns down the middle of Ebene 5.
 *
 * One line, on the 7.5 m grid, splitting the waist into an out lane and a back
 * lane. They do the same three jobs the hall's columns do — hold the deck up,
 * give the room depth, and be the median between two lanes going opposite ways
 * — and one more that only a car park gives them, which is that they are the
 * only thing down here close enough and regular enough to measure speed by.
 */
export const GARAGE_COLUMNS = { x: 10.625, zs: [11.25, 18.75, 26.25] as const } as const;

/**
 * Parking bay setting-out. 2.5 × 5.0 bays off a 6.25 m aisle — the German
 * Parkhaus standard.
 *
 * The west row is gone: that strip is the down ramp now. What is left is the
 * arrangement a two-level Parkhaus actually has on its top deck — ramps at the
 * flanks, one aisle, and the bays in the middle where the structure is simple.
 */
export type BayRow = {
  id: string;
  x0: number;
  x1: number;
  /** Which way the bonnets point, and therefore which side the aisle is on. */
  facing: 'west' | 'east';
  z0: number;
  count: number;
};

export const BAYS: {
  width: number;
  depth: number;
  line: number;
  rows: readonly BayRow[];
  notch: { z0: number; z1: number; x0: number; count: number };
} = {
  width: 2.5,
  depth: 5.0,
  /** Painted line width. */
  line: 0.12,
  rows: [
    // Nose to the east balustrade, over the up ramp, accessed off the aisle.
    { id: 'centre', x0: 11.25, x1: 16.25, facing: 'east', z0: 8.75, count: 10 },
  ],
  /** Bays along the south edge of the notch, where the visitors park. */
  notch: { z0: 37.5, z1: 42.5, x0: 22.5, count: 7 },
};

// ---------------------------------------------------------------------------
// The track
// ---------------------------------------------------------------------------

/**
 * Where the chair starts: on the back row of the grid, pointed at the way out.
 *
 * It used to be the start line itself — `ROUTE[0]`, to the millimetre — with the
 * field lined up *past* it. `game/grid.ts` is where that is argued out and undone;
 * what it means here is that the spawn is now a grid slot like everybody else's,
 * 3.5 m behind the line on the line's own tangent.
 *
 * The numbers are that slot, evaluated: `ROUTE[0]` is (61.0, 38.0), the run to
 * `ROUTE[1]` is (−0.995037, 0.099504), and 3.5 m back along it is (64.483, 37.652)
 * facing 1.67046 rad. They are written out rather than computed because this
 * declaration is above `ROUTE` and half the building is built off it — but they
 * are exactly `slotAt(PLAYER_SLOT)` and `GRID_YAW`, and if the line ever moves,
 * those are what to re-evaluate.
 */
export const SPAWN = { position: [64.483, 0.6, 37.652] as const, yaw: 1.67046 };

/**
 * Where the character select is shot: down on Ebene 5, in the east lane.
 *
 * The front end used to stage the driver wherever the race was about to start — on
 * the grid, in the reception hall, against the east glazing. That is the honest
 * default and it is the wrong room, so for a while this was the car park: a lit
 * figure against a dark, enclosed, mechanical backdrop is what every character
 * select in every game has always been, and the building already had a windowless
 * concrete level nobody was looking at.
 *
 * It is the open plan now, and the reason is worth keeping because it beats the
 * argument it replaced. The garage shot is *generically* correct and this game is
 * not a generic one: what is funny about it — the entire premise — is that these
 * are office workers racing office chairs between the desks they sit at all day.
 * A driver photographed in a car park could be from any kart racer ever made. The
 * same driver photographed in front of a bank of beige CRTs, with task chairs
 * pushed in at every desk behind him, tells you what the game is before a word of
 * it is read. The joke is the room, and the character select was hiding it.
 *
 * The spot is measured rather than picked. Nowhere in the Großraum has the two and
 * a half metres of clearance the car park offered — it is full of desks, which is
 * the point of it — so the search was for somewhere on the *racing line*, which is
 * guaranteed clear because the lap runs down it.
 *
 * The requirement that decides it is the **frontal boom**. The driver looks down
 * the lens (see `SHOW_ANGLE` in `skins/clay/main.ts`), which means the camera
 * stands directly in front of him and needs its full 3.13 m there — and the first
 * spot chosen, on the north aisle, had the north wall 2.4 m off his nose. The shot
 * silently fell back to an off-angle and the driver went on looking past your
 * shoulder.
 *
 * The return aisle at x=52 carries it: 3.13 m clear in front with no fallback, and
 * thirty metres of open plan running away west behind him — the whole length of
 * the room as backdrop. Facing east, down the aisle.
 *
 * The lighting still needs no help. `render/lights.ts` flies the fitting pool to
 * wherever the camera is and the portrait rig is placed against the lens rather
 * than the compass, so the room being lit rather than dark changes nothing about
 * how the figure is lit — only what is behind it.
 */
export const SHOWROOM = { position: [52.0, LEVELS.floor, 12.0] as const, yaw: -Math.PI / 2 };

/**
 * The canonical lap, as a polyline through room centres and doorways.
 *
 * The dressing solvers keep it clear, which they do for the same reason the
 * building keeps it clear: it is the escape route. The race reads it too, for
 * the direction you are supposed to be facing at any point on the floorplate —
 * see GATES below for the part that is actually enforced.
 *
 * Three numbers per vertex, not two, and the third is load-bearing rather than
 * decorative: the deck's aisle and Ebene 5's back lane are three metres apart
 * vertically, a metre apart in plan, and driven in opposite directions. To
 * anything asking "which bit of the route am I on" — the wrong-way test, the
 * clearance gate, the map — those two are the same place unless it is told
 * about the height, and a lap driven perfectly up the aisle would read as a lap
 * driven backwards down the level below.
 */
export const ROUTE: readonly (readonly [number, number, number])[] = [
  // -- the pit straight: the hall, westbound past the columns ----------------
  [61.0, 38.0, 0], // on the grid
  // South of the desk and south of the belt line, because both are in the way
  // — which is the point of putting a reception desk where you actually meet it.
  [55.0, 38.6, 0],
  /*
   * 38.8 rather than 38.0, and it is the reception counter that moved it.
   *
   * The desk's collider used to be authored across the counter rather than along
   * it — a 3.7 m box lying east–west through a 3.6 m counter running north–south
   * — so most of the desk stopped nothing and the racing line appeared to have
   * plenty of room beside it. With the box corrected to the counter's real
   * footprint the line was suddenly passing the north edge with 0.39 m of
   * clearance against a 0.33 m chair: 60 mm, which is not a racing line, it is a
   * scrape. `dev/routeTest.ts` reported it the moment the collider was fixed.
   *
   * Eight hundred millimetres north puts it at 0.87 m and leaves the line still
   * south of the belt posts, which is the other thing this stretch has to thread.
   */
  [48.0, 38.8, 0],
  [43.5, 37.0, 0],
  [41.2, 36.9, 0],
  [40.0, 36.9, 0], // out through the entrance doors, between the standing leaves

  // -- the notch, and west across the deck's south hall ----------------------
  [33.0, 36.6, 0],
  [26.0, 35.8, 0],
  [20.0, 35.2, 0], // across the Gehweg, south of the up ramp's balustrade
  [14.0, 34.6, 0],
  [10.6, 33.2, 0],
  [9.3, 30.0, 0], // into the main aisle, alongside the one row of bays left

  // -- the aisle: the longest straight on the lap, and the only one in the sun
  [8.2, 26.0, 0],
  [8.1, 18.0, 0],
  [8.2, 11.0, 0],
  [8.4, 7.0, 0],

  // -- the hairpin across the north head, into the Ausfahrt ------------------
  // Wide open, nothing in it, and the only place on the lap where the whole
  // corner is visible from the entry — which is what makes it worth taking flat.
  [7.6, 4.0, 0],
  [5.0, 2.9, 0],
  [2.6, 4.2, 0],
  [2.5, 6.6, 0],

  // -- Rampe ab, thirteen per cent, southbound out of the light --------------
  [2.5, 8.75, 0],
  [2.5, 19.4, -1.45],
  [2.5, 30.0, -2.9],
  [2.6, 32.6, -2.9],

  // -- the turn at the foot, round in front of the plant room ----------------
  // The tightest corner on the lap and the only one you have to brake for,
  // taken at the bottom of the only place you have been going faster than the
  // chair is supposed to. The louvred door you swing past is the sprinkler
  // room, and it is the one room down here you never go into.
  [3.2, 35.2, -2.9],
  [5.4, 36.4, -2.9],
  [7.6, 35.4, -2.9],
  [7.8, 32.0, -2.9],

  // -- north up the out lane, three metres under the deck's aisle ------------
  [7.8, 26.0, -2.9],
  [7.8, 18.0, -2.9],
  [7.8, 12.0, -2.9],
  [8.0, 8.6, -2.9],

  // -- the north hall, the one sweep down here that is not a straight --------
  [9.2, 5.2, -2.9],
  [11.4, 4.0, -2.9],
  [13.4, 5.2, -2.9],
  [13.9, 8.6, -2.9],

  // -- and back south down the back lane, the column line on your right ------
  [13.9, 14.0, -2.9],
  [13.9, 22.0, -2.9],
  [13.9, 29.0, -2.9],
  [13.6, 34.0, -2.9],

  // -- through the cage store, corner to corner between the mesh -------------
  [13.0, 37.5, -2.9],
  [13.8, 39.6, -2.9],
  [15.2, 40.6, -2.9],
  [16.25, 40.8, -2.9],

  // -- and the Waschbox, out at its north-east corner and straight at the ramp
  [17.6, 40.4, -2.9],
  [18.8, 38.8, -2.9],
  [19.0, 37.5, -2.9],
  [18.6, 35.4, -2.9],
  [18.125, 32.4, -2.9],

  // -- Rampe auf, northbound, with the sunset arriving through the slot ------
  [18.125, 30.0, -2.9],
  [18.125, 19.4, -1.45],
  [18.125, 8.75, 0],
  [18.1, 6.4, 0],

  // -- back on the deck, and straight in through the canteen's fire exit -----
  [19.6, 5.2, 0],
  [21.25, 5.0, 0],

  // -- the Kantine, corner to corner -----------------------------------------
  [24.0, 5.6, 0],
  [27.5, 7.4, 0],
  [31.5, 9.4, 0],
  [34.6, 10.8, 0],
  [36.25, 11.0, 0], // out through the lower opening into the open-plan

  // -- the Grossraum, north round the desk run and east along the glazing ----
  [37.4, 9.0, 0], // up the free end of the pod run, west of the first spine
  [37.6, 5.2, 0],
  [38.2, 3.2, 0],
  [41.0, 2.4, 0],
  [46.0, 2.4, 0], // the north lane, hard against the blinds
  [54.0, 2.4, 0],
  [61.0, 2.6, 0],
  [64.6, 4.4, 0], // the hairpin at the far end, round the last pod

  // -- and back west down the south side of the desk run ---------------------
  [64.8, 8.0, 0],
  [63.4, 11.6, 0],
  [58.0, 12.0, 0],
  [52.0, 12.0, 0],
  [48.0, 12.2, 0],
  [46.0, 13.0, 0],
  [46.0, 13.75, 0], // in through the machine room's equipment doors

  // -- EDV, down the cold aisle and back up to the meeting room doors --------
  [45.4, 16.0, 0],
  [44.0, 20.0, 0],
  [42.0, 23.4, 0],
  [39.4, 22.4, 0],
  [37.6, 20.6, 0],
  [37.4, 20.0, 0], // square to the wall for the last metre
  [36.25, 20.0, 0], // in through the meeting room's doors

  // -- Besprechung, on its long diagonal -------------------------------------
  [33.8, 21.0, 0],
  [30.0, 23.6, 0],
  [27.0, 25.6, 0],
  [25.2, 26.4, 0],
  [25.0, 27.5, 0], // out into the corridor

  // -- Flur Süd, eastbound the whole way -------------------------------------
  [26.4, 29.2, 0],
  [31.0, 29.4, 0],
  [36.0, 29.4, 0],
  [40.0, 29.375, 0], // back into the hall

  // -- the hall's east end: round the lifts and onto the pit straight --------
  [43.5, 30.4, 0],
  [49.0, 31.2, 0],
  [55.0, 31.6, 0],
  [59.6, 31.9, 0],
  [62.4, 33.8, 0],
  [63.0, 36.4, 0],
  [63.0, 38.2, 0], // the hairpin inside the east glazing, onto the line
];
/** How many laps a race is. Three: enough to learn the lap, short enough to
 *  want another go the moment it ends. */
export const LAPS = 3;

/**
 * A plane you have to drive through, and the order they come in.
 *
 * `normal` is the way you are meant to be going when you cross; a lap only
 * counts if every gate was taken in sequence, front to back. That is the whole
 * anti-shortcut rule, and it is deliberately the only one — no invisible walls,
 * no penalties, no lap invalidation. If you find a better line through the
 * canteen than the one the escape route suggests, it is yours.
 *
 * The gates themselves are put where the building already funnels you: three
 * corridors, one doorway, three rooms you can only cross one way, and the two
 * lanes of the car park either side of the parked cars. That is what makes them
 * generous enough to be invisible in play — you cannot take the route at all
 * without going through the openings, so the gate never has to be the thing
 * that stops you. `halfWidth` spans the opening rather than the line you'd take
 * through it.
 *
 * Two of the twelve are doing a different job. The open-plan and the canteen
 * are each crossed twice on two separate lanes, and a gate wide enough to be
 * generous on one lane is a gate the other lane satisfies by accident — which
 * would let you take the room once and skip the second crossing entirely. So
 * `Großraum Nord` and `Teeküche` are pulled in tight around their own lanes
 * and set far enough along them that the other lane never reaches the plane.
 *
 * Index 0 is the start and the finish, in the hall, on the grid.
 */
export type Gate = {
  label: string;
  at: readonly [number, number];
  /** Unit vector, the direction of travel through the plane. */
  normal: readonly [number, number];
  /** Half the gate's span, measured across `normal`. */
  halfWidth: number;
  /**
   * Finished floor level the gate stands on. Omitted means the office floor.
   *
   * A gate is a plane in plan and a band in section, and it has to be both from
   * the moment there are two levels: the deck's aisle gate and Ebene 5's are a
   * metre apart on the map and three metres apart in the building, so without
   * the band one lap of the top deck satisfies both and the whole descent is
   * optional. race.ts is where the band is applied; see GATE_BAND.
   */
  y?: number;
};

/*
 * ---- how wide a gate is, and why every one of these was wrong -------------
 *
 * A gate is a plane you cross, and `halfWidth` says how far off its centre the
 * crossing may be. Those numbers were authored by eye, as the width of the thing
 * the gate is *about* — a doorway, an aisle, a lane — and eight of the fourteen
 * turned out to be narrower than the floor a chair can actually drive across at
 * that point. Measured against the solver, the contiguous drivable run through
 * `Server Room` is 10.2 m wide and the gate registered 3.6 m of it; `Kitchen` was
 * 4.0 m of a 9.7 m opening; the `Finish` 8.4 m of 9.5 m.
 *
 * Which means you could drive straight through the place a checkpoint is, on a
 * perfectly reasonable line, and it would not count — and nothing would say so.
 * Measured, six tenths of a metre off the racing line was enough to miss
 * `Server Room` and never complete a lap.
 *
 * It went unnoticed for as long as there were donuts. A donut hung at the gate's
 * centre, one at a time, lit by a travelling light, and players drove *at* it — so
 * everybody threaded the middle of every gate without knowing that was what they
 * were doing. Take the marker away and the same lap silently stops counting. The
 * feature that was removed was not the checkpoint, it was the aiming aid that hid
 * how small the checkpoints were.
 *
 * So each width below is now the drivable opening at that point, measured rather
 * than judged, with 150 mm of margin. Two rules on top: nothing was ever made
 * *narrower* — several openings are tighter than their gate, and a gate that is
 * generous where the building is not costs nothing — and no centre moved, so the
 * wayfinder chevron and the plan still point exactly where they did.
 */
export const GATES: readonly Gate[] = [
  // Across the hall by the east glazing, which is what the belt posts and the
  // tape on the stone are marking.
  { label: 'Finish', at: [61.0, 38.0], normal: [-1, 0], halfWidth: 8.35 },
  // The entrance doors. You are leaving the building through the front.
  { label: 'Entrance', at: [40.0, 36.875], normal: [-1, 0], halfWidth: 3.2 },
  // Halfway up the main aisle, alongside the parked cars.
  { label: 'Car Deck', at: [8.1, 18.0], normal: [0, -1], halfWidth: 3.05 },
  // Over the lip of the down ramp. The one gate on the lap you cross while the
  // floor is falling away underneath you.
  { label: 'Ramp Down', at: [2.5, 8.75], normal: [0, 1], halfWidth: 2.3 },
  // Ebene 5's out lane, northbound, directly under the deck's aisle and three
  // metres below it. The two are three hundred millimetres apart on the map and
  // driven opposite ways, which is the whole reason a gate carries a level.
  { label: 'Level 5 North', at: [7.8, 18.0], normal: [0, -1], halfWidth: 6.25, y: LEVELS.garage },
  // And the back lane coming down, on the other side of the column line. Two
  // gates for one level, for the same reason the Grossraum has two: without the
  // second, half of the level below is a place you drove past.
  { label: 'Level 5 South', at: [13.9, 22.0], normal: [0, 1], halfWidth: 2.2, y: LEVELS.garage },
  // Across the cage store on its diagonal, between the mesh and the mesh.
  { label: 'Storage Units', at: [14.5, 40.2], normal: [1, 0], halfWidth: 2.2, y: LEVELS.garage },
  // The foot of the up ramp. The corner before it is the slowest on the lap and
  // the climb is the least forgiving, which is the whole point of putting them
  // next to each other.
  { label: 'Ramp Up', at: [18.125, 30.0], normal: [0, -1], halfWidth: 1.7, y: LEVELS.garage },
  // Across the canteen on the diagonal, between the tables and the servery.
  { label: 'Kitchen', at: [29.5, 8.4], normal: [1, 0], halfWidth: 5.35 },
  // The north lane of the open-plan, hard against the glazing.
  { label: 'Open Plan North', at: [52.0, 2.4], normal: [1, 0], halfWidth: 2.05 },
  // And the south lane coming back, on the other side of the desk run. Two
  // gates for one room, because without the second one half of the longest
  // room on the floor is optional.
  { label: 'Open Plan South', at: [52.0, 12.0], normal: [-1, 0], halfWidth: 1.45 },
  // Down the machine room's cold aisle.
  { label: 'Server Room', at: [44.0, 20.0], normal: [-1, 0], halfWidth: 5.95 },
  // Across the meeting room, corner to corner past the table.
  { label: 'Meeting Room', at: [30.0, 23.6], normal: [-1, 0], halfWidth: 3.55 },
  // The corridor, the whole way, back to the hall.
  { label: 'South Corridor', at: [33.0, 29.4], normal: [1, 0], halfWidth: 1.6 },
];
// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** Overall extents, for the camera clamp and the sun's shadow frustum. */
export const EXTENTS = {
  minX: 0,
  maxX: X.east,
  minZ: 0,
  maxZ: Z.south,
  /** The lowest finished floor in the world. Everything below this is a fall. */
  minY: LEVELS.garage,
} as const;

const contains = (r: Room, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/**
 * Which room a point is in, or undefined if it is inside the core or a wall.
 *
 * Two rooms now occupy the same rectangle in plan — the top deck and Ebene 5 —
 * so the answer depends on how high up you are asking from, and the rule is the
 * one a person would use: you are in the room whose floor is under your feet,
 * which is the nearest one at or below you. `y` defaults to the office floor so
 * that every caller written before there was a second level still means what it
 * said.
 *
 * The tolerance is what stops a chair mid-bounce, or one still settling onto a
 * slab, briefly belonging to the level below and taking the camera with it.
 */
export function roomAt(x: number, z: number, y: number = LEVELS.floor): Room | undefined {
  let best: Room | undefined;
  let bestDrop = Infinity;

  for (const room of ROOMS) {
    if (!contains(room, x, z)) continue;
    const drop = y - (room.base ?? LEVELS.floor);
    if (drop < -0.6 || drop >= bestDrop) continue;
    bestDrop = drop;
    best = room;
  }
  return best;
}

/**
 * Is there something solid to screw a fitting to, at this point on this line?
 *
 * A room's edge is not the same thing as a wall. On this floorplate a room
 * boundary can be a partition, a glazed system partition, a curtain wall, a
 * doorway, or an opening with nothing in it at all — and the difference matters
 * the moment anything is hung on it. Socket plates, extinguishers, escape plans
 * and clocks were being placed on every edge of every room at a fixed spacing,
 * which put a run of them across open doorways and out over glass, hanging in
 * mid air. Nothing gives a generated building away faster.
 *
 * Height is part of the question, not a detail: a curtain wall is solid below
 * its sill and above its head and glass in between, so a socket at 300 is fine
 * on it and an escape plan at 1600 is not.
 */
export function backing(axis: 'x' | 'z', at: number, u: number, y: number): boolean {
  const wall = WALLS.find(
    (w) => w.axis === axis && Math.abs(w.at - at) < 1e-6 && u >= w.from - 1e-6 && u <= w.to + 1e-6,
  );
  if (!wall) return false;

  // A hole is a hole, whatever the wall around it is made of.
  for (const o of wall.openings ?? []) {
    const half = openingWidth(o.kind, o.width) / 2;
    const head = o.height ?? DOOR.leafHeight + DOOR.frameReveal;
    if (u > o.at - half && u < o.at + half && y < head) return false;
  }

  switch (wall.kind) {
    case 'glazed':
      // Nothing is ever fixed to a Systemtrennwand. That is the point of it.
      return false;
    case 'facade': {
      const sill = wall.fullHeight ? 0 : FACADE.sillHeight;
      const head = wall.head ?? FACADE.headHeight;
      return y < sill || y > head;
    }
    case 'parapet':
      return y < 0.5;
    default:
      return y < (wall.height ?? SECTION.ceilingHeight);
  }
}

/**
 * The stretches of a line that have solid wall behind them.
 *
 * For anything continuous rather than a single fixing — trunking, a dado, a
 * handrail, a run of cladding. A 14 m length of cable trunking authored as one
 * box along a wall with two 2.5 m openings in it does not stop at the openings;
 * it sails straight across both of them at 1.1 m, which is a grey bar hanging
 * in a doorway and reads as exactly that.
 */
export function solidRuns(
  axis: 'x' | 'z',
  at: number,
  from: number,
  to: number,
  y: number,
  step = 0.125,
): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;

  for (let u = from; u <= to + 1e-6; u += step) {
    const solid = backing(axis, at, u, y);
    if (solid && start === null) start = u;
    if (!solid && start !== null) {
      if (u - step - start > 0.4) runs.push([start, u - step]);
      start = null;
    }
  }
  if (start !== null && to - start > 0.4) runs.push([start, to]);
  return runs;
}

/**
 * Walk along a line looking for somewhere a fitting can actually go.
 *
 * Returns the first solid point at or after `from`, searching in `step`
 * increments, or undefined if the whole run is glass and doorways.
 */
export function firstBacking(
  axis: 'x' | 'z',
  at: number,
  from: number,
  to: number,
  y: number,
  step = 0.25,
): number | undefined {
  const dir = Math.sign(to - from) || 1;
  for (let u = from; dir > 0 ? u <= to : u >= to; u += dir * step) {
    if (backing(axis, at, u, y)) return u;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

/**
 * Every setting-out dimension must be a whole module.
 *
 * The rule is worth a runtime check rather than a comment because it fails
 * silently and expensively: a partition 300 mm off the grid still builds, still
 * collides and still looks fine in a screenshot, and only reads as wrong once
 * the ceiling tiles cut across it at an angle nobody can name.
 */
export function assertOnGrid(): string[] {
  const problems: string[] = [];
  const check = (label: string, value: number) => {
    const off = Math.abs(value / MODULE - Math.round(value / MODULE));
    if (off > 1e-9) problems.push(`${label}: ${value} is not a whole module`);
  };

  for (const r of ROOMS) {
    check(`${r.id}.x0`, r.x0);
    check(`${r.id}.z0`, r.z0);
    check(`${r.id}.x1`, r.x1);
    check(`${r.id}.z1`, r.z1);
  }
  for (const w of WALLS) {
    check(`${w.id}.at`, w.at);
    check(`${w.id}.from`, w.from);
    check(`${w.id}.to`, w.to);
  }
  // The Parkhaus is set out on the same grid as the building it leans against,
  // which is not a coincidence anybody would notice and is the reason the deck
  // plates, the bay rows and the building's west face all line up.
  for (const r of RAMPS) {
    check(`${r.id}.x0`, r.x0);
    check(`${r.id}.x1`, r.x1);
    check(`${r.id}.zHigh`, r.zHigh);
    check(`${r.id}.zLow`, r.zLow);
    check(`${r.id}.landingHigh`, r.landingHigh);
    check(`${r.id}.landingLow`, r.landingLow);
    // Not a module rule, but it belongs to the same gate: a ramp is the one
    // dimension in this file that can be quietly wrong in a way you only find
    // out about by driving it, and a garage ramp has a legal ceiling.
    const gradient = GARAGE.storey / Math.abs(r.zLow - r.zHigh);
    if (gradient > GARAGE.maxGradient) {
      problems.push(`${r.id}: ${(gradient * 100).toFixed(1)}% is steeper than a garage ramp may be`);
    }
  }
  for (const [i, p] of DECK_PLATES.entries()) {
    check(`deck.plate.${i}.x0`, p.x0);
    check(`deck.plate.${i}.z0`, p.z0);
    check(`deck.plate.${i}.x1`, p.x1);
    check(`deck.plate.${i}.z1`, p.z1);
  }
  for (const [key, value] of Object.entries(DECK_STAIR)) {
    if (key !== 'height') check(`deck.stair.${key}`, value);
  }
  return problems;
}
