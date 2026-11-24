// Step-by-step hints from the start of a game (24.11.2026 Basti, PC): harvest -> attack once the shotgun has ammo -> switch at the 2nd weapon.
// Each step stays until its action was done once; texts in balancing.yaml (tutorial).
import { BERRIES, SKILLS, COMBOS, type Balancing } from '../config';
import type { Snap } from '../sim/snap';
import type { Input } from '../input/input';
import { keyLabel, keys as KB, SLOT_ACTS } from '../input/keys';

type Step = 'harvest' | 'attack' | 'switch' | 'done';
const ART: Record<string, [string, string]> = { m: ['zum', 'den'], f: ['zur', 'die'], n: ['zum', 'das'], p: ['zu den', 'die'] };

export class Tutorial {
  private el: HTMLElement;
  private step: Step = 'harvest';
  private base = { harvest: 0, prim: 0, sec: 0, nextP: 0, pick: [] as number[] };
  private txt = ''; private armed = false;
  private second: { slot: number; id: string } | null = null;
  constructor(private input: Input) {
    this.el = document.createElement('div'); this.el.id = 'tut';
    document.getElementById('hud')!.appendChild(this.el);
  }
  /** new game: start again with the first step */
  reset() {
    this.step = 'harvest'; this.second = null; this.armed = false; this.show('');
    const u = this.input.used; this.base = { harvest: u.harvest, prim: u.prim, sec: u.sec, nextP: u.nextP, pick: [...u.pick] };
  }
  private show(html: string) {
    if (html === this.txt) return; this.txt = html;
    if (!html) { this.el.classList.remove('on'); return; }
    this.el.classList.remove('on'); void this.el.offsetWidth; this.el.innerHTML = html; this.el.classList.add('on');
  }
  update(s: Snap, me: number, cfg: Balancing) {
    const T = cfg.tutorial, pr: any = s.me[me];
    if (!T || !pr || s.ph !== 'play' || this.step === 'done' || this.input.isTouch) { this.show(''); return; }
    const u = this.input.used, b = this.base;
    if (this.step === 'harvest' && u.harvest > b.harvest) this.step = 'attack';
    if (this.step === 'attack') {
      const co = pr.co[SKILLS.indexOf('blue')], has = BERRIES.some(k => pr.am[SKILLS.indexOf(k)] >= co);
      if (!this.armed) { if (!has) { this.show(''); return; } this.armed = true; b.prim = u.prim; } // clicks before the hint do not count
      if (u.prim > b.prim) this.step = 'switch'; else { this.show(fmt(T.attack, {})); return; }
    }
    const gs: number[] = pr.gs ?? [];
    if (this.step === 'harvest') { this.show(fmt(T.harvest, {})); return; }
    // switch: as soon as there is a 2nd weapon
    if (!this.second) {
      const k = gs.findIndex((x, j) => x >= 0 && SKILLS[x] !== 'blue' && j !== gs.indexOf(SKILLS.indexOf('blue')));
      if (k < 0 || gs.filter(x => x >= 0).length < 2) { this.show(''); return; }
      this.second = { slot: k, id: SKILLS[gs[k]] };
      this.base = { harvest: u.harvest, prim: u.prim, sec: u.sec, nextP: u.nextP, pick: [...u.pick] };
    }
    const { slot } = this.second, si = gs[slot];
    if (si === undefined || si < 0) { this.second = null; this.show(''); return; }
    const cb = pr.cb?.[si] ?? -1, id = cb >= 0 ? COMBOS[cb] : SKILLS[si];
    const name = (cb >= 0 ? cfg.names.combos?.[id as never] : cfg.names.skills[id as never]) ?? id;
    const [zum, den] = ART[T.genus?.[id] ?? 'f'];
    const v = { weapon: name, zum, den, slot: keyLabel(KB[SLOT_ACTS[slot]]) };
    if (slot < 5) {
      if (u.nextP > b.nextP || u.pick[slot] > b.pick[slot]) { this.step = 'done'; this.show(''); return; }
      this.show(fmt(T.switch, v));
    } else {
      if (u.sec > b.sec || u.pick[slot] > b.pick[slot]) { this.step = 'done'; this.show(''); return; }
      this.show(fmt(T.secondary, v));
    }
  }
}

/** {x} placeholders (keys from the current binding), [x] drawn as a key cap */
function fmt(t: string, v: Record<string, string>) {
  const all: Record<string, string> = { harvest: keyLabel(KB.harvest), prim: 'Linksklick', sec: 'Rechtsklick', next: keyLabel(KB.nextP), ...v };
  const esc = (x: string) => x.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
  return esc(t.replace(/\{(\w+)\}/g, (_, k) => all[k] ?? '')).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
}
