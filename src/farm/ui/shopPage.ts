// Orders + farm shop page of the house book (Basti 22.11.2026, sketch "Hofladen").
// Left page: the farm shop (when built): short stock list (amount, icon, name; tabs per section when it gets long) and
// the sale slots: a good is dragged into a slot, a click opens the edit mode (Sale / Premium, how much may be sold).
// Right page: the orders as cards: delivered ones on top (green), a click collects the reward, "Alle abschließen" all of them;
// locked slots show the level that opens them. No explaining texts: icons, numbers, names.
import type { FarmCfg, ItemId } from '../config';
import { slotLevels } from '../config';
import type { FarmState, Quest } from '../state';
import { count, questProgress, questSlots, buildStatus } from '../state';
import type { SaleMode, ShopSlot } from '../shop';
import { SHOP_SLOTS, fmtPrice, modePrice, shopOpen, shopState } from '../shop';
import { ic } from './ficons';
import { goodInfo, storeSections } from './storePage';

const name = (cfg: FarmCfg, id: string) => cfg.names.items[id] ?? (cfg.names.buildings as any)[id] ?? id;
const rar = (cfg: FarmCfg, id: ItemId) => goodInfo(cfg, id).rarity[0];
/** the stock list fits into a third of the page up to this many goods, above it there are tabs per section */
const STOCK_FLAT = 15;

export interface ShopUi { cat: string; pick: ItemId | null; edit: { i: number; limit: number | null; mode: SaleMode } | null }

// ---------------- left page: farm shop ----------------
export function shopLeft(cfg: FarmCfg, s: FarmState, ui: ShopUi) {
  const head = `<h2>${ic('shop')}<span>${name(cfg, 'shop')}</span>${earned(cfg, s)}</h2>`;
  if (!s.buildings.shop?.built) {
    const B = cfg.buildings.shop, st = buildStatus(cfg, s, 'shop');
    return head + `<div class="shopLock">${ic('shop')}<span class="lk">${ic('lock')}</span>
      <div class="req">${st === 'level' ? `<span class="lv">${ic('star')}<b>${B.level}</b></span>` : `${ic('hammer')}${Object.entries(B.cost ?? {}).map(([k, v]) => `<span class="gd">${ic(k === 'money' ? 'coin' : k)}<b>${v}</b></span>`).join('')}`}</div></div>`;
  }
  return head + `<h3 class="sh3">Lager</h3>` + stockList(cfg, s, ui) + `<h3 class="sh3">Verkauf</h3>` + slots(cfg, s, ui) + (ui.edit ? editPanel(cfg, s, ui) : '');
}
/** Gefallen from yesterday's sales */
function earned(cfg: FarmCfg, s: FarmState) {
  const L = s.shop?.last; if (!L || L.d !== s.day || !L.money) return '';
  return `<span class="earn">${ic('coin')}<b>+${L.money}</b></span>`;
}
function stockList(cfg: FarmCfg, s: FarmState, ui: ShopUi) {
  const secs = storeSections(cfg).map(S => ({ ...S, have: S.goods.filter(g => count(s, g.id) > 0) })).filter(S => S.have.length);
  const all = secs.flatMap(S => S.have);
  let list = all, tabs = '';
  if (all.length > STOCK_FLAT) {
    if (!secs.some(S => S.id === ui.cat)) ui.cat = secs[0].id;
    list = secs.find(S => S.id === ui.cat)!.have;
    tabs = `<div class="stTabs">${secs.map(S => `<button class="${S.id === ui.cat ? 'on' : ''}" data-scat="${S.id}">${S.title}</button>`).join('')}</div>`;
  }
  const inSlot = new Set(shopState(s).slots.filter(Boolean).map(x => x!.id));
  return `<div class="stock">${tabs}<div class="sgl">${list.map(g => `<button class="sg r${g.rarity[0]}${ui.pick === g.id ? ' pick' : ''}${inSlot.has(g.id) ? ' used' : ''}" data-sg="${g.id}" data-drag="${g.id}">
    <b>${count(s, g.id)}</b>${ic(g.id)}<span>${name(cfg, g.id)}</span></button>`).join('') || `<span class="empty">${ic('box')}<b>0</b></span>`}</div></div>`;
}
const amountText = (sl: ShopSlot) => sl.limit === null ? 'Alle' : '' + sl.limit;
function priceTag(cfg: FarmCfg, id: ItemId, m: SaleMode, tag = true) {
  return `<span class="pr ${m}">${!tag ? '' : m === 'sale' ? '<i class="tag">Sale</i>' : m === 'prem' ? '<i class="tag">Premium</i>' : ''}<b>${fmtPrice(modePrice(cfg, id, m))}</b>${ic('coin')}</span>`;
}
function slots(cfg: FarmCfg, s: FarmState, ui: ShopUi) {
  const sh = shopState(s), open = shopOpen(cfg, s), lv = slotLevels(cfg.shop.slots), sold = sh.last?.d === s.day ? sh.last.sold : {};
  let h = '';
  for (let i = 0; i < SHOP_SLOTS; i++) {
    if (i >= open) { h += `<div class="slot lock"><span class="lv">${ic('star')}<b>${lv[i - cfg.shop.slots.start] ?? ''}</b></span></div>`; continue; }
    const sl = sh.slots[i];
    if (!sl) { h += `<button class="slot free${ui.pick ? ' hot' : ''}" data-slot="${i}"><span class="plus">+</span></button>`; continue; }
    const have = count(s, sl.id), empty = !have || sl.limit === 0;
    h += `<button class="slot r${rar(cfg, sl.id)} ${sl.mode}${empty ? ' out' : ''}${ui.edit?.i === i ? ' ed' : ''}" data-slot="${i}" data-drag="${sl.id}" data-from="${i}">
      <span class="st"><b>${amountText(sl)}</b> ${name(cfg, sl.id)}</span><span class="si">${ic(sl.id)}</span>${priceTag(cfg, sl.id, sl.mode)}
      ${sold[sl.id] ? `<i class="sold">−${sold[sl.id]}</i>` : ''}</button>`;
  }
  return `<div class="slots">${h}</div>`;
}
/** edit mode of a slot: Sale / Premium beside the price, slider + field for how much may be sold, confirm / cancel */
function editPanel(cfg: FarmCfg, s: FarmState, ui: ShopUi) {
  const e = ui.edit!, sl = shopState(s).slots[e.i]; if (!sl) return '';
  const have = count(s, sl.id), max = Math.max(1, have, e.limit ?? 0), val = e.limit === null ? max + 1 : e.limit;
  const btn = (m: SaleMode, t: string) => `<button class="mb ${m}${e.mode === m ? ' on' : ''}" data-emode="${m}"><i class="tag">${t}</i><b>${fmtPrice(modePrice(cfg, sl.id, m))}</b></button>`;
  return `<div class="epanel r${rar(cfg, sl.id)}" data-epanel="1">
    <div class="eh">${ic(sl.id)}<b>${name(cfg, sl.id)}</b><span class="gd">${ic('box')}<b>${have}</b></span></div>
    <div class="eprice">${btn('sale', 'Sale')}${priceTag(cfg, sl.id, e.mode, false)}${btn('prem', 'Premium')}</div>
    <div class="eamt"><input type="range" id="eRange" min="0" max="${max + 1}" step="1" value="${val}">
      <input type="text" inputmode="numeric" id="eNum" value="${e.limit === null ? 'Alle' : e.limit}"></div>
    <div class="ebtn"><button class="eb del" data-edel="1" aria-label="Entfernen">${ic('trash')}</button><span></span>
      <button class="eb no" data-eno="1" aria-label="Abbrechen">✕</button><button class="eb ok" data-eok="1" aria-label="Bestätigen">✓</button></div>
  </div>`;
}

// ---------------- right page: orders ----------------
export function questsRight(cfg: FarmCfg, s: FarmState, day: boolean) {
  const list = [...s.quests.active].sort((a, b) => rank(a) - rank(b)), prog = questProgress(s);
  const open = Math.max(list.length, questSlots(cfg, s.level)), S = cfg.quests.daily.slots, lv = slotLevels(S);
  const claimable = !day && list.some(q => q.done && !q.claimed);
  let h = `<h2>${ic('quest')}<span>Aufträge</span><span class="fav" id="qFav">${ic('coin')}<b>${s.money}</b><small>Gefallen</small></span></h2><div class="qgrid">`;
  for (const q of list) h += card(cfg, q, prog.get(q) ?? {}, day);
  for (let i = list.length; i < open; i++) h += `<div class="qc free"></div>`;
  for (let i = open; i < S.max; i++) h += `<div class="qc lock"><span class="lv">${ic('star')}<b>${lv[i - S.start] ?? ''}</b></span></div>`;
  h += `</div>`;
  h += `<div class="qfoot"><button class="hb arcB" data-arch="1" ${s.quests.archive?.length ? '' : 'disabled'}>${ic('book')}<span>Archiv</span></button>`;
  if (claimable) h += `<button class="hb big go qall" data-claimall="1">${ic('check')}<span>Alle abholen</span></button>`;
  return h + '</div>';
}
/** delivered + not collected first, then collected, then open, then expired */
const rank = (q: Quest) => q.done && !q.claimed ? 0 : q.claimed ? 1 : q.expired ? 3 : 2;
function card(cfg: FarmCfg, q: Quest, p: Record<ItemId, number>, day: boolean) {
  const st = q.claimed ? 'claimed' : q.done ? 'done' : q.expired && !day ? 'gone' : 'open';
  // delivered (Basti 22.11.2026): the card sparkles, its blinking button collects the reward
  const ready = st === 'done' && !day;
  const sparks = ready ? `<span class="qsp">${[[12, 18, 0], [78, 12, .7], [88, 58, 1.3], [8, 70, 1.9], [50, 6, 2.4], [40, 88, 1.1]].map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;animation-delay:${d}s"></i>`).join('')}</span>` : '';
  return `<div class="qc ${st}${ready ? ' ready' : ''}" data-q="${q.id}">${sparks}
    <b class="qt">${q.title ?? ''}</b>
    <div class="ob">${Object.entries(q.need).map(([k, v]) => `<span class="o${(p[k] ?? 0) >= v ? ' ok' : ''}"><b>${q.done ? v : p[k] ?? 0}/${v}</b>${ic(k)}<span>${name(cfg, k)}</span></span>`).join('')}</div>
    <div class="qr"><span class="gd xp">${ic('xp')}<b>${q.reward.xp}</b></span><span class="gd">${ic('coin')}<b>${q.reward.money}</b></span></div>
    ${ready ? `<button class="qget" data-claimq="${q.id}">${ic('check')}<span>Abholen</span></button>` : ''}
    ${st === 'claimed' ? `<span class="stamp">${ic('check')}</span>` : ''}
  </div>`;
}

// ---------------- archive of collected orders (Basti 22.11.2026): newest first, loaded in pages while scrolling ----------------
export const ARCH_PAGE = 40;
export function archivePage(cfg: FarmCfg, s: FarmState) {
  const n = s.quests.archive?.length ?? 0;
  return `<h2>${ic('book')}<span>Archiv</span><span class="fav">${ic('check')}<b>${n}</b></span></h2>
    <div class="arch" id="hArch">${archiveRows(cfg, s, 0, ARCH_PAGE)}</div>
    <div class="qfoot"><button class="hb arcB" data-arch="0">${ic('arrowR')}<span>Aufträge</span></button></div>`;
}
/** rows from..to (counted from the newest) */
export function archiveRows(cfg: FarmCfg, s: FarmState, from: number, to: number) {
  const A = s.quests.archive ?? [], out: string[] = [];
  let lastDay = from > 0 ? A[A.length - from]?.d : undefined;
  for (let k = from; k < Math.min(to, A.length); k++) {
    const a = A[A.length - 1 - k];
    if (a.d !== lastDay) { out.push(`<div class="aday">Tag ${a.d}</div>`); lastDay = a.d; }
    out.push(`<div class="arow"><b>${a.t}</b><span class="an">${Object.entries(a.n).map(([i, v]) => `<span class="gd">${ic(i)}<b>${v}</b></span>`).join('')}</span>
      <span class="ar"><span class="gd xp">${ic('xp')}<b>${a.x}</b></span><span class="gd">${ic('coin')}<b>${a.m}</b></span></span></div>`);
  }
  return out.join('');
}
