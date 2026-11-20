// Usage: node tools/build-textures.mjs "<Sammlung_Stylized-Mix>" public/textures
// (needs ktx2-encoder@0.6 + sharp installed temporarily, e.g. in a scratch folder next to a copy of this script)
// ETC1S everywhere: UASTC normals were ~6x bigger (4.7 MB for the terrain) for no visible gain at game distance.
// Converts the FreeStylized textures of the texture concept (20.11.2026) to KTX2 (Basis Universal, with mipmaps):
//   terrain/terrain_c_1024.ktx2, terrain_c_512.ktx2  colour, one 2D-array texture (layer order = TERRAIN below), ETC1S sRGB
//   terrain/terrain_n_1024.ktx2                       normal maps (GL), same layers, ETC1S with the normal-map preset (linear)
//   props/<name>_c.ktx2, props/<name>_n.ktx2          buildings and rocks (512 px)
// Only colour + normal are converted: roughness is a constant in the game, no height, no AO.
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeBasisEncoder } from 'ktx2-encoder';

const [SRC, OUT] = process.argv.slice(2);
if (!SRC || !OUT) { console.error('usage: build-textures.mjs <src> <out>'); process.exit(1); }

/** terrain layers, index = layer in the array texture (src/view/textures.ts TERRAIN_LAYERS) */
const TERRAIN = ['grass_01', 'moss_ground_02', 'ground_02', 'ground_06', 'grass_04', 'cobblestone_01'];
/** props: name -> size */
const PROPS = { wood_planks_20: 512, wood_planks_13: 512, hay_roof_01: 512, stone_bricks_wall_03: 512, cliff_rocks_02: 512 };

function findDir(name) {
  for (const cat of readdirSync(SRC)) {
    const p = path.join(SRC, cat, name);
    try { if (statSync(p).isDirectory()) return p; } catch { /* next */ }
  }
  throw new Error('not found: ' + name);
}
function mapFile(name, kind) {
  const dir = findDir(name), files = readdirSync(dir).map(f => [f, f.toLowerCase()]);
  const hit = kind === 'c' ? files.find(([, l]) => /(_color|base_?color)/.test(l)) : files.find(([, l]) => l.includes('normal_gl'));
  if (!hit) throw new Error(`no ${kind} map in ${dir}`);
  return path.join(dir, hit[0]);
}
async function raw(file, size) {
  const { data, info } = await sharp(file).resize(size, size, { kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

const enc = new NodeBasisEncoder();
const basis = await enc.init();
/** encodes 1..n equally sized RGBA images; n > 1 -> 2D array texture */
async function encode(images, normal) {
  const e = new basis.BasisEncoder();
  try {
    e.setCreateKTX2File(true); e.setMipGen(true); e.setYFlip(false); e.setDebug(false);
    e.setTexType(images.length > 1 ? 1 /* cBASISTexType2DArray */ : 0);
    if (normal) {
      e.setUASTC(false); e.setQualityLevel(255); (e.setETC1SCompressionLevel ?? e.setCompressionLevel).call(e, 4);
      (e.setNormalMapPreset ?? e.setNormalMap).call(e);
      (e.setKTX2AndBasisSRGBTransferFunc ?? e.setKTX2SRGBTransferFunc).call(e, false);
      e.setPerceptual(false);
      e.setMipSRGB?.(false);
    } else {
      e.setUASTC(false); e.setQualityLevel(200);
      (e.setETC1SCompressionLevel ?? e.setCompressionLevel).call(e, 3);
      (e.setKTX2AndBasisSRGBTransferFunc ?? e.setKTX2SRGBTransferFunc).call(e, true);
      e.setPerceptual(true);
    }
    images.forEach((im, i) => e.setSliceSourceImage(i, im.data, im.width, im.height, 0 /* RAW */));
    const out = new Uint8Array(images.reduce((s, im) => s + im.width * im.height * 4, 0) * 2 + 65536);
    const n = e.encode(out);
    if (!n) throw new Error('encode failed');
    return out.slice(0, n);
  } finally { e.delete(); }
}
function save(rel, buf) {
  const f = path.join(OUT, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, buf);
  console.log(rel.padEnd(34), (buf.length / 1024).toFixed(0).padStart(6), 'KB');
}

for (const size of [1024, 512]) save(`terrain/terrain_c_${size}.ktx2`, await encode(await Promise.all(TERRAIN.map(n => raw(mapFile(n, 'c'), size))), false));
save('terrain/terrain_n_1024.ktx2', await encode(await Promise.all(TERRAIN.map(n => raw(mapFile(n, 'n'), 1024))), true));
for (const [name, size] of Object.entries(PROPS)) {
  save(`props/${name}_c.ktx2`, await encode([await raw(mapFile(name, 'c'), size)], false));
  save(`props/${name}_n.ktx2`, await encode([await raw(mapFile(name, 'n'), size)], true));
}
