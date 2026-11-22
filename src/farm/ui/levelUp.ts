// Level-up screen (Basti 22.11.2026): every level-up shows a screen with the new level and what it unlocks (buildings, one more
// field, order / sale slots, wild orders) and the choice of the new seed. By day it comes at once (the game pauses), at night
// it would disturb the fight: the XP bar lights up and a note under it can be opened any time; otherwise it comes after the night.
import type { FarmCfg } from '../config';
import { BUILDING_IDS, cropXpTotal, slotsAt } from '../config';
import type { FarmState } from '../state';
import { takeSeed } from '../state';
import { ic } from './ficons';
import './levelUp.css';

/** what a level brings: icon + name (+ amount) */
export function levelUnlocks(cfg: FarmCfg, L: number): { icon: string; name: string; n?: number }[] {
  const out: { icon: string; name: string; n?: number }[] = [];
  const B = cfg.names.buildings as Record<string, string>;
  for (const id of cfg.levels.unlocks?.[L] ?? []) if ((BUILDING_IDS as string[]).includes(id)) out.push({ icon: id, name: B[id] ?? id });
  out.push({ icon: 'plot', name: B.plot ?? 'Feld', n: 1 });
  const Q = cfg.quests.daily.slots, q = slotsAt(Q, L) - slotsAt(Q, L - 1);
  if (q > 0) out.push({ icon: 'quest', name: 'Auftrag', n: q });
  const S = cfg.shop?.slots, sh = S ? slotsAt(S, L) - slotsAt(S, L - 1) : 0;
  if (sh > 0 && L > (S!.level ?? 1)) out.push({ icon: 'shop', name: 'Verkaufsplatz', n: sh });
  if (cfg.quests.daily.wild && cfg.quests.daily.wild.level === L) out.push({ icon: 'baerlauch', name: 'Wildkräuter-Aufträge' });
  return out;
}

export class LevelUpUi {
  readonly root: HTMLElement;
  onSound: (k: string) => void = () => {};
  /** the screen was closed (seed taken or "Weiter") */
  onDone: () => void = () => {};
  private s: FarmState | null = null;
  private lvl = 0;
  private openT = 0;
  constructor(public cfg: FarmCfg) {
    const r = document.createElement('div'); r.id = 'fLvUp'; r.hidden = true;
    (document.querySelector('#app') ?? document.body).append(r); this.root = r;
    r.addEventListener('click', e => this.click(e));
    addEventListener('keydown', e => {
      if (r.hidden || performance.now() - this.openT < 600) return;
      if ((e.key === 'Enter' || e.key === ' ') && !this.s?.seedPicks.length) { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    }, true);
  }
  get open() { return !this.root.hidden; }
  /** shows the screen of the first level still to show (false: nothing to show) */
  show(s: FarmState) {
    if (!s.lvShow.length && s.seedPicks.length) s.lvShow.push(s.level); // a seed choice is still open
    const L = s.lvShow[0]; if (!L) return false;
    this.s = s; this.lvl = L; this.openT = performance.now();
    const C = this.cfg, pick = s.seedPicks[0], un = levelUnlocks(C, L);
    const name = (k: string) => C.names.items[k] ?? k;
    const rays = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join('');
    const sparks = Array.from({ length: 18 }, (_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--y:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 2.4).toFixed(2)}s;--s:${(.6 + Math.random() * .8).toFixed(2)}"></i>`).join('');
    this.root.innerHTML = `<div class="luWrap"><div class="luStar"><div class="luRays">${rays}</div>${ic('star')}<b>${L}</b></div><div class="luBox">
      <div class="luSparks">${sparks}</div>
      <h2 class="luT">Level ${L}</h2>
      <div class="luUn">${un.map((u, i) => `<div class="luU" style="--i:${i}">${ic(u.icon)}<b>${u.name}</b>${u.n ? `<em>+${u.n}</em>` : ''}</div>`).join('')}</div>
      ${pick?.length ? `<div class="luSeedH">${ic('seed')}<b>Neues Saatgut</b></div>
      <div class="luSeeds">${pick.map((k, i) => `<button class="luSeed" style="--i:${i}" data-seed="${k}">${ic(k)}<b>${name(k)}</b>
        <span class="rew"><span class="gd">${ic('sun')}<b>${C.crops[k]?.grow ?? ''} s</b></span><span class="gd xp">${ic('xp')}<b>${cropXpTotal(C, k)}</b></span></span></button>`).join('')}</div>`
      : `<button class="luGo" data-go="1">${ic('check')}<span>Weiter</span></button>`}
    </div></div>`;
    this.root.hidden = false; this.root.classList.remove('in'); void this.root.offsetWidth; this.root.classList.add('in');
    this.onSound('ui.levelup');
    return true;
  }
  hide() { this.root.hidden = true; this.s = null; }
  private click(e: Event) {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!t || !this.s) return;
    if (performance.now() - this.openT < 450) return; // no click-through from the action that caused the level-up
    if (t.dataset.seed) { if (takeSeed(this.cfg, this.s, 0, t.dataset.seed)) { this.onSound('ui.confirm'); this.close(); } return; }
    if (t.dataset.go) { this.onSound('ui.click'); this.close(); }
  }
  private close() {
    const s = this.s; if (!s) return;
    const i = s.lvShow.indexOf(this.lvl); if (i >= 0) s.lvShow.splice(i, 1);
    this.hide(); this.onDone();
  }
}
