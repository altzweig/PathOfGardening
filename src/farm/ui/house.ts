// Evening in the house (Lager, Aufträge, Bauen, Produktion, day summary, level-up) and the morning loadout
// (exactly one weapon + one ammo type). Pure DOM over the dusk view of the farm. No explaining texts: icons, numbers, names.
import type { BuildingId, FarmCfg, ItemId, WeaponId } from '../config';
import { BUILDING_IDS, WEAPON_IDS, plotsAllowed } from '../config';
import type { FarmState, Quest } from '../state';
import { acceptQuest, build, buildStatus, canOpenPlot, collectProduction, completeQuest, count, openPlot, openPlots, questReady, startProduction } from '../state';
import { ic } from './ficons';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
type Tab = 'quests' | 'build' | 'prod' | 'store';
const TABS: [Tab, string, string][] = [['quests', 'quest', 'Aufträge'], ['build', 'hammer', 'Bauen'], ['prod', 'gear', 'Produktion'], ['store', 'box', 'Lager']];

export class HouseUi {
  tab: Tab = 'quests';
  onSleep: () => void = () => {};
  onStart: (w: WeaponId | null, ammo: ItemId | null, n: number) => void = () => {};
  onChange: () => void = () => {};
  onSound: (k: string) => void = () => {};
  private pick: { w: WeaponId | null; ammo: ItemId | null; n: number } = { w: null, ammo: null, n: 0 };
  constructor(public cfg: FarmCfg, public s: FarmState) {
    $('#fHouse').addEventListener('click', e => this.click(e));
    $('#fMorning').addEventListener('click', e => this.mclick(e));
    $('#fMorning').addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t.id === 'mAmmoN') { this.pick.n = +t.value; $('#mAmmoV').textContent = t.value; } });
  }
  private name(id: string) { if (id === 'coin') return 'Taler'; return this.cfg.names.items[id] ?? (this.cfg.names.buildings as any)[id] ?? (this.cfg.names.weapons as any)[id] ?? id; }
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
      const un = C.levels.unlocks[L] ?? [], plots = plotsAllowed(C, L) - plotsAllowed(C, L - 1);
      top += `<div class="lvlup">${ic('star')}<b>${L}</b><span>${un.map(id => ic(id)).join('')}${plots > 0 ? `${ic('plot')}<i>+${plots}</i>` : ''}</span></div>`;
    }
    $('#hTop').innerHTML = top;
    $('#hTabs').innerHTML = TABS.map(([t, i, n]) => `<button class="htab${t === this.tab ? ' on' : ''}" data-tab="${t}">${ic(i)}<span>${n}</span>${this.badge(t)}</button>`).join('');
    $('#hBody').innerHTML = this.tab === 'quests' ? this.quests() : this.tab === 'build' ? this.buildList() : this.tab === 'prod' ? this.prodList() : this.store();
    $('#hSleep').innerHTML = `${ic('sleep')}<span>Schlafen</span>`;
  }
  private badge(t: Tab) {
    const s = this.s; let n = 0;
    if (t === 'quests') n = s.quests.active.filter(q => questReady(s, q)).length;
    if (t === 'build') n = BUILDING_IDS.filter(id => buildStatus(this.cfg, s, id) === 'ok').length + (canOpenPlot(this.cfg, s) ? 1 : 0);
    if (t === 'prod') n = BUILDING_IDS.filter(id => s.buildings[id].prod && s.buildings[id].prod!.doneDay <= s.day).length;
    return n ? `<em>${n}</em>` : '';
  }
  private quest(q: Quest, offer: boolean) {
    const ready = questReady(this.s, q), full = this.s.quests.active.length >= this.cfg.quests.maxActive;
    return `<div class="row q${ready && !offer ? ' ready' : ''}">
      <div class="need">${this.goods(q.need, !offer)}</div>${ic('arrowR')}
      <div class="rew">${this.goods({ money: q.reward.money })}<span class="gd xp">${ic('xp')}<b>${q.reward.xp}</b></span>${this.goods(q.reward.items ?? {})}</div>
      ${offer ? `<button class="hb" data-accept="${q.id}" ${full ? 'disabled' : ''}>Annehmen</button>` : `<button class="hb go" data-done="${q.id}" ${ready ? '' : 'disabled'}>Abgeben</button>`}
    </div>`;
  }
  private quests() {
    const s = this.s;
    return `<h4>${ic('quest')}<span>${s.quests.active.length}/${this.cfg.quests.maxActive}</span></h4>${s.quests.active.map(q => this.quest(q, false)).join('')}
      ${s.quests.offers.length ? `<h4 class="off">${ic('shop')}</h4>${s.quests.offers.map(q => this.quest(q, true)).join('')}` : ''}`;
  }
  private buildList() {
    const s = this.s, C = this.cfg;
    const plotRow = (() => {
      const open = openPlots(s), max = Math.min(plotsAllowed(C, s.level), s.plots.length), next = C.plots.byLevel.findIndex(n => n > open) + 1;
      const lock = open >= max;
      return `<div class="row b${lock ? ' lock' : ''}">${ic('plot')}<div class="bn"><b>${C.names.buildings.plot}</b><small>${open}/${max}</small></div>
        ${lock ? (next > 0 ? `<span class="lv">${ic('star')}<b>${next}</b></span>` : '') : `<div class="cost">${this.goods({ money: C.plots.cost }, true)}</div><button class="hb" data-plot="1" ${canOpenPlot(C, s) ? '' : 'disabled'}>Anlegen</button>`}</div>`;
    })();
    const rows = BUILDING_IDS.map(id => {
      const st = buildStatus(C, s, id), B = C.buildings[id];
      if (st === 'built') return `<div class="row b done">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div>${ic('check')}</div>`;
      if (st === 'level') return `<div class="row b lock">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><span class="lv">${ic('star')}<b>${B.level}</b></span></div>`;
      const needs = st === 'needs' ? `<span class="gd miss">${ic(B.needs!)}</span>` : '';
      return `<div class="row b">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><div class="cost">${needs}${this.goods(B.cost ?? {}, true)}</div>
        <button class="hb" data-build="${id}" ${st === 'ok' ? '' : 'disabled'}>${B.broken ? 'Reparieren' : 'Bauen'}</button></div>`;
    });
    return plotRow + rows.join('');
  }
  private prodList() {
    const s = this.s, C = this.cfg;
    const list = BUILDING_IDS.filter(id => C.buildings[id].recipes?.length);
    return list.map(id => {
      const b = s.buildings[id], B = C.buildings[id];
      if (!b.built) return `<div class="row p lock">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div>${ic('lock')}</div>`;
      if (b.prod) {
        const r = B.recipes![b.prod.recipe], ready = b.prod.doneDay <= s.day;
        return `<div class="row p">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><div class="cost">${this.goods(r.out)}</div>
          ${ready ? `<button class="hb go" data-collect="${id}">Abholen</button>` : `<span class="gd">${ic('moon')}<b>${b.prod.doneDay - s.day}</b></span>`}</div>`;
      }
      return B.recipes!.map((r, i) => {
        const ok = Object.entries(r.in).every(([k, v]) => count(s, k) >= v);
        return `<div class="row p">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><div class="cost">${this.goods(r.in, true)}${ic('arrowR')}${this.goods(r.out)}<span class="gd">${ic('moon')}<b>${r.days}</b></span></div>
          <button class="hb" data-prod="${id}:${i}" ${ok ? '' : 'disabled'}>Start</button></div>`;
      }).join('');
    }).join('');
  }
  private store() {
    const items = Object.entries(this.s.items).filter(([, v]) => v > 0);
    return `<div class="grid">${items.map(([k, v]) => `<div class="it">${ic(k)}<b>${v}</b><small>${this.name(k)}</small></div>`).join('') || ic('box')}</div>`;
  }
  private click(e: Event) {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!t || t.disabled) return;
    const s = this.s, C = this.cfg, d = t.dataset;
    if (t.id === 'hSleep') { this.onSound('ui.confirm'); this.onSleep(); return; }
    if (d.tab) { this.tab = d.tab as Tab; this.onSound('ui.click'); }
    else if (d.done) { const q = s.quests.active.find(x => x.id === d.done); if (q && completeQuest(C, s, q)) this.onSound('ui.levelup'); }
    else if (d.accept) { const q = s.quests.offers.find(x => x.id === d.accept); if (q && acceptQuest(C, s, q)) this.onSound('ui.confirm'); }
    else if (d.build) { if (build(C, s, d.build as BuildingId)) this.onSound('ui.levelup'); }
    else if (d.plot) { if (openPlot(C, s)) this.onSound('ui.confirm'); }
    else if (d.prod) { const [id, i] = d.prod.split(':'); if (startProduction(C, s, id as BuildingId, +i)) this.onSound('ui.confirm'); }
    else if (d.collect) { if (collectProduction(C, s, d.collect as BuildingId)) this.onSound('ui.confirm'); }
    this.onChange(); this.render();
  }

  // ---------------- morning loadout ----------------
  showMorning(on: boolean) {
    $('#fMorning').hidden = !on; if (!on) return;
    // default: yesterday's weapon if it still has ammo, else the first available
    const s = this.s, avail = WEAPON_IDS.filter(w => this.weaponOk(w));
    const w = s.weapon && avail.includes(s.weapon) ? s.weapon : avail[0] ?? null;
    this.pick = { w, ammo: null, n: 0 }; this.chooseAmmo(); this.renderMorning();
  }
  private weaponOk(w: WeaponId) { const W = this.cfg.weapons[w as Exclude<WeaponId, 'rake'>]; return !!W && W.available && W.level <= this.s.level; }
  private chooseAmmo() {
    const w = this.pick.w; if (!w || w === 'rake') { this.pick.ammo = null; this.pick.n = 0; return; }
    const W = this.cfg.weapons[w as Exclude<WeaponId, 'rake'>], have = W.ammo.filter(a => count(this.s, a) > 0);
    if (!this.pick.ammo || !have.includes(this.pick.ammo)) this.pick.ammo = (this.s.ammo && have.includes(this.s.ammo) ? this.s.ammo : have[0]) ?? null;
    this.pick.n = this.pick.ammo ? count(this.s, this.pick.ammo) : 0;
  }
  private renderMorning() {
    const s = this.s, C = this.cfg, p = this.pick;
    $('#mDay').textContent = '' + s.day;
    const card = (w: WeaponId | null) => {
      if (w === null) return `<button class="wc${p.w === null ? ' on' : ''}" data-w="rake">${ic('rake')}<b>${this.name('rake')}</b></button>`;
      const W = C.weapons[w as Exclude<WeaponId, 'rake'>], ok = this.weaponOk(w);
      return `<button class="wc${p.w === w ? ' on' : ''}${ok ? '' : ' lock'}" data-w="${w}" ${ok ? '' : 'disabled'}>${ic(w)}<b>${this.name(w)}</b>
        <span class="am">${W.ammo.map(a => ic(a)).join('')}</span>${ok ? '' : `<span class="lv">${W.available ? `${ic('star')}<b>${W.level}</b>` : ic('lock')}</span>`}</button>`;
    };
    $('#mWeapons').innerHTML = card(null) + WEAPON_IDS.map(card).join('');
    let am = '';
    if (p.w && p.w !== 'rake') {
      const W = C.weapons[p.w as Exclude<WeaponId, 'rake'>];
      am = `<div class="ammo">${W.ammo.map(a => { const n = count(s, a); return `<button class="ac${p.ammo === a ? ' on' : ''}" data-a="${a}" ${n ? '' : 'disabled'}>${ic(a)}<b>${n}</b></button>`; }).join('')}</div>`;
      if (p.ammo) { const max = count(s, p.ammo); am += `<div class="amt">${ic(p.ammo)}<input type="range" id="mAmmoN" min="0" max="${max}" value="${p.n}"><b id="mAmmoV">${p.n}</b></div>`; }
    }
    $('#mAmmo').innerHTML = am;
    $('#mGo').innerHTML = `${ic('sun')}<span>Tag beginnen</span>`;
  }
  private mclick(e: Event) {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!t || t.disabled) return;
    const d = t.dataset;
    if (t.id === 'mGo') { this.onSound('ui.confirm'); const p = this.pick; this.onStart(p.w, p.w ? p.ammo : null, p.n); return; }
    if (d.w) { this.pick.w = d.w === 'rake' ? null : d.w as WeaponId; this.pick.ammo = null; this.chooseAmmo(); this.onSound('ui.click'); }
    if (d.a) { this.pick.ammo = d.a; this.pick.n = count(this.s, d.a); this.onSound('ui.click'); }
    this.renderMorning();
  }
}
