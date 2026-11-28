// Tutorial (24.11.2026 Basti, PC; 26.11.2026 Werkbank-Techtree start for PC and touch, see updateResearch). One thing at a time:
//  start: HP orb (arrow left) -> shield -> XP orb (arrow right) -> stamina / sprint -> [Space] harvest -> [left click] attack (once the shotgun has ammo)
//  first level-up: new field next to / onto a field -> higher levels unlock buildings -> neighbours of the same kind boost each other -> weapons of the offered fields at the merchant
//  2nd weapon: [Q] or its number key.
// Explanations go on with a click (after at least 1 s) or the right key, prompts with the right key. "Tutorial überspringen" (top right) switches it off
// in the options, where it can be switched on again. Texts in balancing.yaml (tutorial).
import { BERRIES, SKILLS, COMBOS, FRUITS, type Balancing, type SkillId } from '../config';
import type { GameView } from '../view/view';
import type { Snap } from '../sim/snap';
import type { Input } from '../input/input';
import { keyLabel, keys as KB, SLOT_ACTS } from '../input/keys';
import { bulb, fieldArt, fruitIcon, mini, mushIcon, skillIcon } from './icons';

const ART: Record<string, [string, string]> = { m: ['zum', 'den'], f: ['zur', 'die'], n: ['zum', 'das'], p: ['zu den', 'die'] };
const LS = 'pog-classic.tutorial';
let ON = (() => { try { return localStorage.getItem(LS) !== '0'; } catch { return true; } })();
export function tutorialOn() { return ON; }
export function setTutorialOn(on: boolean) { ON = on; try { localStorage.setItem(LS, on ? '1' : '0'); } catch { /* no storage */ } }

type Where = 'hp' | 'xp' | 'mid' | 'top';
type RStep = 'field' | 'harvest' | 'shoot' | 'benchCard' | 'bench' | 'choose' | 'work' | 'pickup' | 'soilCard' | 'shroom' | 'tree' | 'done';
const RORDER: RStep[] = ['field', 'harvest', 'shoot', 'benchCard', 'bench', 'choose', 'work', 'pickup', 'soilCard', 'shroom', 'tree', 'done'];
/** what the tutorial shows besides the text: at = arrow onto this world point (high: above a building, foe: red), walk = where to walk, hi = highlighted HUD part */
interface Vis { at?: { x: number; z: number } | null; high?: boolean; foe?: boolean; walk?: { x: number; z: number } | null; hi?: 'harvest' | 'shoot' | 'bulb' | null }
const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const ARR = '<b class="tutFA"><svg viewBox="0 0 24 24"><path d="M4 12h13M12 5l7 7-7 7" fill="none" stroke="#e3b964" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></b>';
const step = (ico: string, cap?: string) => `<div class="tutFS"><div class="tutFI">${ico}</div>${cap ? `<small>${esc(cap)}</small>` : ''}</div>`;
const HAMMER = '<svg viewBox="0 0 40 40"><g transform="rotate(-35 20 20)"><rect x="18" y="13" width="4.4" height="25" rx="1.6" fill="#c08a4e" stroke="#4a2e12" stroke-width="1.4"/><rect x="8" y="5" width="24" height="10" rx="2.4" fill="#9aa4ae" stroke="#2c3238" stroke-width="1.6"/><path d="M10 8h20" stroke="#d6dde3" stroke-width="1.6"/></g></svg>';
const BENCH = '<svg viewBox="0 0 40 40"><rect x="4" y="16" width="32" height="5" rx="1" fill="#b07a44" stroke="#4a2e12" stroke-width="1.5"/><path d="M8 21v14M32 21v14M8 30h24" stroke="#7a4f26" stroke-width="3" stroke-linecap="round"/><rect x="12" y="5" width="12" height="11" rx="1" fill="#efe3c8" stroke="#6a5530" stroke-width="1.3"/><path d="M15 9h6M15 12h4" stroke="#8a7650" stroke-width="1.2"/><rect x="27" y="11" width="6" height="5" rx="1" fill="#9aa4ae" stroke="#2c3238" stroke-width="1.2"/></svg>';
const MOUSE = '<svg viewBox="0 0 20 28"><rect x="1.5" y="1.5" width="17" height="25" rx="8.5" fill="#0d1217" stroke="#c8ccd2" stroke-width="1.6"/><path d="M10 1.5v10M1.5 11.5h17" stroke="#c8ccd2" stroke-width="1.4"/><path class="tutMB" d="M9.2 2.4A8 8 0 0 0 2.4 10.7H9.2Z" fill="#e8b840"/></svg>';
const POINT = '<svg viewBox="0 0 40 52"><path d="M12 2h16v24h10L20 50 2 26h10z" fill="#ffd76a" stroke="#3a2608" stroke-width="2.6" stroke-linejoin="round"/></svg>';
const DIRA = '<svg viewBox="0 0 48 32"><path d="M2 10h26V2l18 14-18 14v-8H2z" fill="#ffd76a" stroke="#3a2608" stroke-width="2.4" stroke-linejoin="round"/></svg>';
interface Card { html: string; where: Where; key?: 'sprint' }

export class Tutorial {
  /** solo: the game stands still while an explanation is shown */
  pause = false;
  onSkip: () => void = () => {};
  private el: HTMLElement; private catcher: HTMLElement; private skip: HTMLElement;
  private active = false;
  private cards: Card[] = []; private cardT0 = 0; private cardShown = '';
  private startDone = false; private lvDone = false; private swDone = false;
  private step: 'harvest' | 'attack' | 'done' = 'harvest';
  private armed = false; private base = { harvest: 0, prim: 0, sec: 0, nextP: 0, sprint: 0, pick: [] as number[] };
  private second: { slot: number } | null = null; private txt = '';
  private pt: HTMLElement; private dir: HTMLElement; private stick: HTMLElement; private keysEl: HTMLElement; private moveEl = document.getElementById('moveStick')!;
  private meId = 0;
  constructor(private input: Input, private view: GameView) {
    this.catcher = document.createElement('div'); this.catcher.id = 'tutCatch'; document.body.appendChild(this.catcher);
    this.el = document.createElement('div'); this.el.id = 'tut'; document.body.appendChild(this.el);
    this.skip = document.createElement('button'); this.skip.id = 'tutSkip'; this.skip.className = 'ibtn'; this.skip.textContent = 'Tutorial überspringen'; this.skip.hidden = true;
    document.getElementById('pauseBtn')!.before(this.skip);
    this.skip.addEventListener('click', () => { setTutorialOn(false); this.stop(); this.onSkip(); });
    const mk = (id: string, html: string) => { const d = document.createElement('div'); d.id = id; d.innerHTML = html; document.body.appendChild(d); return d; };
    this.pt = mk('tutPt', POINT); this.dir = mk('tutDir', DIRA);
    this.stick = mk('tutStick', '<div class="knob"></div><i class="tutChev"><svg viewBox="0 0 20 20"><path d="M6 3l8 7-8 7" fill="none" stroke="#ffd76a" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></i><i class="tutFinger"></i>');
    this.keysEl = mk('tutKeys', [KB.up, KB.left, KB.down, KB.right].map(k => `<kbd>${esc(keyLabel(k))}</kbd>`).join(''));
    // Weiter (28.11.2026): skips the current step; pointerdown so a touch never reaches the game
    this.el.addEventListener('pointerdown', e => { if (!(e.target as HTMLElement).closest('.tutNext')) return; e.preventDefault(); e.stopPropagation(); this.skipStep(); });
    this.catcher.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (performance.now() - this.cardT0 >= 1000) this.next(); });
  }
  /** new game: starts from the beginning if switched on in the options */
  reset() {
    this.active = tutorialOn(); this.cards = []; this.cardShown = ''; this.txt = '';
    this.startDone = this.lvDone = this.swDone = false; this.step = 'harvest'; this.armed = false; this.second = null;
    this.rs = 'field'; this.rsAm = -1; this.rsDone0 = -1; this.rsT0 = performance.now(); this.rsSm = -1; this.holdWave = false; this.vis(null);
    this.rebase(); this.render(null, '');
  }
  stop() { this.active = false; this.cards = []; this.holdWave = false; this.vis(null); this.render(null, ''); }
  private lastCfg: Balancing | null = null;
  private rsMode() { return !!this.view.snap?.rs && !!this.lastCfg?.research; }
  private rebase() { const u = this.input.used; this.base = { harvest: u.harvest, prim: u.prim, sec: u.sec, nextP: u.nextP, sprint: u.sprint, pick: [...u.pick] }; }
  private next() { this.cards.shift(); this.cardShown = ''; this.rebase(); }

  hide() { this.vis(null); this.render(null, ''); }
  update(s: Snap, me: number, cfg: Balancing, lvOffers: string[] | null, menu = false) {
    const T = cfg.tutorial, pr: any = s.me[me]; this.lastCfg = cfg;
    if (this.active && !ON) this.stop(); // switched off in the pause menu
    const rsm = !!s.rs && !!cfg.research, touch = this.input.isTouch;
    this.meId = me; this.holdWave = this.active && rsm && (this.rs === 'field' || this.rs === 'harvest') && !this.cards.length;
    if (!this.active || !T || !pr || (touch && !rsm) || menu || s.ph === 'over') { this.vis(null); this.render(null, ''); return; }
    const u = this.input.used, b = this.base, ps = s.pl.find(p => p.id === me) as any;
    if (rsm) { this.updateResearch(s, pr, ps, cfg, touch); return; }
    this.vis(null);
    // --- queue explanation cards ---
    if (!this.startDone && s.ph === 'play' && !this.cards.length) {
      this.startDone = true;
      this.cards.push({ html: fmt(T.hp), where: 'hp' });
      if (ps?.ms || cfg.player.shield) this.cards.push({ html: fmt(T.shield), where: 'hp' });
      this.cards.push({ html: fmt(T.xp), where: 'xp' });
      if (ps?.sa !== undefined || cfg.player.sprint) this.cards.push({ html: fmt(T.stamina), where: 'xp', key: 'sprint' });
    }
    if (!this.lvDone && s.ph === 'lvl' && lvOffers && !lvOffers.some(k => k.startsWith('start_')) && lvOffers.some(k => k.startsWith('tile_'))) {
      this.lvDone = true;
      this.cards.push({ html: fmt(T.lvNew), where: 'top' }, { html: fmt(T.lvBuild), where: 'top' }, { html: fmt(T.lvNeighbour), where: 'top' });
      const rows = lvOffers.filter(k => k.startsWith('tile_')).map(k => k.slice(5)).flatMap(t => {
        const w = (Object.keys(cfg.weaponNeeds ?? {}) as SkillId[]).find(id => cfg.weaponNeeds![id] === t);
        if (!w) return [];
        const [, den] = ART[T.genus?.[w] ?? 'f'];
        return [`<div class="tutRow"><i>${fieldArt(t)}</i>${fmt(T.lvWeapon, { field: (cfg.names.fields as any)[t] ?? t, weapon: cfg.names.skills[w] ?? w, den })}<i>${skillIcon(w)}</i></div>`];
      });
      if (rows.length) this.cards.push({ html: rows.join(''), where: 'top' });
    }
    // --- explanation card on screen: click (>= 1 s) or its key goes on ---
    const c = this.cards[0];
    if (c) {
      if (c.key === 'sprint' && u.sprint > b.sprint) { this.next(); return; }
      if (s.ph === 'lvl' && c.where !== 'top') { this.render(null, ''); return; } // start cards wait while a level-up is open
      this.render(c, c.html); return;
    }
    if (s.ph !== 'play') { this.render(null, ''); return; }
    // --- prompts: done with the right key ---
    if (this.step === 'harvest') { if (u.harvest > b.harvest) { this.step = 'attack'; this.rebase(); } else { this.prompt(fmt(T.harvest)); return; } }
    if (this.step === 'attack') {
      const co = pr.co[SKILLS.indexOf('blue')], has = BERRIES.some(k => pr.am[SKILLS.indexOf(k)] >= co);
      if (!this.armed) { if (!has) { this.prompt(''); this.checkEnd(); return; } this.armed = true; this.rebase(); } // clicks before the hint do not count
      if (u.prim > b.prim) { this.step = 'done'; this.rebase(); } else { this.prompt(fmt(T.attack)); return; }
    }
    if (!this.swDone) {
      const gs: number[] = pr.gs ?? [], bl = gs.indexOf(SKILLS.indexOf('blue'));
      if (!this.second) {
        const k = gs.findIndex((x, j) => x >= 0 && j !== bl);
        if (k < 0) { this.prompt(''); this.checkEnd(); return; }
        this.second = { slot: k }; this.rebase();
      }
      const { slot } = this.second, si = gs[slot];
      if (si === undefined || si < 0) { this.second = null; this.prompt(''); return; }
      const cb = pr.cb?.[si] ?? -1, id = cb >= 0 ? COMBOS[cb] : SKILLS[si];
      const name = (cb >= 0 ? cfg.names.combos?.[id as never] : cfg.names.skills[id as never]) ?? id;
      const [zum, den] = ART[T.genus?.[id] ?? 'f'];
      const v = { weapon: name, zum, den, slot: keyLabel(KB[SLOT_ACTS[slot]]) };
      const done = slot < 5 ? u.nextP > b.nextP || u.pick[slot] > b.pick[slot] : u.sec > b.sec || u.pick[slot] > b.pick[slot];
      if (done) { this.swDone = true; this.prompt(''); }
      else { this.prompt(fmt(slot < 5 ? T.switch : T.secondary, v)); return; }
    }
    this.checkEnd();
  }
  // ---- 28.11.2026 (Basti) Werkbank-Techtree start, show don't tell, PC and touch alike. Every step has a "Weiter" button that skips it.
  //  field: arrow bouncing down onto the pea field, then a ghost move stick (touch) / W A S D caps (PC) tilting towards it + arrow at the player
  //  harvest: harvest button (touch) / key cap filling up (PC) highlighted, the rest of the HUD greyed out, "Halten zum Ernten"
  //  shoot: the same with the pea pistol (touch button / left click), arrow on the nearest animal
  //  benchCard: card Werkbank (idea -> hold -> new field + weapon) -> bench (arrow) -> choose (bulb) -> work (hold) -> pickup (arrow)
  //  soilCard: card mushrooms -> Kompostierer -> Dünger -> new tree, + yield -> shroom (arrow on the nearest wild mushroom, if one is up) -> tree (bulb button)
  private rs: RStep = 'field';
  private rsAm = -1; private rsDone0 = -1; private rsT0 = 0; private rsSm = -1;
  /** solo: the countdown to wave 1 waits while the player walks to the field and harvests */
  holdWave = false;
  private go(st: RStep) { this.rs = st; this.rsT0 = performance.now(); this.rebase(); }
  /** Weiter: skips the current step */
  private skipStep() {
    if (this.cards.length) { this.next(); return; }
    const i = RORDER.indexOf(this.rs); this.go(RORDER[Math.min(RORDER.length - 1, i + 1)]);
  }
  private updateResearch(s: Snap, pr: any, ps: any, cfg: Balancing, touch: boolean) {
    const T = cfg.tutorial! as any, tx = (k: string) => esc((touch ? T[k + 'Touch'] : undefined) ?? T[k] ?? '');
    this.startDone = this.lvDone = true;
    const c = this.cards[0];
    if (c) { if (s.ph !== 'play') { this.vis(null); this.render(null, ''); return; } this.vis(null); this.render(c, c.html); return; }
    if (s.ph !== 'play' || !ps?.al) { this.vis(null); this.render(null, ''); return; }
    const pi = SKILLS.indexOf('pea'), am = pr.am?.[pi] ?? 0, cost = pr.co?.[pi] ?? 3, rs = s.rs!, ro = pr.ro ?? 0, nd = (s.rd ?? []).reduce((a: number, x: number) => a + x, 0);
    if (this.rsDone0 < 0) { this.rsDone0 = nd; this.rsT0 = performance.now(); }
    if (this.rsAm < 0) this.rsAm = am;
    const ideaDone = nd > this.rsDone0, el = (performance.now() - this.rsT0) / 1000;
    const pea = s.fi.find(f => FRUITS[f[1]] === 'pea'), fXZ = pea ? this.view.slotXZ(pea[0]) : null, bXZ = s.bn !== undefined && s.bn >= 0 ? this.view.slotXZ(s.bn) : null;
    const H = cfg.arena.fieldSize / 2, near = (p: { x: number; z: number } | null, r: number) => !!p && Math.hypot(ps.x - p.x, ps.z - p.z) < r;
    if (ideaDone && RORDER.indexOf(this.rs) < RORDER.indexOf('soilCard')) this.go('soilCard');
    this.holdWave = this.rs === 'field' || this.rs === 'harvest';
    // --- the steps ---
    if (this.rs === 'field') {
      if (am > this.rsAm || near(fXZ, H + .7)) this.go('harvest');
      else { this.rsAm = Math.min(this.rsAm, am); return this.show({ at: fXZ, walk: el > 1.2 ? fXZ : null }, ''); }
    }
    if (this.rs === 'harvest') {
      if (am > this.rsAm) { this.go('shoot'); this.rsAm = am; }
      else { this.rsAm = Math.min(this.rsAm, am); const far = !near(fXZ, H + 1.6); return this.show({ at: fXZ, walk: far ? fXZ : null, hi: far ? null : 'harvest' }, far ? '' : this.holdTxt(tx('rsHold'), touch)); }
    }
    if (this.rs === 'shoot') {
      if (am < this.rsAm - cost + .5) this.go('benchCard');
      else {
        this.rsAm = Math.max(this.rsAm, am);
        if (am < cost) return this.show({ at: fXZ, walk: near(fXZ, H + 1.6) ? null : fXZ, hi: 'harvest' }, this.holdTxt(tx('rsHold'), touch));
        let en: { x: number; z: number } | null = null, bd = 1e9;
        for (const e of s.en) { const d = Math.hypot(e[2] - ps.x, e[3] - ps.z); if (d < bd) { bd = d; en = { x: e[2], z: e[3] }; } }
        return this.show({ at: en, foe: true, hi: 'shoot' }, touch ? `<b>${tx('rsTap')}</b>` : `<i class="tutMouse">${MOUSE}</i><b>${tx('rsTap')}</b>`);
      }
    }
    if (this.rs === 'benchCard') { this.cards.push({ html: this.benchCard(cfg, touch), where: 'mid' }); this.go('bench'); this.vis(null); return; }
    if (this.rs === 'bench') {
      if (ro > 0 || rs[0] >= 0) this.go('choose');
      else return this.show({ at: bXZ, walk: near(bXZ, 2.6) ? null : bXZ, high: true }, '');
    }
    if (this.rs === 'choose') {
      if (rs[0] >= 0) this.go('work');
      else return this.show({ hi: ro ? null : 'bulb' }, ro ? '' : `<i class="tutIco">${bulb()}</i><b>${tx('rsChoose')}</b>`);
    }
    if (this.rs === 'work') {
      if (rs[1]) this.go('pickup');
      else { const far = !near(bXZ, 2.6); return this.show({ at: bXZ, walk: far ? bXZ : null, high: true, hi: far || ps.bw ? null : 'harvest' }, far || ps.bw ? '' : this.holdTxt(tx('rsWork'), touch)); }
    }
    if (this.rs === 'pickup') return this.show({ at: ro === 2 || rs[0] < 0 ? null : bXZ, walk: ro === 2 || near(bXZ, 2.6) ? null : bXZ, high: true }, '');
    if (this.rs === 'soilCard') { this.cards.push({ html: this.soilCard(cfg, touch), where: 'mid' }); this.go('shroom'); this.vis(null); return; }
    if (this.rs === 'shroom') {
      const tot = (s.sm ?? []).reduce((a, x) => a + x, 0);
      if (this.rsSm < 0) this.rsSm = tot;
      let m: { x: number; z: number } | null = null, bd = 1e9;
      for (const r of s.sh ?? []) { if (r[5] === 1) continue; const d = Math.hypot(r[2] - ps.x, r[3] - ps.z); if (d < bd) { bd = d; m = { x: r[2], z: r[3] }; } }
      if (tot > this.rsSm || !m) this.go('tree');
      else { const far = bd > (cfg.mushrooms?.reach ?? 1.8); return this.show({ at: m, walk: far ? m : null, hi: far ? null : 'harvest' }, far ? '' : this.holdTxt(tx('rsShroom'), touch)); }
    }
    if (this.rs === 'tree') {
      if (ro > 0 || el > 8) this.go('done');
      else return this.show({ hi: 'bulb' }, `<i class="tutIco">${bulb()}</i><b>${tx('rsTree')}</b>`);
    }
    this.vis(null); this.swDone = true; this.step = 'done';
    this.prompt(''); this.checkEnd();
  }
  /** "Halten zum …": PC with the harvest key cap filling up, touch: the highlighted button says it */
  private holdTxt(t: string, touch: boolean) { return touch ? `<b>${t}</b>` : `<kbd class="tutHoldK">${esc(keyLabel(KB.harvest))}</kbd><b>${t}</b>`; }
  private benchCard(cfg: Balancing, touch: boolean) {
    const C = (cfg.tutorial as any)?.cards?.bench ?? {}, hold = touch ? `<i class="tutBtnG">${skillIcon('rake')}</i>` : `<kbd class="tutHoldK">${esc(keyLabel(KB.harvest))}</kbd>`;
    return `<div class="tutT">${esc(C.title ?? 'Werkbank')}</div><div class="tutFlow">` +
      step(`<i>${BENCH}</i>`, '') + ARR + step(`<i>${bulb()}</i>`, C.idea) + ARR + step(`<span class="tutPair"><i>${HAMMER}</i>${hold}</span>`, C.hold) + ARR +
      step(`<span class="tutPair"><i>${fieldArt('wheat')}</i><i>${skillIcon('wshot')}</i></span>`, C.get) + '</div>';
  }
  private soilCard(cfg: Balancing, touch: boolean) {
    const C = (cfg.tutorial as any)?.cards?.soil ?? {}, hold = touch ? `<i class="tutBtnG">${skillIcon('rake')}</i>` : `<kbd class="tutHoldK">${esc(keyLabel(KB.harvest))}</kbd>`;
    return `<div class="tutT">${esc(C.title ?? 'Pilze & Dünger')}</div><div class="tutFlow">` +
      step(`<span class="tutPair"><i>${mushIcon('champ')}</i><i>${mushIcon('stein')}</i><i>${mushIcon('pfiff')}</i></span>`, '') + ARR + step(hold, C.pick) + ARR +
      step(`<i>${fruitIcon('compost')}</i>`, C.compost) + ARR + step(`<i>${mini('fert')}</i>`, C.fert) + ARR +
      step(`<span class="tutPair"><i>${fieldArt('cab')}</i><i>${fieldArt('chili')}</i></span>`, C.tree) + '</div>';
  }
  // ---- overlays: arrow on a world point, arrow at the player towards where to walk, move stick / W A S D demo, highlighted HUD part ----
  private show(o: Vis, html: string) { this.vis(o); this.prompt(html); }
  private hiEl: HTMLElement | null = null;
  private vis(o: Vis | null) {
    const v = this.view, s = v.snap, me = s?.pl.find(p => p.id === this.meId);
    // arrow bouncing down onto the target
    const at = o?.at ? v.worldScreen(o.at.x, o.high ? 1.9 : .4, o.at.z) : null;
    this.pt.classList.toggle('on', !!at); this.pt.classList.toggle('foe', !!o?.foe);
    if (at) { this.pt.style.left = at.x + 'px'; this.pt.style.top = at.y + 'px'; }
    // where to walk: arrow next to the player + ghost stick / keys tilting that way
    let ang: number | null = null, ft: { x: number; y: number } | null = null;
    if (o?.walk && me) {
      ft = v.worldScreen(me.x, .15, me.z); const tg = v.worldScreen(o.walk.x, .15, o.walk.z);
      if (ft && tg && Math.hypot(tg.x - ft.x, tg.y - ft.y) > 40) ang = Math.atan2(tg.y - ft.y, tg.x - ft.x);
    }
    this.dir.classList.toggle('on', ang !== null);
    if (ang !== null && ft) { this.dir.style.left = (ft.x + Math.cos(ang) * 62) + 'px'; this.dir.style.top = (ft.y + Math.sin(ang) * 62) + 'px'; this.dir.style.transform = `translate(-50%,-50%) rotate(${ang}rad)`; }
    const touch = this.input.isTouch, stickOn = ang !== null && touch && this.moveEl.style.display !== 'block';
    this.stick.classList.toggle('on', stickOn); this.keysEl.classList.toggle('on', ang !== null && !touch);
    if (ang !== null) {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      this.stick.style.setProperty('--dx', (dx * 34).toFixed(1) + 'px'); this.stick.style.setProperty('--dy', (dy * 34).toFixed(1) + 'px');
      (this.stick.querySelector('.tutChev') as HTMLElement).style.transform = `rotate(${ang}rad)`;
      const k = this.keysEl.children; // W A S D
      (k[0] as HTMLElement).classList.toggle('p', dy < -.38); (k[1] as HTMLElement).classList.toggle('p', dx < -.38);
      (k[2] as HTMLElement).classList.toggle('p', dy > .38); (k[3] as HTMLElement).classList.toggle('p', dx > .38);
    }
    // highlighted HUD part, everything else greyed out
    let hi: HTMLElement | null = null;
    if (o?.hi === 'harvest' && touch) hi = document.querySelector<HTMLElement>('.skill[data-skill=rake]');
    if (o?.hi === 'shoot') hi = touch ? document.querySelector<HTMLElement>('.skill[data-skill=pea]') : this.peaSlot();
    if (o?.hi === 'bulb') hi = document.getElementById('rsBtn');
    if (hi?.hidden) hi = null;
    if (hi !== this.hiEl) { this.hiEl?.classList.remove('tutHi', 'tutHoldB'); this.hiEl = hi; hi?.classList.add('tutHi'); }
    hi?.classList.toggle('tutHoldB', o?.hi === 'harvest');
    document.body.classList.toggle('tutFocus', !!o?.hi);
    // touch: "Halten zum Ernten" / "Tippen zum Schießen" right next to the highlighted button
    const nb = !!hi && touch && (o?.hi === 'harvest' || o?.hi === 'shoot');
    this.el.classList.toggle('nearBtn', nb);
    if (nb) { const r = hi!.getBoundingClientRect(); this.el.style.setProperty('--nr', (innerWidth - r.left + 16) + 'px'); this.el.style.setProperty('--nt', (r.top + r.height / 2) + 'px'); }
  }
  private peaSlot() {
    const pr: any = this.view.snap?.me[this.meId], k = (pr?.gs ?? []).indexOf(SKILLS.indexOf('pea'));
    return k >= 0 ? document.querySelectorAll<HTMLElement>('#wbar .ws')[k] ?? null : null;
  }
  /** everything shown once: the tutorial switches itself off (on again in the options) */
  private checkEnd() { if (this.startDone && this.lvDone && this.swDone && this.step === 'done' && !this.cards.length) { setTutorialOn(false); this.stop(); } }
  private prompt(html: string) { this.render(null, html); }
  private render(card: Card | null, html: string) {
    this.pause = !!card && this.active;
    this.catcher.classList.toggle('on', !!card);
    this.skip.hidden = !this.active;
    const nx = this.active && this.rsMode() ? `<button class="tutNext">${esc((this.lastCfg?.tutorial as any)?.next ?? 'Weiter')}<svg viewBox="0 0 20 20"><path d="M7 4l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>` : '';
    if (nx && !card) html = (html ? `<span class="tutTx">${html}</span>` : '') + nx; else if (nx) html += `<div class="tutNx">${nx}</div>`;
    const key = (card ? card.where + ':' : 'p:') + html;
    if (card && key !== this.cardShown) { this.cardShown = key; this.cardT0 = performance.now(); }
    if (key === this.txt) return; this.txt = key;
    if (!html) { this.el.classList.remove('on'); return; }
    this.el.classList.remove('on', 'hp', 'xp', 'mid', 'top', 'card', 'rsm'); void this.el.offsetWidth; this.el.classList.toggle('rsm', !!nx);
    this.el.innerHTML = html + (card && !nx ? '<b class="tutGo"></b>' : '') + (card && (card.where === 'hp' || card.where === 'xp') ? '<i class="tutArr"><svg viewBox="0 0 30 34"><path d="M0 17L30 0V34Z" fill="#e3b964"/></svg></i>' : '');
    this.el.classList.add('on', card ? card.where : 'mid'); if (card) this.el.classList.add('card');
  }
}

/** {x} placeholders (keys from the current binding), [x] drawn as a key cap, <-  -> as arrows */
function fmt(t: string, v: Record<string, string> = {}) {
  const all: Record<string, string> = { harvest: keyLabel(KB.harvest), sprint: keyLabel(KB.sprint), prim: 'Linksklick', sec: 'Rechtsklick', next: keyLabel(KB.nextP), tree: keyLabel(KB.tree), ...v };
  const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return esc(t.replace(/\{(\w+)\}/g, (_, k) => all[k] ?? '')).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
}
