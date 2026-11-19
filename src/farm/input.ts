// Input for one day on the farm. PC: WASD/arrows walk, left click = action on the clicked spot (walks there first),
// right click (hold) = fight towards the mouse, wheel = zoom, Esc = pause.
// Touch: left thumb anywhere = move stick, "Aktion" button = action on the nearest spot, "Angriff" button (hold) = fight
// with automatic aim; tapping a spot in the world also starts its action.
import type { DaySim, Intent, Target } from './sim';
import { emptyIntent } from './sim';
import type { FarmView } from './view/farmView';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class FarmInput {
  enabled = false;
  isTouch: boolean;
  onPause: () => void = () => {};
  /** any click / key (tutorial "continue") */
  onAny: () => void = () => {};
  private keys = new Set<string>();
  private mouse = { x: innerWidth / 2, y: innerHeight / 2, on: false };
  private rmb = false; private clickAt: { x: number; y: number } | null = null;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
  private actBtn = false; private atkHeld = false; private tapAt: { x: number; y: number } | null = null;
  lastTouch = false;

  constructor(touch: boolean) {
    this.isTouch = touch;
    const c = $('#c');
    addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.key === 'Escape') { this.onPause(); return; }
      this.keys.add(e.code); if (this.enabled) this.onAny();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.releaseAll());
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.on = true; this.setTouch(false); } else this.moveStick(e); });
    c.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        this.setTouch(false); this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (e.button === 2) this.rmb = true; else if (e.button === 0) this.clickAt = { x: e.clientX, y: e.clientY };
        this.onAny(); return;
      }
      this.setTouch(true); this.onAny();
      if (e.clientX < innerWidth * .45 && this.stick.id < 0) { this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() }; this.drawStick(); }
      else this.tapAt = { x: e.clientX, y: e.clientY };
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { if (e.button === 2) this.rmb = false; return; }
      if (e.pointerId === this.stick.id) {
        // a short tap without moving on the left side is a tap on the world (not a stick)
        const s = this.stick; if (performance.now() - s.t < 260 && Math.hypot(s.x - s.ox, s.y - s.oy) < 12) this.tapAt = { x: s.ox, y: s.oy };
        s.id = -1; this.drawStick();
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 2) this.rmb = false; });
    // touch buttons
    const btn = (id: string, down: () => void, upF: () => void) => {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.setTouch(true); b.classList.add('down'); down(); this.onAny(); });
      const u = () => { b.classList.remove('down'); upF(); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u);
    };
    btn('#bAct', () => { this.actBtn = true; }, () => {});
    btn('#bAtk', () => { this.atkHeld = true; }, () => { this.atkHeld = false; });
    this.setTouch(touch);
  }
  private setTouch(on: boolean) { if (this.lastTouch === on && document.body.dataset.input) return; this.lastTouch = on; document.body.dataset.input = on ? 'touch' : 'pc'; }
  private moveStick(e: PointerEvent) { if (e.pointerId !== this.stick.id) return; this.stick.x = e.clientX; this.stick.y = e.clientY; this.drawStick(); }
  private drawStick() {
    const el = $('#fStick'), s = this.stick; el.hidden = s.id < 0; if (s.id < 0) return;
    el.style.left = s.ox + 'px'; el.style.top = s.oy + 'px';
    const dx = s.x - s.ox, dy = s.y - s.oy, l = Math.hypot(dx, dy), m = Math.min(l, 50), k = l ? m / l : 0;
    (el.firstElementChild as HTMLElement).style.transform = `translate(${dx * k}px,${dy * k}px)`;
  }
  releaseAll() { this.keys.clear(); this.rmb = false; this.atkHeld = false; this.stick.id = -1; this.clickAt = null; this.tapAt = null; this.actBtn = false; this.drawStick(); }

  /** spot under the mouse (PC) or nearest spot with work (touch) */
  hover(sim: DaySim, view: FarmView): Target | null {
    if (this.lastTouch) return sim.nearestTarget(sim.cfg.player.hover);
    if (!this.mouse.on) return null;
    const g = view.ground(this.mouse.x, this.mouse.y); return g ? sim.targetAt(g.x, g.z) : null;
  }
  intent(sim: DaySim, view: FarmView): Intent {
    const it = emptyIntent(); if (!this.enabled) return it;
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (this.stick.id >= 0) { const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, l = Math.hypot(dx, dy); if (l > 8) { const m = Math.min(1, l / 50); mx = dx / l * m; mz = dy / l * m; } }
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    it.mx = mx; it.mz = mz;
    if (this.lastTouch) {
      it.aimAuto = true; it.attack = this.atkHeld;
      if (this.actBtn) { it.act = sim.nearestTarget(sim.cfg.player.hover); this.actBtn = false; }
      if (this.tapAt) { const g = view.ground(this.tapAt.x, this.tapAt.y); if (g) it.act = sim.targetAt(g.x, g.z) ?? it.act; this.tapAt = null; }
    } else {
      const g = view.ground(this.mouse.x, this.mouse.y); if (g) { it.aimX = g.x; it.aimZ = g.z; }
      it.attack = this.rmb;
      if (this.clickAt) { const c = view.ground(this.clickAt.x, this.clickAt.y); if (c) it.act = sim.targetAt(c.x, c.z); this.clickAt = null; }
    }
    return it;
  }
}
