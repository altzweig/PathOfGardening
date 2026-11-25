// Werkbank + Hammer (P2 Werkbank-Paket, 25.11.2026).
// Werkbank: wooden workbench for one hex tile (origin = centre of the tile on the ground, front = +z, where the player stands).
// Weathered oak planks on four legs, a lower shelf with stacked boards, an iron vise at the front left with a pine board
// clamped in it, a hand saw, a plane and shavings on the top, a pot of nails. Two posts at the back carry a crossbar: the
// idea being researched hangs from it on a little parchment sign (canvas texture: idea colour, SVG icon, short name), above
// it a progress bar in the XP colour. Ready = the bar pulses, the sign glows and swings. No lights (shader prewarm rule).
// Hammer: claw hammer for the figure's hand (origin = grip, handle along +z, striking face towards -y).
import * as THREE from 'three';
import { R, V3, craftKit, lathe, mesh, profile, rbox, rod, sph } from './craftkit';

/** XP colour of the PC orb (ui/orbs.ts ARC.xp, liquid in hud/orb-xp-fill.webp); the phone bar uses --xp #4a6dff */
export const XP_GOLD = 0xffd21f;
/** top of the bench (m): the hammer hits here, the dust cloud sits on it */
export const BENCH_TOP = .86;
/** where the player stands to work (bench space): at the right end of the bench, facing -x (seen from the side by the game
 *  camera, so the hammer, the dust and the sign stay visible). Player yaw there: -Math.PI / 2 (+ the bench's own rotation). */
export const BENCH_WORK_SPOT = new THREE.Vector3(1.12, 0, .06);
export const BENCH_WORK_YAW = -Math.PI / 2;
/** point on the bench top where the hammer lands (bench space) */
export const BENCH_HIT_SPOT = new THREE.Vector3(.5, BENCH_TOP + .03, .06);

export interface Idea {
  /** inline SVG markup (e.g. ui/icons.ts fieldArt('wheat') / skillIcon('pea')), drawn onto the sign */
  svg?: string;
  /** emoji / short text if there is no SVG */
  glyph?: string;
  /** accent colour (CSS string or 0xRRGGBB): ring around the icon + ribbon */
  color?: string | number;
  /** short name under the icon (keep it to one or two words) */
  label?: string;
}
export interface Workbench {
  group: THREE.Group;
  /** hang an idea on the bench (null = empty hook, bar hidden) */
  setIdea(idea: Idea | null): void;
  /** research progress 0..1 (bar in XP colour) */
  setProgress(p: number): void;
  /** idea finished, waiting to be collected: bar pulses, sign glows and swings */
  setReady(on: boolean): void;
  /** a hammer blow landed (sign jiggles, bar flashes, bench shakes a hair) - call it on the impact frame */
  hit(strength?: number): void;
  /** per frame; pass the camera to keep the bar facing it (like the health bars) */
  update(dt: number, camera?: THREE.Camera): void;
}

// ---------------- hammer ----------------
/** claw hammer, grip at the origin, handle along +z (~0.36 m), head across it: face towards -y, claw towards +y.
 *  Scaled 1.3 like the egg sling so it reads from the game camera. */
export function createHammer() {
  const K = craftKit(), g = new THREE.Group(), a = new THREE.Group(); g.add(a);
  // turned ash handle: swelling at the butt, slim neck under the head
  mesh(a, lathe([[.0, -.07], [.016, -.068], [.019, -.055], [.017, -.02], [.015, .08], [.012, .2], [.0115, .26], [.013, .285], [.0, .29]], 16), K.beechT);
  mesh(a, lathe([[.0175, -.05], [.0195, -.045], [.0195, .03], [.0175, .035]], 16), K.leather); // grip wrap
  // head: forged steel, round striking face below, claw curling backwards above
  const head = new THREE.Group(); head.position.set(0, 0, .27); a.add(head);
  const face = mesh(head, lathe([[.0, -.075], [.016, -.074], [.019, -.07], [.019, -.05], [.015, -.035], [.016, -.02]], 18), K.steel); face.rotation.x = -Math.PI / 2; // lathe z -> -y
  mesh(head, rbox(.032, .05, .036, .008), K.iron, 0, -.005, 0); // eye block around the handle
  mesh(head, profile([[-.016, .015], [.016, .015], [.012, .04], [-.004, .07], [-.026, .088], [-.03, .082], [-.014, .06], [-.016, .03]], .03, .004), K.iron, 0, 0, 0);
  mesh(head, rbox(.006, .03, .004, .001), K.soot, 0, .075, -.02).rotation.x = .9; // slot between the claw prongs
  mesh(head, rbox(.012, .006, .03, .002), K.brass, 0, .021, 0); // wedge on top of the handle
  g.scale.setScalar(1.3);
  return { g, anim: a, head, /** grip point in anim space (hand target) */ grip: V3(0, 0, 0), /** striking face in anim space */ face: V3(0, -.075, .27) };
}

/** hammering cycle for the arm (phase 0..1 loops, ~0.5 s per blow): pitch = rotation.x of the hammer pivot (negative = raised
 *  up and back, positive = down onto the bench), lean = extra forward lean of the torso, impact = true in the frame window right
 *  after the blow landed (play bench.hit, dust.pulse, bench.hit() there). Slow wind-up, fast strike, a little rebound. */
export function hammerSwing(ph: number) {
  ph = ((ph % 1) + 1) % 1;
  const UP = -1.15, DOWN = .42;
  let pitch: number;
  if (ph < .55) { const t = ph / .55, e = t * t * (3 - 2 * t); pitch = DOWN - .12 + (UP - DOWN + .12) * e; }      // wind-up from the rest after the rebound
  else if (ph < .68) { const t = (ph - .55) / .13; pitch = UP + (DOWN - UP) * t * t; }                              // strike: accelerating
  else { const t = (ph - .68) / .32; pitch = DOWN - .12 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2); }            // rebound to rest
  return { pitch, lean: .18 + (pitch > 0 ? pitch * .2 : 0), impact: ph >= .68 && ph < .74 };
}

// ---------------- workbench ----------------
function signCanvas() { const c = document.createElement('canvas'); c.width = 256; c.height = 300; return c; }
const css = (c: string | number | undefined, d: string) => c === undefined ? d : typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : c;
/** parchment with burnt edges, a ring in the idea colour, the icon and the name */
function paintSign(cv: HTMLCanvasElement, idea: Idea | null, icon: HTMLImageElement | null) {
  const g = cv.getContext('2d')!, W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  // parchment: warm paper, darker towards the ragged edges
  g.save(); g.beginPath();
  const N = 40; for (let i = 0; i < N; i++) { const t = i / N, x = 8 + (W - 16) * t, j = Math.sin(i * 2.3) * 3; i ? g.lineTo(x, 10 + j) : g.moveTo(x, 10 + j); }
  for (let i = 0; i < N; i++) { const t = i / N; g.lineTo(W - 9 + Math.sin(i * 1.7) * 3, 10 + (H - 20) * t); }
  for (let i = 0; i < N; i++) { const t = i / N; g.lineTo(W - 8 - (W - 16) * t, H - 10 + Math.sin(i * 2.9) * 3); }
  for (let i = 0; i < N; i++) { const t = i / N; g.lineTo(9 + Math.sin(i * 2.1) * 3, H - 10 - (H - 20) * t); }
  g.closePath(); g.clip();
  const grd = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * .75); grd.addColorStop(0, '#f4e8c8'); grd.addColorStop(.7, '#e2cc98'); grd.addColorStop(1, '#a07a44');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,80,30,${(i % 5) * .02 + .02})`; g.beginPath(); g.arc((i * 73) % W, (i * 131) % H, 6 + (i % 7) * 3, 0, 7); g.fill(); }
  g.restore();
  if (!idea) return;
  const col = css(idea.color, '#6aa83a'), cx = W / 2, cy = 128, r = 92;
  // ring + soft fill in the idea colour
  g.fillStyle = col; g.globalAlpha = .22; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill(); g.globalAlpha = 1;
  g.lineWidth = 10; g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  g.lineWidth = 3; g.strokeStyle = 'rgba(60,36,14,.7)'; g.beginPath(); g.arc(cx, cy, r + 7, 0, 7); g.stroke();
  if (icon) g.drawImage(icon, cx - 72, cy - 72, 144, 144);
  else if (idea.glyph) { g.font = 'bold 110px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a2410'; g.fillText(idea.glyph, cx, cy + 6); }
  if (idea.label) {
    g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    let s = idea.label; while (g.measureText(s).width > W - 30 && s.length > 3) s = s.slice(0, -2) + '…';
    g.lineWidth = 5; g.strokeStyle = 'rgba(244,232,200,.9)'; g.strokeText(s, cx, 258); g.fillStyle = '#3a2410'; g.fillText(s, cx, 258);
  }
}
let GLOW_TEX: THREE.Texture | null = null;
function glowTex() {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(.35, 'rgba(255,255,255,.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128); GLOW_TEX = new THREE.CanvasTexture(c); GLOW_TEX.colorSpace = THREE.SRGBColorSpace; return GLOW_TEX;
}

/** Werkbank. opts.xpColor: bar colour (default the golden XP orb colour). */
export function createWorkbench(opts: { xpColor?: number } = {}): Workbench {
  const K = craftKit(), group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const T = BENCH_TOP, W = 1.45, D = .66, th = .075;
  // ---- top: thick planks (one mesh, plank seams in the texture), a slightly thicker front board ----
  const top = mesh(body, rbox(W, th, D, .012), K.oakTop, 0, T - th / 2, 0); top.receiveShadow = true;
  mesh(body, rbox(W + .02, th + .03, .1, .012), K.oak, 0, T - th / 2 - .012, D / 2 - .03).receiveShadow = true;
  for (const x of [-.55, -.15, .25, .62]) for (const z of [-.24, .05]) mesh(body, new THREE.CylinderGeometry(.006, .006, .004, 8), K.iron, x + R(-.02, .02), T + .001, z + R(-.02, .02)); // nail heads
  // ---- legs (slightly splayed), aprons and stretchers ----
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const l = mesh(body, rbox(.09, T - th, .09, .012), K.oak, sx * (W / 2 - .11), (T - th) / 2, sz * (D / 2 - .09));
    l.rotation.z = -sx * .03; l.rotation.x = sz * .025; l.receiveShadow = true;
  }
  for (const sz of [-1, 1]) mesh(body, rbox(W - .2, .09, .03, .008), K.oak, 0, T - th - .045, sz * (D / 2 - .05)); // aprons
  for (const sx of [-1, 1]) mesh(body, rbox(.05, .06, D - .14, .008), K.oak, sx * (W / 2 - .11), .2, 0); // side stretchers
  // lower shelf: three loose boards, a stack of planks on it
  for (let i = 0; i < 3; i++) mesh(body, rbox(W - .2, .025, .16, .006), K.pine, R(-.01, .01), .245, -.17 + i * .17).rotation.y = R(-.01, .01);
  for (let i = 0; i < 4; i++) { const b = mesh(body, rbox(R(.8, 1.1), .03, R(.12, .17), .006), i % 2 ? K.pine : K.oak, R(-.08, .08), .275 + i * .032, R(-.06, .06)); b.rotation.y = R(-.12, .12); b.castShadow = true; }
  // two boards leaning against the left side
  for (let i = 0; i < 2; i++) { const b = mesh(body, rbox(.025, 1.05, .15, .006), K.pine, -W / 2 - .06 - i * .03, .5, -.12 + i * .1); b.rotation.z = .32 + i * .05; b.rotation.x = R(-.05, .05); }
  // ---- vise at the front left: fixed iron jaw under the top, moving jaw, screw + tommy bar ----
  const vise = new THREE.Group(); vise.position.set(-.48, T - .02, D / 2); body.add(vise);
  mesh(vise, rbox(.24, .1, .05, .01), K.paintRed, 0, -.03, .02); // fixed jaw
  const jaw = mesh(vise, rbox(.24, .1, .05, .01), K.paintRed, 0, -.03, .13);
  for (const z of [.045, .105]) mesh(vise, rbox(.22, .02, .006, .002), K.steel, 0, .015, z); // hardened jaw plates
  for (const x of [-.08, .08]) rod(vise, K.steel, .01, V3(x, -.06, -.05), V3(x, -.06, .16), 10); // guide bars
  rod(vise, K.steel, .013, V3(0, -.05, -.06), V3(0, -.05, .22), 12); // screw
  rod(vise, K.steel, .007, V3(-.13, -.05, .21), V3(.13, -.05, .21), 8); // tommy bar
  for (const x of [-.135, .135]) mesh(vise, sph(10, 8), K.steel, x, -.05, .21, .014);
  void jaw;
  // board clamped in the vise, sticking up, a few saw cuts in it
  const board = mesh(vise, rbox(.3, .18, .03, .006), K.pine, .02, .1, .075); board.rotation.z = .04;
  for (const x of [-.05, .03]) mesh(vise, rbox(.003, .05, .032, .001), K.darkWood, x, .17, .075);
  // ---- hand saw lying on the top (back right): steel blade with teeth, walnut handle ----
  const saw = new THREE.Group(); saw.position.set(-.05, T + .012, -.2); saw.rotation.order = 'YXZ'; saw.rotation.set(0, 1.75, Math.PI / 2); body.add(saw); // laid flat (blade plane horizontal)
  const teeth: [number, number][] = [[.0, .0]]; for (let i = 0; i <= 26; i++) teeth.push([.012 + i * .018, i % 2 ? .0 : -.008]);
  teeth.push([.5, .0], [.5, .06], [.0, .11]);
  mesh(saw, profile(teeth, .0025, 0), K.steel);
  mesh(saw, profile([[-.02, .0], [.0, .0], [.0, .12], [-.03, .135], [-.13, .11], [-.14, .02], [-.1, -.01]], .022, .006, [[[-.04, .03], [-.04, .085], [-.11, .085], [-.11, .03]]]), K.walnut);
  for (const y of [.03, .1]) { const s = mesh(saw, new THREE.CylinderGeometry(.006, .006, .026, 10), K.brass, 0, y, -.008); s.rotation.z = Math.PI / 2; }
  // ---- workpiece at the hammering spot: a board on two battens, nails half driven in ----
  const wp = new THREE.Group(); wp.position.set(BENCH_HIT_SPOT.x, T, BENCH_HIT_SPOT.z); wp.rotation.y = .15; body.add(wp);
  for (const x of [-.1, .1]) mesh(wp, rbox(.04, .025, .26, .005), K.oak, x, .012, 0);
  mesh(wp, rbox(.32, .025, .18, .005), K.pine, 0, .037, 0);
  for (const [x, z, h] of [[-.1, -.05, .02], [-.1, .05, .006], [.1, -.05, .03], [.02, .04, .012]]) { mesh(wp, new THREE.CylinderGeometry(.002, .002, h + .01, 5), K.steel, x, .05 + h / 2, z); mesh(wp, new THREE.CylinderGeometry(.006, .006, .003, 8), K.steel, x, .05 + h + .005, z); }
  // ---- plane (Hobel) + shavings + pencil + a pot of nails ----
  const pl = new THREE.Group(); pl.position.set(-.2, T, .1); pl.rotation.y = .9; body.add(pl);
  mesh(pl, rbox(.07, .06, .24, .012), K.beech, 0, .03, 0); mesh(pl, rbox(.05, .03, .04, .008), K.walnut, 0, .07, -.07);
  const iron = mesh(pl, rbox(.045, .006, .09, .002), K.steel, 0, .075, .01); iron.rotation.x = .7;
  mesh(pl, sph(10, 8), K.walnut, 0, .075, .085, .022, .03, .022);
  for (let i = 0; i < 7; i++) { const sh = mesh(body, new THREE.TorusGeometry(.025, .007, 5, 12, R(3, 5)), K.pine, R(-.35, .3), T + .012, R(-.05, .25)); sh.rotation.set(Math.PI / 2 + R(-.4, .4), R(0, 3), R(0, 6)); sh.scale.z = .4; }
  const pen = mesh(body, new THREE.CylinderGeometry(.006, .006, .16, 6), K.paintRed, .15, T + .007, .24); pen.rotation.set(0, 0, Math.PI / 2); pen.rotation.y = .4;
  const pot = new THREE.Group(); pot.position.set(-.62, T, -.2); body.add(pot);
  mesh(pot, lathe([[.0, 0], [.045, 0], [.05, .01], [.05, .08], [.054, .085], [.0, .085]], 16), K.iron).rotation.x = -Math.PI / 2;
  for (let i = 0; i < 9; i++) { const n = mesh(pot, new THREE.CylinderGeometry(.003, .002, .08, 5), K.steel, R(-.025, .025), .09, R(-.025, .025)); n.rotation.set(R(-.4, .4), 0, R(-.4, .4)); }
  // ---- back frame: two posts, crossbar, a small tool rack with pliers + chisel ----
  const PH = 1.62;
  for (const sx of [-1, 1]) mesh(body, rbox(.07, PH - T + .1, .07, .01), K.oak, sx * (W / 2 - .1), T + (PH - T) / 2 - .05, -D / 2 + .06);
  mesh(body, rbox(W - .05, .08, .08, .012), K.oak, 0, PH, -D / 2 + .06);
  mesh(body, rbox(W - .3, .05, .035, .008), K.oak, 0, T + .28, -D / 2 + .07); // rack rail
  for (let i = 0; i < 3; i++) { const c = mesh(body, rbox(.02, .2, .012, .004), i === 1 ? K.walnut : K.beech, -.45 + i * .06, T + .2, -D / 2 + .1); c.rotation.z = R(-.08, .08); } // chisels hanging
  for (let i = 0; i < 3; i++) mesh(body, rbox(.012, .03, .012, .003), K.steel, -.45 + i * .06, T + .085, -D / 2 + .1);
  const pliers = new THREE.Group(); pliers.position.set(.45, T + .22, -D / 2 + .1); body.add(pliers);
  for (const sd of [-1, 1]) { const arm = mesh(pliers, rbox(.014, .2, .01, .004), K.paintRed, sd * .02, -.05, 0); arm.rotation.z = sd * .12; }
  mesh(pliers, rbox(.03, .06, .014, .005), K.iron, 0, .07, 0);
  // ---- idea holder: hook on the crossbar, the sign hangs on two strings ----
  const hang = new THREE.Group(); hang.position.set(0, PH - .04, -D / 2 + .1); body.add(hang);
  mesh(hang, new THREE.TorusGeometry(.03, .006, 6, 14, Math.PI * 1.4), K.brass, 0, -.03, .02).rotation.z = Math.PI * .8; // hook
  const swing = new THREE.Group(); swing.position.set(0, -.06, .03); hang.add(swing); // pivot of the sign (swings / jiggles)
  const SW = .44, SH = SW * 300 / 256;
  const cv = signCanvas(), tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const signMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0, roughness: .85, transparent: true, alphaTest: .1, side: THREE.DoubleSide });
  const sign = new THREE.Group(); sign.position.set(0, -.12 - SH / 2, .04); sign.rotation.x = -.35; swing.add(sign); // tilted towards the camera
  const card = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), signMat); card.castShadow = true; sign.add(card);
  mesh(sign, rbox(SW * .92, .025, .03, .008), K.darkWood, 0, SH / 2 - .005, -.005); // little rail on top of the sign
  const topY = -.12 - SH / 2 + SH / 2 * Math.cos(.35), topZ = .04 - SH / 2 * Math.sin(.35); // top edge of the tilted sign
  for (const sx of [-1, 1]) rod(swing, K.twine, .004, V3(sx * SW * .4, topY, topZ), V3(0, 0, 0), 5); // strings to the hook
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: opts.xpColor ?? XP_GOLD, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(SW * 2.1, SH * 1.9), glowMat); glow.position.z = -.03; glow.renderOrder = 2; sign.add(glow);
  // ---- progress bar above the crossbar (XP colour) ----
  const bar = new THREE.Group(); bar.position.set(0, PH + .26, -D / 2 + .1); body.add(bar);
  const BW = .95, BH = .1;
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x1a120a, toneMapped: false });
  const backMat = new THREE.MeshBasicMaterial({ color: 0x3a2c18, toneMapped: false });
  const xp = new THREE.Color(opts.xpColor ?? XP_GOLD);
  const fillMat = new THREE.MeshBasicMaterial({ color: xp.clone(), toneMapped: false });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .35, toneMapped: false, depthWrite: false });
  const fr = new THREE.Mesh(new THREE.PlaneGeometry(BW + .05, BH + .05), frameMat); bar.add(fr);
  const bk = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), backMat); bk.position.z = .002; bar.add(bk);
  const fillGeo = new THREE.PlaneGeometry(BW, BH).translate(BW / 2, 0, 0);
  const fill = new THREE.Mesh(fillGeo, fillMat); fill.position.set(-BW / 2, 0, .004); bar.add(fill);
  const shine = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH * .28).translate(BW / 2, 0, 0), shineMat); shine.position.set(-BW / 2, BH * .22, .006); bar.add(shine);
  const barGlowMat = new THREE.MeshBasicMaterial({ map: glowTex(), color: xp.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const barGlow = new THREE.Mesh(new THREE.PlaneGeometry(BW * 1.5, BH * 5), barGlowMat); barGlow.position.z = -.01; bar.add(barGlow);
  for (const m of [fr, bk, fill, shine, barGlow]) { m.renderOrder = 3; m.castShadow = false; }
  group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m !== card && !(m.material as THREE.Material).transparent) m.receiveShadow = true; });

  let idea: Idea | null = null, ideaKey = '', prog = 0, shown = 0, ready = false, t = 0, kick = 0, kickV = 0, flash = 0, shake = 0;
  const redraw = () => {
    const key = ideaKey;
    if (idea?.svg) {
      const img = new Image(), blob = new Blob([idea.svg.includes('xmlns') ? idea.svg : idea.svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); if (key !== ideaKey) return; paintSign(cv, idea, img); tex.needsUpdate = true; };
      img.onerror = () => { URL.revokeObjectURL(url); };
      img.src = url;
      paintSign(cv, idea, null); // name + ring at once, the icon follows when the image is decoded
    } else paintSign(cv, idea, null);
    tex.needsUpdate = true;
  };
  redraw();
  const wb: Workbench = {
    group,
    setIdea(i) {
      const key = i ? JSON.stringify(i) : ''; if (key === ideaKey) return;
      const had = !!idea; idea = i; ideaKey = key; redraw();
      swing.visible = !!i; bar.visible = !!i;
      if (i && had) kickV += 3; // a new card swings in
    },
    setProgress(p) { prog = Math.max(0, Math.min(1, p)); },
    setReady(on) { if (on && !ready) { kickV += 4; flash = 1; } ready = on; },
    hit(k = 1) { kickV += (R(-1, 1) > 0 ? 1 : -1) * 1.6 * k; flash = Math.max(flash, .6 * k); shake = .12 * k; },
    update(dt, camera) {
      t += dt;
      shown += (prog - shown) * Math.min(1, dt * 10); if (Math.abs(prog - shown) < 1e-3 || prog < shown - .5) shown = prog; // a new idea resets at once
      fill.scale.x = Math.max(1e-4, shown); shine.scale.x = Math.max(1e-4, shown);
      // sign: damped swing around the hook, ready = keeps swinging gently
      kickV += (-kick * 40 - kickV * 3.2) * dt; kick += kickV * dt;
      swing.rotation.z = kick * .18 + (ready ? Math.sin(t * 2.4) * .06 : 0);
      swing.rotation.x = Math.abs(kick) * .05;
      flash = Math.max(0, flash - dt * 3);
      const pulse = ready ? .5 + .5 * Math.sin(t * 5) : 0;
      fillMat.color.copy(xp).multiplyScalar(1 + pulse * .8 + flash * .6);
      shineMat.opacity = .3 + pulse * .4;
      barGlowMat.opacity = ready ? .25 + pulse * .45 : flash * .3;
      glowMat.opacity = ready ? .35 + pulse * .45 : 0;
      signMat.emissiveIntensity = ready ? .12 + pulse * .25 : flash * .08;
      sign.scale.setScalar(1 + (ready ? pulse * .05 : 0));
      // the bench shakes a hair on every blow
      shake = Math.max(0, shake - dt); body.position.y = shake > 0 ? Math.sin(shake * 120) * .004 * shake / .12 : 0;
      if (camera) { bar.quaternion.copy(camera.quaternion); const pq = new THREE.Quaternion(); group.getWorldQuaternion(pq); bar.quaternion.premultiply(pq.invert()); }
    },
  };
  wb.setIdea(null);
  return wb;
}
