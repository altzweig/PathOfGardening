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
const FLIP_MS = 900;

export class HouseUi {
  tab: Tab = 'store';
  /** selected good on the storage page + graph mode */
  sel: ItemId = 'wheat';
  gmode: GraphMode = 'stock';
  onSleep: () => void = () => {};
  /** the book was closed during the day (button or key) */
  onClose: () => void = () => {};
  /** opened during the day / night (Basti 21.11.2026: key B or the book button): game paused, the farm blurred behind,
   *  no sleeping, no collecting, no building (that stays in the house in the evening) */
  day = false;
  /** goods of the running day (day mode: shown on the orders page) */
  private live: Record<string, number> | null = null;
  onChange: () => void = () => {};
  onSound: (k: string) => void = () => {};
  private bg: HouseBg;
  private flipping = 0;
  private curlRaf = 0;
  constructor(public cfg: FarmCfg, public s: FarmState) {
    const root = $('#fHouse');
    root.addEventListener('click', e => this.click(e));
    root.addEventListener('pointermove', e => this.hover(e));
    root.addEventListener('pointerdown', e => this.hover(e));
    // page block of the thick book: stacked paper edges above both pages
    $('#hStack').innerHTML = [0, 1, 2, 3, 4, 5].map(i => `<i class="l" style="--i:${i}"></i><i class="r" style="--i:${i}"></i>`).join('');
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
    this.day = false; this.live = null; $('#fHouse').classList.remove('dayBook');
    $('#fHouse').hidden = !on;
    if (on) { this.render(); this.bg.start(); } else this.bg.stop();
  }
  /** the book over the running day */
  openDay(got: Record<string, number>) {
    this.day = true; this.live = got;
    const root = $('#fHouse'); root.classList.add('dayBook'); root.hidden = false;
    this.render(); this.onSound('ui.page');
  }
  closeDay() { if (!this.day) return; this.day = false; this.live = null; $('#fHouse').hidden = true; this.onSound('ui.page'); }
  render() {
    const s = this.s, C = this.cfg;
    $('#hDay').textContent = '' + s.day;
    $('#hMoney').innerHTML = `${ic('coin')}<b>${s.money}</b>`;
    $('#hLvl').innerHTML = `${ic('star')}<b>${s.level}</b>`;
    $('#hSleep').innerHTML = `${ic('sleep')}<span>Schlafen</span>`;
    $('#hClose').innerHTML = `${ic('book')}<span>Zuklappen</span>`;
    const book = $('#hBook'), rw = $('#hRewards');
    // delivered orders: one tile each, the reward is collected here (Basti 21.11.2026)
    const R = this.day ? [] : unclaimed(s), F = R.length || this.day ? null : s.fieldPicks[0];
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
    $('#hTabs').innerHTML = TABS.map(([t, i, n, col], k) => `<button class="bm${t === this.tab ? ' on' : ''}${k >= 2 ? ' right' : ''}" style="--c:${col};--x:${[3, 20.5, 53, 70.5][k]}%;--d:${[1, 3, 2, 4][k]}" data-tab="${t}">${ic(i)}<span>${n}</span>${this.badge(t)}</button>`).join('');
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
    const open = this.day && !q.done && !q.expired; // during the day an order is still open, not expired
    return `<div class="row q${q.done ? ' ready' : open ? '' : ' gone'}">${ic(q.done ? 'check' : open ? 'quest' : 'lock')}
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
    const s = this.s, C = this.cfg;
    const S = this.day ? (this.live ? { day: s.day, got: this.live, lost: {} as Record<string, number>, driven: 0, xp: 0, fainted: false, broken: 0 } : null) : s.summary;
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
        <button class="hb" data-build="${id}" ${st === 'ok' && !this.day ? '' : 'disabled'}>${B.broken ? 'Reparieren' : 'Bauen'}</button></div>`;
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
    book.querySelectorAll('.leaf,.hold,.curl,.curlHold').forEach(e => e.remove()); cancelAnimationFrame(this.curlRaf);
    clearTimeout(this.flipping);
    if (stacked || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      book.classList.remove('fade'); void book.offsetWidth; book.classList.add('fade');
      this.flipping = window.setTimeout(() => book.classList.remove('fade'), 400);
      return;
    }
    const fwd = to > from, newL = $('#hBody').innerHTML, newR = $('#hBodyR').innerHTML;
    this.curl(fwd, fwd ? oldL : oldR, fwd ? oldR : oldL, fwd ? newL : newR);
  }

  /** turning a page by hand (Basti 21.11.2026): the leaf is grabbed at its lower outer corner and pulled over the spine.
   *  2D fold: the corner P swings on a low arc around the bottom of the spine, the fold line is the perpendicular bisector
   *  of the corner's rest place C and P. The flat rest of the leaf is clipped at the fold, the folded part is the back of the
   *  leaf (the new page) mirrored over the fold; soft shading along the fold makes the paper look bent.
   *  stay = old page beside the leaf (shown until the leaf covers it), front/back = both sides of the leaf */
  private curl(fwd: boolean, stay: string, front: string, back: string) {
    const book = $('#hBook'), bR = book.getBoundingClientRect();
    const leafPage = $(fwd ? '#hPR' : '#hPL'), other = $(fwd ? '#hPL' : '#hPR'), r = leafPage.getBoundingClientRect();
    const W = r.width, H = r.height;
    const place = (el: HTMLElement, rr: DOMRect) => Object.assign(el.style, { left: rr.left - bR.left + 'px', top: rr.top - bR.top + 'px', width: rr.width + 'px', height: rr.height + 'px' });
    const copy = (el: HTMLElement, side: string, html: string) => `<div class="page ${side}" style="clip-path:${el.style.clipPath}"><div class="pc">${html}</div></div>`;
    const hold = document.createElement('div');
    hold.className = 'curlHold'; place(hold, other.getBoundingClientRect());
    hold.innerHTML = copy(other, fwd ? 'L' : 'R', stay);
    const leaf = document.createElement('div');
    leaf.className = 'curl'; place(leaf, r);
    leaf.innerHTML = `<div class="cRem">${copy(leafPage, fwd ? 'R' : 'L', front)}</div><div class="cRev"><i class="st"></i></div>
      <div class="cFlap"><div class="cIn">${copy(other, fwd ? 'L' : 'R', back)}<i class="st"></i></div></div>`;
    book.append(hold, leaf);
    const rem = leaf.querySelector('.cRem') as HTMLElement, rev = leaf.querySelector('.cRev') as HTMLElement, revSt = rev.firstElementChild as HTMLElement;
    const flap = leaf.querySelector('.cFlap') as HTMLElement, fin = flap.firstElementChild as HTMLElement, flapSt = fin.lastElementChild as HTMLElement;
    type V = { x: number; y: number };
    // spine frame: s = distance from the spine; leaf-local x and the local x of the back page (the page the leaf becomes)
    const conv = (p: V): V => ({ x: fwd ? p.x : W - p.x, y: p.y });
    const toBack = (p: V): V => ({ x: fwd ? W - p.x : p.x, y: p.y });
    const poly = (pts: V[]) => `polygon(${pts.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})`;
    const cut = (pts: V[], f: (p: V) => number) => { // keep f >= 0 (one Sutherland-Hodgman pass)
      const out: V[] = [];
      pts.forEach((a, i) => { const b = pts[(i + 1) % pts.length], fa = f(a), fb = f(b);
        if (fa >= 0) out.push(a);
        if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); } });
      return out;
    };
    const strip = (el: HTMLElement, at: V, dir: V, w: number) => Object.assign(el.style, {
      left: at.x + 'px', top: at.y - (W + H) + 'px', width: w + 'px', height: 2 * (W + H) + 'px', transform: `rotate(${Math.atan2(dir.y, dir.x)}rad)` });
    const rect: V[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
    const lift = Math.min(H * .22, W * .32), C: V = { x: W, y: H };
    const frame = (e: number) => {
      // the corner is lifted while it is pulled up and over, then the leaf lies down flat against the spine
      const P: V = { x: W * Math.cos(Math.PI * e), y: H - (e < .62 ? lift * Math.sin(Math.PI * e / .62) : 0) };
      const dx = P.x - C.x, dy = P.y - C.y, len = Math.hypot(dx, dy) || 1e-3, n = { x: dx / len, y: dy / len }, M = { x: (P.x + C.x) / 2, y: (P.y + C.y) / 2 };
      const side = (p: V) => (p.x - M.x) * n.x + (p.y - M.y) * n.y;
      const remain = cut(rect, side), folded = cut(rect, p => -side(p) - 1e-6);
      rem.style.clipPath = poly(remain.map(conv));
      rev.style.clipPath = poly(folded.map(conv));
      fin.style.clipPath = poly(folded.map(toBack));
      // back page local -> spine frame -> mirrored over the fold -> leaf local
      const T = (u: V) => { const p = toBack(u), d = side(p); return conv({ x: p.x - 2 * d * n.x, y: p.y - 2 * d * n.y }); };
      const o = T({ x: 0, y: 0 }), ax = T({ x: 1, y: 0 }), ay = T({ x: 0, y: 1 });
      flap.style.transform = `matrix(${ax.x - o.x},${ax.y - o.y},${ay.x - o.x},${ay.y - o.y},${o.x},${o.y})`;
      // shadow on the page coming out under the leaf, bend shading on the folded part
      const away = conv({ x: M.x - n.x, y: M.y - n.y }), cm = conv(M);
      strip(revSt, cm, { x: away.x - cm.x, y: away.y - cm.y }, Math.min(len * .5, 90));
      const bm = toBack(M), ba = toBack({ x: M.x - n.x, y: M.y - n.y });
      strip(flapSt, bm, { x: ba.x - bm.x, y: ba.y - bm.y }, Math.max(8, len * .5));
      // the old page beside the leaf goes once the leaf lies on it
      if (e > .97) hold.style.visibility = 'hidden';
    };
    for (const pc of [hold, leaf].flatMap(el => [...el.querySelectorAll<HTMLElement>('.pc')])) pc.scrollTop = 0;
    this.onSound('ui.page');
    cancelAnimationFrame(this.curlRaf);
    const t0 = performance.now(), ease = (t: number) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / FLIP_MS);
      if (t >= 1) { leaf.remove(); hold.remove(); return; }
      frame(Math.max(.002, ease(t)));
      this.curlRaf = requestAnimationFrame(tick);
    };
    frame(.002);
    this.curlRaf = requestAnimationFrame(tick);
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
    if (t.id === 'hClose') { this.onClose(); return; }
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
