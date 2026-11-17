// Start menu: small character card on the left (name, preview, four rows of choices, dice),
// menu on the right. The garden runs behind it with a slow cinematic camera (view.updateCamera).
import * as THREE from 'three';
import { LOOK_COUNT, Look, cleanLook, randomLook, saveLook } from '../look';
import { HAIR, OUTFITS, SKIN, animateArms, animateLegs, buildFarmer, disposeFarmer, plaidSwatch, Rig } from '../view/farmer';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const svg = (body: string) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const HEAD = '<circle cx="16" cy="18" r="7.5"/>';
const HAIR_I = [
  // Pippi braids
  '<path d="M8.5 17q0-8 7.5-8t7.5 8q-2-4-7.5-4t-7.5 4z" fill="currentColor"/><path d="M9 16l-6-5M23 16l6-5" stroke-width="3"/><path d="M2 9.5l2 2.5M30 9.5l-2 2.5"/>',
  // bob
  '<path d="M7 24q-1-15 9-15t9 15h-3q0-7-1-9-3-1-10 0-1 2-1 9z" fill="currentColor"/>',
  // tonsure
  '<path d="M8.5 19q-.5-5 2-8M23.5 19q.5-5-2-8M11 11q5-2.5 10 0" stroke-width="3.2"/>',
  // afro
  '<g fill="currentColor"><circle cx="16" cy="9" r="5"/><circle cx="9.5" cy="11.5" r="4.5"/><circle cx="22.5" cy="11.5" r="4.5"/><circle cx="7" cy="17" r="3.6"/><circle cx="25" cy="17" r="3.6"/></g>',
].map(p => svg(HEAD + p));
const DICE = svg('<rect x="5" y="5" width="22" height="22" rx="5"/><circle cx="11" cy="11" r="1.7" fill="currentColor"/><circle cx="21" cy="11" r="1.7" fill="currentColor"/><circle cx="16" cy="16" r="1.7" fill="currentColor"/><circle cx="11" cy="21" r="1.7" fill="currentColor"/><circle cx="21" cy="21" r="1.7" fill="currentColor"/>');

type Key = 'hair' | 'hairCol' | 'skin' | 'outfit';

export class StartMenu {
  look: Look;
  private el = document.getElementById('menu')!;
  private canvas = document.getElementById('mCanvas') as HTMLCanvasElement;
  private name = document.getElementById('mName') as HTMLInputElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(24, 1, .05, 30);
  private rig: Rig | null = null;
  private turn = new THREE.Group();
  private yaw = .45; private drag: number | null = null; private spin = 0;
  private raf = 0; private last = 0; private t = 0; private pop = 0;
  onSound: (k: string) => void = () => {};

  constructor(look: Look) {
    this.look = cleanLook(look);
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xe8efff, 0x3a3020, 1.15));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.6); key.position.set(1.4, 3, 2.4); s.add(key);
    const rim = new THREE.DirectionalLight(0xffd79a, 2.2); rim.position.set(-1.8, 2.2, -2.2); s.add(rim);
    const rim2 = new THREE.DirectionalLight(0x9fc0ff, 1.1); rim2.position.set(2, 1.5, -2); s.add(rim2);
    s.add(this.turn);
    // drag to turn the figure (a flick keeps it spinning a little)
    this.canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; this.spin = 0; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (this.drag === null) return; const d = (e.clientX - this.drag) * .014; this.yaw += d; this.spin = d * 30; this.drag = e.clientX; });
    const up = () => { this.drag = null; };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
    this.name.value = this.look.name;
    this.name.addEventListener('input', () => { this.look.name = this.name.value.slice(0, 16); this.save(); });
    this.name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') this.name.blur(); });
    this.name.addEventListener('blur', () => { if (!this.name.value.trim()) { this.look = cleanLook({ ...this.look, name: '' }); this.name.value = this.look.name; this.save(); } });
    const dice = document.getElementById('mDice')!; dice.innerHTML = DICE;
    dice.addEventListener('click', () => {
      this.onSound('ui.confirm'); this.look = randomLook(); this.name.value = this.look.name; this.save();
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
      this.name.classList.remove('flash'); void this.name.offsetWidth; this.name.classList.add('flash');
      this.rebuild(); this.renderOpts(); this.spin = 9;
    });
    // keyboard: arrows move through the menu, Enter activates (native)
    addEventListener('keydown', e => {
      if (this.el.hidden || document.activeElement === this.name) return;
      const items = [...this.el.querySelectorAll<HTMLButtonElement>('#mNav .mi:not([hidden])')];
      if (!items.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      e.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const n = i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[n].focus(); this.onSound('ui.hover');
    });
    this.el.querySelectorAll<HTMLElement>('#mNav .mi').forEach(b => b.addEventListener('pointerenter', () => this.onSound('ui.hover')));
    addEventListener('resize', () => this.resize());
    const motes = document.getElementById('mMotes')!, r = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 26; i++) {
      const m = document.createElement('i'); if (Math.random() < .4) m.className = 'g';
      m.style.cssText = `left:${r(0, 100)}%;--s:${r(3, 7).toFixed(1)}px;--d:${r(14, 28).toFixed(1)}s;--dl:${r(-28, 0).toFixed(1)}s;--x:${r(-60, 60).toFixed(0)}px;--o:${r(.35, .85).toFixed(2)}`;
      motes.appendChild(m);
    }
    this.renderOpts();
  }
  private save() { saveLook(cleanLook(this.look)); }
  /** menu shown / hidden: run the preview only while visible, replay the entrance */
  setActive(on: boolean) {
    if (!on) { cancelAnimationFrame(this.raf); this.raf = 0; return; }
    if (this.raf) return;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    }
    if (!this.rig) this.rebuild();
    this.el.classList.remove('intro'); void this.el.offsetWidth; this.el.classList.add('intro');
    this.last = performance.now(); this.loop(); requestAnimationFrame(() => this.resize());
  }
  private resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  private rebuild() {
    if (this.rig) { this.turn.remove(this.rig.root); disposeFarmer(this.rig); }
    this.rig = buildFarmer(this.look); this.turn.add(this.rig.root); this.pop = 1;
    animateLegs(this.rig, 0, 0, 0); this.turn.updateMatrixWorld(true); animateArms(this.rig, 0, 0, [null, null], true);
  }
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.renderer || !this.rig) return;
    if (this.canvas.width !== Math.round(this.canvas.clientWidth * this.renderer.getPixelRatio())) this.resize();
    if (this.drag === null) { this.yaw += this.spin * dt; this.spin *= Math.exp(-dt * 2.5); this.yaw += Math.sin(this.t * .45) * dt * .1; }
    this.turn.rotation.y = this.yaw;
    this.pop = Math.max(0, this.pop - dt * 2.2);
    const p = this.pop, sq = Math.sin((1 - p) * Math.PI * 3) * p * .06;
    this.turn.scale.set(1 - sq * .5, 1 + sq, 1 - sq * .5);
    const R = this.rig;
    animateLegs(R, dt, 0, 0);
    R.head.rotation.y = Math.sin(this.t * .37) * .32 * Math.max(0, Math.sin(this.t * .13)); // looks around now and then
    this.turn.updateMatrixWorld(true); animateArms(R, dt, 0, [null, null]);
    const a = this.cam.aspect, dist = 3.3 / Math.min(1, a * 1.35);
    this.cam.position.set(0, .92, dist); this.cam.lookAt(0, .68, 0);
    this.renderer.render(this.scene, this.cam);
  };

  private renderOpts() {
    const L = this.look;
    const opt = (k: Key, i: number, inner: string, cls = '', style = '') =>
      `<button class="mo ${cls}${L[k] === i ? ' on' : ''}" data-k="${k}" data-v="${i}"${style ? ` style="${style}"` : ''}>${inner}</button>`;
    const row = (k: Key, f: (i: number) => string) => `<div class="mRow">${Array.from({ length: LOOK_COUNT[k] }, (_, i) => f(i)).join('')}</div>`;
    const html = [
      row('hair', i => opt('hair', i, HAIR_I[i], 'ico')),
      row('hairCol', i => opt('hairCol', i, '', 'sw', `--c:${hex(HAIR[i])}`)),
      row('skin', i => opt('skin', i, '', 'sw', `--c:${hex(SKIN[i])}`)),
      row('outfit', i => opt('outfit', i, '', 'sw out', `background:linear-gradient(135deg,transparent 50%,${hex(OUTFITS[i][0])} 50%),url(${plaidSwatch(i)}) center/cover`)),
    ].join('');
    const box = document.getElementById('mOpts')!; box.innerHTML = html;
    box.querySelectorAll<HTMLElement>('.mo').forEach(b => {
      b.addEventListener('pointerenter', () => this.onSound('ui.hover'));
      b.addEventListener('click', () => {
        const k = b.dataset.k as Key, v = +b.dataset.v!; if (this.look[k] === v) return;
        this.onSound('ui.click'); this.look[k] = v; this.save(); this.rebuild(); this.renderOpts();
      });
    });
  }
}
