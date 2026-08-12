/**
 * Dimensional truth for the whole project. Everything — walls, props, collision
 * volumes, camera heights — reads from here. Nothing gets a hardcoded dimension
 * anywhere else in the codebase.
 *
 * Setting: a German speculative office building, fit out around 2004.
 * Every value below is derived from a real standard or a real product. Where a
 * number came from is written next to it; if a referent can't be named, the
 * number doesn't belong in this file.
 *
 * All units are metres.
 */

/**
 * The axial planning grid (Ausbauraster). 1.25 m is the German spec-office
 * module, and it is the reason 625 mm ceiling tiles exist: plasterboard ships
 * at 1250 mm, so two tiles land exactly on one module.
 *
 * The consequence — and the single highest-leverage authenticity rule we have —
 * is that partitions, facade mullions and ceiling grid lines all agree. Every
 * partition lands on a module line. No exceptions, ever.
 */
export const MODULE = 1.25;

/** Snap a dimension to the nearest whole module. Room sizes go through this. */
export const modules = (n: number) => n * MODULE;

// ---------------------------------------------------------------------------
// Vertical section
// ---------------------------------------------------------------------------

export const SECTION = {
  /** Structural slab-to-slab. */
  slabToSlab: 3.6,
  /** Doppelboden — raised access floor, cable management for the CRT era. */
  raisedFloorDepth: 0.15,
  /** Clear finished ceiling height. ASR A1.2 wants ≥2.50 for offices; spec
   *  buildings of this era land on 2.70. */
  ceilingHeight: 2.7,
  /** Plenum left over for ducts, sprinkler main and the luminaire bodies. */
  get ceilingVoid() {
    return this.slabToSlab - this.raisedFloorDepth - this.ceilingHeight;
  },
} as const;

// ---------------------------------------------------------------------------
// Grids — the truth-tellers. If these read as coherent, the room reads as real.
// ---------------------------------------------------------------------------

export const GRID = {
  /** Mineral fibre tile on exposed T-bar. 625 mm, two per module. */
  ceilingTile: 0.625,
  /** T-bar face width, visible as the seam. */
  ceilingTeeWidth: 0.024,
  /**
   * Carpet tile. Deliberately NOT module-aligned: carpet is laid from a room
   * corner independently of the ceiling grid, and that slight disagreement
   * between floor and ceiling rhythm is exactly what real interiors look like.
   */
  carpetTile: 0.5,
  /** Recessed 625×625 parabolic louvre luminaire (Rasterleuchte). Replaces one
   *  ceiling tile, so it is grid-aligned for free. */
  luminaire: 0.625,
  /** Swirl diffuser (Drallauslass), also a one-tile replacement. */
  airDiffuser: 0.625,
  /** Pendent sprinkler head spacing — 2 modules keeps it on grid. */
  sprinklerSpacing: 2.5,
} as const;

// ---------------------------------------------------------------------------
// Walls, openings, circulation
// ---------------------------------------------------------------------------

export const WALL = {
  /** Trockenbau partition: 75 mm stud + 12.5 mm board each face. */
  partitionThickness: 0.1,
  /** Structural core walls. */
  coreThickness: 0.25,
  /** Sockelleiste. */
  skirtingHeight: 0.06,
  skirtingDepth: 0.018,
  /** Scuff band — where chair bases, trolleys and Rollcontainer hit the wall.
   *  Wear textures are concentrated in this range, not spread evenly. */
  scuffBand: [0.3, 0.6] as const,
  /** Steckdosenhöhe, German convention. */
  socketHeight: 0.3,
  /** Lichtschalterhöhe, German convention. */
  switchHeight: 1.05,
  /** Cable trunking run above the desk line in retrofitted rooms. */
  trunkingHeight: 1.1,
} as const;

export const DOOR = {
  /** DIN 18101 Türblatt, the common office leaf. */
  leafWidth: 0.86,
  /** The next size up. Fitted wherever equipment has to get through — plant
   *  rooms, server rooms, cleaners' stores. */
  leafWidthWide: 1.01,
  leafHeight: 2.11,
  leafThickness: 0.04,
  /** Zarge (frame) adds this much on each jamb and at the head. */
  frameReveal: 0.075,
  /** Drückerhöhe — handle centre. */
  handleHeight: 1.05,
  /** Swing arc must stay clear of every prop. Enforced by the clearance gate. */
  swingClearance: 0.9,
} as const;

export const CIRCULATION = {
  /** Primary loop around the core: 2 modules. This is the lap. */
  primaryWidth: modules(2),
  /** Secondary run into an open-plan bay: 1 module. */
  secondaryWidth: modules(1),
  /** ASR A1.8 minimum clear escape width — nothing may encroach on this. */
  minClearEgress: 1.2,
} as const;

export const FACADE = {
  /** Mullion rhythm matches the module, because in a real building it is the
   *  same grid — that is why interior partitions can meet the facade cleanly. */
  mullionSpacing: MODULE,
  mullionWidth: 0.06,
  /** Brüstung — sill height. */
  sillHeight: 0.9,
  /** Head height, leaving a bulkhead below the finished ceiling. */
  headHeight: 2.5,
  /** Radiator sits under the sill, the length of one module bay. */
  radiatorHeight: 0.6,
  radiatorDepth: 0.1,
  radiatorFloorGap: 0.12,
} as const;

// ---------------------------------------------------------------------------
// Furniture. 2004 German office, DIN EN 527 worksurfaces and Ordnerhöhen.
// ---------------------------------------------------------------------------

/**
 * Ordnerhöhe (OH) — storage is specified in lever-arch-file heights, not in
 * millimetres, and every cabinet in the building is a whole number of them.
 * Getting this right is why a wall of German storage reads correctly.
 */
export const OH = 0.37;

export const DESK = {
  /** DIN EN 527 fixed-height worksurface. */
  width: 1.6,
  depth: 0.8,
  height: 0.72,
  topThickness: 0.025,
  /** Clear space behind the chair so it can pull out. Clearance gate checks it. */
  pullOutClearance: 0.75,
  /** Stellwand — fabric screen between facing desks in a bench pod. */
  screenHeight: 1.4,
  screenThickness: 0.045,
} as const;

export const CHAIR = {
  seatHeightRange: [0.42, 0.52] as const,
  seatWidth: 0.47,
  seatDepth: 0.44,
  /** Five-star base, the outer diameter that actually collides with things. */
  baseDiameter: 0.66,
  castorDiameter: 0.05,
  backrestHeight: 0.55,
} as const;

export const STORAGE = {
  /** Aktenschrank — 5 OH is the standard full-height office cabinet. */
  cabinetWidth: 0.8,
  cabinetDepth: 0.42,
  cabinetHeights: [2 * OH, 3 * OH, 5 * OH] as const,
  /** Rollcontainer under the desk. */
  pedestalWidth: 0.42,
  pedestalDepth: 0.8,
  pedestalHeight: 0.55,
  /** Leitz-type lever arch file, wide and narrow. The colour-coded wall of
   *  these is the strongest single regional signature we have. */
  binderHeight: 0.32,
  binderDepth: 0.285,
  binderWidthWide: 0.08,
  binderWidthNarrow: 0.05,
} as const;

// ---------------------------------------------------------------------------
// Teeküche and canteen. DIN 68935 fitted-kitchen dimensions, which is the same
// system a German office kitchenette is built from as a domestic one.
// ---------------------------------------------------------------------------

export const KITCHEN = {
  /** Arbeitsplatte. 900 is the contract height; 850 is the domestic one. */
  worktopHeight: 0.9,
  worktopThickness: 0.04,
  /** Unterschrank carcass, 600 deep, on a 150 recessed plinth. */
  baseDepth: 0.6,
  plinthHeight: 0.15,
  plinthSetback: 0.05,
  /** Carcass widths come in 150 increments; these are the ones that get used. */
  unitWidths: [0.45, 0.6, 0.9] as const,
  /** Oberschrank: 720 tall, 350 deep, bottom edge 500 above the worktop. */
  wallUnitHeight: 0.72,
  wallUnitDepth: 0.35,
  wallUnitClearance: 0.5,
  /** Fliesenspiegel — the tiled band between worktop and wall units. 200 tiles. */
  splashbackTile: 0.2,
  /** Kühlschrank, full height, and the tall housing it sits in. */
  fridgeWidth: 0.6,
  fridgeHeight: 1.85,
  /** Canteen tables. DIN EN 1729 dining height. */
  tableHeight: 0.74,
  tableRound: 0.9,
  tableRect: [1.6, 0.8] as const,
  /** Stapelstuhl — the four-leg stacking chair every Aufenthaltsraum has. */
  stackChairSeatHeight: 0.46,
  /** Getränkekiste. 12 × 0.7 l, and the crate is a fixed industry footprint. */
  crate: [0.4, 0.3, 0.27] as const,
} as const;

// ---------------------------------------------------------------------------
// EDV-Raum. Everything here is 19-inch or a multiple of a 600 floor tile.
// ---------------------------------------------------------------------------

export const SERVER = {
  /** One rack unit. 1.75 inches, and the reason racks are the height they are. */
  U: 0.04445,
  /** 19" cabinet: 600 wide, 1000 deep, 42 U plus a 100 plinth. */
  rackWidth: 0.6,
  rackDepth: 1.0,
  rackUnits: 42,
  rackPlinth: 0.1,
  get rackHeight() {
    return this.rackUnits * this.U + this.rackPlinth;
  },
  /** Cold aisle in front of the racks. Nothing may stand in it. */
  aisle: 1.2,
  /** Kabeltrasse — cable ladder, hung from the soffit. */
  ladderWidth: 0.3,
  ladderHeight: 2.5,
  /** Conductive vinyl tile, laid on a 600 grid and earthed at every seam. */
  floorTile: 0.6,
  /** Umluftkühlgerät — the in-row cooling unit, and the loudest thing here. */
  cracSize: [0.9, 2.0, 0.7] as const,
} as const;

// ---------------------------------------------------------------------------
// Besprechungsraum
// ---------------------------------------------------------------------------

export const BOARD = {
  /** Bootsform conference table, 6 m of beech veneer in three sections. */
  tableLength: 6.0,
  tableWidth: 1.5,
  /** The boat's waist, which is what stops a 6 m table reading as a plank. */
  tableWaist: 1.2,
  tableHeight: 0.74,
  tableTopThickness: 0.04,
  /** Seat pitch down the long side. Tighter than comfort, as they always are. */
  seatPitch: 0.78,
  /** Sideboard along the back wall: 2 OH, and the glasses live on top of it. */
  credenzaHeight: 0.74,
  credenzaDepth: 0.45,
  /** Roll-down projection screen, in its cassette above the end wall. */
  screenWidth: 1.8,
  screenDrop: 1.35,
  screenCassetteHeight: 2.35,
} as const;

// ---------------------------------------------------------------------------
// Empfang
// ---------------------------------------------------------------------------

export const HALL = {
  /** Two-tier reception counter: the working top and the transaction shelf. */
  deskWorkHeight: 0.74,
  deskTransactionHeight: 1.1,
  deskDepth: 0.9,
  deskLength: 3.6,
  /** Aufzugstür, and the polished stainless architrave around it. */
  liftDoorWidth: 1.1,
  liftDoorHeight: 2.1,
  liftArchitrave: 0.08,
  /** Lounge seating. Contract soft furniture sits low and hard. */
  sofaSeatHeight: 0.42,
  sofaDepth: 0.85,
  sofaLength: 1.9,
  coffeeTableHeight: 0.4,
  /** Sauberlaufzone — the matting well inside every entrance, recessed so its
   *  surface finishes flush with the stone. */
  mattingDepth: 2.5,
  /** Granite in the hall, 600 square with a honed border band. */
  stoneTile: 0.6,
} as const;

// ---------------------------------------------------------------------------
// Parkdeck. Top deck of the adjoining Parkhaus, open to the sky.
// ---------------------------------------------------------------------------

export const DECK = {
  /** Stellplatz. 2.50 × 5.00 is the German minimum and what everyone builds. */
  bayWidth: 2.5,
  bayDepth: 5.0,
  /** Fahrgasse — the aisle a 90° bay is entered from. */
  aisleWidth: 6.25,
  /** Traffic paint, 120 wide, and by now more grey than white. */
  lineWidth: 0.12,
  /** Attika: concrete upstand, with a steel rail bringing it to the 1.10 m
   *  Absturzsicherung the building regs want. */
  parapetHeight: 0.5,
  parapetThickness: 0.24,
  guardHeight: 1.1,
  /** Anfahrschutz: the red-and-white banded guard bolted to anything on the
   *  deck a car can reach, which on an open top deck means the stair house
   *  corners, the ramp mouth and every lamp mast. */
  bumperHeight: 0.9,
  /** Radabweiser at the head of each bay, so nobody parks into the parapet. */
  wheelStopHeight: 0.1,
  wheelStopLength: 1.6,
  /** Fugenband — the movement joint across the slab, every 15 m or so. */
  jointSpacing: 15.0,
  /** Mastleuchte, on the deck rather than a soffit, because there is no soffit. */
  lampHeight: 4.2,
} as const;

// ---------------------------------------------------------------------------
// Ebene 5. The enclosed level below the top deck, and the ramps between them.
// ---------------------------------------------------------------------------

/**
 * The Parkhaus in section.
 *
 * A parking storey is the shallowest habitable floor a building has, and every
 * number here is fighting for the same 3 m: the slab has to span 16 m, the
 * sprinkler main and the lighting have to run under it, and what is left over
 * is what a Transporter has to fit through. German practice signs the entrance
 * at 2.00 or 2.10 m and builds to about 2.30 clear under the downstands, which
 * is what these produce.
 *
 * The vertical dimensions are deliberately not on the 1.25 m module. Nothing
 * vertical in this building is — the office storey is 3.60 and its ceiling is
 * 2.70 — because the module is a *plan* grid, set by mullions and ceiling tiles.
 * `assertOnGrid()` checks plan dimensions for exactly that reason.
 */
export const GARAGE = {
  /** Floor to floor, top deck down to Ebene 5. */
  storey: 2.9,
  /** Finished floor level of Ebene 5, taking the top deck as zero. */
  get base() {
    return -this.storey;
  },
  /** Structural depth of the deck slab overhead. */
  slabDepth: 0.28,
  /** Clear to the soffit between the beams. */
  get clearHeight() {
    return this.storey - this.slabDepth;
  },
  /** Downstand beams on the column grid, and the headroom left under them. */
  beamDepth: 0.3,
  /**
   * Brüstung: the solid upstand along every open edge. An offene Mittelgarage
   * is naturally ventilated, which is why a German Parkhaus is a stack of
   * horizontal slots and not a box — and why Ebene 5 is lit at all. The slot
   * above this is what lets a sunset in sideways.
   */
  upstandHeight: 1.05,
  upstandThickness: 0.24,
  /** Stützenraster. One line of columns down the middle of the level. */
  columnSpacing: 7.5,
  columnSize: 0.45,
  /**
   * Ramp gradient, as built.
   *
   * German garage regs allow 15% and everybody designs to less. 12.2% is what
   * falls out of a 2.90 m storey and the 23.75 m of run the Parkhaus is long
   * enough to give it — see RAMPS in plan.ts, which is where the run is set and
   * this is the consequence of, not the other way round.
   */
  maxGradient: 0.15,
  /** Clear opening at the ramp mouth, where the Durchfahrtshöhe sign hangs. */
  signedHeadroom: 2.1,
} as const;

/**
 * The cars. Silhouettes rather than models: a 2004 German office car park is a
 * Golf, a Passat Variant, an A4, an Astra and a Transporter, and their
 * proportions are the whole recognition — length, height, and where the
 * greenhouse sits on the body.
 */
export const CAR = {
  /** Wheel diameter for a 195/65 R15, which is what all of them are on. */
  wheelDiameter: 0.635,
  wheelWidth: 0.2,
  /** Ground clearance under the sills. */
  sillHeight: 0.16,
} as const;

// ---------------------------------------------------------------------------
// Wall furniture. Real offices have none of these missing — bare walls are the
// second-biggest tell after blank ceilings.
// ---------------------------------------------------------------------------

export const FITTINGS = {
  /** Feuerlöscher bracket, to the carry handle. */
  extinguisherHandleHeight: 1.0,
  /** Flucht- und Rettungsplan (ISO 23601) by every door and lift lobby.
   *  Laminated A3 landscape. Also our level-select artwork. */
  escapePlanWidth: 0.42,
  escapePlanHeight: 0.297,
  escapePlanCentreHeight: 1.6,
  /** Green running-man exit sign, pendant or wall-mounted. Doubles as the
   *  track's directional telegraphing, which is what it does in real life too. */
  exitSignWidth: 0.3,
  exitSignHeight: 0.15,
  exitSignCentreHeight: 2.2,
  whiteboardBottomHeight: 0.9,
  whiteboardHeight: 1.2,
  noticeBoardBottomHeight: 1.0,
  /** Türschild — the room-number plate beside every door, at eye height on the
   *  handle side. Small, and its absence is instantly legible. */
  signWidth: 0.21,
  signHeight: 0.075,
  signCentreHeight: 1.6,
  /** Pictogram plate — WCs, stairs, Technik. */
  pictogramSize: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

export const PLAYER = {
  /** Eye height seated on a task chair: seat at ~0.45 plus sitting eye height. */
  eyeHeight: 1.2,
  /** Tucked-in racing posture drops the camera and widens the FOV. */
  eyeHeightCrouched: 0.95,
  /** Collision capsule. Radius comes from the chair base, not the sitter. */
  colliderRadius: CHAIR.baseDiameter / 2,
  colliderHeight: 1.1,
} as const;

// ---------------------------------------------------------------------------
// Placement rules consumed by the dressing solver and the validation gates.
// ---------------------------------------------------------------------------

export const PLACEMENT = {
  /** Jitter applied to anything a human touches. Anything the building owns —
   *  ceiling tiles, sockets, sprinklers, mullions — gets exactly zero. */
  humanJitterDegrees: 3,
  humanJitterMetres: 0.04,
  /** No identical (mesh + material + rotation bucket) instance may appear
   *  within this radius, or within the same sightline. */
  duplicateExclusionRadius: 6.0,
  /** Rotation buckets for the duplicate test, in degrees. */
  rotationBucketDegrees: 15,
  /** A prop's support raycast must land within this distance or it is floating. */
  settleTolerance: 0.002,
} as const;

/**
 * Reality does repeat some things, and refusing to repeat them is its own kind
 * of fake. These prop classes are allowed to appear as perfect duplicates.
 * Everything not on this list must vary, and the duplicate gate enforces it.
 */
export const REPETITION_WHITELIST = new Set([
  'ceiling.tile',
  'ceiling.tee',
  'ceiling.luminaire',
  'ceiling.diffuser',
  'ceiling.sprinkler',
  'ceiling.smokeDetector',
  'floor.carpetTile',
  'facade.mullion',
  'facade.radiator',
  'wall.socket',
  'wall.switch',
  'wall.skirting',
  'furniture.stackingChair',
  'furniture.locker',
  // A rack row is identical by design — that is what a standard is for — and a
  // deliberately varied one would read as a junk shop rather than a data room.
  'server.rack',
  'server.floorTile',
  'kitchen.wallUnit',
  'deck.bayLine',
  'deck.wheelStop',
  'hall.stoneTile',
]);
