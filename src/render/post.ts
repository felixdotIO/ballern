/**
 * Post stack.
 *
 * Roughly a third of what makes a shipped real-time frame look shipped happens
 * after the scene is drawn. In order:
 *
 *  - GTAO      contact darkening. Without it nothing sits in the room; every
 *              object floats a few millimetres above whatever it stands on.
 *  - Bloom     the luminaires and the blown glazing bleed. Tight and low —
 *              this is an office under fluorescent light, not a dream sequence.
 *  - Output    tone mapping and colour space, applied once, at the end.
 *
 * Antialiasing has now been all three of the obvious things, and the measurement
 * decided it, not taste:
 *
 *  - SMAA, three full-screen passes at native resolution: ~12 ms.
 *  - MSAA 4× on the composer's targets: 9.3 ms of a 23 ms frame at 1920 × 1080.
 *    Multisampling is nearly free on Apple's tile GPU when a pass renders once
 *    and resolves once — and a post chain is the opposite of that. Every
 *    full-screen pass writes four samples per pixel into a half-float target and
 *    forces a resolve on the way out, so the cost is paid four or five times
 *    over for edges that only ever existed in the first pass.
 *  - FXAA, one pass in LDR after tone mapping: under a millisecond.
 *
 * FXAA is the least accurate of the three and it is the right one, because the
 * nine milliseconds it hands back buy the buffer resolution back up to native —
 * and a sharper image with softer edges beats a soft image with perfect ones
 * every time. Antialiasing exists to hide the pixel grid; not having to is
 * better than hiding it well.
 *
 * Deliberately absent: chromatic aberration, lens dirt, heavy vignette. They
 * read as a filter over the image rather than as a property of the room.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

/**
 * Ambient occlusion runs at half the linear resolution of the frame.
 *
 * AO is a low-frequency signal — it is the dark in the corner where the skirting
 * meets the floor, and that corner is several pixels wide at any resolution
 * worth playing at. Computing it per output pixel is paying full price for
 * detail the effect does not carry. Half res is a quarter of the fragments and
 * the difference is not visible at speed; a quarter res starts to crawl along
 * the mullions, which is visible immediately.
 */
const AO_SCALE = 0.5;

/**
 * And bloom runs at half too, for a stronger version of the same argument.
 *
 * Bloom is light spilling several hundred pixels sideways. It has no high
 * frequencies in it at all — that is the definition of the effect — so running
 * its threshold pass and the first two levels of its blur chain at full
 * resolution is computing a blur at a detail level the blur is about to throw
 * away. Half res is a quarter of that work and the difference is not visible on
 * a still frame, let alone a moving one.
 */
const BLOOM_SCALE = 0.5;

export type Post = {
  render(): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  /** Exposed for tuning and for verifying each pass in isolation. */
  passes: { gtao: GTAOPass; bloom: UnrealBloomPass };
  composer: EffectComposer;
};

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  pixelRatio: number,
): Post {
  const bw = Math.max(1, Math.round(width * pixelRatio));
  const bh = Math.max(1, Math.round(height * pixelRatio));

  /**
   * The composer's own target.
   *
   * Half float rather than byte because the scene is rendered in linear light
   * and tone mapped at the very end: an 8-bit intermediate would band every
   * gradient the sun puts across a wall before OutputPass ever saw it. No
   * samples — see the note on antialiasing above.
   */
  const target = new THREE.WebGLRenderTarget(bw, bh, {
    type: THREE.HalfFloatType,
  });
  target.texture.name = 'composer.rt';

  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));

  const gtao = new GTAOPass(scene, camera, Math.round(bw * AO_SCALE), Math.round(bh * AO_SCALE));
  gtao.output = GTAOPass.OUTPUT.Default;
  // Radius is in metres. Just under a metre catches the junction of skirting to
  // floor, castor to carpet and desk to partition without smearing a grey haze
  // across whole walls.
  gtao.updateGtaoMaterial({
    radius: 0.9,
    distanceExponent: 1.2,
    thickness: 1.0,
    scale: 1.8,
    // Twelve rather than twenty-four. The pass is at half res, so each tap
    // covers four output pixels, and the denoise step downstream is doing the
    // work the extra taps were being asked for.
    samples: 12,
    screenSpaceRadius: false,
  });
  composer.addPass(gtao);

  // Threshold sits just under the luminaire panels so only actual light sources
  // and the glazing bloom — never a pale wall.
  // Threshold raised at golden hour: with the glazing already near white, a low
  // threshold blooms the mullions away entirely and the facade loses its
  // architecture. Only genuine highlights should bleed.
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(Math.round(bw * BLOOM_SCALE), Math.round(bh * BLOOM_SCALE)),
    0.22,
    0.45,
    1.05,
  );
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  // After OutputPass, never before. FXAA works on perceptual differences between
  // neighbouring pixels, so it has to see the image the way the eye will — run
  // it on linear HDR and it finds edges in the highlights and nowhere else.
  const fxaa = new ShaderPass(FXAAShader);
  composer.addPass(fxaa);

  const sizeFxaa = (w: number, h: number) => {
    fxaa.material.uniforms.resolution!.value.set(1 / Math.max(1, w), 1 / Math.max(1, h));
  };
  sizeFxaa(bw, bh);

  return {
    render: () => composer.render(),
    setSize: (w, h, ratio) => {
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      const fw = Math.max(1, Math.round(w * ratio));
      const fh = Math.max(1, Math.round(h * ratio));
      gtao.setSize(Math.max(1, Math.round(fw * AO_SCALE)), Math.max(1, Math.round(fh * AO_SCALE)));
      bloom.setSize(Math.max(1, Math.round(fw * BLOOM_SCALE)), Math.max(1, Math.round(fh * BLOOM_SCALE)));
      sizeFxaa(fw, fh);
    },
    passes: { gtao, bloom },
    composer,
  };
}
