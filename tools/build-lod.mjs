// Usage: node tools/build-lod.mjs public/nature/nature.glb   (Plan 2.3, 22.11.2026)
// (needs @gltf-transform/core, functions, extensions + meshoptimizer installed temporarily, like build-nature.mjs)
// Adds a far version "<Model>__lod1" of the big forest models to nature.glb: bark / rock simplified with meshopt,
// leaf cards thinned out (every card is a separate piece: a part of them is dropped, the rest grows a bit so the crown stays
// as dense). The game shows it for forest tiles further than LOD_DIST from the camera (src/world/props.ts).
// Running it again replaces the old __lod1 models.
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dequantize, quantize, reorder, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
const [file] = process.argv.slice(2);
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
// model -> [solid ratio (bark, rock), leaf ratio (cards kept)]
const LOD = {
  Pine_1: [.4, .45], Pine_2: [.4, .45], Pine_3: [.35, .45], Pine_4: [.4, .45], Pine_5: [.4, .45],
  CommonTree_1: [.35, .4], CommonTree_2: [.35, .4], CommonTree_3: [.35, .4], CommonTree_4: [.35, .4], CommonTree_5: [.35, .4],
  TwistedTree_1: [.3, .4], TwistedTree_2: [.3, .4], TwistedTree_3: [.3, .4], TwistedTree_4: [.3, .4], TwistedTree_5: [.3, .4],
  DeadTree_1: [.35, 1], DeadTree_2: [.35, 1], DeadTree_3: [.35, 1], DeadTree_4: [.35, 1], DeadTree_5: [.35, 1],
  Bush_Common: [.5, .5], Bush_Common_Flowers: [.5, .45], Fern_1: [1, .5],
  Rock_Medium_1: [.4, 1], Rock_Medium_2: [.4, 1], Rock_Medium_3: [.35, 1],
};
const doc = await io.read(file);
await doc.transform(dequantize());
const R = doc.getRoot(), scene = R.listScenes()[0];
for (const n of scene.listChildren()) if (n.getName().endsWith('__lod1')) { scene.removeChild(n); n.dispose(); }
await doc.transform(prune({ keepAttributes: true }));
const hash = i => { const h = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return h - Math.floor(h); };
let before = 0, after = 0;

/** new primitive from attribute arrays (kept vertices) and indices */
function makePrim(src, keep, idx) {
  const p = doc.createPrimitive().setMaterial(src.getMaterial()).setMode(src.getMode());
  for (const sem of src.listSemantics()) {
    const a = src.getAttribute(sem), n = a.getElementSize(), s = a.getArray(), d = new s.constructor(keep.length * n);
    keep.forEach((v, i) => { for (let k = 0; k < n; k++) d[i * n + k] = s[v * n + k]; });
    p.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(d).setNormalized(a.getNormalized()).setBuffer(R.listBuffers()[0]));
  }
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(keep.length < 65536 ? new Uint16Array(idx) : new Uint32Array(idx)).setBuffer(R.listBuffers()[0]));
  return p;
}
/** compact: only the vertices the indices still use */
function compact(src, ix) {
  const remap = new Map(), keep = [], ni = new Uint32Array(ix.length);
  for (let i = 0; i < ix.length; i++) { let r = remap.get(ix[i]); if (r === undefined) { r = keep.length; remap.set(ix[i], r); keep.push(ix[i]); } ni[i] = r; }
  return makePrim(src, keep, ni);
}
function solid(p, ratio) {
  const idx = new Uint32Array(p.getIndices().getArray()), pos = p.getAttribute('POSITION').getArray();
  if (ratio >= 1) return compact(p, idx);
  const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
  let [o] = MeshoptSimplifier.simplify(idx, pos, 3, target, .04);
  if (o.length > target * 1.4) [o] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, .06);
  return compact(p, o);
}
/** leaf cards: connected pieces; keep a part of them, scale the kept ones up around their centre */
function cards(p, keepK) {
  const idx = p.getIndices().getArray(), nv = p.getAttribute('POSITION').getCount();
  if (keepK >= 1) return compact(p, new Uint32Array(idx));
  const par = new Int32Array(nv).map((_, i) => i), find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]), b = find(idx[t + 1]), c = find(idx[t + 2]); par[b] = a; par[c] = a; }
  const comp = new Map(); // root -> triangle starts
  for (let t = 0; t < idx.length; t += 3) { const r = find(idx[t]); let l = comp.get(r); if (!l) comp.set(r, l = []); l.push(t); }
  const pieces = [...comp.values()];
  if (pieces.length < 6) return compact(p, new Uint32Array(idx)); // one big leaf mesh: leave it
  const out = [], keptV = new Set();
  pieces.forEach((tris, i) => { if (hash(i) < keepK) for (const t of tris) { out.push(idx[t], idx[t + 1], idx[t + 2]); keptV.add(idx[t]); keptV.add(idx[t + 1]); keptV.add(idx[t + 2]); } });
  const q = compact(p, new Uint32Array(out));
  // grow the kept cards: area ~ 1/keep, a bit less (they overlap)
  const pos = q.getAttribute('POSITION').getArray(), qi = q.getIndices().getArray(), s = Math.min(1.45, Math.sqrt(1 / keepK) * .92);
  const par2 = new Int32Array(pos.length / 3).map((_, i) => i), f2 = i => { while (par2[i] !== i) { par2[i] = par2[par2[i]]; i = par2[i]; } return i; };
  for (let t = 0; t < qi.length; t += 3) { const a = f2(qi[t]), b = f2(qi[t + 1]), c = f2(qi[t + 2]); par2[b] = a; par2[c] = a; }
  const cen = new Map();
  for (let v = 0; v < pos.length / 3; v++) { const r = f2(v); let c = cen.get(r); if (!c) cen.set(r, c = [0, 0, 0, 0]); c[0] += pos[v * 3]; c[1] += pos[v * 3 + 1]; c[2] += pos[v * 3 + 2]; c[3]++; }
  for (let v = 0; v < pos.length / 3; v++) { const c = cen.get(f2(v)); for (let k = 0; k < 3; k++) { const m = c[k] / c[3]; pos[v * 3 + k] = m + (pos[v * 3 + k] - m) * s; } }
  return q;
}
function copyNode(n, ratios) {
  const c = doc.createNode(n.getName()).setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale());
  const m = n.getMesh();
  if (m) {
    const nm = doc.createMesh(m.getName());
    for (const p of m.listPrimitives()) {
      const leaf = /Leaves|Leaf/.test(p.getMaterial()?.getName() ?? ''), q = leaf ? cards(p, ratios[1]) : solid(p, ratios[0]);
      before += p.getIndices().getCount() / 3; after += q.getIndices().getCount() / 3;
      nm.addPrimitive(q);
    }
    c.setMesh(nm);
  }
  for (const ch of n.listChildren()) c.addChild(copyNode(ch, ratios));
  return c;
}
for (const n of [...scene.listChildren()]) {
  const r = LOD[n.getName()]; if (!r) continue;
  const b0 = before, a0 = after, c = copyNode(n, r); c.setName(n.getName() + '__lod1'); scene.addChild(c);
  console.log(n.getName().padEnd(22), (before - b0) + ' -> ' + (after - a0));
}
await doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR] }), prune({ keepAttributes: true }), reorder({ encoder: MeshoptEncoder }), quantize());
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
await io.write(file, doc);
console.log('tris', before, '->', after);
