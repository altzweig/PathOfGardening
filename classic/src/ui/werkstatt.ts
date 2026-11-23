// Werkstatt (23.11.2026): ideas (light bulbs) next to the XP bar, hex fields on level-up, the workbench at the chest.
import { AMMO_OF, Balancing, FRUITS, FruitType, SKILLS, isBuilding } from '../config';
import type { Offer, Snap } from '../sim/snap';
import { bulb, fieldArt, fruitIcon, iconText, mini, pic, teaArt } from './icons';
import { tilt } from './hud';

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
  const ins = B.needs ? Object.keys(B.needs).map(k => item(k)) : (B.needsAny ?? []).slice(0, 2).map(k => item(k));
  return { art: fieldArt(t), top: fruitIcon(B.makes), ins, out: item(B.makes) };
}
/** one hex field button: big building/field, product floating above, input -> output underneath */
export function hexEl(o: Offer, cfg: Balancing, i: number) {
  const h = hexInfo(o, cfg), b = document.createElement('button');
  const t = o.key.replace(/^(tile|start|tea)_/, '');
  b.className = 'hex' + (o.key.startsWith('tea_') ? ' tea' : isBuilding(t as FruitType) ? ' bld' : ' crop'); b.dataset.key = o.key;
  b.style.setProperty('--d', (i * .09).toFixed(2) + 's');
  const side = (s: Side) => `<span class="hs"><i>${s.icon}</i><b>${esc(s.name)}</b></span>`;
  b.innerHTML = `<span class="hexRim"></span><span class="hexIn">
      <span class="hexTop">${h.top}</span>
      <span class="hexArt">${h.art}</span>
      <span class="hexName">${esc(o.title)}</span>
      ${h.fx ? `<span class="hexFx">${esc(h.fx)}</span>` : ''}
      <span class="hexFlow">${h.ins.map(side).join('<em>+</em>')}<svg class="hexArrow" viewBox="0 0 24 14"><path d="M1 7h18M14 1.8l7 5.2-7 5.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${side(h.out)}</span>
    </span><i class="shine"></i>`;
  tilt(b);
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
      const art = o.key === 'gold_well' ? fieldArt('well') : pic(o.pic);
      b.innerHTML = `<span class="wsPaper"><i class="pin"></i>
          <span class="wsHd">${esc(o.hd ?? '')}</span>
          <span class="wsPic">${art}${o.x2 ? '<em class="wsX2">×2</em>' : ''}</span>
          <span class="wsName">${esc(o.title)}</span>
          <span class="wsLines">${o.lines.slice(0, 2).map(l => `<span>${iconText(l)}</span>`).join('')}</span>
          <i class="shine"></i><i class="stamp"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12 21 l6 6 l11 -13" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg></i>
        </span>
        <span class="wsCost"><b>${o.cost ?? 1}</b>${bulb()}</span>`;
      b.addEventListener('click', () => {
        if (b.classList.contains('sold')) return;
        if (b.classList.contains('poor')) { b.classList.remove('nope'); void b.offsetWidth; b.classList.add('nope'); this.bulbs.flash(); this.onDeny(); return; }
        this.fly(b, o.cost ?? 1); this.onBuy(i);
      });
      if (!o.gold) tilt(b);
      grid.appendChild(b); this.cards.push(b);
    });
    // decoration in the free corner of the bench: hammer, pencil and a few nails
    const deco = document.createElement('div'); deco.className = 'wsDeco'; deco.setAttribute('aria-hidden', 'true');
    deco.innerHTML = `<svg viewBox="0 0 120 70"><g transform="rotate(-18 60 35)"><rect x="18" y="31" width="70" height="7" rx="3" fill="#8a5a32" stroke="#2a1a0c" stroke-width="1.6"/><rect x="80" y="20" width="16" height="29" rx="3" fill="#7b8189" stroke="#1a1c20" stroke-width="1.6"/><path d="M96 22 q10 4 12 12" stroke="#7b8189" stroke-width="5" fill="none" stroke-linecap="round"/></g><g transform="rotate(12 60 55)"><rect x="20" y="52" width="58" height="5" rx="1" fill="#e8b840" stroke="#2a1a0c" stroke-width="1.2"/><path d="M78 52 l9 2.5 l-9 2.5z" fill="#f0d8a8" stroke="#2a1a0c" stroke-width="1"/><path d="M85 54.5 l2 0" stroke="#222" stroke-width="1.6"/><rect x="17" y="52" width="5" height="5" fill="#e88a9a" stroke="#2a1a0c" stroke-width="1"/></g><g fill="#9aa0a6" stroke="#2a2c30" stroke-width=".8"><path d="M14 12 l3 10 l1.4 -.4 l-2 -10z"/><circle cx="15" cy="11.5" r="2.2"/><path d="M30 8 l-1 10 l1.4 .2 l1 -10z"/><circle cx="30.4" cy="7.6" r="2"/></g></svg>`;
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
