// Werkstatt (23.11.2026): ideas (light bulbs) next to the XP bar, hex fields on level-up; since 24.11.2026 the bench is the merchant's screen.
import { AMMO_OF, Balancing, FRUITS, FruitType, SKILLS, isBuilding } from '../config';
import type { Offer, Snap } from '../sim/snap';
import { bulb, fieldArt, fruitIcon, iconText, mini, pic, skillIcon, teaArt } from './icons';
import { tilt } from './hud';
import { tileContrib, tileCost } from '../sim/sim';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const noMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------- hex fields (level-up) ----------------
interface Side { icon: string; name: string }
/** what a hex shows: building/field art, product floating above, input(s) left -> output right */
function hexInfo(o: Offer, cfg: Balancing): { art: string; top: string; ins: Side[]; out: Side; fx?: string } {
  const N = cfg.names, I = N.items ?? {}, W = cfg.werkstatt?.names ?? {};
  const item = (t: string): Side => ({ icon: fruitIcon(t), name: (I as any)[t] ?? t });
  if (o.key.startsWith('tea_')) {
    const T = cfg.upgrades.herbalTea;
    return { art: teaArt(), top: mini('heart'), ins: [{ icon: mini('sprout'), name: W.herbs ?? '' }], out: { icon: mini('heart'), name: '+' + T.playerHeal } };
  }
  const t = o.key.replace(/^(tile|start)_/, '') as FruitType;
  const seed: Side = { icon: mini('seed'), name: W.seed ?? '' };
  if (!isBuilding(t)) return { art: fieldArt(t), top: fruitIcon(t), ins: [seed], out: item(t), fx: o.key.startsWith('start_') ? N.effects?.[t as 'blue'] : undefined };
  const B = cfg.buildings[t];
  if (B.cropBonus?.length) return { art: fieldArt(t), top: fruitIcon(B.makes), ins: [item(B.makes)], out: { icon: mini('sprout'), name: `+${Math.round(B.cropBonus[0] * 100)} % ${W.yield ?? ''}` } };
  if (t === 'press') return { art: fieldArt(t), top: fruitIcon(B.makes), ins: [{ icon: `<span class="hsMulti">${(B.needsAny ?? []).map(k => fruitIcon(k)).join('')}</span>`, name: W.berries ?? '' }], out: { icon: fruitIcon(B.makes), name: W.xp ?? 'XP' } }; // 23.11.2026: juice is drunk right away = XP
  const ins = B.needs ? Object.keys(B.needs).map(k => item(k)) : (B.needsAny ?? []).slice(0, 2).map(k => item(k));
  return { art: fieldArt(t), top: fruitIcon(B.makes), ins, out: item(B.makes) };
}
// ---------------- hex card (24.11.2026, Basti Version 1): hex pokes out of the top of a dark card ----------------
const nfmt = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('de-DE');
const pct = (n: number) => nfmt(n * 100, 0) + ' %';
/** types whose tiles this type unlocks at its top level (processing chains: Weizen -> Mühle, Beeren -> Saftpresse, Mühle -> Bäckerei) */
function unlocksOf(t: FruitType, cfg: Balancing) {
  return Object.entries(cfg.chains ?? {}).filter(([k, c]) => c && (Array.isArray(c.from) ? c.from : [c.from]).includes(t) && cfg.buildings[k as FruitType]).map(([k]) => k as FruitType);
}
const BERRIES = ['blue', 'black', 'cran'];
/** the main effect of a tile: the weapon its crop feeds, or what the building gives */
function mainFx(t: FruitType, cfg: Balancing): { icon: string; title: string; text: string } | null {
  const N = cfg.names, W = cfg.werkstatt?.names ?? {}, S = N.skills as Record<string, string>, E = (N.effects ?? {}) as Record<string, string>, I = (N.items ?? {}) as Record<string, string>;
  if (BERRIES.includes(t)) return { icon: skillIcon('blue'), title: `${W.ammo ?? ''} ${S.blue}`.trim(), text: E[t] ?? '' };
  if (!isBuilding(t)) return S[t] ? { icon: skillIcon(t), title: S[t], text: E[t] ?? '' } : null;
  const B = cfg.buildings[t];
  if (B.cropBonus?.length) return { icon: mini('sprout'), title: W.crops ?? '', text: `+${pct(B.cropBonus[0])} ${W.chance ?? ''}` };
  const wp = ({ mill: 'flour', hens: 'sling', kitchen: 'pan' } as Record<string, string>)[t];
  if (wp) return { icon: skillIcon(wp), title: `${W.ammo ?? ''} ${S[wp]}`.trim(), text: E[wp] ?? '' };
  const it = (cfg.items as any)?.[B.makes] as { xp?: number; heal?: number } | undefined;
  const parts = [t === 'press' ? (W.juiceXp ?? '') : it?.xp ? `+${it.xp} XP` : '', it?.heal ? `+${it.heal} ${W.life ?? ''}` : ''].filter(Boolean);
  return { icon: fruitIcon(B.makes), title: I[B.makes] ?? '', text: parts.join(' · ') };
}
const stat = (icon: string, label: string, val: string, cls = '') => `<span class="hcSt ${cls}"><i>${icon}</i><span><small>${esc(label)}</small><b>${val}</b></span></span>`;
/** card body: 2x2 key numbers (+ unlock), the three levels, the main effect */
function hexBody(t: FruitType, cfg: Balancing) {
  const W = cfg.werkstatt?.names ?? {}, T = cfg.tiles, top = Math.max(1, T.maxLevel ?? 3), I = (cfg.names.items ?? {}) as Record<string, string>;
  const bld = isBuilding(t), B = bld ? cfg.buildings[t] : null;
  const st: string[] = []; let lvIcon: string, lvName: string, lv: (r: number) => number;
  if (!bld) {
    const P = cfg.plants[t] ?? { interval: 1 }, C = cfg.fields.cycle, n = C?.plants ?? 6;
    st.push(stat(mini('cd'), W.grow ?? '', nfmt(P.grow ?? C?.grow ?? P.interval) + ' s'), stat(mini('rake'), W.harvest ?? '', nfmt(n * (P.strokes ?? 1) * cfg.rake.cooldown) + ' s'), stat(fruitIcon(t), W.yield ?? '', String(n * (P.amount ?? 1))));
    lvIcon = mini('x2'); lvName = W.chance ?? ''; lv = r => tileContrib(cfg, r);
  } else {
    const B2 = B!;
    if (B2.needs) st.push(stat(fruitIcon(Object.keys(B2.needs)[0]), W.needs ?? '', Object.entries(B2.needs).map(([k, x]) => `${x} ${esc(I[k] ?? k)}`).join(' + ')));
    else if (B2.needsAny) st.push(stat(`<span class="hcMulti">${B2.needsAny.map(k => fruitIcon(k)).join('')}</span>`, W.needs ?? '', `${B2.count ?? 1} ${esc(W.berries ?? '')}`));
    st.push(stat(fruitIcon(B2.makes), W.makes ?? '', `${B2.amount ?? 1} ${esc(I[B2.makes] ?? '')}`), stat(mini('cd'), W.time ?? '', nfmt(B2.interval ?? B2.time ?? 1) + ' s'));
    if (B2.cropBonus?.length) { lvIcon = mini('sprout'); lvName = W.chance ?? ''; lv = r => B2.cropBonus![Math.min(r, B2.cropBonus!.length - 1)]; }
    else { lvIcon = mini('cd'); lvName = W.speed ?? ''; lv = r => tileContrib(cfg, r); }
  }
  const un = unlocksOf(t, cfg), F = cfg.names.fields as Record<string, string>;
  if (un.length) st.push(stat(`<span class="hcLk">${fieldArt(un[0])}<em>${mini('unlock')}</em></span>`, (W.fromLevel ?? '') + ' ' + top, esc(un.map(k => F[k] ?? k).join(', ')), 'un'));
  const lvs = Array.from({ length: top }, (_, r) => `<span class="hcLvC r${r}"><span class="b">${r + 1}</span><b>${pct(lv(r))}</b></span>`).join('<span class="hcAr">›</span>');
  const fx = mainFx(t, cfg);
  return `<span class="hcGrid">${st.join('')}</span>
    <span class="hcLv"><span class="hcLvH"><i>${lvIcon}</i>${esc(lvName)}</span><span class="hcLvR">${lvs}</span></span>
    ${fx ? `<span class="hcFx"><i>${fx.icon}</i><span><small>${esc(fx.title)}</small><b>${esc(fx.text)}</b></span></span>` : ''}`;
}
/** one level-up card: dark card, hex (art + product) poking out of the top, life badge on the hex; only the hex tilts */
export function hexEl(o: Offer, cfg: Balancing, i: number) {
  const h = hexInfo(o, cfg), b = document.createElement('button');
  const t = o.key.replace(/^(tile|start|tea)_/, '') as FruitType, tea = o.key.startsWith('tea_'), bld = !tea && isBuilding(t);
  b.className = 'hcard' + (tea ? ' tea' : bld ? ' bld' : ' crop'); b.dataset.key = o.key;
  b.style.setProperty('--d', (i * .09).toFixed(2) + 's');
  const hp0 = bld ? (cfg.buildings[t].hp ?? cfg.tiles.buildingHp) : cfg.fields.hp;
  let body: string;
  if (tea) { const T = cfg.upgrades.herbalTea; body = `<span class="hcFx"><i>${mini('heart')}</i><span><small>${esc(cfg.werkstatt?.names?.herbs ?? '')}</small><b>+${T.playerHeal} ${esc(cfg.werkstatt?.names?.life ?? '')} · +${T.fieldHeal} ${esc(cfg.werkstatt?.names?.fieldLife ?? '')}</b></span></span>`; }
  else body = hexBody(t, cfg);
  b.innerHTML = `<span class="hcTop"><span class="hex ${tea ? 'tea' : bld ? 'bld' : 'crop'}"><span class="hexRim"></span><span class="hexIn">
      <span class="hexTop">${h.top}</span><span class="hexArt">${h.art}</span></span><i class="shine"></i></span>
      ${tea ? '' : `<span class="hcHp"><i>${mini('heart')}</i>${nfmt(hp0, 0)}</span>`}</span>
    <span class="hcName">${esc(o.title)}</span>${body}`;
  tilt(b.querySelector('.hex') as HTMLElement);
  return b;
}

// ---------------- light bulbs next to the XP bar ----------------
export class Bulbs {
  private n = -1; private m = -1;
  /** renders count bulbs (at most max, then "×n"); new ones pop in, spent ones burst out */
  set(count: number, max: number) {
    const box = $('#ideas'); if (count === this.n && max === this.m) return;
    const prev = max === this.m ? this.n : -1; this.n = count; this.m = max;
    const shown = Math.min(count, max), had = box.querySelectorAll('.bl:not(.out)').length;
    if (prev < 0 || noMotion) { box.innerHTML = Array.from({ length: shown }, () => `<span class="bl">${bulb()}</span>`).join(''); }
    else if (shown > had) { for (let k = had; k < shown; k++) { const e = document.createElement('span'); e.className = 'bl new'; e.style.setProperty('--d', ((k - had) * .12).toFixed(2) + 's'); e.innerHTML = bulb(); box.appendChild(e); setTimeout(() => e.classList.remove('new'), 1400); } }
    else if (shown < had) { const live = [...box.querySelectorAll<HTMLElement>('.bl:not(.out)')]; for (const e of live.slice(shown)) { e.classList.add('out'); setTimeout(() => e.remove(), 450); } }
    let more = box.querySelector<HTMLElement>('.more');
    if (count > max) { if (!more) { more = document.createElement('b'); more.className = 'more'; box.appendChild(more); } more.textContent = '×' + count; box.appendChild(more); }
    else more?.remove();
    box.classList.toggle('none', count === 0);
  }
  /** bulb rects (rightmost first) for the flight into a bought card */
  rects(n: number) { return [...document.querySelectorAll<HTMLElement>('#ideas .bl:not(.out)')].reverse().slice(0, n).map(e => e.getBoundingClientRect()); }
  flash() { const b = $('#ideas'); b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); }
  reset() { this.n = -1; this.m = -1; $('#ideas').innerHTML = ''; }
}

// ---------------- workbench ----------------
/** frame colour per weapon (24.11.2026): the colour of its fruit / material */
const WCOL: Record<string, string> = { rake: '#b07a3e', blue: '#4a6cf0', black: '#8a4aa8', cran: '#e0305a', asp: '#6fbf3a', cab: '#86c83e', lemon: '#e8c020', chili: '#ff5a1a',
  wheat: '#d8a83a', flour: '#c8b898', pan: '#f09a3a', sling: '#e8c43a', well: '#4a9ad8' };
/** which weapon a card belongs to: combo/learn cards name it, upgrades carry it in their picture key */
function weaponKey(o: Offer) {
  if (o.key === 'gold_well') return 'well';
  if (o.wp) return o.wp;
  const m = /^skill_(\w+)/.exec(o.pic); return m ? m[1] : o.key.replace(/^x2_/, '').split('_')[0];
}
/** "a → b" becomes old value small, arrow, new value big */
/** 24.11.2026 (Basti): show only the change of a value ("−0,08 s"), not before → after. */
function change(html: string) {
  const num = (x: string) => parseFloat(x.replace(',', '.'));
  const dec = (x: string) => (x.split(/[.,]/)[1] ?? '').length;
  return html
    .replace(/(\d[\d.,]*)(°)?\s*→\s*(\d[\d.,]*|alle)(\s?(?:U\/s|cm|s|m|%|°))?/g, (_m, a: string, deg: string | undefined, b: string, u: string | undefined) => {
      if (b === 'alle') return '<b class="nv">alle</b>';
      const d = num(b) - num(a), unit = u ? (u.trim() === '°' ? '°' : ' ' + u.trim()) : deg ? '°' : '';
      return `<b class="nv">${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(Math.max(dec(a), dec(b))).replace('.', ',')}${unit}</b>`;
    })
    .replace(/\d[\d.,]*(?:\s?%)?\s*(<b class="gold">)/g, '$1');
}

export class WerkstattUI {
  private key = '';
  private cards: HTMLElement[] = [];
  onBuy: (i: number) => void = () => {};
  onClose: () => void = () => {};
  onDeny: () => void = () => {};
  open = false;
  constructor(private bulbs: Bulbs) {
    $('#shopGo').addEventListener('click', () => this.onClose());
  }
  /** show / update the bench of this pause; ideas = bulbs the player has */
  update(s: Snap, me: number, cfg: Balancing) {
    const pr = s.me[me], on = !!pr?.so && !!pr.sh && s.ph === 'play';
    if (on !== this.open) {
      this.open = on; const el = $('#shop'); el.hidden = !on; document.body.classList.toggle('shopOn', on);
      if (on) { this.key = ''; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
    }
    if (!on || !pr?.sh) return;
    const ideas = pr.id ?? 0, sh = pr.sh;
    const key = sh.map(o => o.key + (o.sold ? '!' : '')).join(',');
    if (key !== this.key) {
      const fresh = this.key.split(',').map(k => k.replace('!', '')).join(',') !== sh.map(o => o.key).join(',');
      this.key = key;
      if (fresh) this.build(sh, cfg);
      sh.forEach((o, i) => { const c = this.cards[i]; if (c && o.sold && !c.classList.contains('sold')) this.markSold(c, !fresh); });
    }
    sh.forEach((o, i) => { const c = this.cards[i]; if (c) c.classList.toggle('poor', !o.sold && ideas < (o.cost ?? 1)); });
    this.stock(s, me, cfg);
  }
  private build(sh: Offer[], cfg: Balancing) {
    const grid = $('#wsGrid'); grid.innerHTML = ''; this.cards = [];
    sh.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'wsCard' + (o.gold ? ' gold' : '') + (o.x2 ? ' x2' : '');
      b.style.setProperty('--rot', ((Math.sin(i * 12.9898 + o.key.length) * 43758.5453 % 1) * 2.4 - 1.2).toFixed(2) + 'deg');
      b.style.setProperty('--d', (i * .05).toFixed(2) + 's');
      // 24.11.2026 (Basti): every card framed in its weapon's colour; who (weapon) on top, what (upgrade) big, the change as old -> NEW
      const wk = weaponKey(o), col = WCOL[wk] ?? '#8a7a60', weap = o.key === 'gold_well' ? '' : (cfg.names.skills as Record<string, string>)[wk] ?? o.title;
      b.style.setProperty('--wc', col);
      const learn = o.key.startsWith('learn_') || o.key.startsWith('combo_');
      const art = o.key === 'gold_well' ? fieldArt('well') : pic(o.pic);
      const stamp = `<i class="stamp"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 21 l6 6 l11 -13" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></i>`;
      const hexT = (inner: string, badge = '') => `<span class="wsHexT"><span class="hex"><span class="hexRim"></span><span class="hexIn"><span class="hexArt">${inner}</span></span><i class="shine"></i></span>${badge}</span>`;
      // 24.11.2026 (Basti): same style as the level-up cards: dark card, hex (what gets better) poking out of the top, only the hex tilts
      if (learn || o.key === 'gold_well') {
        b.classList.add('big');
        b.innerHTML = `<span class="wsPaper">${hexT(art)}
            <span class="wsTag">${esc(o.hd ?? '')}</span>
            <span class="wsName">${esc(o.title)}</span>
            ${o.fx ? `<span class="wsFx">${esc(o.fx)}</span>` : ''}
            <span class="wsStats">${o.lines.slice(0, 6).map(l => `<span>${iconText(l)}</span>`).join('')}</span>
            ${stamp}
          </span>`;
      } else {
        // the stat's icon big in the hex (what gets better), the weapon as a badge on it, the value line below
        const lines = o.lines.slice(0, 2), m0 = /^\{(\w+)\}\s*/.exec(lines[0] ?? ''), big = m0?.[1];
        if (m0) lines[0] = lines[0].slice(m0[0].length);
        b.innerHTML = `<span class="wsPaper">${hexT(big ? mini(big) : pic(o.pic), big ? `<i class="wsWp">${pic(o.pic)}</i>` : '')}
            <span class="wsWho"><b>${esc(weap)}</b></span>
            <span class="wsHd">${esc(o.hd ?? '')}${o.x2 ? ' <em class="wsX2">×2</em>' : ''}</span>
            <span class="wsLines">${lines.map((l, k) => `<span class="${k ? 'sub' : 'main'}">${change(iconText(l))}</span>`).join('')}</span>
            ${stamp}
        </span>`;
      }
      b.insertAdjacentHTML('beforeend', `<span class="wsCost"><b>${o.cost ?? 1}</b>${bulb()}</span>`);
      b.addEventListener('click', () => {
        if (b.classList.contains('sold')) return;
        if (b.classList.contains('poor')) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); this.bulbs.flash(); this.onDeny(); return; }
        this.fly(b, o.cost ?? 1); this.onBuy(i);
      });
      tilt(b.querySelector('.wsHexT .hex') as HTMLElement);
      grid.appendChild(b); this.cards.push(b);
    });
    // decoration in the free corner of the board (24.11.2026 Händler): his brass hand bell and a stuffed coin purse
    const deco = document.createElement('div'); deco.className = 'wsDeco'; deco.setAttribute('aria-hidden', 'true');
    deco.innerHTML = `<svg viewBox="0 0 120 80"><g transform="rotate(-16 40 40)"><rect x="35" y="6" width="9" height="24" rx="3" fill="#6a4024" stroke="#2a1a0c" stroke-width="1.6"/><path d="M24 58c0-18 6-28 15.5-28S55 40 55 58z" fill="#d8a83a" stroke="#4a3008" stroke-width="2"/><path d="M30 44c2-6 5-9 9-10" stroke="#fff3b0" stroke-width="2.5" fill="none" stroke-linecap="round"/><rect x="20" y="56" width="39" height="6" rx="3" fill="#b8862a" stroke="#4a3008" stroke-width="1.6"/><circle cx="39.5" cy="66" r="4" fill="#5a4a2a" stroke="#2a1a0c" stroke-width="1.4"/></g><g transform="translate(66 30)"><path d="M6 40c-6-14 2-28 12-30l-4-6h20l-4 6c10 2 18 16 12 30z" fill="#8a5a34" stroke="#2a1a0c" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 10h20" stroke="#c8a060" stroke-width="3"/><circle cx="34" cy="41" r="5" fill="#e3b94a" stroke="#6a4a08" stroke-width="1.4"/><circle cx="43" cy="39" r="4.4" fill="#e3b94a" stroke="#6a4a08" stroke-width="1.4"/></g></svg>`;
    grid.appendChild(deco);
  }
  private markSold(c: HTMLElement, animate: boolean) {
    c.classList.add('sold');
    if (animate && !noMotion) { c.classList.add('buying'); setTimeout(() => c.classList.remove('buying'), 900); }
  }
  /** spent bulbs fly from the HUD into the card */
  private fly(card: HTMLElement, n: number) {
    if (noMotion) return;
    const to = card.querySelector('.wsCost')!.getBoundingClientRect();
    this.bulbs.rects(n).forEach((r, k) => {
      const e = document.createElement('div'); e.className = 'flyBulb'; e.innerHTML = bulb(); document.body.appendChild(e);
      const dx = to.left + to.width / 2 - (r.left + r.width / 2), dy = to.top + to.height / 2 - (r.top + r.height / 2);
      e.style.left = r.left + 'px'; e.style.top = r.top + 'px'; e.style.width = r.width + 'px'; e.style.height = r.height + 'px';
      e.animate([
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * .5}px,${dy * .5 - 60}px) scale(1.6)`, opacity: 1, offset: .45 },
        { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0 },
      ], { duration: 620, delay: k * 90, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' }).onfinish = () => e.remove();
    });
  }
  /** list on the right: fruit and goods in the chest */
  private stockKey = '#';
  private stock(s: Snap, me: number, cfg: Balancing) {
    const pr = s.me[me]; if (!pr) return;
    const have = new Map<string, number>();
    SKILLS.forEach((id, i) => { if (pr.am[i] > 0) { const t = AMMO_OF[id] ?? id; have.set(t, (have.get(t) ?? 0) + Math.floor(pr.am[i])); } });
    (pr.iv || []).forEach((n, i) => { if (n > 0) have.set(FRUITS[i], (have.get(FRUITS[i]) ?? 0) + n); });
    if (pr.nu) have.set('nut', Math.floor(pr.nu));
    const rows = [...have].sort((a, b) => FRUITS.indexOf(a[0] as FruitType) - FRUITS.indexOf(b[0] as FruitType));
    const key = rows.map(r => r.join(':')).join(','); if (key === this.stockKey) return; this.stockKey = key;
    const I = cfg.names.items ?? {};
    $('#wsList').innerHTML = `<h3>${esc(cfg.werkstatt?.names?.stock ?? '')}</h3>` + (rows.length ? rows.map(([t, n]) => `<div class="wsRow"><i>${fruitIcon(t)}</i><span>${esc((I as any)[t] ?? t)}</span><b>${n}</b></div>`).join('') : `<div class="wsEmpty">–</div>`);
  }
  reset() { this.open = false; this.key = ''; this.stockKey = '#'; $('#shop').hidden = true; document.body.classList.remove('shopOn'); }
}
