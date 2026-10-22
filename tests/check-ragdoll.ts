/**
 * Headless check of the ragdoll rig (not a test: run `npm run check:ragdoll`). It loads the real zombie
 * models in Node (textures stripped, they are not needed), drops a ragdoll and reports whether
 * the bones follow the joints and the skinned mesh keeps its size.
 */
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import characters from '../data/characters.json';
import { createRng, type Arena } from '../src/sim';
import { NODE, NODE_COUNT } from '../src/sim/physics/ragdoll';
import { RapierWorld } from '../src/sim/physics/rapierWorld';
import { RIGS, RagdollRig } from '../src/render/ragdollRig';

/** The parts of a glTF JSON chunk this script touches. */
interface GlbJson {
  images?: unknown;
  textures?: unknown;
  samplers?: unknown;
  extensionsUsed?: unknown;
  extensionsRequired?: unknown;
  materials?: {
    normalTexture?: unknown;
    occlusionTexture?: unknown;
    emissiveTexture?: unknown;
    extensions?: unknown;
    pbrMetallicRoughness?: { baseColorTexture?: unknown; metallicRoughnessTexture?: unknown };
  }[];
}

/** Rewrites the GLB's JSON chunk without images and textures, so Node can parse it. */
function withoutTextures(file: string): ArrayBuffer {
  const buf = fs.readFileSync(file);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as GlbJson;
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
    delete m.extensions;
  }
  delete json.extensionsUsed;
  delete json.extensionsRequired;
  let text = JSON.stringify(json);
  while (Buffer.byteLength(text) % 4 !== 0) text += ' ';
  const jsonBytes = Buffer.from(text);
  const rest = buf.subarray(20 + jsonLen);
  const out = Buffer.alloc(20 + jsonBytes.length + rest.length);
  buf.copy(out, 0, 0, 12);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonBytes.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(out, 20);
  rest.copy(out, 20 + jsonBytes.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

const arena: Arena = {
  halfSize: 60,
  obstacles: [],
  terrain: { heights: null, water: null, paint: null },
  surfaces: [],
};

const lastBox = new THREE.Box3();
const sizeOf = (root: THREE.Object3D): THREE.Vector3 => {
  root.updateMatrixWorld(true);
  const box = lastBox.makeEmpty();
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.skeleton.update();
    o.computeBoundingBox();
    box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));
  });
  return box.getSize(new THREE.Vector3());
};

for (const id of ['marine_zombie'] as const) {
  const spec = characters.enemies[id];
  const gltf = await new GLTFLoader().parseAsync(withoutTextures(`public/${spec.model}`), '');
  const root = new THREE.Group();
  const model = clone(gltf.scene);
  model.scale.setScalar(spec.scale);
  root.add(model);

  const rig = RagdollRig.create(root, RIGS[id]!);
  if (!rig) {
    console.log(`${id}: RIG NOT BUILT (a bone is missing)`);
    continue;
  }
  const before = sizeOf(root);
  console.log(
    `\n== ${id}: rig built, ragdoll scale ${rig.scale.toFixed(2)}, mesh ${before.x.toFixed(2)} x ${before.y.toFixed(2)} x ${before.z.toFixed(2)} m`,
  );
  console.log(
    'bind joints:',
    rig.bind.map((v) => `(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`).join(' '),
  );

  // Identity check: joints exactly where the model's own joints are must leave the mesh as it was.
  {
    rig.apply(rig.poseAt(0, 0, 0, 0, 0));
    const same = sizeOf(root);
    console.log(
      `identity pose: mesh ${same.x.toFixed(2)} x ${same.y.toFixed(2)} x ${same.z.toFixed(2)} m (should equal the first size above)`,
    );
    root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) {
        const b = new THREE.Box3().setFromObject(o);
        console.log(`  skinned mesh "${o.name}": y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}`);
      }
    });
  }

  const world = await RapierWorld.create();
  world.setArena(arena);
  const rng = createRng(5);
  const pose = rig.poseAt(0, 3, 0, 0.5, 0.15);
  const doll = world.addRagdoll(pose, rig.scale, {
    torsoRadius: rig.thickness * 0.8,
    yaw: 0.5,
    jitter: { rng, speed: 1.0 },
  })!;
  const joints = new Float32Array(NODE_COUNT * 3);
  for (let i = 0; i < 360; i++) world.step();
  world.ragdollNodes(doll, joints);
  rig.apply(joints);
  const after = sizeOf(root);

  // How far each bone ended from the joint it should be at.
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o instanceof THREE.Bone) bones.set(o.name.replace(/[^A-Za-z0-9]/g, '').toLowerCase(), o);
  });
  const spec2 = RIGS[id]!;
  const checks: [string, string, number][] = [
    [spec2.pelvis, 'pelvis', NODE.pelvis],
    [spec2.chest, 'chest', NODE.chest],
    [spec2.head, 'head', NODE.head],
  ];
  for (const [bone, label, node] of checks) {
    const b = bones.get(bone)!;
    const p = b.getWorldPosition(new THREE.Vector3());
    const d = Math.hypot(
      p.x - joints[node * 3]!,
      p.y - joints[node * 3 + 1]!,
      p.z - joints[node * 3 + 2]!,
    );
    console.log(`  ${label}: bone is ${d.toFixed(2)} m from its joint`);
  }
  console.log(
    '  joints y:',
    Array.from({ length: NODE_COUNT }, (_, n) => joints[n * 3 + 1]!.toFixed(2)).join(' '),
    `| mesh y from ${lastBox.min.y.toFixed(2)} to ${lastBox.max.y.toFixed(2)}`,
  );
  const lowest = Math.min(...Array.from({ length: NODE_COUNT }, (_, n) => joints[n * 3 + 1]!));
  const finite = [...bones.values()].every((b) => Number.isFinite(b.matrixWorld.elements[12]!));
  console.log(
    `after 6 s: mesh ${after.x.toFixed(2)} x ${after.y.toFixed(2)} x ${after.z.toFixed(2)} m (was ${before.x.toFixed(2)} x ${before.y.toFixed(2)} x ${before.z.toFixed(2)}), lowest joint ${lowest.toFixed(2)} m, all bone matrices finite: ${finite}`,
  );
}
