/**
 * Squeeze the Blender kit for the wire.
 *
 * The kit is authored in Blender and exported by `blender/export.py`, which
 * writes honest, uncompressed glTF: float32 positions, float32 normals, float32
 * skin weights, one primitive per material. That is the right thing for an
 * exporter to write and the wrong thing to serve. Measured on the shipped
 * `public/kit`, the seven characters and their chairs came to **26.6 MB, or
 * 13.7 MB gzipped** — and every byte of it is downloaded before the first frame,
 * because `loadKit()` is awaited at the top of `main.ts`.
 *
 * A driver is 74 k vertices at 44 bytes each and carries no textures at all.
 * Nothing about that needs full float precision: the characters are two metres
 * tall, so 14-bit positions land on a 0.12 mm grid, which is two orders of
 * magnitude finer than the chamfer on their own geometry.
 *
 * So this runs the exports through the standard three-step: weld duplicate
 * vertices, quantize the attributes, and pack the result with meshopt. Nothing
 * here is authored — delete `public/kit` and re-export from Blender and this
 * rebuilds it — and nothing changes what the game looks like. It is one command:
 *
 *     node tools/compress-kit.mjs
 *
 * The loader end is one line in `render/kit.ts`: `setMeshoptDecoder`. Three has
 * read `KHR_mesh_quantization` natively for years and needs nothing for it.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, quantize, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

const KIT = 'public/kit';

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  // The decoder as well as the encoder, so this can *read* its own output — which
  // is what the already-compressed check below depends on being able to do.
  'meshopt.decoder': MeshoptDecoder,
});

const files = readdirSync(KIT).filter((f) => f.endsWith('.glb'));
let before = 0;
let after = 0;

for (const file of files) {
  const path = join(KIT, file);
  const raw = statSync(path).size;
  const document = await io.read(path);

  /*
   * Never twice. Quantizing an already-quantized mesh is lossy a second time and
   * would walk the geometry off its own grid, and there is no version of this
   * script that should be unsafe to re-run.
   *
   * The uncompressed exports are not kept beside these — that would double the
   * repository to hold a copy of something Blender makes on demand. Git is the
   * stash: `git checkout HEAD~ -- public/kit` puts the originals back, and
   * `blender/export.py` makes them from scratch.
   */
  if (document.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'EXT_meshopt_compression')) {
    console.log(`${basename(file).padEnd(28)} already compressed, left alone`);
    before += raw;
    after += raw;
    continue;
  }

  await document.transform(
    // Identical meshes, materials and accessors collapse to one. The cast shares
    // a body across seven characters, so there is real duplication to find.
    dedup(),
    prune(),
    // Vertices that differ only by float noise become one, which is what makes
    // the index buffer worth having and what meshopt's encoder wants to see.
    weld(),
    /*
     * Precision, chosen against the thing being drawn rather than by default.
     *
     * 14 bits over a two-metre figure is a 0.12 mm grid — the chamfer on this
     * geometry is 4 mm, so the quantisation is thirty times finer than the
     * smallest feature anybody authored. Normals at 10 bits are a quarter of a
     * degree. Skin weights at 8 bits are the format's own convention and are
     * renormalised on load.
     */
    quantize({
      /*
       * One volume for the whole file, not one per mesh — and this is the
       * difference between a working rig and a broken one.
       *
       * Quantizing positions leaves a dequantization transform that has to go
       * somewhere, and on a skinned mesh it has to be folded into the skin's
       * inverse bind matrices. Per-mesh volumes mean per-mesh transforms, so
       * every primitive needs its own skin: measured, the default turned the
       * driver's single 20-bone skin into **fifty** copies of it, one per
       * material split. Which is more bytes, fifty `Skeleton` objects a clone
       * instead of one, and a rig that `bindDriver` has to be lucky to find.
       *
       * A shared volume gives every mesh the same transform, so the one skin
       * survives as one skin. It costs a little precision on the small parts —
       * they are quantized against the whole figure's bounds rather than their
       * own — which at 14 bits over two metres is 0.12 mm and not worth a
       * sentence anywhere else.
       */
      quantizationVolume: 'scene',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeWeight: 8,
      quantizeGeneric: 12,
    }),
  );

  // Meshopt rather than Draco: it decodes an order of magnitude faster, the
  // decoder is a fifth the size, and on already-quantized attributes the two land
  // within a few percent of each other. This file is loaded on a phone.
  document.createExtension(
    (await import('@gltf-transform/extensions')).EXTMeshoptCompression,
  )
    .setRequired(true)
    .setEncoderOptions({ method: 'quantize' });

  await io.write(path, document);
  const size = statSync(path).size;

  before += raw;
  after += size;
  const pct = ((1 - size / raw) * 100).toFixed(0);
  console.log(`${basename(file).padEnd(28)} ${(raw / 1e6).toFixed(2)} MB -> ${(size / 1e6).toFixed(2)} MB  (-${pct}%)`);
}

console.log(
  `\nkit total ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB  (-${((1 - after / before) * 100).toFixed(0)}%)`,
);
