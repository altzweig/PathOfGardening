// Usage: node tools/build-nature.mjs <MegaKit>/glTF public/nature/nature.glb
// (needs @gltf-transform/core, functions, extensions + meshoptimizer installed temporarily)
// Packs the chosen Quaternius Stylized Nature MegaKit models into one GLB (no textures, meshopt-compressed).
import { NodeIO, Document, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { weld, simplify, dedup, prune, quantize, reorder, mergeDocuments, unpartition } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import path from 'node:path';
const [src, out] = process.argv.slice(2);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
// model -> bark simplify ratio (1 = keep)
const MODELS = {
  TwistedTree_1: .3, TwistedTree_2: .3, TwistedTree_3: .3, TwistedTree_4: .3, TwistedTree_5: .3,
  DeadTree_1: .3, DeadTree_2: .3, DeadTree_3: .3, DeadTree_4: .3, DeadTree_5: .3,
  Pine_1: .35, Pine_2: .35, Pine_4: .35, Pine_5: .5, CommonTree_1: .3, CommonTree_3: .35, CommonTree_5: .35,
  Bush_Common: 1, Bush_Common_Flowers: 1, Fern_1: 1, Plant_1: 1, Plant_1_Big: 1, Plant_7: 1, Plant_7_Big: 1, Clover_1: 1, Clover_2: 1,
  Grass_Wispy_Short: 1, Grass_Wispy_Tall: 1, Grass_Common_Short: 1, Grass_Common_Tall: 1,
  Flower_3_Group: 1, Flower_4_Group: 1, Flower_3_Single: 1, Flower_4_Single: 1, Mushroom_Common: .35, Mushroom_Laetiporus: .25,
  Petal_1: 1, Petal_2: 1, Petal_3: 1, Petal_4: 1, Petal_5: 1,
  Rock_Medium_1: 1, Rock_Medium_2: 1, Rock_Medium_3: 1,
  Pebble_Round_1: 1, Pebble_Round_2: 1, Pebble_Round_3: 1, Pebble_Round_4: 1, Pebble_Round_5: 1,
  RockPath_Round_Small_1: .22, RockPath_Round_Small_2: .22, RockPath_Round_Small_3: .22,
};
const target = new Document(); target.createBuffer();
let tris = 0;
for (const [name, ratio] of Object.entries(MODELS)) {
  const doc = await io.read(path.join(src, name + '.gltf'));
  for (const t of doc.getRoot().listTextures()) t.dispose(); // textures are loaded once by the game
  await doc.transform(weld());
  if (ratio < 1) for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) {
    const mn = p.getMaterial()?.getName() ?? '';
    if (/Leaves|Leaf/.test(mn)) continue; // alpha cards stay as they are
    const pos = p.getAttribute('POSITION').getArray(), idx = new Uint32Array(p.getIndices().getArray());
    const [o] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, Math.floor(idx.length * ratio / 3) * 3, 0.12);
    // compact: keep only the vertices still used
    const remap = new Map(), keep = [];
    const ni = new Uint32Array(o.length); for (let i = 0; i < o.length; i++) { let r = remap.get(o[i]); if (r === undefined) { r = keep.length; remap.set(o[i], r); keep.push(o[i]); } ni[i] = r; }
    for (const sem of p.listSemantics()) {
      const a = p.getAttribute(sem), n = a.getElementSize(), src = a.getArray(), dst = new src.constructor(keep.length * n);
      keep.forEach((v, i) => { for (let k = 0; k < n; k++) dst[i * n + k] = src[v * n + k]; });
      a.setArray(dst);
    }
    p.getIndices().setArray(keep.length < 65536 ? new Uint16Array(ni) : ni);
  }
  const scene = doc.getRoot().listScenes()[0];
  const root = doc.createNode(name); for (const n of scene.listChildren()) { scene.removeChild(n); root.addChild(n); } scene.addChild(root);
  for (const mesh of doc.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) tris += p.getIndices().getCount() / 3;
  mergeDocuments(target, doc);
}
// one scene
const scenes = target.getRoot().listScenes(); const main = scenes[0];
for (const s of scenes.slice(1)) { for (const n of s.listChildren()) main.addChild(n); s.dispose(); }
await target.transform(unpartition(), dedup({ propertyTypes: [PropertyType.ACCESSOR] }), prune({ keepAttributes: true }), reorder({ encoder: MeshoptEncoder }), quantize());
target.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(out, target);
console.log('tris', tris);
