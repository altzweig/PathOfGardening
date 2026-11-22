import { COMBOS, FRUITS, isBuilding, SKILLS, SkillId, WEAPONS, Weapon } from '../config';
import type { Snap } from '../sim/snap';
import { play, sfx } from '../audio';
import { comboIcon, fruitIcon, iconText, mini, pic, skillIcon } from './icons';
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
  // wave countdown + announcement
  private cd = { sec: -1, ann: -1, wp: -1 };
  updateWave(s: Snap, W: { announce?: number; tickFrom?: number; redFrom?: number }, dayWaves = 0) {
    const el = $('#wcd'), an = $('#wann'), st = this.cd, wt = s.wt ?? -1;
    const annT = W.announce ?? 2.5, next = s.wv + 1;
    // "Welle N" in the middle during the last announce seconds of the pause, then the enemies set off
    const announcing = !document.body.classList.contains('sandbox') && !!s.wp && wt >= 0 && wt <= annT && next <= s.wn && s.ph !== 'over';
    if (announcing && st.ann !== next) {
      st.ann = next; an.textContent = `Welle ${next}`;
      an.classList.toggle('night', s.dc > 0 && (next - 1) % s.dc >= dayWaves); // night waves in moon blue
      play('waveAnn');
    }
    an.hidden = !announcing;
    if (announcing) { // driven by game time (stops with the pause): pops in, holds, fades out
      const u = 1 - wt / annT, op = u < .14 ? u / .14 : u > .75 ? (1 - u) / .25 : 1, sc = u < .14 ? 1.25 - .25 * u / .14 : u > .75 ? 1 - .04 * (u - .75) / .25 : 1;
      an.style.opacity = op.toFixed(3); an.style.transform = `translate(-50%,-50%) scale(${sc.toFixed(3)})`;
    }
    if (!announcing && st.ann > 0 && !s.wp) { st.ann = -1; }
    if (wt < 0 || document.body.classList.contains('sandbox') || s.ph === 'over' || announcing || (!!s.wp && next > s.wn)) { el.hidden = true; st.sec = -1; st.wp = s.wp; return; }
    const sec = Math.ceil(wt - 1e-3), red = !s.wp && sec <= (W.redFrom ?? 3);
    if (st.wp === 0 && s.wp === 1) play('cdEnd'); // fight countdown ran out
    st.wp = s.wp; el.hidden = false;
    if (sec !== st.sec) {
      if (!s.wp && st.sec > sec && sec >= 1 && sec <= (W.tickFrom ?? 10) && s.ph === 'play') { play('cdTick', red); el.classList.remove('beat'); void el.offsetWidth; el.classList.add('beat'); }
      st.sec = sec; el.textContent = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : String(sec);
    }
    el.classList.toggle('pause', !!s.wp); el.classList.toggle('red', red);
  }
  reset() { this.cd = { sec: -1, ann: -1, wp: -1 }; ($('#wann')).hidden = true; this.cache = {}; this.wasReady = {}; this.resKey = ''; }
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
    // ammo chips for fruit weapons with a field, then the goods in the bag (wheat, products) while there are any
    const have: string[] = s.fi.map(f => FRUITS[f[1]] as string).filter(t => t !== 'blue' && t !== 'wheat' && !isBuilding(t as any));
    (pr.iv || []).forEach((n, i) => { if (n > 0) have.push(FRUITS[i]); });
    const key = [...new Set(have)].join(',');
    if (key !== this.resKey) {
      this.resKey = key; $('#res').innerHTML = [...new Set(have)].map(t => `<div class="chip${(SKILLS as string[]).includes(t) ? '' : ' bag'}">${fruitIcon(t)}<span data-r="${t}">0</span></div>`).join('');
      for (const k in this.cache) if (k.startsWith('r_')) delete this.cache[k];
    }
    document.querySelectorAll<HTMLElement>('#res [data-r]').forEach(el => { const i = SKILLS.indexOf(el.dataset.r as any); const v = String(el.dataset.r === 'nut' ? pr.nu ?? 0 : i >= 0 ? pr.am[i] : pr.iv?.[FRUITS.indexOf(el.dataset.r as any)] ?? 0); if (this.cache['r_' + el.dataset.r] !== v) { this.cache['r_' + el.dataset.r] = v; el.textContent = v; } });
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
    // learned weapons fill the positions around the rake in the order they were learned
    const slots = (pr.sl || []).map(i => SKILLS[i]);
    SKILLS.forEach((id, i) => {
      const b = this.btn[id]; const slot = slots.indexOf(id);
      const pos = pr.ln[i] ? slot : -1;
      b.hidden = pos < 0; if (pos < 0) { this.wasReady[id] = false; return; }
      if (b.dataset.pos !== String(pos)) b.dataset.pos = String(pos);
      const cb = pr.cb?.[i] ?? -1, fk = cb >= 0 ? COMBOS[cb] : id; // combo weapon: its own icon on the main weapon's button
      if (b.dataset.face !== fk) { b.dataset.face = fk; b.querySelector('.face')!.innerHTML = cb >= 0 ? comboIcon(fk) : skillIcon(id); b.classList.toggle('combo', cb >= 0); }
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

export function cardEl(o: Offer) {
  const b = document.createElement('button'); b.className = `card ${o.cat}-c${o.wp ? ' wpn' : ''}${o.combo ? ' combo-c' : ''}`; b.dataset.key = o.key;
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
