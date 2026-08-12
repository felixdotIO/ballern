/**
 * Art direction: "beige 2004 Euro corporate".
 *
 * Five base materials, shared by everything. Anything that looks like a sixth
 * material is a tint or a wear variant of one of these. Material discipline is
 * what separates a shipped interior from a student project — the moment props
 * start carrying their own bespoke shaders, the room falls apart.
 *
 * Colours are authored in sRGB hex. Roughness/metalness are physical, not
 * artistic: they come from what the surface actually is.
 */

import { Color } from 'three';

export type SurfaceSpec = {
  /** Named real referent. If this can't be filled in, the material is invented
   *  and doesn't belong in the scene. */
  referent: string;
  color: number;
  roughness: number;
  metalness: number;
  /** Height band (metres AFF) where wear concentrates, if any. Wear is applied
   *  where things actually rub, never spread evenly across a surface. */
  wearBand?: readonly [number, number];
};

// ---------------------------------------------------------------------------
// The five
// ---------------------------------------------------------------------------

export const SURFACES = {
  /** Mottled loop pile, the colour of weak tea. Wear tracks along circulation
   *  and in an arc behind every desk where the castors sweep. */
  carpet: {
    referent: 'Vorwerk/Anker loop pile contract carpet tile, oatmeal',
    color: 0x8c8071,
    roughness: 0.95,
    metalness: 0.0,
  },

  /** The circulation run. Real 2000s fit-outs marked primary routes with a
   *  darker tile, which is why we can use it as the racing line honestly. */
  carpetRun: {
    referent: 'contract carpet tile, slate-blue circulation run',
    color: 0x4a5560,
    roughness: 0.95,
    metalness: 0.0,
  },

  /** Magnolia emulsion on Trockenbau. Scuffed where chair bases hit it. */
  wall: {
    referent: 'magnolia emulsion on 12.5 mm gypsum board',
    color: 0xede6d8,
    roughness: 0.85,
    metalness: 0.0,
    wearBand: [0.3, 0.6],
  },

  /** Beech-effect melamine with grey PVC edge banding. The defining material of
   *  the era — every worksurface, cabinet carcass and shelf in the building. */
  melamine: {
    referent: 'beech-decor melamine faced chipboard, 25 mm, PVC edge band',
    color: 0xc9a87c,
    roughness: 0.4,
    metalness: 0.0,
  },

  /** RAL 7035 Lichtgrau. Cabinets, door frames, radiators, trunking, the
   *  underside of everything. If you painted German office metal, it was this. */
  metal: {
    referent: 'RAL 7035 Lichtgrau powder coat',
    color: 0xd7d7d2,
    roughness: 0.55,
    metalness: 0.35,
  },
} as const satisfies Record<string, SurfaceSpec>;

// ---------------------------------------------------------------------------
// Tints — variants of the five, not new materials
// ---------------------------------------------------------------------------

export const TINTS = {
  /** Petrol teal. Task chair fabric and Stellwand screens, and the only strong
   *  colour the building's designers were allowed to choose. */
  upholstery: { referent: 'contract chair fabric, petrol', color: 0x3e6b6b, roughness: 0.9, metalness: 0.0 },
  /** The other one they were allowed. Shows up in meeting rooms. */
  upholsteryAlt: { referent: 'contract chair fabric, burgundy', color: 0x6b2f3a, roughness: 0.9, metalness: 0.0 },
  /** Mineral fibre tile, faintly yellowed toward the corners where people
   *  smoked until the rules changed. */
  ceilingTile: { referent: 'mineral fibre acoustic tile, sanded white', color: 0xe8e6dd, roughness: 0.92, metalness: 0.0 },
  /** Off-white vertical blind slat — vertical, never roller. */
  blind: { referent: 'PVC vertical blind slat 89 mm', color: 0xe4e0d5, roughness: 0.8, metalness: 0.0 },
  /** Warm grey plastic that yellowed. CRT bezels, keyboards, towers, phones. */
  yellowedPlastic: { referent: 'ABS computer housing, aged putty', color: 0xd6cdb6, roughness: 0.55, metalness: 0.0 },
  /** Anti-glare CRT front glass when the machine is off. */
  crtGlass: { referent: '17" CRT anti-glare front glass, powered off', color: 0x2b2f31, roughness: 0.25, metalness: 0.0 },
  darkCarpetTrim: { referent: 'contract carpet tile, charcoal border', color: 0x3a3a38, roughness: 0.95, metalness: 0.0 },

  // -- second-hand-shop extension: the rooms the office bay did not need ------

  /** Besprechungsraum carpet. Heavier, darker, laid ashlar rather than
   *  quarter-turned, because the good carpet always is. */
  carpetBoard: { referent: 'contract carpet tile, moss, ashlar laid', color: 0x565b4c, roughness: 0.95, metalness: 0.0 },
  /** Marmoleum sheet in the canteen. Mottled, mid-tone, welded seams. */
  linoleum: { referent: 'Forbo Marmoleum sheet, sage mottle', color: 0x6f7668, roughness: 0.55, metalness: 0.0 },
  /** Quarry tile under the servery, where a wet floor has to stay a floor. */
  quarryTile: { referent: 'unglazed quarry tile 200 mm, buff', color: 0x8a6e55, roughness: 0.7, metalness: 0.0 },
  /** Fliesenspiegel — the white 200 mm splashback everyone chose. */
  wallTile: { referent: 'glazed wall tile 200 mm, white', color: 0xf0eee6, roughness: 0.15, metalness: 0.0 },
  /** Conductive vinyl in the EDV room. Flat, dull, faintly blue-grey. */
  antistatic: { referent: 'conductive vinyl tile 600 mm, pale grey', color: 0x969b98, roughness: 0.6, metalness: 0.0 },
  /** Poliertes Granit in the hall. Nearly the only reflective floor in the
   *  building, which is exactly why the reception is the room that impresses. */
  graniteLight: {
    referent: 'polished granite 600 mm, Bianco Sardo',
    color: 0xa5a099,
    // Polished, but not a mirror. At 0.2 every downlight in the hall put a
    // pinpoint specular on the floor that clipped to white and bloomed; real
    // polished granite in a lobby has been walked on and scatters more than a
    // showroom sample does.
    roughness: 0.34,
    metalness: 0.0,
  },
  graniteDark: { referent: 'honed granite border band, Nero Impala', color: 0x3c3b3a, roughness: 0.28, metalness: 0.0 },
  /** The inlay that leads from the entrance to the lifts. A mid stone, not the
   *  border's near-black: a dark band across a pale floor reads as a hole in it,
   *  and an inlay is supposed to draw the eye along, not stop it. */
  graniteBand: { referent: 'honed granite inlay band, Impala mid', color: 0x847f77, roughness: 0.26, metalness: 0.0 },
  /** Sauberlaufmatte — the ribbed aluminium-and-bristle well at the entrance. */
  entranceMatting: { referent: 'aluminium matting with grey bristle inserts', color: 0x4a4844, roughness: 0.9, metalness: 0.15 },
  /** Edelstahl. Sink, splashback trim, lift architraves, servery counter. */
  stainless: { referent: 'brushed 1.4301 stainless steel', color: 0xb9bcbd, roughness: 0.28, metalness: 0.9 },
  /** Power-floated deck slab. Grey, slightly blue in shade, stained by
   *  everything that has ever been parked on it. */
  concrete: { referent: 'power-floated concrete deck, C30/37', color: 0x8e8d88, roughness: 0.88, metalness: 0.0 },
  concreteFair: { referent: 'fair-faced precast concrete, sawn shutter', color: 0x9c9a93, roughness: 0.8, metalness: 0.0 },
  /** Fahrbahnmarkierung. White when it was applied, and that was a while ago. */
  trafficWhite: { referent: 'road marking paint, RAL 9016, weathered', color: 0xcfcabc, roughness: 0.85, metalness: 0.0 },
  trafficYellow: { referent: 'road marking paint, RAL 1023', color: 0xc9a63a, roughness: 0.85, metalness: 0.0 },
  trafficBlue: { referent: 'accessible bay marking, RAL 5017', color: 0x2f5f96, roughness: 0.85, metalness: 0.0 },
  /** Anfahrschutz banding on every column base. */
  hazardRed: { referent: 'RAL 3020 Verkehrsrot on a column guard', color: 0xa8261f, roughness: 0.6, metalness: 0.1 },
  /** Boardroom seating. The one room where the chairs are leather. */
  leather: { referent: 'contract leather, conference chair, tan-black', color: 0x3a2f2a, roughness: 0.45, metalness: 0.0 },
  /** Glazed system partition, seen edge on and in reflection. */
  partitionGlass: { referent: '10 mm toughened glass, Systemtrennwand', color: 0xd6e2e4, roughness: 0.04, metalness: 0.0 },
  /** Cable, in the industrial quantity a comms room has of it. */
  patchCable: { referent: 'Cat 5e patch lead, grey PVC', color: 0x9a9c95, roughness: 0.7, metalness: 0.0 },
  /** Painted soffit above an EDV room. Dusty white over a concrete deck. */
  paintedSoffit: { referent: 'emulsion on soffit, dusted', color: 0xc9c6bd, roughness: 0.95, metalness: 0.0 },
} as const satisfies Record<string, SurfaceSpec>;

/**
 * Car finishes, 2004, German company car park.
 *
 * Overwhelmingly silver — it was the decade of silver — then black, then dark
 * blue, then whatever the one person who chose for themselves chose. Getting
 * this distribution right matters more than any individual colour, because a
 * car park of evenly distributed hues reads as a toy box.
 */
export const CAR_COLORS = [
  { referent: 'VW Reflexsilber metallic', color: 0xb4b8bb, metalness: 0.85, roughness: 0.28 },
  { referent: 'Audi Lichtsilber metallic', color: 0xc0c3c2, metalness: 0.85, roughness: 0.25 },
  { referent: 'VW Diamantschwarz Perleffekt', color: 0x1b1c1e, metalness: 0.8, roughness: 0.22 },
  { referent: 'BMW Orientblau metallic', color: 0x27374f, metalness: 0.85, roughness: 0.26 },
  { referent: 'Mercedes Obsidianschwarz', color: 0x23252a, metalness: 0.8, roughness: 0.24 },
  { referent: 'Opel Casablancaweiß, solid', color: 0xdcd9d1, metalness: 0.1, roughness: 0.45 },
  { referent: 'VW Tornadorot, solid', color: 0x8f1f1c, metalness: 0.2, roughness: 0.4 },
  { referent: 'Škoda Rallyegrün metallic', color: 0x2c4436, metalness: 0.8, roughness: 0.3 },
  { referent: 'Ford Panthergrau metallic', color: 0x6a6d70, metalness: 0.85, roughness: 0.3 },
] as const;

/** Automotive glass: dark, green-tinted, and never a mirror at this angle. */
export const CAR_GLASS = {
  referent: 'laminated windscreen, green tint',
  color: 0x1e2825,
  roughness: 0.08,
  metalness: 0.0,
} as const satisfies SurfaceSpec;

/**
 * Leitz-type lever arch file spines. A shelf of these is the strongest regional
 * signature in the building and our cheapest source of honest colour variety.
 * Real ranges are limited and slightly grim, which is the point — do not
 * brighten these into a toy palette.
 */
export const BINDER_COLORS = [
  0x1f4b8e, // blau
  0x8e1f24, // rot
  0x1e5a34, // grün
  0x2b2b2b, // schwarz
  0x6b5b3e, // braun-marmoriert
  0xb8a33c, // gelb
  0x7a7a78, // grau
] as const;

// ---------------------------------------------------------------------------
// Light
// ---------------------------------------------------------------------------

/**
 * The whole building runs on one lamp type. Its slight green cast is not a
 * mistake to be colour-corrected away — it is what makes 2004 look like 2004.
 */
export const FLUORESCENT = {
  referent: 'T8 tube, 4000K neutral white, triphosphor',
  /** 4000K with the triphosphor green spike left in. */
  color: 0xf2f4e8,
  /** Per 625×625 four-lamp louvre fitting. Tuned so the ceiling lands inside
   *  its VALUE_TARGETS band with the environment map contributing the rest. */
  intensity: 5.0,
} as const;

/**
 * The EDV room runs a different lamp, and it is the only room in the building
 * that does: bare 6500 K daylight tubes in a batten, because nobody specifies
 * for comfort in a room with no chairs in it. Against the 4000 K green-white
 * everywhere else it reads as genuinely cold, which is most of why the server
 * room feels like a different building.
 */
export const COLD_FLUORESCENT = {
  referent: 'T8 tube, 6500 K daylight, in an open batten',
  color: 0xdfeaf6,
  intensity: 5.5,
} as const;

/**
 * Equipment LEDs. Tiny, saturated, and the only pure hues in the project —
 * which is exactly why a rack of them is worth building.
 */
export const INDICATOR = {
  link: 0x3ad07a,
  activity: 0xe8c33a,
  fault: 0xd8422e,
  power: 0x2f7fe0,
} as const;

/**
 * Deck lighting. High-pressure sodium on the mast heads, just struck and still
 * warming up, so it is a weak orange against a sky that is still brighter than
 * it is. In twenty minutes it will own the deck; right now it barely registers,
 * and that is the correct amount.
 */
export const SODIUM = {
  referent: 'SON-T 70 W high-pressure sodium, warming',
  color: 0xffab52,
  intensity: 2.2,
} as const;

/**
 * Golden hour. The sun is low and to the west, raking almost horizontally
 * through the facade.
 *
 * Three light colours are in play at once and none of them should be corrected
 * toward each other — the tension between them is the whole image:
 *  - SUN     warm, direct, hard-edged, and several stops above everything else
 *  - SKYFILL cool blue bounce filling the shadows the sun doesn't reach
 *  - FLUORESCENT green-white, invisible at the window, dominant in the core
 */
export const SUN = {
  referent: 'low western sun, ~3000 K, roughly 10° elevation',
  color: 0xffb877,
  intensity: 7.5,
} as const;

export const SKYFILL = {
  referent: 'clear evening sky, away from the sun',
  color: 0x9dbfe0,
  intensity: 0.5,
} as const;

/** Warm glow through the glazing itself, as an area source. */
export const DAYLIGHT = {
  referent: 'sunlit glazing plane at golden hour',
  color: 0xffd2a0,
  intensity: 16,
} as const;

/**
 * Value structure the lighting must hit, checked per room by the histogram
 * gate. Roughly 70% of frame sits in a tight mid band; blowing the windows is
 * correct and gives the perimeter its punch.
 *
 * The lap breathes because of this: the daylit perimeter is bright and warm-
 * contrasted, the windowless core runs on fluorescents alone and goes flat and
 * cool. Bright → dim → bright, once per lap, for free.
 */
export const VALUE_TARGETS = {
  ceiling: [0.45, 0.62] as const,
  wall: [0.38, 0.55] as const,
  floor: [0.18, 0.32] as const,
  window: [0.9, 1.0] as const,
  /** Share of pixels allowed above the highlight threshold. */
  maxHighlightFraction: 0.12,
} as const;

/**
 * Convenience for three.js material construction.
 *
 * No manual sRGB→linear step here: three's colour management already treats a
 * hex passed to `new Color()` as sRGB and converts it to the working space.
 * Converting again costs roughly two stops and desaturates everything, which is
 * what turned the first pass of this room into grey mud.
 */
export const asColor = (spec: SurfaceSpec) => new Color(spec.color);
