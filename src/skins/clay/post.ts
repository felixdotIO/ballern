/**
 * The clay-bold post chain, sized for a real floorplate.
 *
 * The same five effects the lab settled on — GTAO, a shallow-but-not-silly
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
 *
 * ---- why this is hand-rolled rather than an EffectComposer -----------------
 *
 * It was an `EffectComposer` with six passes on it, which is the obvious way to
 * write this and cost about three times what the picture is worth. Measured with
 * GPU timer queries at 2560 × 1440, everything below is the same image:
 *
 *  1. **The scene was being drawn three times a frame.** `RenderPass` draws it,
 *     `GTAOPass` draws it again through a normal material to build a G-buffer,
 *     and `BokehPass` draws it a *third* time through a depth material. Two of
 *     those exist only to recover depth — which the first pass already had and
 *     threw away. The building is 1565 draws and 5.9 M triangles, so that is two
 *     entire buildings a frame spent re-deriving a number.
 *
 *     Now the scene target carries a `DepthTexture` and both effects read it.
 *     GTAO reconstructs its normals from that depth (`NORMAL_VECTOR_TYPE 0`),
 *     which on a building made of chamfered boxes is exact, and the depth of
 *     field reads it directly instead of an RGBA-packed copy — which is more
 *     precision than it had, not less.
 *
 *  2. **And with it, the shadow maps six times a frame.** `renderer.render` re-
 *     renders every shadow map it finds, so three scene passes meant three passes
 *     over both 4096² maps and their 1103 casters. `shadowMap.autoUpdate` is off
 *     and `needsUpdate` is raised once per frame, immediately below.
 *
 *  3. **Every full-screen pass was writing into a 4× multisampled buffer.** The
 *     composer clones whatever target it is given for its ping-pong pair, so the
 *     multisampling that the *scene* pass needs was being paid by all five passes
 *     after it — which is pure loss, because a full-screen quad covers every
 *     sample of every pixel with the same value. Measured, one full-screen copy
 *     at this size: **0.12 ms into a plain buffer, 6.77 ms into a 4× one.** Fifty-
 *     six times, for nothing, five times a frame.
 *
 *     So multisampling stops at `sceneTarget`, which is the only pass with an
 *     edge in it, and the chain runs on two plain buffers.
 *
 *  4. **Output and grade were two passes doing one thing.** Tone map, transfer
 *     curve, then saturation, contrast and vignette — with a full-screen round
 *     trip between them, at half-float, where nothing is quantised. They are one
 *     shader now and the arithmetic is in the same order it always was.
 *
 * What none of that changes is a single number the look is made of. The GTAO
 * radius, the aperture, the blur ceiling, the bloom threshold and the vignette
 * are all exactly as they were.
 */

import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { BokehShader } from 'three/examples/jsm/shaders/BokehShader.js';

const FS_VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Straight through, and — when there is one — the occlusion multiplied in. */
const CombineShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tAo: { value: null as THREE.Texture | null },
  },
  vertexShader: FS_VERTEX,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform sampler2D tAo;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      #ifdef OCCLUDE
        texel.rgb *= texture2D(tAo, vUv).rgb;
      #endif
      gl_FragColor = texel;
    }
  `,
};

/**
 * Tone map, transfer curve, grade — one pass, in that order.
 *
 * This was `OutputPass` followed by a `ShaderPass`, and the order is the whole
 * reason the grade is written the way it is: saturation, contrast and vignette
 * are all applied to *display* values, after the curve, because a vignette
 * applied in linear light darkens by a different amount at every exposure and
 * the entire point of it is to be a constant. Folding the two together keeps
 * that order exactly and skips a full-screen round trip between them.
 *
 * The output half is the renderer's own two chunks rather than a hand-written
 * curve, which is what `OutputPass` is underneath and is the reason this stays
 * honest: `toneMapping` and `linearToOutputTexel` are compiled in from
 * `renderer.toneMapping` and `renderer.outputColorSpace`, so the exposure
 * `main.ts` moves a third of a stop for the menu still arrives, and changing the
 * tone map is still one line in `main.ts` rather than two.
 *
 * A render target never applies either of them — three switches tone mapping off
 * whenever the destination is not the canvas — which is why a chain like this
 * needs a finish at all.
 */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.38 },
    contrast: { value: 1.1 },
    saturation: { value: 1.14 },
  },
  vertexShader: FS_VERTEX,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float contrast;
    uniform float saturation;

    varying vec2 vUv;

    void main() {
      gl_FragColor = texture2D(tDiffuse, vUv);

      #include <tonemapping_fragment>
      #include <colorspace_fragment>

      // And the grade, in LDR, on the far side of the curve.
      vec3 c = gl_FragColor.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      float d = length(vUv - 0.5) * 1.42;
      c *= 1.0 - smoothstep(0.42, 1.05, d) * vignette;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), gl_FragColor.a);
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
   * Measured, on one frame as the chain was first written: the scene was **979
   * draw calls and 4.2 M triangles in 2.3 ms**, the whole simulation 1.55 ms, and
   * the chain **17.6 ms**. That is 89% of the frame going through six full-screen
   * passes, and it was the entire reason the game was heavy — nothing to do with
   * the building, the field or the items.
   *
   * Much of that turned out to be the composer rather than the effects, and the
   * note at the top of this file is what came off. The dial stays, because a
   * machine that cannot hold 60 with an honest chain still needs somewhere to go,
   * and `render/quality.ts` only ever moved the *pixel ratio* — which is the one
   * adjustment that cannot save an over-long chain.
   *
   * So the tiers cut effects rather than pixels, in the order of what costs most
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
  let bw = Math.max(1, Math.round(width * pixelRatio));
  let bh = Math.max(1, Math.round(height * pixelRatio));

  /*
   * The one buffer in the chain that is multisampled, and the one pass with an
   * edge in it.
   *
   * Multisampling rather than the FXAA the game uses, for the reason it always
   * was: the depth of field reads depth, so it has to run over a real render
   * rather than a resolved LDR image, which means the edges have to survive into
   * the chain. What is new is that the multisampling *stops here* — see point 3
   * at the top of the file.
   *
   * And it carries its own depth, which is what makes one scene pass enough for
   * three consumers. A multisampled target resolves both colour and depth on the
   * frame something reads them, so the ambient occlusion and the depth of field
   * both get the depth this pass already wrote instead of drawing the building
   * again to recover it.
   */
  const depth = new THREE.DepthTexture(bw, bh);
  depth.format = THREE.DepthFormat;
  depth.type = THREE.UnsignedIntType;
  depth.minFilter = THREE.NearestFilter;
  depth.magFilter = THREE.NearestFilter;

  const sceneTarget = new THREE.WebGLRenderTarget(bw, bh, {
    type: THREE.HalfFloatType,
    samples: 4,
    depthTexture: depth,
    stencilBuffer: false,
  });

  /** The ping-pong pair. Plain, and that is the point. */
  const rtA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });
  const rtB = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false });

  const quad = new FullScreenQuad();

  /*
   * The shadow maps, once a frame rather than once a scene pass.
   *
   * `renderer.render` re-renders every shadow-casting light it finds, every time
   * it is called, and nothing in three knows that two calls a frame are looking
   * at the same instant. With the G-buffer prepasses gone there is only one scene
   * pass left, so this is belt and braces — but it is cheap belt and braces
   * against a class of mistake that costs two 4096² maps and 1103 casters the
   * moment anybody adds a second render for any reason at all.
   */
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  // ---------------------------------------------------------------------------
  // Ambient occlusion
  // ---------------------------------------------------------------------------

  const gtao = new GTAOPass(scene, camera, Math.round(bw * 0.5), Math.round(bh * 0.5));
  // Off, because this chain does the blending itself: `GTAOPass`'s own `Default`
  // output is a full-screen copy followed by a full-screen multiply, and the copy
  // is a pass that exists only because the composer hands it a buffer it may not
  // write in place. The combine below is the multiply, and it is where the colour
  // was going to be copied to anyway.
  gtao.output = GTAOPass.OUTPUT.Off;
  /*
   * And it is handed the scene's depth rather than drawing its own.
   *
   * With a depth texture and no normal texture the pass stops rendering a
   * G-buffer entirely and reconstructs view normals from depth derivatives — nine
   * taps a pixel at half resolution, against a whole extra pass over the building
   * at 1565 draws. On forms that are flat planes meeting at chamfers, which is
   * every box in this building, the reconstruction is the same normal the mesh
   * would have handed over.
   */
  gtao.setGBuffer(depth, undefined);
  // Wired after construction rather than through the constructor's own
  // `parameters.depthTexture`, which cannot be used: `setGBuffer` ends by reading
  // `this.normalRenderTarget.depthTexture` unconditionally, and on the path that
  // takes an external depth texture that target was never created. So the pass is
  // built the ordinary way, told about the depth afterwards, and the G-buffer it
  // allocated on the way past is handed straight back.
  (gtao as unknown as { normalRenderTarget?: THREE.WebGLRenderTarget }).normalRenderTarget?.dispose();
  // Wider than the lab's, narrower than the game's. The contacts that matter
  // here are castor-to-carpet and desk-leg-to-floor; a metre of radius smears
  // grey into every reveal in the building.
  gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.1, thickness: 0.5, scale: 1.4 });

  const combine = new THREE.ShaderMaterial({
    defines: { OCCLUDE: '' },
    uniforms: THREE.UniformsUtils.clone(CombineShader.uniforms),
    vertexShader: CombineShader.vertexShader,
    fragmentShader: CombineShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  combine.uniforms['tDiffuse']!.value = sceneTarget.texture;
  combine.uniforms['tAo']!.value = gtao.gtaoMap;

  // ---------------------------------------------------------------------------
  // Depth of field
  // ---------------------------------------------------------------------------

  /*
   * `BokehPass`'s shader, without `BokehPass`.
   *
   * The pass is a scene re-render through a `MeshDepthMaterial` and then this
   * shader over the result; only the second half is worth anything here, because
   * the first half is recovering a depth buffer the scene pass already wrote. The
   * material is the stock 41-tap bokeh with `DEPTH_PACKING 0`, which is the
   * shader's own switch for reading a real depth texture rather than an RGBA-
   * packed one — the same blur off a more precise number.
   *
   * Shallow enough to say "close to something small", deep enough to drive. This
   * is the number the brief was actually about: at the lab's original aperture the
   * far wall of a room was unreadable, which is fine for a still and useless at
   * six metres a second.
   */
  const dof = new THREE.ShaderMaterial({
    defines: { DEPTH_PACKING: 0, PERSPECTIVE_CAMERA: 1 },
    uniforms: THREE.UniformsUtils.clone(BokehShader.uniforms),
    vertexShader: BokehShader.vertexShader,
    fragmentShader: BokehShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  const lens = dof.uniforms;
  lens['tDepth']!.value = depth;
  lens['focus']!.value = 6;
  lens['aperture']!.value = 0.00035;
  lens['maxblur']!.value = 0.007;
  lens['aspect']!.value = bw / bh;
  lens['nearClip']!.value = camera.near;
  lens['farClip']!.value = camera.far;
  /** What the race drives at, so the portrait can put it back. */
  const RACE_LENS = { aperture: 0.00035, maxblur: 0.007 };

  // ---------------------------------------------------------------------------
  // Bloom, and the finish
  // ---------------------------------------------------------------------------

  // Threshold up and strength down from the lab's numbers. The hall has forty
  // metres of sunlit granite in it — far more bright area than the bench ever
  // had — and at 0.38/0.86 the floor alone was blooming across the whole frame.
  const bloom = new UnrealBloomPass(new THREE.Vector2(bw * 0.5, bh * 0.5), 0.26, 0.7, 0.9);
  /** What the race runs at, so the menu can put it back. */
  const RACE_BLOOM = { strength: bloom.strength, threshold: bloom.threshold };

  const finish = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(FinishShader.uniforms),
    vertexShader: FinishShader.vertexShader,
    fragmentShader: FinishShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  /** What the race grades at, for the same reason. */
  const RACE_VIGNETTE = finish.uniforms['vignette']!.value as number;

  let detail: 0 | 1 | 2 = 2;

  /** Draw `material` over the whole of `to`, or over the canvas when it is null. */
  function pass(material: THREE.Material, to: THREE.WebGLRenderTarget | null): void {
    quad.material = material;
    renderer.setRenderTarget(to);
    quad.render(renderer);
  }

  return {
    render() {
      // The shadow maps are scheduled by the frame rather than here — see
      // `paintShadows` in main.ts — and whatever it asked for is spent by the
      // scene pass below, which is the only pass in the chain that draws the room.
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);

      if (detail === 0) {
        finish.uniforms['tDiffuse']!.value = sceneTarget.texture;
        pass(finish, null);
        return;
      }

      // Occlusion, off the depth the scene pass already wrote, and multiplied
      // into the colour on its way out of the multisampled buffer. Neither of
      // the two buffers handed over is read or written: with `output` off the
      // pass computes its map and touches nothing else.
      if (detail >= 2) gtao.render(renderer, sceneTarget, sceneTarget, 0, false);
      combine.uniforms['tDiffuse']!.value = sceneTarget.texture;
      pass(combine, rtA);

      // Then the lens. Bloom blends additively into whatever it is given, so the
      // depth of field's output is also the buffer bloom lands in.
      let lit = rtA;
      if (detail >= 2) {
        lens['tColor']!.value = rtA.texture;
        pass(dof, rtB);
        lit = rtB;
      }

      // In place: `UnrealBloomPass` blends its result additively over the buffer
      // it is handed to read, and never touches the write buffer at all.
      if (bloom.enabled) bloom.render(renderer, lit, lit, 0, false);

      finish.uniforms['tDiffuse']!.value = lit.texture;
      pass(finish, null);
    },

    setDetail(tier) {
      detail = tier;
      // The occlusion multiply is a define rather than a white texture, so a tier
      // without GTAO does not pay a fetch for a number it knows is one.
      const occlude = tier >= 2;
      if (occlude !== ('OCCLUDE' in combine.defines)) {
        if (occlude) combine.defines['OCCLUDE'] = '';
        else delete combine.defines['OCCLUDE'];
        combine.needsUpdate = true;
      }
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
     * The vignette closes at the same time, from 38% to 55%. A still frame can carry
     * far more of it than a moving one — in motion a heavy vignette reads as a dirty
     * lens, on a held portrait it reads as the light falling off — and it does the one
     * thing the depth of field cannot, which is to darken the *corners*, where this
     * screen keeps finding a sunlit worktop.
     *
     * 0.0005 and 0.0085 is roughly half a stop over the race rather than three, and
     * it does the job the depth of field was actually brought in for: the subject
     * still sits clearly in front of the background, the background still stops
     * competing with him for acuity, and it is still recognisably the floor he is
     * about to race through. The first pass at f/0.0011 with a 0.016 ceiling did not
     * make the office *soft*, it made it gone — and the joke of this game is the room.
     */
    portrait(on) {
      lens['aperture']!.value = on ? 0.0005 : RACE_LENS.aperture;
      lens['maxblur']!.value = on ? 0.0085 : RACE_LENS.maxblur;
      finish.uniforms['vignette']!.value = on ? 0.55 : RACE_VIGNETTE;
    },

    setSize(w, h, ratio) {
      bw = Math.max(1, Math.round(w * ratio));
      bh = Math.max(1, Math.round(h * ratio));
      sceneTarget.setSize(bw, bh);
      rtA.setSize(bw, bh);
      rtB.setSize(bw, bh);
      gtao.setSize(Math.round(bw * 0.5), Math.round(bh * 0.5));
      bloom.setSize(bw * 0.5, bh * 0.5);
      lens['aspect']!.value = bw / bh;
      // `setGBuffer` is what wires the material defines and the textures together,
      // and `GTAOPass.setSize` re-points nothing — but the depth texture object is
      // the same one, resized under it, so only the uniform needs re-seating.
      gtao.gtaoMaterial.uniforms['tDepth']!.value = depth;
      gtao.pdMaterial.uniforms['tDepth']!.value = depth;
      combine.uniforms['tAo']!.value = gtao.gtaoMap;
    },

    focusOn(cam, focus) {
      lens['focus']!.value = cam.position.distanceTo(focus);
      lens['nearClip']!.value = camera.near;
      lens['farClip']!.value = camera.far;
    },

    dispose() {
      sceneTarget.dispose();
      depth.dispose();
      rtA.dispose();
      rtB.dispose();
      gtao.dispose();
      bloom.dispose();
      combine.dispose();
      dof.dispose();
      finish.dispose();
      quad.dispose();
      renderer.shadowMap.autoUpdate = true;
    },
  };
}
