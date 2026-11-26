// Tutorial (24.11.2026 Basti, PC; 26.11.2026 Werkbank-Techtree start for PC and touch, see updateResearch). One thing at a time:
//  start: HP orb (arrow left) -> shield -> XP orb (arrow right) -> stamina / sprint -> [Space] harvest -> [left click] attack (once the shotgun has ammo)
//  first level-up: new field next to / onto a field -> higher levels unlock buildings -> neighbours of the same kind boost each other -> weapons of the offered fields at the merchant
//  2nd weapon: [Q] or its number key.
// Explanations go on with a click (after at least 1 s) or the right key, prompts with the right key. "Tutorial überspringen" (top right) switches it off
// in the options, where it can be switched on again. Texts in balancing.yaml (tutorial).
import { BERRIES, SKILLS, COMBOS, type Balancing, type SkillId } from '../config';
import type { Snap } from '../sim/snap';
import type { Input } from '../input/input';
import { keyLabel, keys as KB, SLOT_ACTS } from '../input/keys';
import { fieldArt, skillIcon } from './icons';

const ART: Record<string, [string, string]> = { m: ['zum', 'den'], f: ['zur', 'die'], n: ['zum', 'das'], p: ['zu den', 'die'] };
const LS = 'pog-classic.tutorial';
let ON = (() => { try { return localStorage.getItem(LS) !== '0'; } catch { return true; } })();
export function tutorialOn() { return ON; }
export function setTutorialOn(on: boolean) { ON = on; try { localStorage.setItem(LS, on ? '1' : '0'); } catch { /* no storage */ } }

type Where = 'hp' | 'xp' | 'mid' | 'top';
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
  constructor(private input: Input) {
    this.catcher = document.createElement('div'); this.catcher.id = 'tutCatch'; document.body.appendChild(this.catcher);
    this.el = document.createElement('div'); this.el.id = 'tut'; document.body.appendChild(this.el);
    this.skip = document.createElement('button'); this.skip.id = 'tutSkip'; this.skip.className = 'ibtn'; this.skip.textContent = 'Tutorial überspringen'; this.skip.hidden = true;
    document.getElementById('pauseBtn')!.before(this.skip);
    this.skip.addEventListener('click', () => { setTutorialOn(false); this.stop(); this.onSkip(); });
    this.catcher.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (performance.now() - this.cardT0 >= 1000) this.next(); });
  }
  /** new game: starts from the beginning if switched on in the options */
  reset() {
    this.active = tutorialOn(); this.cards = []; this.cardShown = ''; this.txt = '';
    this.startDone = this.lvDone = this.swDone = false; this.step = 'harvest'; this.armed = false; this.second = null;
    this.rs = 'harvest'; this.rsAm = -1; this.rsDone0 = -1; this.rsT = 0;
    this.rebase(); this.render(null, '');
  }
  stop() { this.active = false; this.cards = []; this.render(null, ''); }
  private rebase() { const u = this.input.used; this.base = { harvest: u.harvest, prim: u.prim, sec: u.sec, nextP: u.nextP, sprint: u.sprint, pick: [...u.pick] }; }
  private next() { this.cards.shift(); this.cardShown = ''; this.rebase(); }

  hide() { this.render(null, ''); }
  update(s: Snap, me: number, cfg: Balancing, lvOffers: string[] | null, menu = false) {
    const T = cfg.tutorial, pr: any = s.me[me];
    if (this.active && !ON) this.stop(); // switched off in the pause menu
    const rsm = !!s.rs && !!cfg.research, touch = this.input.isTouch;
    if (!this.active || !T || !pr || (touch && !rsm) || menu || s.ph === 'over') { this.render(null, ''); return; }
    const u = this.input.used, b = this.base, ps = s.pl.find(p => p.id === me) as any;
    if (rsm) { this.updateResearch(s, pr, ps, cfg, touch); return; }
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
  // ---- 26.11.2026 Werkbank-Techtree start: harvest peas -> shoot the Erbsenpistole -> to the bench -> choose an idea -> hammer -> pick it up.
  // Steps are read from the snapshot (works the same with keys and touch buttons); touch gets the prompts only (no explanation cards).
  private rs: 'harvest' | 'shoot' | 'bench' | 'choose' | 'work' | 'pickup' | 'tree' | 'done' = 'harvest';
  private rsAm = -1; private rsDone0 = -1; private rsT = 0;
  private updateResearch(s: Snap, pr: any, ps: any, cfg: Balancing, touch: boolean) {
    const T = cfg.tutorial!, t = (k: string) => fmt((touch ? (T as any)[k + 'Touch'] : undefined) ?? (T as any)[k] ?? '');
    if (!this.startDone && s.ph === 'play' && !this.cards.length) {
      this.startDone = true; this.lvDone = true;
      if (!touch) {
        this.cards.push({ html: fmt(T.hp), where: 'hp' });
        if (ps?.ms || cfg.player.shield) this.cards.push({ html: fmt(T.shield), where: 'hp' });
        this.cards.push({ html: fmt(T.rsXp ?? T.xp), where: 'xp' });
        if (ps?.sa !== undefined || cfg.player.sprint) this.cards.push({ html: fmt(T.stamina), where: 'xp', key: 'sprint' });
      }
    }
    const c = this.cards[0];
    if (c) { if (touch) { this.cards = []; } else { if (c.key === 'sprint' && this.input.used.sprint > this.base.sprint) { this.next(); return; } if (s.ph !== 'play') { this.render(null, ''); return; } this.render(c, c.html); return; } }
    if (s.ph !== 'play' || !ps?.al) { this.render(null, ''); return; }
    const pi = SKILLS.indexOf('pea'), am = pr.am?.[pi] ?? 0, cost = pr.co?.[pi] ?? 3, rs = s.rs!, ro = pr.ro ?? 0, nd = (s.rd ?? []).reduce((a: number, x: number) => a + x, 0);
    if (this.rsDone0 < 0) this.rsDone0 = nd;
    const ideaDone = nd > this.rsDone0;
    if (this.rs === 'harvest') { if (this.rsAm < 0) this.rsAm = am; if (am > this.rsAm || ideaDone) { this.rs = 'shoot'; this.rsAm = am; } else { this.rsAm = Math.min(this.rsAm, am); this.prompt(t('rsHarvest')); return; } }
    if (this.rs === 'shoot') {
      if (am < this.rsAm - cost + .5 || ideaDone) { this.rs = 'bench'; }
      else { this.rsAm = Math.max(this.rsAm, am); if (am < cost) { this.prompt(t('rsHarvest')); return; } this.prompt(t('rsShoot')); return; }
    }
    if (this.rs === 'bench') { if (ro > 0 || rs[0] >= 0 || ideaDone) this.rs = 'choose'; else { this.prompt(t('rsBench')); return; } }
    if (this.rs === 'choose') { if (rs[0] >= 0 || ideaDone) this.rs = 'work'; else { this.prompt(ro ? '' : t('rsChoose')); return; } }
    if (this.rs === 'work') {
      if (rs[1] || ideaDone) this.rs = 'pickup';
      else { if (ps.bw) this.rsT = 1; this.prompt(this.rsT ? '' : t('rsWork')); return; }
    }
    if (this.rs === 'pickup') { if (ideaDone) { this.rs = 'tree'; this.rsT = 0; } else { this.prompt(ro === 2 || s.rs![0] < 0 ? '' : t('rsPickup')); return; } }
    if (this.rs === 'tree') { // once: the techtree opens from anywhere too; gone after a while or when it was opened
      if (ro > 0 || this.rsT > 7) this.rs = 'done'; else { this.rsT += 1 / 60; this.prompt(t('rsTree')); return; }
    }
    this.swDone = true; this.step = 'done';
    this.prompt(''); this.checkEnd();
  }
  /** everything shown once: the tutorial switches itself off (on again in the options) */
  private checkEnd() { if (this.startDone && this.lvDone && this.swDone && this.step === 'done' && !this.cards.length) { setTutorialOn(false); this.stop(); } }
  private prompt(html: string) { this.render(null, html); }
  private render(card: Card | null, html: string) {
    this.pause = !!card && this.active;
    this.catcher.classList.toggle('on', !!card);
    this.skip.hidden = !this.active;
    const key = (card ? card.where + ':' : 'p:') + html;
    if (card && key !== this.cardShown) { this.cardShown = key; this.cardT0 = performance.now(); }
    if (key === this.txt) return; this.txt = key;
    if (!html) { this.el.classList.remove('on'); return; }
    this.el.classList.remove('on', 'hp', 'xp', 'mid', 'top', 'card'); void this.el.offsetWidth;
    this.el.innerHTML = html + (card ? '<b class="tutGo"></b>' : '') + (card && (card.where === 'hp' || card.where === 'xp') ? '<i class="tutArr"><svg viewBox="0 0 30 34"><path d="M0 17L30 0V34Z" fill="#e3b964"/></svg></i>' : '');
    this.el.classList.add('on', card ? card.where : 'mid'); if (card) this.el.classList.add('card');
  }
}

/** {x} placeholders (keys from the current binding), [x] drawn as a key cap, <-  -> as arrows */
function fmt(t: string, v: Record<string, string> = {}) {
  const all: Record<string, string> = { harvest: keyLabel(KB.harvest), sprint: keyLabel(KB.sprint), prim: 'Linksklick', sec: 'Rechtsklick', next: keyLabel(KB.nextP), tree: keyLabel(KB.tree), ...v };
  const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return esc(t.replace(/\{(\w+)\}/g, (_, k) => all[k] ?? '')).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
}
