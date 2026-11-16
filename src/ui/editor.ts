// Character editor at game start: 3D preview + rows of icon / colour choices, name with dice.
// No explanation texts: every row is an icon followed by its choices.
import * as THREE from 'three';
import { HATS, Hat, LOOK_N, Look, cleanLook, randomLook, randomName, saveLook } from '../look';
import { EYES, HAIR, PANTS, SKIN, animateArms, animateLegs, buildFarmer, disposeFarmer, plaidSwatch, Rig } from '../view/farmer';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const svg = (body: string, vb = '0 0 32 32') => `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// ---- icons ----
const DICE = svg('<rect x="5" y="5" width="22" height="22" rx="5"/><circle cx="11" cy="11" r="1.6" fill="currentColor"/><circle cx="21" cy="11" r="1.6" fill="currentColor"/><circle cx="16" cy="16" r="1.6" fill="currentColor"/><circle cx="11" cy="21" r="1.6" fill="currentColor"/><circle cx="21" cy="21" r="1.6" fill="currentColor"/>');
const FACE_I = [
  '<circle cx="16" cy="17" r="11"/>',
  '<ellipse cx="16" cy="16.5" rx="9" ry="12"/>',
  '<path d="M6 9q0-4 4-4h12q4 0 4 4v10q0 8-10 8T6 19z"/>',
  '<ellipse cx="16" cy="16" rx="7.5" ry="13"/>',
  '<path d="M5 12q0-7 11-7t11 7q0 9-11 16Q5 21 5 12z"/>',
].map(p => svg(p + '<circle cx="12.5" cy="15" r="1.2" fill="currentColor"/><circle cx="19.5" cy="15" r="1.2" fill="currentColor"/>'));
const BODY_I = [[7, 5, 1.05], [8.5, 7, 1], [11, 8, 1], [9, 11, .97], [10, 9, .86]].map(([s, w, h]) => {
  const top = 30 - 21 * h;
  return svg(`<circle cx="16" cy="${top - 2.5}" r="3.5"/><path d="M${16 - s} ${top + 3}h${s * 2}l${-(s - w)} ${13 * h}h${-w * 2}z"/><path d="M${16 - w * .8} ${top + 3 + 13 * h}v${8 * h}M${16 + w * .8} ${top + 3 + 13 * h}v${8 * h}"/>`);
});
const HEAD = '<circle cx="16" cy="18" r="8.5"/>';
const HAIR_I = [
  '<path d="M7.5 17q0-10 8.5-10t8.5 10q-2-5-8.5-5t-8.5 5z" fill="currentColor"/>',
  '<circle cx="16" cy="6" r="3.5" fill="currentColor"/><path d="M7.5 17q0-8 8.5-8t8.5 8q-3-4-8.5-4t-8.5 4z" fill="currentColor"/>',
  '<path d="M7.5 17q0-8 8.5-8t8.5 8q-3-4-8.5-4t-8.5 4z" fill="currentColor"/><path d="M24.5 17q3 4 1 12" stroke-width="3"/>',
  '<g fill="currentColor"><circle cx="10" cy="11" r="3.4"/><circle cx="16" cy="8.5" r="3.6"/><circle cx="22" cy="11" r="3.4"/><circle cx="7.8" cy="16" r="2.8"/><circle cx="24.2" cy="16" r="2.8"/></g>',
  '<path d="M7.5 19q-.5-5 2-7M24.5 19q.5-5-2-7" stroke-width="3.4"/>',
].map(p => svg(HEAD + p));
const ACC: { key: 'stache' | 'pierce' | 'tattoo' | 'band'; icon: string }[] = [
  { key: 'stache', icon: svg('<path d="M16 15q-3-4-8-1t-5 6q4-3 7-2t6-3q3 4 6 3t7 2q0-3-5-6t-8 1z" fill="currentColor"/>') },
  { key: 'pierce', icon: svg('<path d="M14 6q-1 7-4 10t3 4h6q5-1 2-4t-4-10"/><circle cx="16" cy="24" r="4"/>') },
  { key: 'tattoo', icon: svg('<path d="M16 28q-6-6 0-12t0-12"/><path d="M16 16q5-3 8 0-4 3-8 0zM16 10q-5-3-8 0 4 3 8 0zM16 22q-5-3-8 0 4 3 8 0z" fill="currentColor"/>') },
  { key: 'band', icon: svg('<path d="M5 22q0-15 11-15t11 15" stroke-width="3"/><circle cx="23" cy="11" r="3.2"/>') },
];
const HAT_I: Record<string, string> = {
  '': svg('<circle cx="16" cy="16" r="10"/><path d="M9 23L23 9"/>'),
  sun: svg('<path d="M2 21q6-4 14-4t14 4q-7 3-14 3T2 21z" fill="currentColor"/><path d="M9 18q0-9 7-9t7 9"/><path d="M22 16l4 1-3 3"/>'),
  straw: svg('<path d="M4 22h24"/><path d="M10 22v-8q0-4 6-4t6 4v8"/><path d="M10 18h12" stroke-width="3"/>'),
  top: svg('<path d="M5 24q11 3 22 0"/><path d="M10 24V6h12v18"/><path d="M10 20h12" stroke-width="3"/>'),
  cap: svg('<path d="M5 20q0-10 11-10t11 9l-7 1q-3 1-15 0z" fill="currentColor"/><path d="M20 19q6 0 9 3"/>'),
};
const CAT: Record<string, string> = {
  face: svg('<circle cx="16" cy="16" r="11"/><circle cx="12" cy="14" r="1.3" fill="currentColor"/><circle cx="20" cy="14" r="1.3" fill="currentColor"/><path d="M12 20q4 3 8 0"/>'),
  body: svg('<circle cx="16" cy="6" r="3.5"/><path d="M9 12h14l-2 10h-10z"/><path d="M12 22v7M20 22v7"/>'),
  hair: svg('<path d="M6 18q0-12 10-12t10 12q-2-6-10-6T6 18z" fill="currentColor"/><path d="M8 18q0 8 8 8t8-8"/>'),
  hairCol: svg('<path d="M8 6v20M8 9h10M8 13h12M8 17h10M8 21h12"/>'),
  skin: svg('<path d="M10 28v-9l-3-4q-1-2 1-3l4 4V6q0-2 2-2t2 2v8-10q0-2 2-2t2 2v10-8q0-2 2-2t2 2v12q0 7-5 10z"/>'),
  eyes: svg('<path d="M3 16q13-12 26 0-13 12-26 0z"/><circle cx="16" cy="16" r="4.5" fill="currentColor"/>'),
  shirt: svg('<path d="M11 5l5 4 5-4 7 5-3 5-3-2v15H10V13l-3 2-3-5z"/><path d="M10 15h12M10 21h12M14 9v19M18 9v19" stroke-width="1"/>'),
  pants: svg('<path d="M10 4v8h12V4M8 12h16v16h-6l-2-9-2 9H8z"/><rect x="13" y="13" width="6" height="4"/>'),
  acc: svg('<path d="M16 4l3 7 7 .5-5.5 4.5 2 7L16 19l-6.5 4 2-7L6 11.5l7-.5z"/>'),
  hat: HAT_I.straw,
};

type Key = 'face' | 'body' | 'hair' | 'hairCol' | 'skin' | 'eyes' | 'shirt' | 'pants';
const FOCUS: Record<string, number> = { face: 1, hair: 1, hairCol: 1, skin: .6, eyes: 1, acc: 1, hat: .8, body: 0, shirt: .2, pants: 0 };

export class Editor {
  private look!: Look;
  private el = document.getElementById('editor')!;
  private canvas = document.getElementById('edCanvas') as HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(28, 1, .05, 30);
  private rig: Rig | null = null;
  private turn = new THREE.Group();
  private yaw = .35; private drag: number | null = null; private focus = 0; private focusT = 0;
  private raf = 0; private last = 0; private t = 0;
  private done: (l: Look) => void = () => {};
  private back: () => void = () => {};
  onSound: (k: string) => void = () => {};

  constructor() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe6eeff, 0x40331f, 1.25));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4); key.position.set(1.6, 3, 2.6); s.add(key);
    const rim = new THREE.DirectionalLight(0xa8c4ff, 1.3); rim.position.set(-2, 2, -2.5); s.add(rim);
    const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .002; s.add(sh);
    s.add(this.turn);
    // drag to turn the figure
    this.canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (this.drag === null) return; this.yaw += (e.clientX - this.drag) * .012; this.drag = e.clientX; });
    const up = () => { this.drag = null; };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('dblclick', () => { this.focusT = this.focusT > .5 ? 0 : 1; });
    const name = document.getElementById('edNameIn') as HTMLInputElement;
    name.addEventListener('input', () => { this.look.name = name.value.slice(0, 16); });
    name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') name.blur(); });
    this.btn('edNameDice', () => { this.look.name = randomName(); name.value = this.look.name; });
    this.btn('edDice', () => { this.look = randomLook(); name.value = this.look.name; this.rebuild(); this.renderRows(); });
    this.btn('edGo', () => this.finish());
    this.btn('edBack', () => { this.close(); this.back(); });
    addEventListener('resize', () => this.resize());
    for (const id of ['edNameDice', 'edDice']) document.getElementById(id)!.innerHTML = DICE;
    document.getElementById('edBack')!.innerHTML = svg('<path d="M20 7l-9 9 9 9"/>');
    document.getElementById('edGo')!.innerHTML = svg('<path d="M7 16.5l6 6L25 10" stroke-width="3.2"/>');
  }
  private btn(id: string, f: () => void) { document.getElementById(id)!.addEventListener('click', () => { this.onSound('ui.click'); f(); }); }

  open(look: Look, done: (l: Look) => void, back: () => void) {
    this.look = cleanLook(look); this.done = done; this.back = back;
    (document.getElementById('edNameIn') as HTMLInputElement).value = this.look.name;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    }
    this.renderRows(); this.rebuild(); this.focus = this.focusT = 0;
    requestAnimationFrame(() => this.resize());
    cancelAnimationFrame(this.raf); this.last = performance.now(); this.loop();
  }
  close() { cancelAnimationFrame(this.raf); this.raf = 0; }
  private finish() {
    if (!this.look.name.trim()) this.look.name = randomName();
    this.look = cleanLook(this.look); saveLook(this.look); this.close(); this.done(this.look);
  }
  private resize() {
    if (!this.renderer || !this.raf) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  private rebuild() {
    if (this.rig) { this.turn.remove(this.rig.root); disposeFarmer(this.rig); }
    this.rig = buildFarmer(this.look); this.turn.add(this.rig.root);
    animateLegs(this.rig, 0, 0, 0); this.rig.root.updateMatrixWorld(true); animateArms(this.rig, 0, 0, [null, null], true);
  }
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (this.el.hidden || !this.renderer || !this.rig) return;
    if (this.drag === null) this.yaw += Math.sin(this.t * .5) * dt * .12;
    this.turn.rotation.y = this.yaw;
    animateLegs(this.rig, dt, 0, 0); this.turn.updateMatrixWorld(true); animateArms(this.rig, dt, 0, [null, null]);
    this.focus += (this.focusT - this.focus) * (1 - Math.exp(-dt * 5));
    const portrait = this.cam.aspect < .9, f = this.focus;
    const ty = lerpN(.72, 1.1, f), dist = lerpN(portrait ? 3.6 : 3.1, portrait ? 1.35 : 1.15, f);
    this.cam.position.set(0, ty + lerpN(.25, .05, f), dist); this.cam.lookAt(0, ty, 0);
    if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.renderer.getPixelRatio())) this.resize();
    this.renderer.render(this.scene, this.cam);
  };

  // ---------- rows ----------
  private renderRows() {
    const L = this.look, rows: string[] = [];
    const opt = (cat: string, val: string, on: boolean, inner: string, cls = '', style = '') =>
      `<button class="edO ${cls}${on ? ' on' : ''}" data-cat="${cat}" data-v="${val}"${style ? ` style="${style}"` : ''}>${inner}</button>`;
    const row = (cat: string, items: string) => rows.push(`<div class="edRow"><i class="edCat">${CAT[cat]}</i><div class="edOpts">${items}</div></div>`);
    const icons = (k: Key, list: string[]) => row(k, list.map((ic, i) => opt(k, String(i), L[k] === i, ic)).join(''));
    const swatches = (k: Key, cols: (i: number) => string) => row(k, Array.from({ length: LOOK_N }, (_, i) => opt(k, String(i), L[k] === i, '', 'sw', `background:${cols(i)}`)).join(''));
    icons('face', FACE_I);
    icons('body', BODY_I);
    icons('hair', HAIR_I);
    swatches('hairCol', i => hex(HAIR[i]));
    swatches('skin', i => hex(SKIN[i]));
    swatches('eyes', i => `radial-gradient(circle,#111 0 22%,${hex(EYES[i])} 24% 60%,#f1ece4 62%)`);
    swatches('shirt', i => `url(${plaidSwatch(i)}) center/cover`);
    swatches('pants', i => hex(PANTS[i]));
    row('acc', ACC.map(a => opt('acc', a.key, L[a.key], a.icon)).join(''));
    row('hat', (['', ...HATS] as Hat[]).map(h => opt('hat', h, L.hat === h, HAT_I[h])).join(''));
    const box = document.getElementById('edRows')!; box.innerHTML = rows.join('');
    box.querySelectorAll<HTMLElement>('.edO').forEach(b => b.addEventListener('click', () => this.pick(b.dataset.cat!, b.dataset.v!)));
  }
  private pick(cat: string, v: string) {
    const L = this.look; this.onSound('ui.click');
    if (cat === 'acc') { const k = v as 'stache' | 'pierce' | 'tattoo' | 'band'; L[k] = !L[k]; if (k === 'band' && L.band) L.hat = ''; }
    else if (cat === 'hat') { L.hat = v as Hat; if (L.hat) L.band = false; } // a headband and a hat do not go together
    else (L as any)[cat] = +v;
    this.focusT = FOCUS[cat] ?? 0;
    this.rebuild(); this.renderRows();
  }
}
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;
