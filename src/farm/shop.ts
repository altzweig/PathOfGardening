// Farm shop (Basti 22.11.2026): goods dragged into the sale slots of the house book are sold over the day and paid in
// the evening. Price per piece from the work behind it (field seconds x rate, products: ingredients x craft, others from
// shop.prices). Sale = -30 % price, more is sold; Premium = +30 % price, less is sold.
import type { FarmCfg, ItemId } from './config';
import { cropMain, cropSec, slotsAt } from './config';
import type { FarmState } from './state';
import { addItem, count } from './state';

export type SaleMode = 'norm' | 'sale' | 'prem';
/** limit = pieces still to sell (null = everything in the storage) */
export interface ShopSlot { id: ItemId; limit: number | null; mode: SaleMode }
export interface ShopState { slots: (ShopSlot | null)[]; carry: number; last?: { d: number; sold: Record<ItemId, number>; money: number } }
export const SHOP_SLOTS = 9;

export function shopState(s: FarmState): ShopState {
  const sh = (s.shop ??= { slots: [], carry: 0 });
  while (sh.slots.length < SHOP_SLOTS) sh.slots.push(null);
  return sh;
}
export const shopOpen = (cfg: FarmCfg, s: FarmState) => s.buildings.shop?.built ? slotsAt(cfg.shop.slots, s.level) : 0;

/** normal price of one piece */
export function priceOf(cfg: FarmCfg, id: ItemId, depth = 0): number {
  const S = cfg.shop;
  if (S.prices?.[id] !== undefined) return S.prices[id];
  const D = cfg.quests.daily;
  if (id === 'blue') return D.blue.sec * S.rate;
  // a crop on a field: field seconds per piece of its main good
  // harvest experiment (22.11.2026): s of harvest work per piece (every x (1 + overhead))
  for (const c of Object.values(cfg.crops)) if (cropMain(c) === id) return cropSec(cfg, c) * S.rate;
  // a product: what goes into it
  if (depth < 4) for (const B of Object.values(cfg.buildings)) for (const r of B.recipes ?? []) {
    const out = r.out[id]; if (!out) continue;
    const v = Object.entries(r.in).reduce((a, [k, m]) => a + (k === 'water' ? 0 : priceOf(cfg, k, depth + 1) * m), 0);
    return v * S.craft / out;
  }
  return S.base;
}
export const modePrice = (cfg: FarmCfg, id: ItemId, m: SaleMode) => priceOf(cfg, id) * (m === 'sale' ? cfg.shop.sale.price : m === 'prem' ? cfg.shop.premium.price : 1);
/** price as shown: 2 decimals under 10, whole numbers above */
export const fmtPrice = (v: number) => v >= 10 ? '' + Math.round(v) : v.toLocaleString('de-DE', { minimumFractionDigits: v < 1 ? 2 : 1, maximumFractionDigits: v < 1 ? 2 : 1 });

/** evening: what the open slots sold today (goods leave the storage, Gefallen come in) */
export function sellDay(cfg: FarmCfg, s: FarmState, rnd: () => number = Math.random) {
  const n = shopOpen(cfg, s); if (!n) return;
  const sh = shopState(s), S = cfg.shop, sold: Record<ItemId, number> = {};
  let earned = 0;
  for (let i = 0; i < n; i++) {
    const sl = sh.slots[i]; if (!sl) continue;
    const base = priceOf(cfg, sl.id); if (base <= 0) continue;
    const dm = sl.mode === 'sale' ? S.sale.demand : sl.mode === 'prem' ? S.premium.demand : 1;
    const want = Math.floor(S.demand * dm * (1 + (rnd() * 2 - 1) * S.spread) / base);
    const k = Math.max(0, Math.min(count(s, sl.id), sl.limit ?? Infinity, want));
    if (!k) continue;
    addItem(cfg, s, sl.id, -k); if (sl.limit !== null) sl.limit -= k;
    sold[sl.id] = (sold[sl.id] ?? 0) + k; earned += k * modePrice(cfg, sl.id, sl.mode);
  }
  const total = sh.carry + earned, money = Math.floor(total);
  sh.carry = total - money; s.money += money;
  sh.last = { d: s.day, sold, money };
}
