/**
 * The building's materials, built once and shared by every room.
 *
 * The five-material rule from palette.ts is enforced here by construction:
 * there is one instance of each surface in the whole project, so a room cannot
 * quietly acquire its own slightly different beige. That matters more as rooms
 * multiply — the fastest way to make a floorplate read as a set of unrelated
 * levels is to let each one mix its own emulsion.
 *
 * The batcher keys its buckets by material UUID, so sharing instances is also
 * what makes the whole floorplate collapse into a couple of dozen draw calls.
 */

import * as THREE from 'three';

import {
  COLD_FLUORESCENT,
  FLUORESCENT,
  INDICATOR,
  RECEPTION,
  SODIUM,
  SURFACES,
  TINTS,
  asColor,
  type SurfaceSpec,
} from './palette';
import { makeNoiseNormalMap } from '../render/textures';
import { seedFrom } from './rng';

const standard = (spec: SurfaceSpec, over: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    color: asColor(spec),
    roughness: spec.roughness,
    metalness: spec.metalness,
    ...over,
  });

/**
 * Loop pile. One map shared by every carpet colour — they are the same product
 * in different dye lots, so it is the same weave.
 *
 * Band-limited, and that is the whole point of the numbers. This started as
 * unsmoothed noise at 256, on the reasoning that a loop pile is a tight fibrous
 * scatter and unsmoothed noise is a tight fibrous scatter. It is, on a texture
 * viewer. On a floor it is not, because of where the texels land: a carpet tile
 * is 500 mm and takes the whole 0..1 UV, so a 256 map puts a texel every 2 mm —
 * which at a chase camera's distance is very nearly one texel per pixel. A
 * random normal per pixel is not a weave. It is static, and it crawls when you
 * move, and it was measured at seventy-five times the pixel-to-pixel variation
 * of the same floor with the map switched off.
 *
 * Three blur passes give the height field a correlation length of about four
 * texels, which at 512 over a 500 mm tile is 4 mm — the actual size of a loop —
 * and puts the highest frequency in the map safely below the pixel grid, where
 * mipmapping can deal with it. Same surface, same behaviour under a light,
 * without the static.
 */
const carpetNormal = makeNoiseNormalMap(512, 1.0, seedFrom('carpet.pile'), 3);
// Mineral fibre: softer, fissured. Already band-limited; it is on the ceiling,
// which is the one surface never seen at a grazing angle.
const ceilingNormal = makeNoiseNormalMap(256, 1.1, seedFrom('ceiling.fissure'), 3);
// Power-floated concrete: broad, shallow undulation from the trowel, plus the
// fine aggregate pitting that catches a raking sun and is the entire reason a
// deck slab does not read as grey card. Smoothed harder than it was for the
// same reason the carpet is — the deck is the longest grazing view in the game.
const concreteNormal = makeNoiseNormalMap(512, 1.2, seedFrom('deck.float'), 3);
// The box primitive gives every face UVs from 0 to 1 regardless of how big the
// face is, so a single tile of noise was being stretched across twenty-one
// metres of deck and reading as swell on water. Repeating brings the grain back
// to something around a metre, which is roughly the scale a power-floated slab
// actually undulates at.
concreteNormal.repeat.set(24, 24);

const withNormal = (spec: SurfaceSpec, map: THREE.Texture, scale: number, over = {}) => {
  const mat = standard(spec, over);
  mat.normalMap = map;
  mat.normalScale = new THREE.Vector2(scale, scale);
  return mat;
};

const emissive = (spec: SurfaceSpec, color: number, strength: number) =>
  new THREE.MeshStandardMaterial({
    color: asColor(spec),
    emissive: new THREE.Color(color),
    emissiveIntensity: strength,
    roughness: spec.roughness,
  });

/** An indicator LED: unlit body colour is irrelevant, the emission is the prop. */
const led = (color: number) =>
  new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    emissive: new THREE.Color(color),
    emissiveIntensity: 2.6,
    roughness: 0.4,
  });

export const MAT = {
  // -- the five --------------------------------------------------------------
  // Restrained: at full strength the pile reads as coarse gravel rather than a
  // cut loop, because the grain is right but the relief is far too deep.
  carpet: withNormal(SURFACES.carpet, carpetNormal, 0.4),
  carpetRun: withNormal(SURFACES.carpetRun, carpetNormal, 0.4),
  carpetBoard: withNormal(TINTS.carpetBoard, carpetNormal, 0.4),
  carpetTrim: withNormal(TINTS.darkCarpetTrim, carpetNormal, 0.4),
  wall: standard(SURFACES.wall),
  melamine: standard(SURFACES.melamine),
  metal: standard(SURFACES.metal),
  /**
   * Cast iron, for the things lying in a floor rather than fixed to a wall.
   *
   * `darkMetal` is a graphite powder coat and it is a *cool* grey — right on a
   * balustrade or a door, and wrong the moment it is laid flat in warm concrete
   * with the sun across it, where the hue difference stops reading as metal and
   * starts reading as a painted blue line. That is exactly what the deck's
   * drainage channel had become: a 33 m blue stripe straight down the racing
   * line, which is the second time this project has had to answer for the same
   * material lying on the same kind of floor. See the note in `garage.ts`.
   *
   * A drain grating is unpainted cast iron. It rusts, it fills with grit, and it
   * ends up the colour of the concrete it sits in but darker — which is what
   * stops it competing with the paint that is *meant* to be read.
   *
   * ---- what this colour can and cannot control ----------------------------
   *
   * Almost none of it reaches the screen, and the part that does is the *hue*.
   *
   * `main.ts` runs `repaintBuilding()` — which paints by name — and then
   * `repaintObject(scene)` over the whole graph, which paints *without* a name
   * and so puts every material it finds through the generic regrade a second
   * time, overwriting the named pass. That is why `darkMetal` is specified as
   * 0x2f3945 in the clay palette and arrives on screen as 0x4b6c8d, and why
   * naming this material there did nothing at all.
   *
   * The regrade works in linear space and floors lightness at `0.14 + l × 0.66`,
   * so every dark input converges on the same mid value — authoring this at
   * 0x201b16 made it *lighter* than 0x4a423a had been, which is the opposite of
   * the intent and worth recording so nobody tries it a third time. Value is not
   * available here.
   *
   * Hue and saturation are. `s' = s × 1.5 + 0.05` means a near-neutral stays
   * near-neutral and anything with a cast gets that cast amplified — which is
   * the whole story of how a graphite powder coat became a blue stripe. So this
   * is authored as a *warm near-neutral*: the boost leaves it a dirty grey with
   * a trace of rust in it, which at this lightness is what a grating full of
   * five years of grit actually looks like.
   */
  castIron: standard({ referent: 'cast-iron channel grating, unpainted', color: 0x565250, roughness: 0.85, metalness: 0.1 }),

  // -- tints and variants ----------------------------------------------------
  darkMetal: standard({ referent: 'RAL 7024 graphite powder coat', color: 0x54565a, roughness: 0.5, metalness: 0.45 }),
  stainless: standard(TINTS.stainless),
  ceilingTile: withNormal(TINTS.ceilingTile, ceilingNormal, 0.45),
  paintedSoffit: withNormal(TINTS.paintedSoffit, ceilingNormal, 0.3),
  blind: standard(TINTS.blind),
  linoleum: standard(TINTS.linoleum),
  quarryTile: standard(TINTS.quarryTile),
  wallTile: standard(TINTS.wallTile),
  antistatic: standard(TINTS.antistatic),
  graniteLight: standard(TINTS.graniteLight),
  graniteDark: standard(TINTS.graniteDark),
  graniteBand: standard(TINTS.graniteBand),
  entranceMatting: standard(TINTS.entranceMatting),
  concrete: withNormal(TINTS.concrete, concreteNormal, 0.35),
  concreteFair: withNormal(TINTS.concreteFair, concreteNormal, 0.18),
  trafficWhite: standard(TINTS.trafficWhite),
  trafficYellow: standard(TINTS.trafficYellow),
  trafficBlue: standard(TINTS.trafficBlue),
  hazardRed: standard(TINTS.hazardRed),
  leather: standard(TINTS.leather),
  plastic: standard(TINTS.yellowedPlastic),
  crtGlass: standard(TINTS.crtGlass, { roughness: 0.18 }),
  patchCable: standard(TINTS.patchCable),
  rubber: standard({ referent: 'EPDM, castor tyre and door seal', color: 0x2a2a28, roughness: 0.85, metalness: 0 }),

  // -- glass -----------------------------------------------------------------
  /**
   * Curtain-wall glazing. Barely there — it exists to bend the highlight and to
   * be something the mullions are set into, not to be looked at.
   *
   * Front faces only, and that is the one place in this file where a side is
   * worth a paragraph.
   *
   * Front faces only. Every pane in the building is drawn as a closed box — a
   * 10 mm slab of glass with six faces and outward normals — so its back faces
   * are geometry the camera can never be on the correct side of, and rendering
   * them was drawing every window in the floorplate twice. Transparent, so
   * neither pass writes depth and both pay full fragment cost; measured at
   * three milliseconds of a seventeen-millisecond scene at native resolution,
   * for an image that is pixel-for-pixel identical.
   */
  glass: new THREE.MeshStandardMaterial({
    color: asColor({ referent: 'float glass, curtain wall', color: 0xdce6ec, roughness: 0.05, metalness: 0 }),
    roughness: 0.05,
    metalness: 0,
    transparent: true,
    opacity: 0.18,
  }),
  /** Systemtrennwand glazing. Denser than the facade's, because you are seeing
   *  a room through it rather than the sky, and because it is always filthy. */
  partitionGlass: new THREE.MeshStandardMaterial({
    color: asColor(TINTS.partitionGlass),
    roughness: 0.06,
    metalness: 0,
    transparent: true,
    opacity: 0.24,
  }),

  // -- light emitters --------------------------------------------------------
  /** Prismatic diffuser behind the louvres, lit. */
  lamp: emissive(TINTS.ceilingTile, FLUORESCENT.color, 1.5),
  /**
   * The hall's lamps: its downlight cans and the slot of its Lichtvoute.
   *
   * Warm rather than green-white, for the reason `RECEPTION` exists, and hotter
   * than the tube because of what it is standing next to. The cove is a 100 mm
   * slot seen edge-on from a chair — it is a *line* in the frame, and a line has
   * to be well above its background to read as a light source rather than as a
   * shadow gap. At the tube's 1.5 it was neither.
   */
  receptionLamp: emissive(TINTS.ceilingTile, RECEPTION.color, 2.4),
  /**
   * The coffer the cove washes, which is a material rather than a light.
   *
   * A Lichtvoute works by throwing a gradient up a lid, and the gradient is the
   * whole effect — it is why anybody pays for one. There is no bounce light in
   * this renderer, so an emissive slot glows and lights nothing, and the lid
   * above it stayed exactly as dark as the lid anywhere else: a dead brown field
   * across the top of every shot of the room, with a bright line under it that
   * plainly was not doing anything.
   *
   * Paying for it in lights was the obvious fix and the wrong one. A real source
   * up there is a fourth competitor for the one area-light slot the pool has —
   * see SLOTS in render/lights.ts — so it would take the slot off the glazing
   * half the time and off nothing useful the rest. This is the honest cheat: the
   * plaster itself carries a low warm emission, so the coffer sits a stop above
   * the rim it is lifted out of and reads as washed. It costs nothing per frame
   * and it is the one surface in the building allowed to lie about why it is
   * bright.
   */
  coveWash: emissive(SURFACES.wall, RECEPTION.color, 0.42),
  /**
   * And the flat rim the coffer is lifted out of, at a third of it.
   *
   * The coffer alone was not enough, and the reason is where you stand. The
   * rim is a 3 m band running round the whole room, so it is what fills the top
   * of the frame everywhere except the exact middle — by a column, along the
   * lobby wall, coming in off the entrance mat. Wash only the coffer and the
   * lid is lit in the one place nobody drives and dead everywhere they do.
   *
   * A third rather than the same, because a Lichtvoute throws most of its light
   * on the lid directly above it and only spill on the level below. Equal
   * emission on both would read as a ceiling that is uniformly glowing, which is
   * a lightbox, not a cove — the step between the two levels is the effect.
   */
  coveWashLow: emissive(SURFACES.wall, RECEPTION.color, 0.15),
  /** Bare 6500 K tube in an open batten, in the EDV room only. */
  coldLamp: emissive(TINTS.ceilingTile, COLD_FLUORESCENT.color, 1.9),
  /** Sodium mast head on the deck, still warming up. */
  sodiumLamp: emissive(TINTS.blind, SODIUM.color, 1.1),
  /** Green running-man sign. Emissive because it is, always, everywhere. */
  exitSign: emissive(
    { referent: 'ISO 7010 E002 sign face', color: 0x0f8a4a, roughness: 0.5, metalness: 0 },
    0x14b060,
    1.4,
  ),
  led: {
    link: led(INDICATOR.link),
    activity: led(INDICATOR.activity),
    fault: led(INDICATOR.fault),
    power: led(INDICATOR.power),
  },

  // -- signage ---------------------------------------------------------------
  /** Laminated Flucht- und Rettungsplan. Placeholder white until the plan art
   *  exists — the same artwork will drive the level-select screen. */
  escapePlan: standard({ referent: 'ISO 23601 escape plan, laminated A3', color: 0xf4f2ea, roughness: 0.25, metalness: 0 }),
  /** Türschild face: anodised carrier with a printed insert. */
  signFace: standard({ referent: 'anodised aluminium sign carrier', color: 0xcfd0cc, roughness: 0.35, metalness: 0.6 }),
  /** Extinguisher body. The one saturated red the building is allowed. */
  extinguisher: standard({ referent: 'DIN EN 3 extinguisher, RAL 3000', color: 0x9d1f1f, roughness: 0.45, metalness: 0.3 }),
  paper: standard({ referent: 'A4 80 gsm', color: 0xf2efe6, roughness: 0.85, metalness: 0 }),
} as const;
