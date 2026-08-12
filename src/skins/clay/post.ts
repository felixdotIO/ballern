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

  // Threshold up and strength down from the lab's numbers. The hall has forty
  // metres of sunlit granite in it — far more bright area than the bench ever
  // had — and at 0.38/0.86 the floor alone was blooming across the whole frame.
  const bloom = new UnrealBloomPass(new THREE.Vector2(bw * 0.5, bh * 0.5), 0.26, 0.7, 0.9);
  composer.addPass(bloom);
  /** What the race runs at, so the menu can put it back. */
  const RACE_BLOOM = { strength: bloom.strength, threshold: bloom.threshold };
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));

  const uniforms = (bokeh.materialBokeh as THREE.ShaderMaterial).uniforms;

  return {
    render: () => composer.render(),

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
