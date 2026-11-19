// HUD of a farm day: life, level + XP, sun clock with the day, Taler, water in the can, weapon + ammo,
// tool icon at the cursor (what a click does), touch buttons, floating numbers, tutorial hint box.
import type { FarmCfg } from '../config';
import { nextLevelXp } from '../config';
import type { FarmState } from '../state';
import type { ActionInfo, DaySim, Target } from '../sim';
import type { FarmView } from '../view/farmView';
import { ic } from './ficons';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const TOOL_ICON: Record<string, string> = { can: 'can', rake: 'rake', seed: 'seed', hands: 'hands', sickle: 'sickle' };

export class FarmHud {
  private key = '';
  private nums: { el: HTMLElement; x: number; y: number; z: number; t: number }[] = [];
  constructor(public cfg: FarmCfg) {
    $('#fHpIc').innerHTML = ic('heart'); $('#fCoinIc').innerHTML = ic('coin'); $('#fPause').innerHTML = '<svg viewBox="0 0 40 40"><rect x="11" y="9" width="6" height="22" rx="2" fill="currentColor"/><rect x="23" y="9" width="6" height="22" rx="2" fill="currentColor"/></svg>';
  }
  show(on: boolean) { $('#fHud').hidden = !on; }
  /** per frame */
  update(sim: DaySim, s: FarmState, view: FarmView, hover: Target | null, hoverInfo: ActionInfo | null, touch: boolean, mouse: { x: number; y: number }) {
    const P = sim.player;
    ($('#fHpFill')).style.width = (P.hp / P.maxHp * 100).toFixed(1) + '%';
    const nx = nextLevelXp(this.cfg, s.level), px = this.cfg.levels.xp[s.level - 1] ?? 0;
    $('#fXpFill').style.width = (nx ? Math.min(1, (s.xp - px) / (nx - px)) * 100 : 100).toFixed(1) + '%';
    // sun on its arc over the day
    const k = sim.k, a = Math.PI * (1 - k), sx = 50 + Math.cos(a) * 38, sy = 44 - Math.sin(a) * 34;
    const sun = $('#fSun'); sun.setAttribute('cx', sx.toFixed(1)); sun.setAttribute('cy', sy.toFixed(1));
    sun.setAttribute('fill', k > .85 ? '#ff9a40' : '#ffd040');
    const key = [s.level, s.day, s.money, s.water, s.weapon, s.ammo, s.ammoCount, touch].join('|');
    if (key !== this.key) {
      this.key = key;
      $('#fLvlN').textContent = '' + s.level;
      $('#fDay').textContent = '' + s.day;
      $('#fMoney').textContent = '' + s.money;
      let w = ''; for (let i = 0; i < this.cfg.can.capacity; i++) w += `<i class="${i < s.water ? '' : 'e'}">${ic(i < s.water ? 'drop' : 'dropEmpty')}</i>`;
      $('#fWater').innerHTML = w;
      const gun = sim.canShoot() || (s.weapon && s.weapon !== 'rake' && s.ammo);
      $('#fWeap').innerHTML = gun ? `${ic(s.weapon!)}<span>${ic(s.ammo!)}<b>${s.ammoCount}</b></span>` : ic('rake');
      $('#bAtk').innerHTML = gun && s.ammoCount > 0 ? ic(s.weapon!) : ic('rake');
    }
    // tool at the cursor (PC) / on the action button (touch)
    const tool = hoverInfo ? TOOL_ICON[hoverInfo.tool] : null;
    const cur = $('#fCursor');
    if (!touch && hover && tool && !sim.inputLocked && !P.action) {
      cur.hidden = false; cur.style.transform = `translate(${mouse.x + 16}px,${mouse.y + 10}px)`;
      cur.classList.toggle('no', !hoverInfo!.ok);
      if (cur.dataset.t !== tool + hoverInfo!.ok) { cur.dataset.t = tool + hoverInfo!.ok; cur.innerHTML = ic(tool) + (hoverInfo!.ok ? '' : `<em>${ic(hoverInfo!.why === 'water' ? 'dropEmpty' : hoverInfo!.why === 'seed' ? 'seed' : 'lock')}</em>`); }
    } else cur.hidden = true;
    const act = $('#bAct'), t2 = touch && hoverInfo ? TOOL_ICON[hoverInfo.tool] : 'hands';
    if (act.dataset.t !== t2 + (hoverInfo?.ok ?? '')) { act.dataset.t = t2 + (hoverInfo?.ok ?? ''); act.innerHTML = ic(t2); }
    act.classList.toggle('idle', !hoverInfo || !hoverInfo.ok);
    // floating numbers follow their world point
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += 1 / 60;
      const p = view.screen(n.x, n.y + n.t * 1.2, n.z);
      n.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; n.el.style.opacity = '' + Math.max(0, 1 - Math.max(0, n.t - .6) / .6);
      if (n.t > 1.2) { n.el.remove(); this.nums.splice(i, 1); }
    }
  }
  float(x: number, z: number, html: string, cls = '') {
    const el = document.createElement('b'); el.className = cls; el.innerHTML = html; $('#fFloat').appendChild(el);
    this.nums.push({ el, x, y: 1.6, z, t: 0 });
  }
  hint(text: string | null, icon?: string) {
    const h = $('#fHint'); h.hidden = !text; if (text) h.innerHTML = (icon ? ic(icon) : '') + `<span>${text}</span>`;
  }
  /** pause card that explains fighting (tutorial): PC shows the right mouse button, touch the attack button */
  fightCard(on: boolean, text = '', touch = false) {
    const c = $('#fFight'); c.hidden = !on; if (!on) return;
    const mouse = `<svg viewBox="0 0 60 90"><rect x="4" y="4" width="52" height="82" rx="26" fill="#1a2027" stroke="#e3b964" stroke-width="3"/><path d="M30 4v34M4 38h52" stroke="#3a4550" stroke-width="3"/><path d="M33 7.5a23 23 0 0 1 19.5 22V36H33z" fill="#e3b964"/></svg>`;
    c.innerHTML = `<div class="fk">${touch ? `<div class="tb">${ic('rake')}</div>` : mouse}</div><div class="ft">${text}</div>`;
  }
  fade(on: boolean, slow = false) { const f = $('#fFade'); f.style.transitionDuration = slow ? '1.4s' : '.5s'; f.classList.toggle('on', on); }
  letterbox(on: boolean) { $('#fBars').classList.toggle('on', on); }
  clear() { for (const n of this.nums) n.el.remove(); this.nums.length = 0; this.hint(null); this.fightCard(false); this.letterbox(false); }
}
