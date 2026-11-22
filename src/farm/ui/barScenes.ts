// Animated progress bars per activity (Basti 22.11.2026): instead of a plain bar every action draws a little scene that IS the
// bar. Pure Canvas 2D, one small canvas, everything drawn procedurally (no images, no DOM effects), runs every frame only while
// an action is shown. Coordinates: a fixed 240 x 60 box, the canvas scales it. Everything moves left -> right with the progress.
//
// A scene gets the overall progress k (0..1), the step it is on (step = index of the repeat, e.g. the 2nd of 3 harvest passes),
// the progress inside that step f, the number of steps n, the time t (s, for wobble/slosh) and a stable random r(i).
// hit(id, cond, sound) fires a sound once when cond turns true and returns the seconds since then (-1 = not yet).

export type Ctx = CanvasRenderingContext2D;
export interface BarArgs {
  scene: string; v: string; k: number; step: number; f: number; n: number; t: number;
  /** level shown by can / barrel / pail (0..1), the real value */
  fill?: number; cap?: number; per?: number;
  /** goods of a recipe (produce) */
  need?: string[];
  r: (i: number) => number;
  hit: (id: string, cond: boolean, snd?: string) => number;
}
export const W = 240, H = 60;
const X0 = 6, X1 = 234, Y0 = 6, Y1 = 54, IW = X1 - X0, IH = Y1 - Y0;
const TAU = Math.PI * 2;
const cl = (v: number, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const sm = (a: number, b: number, x: number) => { const u = cl((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOutBack = (x: number) => { const c = 1.7; return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };

// ---------------- little drawing helpers ----------------
function circ(g: Ctx, x: number, y: number, r: number, fill: string) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, Math.max(.1, r), 0, TAU); g.fill(); }
function ell(g: Ctx, x: number, y: number, rx: number, ry: number, rot: number, fill: string) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rot, 0, TAU); g.fill(); }
function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
function rr(g: Ctx, x: number, y: number, w: number, h: number, r: number) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function at(g: Ctx, x: number, y: number, rot: number, s: number, fn: () => void) { g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (s !== 1) g.scale(s, s); fn(); g.restore(); }

/** soil, seen from above, with crumbs */
function soilTop(g: Ctx, a: BarArgs, col = '#6b4a2e', dots = '#523620', light = '#86603c') {
  g.fillStyle = col; g.fillRect(X0, Y0, IW, IH);
  for (let i = 0; i < 70; i++) { const x = X0 + a.r(900 + i) * IW, y = Y0 + a.r(1000 + i) * IH; circ(g, x, y, .6 + a.r(1100 + i) * 1.3, i % 3 ? dots : light); }
}
/** side view: dark sky band (the panel) + grass line + soil cross-section from gy down */
function soilSide(g: Ctx, a: BarArgs, gy: number) {
  const gr = g.createLinearGradient(0, gy, 0, Y1); gr.addColorStop(0, '#7a5434'); gr.addColorStop(1, '#4e331d');
  g.fillStyle = gr; g.fillRect(X0, gy, IW, Y1 - gy);
  for (let i = 0; i < 40; i++) { const x = X0 + a.r(700 + i) * IW, y = gy + 3 + a.r(800 + i) * (Y1 - gy - 3); circ(g, x, y, .5 + a.r(850 + i) * 1.2, i % 4 ? '#3e2814' : '#9a7a58'); }
  g.fillStyle = '#5f8a34'; g.fillRect(X0, gy - 1.5, IW, 3);
  for (let i = 0; i < 46; i++) { const x = X0 + i * IW / 46 + a.r(600 + i) * 3; line(g, x, gy, x + (a.r(650 + i) - .5) * 3, gy - 2 - a.r(680 + i) * 3, 1, '#7aa844'); }
}
function grassBg(g: Ctx, a: BarArgs, gy: number) {
  g.fillStyle = '#4f7a2c'; g.fillRect(X0, gy, IW, Y1 - gy);
  for (let i = 0; i < 60; i++) { const x = X0 + a.r(300 + i) * IW, y = gy + a.r(400 + i) * (Y1 - gy); line(g, x, y, x + (a.r(500 + i) - .5) * 3, y - 3, 1, i % 2 ? '#6c9a3c' : '#3f6624'); }
}

// ---------------- crops and goods (small vector drawings) ----------------
const CARROT_GREEN = '#5a9a34';
function foliage(g: Ctx, x: number, y: number, n: number, len: number, col: string, spread = .5, wob = 0) {
  for (let i = 0; i < n; i++) { const an = -Math.PI / 2 + (i - (n - 1) / 2) * spread / Math.max(1, n - 1) * 2 + wob; line(g, x, y, x + Math.cos(an) * len, y + Math.sin(an) * len, 1.6, col); }
}
/** root crops in side view: (x, y) = where the plant leaves the ground, the root hangs below */
function rootCrop(g: Ctx, v: string, x: number, y: number, wob: number) {
  switch (v) {
    case 'carrot': {
      for (let i = 0; i < 4; i++) { const an = -Math.PI / 2 + (i - 1.5) * .28 + wob; const ex = x + Math.cos(an) * 14, ey = y + Math.sin(an) * 14; line(g, x, y, ex, ey, 1.4, CARROT_GREEN); circ(g, ex, ey, 2.6, '#6fb040'); }
      g.fillStyle = '#e8742a'; g.beginPath(); g.moveTo(x - 3.6, y - 1); g.quadraticCurveTo(x - 3, y + 10, x, y + 19); g.quadraticCurveTo(x + 3, y + 10, x + 3.6, y - 1); g.closePath(); g.fill();
      for (let i = 0; i < 4; i++) line(g, x - 2.4 + (i % 2), y + 3 + i * 3.5, x + .6 + (i % 2), y + 3.6 + i * 3.5, .7, '#b8521a'); break;
    }
    case 'radish': {
      for (let i = 0; i < 3; i++) { const an = -Math.PI / 2 + (i - 1) * .45 + wob; ell(g, x + Math.cos(an) * 7, y + Math.sin(an) * 7, 4, 2.2, an, '#5e9e38'); }
      circ(g, x, y + 4.5, 4.6, '#d8304a'); circ(g, x - 1.5, y + 3, 1.3, '#f07a8a'); line(g, x, y + 9, x + .5, y + 14, .9, '#f4e8e0'); break;
    }
    case 'onion': {
      for (let i = 0; i < 3; i++) line(g, x, y, x + (i - 1) * 3 + wob * 8, y - 15 - i % 2 * 3, 2, '#6aa64a');
      g.fillStyle = '#c88a3a'; g.beginPath(); g.moveTo(x, y - 1); g.bezierCurveTo(x + 9, y + 2, x + 8, y + 12, x, y + 12); g.bezierCurveTo(x - 8, y + 12, x - 9, y + 2, x, y - 1); g.fill();
      line(g, x - 2, y + 3, x - 3, y + 10, .7, '#9a6224'); line(g, x + 2, y + 3, x + 3, y + 10, .7, '#9a6224');
      for (let i = 0; i < 4; i++) line(g, x, y + 12, x + (i - 1.5) * 2, y + 15, .6, '#e8dcc0'); break;
    }
    case 'garlic': {
      for (let i = 0; i < 2; i++) ell(g, x + (i ? 3 : -3) + wob * 6, y - 8, 1.6, 8, (i ? .25 : -.25) + wob, '#7aa858');
      ell(g, x, y + 6, 6.4, 5.8, 0, '#eee6da'); for (let i = -1; i <= 1; i++) line(g, x + i * 2.6, y + 1.5, x + i * 3, y + 10.5, .7, '#c8b8c8');
      circ(g, x + 3, y + 8, 1.6, '#c8a0c0'); for (let i = 0; i < 4; i++) line(g, x, y + 11.5, x + (i - 1.5) * 2, y + 14, .6, '#e8dcc0'); break;
    }
    case 'leek': {
      for (let i = 0; i < 3; i++) ell(g, x + (i - 1) * 4 + wob * 6, y - 12, 2, 9, (i - 1) * .35 + wob, '#3e7a5a');
      g.fillStyle = '#b8d890'; g.fillRect(x - 3, y - 4, 6, 6); g.fillStyle = '#f2f0e0'; rr(g, x - 3, y + 2, 6, 15, 2.5); g.fill();
      for (let i = 0; i < 4; i++) line(g, x, y + 17, x + (i - 1.5) * 2, y + 20, .6, '#e8dcc0'); break;
    }
    case 'mushroom': {
      g.fillStyle = '#efe4cc'; rr(g, x - 2.6, y - 9, 5.2, 10, 2); g.fill();
      g.fillStyle = '#b8743a'; g.beginPath(); g.ellipse(x, y - 9, 9, 6, 0, Math.PI, TAU); g.fill(); ell(g, x, y - 9, 9, 1.8, 0, '#8a5424');
      circ(g, x - 3, y - 12, 1.2, '#d8a070'); circ(g, x + 3, y - 11, 1, '#d8a070');
      for (let i = 0; i < 4; i++) line(g, x, y + 1, x + (i - 1.5) * 3, y + 4, .5, '#e8dcc8'); break;
    }
  }
}
/** a root crop lying on the ground after it was pulled (drawn rotated by the caller) */
function rootLaid(g: Ctx, v: string, x: number, y: number) { at(g, x, y, -Math.PI / 2 * .92, .9, () => rootCrop(g, v, 0, 0, 0)); }

/** heads seen from above (cabbage, lettuce, celery, fennel, rhubarb) */
function topHead(g: Ctx, v: string, x: number, y: number, R: number, a: BarArgs, i: number, t: number) {
  const sway = Math.sin(t * 2 + i) * .04;
  switch (v) {
    case 'lettuce':
      for (let j = 0; j < 11; j++) { const an = j / 11 * TAU + sway; circ(g, x + Math.cos(an) * R * .7, y + Math.sin(an) * R * .7, R * .42, j % 2 ? '#8fcf5a' : '#7aba48'); }
      circ(g, x, y, R * .55, '#b8e888'); for (let j = 0; j < 5; j++) { const an = j / 5 * TAU; line(g, x, y, x + Math.cos(an) * R * .45, y + Math.sin(an) * R * .45, .8, '#e0f6c0'); } break;
    case 'celery': // a bunch of thick pale stalks, the leaves only at the tips
      for (let j = 0; j < 9; j++) { const an = j / 9 * TAU + sway, ex = x + Math.cos(an) * R * .78, ey = y + Math.sin(an) * R * .78;
        for (let q = 0; q < 3; q++) { const b = an + (q - 1) * .5; ell(g, ex + Math.cos(b) * R * .22, ey + Math.sin(b) * R * .22, R * .2, R * .12, b, q === 1 ? '#3e8a2c' : '#4e9a34'); } }
      for (let j = 0; j < 9; j++) { const an = j / 9 * TAU + sway; line(g, x, y, x + Math.cos(an) * R * .7, y + Math.sin(an) * R * .7, 3.6, '#b8dc8a'); line(g, x, y, x + Math.cos(an) * R * .7, y + Math.sin(an) * R * .7, 1, '#d8f0b0'); }
      circ(g, x, y, R * .32, '#c8e49a'); for (let j = 0; j < 5; j++) { const an = j / 5 * TAU; circ(g, x + Math.cos(an) * R * .15, y + Math.sin(an) * R * .15, R * .12, '#e4f4c8'); } break;
    case 'fennel':
      for (let j = 0; j < 9; j++) { const an = j / 9 * TAU + sway; for (let q = 0; q < 3; q++) line(g, x + Math.cos(an) * R * .3, y + Math.sin(an) * R * .3, x + Math.cos(an + (q - 1) * .2) * R, y + Math.sin(an + (q - 1) * .2) * R, .8, '#6ab04a'); }
      ell(g, x, y, R * .52, R * .44, .3, '#e4ecc8'); ell(g, x - 2, y - 2, R * .2, R * .14, .3, '#ffffff'); break;
    case 'rhubarb':
      for (let j = 0; j < 5; j++) { const an = j / 5 * TAU + sway + .3; line(g, x, y, x + Math.cos(an) * R * .7, y + Math.sin(an) * R * .7, 3, '#c83848'); ell(g, x + Math.cos(an) * R * .85, y + Math.sin(an) * R * .85, R * .48, R * .36, an, j % 2 ? '#4a8a34' : '#3e7a2c'); }
      circ(g, x, y, R * .2, '#e05868'); break;
    default: // cabbage: big outer leaves with veins, a firm pale head in the middle
      for (let j = 0; j < 7; j++) { const an = j / 7 * TAU + sway; const lx = x + Math.cos(an) * R * .62, ly = y + Math.sin(an) * R * .62; circ(g, lx, ly, R * .5, j % 2 ? '#5f8f6e' : '#6f9e78'); line(g, x, y, lx + Math.cos(an) * R * .3, ly + Math.sin(an) * R * .3, .9, '#a8c8a8'); }
      circ(g, x, y, R * .52, '#b8d88c'); g.strokeStyle = '#8eb86a'; g.lineWidth = .9; g.beginPath(); g.arc(x, y, R * .34, .4, 4.2); g.stroke(); g.beginPath(); g.arc(x + 1, y - 1, R * .18, 2, 6); g.stroke();
  }
  void a;
}

/** fruits / pods for the hand-picking scene (hanging from the vine at (x, y)) */
function fruit(g: Ctx, v: string, x: number, y: number, s: number, rot = 0) {
  at(g, x, y, rot, s, () => {
    switch (v) {
      case 'pea': g.fillStyle = '#a6dc5e'; g.strokeStyle = '#2e5a1c'; g.lineWidth = .8; g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(5, 5, 2, 15); g.quadraticCurveTo(-4, 8, -1, 0); g.fill(); g.stroke(); for (let i = 0; i < 3; i++) circ(g, .6 + i * .3, 4 + i * 3.4, 1.4, '#a8e070'); break;
      case 'bean': g.fillStyle = '#b4d85a'; g.strokeStyle = '#3a5a1c'; g.lineWidth = .8; g.beginPath(); g.moveTo(-1, 0); g.quadraticCurveTo(3, 9, 1, 19); g.quadraticCurveTo(-2.4, 10, -1, 0); g.fill(); g.stroke(); line(g, 0, 1, 1.2, 17, .5, '#8ad060'); break;
      case 'tomato': circ(g, 0, 6, 6.4, '#e0382a'); circ(g, -2, 4, 1.8, '#ff8a70'); for (let i = 0; i < 5; i++) { const an = i / 5 * TAU - Math.PI / 2; line(g, 0, 0, Math.cos(an) * 3.4, Math.sin(an) * 2 + .5, 1.1, '#3e7a2c'); } break;
      case 'pepper': g.fillStyle = '#d42a24'; g.beginPath(); g.moveTo(-6, 2); g.quadraticCurveTo(-7, 13, -3, 14); g.quadraticCurveTo(0, 11, 3, 14); g.quadraticCurveTo(7, 13, 6, 2); g.quadraticCurveTo(0, -1, -6, 2); g.fill(); line(g, 0, 1, 0, -3, 2, '#4a7a2a'); line(g, -3, 4, -3, 10, 1, '#f06a50'); break;
      case 'chili': g.fillStyle = '#e8241c'; g.beginPath(); g.moveTo(-1.6, 0); g.quadraticCurveTo(-2, 9, 3, 13); g.quadraticCurveTo(.6, 8, 1.6, 0); g.fill(); line(g, 0, 0, 0, -2.5, 1.4, '#3e7a2c'); break;
      case 'eggplant': g.fillStyle = '#5a2a6a'; g.beginPath(); g.ellipse(0, 9, 4.6, 8, 0, 0, TAU); g.fill(); ell(g, -1.6, 6, 1.2, 3, 0, '#8a5aa0'); g.fillStyle = '#4a7a2a'; g.beginPath(); g.moveTo(-4, 2); g.lineTo(0, -2); g.lineTo(4, 2); g.lineTo(0, 4); g.fill(); break;
      case 'zucchini': g.fillStyle = '#2e6a2a'; rr(g, -3.4, 0, 6.8, 22, 3.4); g.fill(); line(g, -1, 3, -1, 19, .8, '#5a9a4a'); line(g, 1.4, 3, 1.4, 19, .5, '#4a8a3a'); circ(g, 0, 21.5, 2.4, '#c8b860'); line(g, 0, 0, 0, -3, 2, '#5a8a3a'); break;
      case 'corn': g.fillStyle = '#e8c840'; rr(g, -3.4, 0, 6.8, 16, 3.4); g.fill(); for (let i = 0; i < 5; i++) line(g, -2, 2 + i * 3, 2, 2 + i * 3, .6, '#c8a020'); g.fillStyle = '#8ab858'; g.beginPath(); g.moveTo(-4, 16); g.quadraticCurveTo(-5, 6, -1, -2); g.lineTo(-3, 16); g.fill(); g.beginPath(); g.moveTo(4, 16); g.quadraticCurveTo(5, 6, 1, -2); g.lineTo(3, 16); g.fill(); line(g, 0, 0, 0, -4, 1, '#c89a5a'); break;
    }
  });
}
/** berries / small goods that make up the "collect" bar */
function berry(g: Ctx, v: string, x: number, y: number, s: number, rot = 0) {
  switch (v) {
    case 'bramble': for (let i = 0; i < 7; i++) { const an = i / 7 * TAU; circ(g, x + Math.cos(an) * 1.9 * s, y + Math.sin(an) * 2.3 * s, 1.5 * s, '#2a1830'); } circ(g, x, y, 1.7 * s, '#3a2040'); circ(g, x - .9 * s, y - 1 * s, .6 * s, '#8a6a98'); break;
    case 'strawb': g.fillStyle = '#e02a2a'; g.beginPath(); g.moveTo(x - 3.6 * s, y - 2 * s); g.quadraticCurveTo(x, y - 4 * s, x + 3.6 * s, y - 2 * s); g.quadraticCurveTo(x + 2 * s, y + 4 * s, x, y + 5 * s); g.quadraticCurveTo(x - 2 * s, y + 4 * s, x - 3.6 * s, y - 2 * s); g.fill();
      for (let i = 0; i < 4; i++) circ(g, x + ((i % 2) - .5) * 2.2 * s, y + (i < 2 ? 0 : 2.2) * s, .35 * s, '#ffe080'); line(g, x - 2 * s, y - 3 * s, x + 2 * s, y - 3 * s, 1.4 * s, '#4a8a2c'); break;
    case 'egg': ell(g, x, y, 3.6 * s, 4.6 * s, rot, '#f4ead8'); ell(g, x - 1.1 * s, y - 1.4 * s, 1 * s, 1.5 * s, rot, '#ffffff'); break;
    case 'wood': at(g, x, y, rot, s, () => { g.fillStyle = '#7a5230'; rr(g, -7, -1.8, 14, 3.6, 1.8); g.fill(); circ(g, 7, 0, 1.8, '#c8a070'); line(g, -2, -1.8, -4, -4.5, 1, '#7a5230'); }); break;
    case 'stone': ell(g, x, y, 4 * s, 3 * s, rot, '#8c8a84'); ell(g, x - 1.2 * s, y - 1 * s, 1.6 * s, 1 * s, rot, '#b4b2aa'); break;
    case 'apple': circ(g, x, y, 4.2 * s, '#d8302a'); circ(g, x - 1.4 * s, y - 1.4 * s, 1.3 * s, '#ff8a6a'); line(g, x, y - 4 * s, x + .8 * s, y - 6 * s, 1, '#5a3a1a'); ell(g, x + 2 * s, y - 5 * s, 1.8 * s, .9 * s, -.4, '#4a8a2c'); break;
    case 'nut': ell(g, x, y, 3.6 * s, 3.2 * s, rot, '#a87a40'); ell(g, x - 1 * s, y - 1 * s, 1.2 * s, .9 * s, rot, '#d0a868'); line(g, x - 2.4 * s, y + 1.6 * s, x + 2.4 * s, y + 1.6 * s, .6, '#6a4a20'); break;
    default: circ(g, x, y, 3 * s, '#3a4ea8'); circ(g, x - .9 * s, y - .9 * s, .9 * s, '#8aa0e8'); g.strokeStyle = '#1e2a60'; g.lineWidth = .7; g.beginPath(); g.arc(x + .4 * s, y - 2.3 * s, .9 * s, 0, TAU); g.stroke(); // blueberry with crown
  }
}

// ---------------- the scenes ----------------

/** wheat: a dense field from above, the sickle mows one third per pass in one fast swing */
function scythe(g: Ctx, a: BarArgs) {
  g.fillStyle = '#9a7a3e'; g.fillRect(X0, Y0, IW, IH);
  for (let i = 0; i < 40; i++) circ(g, X0 + a.r(1300 + i) * IW, Y0 + a.r(1400 + i) * IH, .8, '#7a5e2a');
  const n = a.n, sw = IW / n, cols = 30, rows = 6;
  const swing = sm(.08, .5, a.f), ang = lerp(-1.35, 1.35, swing);
  const piv = (i: number) => ({ x: X0 + sw * (i + .5), y: Y1 + 16 });
  if (a.step < n) a.hit('s' + a.step, a.f > .1, 'swish');
  // stubble + laid stalks first, standing ears on top
  const stand: [number, number, number][] = [];
  for (let c = 0; c < cols; c++) for (let rw = 0; rw < rows; rw++) {
    const id = c * rows + rw, x = X0 + 3 + (c + a.r(id) * .8) * (IW - 6) / cols, y = Y0 + 4 + (rw + a.r(id + 500) * .7) * (IH - 6) / rows;
    const seg = Math.min(n - 1, Math.floor((x - X0) / sw)), P = piv(seg), an = Math.atan2(x - P.x, -(y - P.y));
    const cut = seg < a.step || (seg === a.step && an < ang && a.f > .08) || a.k >= 1;
    if (cut) { circ(g, x, y, .9, '#d8c080'); const fall = an + .9; line(g, x, y, x + Math.sin(fall) * 9, y - Math.cos(fall) * 3, 1.3, '#e8cc78'); ell(g, x + Math.sin(fall) * 10, y - Math.cos(fall) * 3.4, 2.6, 1.3, fall - Math.PI / 2, '#d8a844'); }
    else stand.push([x, y, id]);
  }
  for (const [x, y, id] of stand) { const s = Math.sin(a.t * 2.2 + x * .06) * .6; ell(g, x + s + .8, y + 1.2, 2.6, 1.5, .5, '#5e4a20'); ell(g, x + s, y, 2.6, 1.7, .5 + a.r(id + 900) * .4, '#e8be4a'); line(g, x + s - 2, y - 1, x + s - 4, y - 3, .5, '#f8e090'); }
  // the sickle sweeping through the current third, with a motion smear
  if (a.step < n && a.f > .04 && a.f < .62) {
    const P = piv(a.step), R = 56;
    g.fillStyle = 'rgba(255,248,220,.22)'; g.beginPath(); g.moveTo(P.x, P.y); g.arc(P.x, P.y, R + 4, -Math.PI / 2 + Math.max(-1.35, ang - .7), -Math.PI / 2 + ang); g.closePath(); g.fill();
    at(g, P.x, P.y, ang, 1, () => {
      line(g, 0, 0, 0, -R + 16, 4, '#8a5a2a');
      g.fillStyle = '#d8dde4'; g.beginPath(); g.moveTo(-1, -R + 16); g.quadraticCurveTo(10, -R - 6, 26, -R + 6); g.quadraticCurveTo(10, -R + 2, 2, -R + 20); g.closePath(); g.fill();
      line(g, 4, -R + 10, 22, -R + 5, .8, '#ffffff');
    });
  }
}

/** cabbage, lettuce, celery, fennel, rhubarb: heads from above, pulled out one after the other (tug, tug, out) */
function pullTop(g: Ctx, a: BarArgs) {
  soilTop(g, a);
  for (let i = 0; i < 3; i++) line(g, X0, Y0 + 10 + i * 14, X1, Y0 + 10 + i * 14, 1, 'rgba(40,24,10,.35)');
  const n = a.n, sw = IW / n, R = Math.min(19, sw * .42);
  for (let i = 0; i < n; i++) {
    const x = X0 + sw * (i + .5), y = 30;
    const rhu = a.v === 'rhubarb';
    const hole = () => { if (rhu) { topHead(g, 'rhubarb', x, y, R * .45, a, i, a.t); return; } ell(g, x, y, R * .55, R * .42, 0, '#2e1c0e'); for (let q = 0; q < 6; q++) circ(g, x + (a.r(i * 10 + q) - .5) * R * 1.6, y + (a.r(i * 10 + q + 5) - .5) * R * 1.2, 1.4, '#8a6440'); };
    if (i < a.step || a.k >= 1) { hole(); continue; }
    if (i > a.step) { topHead(g, a.v, x, y, R, a, i, a.t); continue; }
    const f = a.f;
    a.hit('t' + i, f > .12, 'tug'); a.hit('u' + i, f > .34, 'tug'); a.hit('p' + i, f > .56, 'pull');
    if (f < .56) { const w = Math.sin(f * 46) * .18 * sm(0, .2, f); at(g, x, y, w, 1 + f * .12, () => topHead(g, a.v, 0, 0, R, a, i, a.t)); }
    else {
      hole(); const u = sm(.56, 1, f), s = 1.07 + u * .55;
      g.globalAlpha = 1 - sm(.75, 1, f);
      ell(g, x + 4, y + 6, R * .9 * (1 - u * .5), R * .7 * (1 - u * .5), 0, 'rgba(0,0,0,.25)');
      at(g, x + u * 14, y - u * 16, u * .8, s, () => {
        if (rhu) { for (let q = 0; q < 3; q++) { const an = -.4 + q * .4; line(g, 0, 0, Math.cos(an) * R, Math.sin(an) * R, 3, '#c83848'); ell(g, Math.cos(an) * R * 1.2, Math.sin(an) * R * 1.2, R * .45, R * .32, an, '#4a8a34'); } return; }
        for (let q = 0; q < 5; q++) line(g, 0, 0, (q - 2) * 3, 10 + q % 2 * 3, 1, '#e8dcc0'); topHead(g, a.v, 0, 0, R, a, i, a.t); });
      g.globalAlpha = 1;
    }
  }
}

/** carrots, radishes, onions, garlic, leek, mushrooms: side view with the soil cut open, pulled straight up and laid on the ground */
const ROOT_LEN: Record<string, number> = { carrot: 19, leek: 19, onion: 14, garlic: 13, radish: 12, mushroom: 6 };
function rootSide(g: Ctx, a: BarArgs, per: number) {
  const gy = 33; soilSide(g, a, gy);
  const LIFT = (ROOT_LEN[a.v] ?? 12) + 2;
  const n = a.n, sw = IW / n, m = Math.max(1, Math.min(3, per)), gap = Math.min(16, sw / (m + .6));
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const x = X0 + sw * (i + .5) + (j - (m - 1) / 2) * gap, id = i * 4 + j;
    const laid = () => { ell(g, x, gy + 4, 5, 2.4, 0, '#3a2412'); rootLaid(g, a.v, x - 6 + j * 2, gy - 3 - j * 1.5); };
    if (i < a.step || a.k >= 1) { laid(); continue; }
    if (i > a.step) { rootCrop(g, a.v, x, gy, Math.sin(a.t * 2 + id) * .06); continue; }
    const f0 = j / m * .5, f = cl((a.f - f0) / .5);
    a.hit('p' + id, f > .55, a.v === 'mushroom' ? 'twist' : 'pull');
    if (f < .55) { const w = a.v === 'mushroom' ? Math.sin(f * 40) * .25 : Math.sin(f * 50) * .1 * sm(.05, .3, f); at(g, x, gy, w, 1, () => rootCrop(g, a.v, 0, -f * 2, w)); }
    else if (f < .85) { const u = sm(.55, .85, f), lift = easeOutBack(u) * LIFT; ell(g, x, gy + 4, 5, 2.4, 0, '#3a2412'); for (let q = 0; q < 3; q++) circ(g, x + (q - 1) * 4, gy - 2 - u * 6 * (q % 2 + 1), 1, '#7a5434'); at(g, x, gy - lift, u * .3, 1, () => rootCrop(g, a.v, 0, 0, 0)); }
    else { const u = sm(.85, 1, f); ell(g, x, gy + 4, 5, 2.4, 0, '#3a2412'); at(g, lerp(x, x - 6 + j * 2, u), lerp(gy - LIFT, gy - 3 - j * 1.5, u), lerp(.3, -Math.PI / 2 * .92, u), lerp(1, .9, u), () => rootCrop(g, a.v, 0, 0, 0)); }
  }
}

/** potatoes: a digging fork goes in, levers the plant up, the tubers roll out of the soil */
function dig(g: Ctx, a: BarArgs) {
  const gy = 28; soilSide(g, a, gy);
  const n = a.n, sw = IW / n;
  for (let i = 0; i < n; i++) {
    const x = X0 + sw * (i + .5), pot = [[-9, 12], [2, 16], [10, 10]];
    const tuber = (px: number, py: number, s = 1, rot = 0) => { ell(g, px, py, 5 * s, 3.8 * s, rot, '#c89a5a'); circ(g, px - 1.6 * s, py - .6 * s, .7, '#8a6430'); circ(g, px + 1.8 * s, py + .8 * s, .6, '#8a6430'); };
    const plant = (dx: number, dy: number, rot: number) => at(g, x + dx, gy + dy, rot, 1, () => { line(g, 0, 0, 0, -10, 1.6, '#4a7a2c'); for (let q = 0; q < 6; q++) circ(g, (q - 2.5) * 4, -10 - (q % 2) * 4, 4, q % 2 ? '#5e9a38' : '#4e8a30'); circ(g, 2, -18, 1.5, '#f0e8f8'); });
    const out = () => { ell(g, x, gy + 6, 12, 4, 0, '#3a2412'); for (let q = 0; q < 3; q++) tuber(x - 10 + q * 9, gy - 3 - (q % 2), .95, q * .7); };
    if (i < a.step || a.k >= 1) { out(); continue; }
    if (i > a.step) { for (const [px, py] of pot) tuber(x + px, gy + py); line(g, x, gy, x - 2, gy + 10, .8, '#9a7a50'); plant(0, 0, Math.sin(a.t * 2 + i) * .04); continue; }
    const f = a.f, down = sm(0, .28, f), lever = sm(.3, .55, f), up = sm(.55, .95, f);
    a.hit('d' + i, f > .26, 'dig'); a.hit('o' + i, f > .6, 'pop');
    if (up <= 0) { for (const [px, py] of pot) tuber(x + px, gy + py - lever * 4); plant(0, -lever * 4, -lever * .2); }
    else {
      ell(g, x, gy + 6, 12 * up, 4 * up, 0, '#3a2412');
      pot.forEach(([px, py], q) => { const tx = x - 10 + q * 9, ty = gy - 3 - (q % 2), u = sm(q * .12, .7 + q * .1, up); tuber(lerp(x + px, tx, u), lerp(gy + py, ty, u) - Math.sin(u * Math.PI) * 14, lerp(1, .95, u), u * q * .7); });
      g.globalAlpha = 1 - up; plant(up * 20, -up * 12, up * 1.2); g.globalAlpha = 1;
    }
    // the fork (handle + 4 tines), from top right, pushed in, then levered back
    if (f < .7) {
      g.globalAlpha = 1 - sm(.6, .7, f);
      at(g, x + 14, gy - 34 + down * 34, -.25 - lever * .5, 1, () => { line(g, 0, -26, 0, 0, 3, '#8a5a2a'); line(g, -3, -26, 3, -26, 3, '#8a5a2a'); line(g, -5, 0, 5, 0, 2, '#9aa0a8'); for (let q = 0; q < 4; q++) line(g, -4.5 + q * 3, 0, -4.5 + q * 3, 13, 1.4, '#b8bec6'); });
      g.globalAlpha = 1;
    }
  }
}

/** asparagus: the spears are cut below the soil with a long asparagus knife and laid down */
function asparagus(g: Ctx, a: BarArgs) {
  const gy = 30; soilSide(g, a, gy);
  const n = a.n, sw = IW / n;
  const spear = (x: number, y: number, rot: number) => at(g, x, y, rot, 1, () => { g.fillStyle = '#f0ecd8'; rr(g, -2.4, 0, 4.8, 12, 2); g.fill(); g.fillStyle = '#7ab048'; rr(g, -2.6, -16, 5.2, 17, 2.4); g.fill(); g.fillStyle = '#5a8a3a'; g.beginPath(); g.moveTo(-2.6, -15); g.quadraticCurveTo(0, -22, 2.6, -15); g.fill(); for (let q = 0; q < 3; q++) line(g, -2, -12 + q * 4, 0, -13 + q * 4, .8, '#9a6aa0'); });
  for (let i = 0; i < n; i++) {
    const x = X0 + sw * (i + .5);
    for (let q = 0; q < 2; q++) { const yx = x + (q ? 14 : -15); at(g, yx, gy, 0, 1, () => { g.fillStyle = '#8ac058'; rr(g, -1.6, -5 - q * 2, 3.2, 6 + q * 2, 1.4); g.fill(); }); } // young spears stay
    if (i < a.step || a.k >= 1) { spear(x - 2, gy - 3, -Math.PI / 2 * .95); continue; }
    if (i > a.step) { spear(x, gy, Math.sin(a.t * 2 + i) * .03); continue; }
    const f = a.f, knife = sm(0, .45, f), lift = sm(.5, .78, f), lay = sm(.78, 1, f);
    a.hit('c' + i, f > .46, 'cut');
    spear(lerp(x, x - 2, lay), lerp(gy - lift * 18, gy - 3, lay) , lerp(0, -Math.PI / 2 * .95, lay));
    if (f < .6) { g.globalAlpha = 1 - sm(.5, .6, f); at(g, x + 22 - knife * 20, gy - 18 + knife * 28, .8, 1, () => { line(g, 0, -14, 0, -2, 3.4, '#6a4424'); g.fillStyle = '#c8ccd4'; g.beginPath(); g.moveTo(-1.5, -2); g.lineTo(1.5, -2); g.lineTo(1, 14); g.lineTo(-1, 16); g.lineTo(-2, 14); g.closePath(); g.fill(); }); g.globalAlpha = 1; }
  }
}

/** peas, beans, tomatoes, peppers, chili, aubergines, courgettes: the plant in side view, every fruit is picked (or cut) and drops into the crate */
function pick(g: Ctx, a: BarArgs, per: number) {
  const knife = a.v === 'pepper' || a.v === 'eggplant' || a.v === 'zucchini' || a.v === 'chili';
  const vine = a.v === 'pea' || a.v === 'bean';
  // leaves + stems across the top, a pole for climbers
  for (let i = 0; i < 9; i++) { const x = X0 + 10 + i * 27; if (vine) line(g, x, Y0, x, 44, 1.2, '#8a6a3a'); line(g, x, Y0, x + Math.sin(a.t + i) * 2, 38, 1.4, '#4a7a2c'); }
  for (let i = 0; i < 26; i++) { const x = X0 + a.r(2000 + i) * IW, y = Y0 + 2 + a.r(2100 + i) * 24, sw = Math.sin(a.t * 1.6 + i) * .15; ell(g, x, y, 6, 3.4, a.r(2200 + i) * 3 + sw, i % 3 ? '#4e8a30' : '#3e7426'); }
  // crate
  g.fillStyle = '#8a6034'; g.fillRect(X0, 44, IW, Y1 - 44); for (let i = 0; i < 2; i++) line(g, X0, 47 + i * 4, X1, 47 + i * 4, .8, '#6a4424'); for (let i = 0; i < 8; i++) line(g, X0 + i * IW / 7, 44, X0 + i * IW / 7, Y1, 1.4, '#5a3a1a');
  const n = a.n, sw = IW / n, m = Math.max(1, Math.min(4, per)), sz = m >= 3 ? .8 : 1;
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const id = i * 4 + j, x = X0 + sw * (i + .5) + (j - (m - 1) / 2) * Math.min(14, sw / (m + .5)), y = Y0 + 10 + (j % 2) * 6 + a.r(id + 30) * 4;
    const cx = x + (a.r(id + 60) - .5) * 6, cy = 44 + (a.r(id + 90)) * 2, crot = Math.PI / 2 * (a.r(id + 99) > .5 ? 1 : -1) * .8;
    const inCrate = () => fruit(g, a.v, cx, cy - 4, sz * .85, crot);
    if (i < a.step || a.k >= 1) { inCrate(); continue; }
    const sway = Math.sin(a.t * 1.8 + id) * .1;
    if (i > a.step) { fruit(g, a.v, x, y, sz, sway); continue; }
    const f0 = (j / m) * .75, fr = cl((a.f - f0) / (.75 / m + .12));
    const tt = a.hit('f' + id, fr > .55, knife ? 'snip' : 'pluck');
    if (tt < 0) {
      const tug = fr > .3 ? Math.sin(fr * 60) * .15 : 0; fruit(g, a.v, x, y, sz, sway + tug);
      if (fr > 0) { // the hand / the knife comes to the fruit
        const hx = lerp(x + 12, x + 3, sm(0, .4, fr)), hy = y + 4;
        if (knife) at(g, hx, hy, -.6, 1, () => { line(g, 0, 0, 7, 0, 3, '#6a4424'); g.fillStyle = '#d0d4dc'; g.beginPath(); g.moveTo(0, -1.5); g.lineTo(-9, 0); g.lineTo(0, 1.5); g.fill(); });
        else { circ(g, hx + 3, hy, 4.2, '#e8b890'); for (let q = 0; q < 3; q++) ell(g, hx - 1, hy - 3 + q * 2.6, 2.6, 1.1, 0, '#e0aa80'); }
      }
    } else { const u = cl(tt / .35); if (u < 1) fruit(g, a.v, lerp(x, cx, u), lerp(y, cy - 4, u * u), sz * lerp(1, .85, u), lerp(sway, crot, u)); else inCrate(); if (u >= 1) a.hit('l' + id, true, 'thunk'); }
  }
}

/** sweet corn: three tall stalks, every ear is bent down and snapped off */
function corn(g: Ctx, a: BarArgs) {
  grassBg(g, a, 48);
  const n = a.n, sw = IW / n;
  for (let i = 0; i < n; i++) {
    const x = X0 + sw * (i + .5), sway = Math.sin(a.t * 1.5 + i) * .03;
    at(g, x, Y1, sway, 1, () => {
      line(g, 0, 0, 0, -48, 3, '#6a9a3a');
      for (let q = 0; q < 4; q++) { const y = -10 - q * 9, d = q % 2 ? 1 : -1; g.strokeStyle = '#5a8a30'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(d * 14, y - 8, d * 22, y + 2); g.stroke(); }
      line(g, 0, -48, -4, -54, 1.2, '#d8b860'); line(g, 0, -48, 4, -54, 1.2, '#d8b860');
    });
    const ex = x + 5, ey = 18;
    if (i < a.step || a.k >= 1) { fruit(g, 'corn', x + 16, Y1 - 3, .85, -Math.PI / 2); continue; }
    if (i > a.step) { fruit(g, 'corn', ex, ey, 1, -.35 + sway); continue; }
    const f = a.f, bend = sm(.1, .5, f), tt = a.hit('c' + i, f > .5, 'snap');
    if (tt < 0) { fruit(g, 'corn', ex, ey, 1, -.35 + bend * 1.6); circ(g, ex + 5, ey + 9 - bend * 4, 4, '#e8b890'); }
    else { const u = cl(tt / .4); fruit(g, 'corn', lerp(ex, x + 16, u), lerp(ey, Y1 - 3, u * u), lerp(1, .85, u), lerp(1.25, -Math.PI / 2, u)); }
  }
}

/** pumpkin, melon: big fruits on a creeping vine, the stem is cut and the fruit rolls aside */
function bigFruit(g: Ctx, a: BarArgs) {
  grassBg(g, a, 40);
  g.strokeStyle = '#4a7a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(X0, 30); for (let x = X0; x <= X1; x += 8) g.lineTo(x, 30 + Math.sin(x * .07) * 4); g.stroke();
  for (let i = 0; i < 10; i++) { const x = X0 + 8 + i * 24; ell(g, x, 24 + Math.sin(x * .07) * 4, 7, 5, i, '#3e7a2c'); }
  const n = a.n, sw = IW / n, mel = a.v === 'melon';
  const body = (x: number, y: number, rot: number, s = 1) => at(g, x, y, rot, s, () => {
    if (mel) { ell(g, 0, 0, 15, 11, 0, '#3e8a3a'); for (let q = -2; q <= 2; q++) { g.strokeStyle = '#2a5a24'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, Math.abs(q) * 5 + 1, 11, 0, -Math.PI / 2, Math.PI / 2, q < 0); g.stroke(); } ell(g, -5, -5, 4, 2, -.4, 'rgba(255,255,255,.25)'); }
    else { for (let q = -2; q <= 2; q++) ell(g, q * 5, 0, 7, 11, 0, q % 2 ? '#e07a1e' : '#f08a28'); ell(g, -5, -5, 3, 2, -.4, 'rgba(255,255,255,.3)'); line(g, 0, -10, 2, -15, 3, '#5a6a2a'); }
  });
  for (let i = 0; i < n; i++) {
    const x = X0 + sw * (i + .5), y = 40;
    if (i < a.step || a.k >= 1) { body(x + 18, y + 2, 0, .8); continue; }
    if (i > a.step) { body(x, y, 0); line(g, x, y - 11, x - 2, 30, 1.6, '#4a7a2a'); continue; }
    const f = a.f, tt = a.hit('c' + i, f > .4, 'cut');
    if (tt < 0) { body(x, y, 0); line(g, x, y - 11, x - 2, 30, 1.6, '#4a7a2a'); const kx = lerp(x + 14, x + 1, sm(0, .38, f)); at(g, kx, y - 18, -.3, 1, () => { line(g, 0, 0, 8, 0, 3, '#6a4424'); g.fillStyle = '#d0d4dc'; g.beginPath(); g.moveTo(0, -1.6); g.lineTo(-10, 0); g.lineTo(0, 1.6); g.fill(); }); }
    else { const u = sm(0, 1, cl(tt / .7)); if (u > .95) a.hit('t' + i, true, 'thud'); body(lerp(x, x + 18, u), y + 2 * u - Math.sin(u * Math.PI) * 6, u * TAU, lerp(1, .8, u)); line(g, x - 1, y - 14, x - 2, 30, 1.6, '#4a7a2a'); }
  }
}

/** berries, eggs, sticks, stones: the bar is made of them, the basket / bundle walks from left to right and they hop in (plop!) */
function collect(g: Ctx, a: BarArgs) {
  const v = a.v, many = v === 'blue' || v === 'bramble' || v === 'strawb';
  // background per kind
  if (v === 'blue') { g.fillStyle = '#2e4e2a'; g.fillRect(X0, Y0, IW, IH); for (let i = 0; i < 34; i++) ell(g, X0 + a.r(3000 + i) * IW, Y0 + a.r(3100 + i) * IH, 6, 3.4, a.r(3200 + i) * 3, i % 2 ? '#3e6a34' : '#4a7a3a'); }
  else if (v === 'bramble') { g.fillStyle = '#2a3a22'; g.fillRect(X0, Y0, IW, IH); for (let i = 0; i < 7; i++) { g.strokeStyle = '#6a3a3a'; g.lineWidth = 1.6; g.beginPath(); const y = Y0 + 6 + i * 7; g.moveTo(X0, y); g.bezierCurveTo(X0 + 70, y - 10, X0 + 150, y + 10, X1, y - 2); g.stroke(); } for (let i = 0; i < 26; i++) ell(g, X0 + a.r(3000 + i) * IW, Y0 + a.r(3100 + i) * IH, 5, 3, a.r(3200 + i) * 3, '#3e6230'); }
  else if (v === 'strawb') { g.fillStyle = '#c8a860'; g.fillRect(X0, Y0, IW, IH); for (let i = 0; i < 50; i++) { const x = X0 + a.r(3000 + i) * IW, y = Y0 + a.r(3100 + i) * IH; line(g, x, y, x + 5, y + (a.r(3200 + i) - .5) * 4, .8, '#e8d088'); } for (let i = 0; i < 14; i++) { const x = X0 + a.r(3300 + i) * IW, y = Y0 + a.r(3400 + i) * IH; for (let q = 0; q < 3; q++) ell(g, x + Math.cos(q * 2.1) * 4, y + Math.sin(q * 2.1) * 4, 4, 2.8, q * 2.1, '#3e7a2c'); } }
  else if (v === 'egg') { g.fillStyle = '#8a6a3a'; g.fillRect(X0, Y0, IW, IH); for (let i = 0; i < 90; i++) { const x = X0 + a.r(3000 + i) * IW, y = Y0 + a.r(3100 + i) * IH, an = a.r(3200 + i) * 3; line(g, x, y, x + Math.cos(an) * 7, y + Math.sin(an) * 7, .9, i % 2 ? '#e8cc78' : '#c8a850'); } }
  else grassBg(g, a, Y0);
  const N = many ? 34 : v === 'egg' ? 4 + 4 * 0 : v === 'wood' ? 7 : 8, bw = 30;
  const bx = X0 + 4 + a.k * (IW - 8);           // basket centre
  let inB = 0;
  for (let i = 0; i < N; i++) {
    const x = X0 + bw / 2 + 4 + (i + a.r(i) * .9) * (IW - bw - 8) / N, y = Y0 + 6 + a.r(i + 40) * (IH - 14), rot = a.r(i + 80) * 3;
    const s = many ? .95 + a.r(i + 120) * .3 : 1.1;
    const tt = a.hit('b' + i, bx >= x - 2, many ? 'plop' : v === 'egg' ? 'egg' : v === 'wood' ? 'wood' : 'stone');
    if (tt < 0) { berry(g, v, x, y, s, rot); continue; }
    const u = cl(tt / .22);
    if (u < 1) berry(g, v, lerp(x, bx, u), lerp(y, 40, u) - Math.sin(u * Math.PI) * 12, s * (1 - u * .3), rot);
    else inB++;
  }
  // the carrier: a woven basket (berries, eggs), a rope bundle for sticks, a sack for stones
  const by = 44, fillK = inB / N;
  if (v === 'wood') { for (let q = 0; q < Math.min(inB, 7); q++) berry(g, 'wood', bx, by + 6 - q * 3.2, 1, (q % 2 - .5) * .15); line(g, bx - 3, by + 9, bx - 3, by + 6 - Math.min(inB, 7) * 3.2, 1.2, '#d8c088'); return; }
  if (v === 'stone') { g.fillStyle = '#b89a68'; g.beginPath(); g.moveTo(bx - 12, Y1); g.quadraticCurveTo(bx - 15, by - 4 - fillK * 6, bx - 6, by - 8 - fillK * 6); g.lineTo(bx + 6, by - 8 - fillK * 6); g.quadraticCurveTo(bx + 15, by - 4 - fillK * 6, bx + 12, Y1); g.fill(); line(g, bx - 6, by - 8 - fillK * 6, bx + 6, by - 8 - fillK * 6, 1.6, '#7a5a30'); return; }
  for (let q = 0; q < Math.min(inB, 16); q++) berry(g, v, bx - 10 + (q % 6) * 4 + (q > 5 ? 2 : 0), by - 2 - Math.floor(q / 6) * 3 - fillK * 2, .8, q);
  g.strokeStyle = '#7a5430'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(bx, by - 2, 12, 12, 0, Math.PI, TAU); g.stroke();
  g.fillStyle = '#a87a44'; g.beginPath(); g.moveTo(bx - 15, by - 2); g.lineTo(bx + 15, by - 2); g.lineTo(bx + 11, Y1 + 2); g.lineTo(bx - 11, Y1 + 2); g.closePath(); g.fill();
  for (let q = 0; q < 3; q++) line(g, bx - 14 + q * .8, by + 1 + q * 3.4, bx + 14 - q * .8, by + 1 + q * 3.4, .9, '#7a5430');
  for (let q = 0; q < 6; q++) line(g, bx - 12 + q * 4.8, by - 2, bx - 9.5 + q * 3.8, Y1 + 2, .7, '#8a6236');
}

/** apple / nut tree: the crown shakes, a group of fruits falls per pass and bounces on the grass */
function tree(g: Ctx, a: BarArgs, per: number) {
  grassBg(g, a, 44);
  const n = a.n, sw = IW / n, shake = a.step < n && a.f < .6 ? Math.sin(a.t * 55) * 2.2 * (1 - a.f / .6) : 0;
  if (a.step < n) a.hit('s' + a.step, a.f > .02, 'rustle');
  for (const tx of [X0 + IW * .25, X0 + IW * .72]) { g.fillStyle = '#6a4a2a'; g.fillRect(tx - 4, 24, 8, 24); }
  g.save(); g.translate(shake, 0);
  for (let i = 0; i < 16; i++) circ(g, X0 + 6 + i * (IW - 12) / 15, 14 + (i % 3) * 4, 12 + (i % 2) * 3, i % 2 ? '#3e7a2c' : '#4e8a34');
  g.restore();
  const m = Math.max(1, Math.min(4, per)), item = a.v === 'nut' ? 'nut' : 'apple';
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const id = i * 4 + j, x = X0 + sw * (i + .5) + (j - (m - 1) / 2) * 13, y = 14 + a.r(id) * 14, gx = x + (a.r(id + 9) - .5) * 10, gyy = 50;
    if (i > a.step && a.k < 1) { berry(g, item, x + shake, y, 1); continue; }
    const fallT = i < a.step || a.k >= 1 ? 9 : a.hit('f' + id, a.f > .22 + j * .1, 'leaf');
    if (fallT < 0) { berry(g, item, x + shake, y, 1); continue; }
    // falling with gravity, two small bounces
    const T = fallT, tFall = Math.sqrt(2 * (gyy - y) / 900);
    let py: number;
    if (T < tFall) py = y + 450 * T * T; else { const b = T - tFall; py = gyy - Math.max(0, Math.sin(Math.min(1, b / .25) * Math.PI) * 5) - Math.max(0, Math.sin(cl((b - .25) / .15) * Math.PI) * 1.6); if (T < 8) a.hit('h' + id, true, 'thud'); }
    berry(g, item, lerp(x, gx, cl(T / (tFall + .4))), py, 1, T * 4);
  }
}

/** weeding with the hand rake: the claws scratch at each tuft, it flips out with a puff of soil */
function weed(g: Ctx, a: BarArgs) {
  soilTop(g, a, '#74513a');
  const n = Math.max(1, a.n), hof = a.v === 'hof', sw = IW / n, m = hof ? 4 : 1;
  const tuft = (x: number, y: number, s: number, kind: number, rot: number) => at(g, x, y, rot, s, () => {
    if (kind === 1) { for (let q = 0; q < 6; q++) { const an = q / 6 * TAU; ell(g, Math.cos(an) * 5, Math.sin(an) * 5, 5, 1.8, an, '#5e9a34'); } circ(g, 0, 0, 2.4, '#f0c820'); }
    else if (kind === 2) { for (let q = 0; q < 4; q++) { const an = q / 4 * TAU + .4; ell(g, Math.cos(an) * 5, Math.sin(an) * 5, 6, 2.6, an, '#4e8a2c'); } }
    else for (let q = 0; q < 9; q++) { const an = q / 9 * TAU; line(g, 0, 0, Math.cos(an) * 8, Math.sin(an) * 8, 1.4, q % 2 ? '#6aa63a' : '#4e8a2c'); }
  });
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const id = i * 4 + j, x = X0 + sw * (i + .5) + (hof ? (j - 1.5) * 34 : 0), y = 30 + (hof ? (j % 2 - .5) * 14 : 0), kind = hof ? j % 3 : 0, s = hof ? 1 : 1.5;
    if (i < a.step || a.k >= 1) { ell(g, x, y, 5 * s, 3.4 * s, 0, '#4a2c16'); continue; }
    if (i > a.step) { tuft(x, y, s, kind, Math.sin(a.t * 2 + id) * .05); continue; }
    const f0 = j / m * .6, fr = cl((a.f - f0) / (hof ? .5 : 1));
    const scratch = fr < .6 ? Math.sin(fr * 40) : 0, tt = a.hit('w' + id, fr > .6, 'scratch');
    if (tt < 0) {
      tuft(x, y, s, kind, scratch * .08);
      if (fr > 0) at(g, x + 9 + scratch * 5, y + 8, -.6, 1, () => { line(g, 0, 0, 10, 10, 3, '#8a5a2a'); for (let q = 0; q < 3; q++) { g.strokeStyle = '#a8aeb6'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-4 + q * 4, -6, -6 + q * 6, -4); g.stroke(); } });
    } else {
      ell(g, x, y, 5 * s, 3.4 * s, 0, '#4a2c16'); const u = cl(tt / .4);
      if (u < 1) { g.globalAlpha = 1 - u; tuft(x + u * 16, y - u * 18, s * (1 + u * .4), kind, u * 3); for (let q = 0; q < 5; q++) circ(g, x + (a.r(id * 7 + q) - .5) * 20 * u, y - (a.r(id * 7 + q + 3)) * 16 * u, 1.2, '#8a6440'); g.globalAlpha = 1; }
    }
  }
}

/** sowing: the hand walks along the furrow, seeds drop in and the soil closes behind it */
const SEED: Record<string, [string, number]> = { wheat: ['#d8b870', 1.4], pea: ['#b8d080', 2.2], bean: ['#e8dcc0', 2.4], corn: ['#e8c840', 2.2], pumpkin: ['#f0e4c0', 2.2], melon: ['#2a2018', 1.8], zucchini: ['#f0e8d0', 2], potato: ['#c89a5a', 3.2], garlic: ['#eee6da', 2.6], onion: ['#d8a850', 2.6], asp: ['#8a7a5a', 2.4], rhubarb: ['#a84848', 2.8], strawb: ['#5a9a34', 2.6], leek: ['#3a3a3a', 1.2] };
function sow(g: Ctx, a: BarArgs) {
  soilTop(g, a, '#7a5638');
  const [col, sz] = SEED[a.v] ?? ['#3a2a1a', 1.2], N = 18, hx = X0 + 8 + a.k * (IW - 16);
  for (let row = 0; row < 2; row++) {
    const y = 22 + row * 16;
    g.fillStyle = '#4a2e18'; g.fillRect(X0 + 4, y - 2.4, Math.max(0, hx - X0 - 4) + 2, 4.8);
    g.fillStyle = '#5a3a20'; g.fillRect(hx, y - 2.4, X1 - 4 - hx, 4.8);
    for (let i = 0; i < N; i++) {
      const x = X0 + 10 + (i + .5) * (IW - 20) / N + row * 4;
      const tt = a.hit('s' + row + '_' + i, hx > x + 4, row ? undefined : 'seed');
      if (tt < 0) continue;
      const u = cl(tt / .18), close = cl((tt - .35) / .4);
      circ(g, x, y - (1 - u) * 6, sz * (1 + (1 - u) * .8), col);
      if (close > 0) { g.globalAlpha = close; ell(g, x, y, 4.6, 3, 0, '#8a6440'); g.globalAlpha = 1; }
    }
  }
  // the hand with a pinch of seeds
  at(g, hx, 26, 0, 1, () => { ell(g, 4, -4, 6, 5, .3, '#e8b890'); for (let q = 0; q < 3; q++) ell(g, -1 + q * 2.4, 1.5, 1.4, 2.6, 0, '#e0aa80'); const p = (a.t * 6) % 1; circ(g, 0, 6 + p * 8, sz, col); });
}

/** the watering can in profile, cut open so the water inside shows (scale s, tilt rot). lvl = 0..1.
 *  Low and wide so it reads as a bar: body -70..70 x -14..22, handle arc on top, spout up to the right. */
const CAN = { L: -70, R: 62, T: -12, B: 22, tipX: 104, tipY: -22 };
function canTip(x: number, y: number, s: number, rot: number) { const c = Math.cos(rot), sn = Math.sin(rot); return { x: x + s * (CAN.tipX * c - CAN.tipY * sn), y: y + s * (CAN.tipX * sn + CAN.tipY * c) }; }
function wateringCan(g: Ctx, x: number, y: number, s: number, rot: number, lvl: number, t: number, cap: number, small = false, slosh = 1) {
  at(g, x, y, rot, s, () => {
    const { L, R, T, B } = CAN;
    // spout + rose
    g.fillStyle = '#5e8aa0'; g.beginPath(); g.moveTo(R - 4, B - 8); g.lineTo(R + 36, T - 8); g.lineTo(R + 40, T - 3); g.lineTo(R + 2, B); g.closePath(); g.fill();
    g.fillStyle = '#4a7088'; g.save(); g.translate(CAN.tipX - 2, CAN.tipY + 3); g.rotate(-.6); rr(g, -6, -3.5, 12, 8, 2); g.fill(); g.restore();
    // handle on top + back grip
    g.strokeStyle = '#4a7088'; g.lineWidth = 5; g.beginPath(); g.moveTo(L + 14, T); g.quadraticCurveTo(-4, T - 18, R - 22, T); g.stroke();
    g.beginPath(); g.moveTo(L, T + 4); g.quadraticCurveTo(L - 14, (T + B) / 2, L, B - 6); g.stroke();
    g.fillStyle = '#6a98b0'; rr(g, L, T, R - L, B - T, 7); g.fill();
    g.save(); rr(g, L + 4, T + 4, R - L - 8, B - T - 8, 4); g.clip();
    g.fillStyle = '#23323c'; g.fillRect(L, T, R - L, B - T);
    const top = T + 4, bot = B - 4, wl = bot - (bot - top) * cl(lvl);
    if (lvl > .001) {
      const amp = (small ? 1.2 : 1.8) * slosh, tilt = Math.sin(t * 3.4) * .045 * slosh;
      const surf = (px: number) => wl + Math.sin(px * .09 + t * 5.5) * amp + Math.sin(px * .05 - t * 3.1) * amp * .6 + (px - (L + R) / 2) * tilt;
      const wg = g.createLinearGradient(0, top, 0, bot); wg.addColorStop(0, '#5ab0ff'); wg.addColorStop(1, '#1e5ab8');
      g.fillStyle = wg; g.beginPath(); g.moveTo(L, bot + 2);
      for (let px = L; px <= R; px += 4) g.lineTo(px, surf(px));
      g.lineTo(R, bot + 2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(210,240,255,.85)'; g.lineWidth = 1.4; g.beginPath();
      for (let px = L; px <= R; px += 4) px === L ? g.moveTo(px, surf(px)) : g.lineTo(px, surf(px)); g.stroke();
      for (let i = 0; i < 7; i++) { const p = (t * .7 + i / 7) % 1, bx = L + 12 + i * 17 + Math.sin(t * 3 + i) * 3, by = bot - p * (bot - wl); if (by > wl + 2) { g.strokeStyle = 'rgba(220,245,255,.6)'; g.lineWidth = 1; g.beginPath(); g.arc(bx, by, 1 + i % 2, 0, TAU); g.stroke(); } }
    }
    g.restore();
    // rim + charge marks along the bottom (one per watering): filled ones light up
    g.strokeStyle = '#3e6478'; g.lineWidth = 2.6; rr(g, L + 2, T + 2, R - L - 4, B - T - 4, 5.5); g.stroke();
    if (!small) for (let i = 0; i < cap; i++) { const mx = L + 10 + i * (R - L - 20) / Math.max(1, cap - 1), on = lvl * cap > i + .5; circ(g, mx, B + 4.5, 2.2, on ? '#8fd0ff' : '#2a3a46'); }
    ell(g, L + 18, T + 6, 12, 2.4, 0, 'rgba(255,255,255,.18)');
  });
}

/** watering: the can (cut open, its real level) walks along and pours, the soil darkens behind it */
function water(g: Ctx, a: BarArgs) {
  const gy = 42, s = .38, rot = .42;
  const cx = X0 + 26 + a.k * (IW - 76), cy = 24, tip = canTip(cx, cy, s, rot), sx = tip.x;
  g.fillStyle = '#a07a50'; g.fillRect(X0, gy, IW, Y1 - gy);
  const wet = g.createLinearGradient(sx - 8, 0, sx + 8, 0); wet.addColorStop(0, '#4e3420'); wet.addColorStop(1, 'rgba(78,52,32,0)');
  g.fillStyle = '#4e3420'; g.fillRect(X0, gy, Math.max(0, sx - 8 - X0), Y1 - gy); g.fillStyle = wet; g.fillRect(sx - 8, gy, 16, Y1 - gy);
  for (let i = 0; i < 30; i++) { const x = X0 + a.r(5000 + i) * IW, y = gy + 2 + a.r(5100 + i) * (Y1 - gy - 2); circ(g, x, y, 1, x < sx ? '#3a2414' : '#8a6440'); }
  for (let i = 0; i < 9; i++) { const x = X0 + 6 + i * 26; for (let q = 0; q < 3; q++) ell(g, x + (q - 1) * 3, gy - 3, 1.4, 3.6, (q - 1) * .5, x < sx ? '#6ab040' : '#9aa858'); }
  if (a.k < 1) {
    for (let i = 0; i < 14; i++) { const p = (a.t * 2.6 + i / 14) % 1, x = sx + 1 + p * 5 + Math.sin(i * 7) * 2.4, y = tip.y + 2 + p * (gy - tip.y - 2); ell(g, x, y, 1, 1.9, 0, 'rgba(120,180,255,.85)'); }
    for (let i = 0; i < 3; i++) { const p = (a.t * 3 + i / 3) % 1; g.strokeStyle = `rgba(160,210,255,${1 - p})`; g.lineWidth = 1; g.beginPath(); g.ellipse(sx + 5, gy + 1, 2 + p * 7, 1 + p * 2, 0, 0, TAU); g.stroke(); }
  }
  wateringCan(g, cx, cy, s, rot, a.fill ?? .5, a.t, a.cap ?? 6, true);
}

/** filling the can at the well: the can in profile, the water rises to the real level and sloshes, a stream pours in from above */
function refill(g: Ctx, a: BarArgs) {
  const pour = a.k < 1 && a.f > .02 && a.f < .97;
  // slosh: strong while pouring, settles afterwards
  const slosh = pour ? 1.3 : .5;
  if (pour) { const sx = 82 + Math.sin(a.t * 9) * 1.2; g.fillStyle = 'rgba(110,180,255,.9)'; g.fillRect(sx - 2.5, Y0 - 6, 5, 40); for (let i = 0; i < 6; i++) { const p = (a.t * 3 + i / 6) % 1; ell(g, sx + Math.sin(i * 3 + a.t * 10) * 3, Y0 + p * 34, 1.2, 2.4, 0, 'rgba(200,235,255,.8)'); } }
  wateringCan(g, 124, 29, .86, 0, a.fill ?? 0, a.t, a.cap ?? 6, false, slosh);
  if (pour) { const sx = 82; for (let i = 0; i < 4; i++) { const p = (a.t * 2.5 + i / 4) % 1; circ(g, sx + (i - 1.5) * 4 * p, 26 - p * 6, 1.2 * (1 - p), 'rgba(220,245,255,.9)'); } }
}

/** drawing water into the barrel: wooden barrel, the bucket tips in, the level is the real one */
function barrel(g: Ctx, a: BarArgs) {
  grassBg(g, a, 50);
  const L = 70, R = 200, T = 12, B = 52, lvl = cl(a.fill ?? 0);
  g.fillStyle = '#8a5e34'; rr(g, L, T, R - L, B - T, 10); g.fill();
  g.save(); rr(g, L + 4, T + 4, R - L - 8, B - T - 8, 7); g.clip(); g.fillStyle = '#2a1c10'; g.fillRect(L, T, R - L, B - T);
  const wl = B - 4 - (B - T - 8) * lvl, wg = g.createLinearGradient(0, wl, 0, B); wg.addColorStop(0, '#5ab0ff'); wg.addColorStop(1, '#1e4a98'); g.fillStyle = wg;
  g.beginPath(); g.moveTo(L, B); for (let px = L; px <= R; px += 5) g.lineTo(px, wl + Math.sin(px * .08 + a.t * 5) * 1.6); g.lineTo(R, B); g.closePath(); g.fill(); g.restore();
  for (const yy of [T + 8, B - 8]) { g.strokeStyle = '#4a4a50'; g.lineWidth = 3; g.beginPath(); g.moveTo(L + 1, yy); g.lineTo(R - 1, yy); g.stroke(); }
  for (let i = 1; i < (a.cap ?? 10); i++) { const my = B - 4 - (B - T - 8) * i / (a.cap ?? 10); line(g, R - 10, my, R - 5, my, 1.2, 'rgba(255,255,255,.4)'); }
  // bucket tipping in from the left
  const tip = sm(.15, .5, a.f) * (1 - sm(.85, 1, a.f));
  at(g, L - 22, T + 4, tip * 1.6, 1, () => { g.fillStyle = '#8a8e96'; g.beginPath(); g.moveTo(-10, -10); g.lineTo(10, -10); g.lineTo(8, 10); g.lineTo(-8, 10); g.closePath(); g.fill(); line(g, -10, -10, 10, -10, 1.6, '#5a5e66'); });
  if (tip > .5 && a.k < 1) { g.fillStyle = 'rgba(110,180,255,.85)'; g.fillRect(L - 4, T + 4, 5, wl - T); }
}

/** repairing a trampled plot: clods, paw prints and holes; the rake combs it smooth from left to right */
function repair(g: Ctx, a: BarArgs) {
  soilTop(g, a, '#6b4a2e');
  const rx = X0 + 6 + a.k * (IW - 12), jig = Math.sin(a.t * 14) * 3;
  // combed part: neat furrows
  g.fillStyle = '#7e5a38'; g.fillRect(X0, Y0, Math.max(0, rx - X0), IH);
  for (let i = 0; i < 9; i++) line(g, X0, Y0 + 3 + i * 5.4, Math.max(X0, rx - 2), Y0 + 3 + i * 5.4, 1.4, '#5a3c22');
  // trampled part: clods, holes, paw prints
  for (let i = 0; i < 22; i++) { const x = X0 + a.r(6000 + i) * IW, y = Y0 + a.r(6100 + i) * IH; if (x < rx + 4) continue; ell(g, x, y, 3 + a.r(6200 + i) * 4, 2 + a.r(6300 + i) * 3, a.r(6400 + i) * 3, i % 3 ? '#4e321c' : '#8e6a44'); }
  for (let i = 0; i < 6; i++) { const x = X0 + 20 + i * 38, y = 18 + (i % 2) * 22; if (x < rx + 6) continue; circ(g, x, y, 2.6, '#3a2412'); for (let q = 0; q < 4; q++) circ(g, x - 3 + q * 2, y - 3.6 - (q % 3 === 0 ? 0 : 1), 1, '#3a2412'); }
  for (let i = 0; i < 3; i++) { const x = X0 + 50 + i * 70, y = 30 + (i % 2 - .5) * 10; if (x < rx + 4) continue; line(g, x - 10, y - 6, x + 8, y + 8, 2, '#4a7a2c'); ell(g, x + 9, y + 9, 3, 1.6, .6, '#6a9a3a'); } // flattened stalks
  if (a.k < 1) a.hit('r' + Math.floor(a.t * 2.3), true, 'scrape');
  // rake head + handle
  at(g, rx + jig, 30, 0, 1, () => { g.fillStyle = '#9aa0a8'; g.fillRect(-2, -24, 4, 48); for (let q = 0; q < 9; q++) line(g, -1, -22 + q * 5.4, -6, -22 + q * 5.4, 1.3, '#c0c6ce'); line(g, 2, 0, 30, 6, 3, '#8a5a2a'); });
}

/** fertilizing: dark compost is scattered from the hand in little fans */
function fertilize(g: Ctx, a: BarArgs) {
  soilTop(g, a, '#7a5638');
  const hx = X0 + 8 + a.k * (IW - 16);
  for (let i = 0; i < 90; i++) { const x = X0 + a.r(7000 + i) * IW, y = Y0 + a.r(7100 + i) * IH; if (x > hx) continue; circ(g, x, y, .9 + a.r(7200 + i) * 1.1, i % 3 ? '#2a1c10' : '#4a3018'); }
  if (a.k < 1) { for (let i = 0; i < 8; i++) { const p = (a.t * 2 + i / 8) % 1; circ(g, hx - p * 12 + Math.sin(i * 5) * 4, 20 + (i - 4) * 3 * p + p * 8, 1.2, '#2a1c10'); } a.hit('t' + Math.floor(a.k * 6), true, 'scatter'); }
  ell(g, hx + 4, 18, 6, 5, .3, '#e8b890'); for (let q = 0; q < 3; q++) ell(g, hx - 1 + q * 2.4, 23, 1.4, 2.6, 0, '#e0aa80');
}

/** feeding the stall: the trough fills with green cuttings (cows, sheep) or grain (chickens) */
function feed(g: Ctx, a: BarArgs) {
  g.fillStyle = '#5a3e22'; g.fillRect(X0, Y0, IW, IH);
  for (let i = 0; i < 6; i++) line(g, X0, Y0 + 4 + i * 8, X1, Y0 + 4 + i * 8, 1, '#4a321a');
  const grain = a.v === 'chickens', col = grain ? '#e0b850' : '#5e9a34', col2 = grain ? '#c89a30' : '#7ab848';
  const fx = X0 + 14 + a.k * (IW - 28);
  for (let i = 0; i < 70; i++) { const x = X0 + 14 + a.r(8000 + i) * (IW - 28); if (x > fx) continue; const y = 38 - a.r(8100 + i) * 6 * Math.min(1, (fx - x) / 30); if (grain) ell(g, x, y, 1.6, 1, a.r(i), i % 2 ? col : col2); else line(g, x - 3, y + 1, x + 3, y - 2, 1.6, i % 2 ? col : col2); }
  g.fillStyle = '#9a6a3a'; g.beginPath(); g.moveTo(X0 + 8, 36); g.lineTo(X1 - 8, 36); g.lineTo(X1 - 16, 52); g.lineTo(X0 + 16, 52); g.closePath(); g.fill();
  line(g, X0 + 8, 36, X1 - 8, 36, 2.4, '#b8844a'); for (let q = 0; q < 2; q++) line(g, X0 + 12 + q * 4, 42 + q * 5, X1 - 12 - q * 4, 42 + q * 5, .9, '#7a5030');
  if (a.k < 1) { for (let i = 0; i < 8; i++) { const p = (a.t * 2.2 + i / 8) % 1, x = fx + Math.sin(i * 4) * 4, y = Y0 + p * 30; if (grain) circ(g, x, y, 1.2, col); else line(g, x - 2, y, x + 2, y + 2, 1.4, col); } a.hit('f' + Math.floor(a.k * 5), true, grain ? 'grain' : 'rustle'); }
  at(g, fx + 4, Y0 + 2, .5, 1, () => { g.fillStyle = '#b8b8b0'; g.beginPath(); g.moveTo(-8, -4); g.lineTo(8, -4); g.lineTo(6, 6); g.lineTo(-6, 6); g.closePath(); g.fill(); line(g, 8, 0, 16, -2, 2.4, '#8a5a2a'); });
}

/** fresh straw: golden stalks drift down and pile up from left to right */
function straw(g: Ctx, a: BarArgs) {
  g.fillStyle = '#6a4a2a'; g.fillRect(X0, Y0, IW, IH);
  const fx = X0 + 6 + a.k * (IW - 12);
  for (let i = 0; i < 120; i++) { const x = X0 + a.r(9000 + i) * IW, y = 30 + a.r(9100 + i) * 24; if (x > fx) continue; const an = a.r(9200 + i) * 3; line(g, x, y, x + Math.cos(an) * 9, y + Math.sin(an) * 4, 1.2, i % 2 ? '#e8cc78' : '#d0aa50'); }
  if (a.k < 1) { for (let i = 0; i < 10; i++) { const p = (a.t * 1.2 + i / 10) % 1, x = fx + Math.sin(a.t * 3 + i) * 8, y = Y0 + p * 30, an = a.t * 3 + i; line(g, x, y, x + Math.cos(an) * 7, y + Math.sin(an) * 3, 1.2, '#f0d888'); } a.hit('s' + Math.floor(a.k * 6), true, 'rustle'); }
}

/** milking: the pail under the udder fills with two alternating squirts, foam on top */
function milk(g: Ctx, a: BarArgs) {
  g.fillStyle = '#5a3e22'; g.fillRect(X0, Y0, IW, IH);
  // udder at the top
  ell(g, 120, Y0 - 2, 40, 12, 0, '#f0c0b8'); for (const tx of [104, 136]) { g.fillStyle = '#e8a8a0'; rr(g, tx - 3, Y0 + 6, 6, 10, 3); g.fill(); }
  const L = 76, R = 164, T = 26, B = 54, lvl = cl(a.k);
  g.fillStyle = '#a8aeb6'; g.beginPath(); g.moveTo(L, T); g.lineTo(R, T); g.lineTo(R - 8, B); g.lineTo(L + 8, B); g.closePath(); g.fill();
  g.save(); g.beginPath(); g.moveTo(L + 4, T + 2); g.lineTo(R - 4, T + 2); g.lineTo(R - 10, B - 2); g.lineTo(L + 10, B - 2); g.closePath(); g.clip();
  g.fillStyle = '#3a3e44'; g.fillRect(L, T, R - L, B - T); const wl = B - 2 - (B - T - 4) * lvl; g.fillStyle = '#f8f6ee'; g.fillRect(L, wl, R - L, B);
  if (lvl > .02) for (let i = 0; i < 14; i++) circ(g, L + 8 + a.r(i + 70) * (R - L - 16), wl + Math.sin(a.t * 4 + i) * .6 + a.r(i + 90) * 1.5, .8 + a.r(i + 50) * 1.6, i % 3 ? '#ffffff' : '#ece6d4'); g.restore();
  line(g, L, T, R, T, 2.4, '#d0d6de');
  if (a.k < 1) { const side = Math.floor(a.t * 4) % 2, tx = side ? 136 : 104, p = (a.t * 4) % 1; if (p < .6) line(g, tx, Y0 + 16, tx + (120 - tx) * .4, wl, 2.4, 'rgba(255,255,255,.9)'); a.hit('m' + Math.floor(a.t * 4), true, 'squirt'); }
}

/** buildings at work: mill, juicer, bakery, dairy, kitchen */
function produce(g: Ctx, a: BarArgs) {
  g.fillStyle = '#3a2a1c'; g.fillRect(X0, Y0, IW, IH);
  const k = a.k, t = a.t;
  switch (a.v) {
    case 'mill': { // millstone turning, grain trickles in, the flour pile grows
      at(g, 80, 30, t * 2.4, 1, () => { circ(g, 0, 0, 22, '#9a968c'); for (let q = 0; q < 8; q++) { const an = q / 8 * TAU; line(g, Math.cos(an) * 5, Math.sin(an) * 5, Math.cos(an + .3) * 20, Math.sin(an + .3) * 20, 1.2, '#6a665e'); } circ(g, 0, 0, 5, '#4a463e'); });
      for (let i = 0; i < 6; i++) { const p = (t * 2 + i / 6) % 1; circ(g, 80 + Math.sin(i) * 2, Y0 + p * 18, 1.2, '#e0b850'); }
      const h = 4 + k * 22; g.fillStyle = '#f4efe2'; g.beginPath(); g.moveTo(150, Y1); g.quadraticCurveTo(180, Y1 - h * 2, 210, Y1); g.fill();
      for (let i = 0; i < 5; i++) { const p = (t * 1.5 + i / 5) % 1; circ(g, 112 + p * 60, 34 + p * p * 16, 1, 'rgba(255,255,255,.7)'); }
      if (k < 1) a.hit('m' + Math.floor(t * 1.5), true, 'grind'); break;
    }
    case 'juicer': { // the press comes down on the fruit, juice runs into the jar
      const col = a.need?.includes('blue') ? '#4a3a98' : a.need?.includes('bramble') ? '#4a1a3a' : '#e8c040';
      const py = 10 + k * 18; g.fillStyle = '#6a4a2a'; g.fillRect(50, Y0, 8, 48); g.fillRect(122, Y0, 8, 48); g.fillStyle = '#9a6a3a'; g.fillRect(56, py, 68, 8); line(g, 90, Y0, 90, py, 3, '#8a8e96');
      for (let i = 0; i < 9; i++) { const x = 64 + (i % 5) * 12, y = 46 - Math.floor(i / 5) * 6; ell(g, x, Math.max(y, py + 12), 5, Math.max(1.4, 4 * (1 - k * .7)), 0, col); }
      g.fillStyle = '#5a3a1a'; g.fillRect(56, 50, 68, 4);
      const L = 160, R = 200, T = 18, B = 54; g.fillStyle = 'rgba(200,230,240,.3)'; rr(g, L, T, R - L, B - T, 4); g.fill();
      g.fillStyle = col; g.fillRect(L + 3, B - 3 - (B - T - 6) * k, R - L - 6, (B - T - 6) * k); g.strokeStyle = 'rgba(230,245,255,.8)'; g.lineWidth = 1.6; rr(g, L, T, R - L, B - T, 4); g.stroke();
      if (k < 1) { line(g, 124, 50, 150, 50, 2, col); line(g, 150, 50, 180, 30 + (1 - k) * 18, 2, col); a.hit('j' + Math.floor(t * 2), true, 'squish'); } break;
    }
    case 'bakery': { // the loaf in the oven rises and gets brown
      g.fillStyle = '#7a3a24'; g.beginPath(); g.moveTo(50, Y1); g.lineTo(50, 28); g.quadraticCurveTo(120, -6, 190, 28); g.lineTo(190, Y1); g.fill();
      g.fillStyle = '#1a0e08'; g.beginPath(); g.moveTo(70, Y1); g.lineTo(70, 34); g.quadraticCurveTo(120, 8, 170, 34); g.lineTo(170, Y1); g.fill();
      for (let i = 0; i < 6; i++) { const fl = Math.sin(t * 9 + i * 2) * 2; ell(g, 82 + i * 15, Y1 - 3, 5, 4 + fl, 0, i % 2 ? '#ff8a30' : '#ffc040'); }
      const s = .6 + k * .4, c = Math.round(240 - k * 90), c2 = Math.round(220 - k * 130), c3 = Math.round(170 - k * 120);
      ell(g, 120, 42 - k * 3, 30 * s, 10 * s + k * 3, 0, `rgb(${c},${c2},${c3})`); for (let q = 0; q < 3; q++) line(g, 106 + q * 12, 38 - k * 4, 112 + q * 12, 44 - k * 4, 1.4, `rgba(255,240,200,${.3 + k * .5})`);
      if (k < 1) a.hit('o' + Math.floor(t), true, 'crackle'); break;
    }
    case 'dairy': { // curd pressed into a wheel that turns yellow, holes appear
      const c = `rgb(${Math.round(248 - k * 10)},${Math.round(246 - k * 40)},${Math.round(236 - k * 150)})`;
      g.fillStyle = '#8a8e96'; g.fillRect(70, 42, 100, 10);
      ell(g, 120, 40, 44, 9, 0, c); g.fillStyle = c; g.fillRect(76, 26, 88, 14); ell(g, 120, 26, 44, 9, 0, c); ell(g, 120, 26, 40, 7, 0, 'rgba(255,255,255,.35)');
      for (let i = 0; i < 6; i++) if (k > i / 6) circ(g, 90 + i * 12, 30 + (i % 2) * 6, 2 + (i % 3), 'rgba(160,120,40,.45)');
      const py = 6 + k * 6; g.fillStyle = '#6a4a2a'; g.fillRect(84, py, 72, 6); line(g, 120, Y0 - 6, 120, py, 3, '#8a8e96'); break;
    }
    default: { // kitchen: the pot bubbles over the fire, steam rises, the stew thickens
      for (let i = 0; i < 5; i++) { const fl = Math.sin(t * 10 + i * 2) * 2; ell(g, 96 + i * 12, Y1 - 3, 5, 5 + fl, 0, i % 2 ? '#ff8a30' : '#ffc040'); }
      g.fillStyle = '#2a2a2e'; g.beginPath(); g.moveTo(80, 18); g.lineTo(160, 18); g.quadraticCurveTo(162, 50, 120, 50); g.quadraticCurveTo(78, 50, 80, 18); g.fill();
      const col = a.need?.includes('sorrel') ? '#7a9a3a' : a.need?.includes('mushroom') ? '#8a5a34' : '#c88a40';
      ell(g, 120, 20, 38, 5, 0, col); for (let i = 0; i < 5; i++) { const p = (t * 1.6 + i / 5) % 1; circ(g, 92 + i * 14, 20 - p * 2, 2 * (1 - p) + .5, 'rgba(255,255,255,.35)'); }
      for (let i = 0; i < 4; i++) { const p = (t * .6 + i / 4) % 1; circ(g, 100 + i * 14 + Math.sin(t * 2 + i) * 4, 14 - p * 14, 4 + p * 6, `rgba(230,230,230,${.35 * (1 - p)})`); }
      line(g, 140, 22, 160 + Math.sin(t * 3) * 4, Y0, 2.4, '#8a5a2a');
      if (k < 1) a.hit('b' + Math.floor(t * 2), true, 'bubble');
    }
  }
  // the progress of a building: a thin golden thread along the bottom
  line(g, X0 + 2, Y1 - 1, X0 + 2 + (IW - 4) * k, Y1 - 1, 2, '#e3b964');
}

// ---------------- which scene for which action ----------------
const PULL_TOP = new Set(['cab', 'lettuce', 'celery', 'fennel', 'rhubarb']);
const ROOT_SIDE = new Set(['carrot', 'radish', 'onion', 'garlic', 'leek']);
const PICK = new Set(['pea', 'bean', 'tomato', 'pepper', 'chili', 'eggplant', 'zucchini']);
/** scene id for an action (+ the crop / good / building it is about) */
export function sceneFor(kind: string, v: string): string {
  switch (kind) {
    case 'harvestPlot':
      if (v === 'wheat') return 'scythe';
      if (v === 'potato') return 'dig';
      if (v === 'asp') return 'asparagus';
      if (v === 'corn') return 'corn';
      if (v === 'pumpkin' || v === 'melon') return 'bigFruit';
      if (v === 'strawb') return 'collect';
      if (PULL_TOP.has(v)) return 'pullTop';
      if (ROOT_SIDE.has(v)) return 'rootSide';
      if (PICK.has(v)) return 'pick';
      return 'pullTop';
    case 'harvestBush': case 'pickWild': return 'collect';
    case 'gather': return v === 'mushroom' ? 'rootSide' : 'collect';
    case 'shake': return 'tree';
    case 'weed': case 'weedHof': return 'weed';
    case 'eggs': return 'collect';
    default: return kind; // water, refill, draw, sow, repair, fertilize, feed, straw, milk, produce
  }
}
/** draw one frame of a scene into the 240 x 60 box (the caller has set the transform) */
export function drawScene(g: Ctx, a: BarArgs, per = 1) {
  g.save(); rr(g, X0, Y0, IW, IH, 8); g.clip();
  g.fillStyle = '#1d2a1c'; g.fillRect(X0, Y0, IW, IH);
  switch (a.scene) {
    case 'scythe': scythe(g, a); break;
    case 'pullTop': pullTop(g, a); break;
    case 'rootSide': rootSide(g, a, per); break;
    case 'dig': dig(g, a); break;
    case 'asparagus': asparagus(g, a); break;
    case 'pick': pick(g, a, per); break;
    case 'corn': corn(g, a); break;
    case 'bigFruit': bigFruit(g, a); break;
    case 'collect': collect(g, a); break;
    case 'tree': tree(g, a, per); break;
    case 'weed': weed(g, a); break;
    case 'sow': sow(g, a); break;
    case 'water': water(g, a); break;
    case 'refill': refill(g, a); break;
    case 'draw': barrel(g, a); break;
    case 'repair': repair(g, a); break;
    case 'fertilize': fertilize(g, a); break;
    case 'feed': feed(g, a); break;
    case 'straw': straw(g, a); break;
    case 'milk': milk(g, a); break;
    default: produce(g, a);
  }
  g.restore();
  // frame like the HUD labels: dark rim, light border
  g.strokeStyle = '#0b1016'; g.lineWidth = 5; rr(g, X0 - 1.5, Y0 - 1.5, IW + 3, IH + 3, 9.5); g.stroke();
  g.strokeStyle = '#fff2c0'; g.lineWidth = 2; rr(g, X0 - 1.5, Y0 - 1.5, IW + 3, IH + 3, 9.5); g.stroke();
}
