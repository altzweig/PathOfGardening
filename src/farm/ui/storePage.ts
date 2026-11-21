// Storage page of the house book (Basti 21.11.2026). Left page: every good of the game in sections (field crops, wild
// plants, products), nearly invisible grid, rarity glow, amount + green "+yield of the day"; goods never owned are greyed
// out with a lock. Right page: graph (stock / yield per day) and the data of the selected good.
import type { FarmCfg, ItemId, Rarity } from '../config';
import { BUILDING_IDS, STALL_IDS, cropXp, otherXp } from '../config';
import type { FarmState } from '../state';
import { count } from '../state';
import { ic } from './ficons';

const RAR: Rarity[] = ['Common', 'Uncommon', 'Rare'];
const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
const n0 = (v: number) => nf.format(Math.round(v * 10) / 10);
/** seconds as "45 s" / "3:40 min" / "2 Tage" */
export function dur(sec: number, cfg: FarmCfg) {
  if (sec >= cfg.day.length && sec % cfg.day.length === 0) { const d = sec / cfg.day.length; return d === 1 ? '1 Tag' : `${d} Tage`; }
  if (sec < 120) return `${n0(sec)} s`;
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')} min`;
}

export type GoodKind = 'crop' | 'bush' | 'perennial' | 'tree' | 'bramble' | 'forage' | 'herb' | 'found' | 'goods';
export interface GoodInfo { id: ItemId; rarity: Rarity; kind: GoodKind; time: number; order: number }

export function goodInfo(cfg: FarmCfg, id: ItemId, order = 0): GoodInfo {
  const C = cfg.crops[id], O = cfg.harvestXp?.other?.[id], P = cfg.storage.perennials?.[id], Wd = cfg.wild, D = cfg.day.length;
  const rarity: Rarity = C?.rarity ?? O?.rarity ?? cfg.storage.rarity?.[id] ?? 'Common';
  let kind: GoodKind = 'goods', time = 0;
  if (C) { kind = 'crop'; time = C.grow; }
  else if (id === 'blue') { kind = 'bush'; time = cfg.bush.ripen; }
  else if (P) { kind = 'perennial'; time = P.every * D; }
  else if (id === 'apple') { kind = 'tree'; time = Wd.apples.every * D; }
  else if (id === 'nut') { kind = 'tree'; time = (Wd.nuts ?? Wd.apples).every * D; }
  else if (id === 'bramble') { kind = 'bramble'; time = Wd.brambles.every * D; }
  else if (Wd.herbs?.kinds?.includes(id)) { kind = 'herb'; time = (Wd.weeds.every[0] + Wd.weeds.every[1]) / 2; }
  else if (Wd.forage.plants?.[id]) { kind = 'forage'; time = Wd.forage.plants[id].spawn; }
  else if (Wd.forage.items?.[id] !== undefined) { kind = 'found'; time = (Wd.forage.every[0] + Wd.forage.every[1]) / 2; }
  return { id, rarity, kind, time, order };
}

/** sections with their goods sorted: rarity, then harvest time short -> long (products keep the yaml order) */
export function storeSections(cfg: FarmCfg) {
  return (cfg.storage.sections ?? []).map(S => {
    const items = S.items.filter(id => id !== 'water').map((id, i) => goodInfo(cfg, id, i));
    items.sort((a, b) => RAR.indexOf(a.rarity) - RAR.indexOf(b.rarity) || (a.kind === 'goods' || b.kind === 'goods' ? a.order - b.order : a.time - b.time || a.order - b.order));
    return { ...S, goods: items };
  });
}

/** what came in on the last finished day */
export const lastGot = (s: FarmState, id: ItemId) => { const h = s.hist; return h?.length ? h[h.length - 1].got[id] ?? 0 : 0; };
const name = (cfg: FarmCfg, id: string) => (id === 'coin' ? 'Gefallen' : cfg.names.items[id] ?? (cfg.names.buildings as any)[id] ?? id);

// ---------------- left page ----------------
export function storeLeft(cfg: FarmCfg, s: FarmState, seen: Set<ItemId>, sel: ItemId) {
  return storeSections(cfg).map(S => `<section class="ls">
    <h3>${S.title}</h3>
    <div class="inv">${S.goods.map(g => {
      const have = count(s, g.id), y = lastGot(s, g.id), lock = !seen.has(g.id);
      return `<button class="cell r${g.rarity[0]}${lock ? ' lock' : ''}${g.id === sel ? ' sel' : ''}" data-item="${g.id}" title="${name(cfg, g.id)}">
        <span class="ico">${ic(g.id)}</span>${lock ? `<span class="lk">${ic('lock')}</span>` : ''}
        <span class="amt">${lock ? '&nbsp;' : `<b>${have}</b>${y > 0 ? `<i>+${y}</i>` : ''}`}</span></button>`;
    }).join('')}</div></section>`).join('');
}

// ---------------- right page ----------------
export type GraphMode = 'stock' | 'yield';
export function storeRight(cfg: FarmCfg, s: FarmState, seen: Set<ItemId>, sel: ItemId, mode: GraphMode) {
  const g = goodInfo(cfg, sel), lock = !seen.has(sel);
  return `<div class="gTop">
      <div class="gTog"><button class="${mode === 'stock' ? 'on' : ''}" data-gmode="stock">Lagerbestand</button><button class="${mode === 'yield' ? 'on' : ''}" data-gmode="yield">Ertrag pro Tag</button></div>
    </div>
    ${graph(cfg, s, sel, mode)}
    <div class="det${lock ? ' lock' : ''}">
      <div class="dHead"><span class="dIco r${g.rarity[0]}">${ic(sel)}${lock ? `<span class="lk">${ic('lock')}</span>` : ''}</span>
        <div><b>${name(cfg, sel)}</b><span class="rar r${g.rarity[0]}">${g.rarity}</span></div>
        <span class="dAmt">${ic('box')}<b>${count(s, sel)}</b>${lastGot(s, sel) > 0 ? `<i>+${lastGot(s, sel)}</i>` : ''}</span></div>
      ${facts(cfg, s, g)}
    </div>`;
}

/** one data line: label, value (text or html) */
const fact = (label: string, val: string) => `<div class="f"><span>${label}</span><b>${val}</b></div>`;
const goods = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `<span class="gd">${ic(k)}<b>${v}</b></span>`).join('');

function facts(cfg: FarmCfg, s: FarmState, g: GoodInfo) {
  const D = cfg.day.length, rows: string[] = [], bonus: string[] = [], id = g.id, made: string[] = [], used: string[] = [];
  const cycle = cfg.quests?.daily?.cycle ?? 10;
  if (g.kind === 'crop') {
    const C = cfg.crops[id], fields = s.plots.filter(p => p.open && p.kind === id).length;
    const perPass = C.cuts * (C.yield[id] ?? 0), perDay = D / (cycle + C.grow) * perPass;
    rows.push(fact('Wachstum', dur(C.grow, cfg)), fact('Ernten', `${C.cuts} ×`), fact('pro Ernte', goods(C.yield)),
      fact('pro Feld und Tag', `≈ ${n0(perDay)}`), fact('Felder', `${fields}`), fact('XP pro Ernte', `${cropXp(cfg, id)}`));
    const silo = s.buildings.silo?.built;
    bonus.push(`<div class="b${silo || count(s, 'fert') ? '' : ' off'}">${ic('fert')}<span>${cfg.names.items.fert}</span><b>+${Math.round(cfg.plots.fertBonus * 100)} % Ernten</b></div>`);
    bonus.push(`<div class="b neg">${ic('green')}<span>Unkraut</span><b>${cfg.plots.weeds.slow.map(v => `−${Math.round(v * 100)} %`).join(' / ')}</b></div>`);
  } else if (g.kind === 'bush') {
    rows.push(fact('Reifezeit', dur(cfg.bush.ripen, cfg)), fact('Ernten', `${cfg.bush.picks} ×`), fact('pro Ernte', goods({ [id]: cfg.bush.berries })),
      fact('Büsche', '1'), fact('XP pro Ernte', `${otherXp(cfg, id, cfg.bush.picks)}`));
  } else if (g.kind === 'perennial') {
    const P = cfg.storage.perennials![id];
    rows.push(fact('reif alle', dur(P.every * D, cfg)), fact('Ernten', `${P.picks} ×`), fact('pro Ernte', goods({ [id]: P.pick })));
  } else if (g.kind === 'tree' || g.kind === 'bramble') {
    const T = g.kind === 'bramble' ? { every: cfg.wild.brambles.every, picks: cfg.wild.brambles.picks, shake: cfg.wild.brambles.pick } : id === 'nut' ? (cfg.wild.nuts ?? cfg.wild.apples) : cfg.wild.apples;
    const nTree = g.kind === 'bramble' ? cfg.wild.brambles.count : (cfg.wild.trees ?? ['apple']).length ? cfg.hof.trees.filter((_, i) => ((cfg.wild.trees ?? ['apple'])[i % (cfg.wild.trees ?? ['apple']).length]) === id).length : 0;
    rows.push(fact('reif alle', dur(T.every * D, cfg)), fact('Ernten', `${T.picks} ×`), fact('pro Ernte', goods({ [id]: T.shake })),
      fact(g.kind === 'bramble' ? 'Sträucher' : 'Bäume', `${nTree}`), fact('XP pro Ernte', `${otherXp(cfg, id, T.picks)}`));
  } else if (g.kind === 'forage') {
    const P = cfg.wild.forage.plants![id];
    rows.push(fact('wächst nach', dur(P.spawn, cfg)), fact('Sammeln', `${P.picks} ×`), fact('pro Sammeln', goods({ [id]: 1 })), fact('XP pro Sammeln', `${otherXp(cfg, id, P.picks)}`));
  } else if (g.kind === 'herb') {
    // found while weeding the yard's wild herb tufts (Wildkräuter, 21.11.2026)
    const Hb = cfg.wild.herbs!, w = cfg.wild.weeds;
    rows.push(fact('wächst nach', `${w.every[0]}–${w.every[1]} s`), fact('Chance', `${Math.round(Hb.chance * 100)} %`),
      fact('XP pro Kraut', `${otherXp(cfg, id, Hb.xpPicks)}`));
    made.push(`<div class="rc">${ic('handrake')}<span class="gl">${ic('green')}</span>${ic('arrowR')}<span class="gl">${ic(id)}</span></div>`);
  } else if (g.kind === 'found') {
    rows.push(fact('wächst nach', `${cfg.wild.forage.every[0]}–${cfg.wild.forage.every[1]} s`), fact('pro Sammeln', goods({ [id]: 1 })));
  }
  // where it comes from (products) and where it is used
  for (const b of ['house', ...BUILDING_IDS] as const) {
    const B = cfg.buildings[b]; if (!B) continue;
    for (const r of B.recipes ?? []) {
      const line = `<div class="rc">${ic(b)}<span class="gl">${goods(r.in)}</span>${ic('arrowR')}<span class="gl">${goods(r.out)}</span></div>`;
      if (r.out[id]) made.push(line); else if (r.in[id]) used.push(line);
    }
    if (B.cost?.[id] && !s.buildings[b]?.built) used.push(`<div class="rc">${ic(b)}<span class="gl">${goods({ [id]: B.cost[id]! })}</span>${ic('hammer')}</div>`);
  }
  for (const st of STALL_IDS) {
    const S = cfg.stalls[st]; if (!S) continue;
    const out = Object.fromEntries(Object.entries(S.yield).map(([k, v]) => [k, v * S.animals.length]));
    const line = `<div class="rc">${ic(st)}<span class="gl">${goods({ [S.feed]: S.feedCost * S.maxFed })}</span>${ic('arrowR')}<span class="gl">${goods(out)}</span></div>`;
    if (S.yield[id] !== undefined) {
      made.push(line);
      bonus.push(`<div class="b${s.buildings[st]?.built ? '' : ' off'}">${ic('straw')}<span>${cfg.names.items.straw}</span><b>+${Math.round(cfg.stalls.strawBonus * 100)} %</b></div>`);
    } else if (S.feed === id) used.push(line);
  }
  for (const [cid, C] of Object.entries(cfg.crops)) if (cid !== id && C.yield[id]) made.push(`<div class="rc">${ic('plot')}<span class="gl">${ic(cid)}</span>${ic('arrowR')}<span class="gl">${goods({ [id]: C.yield[id] * C.cuts })}</span></div>`);
  if (id === 'green') made.push(`<div class="rc">${ic('handrake')}<span class="gl">${ic('green')}</span></div>`);
  const uniq = (a: string[]) => [...new Set(a)];
  return `${rows.length ? `<div class="facts">${rows.join('')}</div>` : ''}
    ${made.length ? `<h4>${ic('gear')}<span>Herstellung</span></h4><div class="rcs">${uniq(made).join('')}</div>` : ''}
    ${used.length ? `<h4>${ic('arrowR')}<span>Verwendung</span></h4><div class="rcs">${uniq(used).slice(0, 6).join('')}</div>` : ''}
    ${bonus.length ? `<h4>Boni</h4><div class="bon">${uniq(bonus).join('')}</div>` : ''}`;
}

// ---------------- graph ----------------
/** values per finished day (+ today's stock in stock mode) */
function series(s: FarmState, id: ItemId, mode: GraphMode) {
  const pts = (s.hist ?? []).map(r => ({ d: r.d, v: (mode === 'stock' ? r.st[id] : r.got[id]) ?? 0 }));
  if (mode === 'stock') { const now = count(s, id); if (pts.length && pts[pts.length - 1].d === s.day) pts[pts.length - 1].v = now; else pts.push({ d: s.day, v: now }); }
  return pts;
}
const niceMax = (v: number) => { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p; };

export function graph(cfg: FarmCfg, s: FarmState, id: ItemId, mode: GraphMode) {
  const pts = series(s, id, mode);
  const W = 360, H = 150, L = 34, R = 12, T = 12, B = 24, w = W - L - R, h = H - T - B;
  const max = niceMax(Math.max(1, ...pts.map(p => p.v)));
  const d0 = pts.length ? pts[0].d : s.day, d1 = pts.length ? pts[pts.length - 1].d : s.day, span = Math.max(1, d1 - d0);
  const X = (d: number) => pts.length <= 1 ? L + w / 2 : L + (d - d0) / span * w, Y = (v: number) => T + h - v / max * h;
  // a wobbly hand-drawn line: tiny deterministic offsets
  const wob = (i: number) => Math.sin(i * 12.9898) * .6;
  const grid = [0, .5, 1].map(f => `<line x1="${L}" x2="${W - R}" y1="${Y(max * f)}" y2="${Y(max * f)}" class="gg"/><text x="${L - 6}" y="${Y(max * f) + 4}" class="gy">${n0(max * f)}</text>`).join('');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${(X(p.d) + wob(i)).toFixed(1)} ${(Y(p.v) + wob(i + 7)).toFixed(1)}`).join(' ');
  const area = pts.length > 1 ? `<path class="ga" d="${line} L${X(d1)} ${Y(0)} L${X(d0)} ${Y(0)} Z"/>` : '';
  const dots = pts.map(p => `<circle class="gp" cx="${X(p.d)}" cy="${Y(p.v)}" r="3.2"/>`).join('');
  const hits = pts.map((p, i) => `<rect class="gh" x="${X(p.d) - (pts.length > 1 ? w / span / 2 : 30)}" y="${T}" width="${pts.length > 1 ? w / span : 60}" height="${h}" data-gi="${i}" data-gd="${p.d}" data-gv="${p.v}"/>`).join('');
  const last = pts[pts.length - 1];
  const xl = pts.length ? `<text x="${X(d0)}" y="${H - 6}" class="gx" text-anchor="${pts.length > 1 ? 'start' : 'middle'}">Tag ${d0}</text>${pts.length > 1 ? `<text x="${X(d1)}" y="${H - 6}" class="gx" text-anchor="end">Tag ${d1}</text>` : ''}` : '';
  return `<div class="graph"><svg viewBox="0 0 ${W} ${H}">
    ${grid}<line x1="${L}" x2="${L}" y1="${T - 4}" y2="${T + h}" class="gax"/><line x1="${L}" x2="${W - R}" y1="${T + h}" y2="${T + h}" class="gax"/>
    ${area}${pts.length > 1 ? `<path class="gl2" d="${line}"/><path class="gl1" d="${line}"/>` : ''}${dots}
    ${last ? `<text x="${Math.min(X(last.d), W - R - 2)}" y="${Math.max(T + 10, Y(last.v) - 8)}" class="gv" text-anchor="${pts.length > 1 ? 'end' : 'middle'}">${last.v}</text>` : ''}
    ${xl}<line class="gcur" x1="0" x2="0" y1="${T}" y2="${T + h}" style="display:none"/>${hits}</svg><div class="gtip" hidden></div></div>`;
}
