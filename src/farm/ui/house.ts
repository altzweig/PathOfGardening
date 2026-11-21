// Evening in the house (Lager, Aufträge, Bauen, Produktion, day summary, level-up). 21.11.2026: the morning weapon
// choice is gone, the day starts right after sleeping. Pure DOM over the dusk view of the farm. No explaining texts: icons, numbers, names.
import type { BuildingId, FarmCfg } from '../config';
import { BUILDING_IDS, STALL_IDS, cropXp } from '../config';
import type { FarmState, Quest } from '../state';
import { build, buildStatus, claimQuests, placeField, count, unclaimed } from '../state';
import { ic } from './ficons';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
type Tab = 'quests' | 'build' | 'prod' | 'store';
const TABS: [Tab, string, string][] = [['quests', 'quest', 'Aufträge'], ['build', 'hammer', 'Bauen'], ['prod', 'gear', 'Produktion'], ['store', 'box', 'Lager']];

export class HouseUi {
  tab: Tab = 'quests';
  onSleep: () => void = () => {};
  onChange: () => void = () => {};
  onSound: (k: string) => void = () => {};
  constructor(public cfg: FarmCfg, public s: FarmState) {
    $('#fHouse').addEventListener('click', e => this.click(e));
  }
  private name(id: string) { if (id === 'coin') return 'Gefallen'; return this.cfg.names.items[id] ?? (this.cfg.names.buildings as any)[id] ?? (this.cfg.names.weapons as any)[id] ?? id; }
  private goods(g: Record<string, number | undefined>, have = false) {
    return Object.entries(g).filter(([, v]) => v).map(([k, v]) => {
      const ok = !have || (k === 'money' ? this.s.money >= v! : count(this.s, k) >= v!);
      return `<span class="gd${ok ? '' : ' miss'}" title="${this.name(k === 'money' ? 'coin' : k)}">${ic(k === 'money' ? 'coin' : k)}<b>${have && k !== 'money' ? count(this.s, k) + '/' : ''}${v}</b></span>`;
    }).join('');
  }

  // ---------------- evening ----------------
  showEvening(on: boolean) { $('#fHouse').hidden = !on; if (on) this.render(); }
  render() {
    const s = this.s, C = this.cfg;
    $('#hDay').textContent = '' + s.day;
    $('#hMoney').innerHTML = `${ic('coin')}<b>${s.money}</b>`;
    $('#hLvl').innerHTML = `${ic('star')}<b>${s.level}</b>`;
    // delivered orders: one big tile each, the reward is collected here (Basti 21.11.2026)
    const R = unclaimed(s), rw = $('#hRewards');
    rw.hidden = !R.length;
    for (const sel of ['#hTop', '#hTabs', '#hBody', '#fHouse footer']) ($(sel) as HTMLElement).style.display = R.length ? 'none' : '';
    if (R.length) {
      rw.innerHTML = `<div class="tiles">${R.map((q, i) => `<div class="tile" style="animation-delay:${i * .15}s">${ic('check')}<b>${q.title ?? ''}</b>
        <div class="need">${Object.entries(q.need).map(([k, v]) => `<span class="gd">${ic(k)}<b>${v}</b></span>`).join('')}</div>
        <div class="rew"><span class="gd xp">${ic('xp')}<b>+${q.reward.xp}</b></span><span class="gd">${ic('coin')}<b>+${q.reward.money}</b></span></div></div>`).join('')}</div>
        <button class="hb big go" data-claim="1">${ic("coin")}<span>Abholen</span></button>`;
      return;
    }
    // new field from a level-up (Basti 21.11.2026): pick its crop, it is placed on the farm by itself
    const F = s.fieldPicks[0];
    rw.hidden = !F;
    for (const sel of ['#hTop', '#hTabs', '#hBody', '#fHouse footer']) ($(sel) as HTMLElement).style.display = F ? 'none' : '';
    if (F) {
      rw.innerHTML = `<div class="fpick">${ic('plot')}<b>${C.names.buildings.plot}</b></div><div class="tiles">${F.map((k, i) => `<button class="tile pick" style="animation-delay:${i * .12}s" data-field="${k}">${ic(k)}<b>${this.name(k)}</b>
        <div class="rew"><span class="gd">${ic('sun')}<b>${C.crops[k]?.grow ?? ''} s</b></span><span class="gd xp">${ic('xp')}<b>${cropXp(C, k) * (C.crops[k]?.cuts ?? 3)}</b></span></div></button>`).join('')}</div>`;
      return;
    }
    // summary + level-up banner
    let top = '';
    const S = s.summary;
    if (S) {
      const got = Object.entries(S.got).filter(([, v]) => v > 0), lost = Object.entries(S.lost).filter(([, v]) => v > 0);
      top += `<div class="sum${S.fainted ? ' faint' : ''}">${S.fainted ? `<span class="gd miss">${ic('heart')}<b>0</b></span>` : ''}
        ${got.map(([k, v]) => `<span class="gd">${ic(k)}<b>+${v}</b></span>`).join('')}
        ${lost.map(([k, v]) => `<span class="gd miss">${ic(k)}<b>−${v}</b></span>`).join('')}
        ${S.driven ? `<span class="gd">${ic('raccoon')}<b>×${S.driven}</b></span>` : ''}
        ${S.xp ? `<span class="gd xp">${ic('xp')}<b>+${S.xp}</b></span>` : ''}</div>`;
    }
    for (const L of s.levelUps) {
      const un = C.levels.unlocks[L] ?? [];
      top += `<div class="lvlup">${ic('star')}<b>${L}</b><span>${un.map(id => ic(id)).join('')}${ic('plot')}<i>+1</i></span></div>`;
    }
    $('#hTop').innerHTML = top;
    $('#hTabs').innerHTML = TABS.map(([t, i, n]) => `<button class="htab${t === this.tab ? ' on' : ''}" data-tab="${t}">${ic(i)}<span>${n}</span>${this.badge(t)}</button>`).join('');
    $('#hBody').innerHTML = this.tab === 'quests' ? this.quests() : this.tab === 'build' ? this.buildList() : this.tab === 'prod' ? this.prodList() : this.store();
    $('#hSleep').innerHTML = `${ic('sleep')}<span>Schlafen</span>`;
  }
  private badge(t: Tab) {
    const s = this.s; let n = 0;
    if (t === 'build') n = BUILDING_IDS.filter(id => buildStatus(this.cfg, s, id) === 'ok').length;
    return n ? `<em>${n}</em>` : '';
  }
  /** today's orders (21.11.2026): delivered ones with a green tick, the rest expired; tomorrow brings new ones */
  private quest(q: Quest) {
    return `<div class="row q${q.done ? ' ready' : ' gone'}">${ic(q.done ? 'check' : 'lock')}
      <div class="qt"><b>${q.title ?? ''}</b><div class="need">${this.goods(q.need)}</div></div>
      <div class="rew">${this.goods({ money: q.reward.money })}<span class="gd xp">${ic('xp')}<b>${q.reward.xp}</b></span></div>
    </div>`;
  }
  private quests() {
    const list = this.s.quests.active;
    return `<h4>${ic('quest')}<span>${list.filter(q => q.done).length}/${list.length}</span></h4>${list.map(q => this.quest(q)).join('')}`;
  }
  private buildList() {
    const s = this.s, C = this.cfg;
    const rows = BUILDING_IDS.map(id => {
      const st = buildStatus(C, s, id), B = C.buildings[id];
      if (st === 'built') return `<div class="row b done">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div>${ic('check')}</div>`;
      if (st === 'level') return `<div class="row b lock">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><span class="lv">${ic('star')}<b>${B.level}</b></span></div>`;
      const needs = st === 'needs' ? `<span class="gd miss">${ic(B.needs!)}</span>` : '';
      return `<div class="row b">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><div class="cost">${needs}${this.goods(B.cost ?? {}, true)}</div>
        <button class="hb" data-build="${id}" ${st === 'ok' ? '' : 'disabled'}>${B.broken ? 'Reparieren' : 'Bauen'}</button></div>`;
    });
    return rows.join('');
  }
  /** what the buildings make during the day (overview only: production runs at the building by left click) */
  private prodList() {
    const s = this.s, C = this.cfg;
    const rows: string[] = [];
    for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) {
      const B = C.buildings[id], built = id === 'house' || s.buildings[id].built;
      if (B.recipes?.length && B.action) rows.push(...B.recipes.map(r => `<div class="row p${built ? '' : ' lock'}">${ic(id)}<div class="bn"><b>${B.action!.label}</b><small>${this.name(id)}</small></div>
        <div class="cost">${this.goods(r.in, built)}${ic('arrowR')}${this.goods(r.out)}</div>${built ? '' : ic('lock')}</div>`));
      if ((STALL_IDS as string[]).includes(id)) {
        const S = C.stalls[id as keyof typeof C.stalls] as any;
        rows.push(`<div class="row p${built ? '' : ' lock'}">${ic(id)}<div class="bn"><b>${C.actions[S.collect as 'milk'].label}</b><small>${this.name(id)}</small></div>
          <div class="cost">${this.goods({ [S.feed]: S.feedCost * S.maxFed }, built)}${ic('arrowR')}${this.goods(Object.fromEntries(Object.entries(S.yield as Record<string, number>).map(([k, v]) => [k, v * S.animals.length])))}</div>${built ? '' : ic('lock')}</div>`);
      }
    }
    return rows.join('');
  }
  private store() {
    const items = Object.entries(this.s.items).filter(([, v]) => v > 0);
    return `<div class="grid">${items.map(([k, v]) => `<div class="it">${ic(k)}<b>${v}</b><small>${this.name(k)}</small></div>`).join('') || ic('box')}</div>`;
  }
  private click(e: Event) {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!t || t.disabled) return;
    const s = this.s, C = this.cfg, d = t.dataset;
    if (t.id === 'hSleep') { this.onSound('ui.confirm'); this.onSleep(); return; }
    if (d.claim) { claimQuests(C, s); this.onSound('ui.levelup'); }
    else if (d.tab) { this.tab = d.tab as Tab; this.onSound('ui.click'); }
    else if (d.build) { if (build(C, s, d.build as BuildingId)) this.onSound('ui.levelup'); }
    else if (d.field) { if (placeField(C, s, 0, d.field)) this.onSound('ui.levelup'); }
    this.onChange(); this.render();
  }
}
