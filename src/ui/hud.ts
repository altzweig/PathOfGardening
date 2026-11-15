import { FRUITS, SKILLS, WEAPONS, Weapon } from '../config';
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
    // weapons
    const active = WEAPONS[pr.ac];
    for (const w of WEAPONS) this.btn[w].classList.toggle('active', w === active);
    SKILLS.forEach((id, i) => {
      const b = this.btn[id]; const learned = !!pr.ln[i]; b.hidden = !learned; if (!learned) return;
      const ready = pr.am[i] >= pr.nd[i], usable = pr.am[i] >= pr.co[i] && (ready || active === id);
      b.classList.toggle('grey', !usable); b.classList.toggle('ready', ready);
      if (ready && !this.wasReady[id]) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); sfx('ui.weaponReady'); setTimeout(() => b.classList.remove('pulse'), 1500); }
      this.wasReady[id] = ready;
      b.style.setProperty('--cd', String(pr.cd[i])); b.style.setProperty('--ch', Math.min(1, pr.am[i] / pr.nd[i]).toFixed(3));
      const t = `${pr.am[i]} / ${pr.nd[i]}`; const am = b.querySelector('.ammo')!; if (am.textContent !== t) am.textContent = t;
    });
    this.btn.rake.style.setProperty('--cd', String(pr.rk));
  }
}

export function cardEl(o: Offer) {
  const b = document.createElement('button'); b.className = `card ${o.cat}-c`; b.dataset.key = o.key;
  b.innerHTML = `<div class="pic">${pic(o.pic)}</div><h3>${o.title}</h3>${o.lines.slice(0, 2).map(l => `<div class="ln">${iconText(l)}</div>`).join('')}`;
  return b;
}
