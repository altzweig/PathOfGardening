// HUD of a farm day: life, level + XP, sun clock with the day, Taler, water in the can, weapon + ammo,
// tool icon at the cursor (what a click does), touch buttons, floating numbers, tutorial hint box.
import type { FarmCfg } from '../config';
import { cropsFor, nextLevelXp } from '../config';
import type { FarmState, Quest } from '../state';
import { questProgress } from '../state';
import type { ActionInfo, DaySim, Target } from '../sim';
import type { FarmView } from '../view/farmView';
import { ic } from './ficons';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const TOOL_ICON: Record<string, string> = { can: 'can', rake: 'rake', seed: 'seed', hands: 'hands', sickle: 'sickle', bucket: 'bucket' };
/** left mouse button (PC label) */
const LMB = `<svg class="ms" viewBox="0 0 30 42"><rect x="2" y="2" width="26" height="38" rx="13" fill="#1a2027" stroke="#fff2c0" stroke-width="2.4"/><path d="M15 2v17M2 19h26" stroke="#5a6570" stroke-width="2"/><path d="M15 3.5a12 12 0 0 0-11.5 12V19H15z" fill="#e3b964"/></svg>`;
/** height of the label over a target (m) */
const LABEL_Y: Record<string, number> = { bld: 2.4, stall: 1.9, well: 2.8, tree: 3.4, plot: 1.7, bush: 1.9, bramble: 1.5, forage: .9, weed: .9 };

export class FarmHud {
  private key = '';
  private s: FarmState | null = null;
  /** quest list open (Q / tap on the box) */
  questsOpen = true; private qKey = '';
  private nums: { el: HTMLElement; x: number; y: number; z: number; t: number }[] = [];
  constructor(public cfg: FarmCfg) {
    // seed choice (20.11.2026): what the next sowing plants; new crops come with the levels
    $('#fSeed').addEventListener('pointerdown', e => { e.stopPropagation(); this.seedPanel($('#fSeeds').hidden); });
    $('#fSeeds').addEventListener('pointerdown', e => {
      e.stopPropagation(); const b = (e.target as HTMLElement).closest('button'); if (!b || !this.s) return;
      this.s.seed = b.dataset.c!; this.key = ''; this.seedPanel(false);
    });
    $('#fQuests').addEventListener('pointerdown', e => { e.stopPropagation(); this.toggleQuests(); });
    $('#fHpIc').innerHTML = ic('heart'); $('#fCoinIc').innerHTML = ic('coin'); $('#fPause').innerHTML = '<svg viewBox="0 0 40 40"><rect x="11" y="9" width="6" height="22" rx="2" fill="currentColor"/><rect x="23" y="9" width="6" height="22" rx="2" fill="currentColor"/></svg>';
  }
  toggleQuests() { this.questsOpen = !this.questsOpen; this.qKey = ''; }
  /** daily orders at the top right: title + reward, objectives "- 0/5 [icon] Name", green tick when done; collapsed only "Quests [Q]" */
  private quests(s: FarmState, touch: boolean) {
    const P = questProgress(s), list = s.tutorialDone ? s.quests.active : [];
    const key = [this.questsOpen, touch, list.map(q => q.done + ':' + Object.values(P.get(q) ?? {}).join(',')).join('|')].join('/');
    if (key === this.qKey) return; this.qKey = key;
    const head = `<div class="qh">Quests${touch ? '' : ' <kbd>[Q]</kbd>'}</div>`;
    const name = (k: string) => this.cfg.names.items[k] ?? k;
    const one = (q: Quest) => { const p = P.get(q) ?? {};
      return `<div class="qq${q.done ? ' done' : ''}"><div class="qt">${q.done ? ic('check') : ''}<b>${q.title ?? ''}</b><span class="qr"><span>${ic('xp')}${q.reward.xp}</span><span>${ic('coin')}${q.reward.money}</span></span></div>
        ${Object.entries(q.need).map(([k, v]) => `<div class="qo${(p[k] ?? 0) >= v ? ' ok' : ''}">- <i>${p[k] ?? 0}/${v}</i>${ic(k)}${name(k)}</div>`).join('')}</div>`; };
    $('#fQuests').innerHTML = list.length ? head + (this.questsOpen ? list.map(one).join('') : '') : '';
  }
  show(on: boolean) { $('#fHud').hidden = !on; if (!on) this.seedPanel(false); }
  private seedPanel(on: boolean) {
    const p = $('#fSeeds'); p.hidden = !on || !this.s; if (p.hidden) return;
    const s = this.s!; p.innerHTML = cropsFor(this.cfg, s.level).map(c => `<button data-c="${c}" class="${c === s.seed ? 'on' : ''}">${ic(c)}</button>`).join('');
  }
  /** per frame */
  update(sim: DaySim, s: FarmState, view: FarmView, hover: Target | null, hoverInfo: ActionInfo | null, touch: boolean, mouse: { x: number; y: number }) {
    const P = sim.player; this.s = s;
    ($('#fHpFill')).style.width = (P.hp / P.maxHp * 100).toFixed(1) + '%';
    const nx = nextLevelXp(this.cfg, s.level), px = this.cfg.levels.xp[s.level - 1] ?? 0;
    $('#fXpFill').style.width = (nx ? Math.min(1, (s.xp - px) / (nx - px)) * 100 : 100).toFixed(1) + '%';
    // sun on its arc over the day
    const k = sim.k, a = Math.PI * (1 - k), sx = 50 + Math.cos(a) * 38, sy = 44 - Math.sin(a) * 34;
    const sun = $('#fSun'); sun.setAttribute('cx', sx.toFixed(1)); sun.setAttribute('cy', sy.toFixed(1));
    sun.setAttribute('fill', k > .85 ? '#ff9a40' : '#ffd040');
    const key = [s.level, s.day, s.money, s.water, s.weapon, s.ammo, s.ammoCount, touch, s.seed].join('|');
    if (key !== this.key) {
      this.key = key;
      $('#fLvlN').textContent = '' + s.level;
      $('#fDay').textContent = '' + s.day;
      const nSeeds = cropsFor(this.cfg, s.level).length;
      $('#fSeed').hidden = nSeeds < 2; $('#fSeed').innerHTML = ic(sim.seedCrop()) + `<em>${ic('seed')}</em>`;
      $('#fMoney').textContent = '' + s.money;
      let w = ''; for (let i = 0; i < this.cfg.can.capacity; i++) w += `<i class="${i < s.water ? '' : 'e'}">${ic(i < s.water ? 'drop' : 'dropEmpty')}</i>`;
      $('#fWater').innerHTML = w;
      const gun = sim.canShoot() || (s.weapon && s.weapon !== 'rake' && s.ammo);
      $('#fWeap').innerHTML = gun ? `${ic(s.weapon!)}<span>${ic(s.ammo!)}<b>${s.ammoCount}</b></span>` : ic('rake');
      $('#bAtk').innerHTML = gun && s.ammoCount > 0 ? ic(s.weapon!) : ic('rake');
    }
    this.quests(s, touch);
    // tool at the cursor (PC) / on the action button (touch)
    const tool = hoverInfo ? TOOL_ICON[hoverInfo.tool] : null;
    const cur = $('#fCursor');
    if (!touch && hover && tool && !sim.inputLocked && !P.action) {
      cur.hidden = false; cur.style.transform = `translate(${mouse.x + 16}px,${mouse.y + 10}px)`;
      cur.classList.toggle('no', !hoverInfo!.ok);
      if (cur.dataset.t !== tool + hoverInfo!.ok) { cur.dataset.t = tool + hoverInfo!.ok; cur.innerHTML = ic(tool) + (hoverInfo!.ok ? '' : `<em>${ic(hoverInfo!.why === 'water' ? 'dropEmpty' : hoverInfo!.why === 'seed' ? 'seed' : 'lock')}</em>`); }
    } else cur.hidden = true;
    // "[Aktion]" over the spot the player would work at (hidden while an action runs: the bar shows then)
    const lab = $('#fLabel');
    if (hover && hoverInfo && !sim.inputLocked && !P.action && !P.goal) {
      // buildings: over the wall next to the player, not over the middle of the roof
      const tp = hover.k === 'bld' || hover.k === 'stall' ? sim.facePoint(hover) : sim.targetPos(hover), p = view.screen(tp.x, LABEL_Y[hover.k] ?? 1.5, tp.z);
      lab.hidden = !p.on;
      const x = Math.max(110, Math.min(innerWidth - 110, p.x)), y = Math.max(110, Math.min(innerHeight - 20, p.y));
      lab.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
      const need = !hoverInfo.ok && hoverInfo.need ? Object.entries(hoverInfo.need).map(([k, n]) => `<span class="need">${ic(k)}${n}</span>`).join('') : '';
      const why = !hoverInfo.ok && !need ? ic(hoverInfo.why === 'water' ? 'dropEmpty' : hoverInfo.why === 'seed' ? 'seed' : hoverInfo.why === 'weeds' ? 'green' : 'lock') : '';
      const html = (touch ? '' : LMB) + `<span>[${hoverInfo.label}]</span>` + (hoverInfo.item ? ic(hoverInfo.item) : '') + (hoverInfo.count ? `<i>${hoverInfo.count}</i>` : '') + need + why;
      if (lab.dataset.h !== html) { lab.dataset.h = html; lab.innerHTML = html; }
      lab.classList.toggle('no', !hoverInfo.ok);
    } else lab.hidden = true;
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
  clear() { $('#fLabel').hidden = true; for (const n of this.nums) n.el.remove(); this.nums.length = 0; this.hint(null); this.fightCard(false); this.letterbox(false); }
}
