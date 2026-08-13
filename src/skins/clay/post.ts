/**
 * The clay-bold post chain, sized for a real floorplate.
 *
 * The same five passes the lab settled on — GTAO, a shallow-but-not-silly
 * bokeh, a hot bloom, output, and a grade — with one change forced by the
 * building: this is an interior, and an interior has a great deal more in the
 * near field than a dollhouse does. So the focus tracking matters more, not
 * less: at 3.6 m of boom in a 3 m corridor there is always a wall about to pass
 * through the plane of focus, and a fixed focus distance makes that read as the
 * image breaking rather than as a camera.
 *
 * Order is deliberate: AO before DOF, because occlusion belongs to the scene
 * and should be blurred along with it; bloom after DOF, because a highlight
 * that is out of focus should bloom soft; and the grade dead last, in LDR,
 * because a vignette applied in linear light darkens by a different amount at
 * every exposure and the entire point of it is to be a constant.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.38 },
    contrast: { value: 1.1 },
    saturation: { value: 1.14 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float contrast;
    uniform float saturation;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec3 c = texel.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      float d = length(vUv - 0.5) * 1.42;
      c *= 1.0 - smoothstep(0.42, 1.05, d) * vignette;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), texel.a);
    }
  `,
};

export type ClayPost = {
  render(): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Full bloom for the race, a fraction of it for the menu. See the note below. */
  glow(on: boolean): void;
  /** Open the lens and close the frame in, for the character select. */
  portrait(on: boolean): void;
  /**
   * How much of the chain to run: 2 everything, 1 without the expensive two, 0 grade only.
   *
   * ---- why this had to become a dial ---------------------------------------
   *
   * Measured, on one frame: the scene is **979 draw calls and 4.2 M triangles in
   * 2.3 ms**, the whole simulation is 1.55 ms, and this chain is **17.6 ms**. That
   * is 89% of the frame going through six full-screen passes, and it is the entire
   * reason the game is heavy — nothing to do with the building, the field or the
   * items.
   *
   * What made it unfixable from outside is that `render/quality.ts` only ever
   * moved the *pixel ratio*. On a machine that cannot hold 60 it dropped the
   * buffer a rung at a time and then ran out of rungs, still running ambient
   * occlusion, a full-resolution depth-of-field blur, five mip levels of bloom and
   * two more passes on top. Scaling the resolution of an already-too-long chain is
   * the one adjustment that cannot save it.
   *
   * So the tiers cut passes rather than pixels, in the order of what costs most
   * against what is missed least:
   *
   *   2  everything, as authored.
   *   1  no GTAO and no depth of field. Those two are the expensive pair, and both
   *      are *depth* effects — what goes is contact shading and a soft background,
   *      neither of which a driver reads at six metres a second. Bloom stays,
   *      because the hot golden-hour light is the look and losing it is losing the
   *      art direction rather than a refinement.
   *   0  grade only. The vignette and the curve, which are what keep the palette
   *      the palette. Everything else off.
   */
  setDetail(tier: 0 | 1 | 2): void;
  /** Feed it the chair each frame. `focus` is the point to hold sharp. */
  focusOn(camera: THREE.Camera, focus: THREE.Vector3): void;
  dispose(): void;
};

export function createClayPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  pixelRatio: number,
): ClayPost {
  const bw = Math.max(1, Math.round(width * pixelRatio));
  const bh = Math.max(1, Math.round(height * pixelRatio));

  // Multisampled composer target rather than a multisampled context, and rather
  // than the FXAA the game uses. The bokeh pass reads depth, so it has to run
  // over a real render rather than a resolved LDR image — which means the edges
  // have to survive into the chain.
  const target = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new GTAOPass(scene, camera, Math.round(bw * 0.5), Math.round(bh * 0.5));
  gtao.output = GTAOPass.OUTPUT.Default;
  // Wider than the lab's, narrower than the game's. The contacts that matter
  // here are castor-to-carpet and desk-leg-to-floor; a metre of radius smears
  // grey into every reveal in the building.
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.1, thickness: 0.5, scale: 1.4 });
  composer.addPass(gtao);

  // Shallow enough to say "close to something small", deep enough to drive.
  // This is the number the brief was actually about: at the lab's original
  // aperture the far wall of a room was unreadable, which is fine for a still
  // and useless at six metres a second.
  const bokeh = new BokehPass(scene, camera, { focus: 6, aperture: 0.00035, maxblur: 0.007 });
  composer.addPass(bokeh);
  /** What the race drives at, so the portrait can put it back. */
  const RACE_LENS = { aperture: 0.00035, maxblur: 0.007 };

  // Threshold up and strength down from the lab's numbers. The hall has forty
  // metres of sunlit granite in it — far more bright area than the bench ever
  // had — and at 0.38/0.86 the floor alone was blooming across the whole frame.
  const bloom = new UnrealBloomPass(new THREE.Vector2(bw * 0.5, bh * 0.5), 0.26, 0.7, 0.9);
  composer.addPass(bloom);
  /** What the race runs at, so the menu can put it back. */
  const RACE_BLOOM = { strength: bloom.strength, threshold: bloom.threshold };
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  /** What the race grades at, for the same reason. */
  const RACE_VIGNETTE = grade.uniforms['vignette']!.value as number;

  const uniforms = (bokeh.materialBokeh as THREE.ShaderMaterial).uniforms;

  return {
    render: () => composer.render(),

    setDetail(tier) {
      // `enabled` is the composer's own switch and costs nothing when false: a
      // disabled pass is skipped entirely rather than run and discarded.
      gtao.enabled = tier >= 2;
      bokeh.enabled = tier >= 2;
      bloom.enabled = tier >= 1;
    },

    /**
     * Take the glow off, for the turntable.
     *
     * Bloom is tuned for a moving frame full of sunlit granite, where it is most of
     * what makes the light feel hot. Hold the same frame still with a figure in a
     * white t-shirt two metres from the lens and it is no longer a look, it is a
     * haze: the shirt sits above the threshold at any exposure that lights the room,
     * so it blooms into one soft shape with a halo standing off it and takes the
     * face with it. Milky is exactly the right word for it.
     *
     * So the menu runs a third of the strength at a higher threshold — enough that
     * the glazing and the amber capsule still glow, not enough to reach a shirt.
     */
    glow(on) {
      bloom.strength = on ? RACE_BLOOM.strength : 0.09;
      bloom.threshold = on ? RACE_BLOOM.threshold : 0.98;
    },

    /**
     * The character select's lens, and it is a different lens.
     *
     * The race is shot on something close to a pinhole — f-stops are for photographs,
     * and a driver who cannot read the corner two rooms ahead because it is pretty is
     * a driver being cheated. Hold that same frame still on one seated figure and the
     * setting is simply wrong: the office behind him is rendered as sharply as he is,
     * so a glazed wall of mullions, a sofa and half a kitchen all compete with the
     * subject at the same acuity, and the eye has no instruction about where to land.
     * It is the single biggest reason the shot read as *a screenshot with a menu over
     * it* rather than as a portrait.
     *
     * So the aperture opens by a factor of three and the blur ceiling doubles. The
     * subject is on the focal plane — `focusOn` puts it at the sitter's chest — and
     * everything more than about a metre behind him goes soft. Nothing is hidden: the
     * room is still there, still lit, still recognisably the office he is about to
     * race through. It is just no longer arguing with him.
     *
     * The vignette closes at the same time, from 38% to 55%. A still frame can carry
     * far more of it than a moving one — in motion a heavy vignette reads as a dirty
     * lens, on a held portrait it reads as the light falling off — and it does the one
     * thing the depth of field cannot, which is to darken the *corners*, where this
     * screen keeps finding a sunlit worktop.
     */
    /*
     * The portrait lens, pulled most of the way back toward the race's.
     *
     * It was f/0.0011 with a 0.016 blur ceiling — three times the aperture the
     * race drives on and more than twice the ceiling — and at that setting the
     * office behind the driver is not *soft*, it is gone: the desks, the ceiling
     * grid and the whole depth of the room dissolve into coloured smears a metre
     * behind his shoulder. Which loses the thing the shot was moved into the
     * Grossraum to get. The joke of this game is the room, and a room rendered as
     * bokeh is a room nobody can tell is an office.
     *
     * 0.0005 and 0.0085 is roughly half a stop over the race rather than three,
     * and it does the job the depth of field was actually brought in for: the
     * subject still sits clearly in front of the background, the background still
     * stops competing with him for acuity, and it is still recognisably the floor
     * he is about to race through.
     */
    portrait(on) {
      uniforms['aperture']!.value = on ? 0.0005 : RACE_LENS.aperture;
      uniforms['maxblur']!.value = on ? 0.0085 : RACE_LENS.maxblur;
      grade.uniforms['vignette']!.value = on ? 0.55 : RACE_VIGNETTE;
    },
    setSize(w, h, ratio) {
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
    },
    focusOn(cam, focus) {
      uniforms['focus']!.value = cam.position.distanceTo(focus);
    },
    dispose() {
      composer.dispose();
      target.dispose();
    },
  };
}
