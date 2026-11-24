// Start menu: small character card on the left (name, preview, four rows of choices, dice),
// menu on the right. The garden runs behind it with a slow cinematic camera (view.updateCamera).
import * as THREE from 'three';
import { FIRST, LAST, LOOK_COUNT, Look, LookKey, NAME_MAX, cleanLook, randomLook, saveLook } from '../look';
import { EYE_COLS, GLASS_COLS, HAT_COLS, METALS, OVERALLS, SPECIES, animateArms, animateLegs, buildFarmer, disposeFarmer, Rig } from '../view/farmer';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
const svg = (body: string) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
// animal heads: raccoon (mask), red panda (round ears, cheeks), fox (long ears, pointed), dog (floppy ears), cat (ears + whiskers)
const ANIMAL_I = [
  '<path d="M7 13l1-7 6 4M25 13l-1-7-6 4"/><ellipse cx="16" cy="18" rx="10" ry="8.5"/><path d="M7.5 16.5q4.5-3 8.5 0 4-3 8.5 0-1.5 3.5-4.5 3-2.5-.5-4-2.5-1.5 2-4 2.5-3 .5-4.5-3z" fill="currentColor" stroke="none"/><circle cx="16" cy="23" r="1.4" fill="currentColor"/>',
  '<path d="M6.5 12q-1-6 4.5-5M25.5 12q1-6-4.5-5"/><ellipse cx="16" cy="17.5" rx="10.5" ry="8.5"/><path d="M11 14.5l1.5 6M21 14.5l-1.5 6" stroke-width="1.6"/><circle cx="12" cy="15.5" r="1.3" fill="currentColor"/><circle cx="20" cy="15.5" r="1.3" fill="currentColor"/><circle cx="16" cy="21" r="1.3" fill="currentColor"/>',
  '<path d="M8 15L7 3l7 7M24 15l1-12-7 7"/><path d="M6 14q10-6 20 0l-10 14z"/><circle cx="16" cy="26.5" r="1.4" fill="currentColor"/>',
  '<ellipse cx="16" cy="17" rx="8.5" ry="9"/><path d="M8.5 11q-5 0-4.5 10 3 1 4.5-2M23.5 11q5 0 4.5 10-3 1-4.5-2" fill="currentColor"/><ellipse cx="16" cy="21.5" rx="2.4" ry="1.7" fill="currentColor" stroke="none"/>',
  '<path d="M7 14l1-8 6 4M25 14l-1-8-6 4"/><ellipse cx="16" cy="18" rx="10" ry="8.5"/><path d="M3 19l7 1M3 23l7-1M29 19l-7 1M29 23l-7-1" stroke-width="1.3"/><path d="M14.8 21h2.4l-1.2 1.4z" fill="currentColor"/>',
].map(svg);
const NONE = svg('<circle cx="16" cy="16" r="10" stroke-width="1.6" opacity=".5"/><path d="M9 23L23 9" stroke-width="1.6" opacity=".5"/>');
const HAT_I = [NONE, ...[
  '<path d="M3 21q13 6 26 0M9 20q-1-9 7-9t7 9" /><path d="M9.5 17.5q6.5 2 13 0" stroke-width="2.6"/>', // straw hat
  '<path d="M7 19q0-10 9-10t9 10z"/><path d="M15 19q7-1 14 2"/>', // cap
  '<path d="M7 21q0-12 9-12t9 12z"/><path d="M6 21h20v3H6z"/><circle cx="16" cy="6.5" r="2.6" fill="currentColor"/>', // bobble hat
  '<path d="M10 19l1.5-8h9l1.5 8M4 23q12-6 24 0"/>', // bucket hat
  '<path d="M6 19q0-8 10-8 8 0 10 6l-2 2zM6 19h18l4 2"/>', // flat cap
].map(svg)];
const GLASS_I = [NONE, ...[
  '<circle cx="9.5" cy="17" r="5"/><circle cx="22.5" cy="17" r="5"/><path d="M14.5 16q1.5-2 3 0M4.5 16L2 14M27.5 16l2.5-2"/>',
  '<rect x="4" y="12.5" width="10" height="8" rx="1.5"/><rect x="18" y="12.5" width="10" height="8" rx="1.5"/><path d="M14 15.5q2-1.5 4 0"/>',
  '<path d="M3.5 13h11l-1 5q-1 3.5-4.5 3.5T4.5 18zM17.5 13h11l-1 5q-1 3.5-4.5 3.5t-4.5-3.5z" fill="currentColor"/><path d="M14.5 14h3"/>',
].map(svg)];
const EAR_I = [NONE, ...[
  '<path d="M10 25V8l12 6-6 11z" opacity=".55"/><circle cx="14" cy="20" r="2.4" fill="currentColor" stroke="none"/>',
  '<path d="M10 25V8l12 6-6 11z" opacity=".55"/><circle cx="13" cy="25" r="4.2"/>',
  '<path d="M10 25V8l12 6-6 11z" opacity=".55"/><circle cx="12" cy="18" r="2.4"/><circle cx="13" cy="23.5" r="2.4"/><circle cx="15.5" cy="12.5" r="2.4"/>',
].map(svg)];
const PIERCE_I = [NONE, ...[
  '<path d="M9 13q7-5 14 0l-7 7z" fill="currentColor" opacity=".55" stroke="none"/><circle cx="16" cy="24" r="4"/>',
  '<circle cx="16" cy="20" r="4.5" opacity=".55"/><path d="M9 11l13-3"/><circle cx="9" cy="11" r="2" fill="currentColor"/><circle cx="22" cy="8" r="2" fill="currentColor"/>',
].map(svg)];
const TAB_I = [
  svg('<circle cx="16" cy="20" r="5"/><circle cx="8.5" cy="13" r="2.6"/><circle cx="13" cy="8.5" r="2.6"/><circle cx="19" cy="8.5" r="2.6"/><circle cx="23.5" cy="13" r="2.6"/>'), // paw
  svg('<path d="M9 4v9h14V4M9 13l-2 15h7l2-8 2 8h7l-2-15"/><path d="M9 7h14" opacity=".6"/>'), // overalls
  HAT_I[1], GLASS_I[1], EAR_I[2],
];
const DICE = svg('<rect x="5" y="5" width="22" height="22" rx="5"/><circle cx="11" cy="11" r="1.7" fill="currentColor"/><circle cx="21" cy="11" r="1.7" fill="currentColor"/><circle cx="16" cy="16" r="1.7" fill="currentColor"/><circle cx="11" cy="21" r="1.7" fill="currentColor"/><circle cx="21" cy="21" r="1.7" fill="currentColor"/>');
const DIE_S = svg('<rect x="7" y="7" width="18" height="18" rx="4"/><circle cx="12.5" cy="12.5" r="1.6" fill="currentColor"/><circle cx="19.5" cy="19.5" r="1.6" fill="currentColor"/>');

type Key = LookKey;
const TABS: Key[][] = [['animal', 'fur', 'eyes'], ['outfit'], ['hat', 'hatCol'], ['glasses', 'glassCol'], ['earring', 'pierce', 'metal']];

/** yaw at which the figure looks at the camera (slightly turned, reads better than straight on) */
const FRONT = .45, TAU = Math.PI * 2, ROLL = 1.1;

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
  private tab = 0;
  private yaw = FRONT; private drag: number | null = null; private spin = 0;
  /** dice roll: one full turn that always ends facing the camera */
  private roll = { t: -1, from: 0, to: 0 };
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
    this.canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; this.spin = 0; this.roll.t = -1; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (this.drag === null) return; const d = (e.clientX - this.drag) * .014; this.yaw += d; this.spin = d * 30; this.drag = e.clientX; });
    const up = () => { this.drag = null; };
    this.canvas.addEventListener('pointerup', up); this.canvas.addEventListener('pointercancel', up);
    this.name.value = this.look.name; this.renderName();
    this.name.addEventListener('input', () => { this.look.name = this.name.value.slice(0, NAME_MAX); this.renderName(); this.save(); });
    this.name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === 'Escape') this.name.blur(); });
    this.name.addEventListener('blur', () => { if (!this.name.value.trim()) { this.look = cleanLook({ ...this.look, name: '' }); this.name.value = this.look.name; this.save(); this.renderName(); } });
    const dice = document.getElementById('mDice')!; dice.innerHTML = DICE;
    dice.addEventListener('click', () => {
      this.onSound('ui.confirm'); this.look = randomLook(); this.name.value = this.look.name; this.save(); this.renderName();
      dice.classList.remove('roll'); void dice.offsetWidth; dice.classList.add('roll');
      this.name.classList.remove('flash'); void this.name.offsetWidth; this.name.classList.add('flash');
      this.rebuild(); this.renderOpts(); this.spin = 0;
      const k = Math.round((this.yaw - FRONT) / TAU); this.roll = { t: 0, from: this.yaw, to: FRONT + (k + 1) * TAU };
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
    if (this.roll.t >= 0 && this.drag === null) {
      const r = this.roll; r.t = Math.min(1, r.t + dt / ROLL); const e = 1 - (1 - r.t) ** 3; // fast start, soft landing
      this.yaw = r.from + (r.to - r.from) * e; if (r.t >= 1) r.t = -1;
    } else if (this.drag === null) { this.yaw += this.spin * dt; this.spin *= Math.exp(-dt * 2.5); this.yaw += Math.sin(this.t * .45) * dt * .1; }
    this.turn.rotation.y = this.yaw;
    this.pop = Math.max(0, this.pop - dt * 2.2);
    const p = this.pop, sq = Math.sin((1 - p) * Math.PI * 3) * p * .06;
    this.turn.scale.set(1 - sq * .5, 1 + sq, 1 - sq * .5);
    const R = this.rig;
    animateLegs(R, dt, 0, 0);
    R.head.rotation.y = Math.sin(this.t * .37) * .32 * Math.max(0, Math.sin(this.t * .13)); // looks around now and then
    this.turn.updateMatrixWorld(true); animateArms(R, dt, 0, [null, null]);
    const a = this.cam.aspect, dist = 3.3 / Math.min(1, a * 1.35);
    this.cam.position.set(0, 1.0, dist * 1.12); this.cam.lookAt(0, .74, 0);
    this.renderer.render(this.scene, this.cam);
  };

  /** first name + surname: each picked from a list or rolled on its own (the name field stays free text) */
  private renderName() {
    let box = document.getElementById('mNameParts');
    if (!box) { box = document.createElement('div'); box.id = 'mNameParts'; this.name.insertAdjacentElement('afterend', box); }
    const [f, l] = this.split();
    const sel = (id: string, list: string[], cur: string) => `<div class="mNp"><select id="${id}">${list.includes(cur) ? '' : `<option selected>${cur || '…'}</option>`}${list.map(n => `<option${n === cur ? ' selected' : ''}>${n}</option>`).join('')}</select><button class="mNd" data-p="${id}">${DIE_S}</button></div>`;
    box.innerHTML = sel('mFirst', FIRST, f) + sel('mLast', LAST, l);
    const set = (first: string, last: string) => { this.look.name = (first + ' ' + last).trim().slice(0, NAME_MAX); this.name.value = this.look.name; this.save(); this.renderName(); };
    box.querySelectorAll<HTMLSelectElement>('select').forEach(s => s.addEventListener('change', () => { this.onSound('ui.click'); const [a, b] = this.split(); s.id === 'mFirst' ? set(s.value, b) : set(a, s.value); }));
    box.querySelectorAll<HTMLElement>('.mNd').forEach(b => b.addEventListener('click', () => {
      this.onSound('ui.confirm'); const [a, c] = this.split(), r = (L: string[]) => L[Math.floor(Math.random() * L.length)];
      if (b.dataset.p === 'mFirst') set(r(FIRST), c); else set(a, r(LAST));
      this.name.classList.remove('flash'); void this.name.offsetWidth; this.name.classList.add('flash');
    }));
  }
  /** split the name into a first name and a surname (surnames can have two words: "von Kompost") */
  private split(): [string, string] {
    const n = this.look.name.trim(), last = LAST.find(x => n.endsWith(' ' + x));
    if (last) return [n.slice(0, n.length - last.length - 1), last];
    const i = n.indexOf(' '); return i < 0 ? [n, ''] : [n.slice(0, i), n.slice(i + 1)];
  }
  private renderOpts() {
    const L = this.look, sp = SPECIES[L.animal];
    const opt = (k: Key, i: number, inner: string, cls = '', style = '') =>
      `<button class="mo ${cls}${L[k] === i ? ' on' : ''}" data-k="${k}" data-v="${i}"${style ? ` style="${style}"` : ''}>${inner}</button>`;
    const sw = (c: number) => `--c:${hex(c)}`;
    const row = (k: Key) => {
      const n = LOOK_COUNT[k], f = (i: number): string => {
        switch (k) {
          case 'animal': return opt(k, i, ANIMAL_I[i], 'ico');
          case 'fur': { const v = sp.variants[i]; return opt(k, i, '', 'sw', `background:linear-gradient(135deg,${hex(v.main)} 55%,${hex(v.light)} 55%,${hex(v.light)} 75%,${hex(v.dark)} 75%)`); }
          case 'eyes': return opt(k, i, '<i class="eye"></i>', 'sw', sw(EYE_COLS[i]));
          case 'outfit': return opt(k, i, '', 'sw out', sw(OVERALLS[i]));
          case 'hat': return opt(k, i, HAT_I[i], 'ico');
          case 'hatCol': return opt(k, i, '', 'sw', sw(HAT_COLS[i]));
          case 'glasses': return opt(k, i, GLASS_I[i], 'ico');
          case 'glassCol': return opt(k, i, '', 'sw', sw(GLASS_COLS[i]));
          case 'earring': return opt(k, i, EAR_I[i], 'ico');
          case 'pierce': return opt(k, i, PIERCE_I[i], 'ico');
          default: return opt(k, i, '', 'sw met', sw(METALS[i]));
        }
      };
      return `<div class="mRow">${Array.from({ length: n }, (_, i) => f(i)).join('')}</div>`;
    };
    const tabs = `<div class="mTabs">${TAB_I.map((ic, i) => `<button class="mTab${i === this.tab ? ' on' : ''}" data-t="${i}">${ic}</button>`).join('')}</div>`;
    const box = document.getElementById('mOpts')!; box.innerHTML = tabs + `<div class="mPane">${TABS[this.tab].map(row).join('')}</div>`;
    box.querySelectorAll<HTMLElement>('.mTab').forEach(b => {
      b.addEventListener('pointerenter', () => this.onSound('ui.hover'));
      b.addEventListener('click', () => { const t = +b.dataset.t!; if (t === this.tab) return; this.onSound('ui.click'); this.tab = t; this.renderOpts(); });
    });
    box.querySelectorAll<HTMLElement>('.mo').forEach(b => {
      b.addEventListener('pointerenter', () => this.onSound('ui.hover'));
      b.addEventListener('click', () => {
        const k = b.dataset.k as Key, v = +b.dataset.v!; if (this.look[k] === v) return;
        this.onSound('ui.click'); this.look[k] = v;
        // picking a colour for something that is off switches it on
        if (k === 'hatCol' && !this.look.hat) this.look.hat = 1;
        if (k === 'glassCol' && !this.look.glasses) this.look.glasses = 1;
        if (k === 'metal' && !this.look.earring && !this.look.pierce) this.look.earring = 1;
        this.save(); this.rebuild(); this.renderOpts();
      });
    });
  }
}
