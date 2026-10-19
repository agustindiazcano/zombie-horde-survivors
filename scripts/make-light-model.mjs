// Makes the light marine: node make-light-model.mjs <in.glb> <out.glb> 0.08 512
// Needs, installed in a scratch folder (not a dependency of the game):
//   npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer sharp
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, simplify, weld, textureCompress, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [, , inp, out, ratio, size] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
await MeshoptSimplifier.ready;
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: Number(ratio), error: 0.02, lockBorder: false }),
  textureCompress({
    encoder: sharp,
    resize: [Number(size), Number(size)],
    targetFormat: 'jpeg',
    quality: 80,
  }),
  resample(),
  prune(),
  dedup(),
);
await io.write(out, doc);
for (const m of doc.getRoot().listMeshes())
  for (const p of m.listPrimitives())
    console.log(
      'tris',
      p.getIndices().getCount() / 3,
      'verts',
      p.getAttribute('POSITION').getCount(),
    );
console.log(
  'anims',
  doc.getRoot().listAnimations().length,
  'skins',
  doc.getRoot().listSkins().length,
);
