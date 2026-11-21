// Evening in the house as an open book (Basti 21.11.2026): a blurred cosy room behind (houseBg.ts), on it an old book
// with coloured bookmarks: Lager, Aufträge, Bauen, Produktion. Changing the page turns a leaf. Delivered orders and the
// crop choice of a new field are shown on the open book before anything else. No explaining texts: icons, numbers, names.
import type { BuildingId, FarmCfg, ItemId } from '../config';
import { BUILDING_IDS, STALL_IDS, cropXp } from '../config';
import type { FarmState, Quest } from '../state';
import { build, buildStatus, claimQuests, placeField, count, unclaimed, markSeen } from '../state';
import { ic } from './ficons';
import { HouseBg } from './houseBg';
import { GraphMode, storeLeft, storeRight, storeSections } from './storePage';
import './book.css';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
type Tab = 'store' | 'quests' | 'build' | 'prod';
/** bookmarks: id, icon, name, ribbon colour, page side */
const TABS: [Tab, string, string, string][] = [
  ['store', 'box', 'Lager', '#d9772b'], ['quests', 'quest', 'Aufträge', '#a8403a'],
  ['build', 'hammer', 'Bauen', '#3d6a9e'], ['prod', 'gear', 'Produktion', '#5a7f34'],
];
const FLIP_MS = 620;

export class HouseUi {
  tab: Tab = 'store';
  /** selected good on the storage page + graph mode */
  sel: ItemId = 'wheat';
  gmode: GraphMode = 'stock';
  onSleep: () => void = () => {};
  onChange: () => void = () => {};
  onSound: (k: string) => void = () => {};
  private bg: HouseBg;
  private flipping = 0;
  constructor(public cfg: FarmCfg, public s: FarmState) {
    const root = $('#fHouse');
    root.addEventListener('click', e => this.click(e));
    root.addEventListener('pointermove', e => this.hover(e));
    root.addEventListener('pointerdown', e => this.hover(e));
    this.bg = new HouseBg($('#hBg') as HTMLCanvasElement);
    // torn page edges: a fixed irregular outline per page (outer edges ragged, a few small tears, spine side straight)
    $('#hPL').style.clipPath = torn(1, 'L'); $('#hPR').style.clipPath = torn(2, 'R');
  }
  private name(id: string) { if (id === 'coin') return 'Gefallen'; return this.cfg.names.items[id] ?? (this.cfg.names.buildings as any)[id] ?? (this.cfg.names.weapons as any)[id] ?? id; }
  private goods(g: Record<string, number | undefined>, have = false) {
    return Object.entries(g).filter(([, v]) => v).map(([k, v]) => {
      const ok = !have || (k === 'money' ? this.s.money >= v! : count(this.s, k) >= v!);
      return `<span class="gd${ok ? '' : ' miss'}" title="${this.name(k === 'money' ? 'coin' : k)}">${ic(k === 'money' ? 'coin' : k)}<b>${have && k !== 'money' ? count(this.s, k) + '/' : ''}${v}</b></span>`;
    }).join('');
  }

  // ---------------- evening ----------------
  showEvening(on: boolean) {
    $('#fHouse').hidden = !on;
    if (on) { this.render(); this.bg.start(); } else this.bg.stop();
  }
  render() {
    const s = this.s, C = this.cfg;
    $('#hDay').textContent = '' + s.day;
    $('#hMoney').innerHTML = `${ic('coin')}<b>${s.money}</b>`;
    $('#hLvl').innerHTML = `${ic('star')}<b>${s.level}</b>`;
    $('#hSleep').innerHTML = `${ic('sleep')}<span>Schlafen</span>`;
    const book = $('#hBook'), rw = $('#hRewards');
    // delivered orders: one tile each, the reward is collected here (Basti 21.11.2026)
    const R = unclaimed(s), F = R.length ? null : s.fieldPicks[0];
    book.classList.toggle('modal', !!(R.length || F));
    rw.hidden = !(R.length || F);
    if (R.length) {
      rw.innerHTML = `<div class="tiles">${R.map((q, i) => `<div class="tile" style="animation-delay:${i * .15}s">${ic('check')}<b>${q.title ?? ''}</b>
        <div class="need">${Object.entries(q.need).map(([k, v]) => `<span class="gd">${ic(k)}<b>${v}</b></span>`).join('')}</div>
        <div class="rew"><span class="gd xp">${ic('xp')}<b>+${q.reward.xp}</b></span><span class="gd">${ic('coin')}<b>+${q.reward.money}</b></span></div></div>`).join('')}</div>
        <button class="hb big go" data-claim="1">${ic('coin')}<span>Abholen</span></button>`;
    } else if (F) {
      // new field from a level-up (Basti 21.11.2026): pick its crop, it is placed on the farm by itself
      rw.innerHTML = `<div class="fpick">${ic('plot')}<b>${C.names.buildings.plot}</b></div><div class="tiles">${F.map((k, i) => `<button class="tile pick" style="animation-delay:${i * .12}s" data-field="${k}">${ic(k)}<b>${this.name(k)}</b>
        <div class="rew"><span class="gd">${ic('sun')}<b>${C.crops[k]?.grow ?? ''} s</b></span><span class="gd xp">${ic('xp')}<b>${cfgXp(C, k)}</b></span></div></button>`).join('')}</div>`;
    }
    $('#hTabs').innerHTML = TABS.map(([t, i, n, col], k) => `<button class="bm${t === this.tab ? ' on' : ''}${k >= 2 ? ' right' : ''}" style="--c:${col};--x:${[3, 20.5, 53, 70.5][k]}%" data-tab="${t}">${ic(i)}<span>${n}</span>${this.badge(t)}</button>`).join('');
    const [l, r] = this.pages();
    $('#hBody').innerHTML = l; $('#hBodyR').innerHTML = r;
    book.dataset.tab = this.tab;
  }
  /** html of the left and right page of the open tab */
  private pages(tab = this.tab): [string, string] {
    if (tab === 'store') {
      const seen = markSeen(this.s);
      if (!storeSections(this.cfg).some(S => S.goods.some(g => g.id === this.sel))) this.sel = storeSections(this.cfg)[0]?.goods[0]?.id ?? 'wheat';
      return [storeLeft(this.cfg, this.s, seen, this.sel), storeRight(this.cfg, this.s, seen, this.sel, this.gmode)];
    }
    if (tab === 'quests') return [this.quests(), this.daySummary()];
    const rows = tab === 'build' ? this.buildList() : this.prodList(), head = `<h2>${ic(tab === 'build' ? 'hammer' : 'gear')}</h2>`;
    // a short list stays on the left page; the right page of "Bauen" shows what the next levels unlock
    const half = rows.length > 7 ? Math.ceil(rows.length / 2) : rows.length;
    const right = half < rows.length ? `<h2 class="sp"></h2>` + rows.slice(half).join('') : tab === 'build' ? this.nextUnlocks() : '';
    return [head + rows.slice(0, half).join(''), right];
  }
  /** levels to come with what they bring (buildings + one field each) */
  private nextUnlocks() {
    const C = this.cfg, s = this.s, U = C.levels.unlocks, max = C.levels.xp.length;
    let h = `<h2>${ic('star')}</h2>`;
    for (let L = s.level + 1; L <= max; L++) {
      const un = (U[L] ?? []).filter(id => (BUILDING_IDS as string[]).includes(id));
      h += `<div class="unl"><span class="lv">${ic('star')}<b>${L}</b></span><span>${un.map(id => `<span title="${this.name(id)}">${ic(id)}</span>`).join('')}${ic('plot')}<i>+1</i></span></div>`;
    }
    return h;
  }
  private badge(t: Tab) {
    const s = this.s; let n = 0;
    if (t === 'build') n = BUILDING_IDS.filter(id => buildStatus(this.cfg, s, id) === 'ok').length;
    if (t === 'quests') n = s.levelUps.length;
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
    return `<h2>${ic('quest')}<span>${list.filter(q => q.done).length}/${list.length}</span></h2>${list.map(q => this.quest(q)).join('')}`;
  }
  /** right page of the orders: what the day brought, level-ups */
  private daySummary() {
    const s = this.s, C = this.cfg, S = s.summary;
    let h = `<h2>${ic('sun')}<span>Tag ${S?.day ?? s.day}</span></h2>`;
    for (const L of s.levelUps) {
      const un = C.levels.unlocks[L] ?? [];
      h += `<div class="lvlup">${ic('star')}<b>${L}</b><span>${un.map(id => ic(id)).join('')}${ic('plot')}<i>+1</i></span></div>`;
    }
    if (S) {
      const got = Object.entries(S.got).filter(([, v]) => v > 0), lost = Object.entries(S.lost).filter(([, v]) => v > 0);
      h += `<div class="sum${S.fainted ? ' faint' : ''}">${S.fainted ? `<span class="gd miss">${ic('heart')}<b>0</b></span>` : ''}
        ${got.map(([k, v]) => `<span class="gd">${ic(k)}<b>+${v}</b></span>`).join('')}
        ${lost.map(([k, v]) => `<span class="gd miss">${ic(k)}<b>−${v}</b></span>`).join('')}</div>
        <div class="sum">${S.driven ? `<span class="gd">${ic('raccoon')}<b>×${S.driven}</b></span>` : ''}
        ${S.broken ? `<span class="gd miss">${ic('plot')}<b>×${S.broken}</b></span>` : ''}
        ${S.xp ? `<span class="gd xp">${ic('xp')}<b>+${S.xp}</b></span>` : ''}</div>`;
    }
    return h;
  }
  private buildList() {
    const s = this.s, C = this.cfg;
    return BUILDING_IDS.map(id => {
      const st = buildStatus(C, s, id), B = C.buildings[id];
      if (st === 'built') return `<div class="row b done">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div>${ic('check')}</div>`;
      if (st === 'level') return `<div class="row b lock">${ic(id)}<div class="bn"><b>${this.name(id)}</b></div><span class="lv">${ic('star')}<b>${B.level}</b></span></div>`;
      const needs = st === 'needs' ? `<span class="gd miss">${ic(B.needs!)}</span>` : '';
      return `<div class="row b">${ic(id)}<div class="bn"><b>${this.name(id)}</b><div class="cost">${needs}${this.goods(B.cost ?? {}, true)}</div></div>
        <button class="hb" data-build="${id}" ${st === 'ok' ? '' : 'disabled'}>${B.broken ? 'Reparieren' : 'Bauen'}</button></div>`;
    });
  }
  /** what the buildings make during the day (overview only: production runs at the building by left click) */
  private prodList() {
    const s = this.s, C = this.cfg;
    const rows: string[] = [];
    for (const id of ['house', ...BUILDING_IDS] as BuildingId[]) {
      const B = C.buildings[id], built = id === 'house' || s.buildings[id].built;
      if (B.recipes?.length && B.action) rows.push(...B.recipes.map(r => `<div class="row p${built ? '' : ' lock'}">${ic(id)}<div class="bn"><b>${B.action!.label}</b><small>${this.name(id)}</small>
        <div class="cost">${this.goods(r.in, built)}${ic('arrowR')}${this.goods(r.out)}</div></div>${built ? '' : ic('lock')}</div>`));
      if ((STALL_IDS as string[]).includes(id)) {
        const S = C.stalls[id as keyof typeof C.stalls] as any;
        rows.push(`<div class="row p${built ? '' : ' lock'}">${ic(id)}<div class="bn"><b>${C.actions[S.collect as 'milk'].label}</b><small>${this.name(id)}</small>
          <div class="cost">${this.goods({ [S.feed]: S.feedCost * S.maxFed }, built)}${ic('arrowR')}${this.goods(Object.fromEntries(Object.entries(S.yield as Record<string, number>).map(([k, v]) => [k, v * S.animals.length])))}</div></div>${built ? '' : ic('lock')}</div>`);
      }
    }
    return rows;
  }

  // ---------------- page turning ----------------
  /** a leaf turns over the spine: forward = the right page turns to the left, back = the left page to the right */
  private turnTo(tab: Tab) {
    const from = TABS.findIndex(t => t[0] === this.tab), to = TABS.findIndex(t => t[0] === tab);
    const oldL = $('#hBody').innerHTML, oldR = $('#hBodyR').innerHTML;
    this.tab = tab; this.render();
    const stacked = matchMedia('(max-width: 699px) and (orientation: portrait)').matches;
    const book = $('#hBook');
    book.querySelectorAll('.leaf,.hold').forEach(e => e.remove());
    clearTimeout(this.flipping);
    if (stacked || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      book.classList.remove('fade'); void book.offsetWidth; book.classList.add('fade');
      this.flipping = window.setTimeout(() => book.classList.remove('fade'), 400);
      return;
    }
    const fwd = to > from, newL = $('#hBody').innerHTML, newR = $('#hBodyR').innerHTML;
    // the page under the turning leaf keeps showing the old content until the leaf has passed
    const hold = document.createElement('div');
    hold.className = `page hold ${fwd ? 'L' : 'R'}`; hold.style.clipPath = $(fwd ? '#hPL' : '#hPR').style.clipPath;
    hold.innerHTML = `<div class="pc">${fwd ? oldL : oldR}</div>`;
    const leaf = document.createElement('div');
    leaf.className = `leaf ${fwd ? 'fwd' : 'back'}`;
    leaf.innerHTML = `<div class="page face front ${fwd ? 'R' : 'L'}" style="clip-path:${$(fwd ? '#hPR' : '#hPL').style.clipPath}"><div class="pc">${fwd ? oldR : oldL}</div></div>
      <div class="page face backf ${fwd ? 'L' : 'R'}" style="clip-path:${$(fwd ? '#hPL' : '#hPR').style.clipPath}"><div class="pc">${fwd ? newL : newR}</div></div>`;
    book.append(hold, leaf);
    // keep the scroll position of the store page on the copies
    for (const pc of [hold, leaf].flatMap(e => [...e.querySelectorAll<HTMLElement>('.pc')])) pc.scrollTop = 0;
    this.onSound('ui.page');
    // the leaf goes when its animation has run (also if the tab was in the background); timers only as a fallback
    leaf.addEventListener('animationend', e => { if (e.target === leaf) { leaf.remove(); hold.remove(); } });
    setTimeout(() => hold.remove(), FLIP_MS * .5);
    this.flipping = window.setTimeout(() => leaf.remove(), FLIP_MS * 3);
  }

  /** graph: crosshair + value of the day under the pointer */
  private hover(e: PointerEvent) {
    const t = e.target as Element, g = t.closest?.('.graph'); if (!g) return;
    const tip = g.querySelector('.gtip') as HTMLElement, cur = g.querySelector('.gcur') as SVGLineElement;
    const r = t.closest('.gh') as SVGRectElement | null;
    if (!r) { tip.hidden = true; cur.style.display = 'none'; return; }
    const x = +r.getAttribute('x')! + +r.getAttribute('width')! / 2;
    cur.setAttribute('x1', '' + x); cur.setAttribute('x2', '' + x); cur.style.display = '';
    tip.hidden = false; tip.innerHTML = `Tag ${r.dataset.gd}<b>${r.dataset.gv}</b>`;
    const svg = g.querySelector('svg')!, sb = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    tip.style.left = `${(x / vb.width) * sb.width}px`;
  }

  private click(e: Event) {
    const t = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!t || t.disabled) return;
    const s = this.s, C = this.cfg, d = t.dataset;
    if (t.id === 'hSleep') { this.onSound('ui.confirm'); this.onSleep(); return; }
    if (d.tab) { if (d.tab !== this.tab) { this.onSound('ui.click'); this.turnTo(d.tab as Tab); } return; }
    if (d.item) {
      this.sel = d.item; this.onSound('ui.click');
      const seen = markSeen(s);
      $('#hBodyR').innerHTML = storeRight(C, s, seen, this.sel, this.gmode);
      $('#hBody').querySelectorAll('.cell.sel').forEach(c => c.classList.remove('sel')); t.classList.add('sel');
      return;
    }
    if (d.gmode) { this.gmode = d.gmode as GraphMode; this.onSound('ui.click'); $('#hBodyR').innerHTML = storeRight(C, s, markSeen(s), this.sel, this.gmode); return; }
    if (d.claim) { claimQuests(C, s); this.onSound('ui.levelup'); }
    else if (d.build) { if (build(C, s, d.build as BuildingId)) this.onSound('ui.levelup'); }
    else if (d.field) { if (placeField(C, s, 0, d.field)) this.onSound('ui.levelup'); }
    // the stock line of today follows what happens in the evening
    const h = s.hist?.[s.hist.length - 1]; if (h && h.d === s.day) { h.st = { ...s.items }; delete h.st.water; }
    this.onChange(); this.render();
  }
}

const cfgXp = (C: FarmCfg, k: string) => cropXp(C, k) * (C.crops[k]?.cuts ?? 3);

/** clip-path of a torn page: ragged outer edges with a few small tears, straight spine side */
function torn(seed: number, side: 'L' | 'R') {
  let a = seed * 9301 + 49297;
  const r = () => { a = (a * 9301 + 49297) % 233280; return a / 233280; };
  const pts: string[] = [], N = 34;
  const tears = new Set([Math.floor(r() * N), Math.floor(r() * N), Math.floor(N + r() * N)]);
  const j = (i: number) => (tears.has(i) ? 7 + r() * 6 : r() * 2.6);
  const P = (x: string, y: string) => pts.push(`${x} ${y}`);
  // top edge (spine -> outer for L: walk clockwise from top-left)
  for (let i = 0; i <= N; i++) P(`${(i / N * 100).toFixed(2)}%`, `${(side === 'L' ? i === N : i === 0) ? 0 : j(i).toFixed(1)}px`);
  // right edge
  for (let i = 1; i < N; i++) P(side === 'R' ? `calc(100% - ${j(N + i).toFixed(1)}px)` : '100%', `${(i / N * 100).toFixed(2)}%`);
  // bottom edge (right -> left)
  for (let i = N; i >= 0; i--) P(`${(i / N * 100).toFixed(2)}%`, `calc(100% - ${(side === 'L' ? i === N : i === 0) ? 0 : j(2 * N + i).toFixed(1)}px)`);
  // left edge (bottom -> top)
  for (let i = N - 1; i > 0; i--) P(side === 'L' ? `${j(3 * N + i).toFixed(1)}px` : '0%', `${(i / N * 100).toFixed(2)}%`);
  return `polygon(${pts.join(',')})`;
}
