// Sprite atlas of the effect system: 4x4 tiles of 256 px, greyscale (red channel = intensity).
// Tiles 0..7: Kenney Particle Pack (CC0) from public/textures/fx_fire.png (flame_01..04, fire_01/02, smoke_02/05).
// Tiles 8..15 are drawn here: soft glow, spark, 4-point star, snowflake, bubble, plus, leaf, shard.
import * as THREE from 'three';

const T = 256, COLS = 4;
let tex: THREE.CanvasTexture | null = null;

function drawProcedural(g: CanvasRenderingContext2D) {
  const cell = (i: number, f: (cx: number, cy: number) => void) => {
    const x = (i % COLS) * T, y = Math.floor(i / COLS) * T;
    g.save(); g.beginPath(); g.rect(x, y, T, T); g.clip(); f(x + T / 2, y + T / 2); g.restore();
  };
  const radial = (cx: number, cy: number, r: number, stops: [number, number][]) => {
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const [p, v] of stops) gr.addColorStop(p, `rgba(255,255,255,${v})`);
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  // 8 soft glow
  cell(8, (cx, cy) => radial(cx, cy, 124, [[0, 1], [.2, .75], [.5, .25], [1, 0]]));
  // 9 spark: hot dot with a soft falloff (streaks come from velocity stretch in the shader)
  cell(9, (cx, cy) => radial(cx, cy, 120, [[0, 1], [.08, 1], [.22, .45], [.55, .08], [1, 0]]));
  // 10 four-point star
  cell(10, (cx, cy) => {
    radial(cx, cy, 70, [[0, 1], [.3, .5], [1, 0]]);
    g.globalCompositeOperation = 'lighter';
    for (const [w, l] of [[10, 124], [5, 84]] as [number, number][]) for (const a of l === 124 ? [0, Math.PI / 2] : [Math.PI / 4, -Math.PI / 4]) {
      g.save(); g.translate(cx, cy); g.rotate(a);
      const gr = g.createLinearGradient(-l, 0, l, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-l, 0); g.lineTo(0, -w); g.lineTo(l, 0); g.lineTo(0, w); g.closePath(); g.fill(); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  });
  // 11 snowflake: 6 arms with side twigs
  cell(11, (cx, cy) => {
    radial(cx, cy, 60, [[0, .6], [1, 0]]);
    g.strokeStyle = 'white'; g.lineCap = 'round'; g.shadowColor = 'white'; g.shadowBlur = 8;
    for (let k = 0; k < 6; k++) {
      g.save(); g.translate(cx, cy); g.rotate(k * Math.PI / 3);
      g.lineWidth = 9; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -100); g.stroke();
      g.lineWidth = 6;
      for (const [d, l] of [[42, 30], [70, 22]] as [number, number][]) { g.beginPath(); g.moveTo(0, -d); g.lineTo(-l, -d - l); g.moveTo(0, -d); g.lineTo(l, -d - l); g.stroke(); }
      g.restore();
    }
    g.shadowBlur = 0;
  });
  // 12 bubble: thin bright rim + highlight, faint inside
  cell(12, (cx, cy) => {
    radial(cx, cy, 100, [[0, .08], [.75, .18], [.9, .9], [.96, .5], [1, 0]]);
    radial(cx - 36, cy - 36, 30, [[0, 1], [1, 0]]);
  });
  // 13 plus (healing)
  cell(13, (cx, cy) => {
    g.shadowColor = 'white'; g.shadowBlur = 22; g.fillStyle = 'white';
    const r = 18; const rr = (x: number, y: number, w: number, h: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    rr(cx - 26, cy - 88, 52, 176); rr(cx - 88, cy - 26, 176, 52); g.shadowBlur = 0;
  });
  // 14 leaf with vein
  cell(14, (cx, cy) => {
    g.save(); g.translate(cx, cy); g.rotate(-.6);
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.moveTo(0, -105); g.bezierCurveTo(70, -60, 62, 50, 0, 105); g.bezierCurveTo(-62, 50, -70, -60, 0, -105); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 6; g.beginPath(); g.moveTo(0, -95); g.lineTo(0, 100); g.stroke();
    g.lineWidth = 3; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(0, i * 24); g.lineTo(i % 2 ? 40 : -40, i * 24 - 26); g.stroke(); }
    g.restore();
  });
  // 15 shard: long faceted splinter
  cell(15, (cx, cy) => {
    g.save(); g.translate(cx, cy); g.rotate(.5);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(0, -115); g.lineTo(28, -10); g.lineTo(10, 110); g.lineTo(-22, 20); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,1)'; g.beginPath(); g.moveTo(0, -115); g.lineTo(28, -10); g.lineTo(2, 10); g.closePath(); g.fill();
    g.restore();
  });
}

/** the shared atlas texture; Kenney tiles appear as soon as the image is loaded */
export function fxAtlas(): THREE.Texture {
  if (tex) return tex;
  const cv = document.createElement('canvas'); cv.width = cv.height = T * COLS;
  const g = cv.getContext('2d')!; g.fillStyle = 'black'; g.fillRect(0, 0, cv.width, cv.height);
  drawProcedural(g);
  tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const img = new Image();
  img.onload = () => { // fx_fire.png is 4x2 tiles of 256 px -> the first two atlas rows
    g.drawImage(img, 0, 0, T * 4, T * 2); tex!.needsUpdate = true;
  };
  img.src = import.meta.env.BASE_URL + 'textures/fx_fire.png';
  return tex;
}
export const ATLAS_COLS = COLS;
