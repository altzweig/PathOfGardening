import { FRUITS, SKILLS, SkillId, WEAPONS, Weapon } from '../config';
import type { Snap } from '../sim/snap';
import { sfx } from '../audio';
import { fruitIcon, iconText, mini, pic, skillIcon } from './icons';
import type { Offer } from '../sim/snap';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
export const PLAYER_CSS = ['#ffd890', '#8fc8ff', '#ff9a8a', '#d0a0ff'];

export class Hud {
  btn = {} as Record<Weapon, HTMLElement>;
  private cache: Record<string, string> = {};
  private wasReady: Record<string, boolean> = {};
  private resKey = '';
  // ammo popup of the equipped weapon
  private ammo = { w: '', vis: 0, op: 0, armed: true, last: -1, key: '' };
  /** shows the equipped weapon's ammo after a switch and once when ~lowSeconds of fire are left */
  updateAmmo(s: Snap, me: number, dt: number, pos: { x: number; y: number } | null, A: { showOnSwitch: number; lowSeconds: number; lowShow: number; fade: number }) {
    const el = $('#ammoPop'), pr = s.me[me], st = this.ammo;
    if (!pr || !pos) { el.style.opacity = '0'; return; }
    const w = WEAPONS[pr.ac];
    if (w !== st.w) { st.w = w; st.vis = w === 'rake' ? 0 : A.showOnSwitch; st.armed = true; st.last = -1; }
    let target = 0;
    if (w !== 'rake') {
      const i = SKILLS.indexOf(w as any), am = pr.am[i], secs = Math.floor(am / Math.max(1, pr.co[i])) * pr.cs[i];
      if (secs > A.lowSeconds) st.armed = true; // refilled: warn again next time
      else if (st.armed) { st.armed = false; st.vis = Math.max(st.vis, A.lowShow); }
      const key = w + am + (secs <= A.lowSeconds ? 'l' : '');
      if (key !== st.key) { st.key = key; el.innerHTML = `${fruitIcon(w)}<span>${am}</span>`; el.classList.toggle('low', secs <= A.lowSeconds); }
      target = st.vis > 0 ? 1 : 0;
    }
    st.vis = Math.max(0, st.vis - dt);
    st.op += Math.sign(target - st.op) * Math.min(Math.abs(target - st.op), dt / Math.max(.01, A.fade));
    el.style.opacity = st.op.toFixed(2);
    el.style.transform = `translate(${pos.x}px,${pos.y}px) translate(-50%,-100%)`;
  }
  constructor() {
    const box = $('#btns');
    for (const w of WEAPONS) {
      const b = document.createElement('div'); b.className = 'skill' + (w === 'rake' ? '' : ' grey'); b.dataset.skill = w;
      b.innerHTML = `<div class="charge"></div><div class="face">${skillIcon(w)}</div><div class="kn"></div>${w === 'rake' ? '' : '<span class="ammo">0</span>'}`;
      if (w !== 'rake') b.hidden = true;
      box.appendChild(b); this.btn[w] = b;
    }
  }
  reset() { this.cache = {}; this.wasReady = {}; this.resKey = ''; }
  private set(id: string, key: string, v: string, html = false) {
    if (this.cache[key] === v) return; this.cache[key] = v; const el = $(id); if (html) el.innerHTML = v; else el.textContent = v;
  }
  update(s: Snap, me: number) {
    const pr = s.me[me], ps = s.pl.find(p => p.id === me);
    if (!pr || !ps) return;
    ($('#xpfill')).style.width = Math.min(100, s.xp / s.nx * 100).toFixed(1) + '%';
    this.set('#xptext', 'xp', `${s.xp} / ${s.nx}`); this.set('#lvl', 'lv', String(s.lv));
    ($('#hpfill')).style.width = (ps.hp / ps.mhp * 100) + '%';
    this.set('#hptext', 'hp', ps.al ? `${ps.hp} / ${ps.mhp}` : '');
    const m = Math.floor(s.t / 60), sec = Math.floor(s.t % 60); this.set('#timer', 'tm', `${m}:${String(sec).padStart(2, '0')}`);
    // ammo chips for fields that exist
    const have = s.fi.map(f => FRUITS[f[1]]).filter(t => t !== 'blue');
    const key = [...new Set(have)].join(',');
    if (key !== this.resKey) {
      this.resKey = key; $('#res').innerHTML = [...new Set(have)].map(t => `<div class="chip">${fruitIcon(t)}<span data-r="${t}">0</span></div>`).join('');
      for (const k in this.cache) if (k.startsWith('r_')) delete this.cache[k];
    }
    document.querySelectorAll<HTMLElement>('#res [data-r]').forEach(el => { const i = SKILLS.indexOf(el.dataset.r as any); const v = String(pr.am[i]); if (this.cache['r_' + i] !== v) { this.cache['r_' + i] = v; el.textContent = v; } });
    const fx = (ps.po ? `<div class="chip">${mini('poison')}<span>${ps.po}</span></div>` : '') + (ps.st ? `<div class="chip">${mini('stun')}</div>` : '');
    this.set('#statusfx', 'fx', fx, true);
    const mates = s.pl.filter(p => p.id !== me).map(p => `<span class="mate" style="background:${PLAYER_CSS[p.c % 4]};opacity:${p.al ? 1 : .3}"></span>`).join('');
    this.set('#mates', 'mates', mates, true);
    this.set('#respawn', 'rs', ps.al ? '' : String(ps.rs));
    ($('#bossbar')).hidden = !(s.bs >= 0); if (s.bs >= 0) ($('#bossfill')).style.width = (s.bs * 100).toFixed(1) + '%';
    this.set('#wave', 'wv', s.wv ? `${s.wv} / ${s.wn}` : ''); $('#wave').classList.toggle('pause', !!s.wp);
    // weapons
    const active = WEAPONS[pr.ac];
    for (const w of WEAPONS) this.btn[w].classList.toggle('active', w === active);
    // only the slotted weapons are shown; while a new weapon waits for a slot, the inactive ones appear greyed out
    const slots = (pr.sl || []).map(i => SKILLS[i]);
    const swapping = s.ph === 'lvl' && (pr.sn >= 0 || !!pr.sh);
    const inactive = SKILLS.filter((id, i) => pr.ln[i] && !slots.includes(id));
    $('#hud').classList.toggle('swapping', s.ph === 'lvl' && pr.sn >= 0);
    ($('#swapKeep')).hidden = !(s.ph === 'lvl' && pr.sn >= 0);
    SKILLS.forEach((id, i) => {
      const b = this.btn[id]; const slot = slots.indexOf(id);
      const pos = slot >= 0 ? slot : swapping && pr.ln[i] ? slots.length + inactive.indexOf(id) : -1;
      b.hidden = pos < 0; if (pos < 0) { this.wasReady[id] = false; return; }
      if (b.dataset.pos !== String(pos)) b.dataset.pos = String(pos);
      b.classList.toggle('off', slot < 0); b.classList.toggle('new', pr.sn === i);
      const ready = slot >= 0 && pr.am[i] >= pr.nd[i], usable = slot >= 0 && pr.am[i] >= pr.co[i] && (ready || active === id);
      b.classList.toggle('grey', !usable); b.classList.toggle('ready', ready);
      if (ready && !this.wasReady[id] && s.ph === 'play') { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); sfx('ui.weaponReady'); setTimeout(() => b.classList.remove('pulse'), 1500); }
      this.wasReady[id] = ready;
      b.style.setProperty('--cd', String(pr.cd[i])); b.style.setProperty('--ch', Math.min(1, pr.am[i] / pr.nd[i]).toFixed(3));
      const t = `${pr.am[i]} / ${pr.nd[i]}`; const am = b.querySelector('.ammo')!; if (am.textContent !== t) am.textContent = t;
    });
    this.btn.rake.style.setProperty('--cd', String(pr.rk));
  }
}

/** swap phase: drag a greyed-out weapon (mouse or touch) onto an active one */
export class SwapDrag {
  onSwap: (inW: SkillId, outW: SkillId) => void = () => {};
  private d: { id: number; w: SkillId; src: HTMLElement; g: HTMLElement; ox: number; oy: number; size: number; tgt: HTMLElement | null } | null = null;
  constructor() {
    $('#btns').addEventListener('pointerdown', e => {
      if (this.d || !$('#hud').classList.contains('swapping')) return;
      const b = (e.target as HTMLElement).closest('.skill.off') as HTMLElement | null; if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const r = b.getBoundingClientRect(), g = document.createElement('div');
      g.className = 'skill swapGhost'; g.dataset.skill = b.dataset.skill; g.innerHTML = `<div class="face">${skillIcon(b.dataset.skill!)}</div>`;
      g.style.width = g.style.height = r.width + 'px';
      document.body.appendChild(g);
      this.d = { id: e.pointerId, w: b.dataset.skill as SkillId, src: b, g, ox: r.left + r.width / 2, oy: r.top + r.height / 2, size: r.width, tgt: null };
      this.place(e.clientX, e.clientY); b.classList.add('lifted'); sfx('ui.hover');
    });
    addEventListener('pointermove', e => { if (this.d && e.pointerId === this.d.id) { e.preventDefault(); this.place(e.clientX, e.clientY); } }, { passive: false });
    const end = (e: PointerEvent) => { if (this.d && e.pointerId === this.d.id) this.drop(); };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
  }
  private place(x: number, y: number) {
    const d = this.d!; d.g.style.transform = `translate(${x - d.size / 2}px,${y - d.size / 2}px) scale(1.1)`;
    let best: HTMLElement | null = null, bd = 1e9;
    document.querySelectorAll<HTMLElement>('#btns .skill:not(.off):not([hidden]):not([data-skill=rake])').forEach(el => {
      const r = el.getBoundingClientRect(), dist = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (dist < r.width * .5 + 34 && dist < bd) { bd = dist; best = el; }
    });
    if (best !== d.tgt) { d.tgt?.classList.remove('target'); d.tgt = best; (best as HTMLElement | null)?.classList.add('target'); }
  }
  private drop() {
    const d = this.d!; this.d = null; d.tgt?.classList.remove('target');
    const fly = (x: number, y: number, done: () => void) => {
      d.g.classList.add('flying'); d.g.style.transform = `translate(${x - d.size / 2}px,${y - d.size / 2}px) scale(1)`;
      setTimeout(() => { d.g.remove(); done(); }, 220);
    };
    if (d.tgt) {
      const r = d.tgt.getBoundingClientRect(), out = d.tgt.dataset.skill as SkillId;
      sfx('ui.weaponSwap'); d.g.classList.add('landing');
      fly(r.left + r.width / 2, r.top + r.height / 2, () => d.src.classList.remove('lifted'));
      this.onSwap(d.w, out);
    } else fly(d.ox, d.oy, () => d.src.classList.remove('lifted'));
  }
  cancel() { if (!this.d) return; this.d.g.remove(); this.d.src.classList.remove('lifted'); this.d.tgt?.classList.remove('target'); this.d = null; }
}

export function cardEl(o: Offer) {
  const b = document.createElement('button'); b.className = `card ${o.cat}-c${o.wp ? ' wpn' : ''}`; b.dataset.key = o.key;
  if (o.wp) {
    b.dataset.skill = o.wp;
    b.innerHTML = `<div class="pic">${pic(o.pic)}</div><h3>${o.title}</h3><div class="stats">${o.lines.map(l => `<span>${iconText(l)}</span>`).join('')}</div>${o.fx ? `<div class="fx">${o.fx}</div>` : ''}<i class="shine"></i>`;
  } else {
    b.innerHTML = `<div class="pic">${pic(o.pic)}</div><h3>${o.title}</h3>${o.lines.slice(0, 2).map(l => `<div class="ln">${iconText(l)}</div>`).join('')}${o.hint ? `<div class="hint">${o.hint}</div>` : ''}<i class="shine"></i>`;
  }
  tilt(b);
  return b;
}

/** card tilts toward the pressed point like a real card and shimmers (mouse hover, touch drag).
 *  Only writes 4 CSS variables per frame; transform + opacity stay on the compositor. */
const noMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
function tilt(el: HTMLElement) {
  if (noMotion) return;
  let raf = 0, x = 0.5, y = 0.5;
  const apply = () => {
    raf = 0;
    el.style.setProperty('--ry', `${((x - 0.5) * 22).toFixed(2)}deg`); // pressed side goes into the screen
    el.style.setProperty('--rx', `${((0.5 - y) * 22).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  };
  const move = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    el.classList.add('tilt');
    if (!raf) raf = requestAnimationFrame(apply);
  };
  const leave = () => { if (raf) cancelAnimationFrame(raf); raf = 0; el.classList.remove('tilt'); };
  el.addEventListener('pointerenter', move);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerdown', move);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointercancel', leave);
  el.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') leave(); });
}
