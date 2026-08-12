/**
 * The clay-bold light rig, on the real building.
 *
 * The lab's version had it easy: a dollhouse with no ceiling, open to the sky,
 * one key and one rim and done. A real floorplate is an interior — it has a
 * slab over it, a core with no windows, and thirty-seven authored fittings that
 * are the only reason the middle of it is visible at all. So this rig has to do
 * two things the lab's did not.
 *
 * **It sits on top of the building's own lighting rather than replacing it.**
 * `office/*.ts` puts a source in every fitting and `render/lights.ts` flies a
 * fixed pool of them to wherever the player is; this rig adds a key, a rim and
 * a floor of ambient, and leaves that pool alone.
 *
 * That was not the first attempt. The first attempt harvested all fifty-three
 * authored sources out and stood in for the lot with one ambient — which is
 * what the lab's control does, and it is right *there*, because the lab's bench
 * is a dollhouse with no ceiling where the sky does the work. In a real
 * floorplate it fails, and it fails specifically in the windowless core: an
 * ambient has no direction, a matte clay material has no specular and no
 * texture, so a corridor lit only by ambient comes out as three fields of
 * unmodulated colour. The fittings are the only thing that shapes the middle of
 * this building, and a look that removes them is a look that only works
 * outdoors.
 *
 * So the lap keeps the shape the building was designed to have — bright at the
 * glazing, cool and flat through the core, bright again on the deck — and the
 * key and the rim are what make it golden hour instead of Tuesday.
 */

import * as THREE from 'three';

import { FLUORESCENT } from '../../office/palette';

/** See the note on `LUX` in the lab's voxelClassic — three's lights are physical. */
const LUX = Math.PI;

export type ClayLighting = {
  /** Follow the player. Both directional lights travel with the chair. */
  update(focus: THREE.Vector3): void;
  /**
   * Re-rig for the menu, where the subject is a face two metres from the lens.
   *
   * The lap's key is placed in the building's own terms — a low western sun —
   * and on the grid that puts it a few degrees off the turntable's camera axis.
   * Frontal is the one place a key must never be: it flattens everything it
   * lights and blows out whatever is palest, which on this cast is a white shirt
   * and a muzzle. So while the menu is up the same two lights are re-placed
   * against the *camera* rather than against the compass — key off to one side,
   * rim swung round behind the subject — and the room's fill comes up, because a
   * character-select screen is a portrait and the hall behind it is a backdrop.
   *
   * Nothing is created or destroyed here: it is the lap's rig, moved. A menu that
   * adds lights pays for it with a shader recompile on the frame it opens, which
   * is the frame the player is looking hardest at.
   */
  portrait(camera: THREE.Camera, focus: THREE.Vector3): void;
  dispose(): void;
};

/**
 * The two balances, in one place because the only interesting thing about either
 * is the difference between them.
 *
 * Driving: hard key, hard rim, a floor of fill, and a room that is allowed to go
 * dark where the building does not light it. That is the look, and it is built
 * for movement — you are never looking at one surface for longer than a second.
 *
 * Menu: the same lights, softer and off-axis, with twice the fill. A still frame
 * with a face in the middle of it wants the opposite of a driving rig: less
 * contrast on the subject, more light in the room behind, and enough rim to hold
 * a pale head off a pale window.
 */
const RACE = { key: 1.7, rim: 1.35, fittings: 0.09, bounce: 0.18, lamp: 0, env: 0.45 } as const;
/*
 * The menu's balance, tuned against the screen rather than reasoned about.
 *
 * ---- and why the menu's fill is *lower* than the race's -------------------
 *
 * This went the wrong way twice before it went the right way. The instinct with a
 * portrait is to lift the fill so nothing is lost in shadow, and four passes of
 * doing that — fittings up to 0.26, bounce to 0.58, the environment left at 0.45 —
 * produced exactly what it deserved: a white t-shirt with no shadow anywhere on it,
 * a face with no modelling, and a soft grey haze over the whole frame. Milky.
 *
 * The fix is the opposite of the instinct. Ambient light of any kind — the fitting
 * ambient, the hemisphere, and above all the sky environment — is the milk, because
 * it arrives from every direction at once and so cannot make a shadow. A portrait is
 * made of one strong light and the dark next to it. So on the turntable all three go
 * *down*, well below the race's, and the light that is left is directional: a warm
 * key that casts, a spot 2.6 m out for falloff, and a cold rim behind the head.
 *
 * The environment is the biggest single lever and it is not a light at all, which is
 * why it took so long to find: `scene.environmentIntensity` is a 45% sky-coloured
 * lift on every surface in the building, and dropping it to 17% for the menu did more
 * for the shirt than three passes of tuning the lamp.
 */
const SHOW = { key: 1.15, rim: 1.5, fittings: 0.07, bounce: 0.16, lamp: 24, env: 0.17 } as const;

export function createClayLighting(scene: THREE.Scene): ClayLighting {
  // The sky lift belongs to the balance, not to the scene setup: it is the single
  // largest source of directionless light in the game, so whichever rig is up has
  // to own it. `main.ts` sets the opening value; from the first frame this does.

  /**
   * The key. Low, warm, hard-edged.
   *
   * 26° of elevation — the sun the building's own `SUN` describes, which is a
   * low western one through the glazing, so this is not an invention. What is
   * an invention is that it follows the player through a building with a roof
   * on it, which no real sun does. It is a game.
   */
  const key = new THREE.DirectionalLight(0xffb877, RACE.key * LUX);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 80;
  const half = 16;
  key.shadow.camera.left = -half;
  key.shadow.camera.right = half;
  key.shadow.camera.top = half;
  key.shadow.camera.bottom = -half;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  key.shadow.radius = 1.5;
  scene.add(key);
  scene.add(key.target);

  /**
   * The rim, and the reason the look works.
   *
   * Cold, strong, from behind and above the chair, and it travels with it — a
   * fixed rim is only a rim from one heading, and this is a lap. No shadow:
   * that is a cheat and it is meant to be one. A rim that occludes stops being
   * a rim the moment the player drives behind a partition, which on this
   * floorplate is most of the time.
   */
  const rim = new THREE.DirectionalLight(0x9ccfff, RACE.rim * LUX);
  scene.add(rim);
  scene.add(rim.target);

  /**
   * A floor of tube light, as one number — and only a floor.
   *
   * This started as the whole answer: harvest the building's fittings out and
   * stand in for all of them with one ambient. It lit the core and it lit it
   * *flat*, which is the one thing a matte material cannot survive. With no
   * texture and no specular there is nothing but shading, and an ambient has
   * none — a windowless corridor came out as three fields of unmodulated
   * colour.
   *
   * So the fittings go back in, through the game's own travelling pool, and
   * this drops to a floor: enough that nothing in the building is ever black,
   * low enough that the ceiling grid is what shapes the core and the key is
   * what shapes the perimeter.
   */
  const fittings = new THREE.AmbientLight(FLUORESCENT.color, RACE.fittings * LUX);
  scene.add(fittings);

  /** Sky above, floor bounce below. Keeps a shadow coloured instead of black. */
  const bounce = new THREE.HemisphereLight(0x8fb4d6, 0x6b5030, RACE.bounce * LUX);
  scene.add(bounce);

  /**
   * The menu's key, and the only light in the game that is not a sun.
   *
   * A directional light cannot make a good portrait. It arrives everywhere at the
   * same angle and the same strength, so a face lit by one is evenly lit end to
   * end, with no falloff down the body, no pool on the floor, and no darkness for
   * the subject to stand against — which is exactly what the turntable looked
   * like: a well-composed shot of a figure on a flat grey card.
   *
   * So the menu gets a spot: close, wide, soft-edged, aimed at the sitter's chest.
   * Everything a portrait needs comes out of the inverse-square falloff for free —
   * the shoulders read brighter than the knees, the floor carries a pool that says
   * where the subject is standing, and the room three metres behind it drops away
   * on its own instead of having to be dimmed by hand.
   *
   * It lives in the scene from the start, at zero intensity, rather than being
   * added when the menu opens. Adding a light to a scene changes every material's
   * shader permutation, and paying for that recompile on the frame the player
   * opens the menu is how you get a quarter-second freeze at the one moment the
   * game is asking to be looked at.
   */
  const lamp = new THREE.SpotLight(0xffe6c2, RACE.lamp, 14, 0.62, 0.9, 1.35);
  scene.add(lamp);
  scene.add(lamp.target);

  /** Where the lens is, in plan, as an angle about the subject. */
  const eye = new THREE.Vector3();

  return {
    update(focus) {
      key.intensity = RACE.key * LUX;
      rim.intensity = RACE.rim * LUX;
      fittings.intensity = RACE.fittings * LUX;
      bounce.intensity = RACE.bounce * LUX;
      lamp.intensity = RACE.lamp;
      scene.environmentIntensity = RACE.env;

      key.target.position.copy(focus);
      key.position.set(focus.x - 11, focus.y + 7.8, focus.z + 8);
      key.target.updateMatrixWorld();

      rim.target.position.copy(focus);
      rim.position.set(focus.x + 5, focus.y + 5.5, focus.z - 8);
      rim.target.updateMatrixWorld();
    },

    portrait(camera, focus) {
      key.intensity = SHOW.key * LUX;
      rim.intensity = SHOW.rim * LUX;
      fittings.intensity = SHOW.fittings * LUX;
      bounce.intensity = SHOW.bounce * LUX;
      lamp.intensity = SHOW.lamp;
      scene.environmentIntensity = SHOW.env;

      camera.getWorldPosition(eye);
      // The camera's bearing from the subject. Everything below is an angle off
      // this, so the rig holds its shape however far the turntable has come round.
      const view = Math.atan2(eye.x - focus.x, eye.z - focus.z);

      // Key: 40° off the lens and steep enough to put the shadow of the head on
      // the shoulder rather than on the wall behind. Camera-left, which is the
      // side the hall's own sun is on, so the two agree instead of crossing.
      const kx = view + 0.7;
      key.target.position.copy(focus);
      key.position.set(focus.x + Math.sin(kx) * 9, focus.y + 7, focus.z + Math.cos(kx) * 9);
      key.target.updateMatrixWorld();

      // Rim: behind the subject and 25° round to the other side, high. This is
      // the light that does the work — the glazing behind the grid is the
      // brightest thing in the room, and a cold edge along the head and the
      // shoulder is the only thing that keeps a pale figure off it.
      const rx = view + Math.PI - 0.45;
      rim.target.position.copy(focus);
      rim.position.set(focus.x + Math.sin(rx) * 8, focus.y + 3.6, focus.z + Math.cos(rx) * 8);
      rim.target.updateMatrixWorld();

      /*
       * And the lamp, close in on the key's side and aimed at the chest.
       *
       * 2.6 m out and 2.1 m up is a 39° lamp — high enough to put the eye sockets
       * in shadow the way a face is normally lit, low enough not to lose the eyes
       * altogether. Aimed 950 mm up rather than at the chair's origin on the floor:
       * a spot pointed at somebody's castors puts its hot spot on the carpet and
       * its edge across their throat.
       */
      const lx = view + 0.62;
      lamp.position.set(focus.x + Math.sin(lx) * 2.6, focus.y + 2.1, focus.z + Math.cos(lx) * 2.6);
      lamp.target.position.set(focus.x, focus.y + 0.95, focus.z);
      lamp.target.updateMatrixWorld();
    },
    dispose() {
      key.dispose();
      rim.dispose();
      lamp.dispose();
      fittings.dispose();
      bounce.dispose();
    },
  };
}
