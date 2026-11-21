// Input for one day on the farm. PC: WASD/arrows walk, left click = action on the clicked spot (walks there first),
// left button HELD = one action after the other at the spot under the mouse (21.11.2026), also while walking,
// right click (hold) = fight towards the mouse, middle mouse drag = turn the camera, wheel = zoom, Esc = pause.
// Touch: left thumb anywhere = move stick, "Aktion" button = action on the nearest spot (held = keeps going), "Angriff" button (hold) = fight
// with automatic aim; tapping a spot in the world also starts its action; dragging on the right half turns the camera.
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
  private rmb = false; private lmb = false; private clickAt: { x: number; y: number } | null = null;
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
  private actBtn = false; private actHeld = false; private atkHeld = false; private tapAt: { x: number; y: number } | null = null;
  /** camera turning: middle mouse drag (PC) or a drag on the right half (touch) */
  private mmb: { x: number; y: number } | null = null;
  private drag = { id: -1, ox: 0, oy: 0, x: 0, y: 0, moved: false };
  private rot = { dx: 0, dy: 0 };
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
    c.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no auto scroll
    c.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') {
        if (this.mmb) { this.rot.dx += e.clientX - this.mmb.x; this.rot.dy += e.clientY - this.mmb.y; this.mmb = { x: e.clientX, y: e.clientY }; }
        this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.on = true; this.setTouch(false);
      } else if (e.pointerId === this.drag.id) {
        const d = this.drag; if (!d.moved && Math.hypot(e.clientX - d.ox, e.clientY - d.oy) > 12) { d.moved = true; d.x = d.ox; d.y = d.oy; }
        if (d.moved) { this.rot.dx += (e.clientX - d.x) * 1.4; this.rot.dy += (e.clientY - d.y) * 1.4; d.x = e.clientX; d.y = e.clientY; }
      } else this.moveStick(e);
    });
    c.addEventListener('pointerdown', e => {
      if (!this.enabled) return;
      if (e.pointerType === 'mouse') {
        this.setTouch(false); this.mouse.x = e.clientX; this.mouse.y = e.clientY;
        if (e.button === 2) this.rmb = true; else if (e.button === 0) { this.clickAt = { x: e.clientX, y: e.clientY }; this.lmb = true; }
        else if (e.button === 1) { e.preventDefault(); this.mmb = { x: e.clientX, y: e.clientY }; }
        this.onAny(); return;
      }
      this.setTouch(true); this.onAny();
      if (e.clientX < innerWidth * .45 && this.stick.id < 0) { this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() }; this.drawStick(); }
      else if (this.drag.id < 0) this.drag = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { if (e.button === 2) this.rmb = false; if (e.button === 0) this.lmb = false; if (e.button === 1) this.mmb = null; return; }
      if (e.pointerId === this.drag.id) { if (!this.drag.moved) this.tapAt = { x: this.drag.ox, y: this.drag.oy }; this.drag.id = -1; }
      if (e.pointerId === this.stick.id) {
        // a short tap without moving on the left side is a tap on the world (not a stick)
        const s = this.stick; if (performance.now() - s.t < 260 && Math.hypot(s.x - s.ox, s.y - s.oy) < 12) this.tapAt = { x: s.ox, y: s.oy };
        s.id = -1; this.drawStick();
      }
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
    addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; if (e.button === 2) this.rmb = false; if (e.button === 0) this.lmb = false; if (e.button === 1) this.mmb = null; });
    // touch buttons
    const btn = (id: string, down: () => void, upF: () => void) => {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.setTouch(true); b.classList.add('down'); down(); this.onAny(); });
      const u = () => { b.classList.remove('down'); upF(); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u);
    };
    btn('#bAct', () => { this.actBtn = true; this.actHeld = true; }, () => { this.actHeld = false; });
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
  /** camera turn since the last call (px) */
  takeRotate() { const r = this.rot; this.rot = { dx: 0, dy: 0 }; return r; }
  releaseAll() { this.mmb = null; this.drag.id = -1; this.rot = { dx: 0, dy: 0 }; this.keys.clear(); this.rmb = false; this.lmb = false; this.actHeld = false; this.atkHeld = false; this.stick.id = -1; this.clickAt = null; this.tapAt = null; this.actBtn = false; this.drawStick(); }

  /** spot under the mouse (PC) or nearest spot with work (touch) */
  hover(sim: DaySim, view: FarmView): Target | null {
    if (this.lastTouch) return sim.nearestTarget(sim.cfg.player.hover);
    // PC: the spot under the mouse, else the nearest spot the player stands at
    const g = this.mouse.on ? view.ground(this.mouse.x, this.mouse.y) : null, t = g ? sim.targetAt(g.x, g.z) : null;
    return t && sim.actionFor(t) ? t : sim.nearestTarget(sim.cfg.player.hover);
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
      it.hold = this.actHeld; if (it.hold) it.holdAt = sim.nearestTarget(sim.cfg.player.hover);
      if (this.actBtn) { it.act = sim.nearestTarget(sim.cfg.player.hover); this.actBtn = false; }
      if (this.tapAt) { const g = view.ground(this.tapAt.x, this.tapAt.y); if (g) it.act = sim.targetAt(g.x, g.z) ?? it.act; this.tapAt = null; }
    } else {
      const g = view.ground(this.mouse.x, this.mouse.y); if (g) { it.aimX = g.x; it.aimZ = g.z; }
      it.attack = this.rmb;
      it.hold = this.lmb; if (it.hold) it.holdAt = this.hover(sim, view);
      if (this.clickAt) { const c = view.ground(this.clickAt.x, this.clickAt.y), t = c ? sim.targetAt(c.x, c.z) : null; it.act = t && sim.actionFor(t) ? t : sim.nearestTarget(sim.cfg.player.hover); this.clickAt = null; }
    }
    return it;
  }
}
