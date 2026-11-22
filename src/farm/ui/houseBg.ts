// Background of the house book (Basti 21.11.2026): a cosy farmhouse room, painted procedurally on a small canvas and
// shown blurred behind the book. Warm wooden walls, a stone fireplace with a flickering fire, a table with vegetable
// crates and a coat rack with hanging tools. Everything is drawn here (no image files, no third-party art).
// The static room is painted once into an offscreen canvas; every frame only the fire and its light are drawn on top.

type Ctx = CanvasRenderingContext2D;

/** small deterministic random (the room looks the same every evening) */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * f))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

/** room layout in fractions of the canvas (16:9 base, stretched to cover) */
const W = 640, H = 360;
const FIRE = { x: 118, y: 248, w: 96, h: 70 };   // opening of the fireplace (centre x, bottom y)
const FLOOR_Y = 268;

export class HouseBg {
  private room = document.createElement('canvas');
  private raf = 0;
  private t = 0;
  private last = 0;
  private sparks: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  constructor(private cv: HTMLCanvasElement) {
    cv.width = W; cv.height = H;
    this.room.width = W; this.room.height = H;
    paintRoom(this.room.getContext('2d')!);
  }
  start() {
    if (this.raf) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(.1, (now - this.last) / 1000);
      if (dt < 1 / 20) return; // ~20 fps is plenty behind a blur (performance plan 1.1)
      this.last = now; this.t += dt; this.draw(dt);
    };
    this.draw(0);
    this.raf = requestAnimationFrame(loop);
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  private draw(dt: number) {
    const g = this.cv.getContext('2d')!, t = this.t;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.room, 0, 0);
    // flicker: a few overlaid sines = calm but alive
    const fl = .78 + .1 * Math.sin(t * 7.3) + .07 * Math.sin(t * 13.1 + 1) + .05 * Math.sin(t * 23.7 + 2);
    // warm light of the fire on walls, floor and table
    g.globalCompositeOperation = 'lighter';
    let r = g.createRadialGradient(FIRE.x, FIRE.y - 20, 8, FIRE.x, FIRE.y - 20, 330 * (.9 + fl * .15));
    r.addColorStop(0, `rgba(255,150,60,${.42 * fl})`); r.addColorStop(.35, `rgba(220,100,30,${.18 * fl})`); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, H);
    // the fire itself
    drawFire(g, t, fl);
    // sparks
    if (Math.random() < dt * 3) this.sparks.push({ x: FIRE.x + (Math.random() - .5) * 40, y: FIRE.y - 20, vx: (Math.random() - .5) * 12, vy: -30 - Math.random() * 30, life: 1 });
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * .9; g.fillStyle = `rgba(255,200,90,${Math.max(0, s.life)})`; g.fillRect(s.x, s.y, 1.6, 1.6); }
    this.sparks = this.sparks.filter(s => s.life > 0 && s.y > FIRE.y - FIRE.h);
    // vignette breathes a little with the fire
    g.globalCompositeOperation = 'source-over';
    r = g.createRadialGradient(W * .42, H * .55, H * .25, W * .5, H * .5, W * .72);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(8,4,2,${.62 - fl * .08})`);
    g.fillStyle = r; g.fillRect(0, 0, W, H);
  }
}

function drawFire(g: Ctx, t: number, fl: number) {
  const { x, y, w } = FIRE;
  // glowing embers
  let r = g.createRadialGradient(x, y - 4, 2, x, y - 4, w * .55);
  r.addColorStop(0, `rgba(255,180,80,${.9 * fl})`); r.addColorStop(.5, `rgba(200,70,20,${.5 * fl})`); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.beginPath(); g.ellipse(x, y - 4, w * .55, 14, 0, 0, Math.PI * 2); g.fill();
  // tongues of flame: soft additive blobs rising and wavering
  for (let i = 0; i < 9; i++) {
    const ph = i * 1.7, base = x + (i - 4) * 8.5;
    const hgt = (26 + 22 * Math.abs(Math.sin(i * 2.1))) * (.75 + .3 * Math.sin(t * (5 + i * .7) + ph)) * (.85 + fl * .2);
    const sway = Math.sin(t * 3.1 + ph) * 4 + Math.sin(t * 8.7 + ph * 2) * 1.5;
    for (let k = 0; k < 4; k++) {
      const f = k / 4, cy = y - 8 - hgt * f, cx = base + sway * f * 1.4, rad = (11 - k * 2.2) * (1 - f * .25);
      const c = g.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.8);
      const core = k < 2 ? '255,225,150' : '255,160,60';
      c.addColorStop(0, `rgba(${core},${(.55 - f * .35) * fl})`); c.addColorStop(.5, `rgba(240,90,20,${(.3 - f * .2) * fl})`); c.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = c; g.beginPath(); g.arc(cx, cy, rad * 1.8, 0, Math.PI * 2); g.fill();
    }
  }
}

function paintRoom(g: Ctx) {
  const R = rng(7);
  // ---- back wall: horizontal warm wooden planks ----
  g.fillStyle = '#3a2214'; g.fillRect(0, 0, W, H);
  const plankH = 16;
  for (let y = 22, i = 0; y < FLOOR_Y; y += plankH, i++) {
    const base = ['#7a4a28', '#6e4224', '#83512c', '#744626'][i % 4];
    g.fillStyle = shade(base, .85 + R() * .25); g.fillRect(0, y, W, plankH - 1.5);
    // grain streaks
    for (let k = 0; k < 26; k++) {
      g.strokeStyle = `rgba(${R() < .5 ? '40,20,8' : '150,96,52'},${.12 + R() * .15})`; g.lineWidth = .6 + R();
      const sx = R() * W, len = 30 + R() * 120, yy = y + 2 + R() * (plankH - 5);
      g.beginPath(); g.moveTo(sx, yy); g.bezierCurveTo(sx + len * .3, yy + (R() - .5) * 3, sx + len * .7, yy + (R() - .5) * 3, sx + len, yy); g.stroke();
    }
    // plank joints
    g.fillStyle = 'rgba(30,14,6,.55)'; g.fillRect(0, y + plankH - 1.5, W, 1.5);
    for (let x = (i % 2) * 70 + R() * 40; x < W; x += 140 + R() * 60) g.fillRect(x, y, 1.4, plankH - 1.5);
  }
  // ---- ceiling with beams ----
  g.fillStyle = '#2a170c'; g.fillRect(0, 0, W, 24);
  for (const bx of [40, 230, 430, 610]) { g.fillStyle = '#24130a'; g.fillRect(bx - 12, 0, 24, 26); g.fillStyle = 'rgba(120,70,30,.25)'; g.fillRect(bx - 12, 0, 3, 26); }
  g.fillStyle = '#1e1008'; g.fillRect(0, 20, W, 8);
  // vertical posts
  for (const px of [312, 560]) { g.fillStyle = '#4a2a16'; g.fillRect(px, 24, 14, FLOOR_Y - 24); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(px + 10, 24, 4, FLOOR_Y - 24); }

  // ---- window with a blue night outside ----
  const wx = 362, wy = 70, ww = 82, wh = 96;
  g.fillStyle = '#0d1a2e'; g.fillRect(wx, wy, ww, wh);
  const sky = g.createLinearGradient(0, wy, 0, wy + wh); sky.addColorStop(0, '#1a2d52'); sky.addColorStop(1, '#0a1220');
  g.fillStyle = sky; g.fillRect(wx + 3, wy + 3, ww - 6, wh - 6);
  g.fillStyle = 'rgba(220,230,255,.85)'; g.beginPath(); g.arc(wx + 58, wy + 24, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a1220'; g.beginPath(); g.arc(wx + 61, wy + 22, 6.5, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(255,255,255,${.3 + R() * .5})`; g.fillRect(wx + 5 + R() * (ww - 10), wy + 5 + R() * 40, 1, 1); }
  g.fillStyle = '#0b140c'; g.beginPath(); g.moveTo(wx + 3, wy + wh - 3); for (let x = 0; x <= ww - 6; x += 6) g.lineTo(wx + 3 + x, wy + wh - 22 - R() * 14); g.lineTo(wx + ww - 3, wy + wh - 3); g.fill();
  g.strokeStyle = '#3e2412'; g.lineWidth = 5; g.strokeRect(wx, wy, ww, wh);
  g.lineWidth = 3; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.moveTo(wx, wy + wh / 2); g.lineTo(wx + ww, wy + wh / 2); g.stroke();
  g.fillStyle = '#5a3418'; g.fillRect(wx - 6, wy + wh, ww + 12, 6);
  // little pot with herbs on the sill
  g.fillStyle = '#9a4a2a'; g.fillRect(wx + 10, wy + wh - 10, 12, 10);
  g.fillStyle = '#3e6a2a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(wx + 12 + i * 2, wy + wh - 13 - R() * 5, 2.5, 5, (R() - .5), 0, Math.PI * 2); g.fill(); }
  // hanging bundles of dried herbs from the beam
  for (let i = 0; i < 5; i++) {
    const hx = 196 + i * 16 + R() * 4; g.strokeStyle = '#2a1a0a'; g.lineWidth = 1; g.beginPath(); g.moveTo(hx, 26); g.lineTo(hx, 36); g.stroke();
    g.fillStyle = ['#6a7a3a', '#8a6a3a', '#5a6a30', '#9a7a40', '#6a5a2a'][i];
    g.beginPath(); g.moveTo(hx - 5, 50 + R() * 6); g.lineTo(hx, 34); g.lineTo(hx + 5, 50 + R() * 6); g.fill();
  }

  // ---- floor: planks running to the back ----
  const fl = g.createLinearGradient(0, FLOOR_Y, 0, H); fl.addColorStop(0, '#4a2a16'); fl.addColorStop(1, '#2a160a');
  g.fillStyle = fl; g.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  const vx = W * .5, vy = 40;
  g.strokeStyle = 'rgba(20,10,4,.6)'; g.lineWidth = 1.2;
  for (let i = -16; i <= 16; i++) { const bx = vx + i * 52; const t = (FLOOR_Y - vy) / (H + 40 - vy); g.beginPath(); g.moveTo(lerp(vx, bx, t), FLOOR_Y); g.lineTo(bx, H + 40); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, FLOOR_Y, W, 3);
  // rug in front of the fire
  g.fillStyle = '#7a2a1e'; g.beginPath(); g.ellipse(FIRE.x + 20, 318, 120, 22, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#c8903a'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(FIRE.x + 20, 318, 108, 17, 0, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#4a1610'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(FIRE.x + 20, 318, 92, 12, 0, 0, Math.PI * 2); g.stroke();

  // ---- fireplace: stone surround, mantel, logs ----
  const fx0 = FIRE.x - 78, fx1 = FIRE.x + 78, top = 118;
  // chimney breast
  g.fillStyle = '#5a5048'; g.fillRect(fx0 + 14, 24, fx1 - fx0 - 28, top - 24);
  stones(g, R, fx0 + 14, 24, fx1 - fx0 - 28, top - 24, 14);
  g.fillStyle = '#625850'; g.fillRect(fx0, top + 14, fx1 - fx0, FLOOR_Y - top - 14);
  stones(g, R, fx0, top + 14, fx1 - fx0, FLOOR_Y - top - 14, 16);
  // opening
  const ox0 = FIRE.x - FIRE.w / 2, oy0 = FIRE.y - FIRE.h;
  g.fillStyle = '#120804'; g.beginPath(); g.moveTo(ox0, FIRE.y); g.lineTo(ox0, oy0 + 16); g.quadraticCurveTo(FIRE.x, oy0 - 8, ox0 + FIRE.w, oy0 + 16); g.lineTo(ox0 + FIRE.w, FIRE.y); g.fill();
  const soot = g.createLinearGradient(0, oy0, 0, FIRE.y); soot.addColorStop(0, '#060302'); soot.addColorStop(1, '#2a1208');
  g.fillStyle = soot; g.beginPath(); g.moveTo(ox0 + 6, FIRE.y); g.lineTo(ox0 + 6, oy0 + 18); g.quadraticCurveTo(FIRE.x, oy0, ox0 + FIRE.w - 6, oy0 + 18); g.lineTo(ox0 + FIRE.w - 6, FIRE.y); g.fill();
  // hearth stone
  g.fillStyle = '#6a6058'; g.fillRect(fx0 - 10, FLOOR_Y - 4, fx1 - fx0 + 20, 12); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(fx0 - 10, FLOOR_Y + 6, fx1 - fx0 + 20, 2);
  // mantel beam
  g.fillStyle = '#4a2812'; g.fillRect(fx0 - 12, top, fx1 - fx0 + 24, 16); g.fillStyle = 'rgba(160,100,50,.35)'; g.fillRect(fx0 - 12, top, fx1 - fx0 + 24, 3);
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(fx0 - 12, top + 14, fx1 - fx0 + 24, 3);
  // things on the mantel: jars, candle, a small clock
  const jar = (x: number, h: number, c: string) => { g.fillStyle = c; g.fillRect(x, top - h, 9, h); g.fillStyle = '#8a6a3a'; g.fillRect(x - 1, top - h - 3, 11, 3); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(x + 1, top - h + 2, 2, h - 4); };
  jar(fx0 + 2, 14, '#8a3a2a'); jar(fx0 + 14, 18, '#c08a2a'); jar(fx0 + 26, 12, '#5a7a3a');
  g.fillStyle = '#efe2c0'; g.fillRect(fx1 - 18, top - 16, 5, 16); g.fillStyle = '#ffd890'; g.beginPath(); g.ellipse(fx1 - 15.5, top - 20, 2, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#5a3418'; g.beginPath(); g.arc(FIRE.x + 10, top - 11, 11, Math.PI, 0); g.fillRect(FIRE.x - 1, top - 11, 22, 11); g.fill();
  g.fillStyle = '#efe2c0'; g.beginPath(); g.arc(FIRE.x + 10, top - 10, 7, 0, Math.PI * 2); g.fill();
  // logs
  for (const [lx, ly, lr] of [[-22, -6, -.12], [20, -6, .14], [0, -13, 0]] as const) {
    g.save(); g.translate(FIRE.x + lx, FIRE.y + ly); g.rotate(lr);
    g.fillStyle = '#3a2010'; g.fillRect(-26, -5, 52, 10); g.fillStyle = '#8a5a30'; g.beginPath(); g.ellipse(26, 0, 3.5, 5, 0, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  // firewood stack beside the fireplace
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4 - (r % 2); c++) {
    const cx = fx1 + 22 + c * 11 + (r % 2) * 5.5, cy = FLOOR_Y - 6 - r * 10;
    g.fillStyle = '#5a3418'; g.beginPath(); g.arc(cx, cy, 5.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b08050'; g.beginPath(); g.arc(cx, cy, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#7a5030'; g.lineWidth = .7; g.beginPath(); g.arc(cx, cy, 2, 0, Math.PI * 2); g.stroke();
  }

  // ---- coat rack with hanging tools (right wall) ----
  const rx = 498, ry = 92;
  g.fillStyle = '#4a2812'; g.fillRect(rx - 10, ry - 6, 136, 12); g.fillStyle = 'rgba(160,100,50,.3)'; g.fillRect(rx - 10, ry - 6, 136, 2);
  const pegs = [rx + 6, rx + 34, rx + 62, rx + 92, rx + 116];
  for (const p of pegs) { g.fillStyle = '#2a1608'; g.fillRect(p - 2, ry - 1, 4, 9); }
  // straw hat
  g.fillStyle = '#c8a050'; g.beginPath(); g.ellipse(pegs[0], ry + 14, 16, 5, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#d8b060'; g.beginPath(); g.ellipse(pegs[0], ry + 9, 9, 7, 0, Math.PI, 0); g.fill(); g.fillStyle = '#8a3a2a'; g.fillRect(pegs[0] - 9, ry + 9, 18, 3);
  // coat
  g.fillStyle = '#3a4a3a'; g.beginPath(); g.moveTo(pegs[1] - 6, ry + 6); g.lineTo(pegs[1] + 6, ry + 6); g.lineTo(pegs[1] + 15, ry + 86); g.lineTo(pegs[1] - 15, ry + 86); g.fill();
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(pegs[1] - 1, ry + 12, 2, 74);
  // rake (long handle, head at the top)
  g.fillStyle = '#7a5030'; g.fillRect(pegs[2] - 1.5, ry + 2, 3, 150);
  g.fillStyle = '#5a6068'; g.fillRect(pegs[2] - 12, ry - 2, 24, 4); for (let i = 0; i < 7; i++) g.fillRect(pegs[2] - 11 + i * 3.6, ry - 9, 1.6, 8);
  // spade
  g.fillStyle = '#7a5030'; g.fillRect(pegs[3] - 1.5, ry + 4, 3, 110); g.fillStyle = '#5a3418'; g.fillRect(pegs[3] - 6, ry + 2, 12, 4);
  g.fillStyle = '#8a9098'; g.beginPath(); g.moveTo(pegs[3] - 9, ry + 112); g.lineTo(pegs[3] + 9, ry + 112); g.lineTo(pegs[3] + 8, ry + 136); g.quadraticCurveTo(pegs[3], ry + 146, pegs[3] - 8, ry + 136); g.fill();
  // watering can
  g.fillStyle = '#6a8a98'; g.fillRect(pegs[4] - 11, ry + 14, 22, 22); g.beginPath(); g.moveTo(pegs[4] + 11, ry + 30); g.lineTo(pegs[4] + 24, ry + 16); g.lineTo(pegs[4] + 26, ry + 19); g.lineTo(pegs[4] + 11, ry + 35); g.fill();
  g.strokeStyle = '#4a6a78'; g.lineWidth = 2.5; g.beginPath(); g.arc(pegs[4], ry + 14, 8, Math.PI, 0); g.stroke();
  // basket below
  g.fillStyle = '#8a6030'; g.beginPath(); g.moveTo(560, FLOOR_Y + 8); g.lineTo(600, FLOOR_Y + 8); g.lineTo(596, FLOOR_Y - 18); g.lineTo(564, FLOOR_Y - 18); g.fill();
  g.strokeStyle = '#5a3a18'; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(563, FLOOR_Y - 12 + i * 6); g.lineTo(597, FLOOR_Y - 12 + i * 6); g.stroke(); }

  // ---- table with vegetable crates (foreground right) ----
  const tx0 = 318, tx1 = 560, ty = 252;
  g.fillStyle = '#3a200e'; for (const lx of [tx0 + 12, tx1 - 22]) g.fillRect(lx, ty + 10, 10, H - ty);
  g.fillStyle = '#5a3418'; g.beginPath(); g.moveTo(tx0 - 8, ty + 12); g.lineTo(tx1 + 8, ty + 12); g.lineTo(tx1, ty); g.lineTo(tx0, ty); g.fill();
  g.fillStyle = '#6e4220'; g.fillRect(tx0 - 8, ty + 12, tx1 - tx0 + 16, 9); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(tx0 - 8, ty + 19, tx1 - tx0 + 16, 3);
  const crate = (x: number, w: number, h: number, veg: (cx: number, cy: number) => void) => {
    const y = ty + 4 - h;
    // contents peeking out first, the front board covers their lower half
    for (let i = 0; i < Math.floor(w / 9); i++) veg(x + 6 + i * (w - 12) / Math.max(1, Math.floor(w / 9) - 1), y + 2 + R() * 3);
    g.fillStyle = '#9a6a38'; g.fillRect(x, y + 6, w, h - 6);
    g.fillStyle = 'rgba(40,20,8,.6)'; g.fillRect(x, y + 6 + (h - 6) / 2, w, 1.5);
    g.fillStyle = 'rgba(255,220,160,.2)'; g.fillRect(x, y + 6, w, 2);
    g.fillStyle = '#7a4a20'; g.fillRect(x, y + 6, 3, h - 6); g.fillRect(x + w - 3, y + 6, 3, h - 6);
  };
  crate(tx0 + 14, 56, 28, (cx, cy) => { g.fillStyle = '#e07020'; g.beginPath(); g.ellipse(cx, cy, 3, 8, .4, 0, Math.PI * 2); g.fill(); g.fillStyle = '#4a8a2a'; g.fillRect(cx - 1, cy - 12, 2, 5); });
  crate(tx0 + 78, 60, 32, (cx, cy) => { g.fillStyle = '#4e8a32'; g.beginPath(); g.arc(cx, cy + 2, 8, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(200,240,150,.35)'; g.beginPath(); g.arc(cx - 2, cy, 4, 0, Math.PI * 2); g.fill(); });
  crate(tx0 + 146, 50, 24, (cx, cy) => { g.fillStyle = '#c8302a'; g.beginPath(); g.arc(cx, cy + 3, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,200,180,.5)'; g.fillRect(cx - 2, cy, 1.5, 1.5); });
  crate(tx0 + 204, 26, 20, (cx, cy) => { g.fillStyle = '#c8a058'; g.beginPath(); g.arc(cx, cy + 3, 5, 0, Math.PI * 2); g.fill(); });
  // loose pumpkin and a loaf on the table
  g.fillStyle = '#e08a2a'; g.beginPath(); g.ellipse(tx1 - 26, ty - 3, 14, 10, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a05a18'; g.lineWidth = 1; for (const o of [-6, 0, 6]) { g.beginPath(); g.ellipse(tx1 - 26 + o, ty - 3, 3, 10, 0, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#4a6a2a'; g.fillRect(tx1 - 27, ty - 16, 3, 5);
  // a stool in front
  g.fillStyle = '#3a200e'; g.fillRect(434, 318, 6, 42); g.fillRect(470, 318, 6, 42); g.fillStyle = '#5a3418'; g.beginPath(); g.ellipse(455, 316, 28, 7, 0, 0, Math.PI * 2); g.fill();

  // ---- soft overall warm tone + darker corners (the fire is the main light) ----
  const amb = g.createLinearGradient(0, 0, W, 0); amb.addColorStop(0, 'rgba(60,20,0,.05)'); amb.addColorStop(1, 'rgba(0,0,10,.35)');
  g.fillStyle = amb; g.fillRect(0, 0, W, H);
  const top2 = g.createLinearGradient(0, 0, 0, H); top2.addColorStop(0, 'rgba(0,0,0,.45)'); top2.addColorStop(.35, 'rgba(0,0,0,0)'); top2.addColorStop(.85, 'rgba(0,0,0,0)'); top2.addColorStop(1, 'rgba(0,0,0,.4)');
  g.fillStyle = top2; g.fillRect(0, 0, W, H);
}

/** irregular stones with mortar */
function stones(g: Ctx, R: () => number, x: number, y: number, w: number, h: number, s: number) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#3a342e'; g.fillRect(x, y, w, h);
  for (let yy = y, row = 0; yy < y + h; yy += s * .8, row++) {
    for (let xx = x - (row % 2) * s * .6; xx < x + w; xx += s * (1 + R() * .5)) {
      const sw = s * (.9 + R() * .5), sh = s * .7;
      const c = ['#7a7068', '#6a6058', '#857a6e', '#5e564e', '#8a7a68'][Math.floor(R() * 5)];
      g.fillStyle = c; g.beginPath(); g.ellipse(xx + sw / 2, yy + sh / 2, sw / 2 - 1, sh / 2 - .5, (R() - .5) * .2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,230,200,.12)'; g.beginPath(); g.ellipse(xx + sw / 2 - 1, yy + sh / 2 - 1.5, sw / 2 - 3, sh / 2 - 3, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}
