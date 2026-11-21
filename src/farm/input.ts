// Input for one day on the farm.
// PC (Basti 21.11.2026, third person): the mouse is captured (pointer lock) and turns the camera, WASD walk relative to the
// view (W = where the camera looks), left button / E = action on the nearest spot in front (held = one after the other),
// right button / Space (hold) = fight (aims at the nearest animal), wheel = zoom, Esc = pause. The middle button is free.
// Keyboard only (Basti 21.11.2026): E = action on the nearest spot (held = keeps going), Space (hold) = fight at the nearest animal.
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
  /** the browser gave the mouse back (Esc while captured) */
  onUnlock: () => void = () => {};
  private unlockAt = -1e9;
  private wasHold = false;
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
  /** last action came from the keyboard (E / Space): targets = nearest spot, label shows [E]; the mouse takes over again when it moves */
  kb = false;
  /** PC: mouse captured, moving it turns the camera */
  locked = false;
  private eDown = false; private eHeld = false; private spaceHeld = false;

  constructor(touch: boolean) {
    this.isTouch = touch;
    const c = $('#c');
    addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.key === 'Escape') { if (performance.now() - this.unlockAt > 400) this.onPause(); return; }
      if (e.code === 'Space') e.preventDefault(); // no button click / page scroll
      if (this.enabled && e.code === 'KeyE') { this.eDown = true; this.eHeld = true; this.kb = true; this.setTouch(false); }
      if (this.enabled && e.code === 'Space') { this.spaceHeld = true; this.kb = true; this.setTouch(false); }
      this.keys.add(e.code); if (this.enabled) this.onAny();
    });
    addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'KeyE') this.eHeld = false; if (e.code === 'Space') this.spaceHeld = false; });
    addEventListener('blur', () => this.releaseAll());
    c.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === c;
      // the browser lets go of the mouse with Esc: that is the pause
      if (was && !this.locked) { this.unlockAt = performance.now(); if (this.enabled) { this.releaseAll(); this.onUnlock(); } }
    });
    c.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no auto scroll
    c.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') {
        if (this.locked) { const k = this.mouseSens; this.rot.dx += e.movementX * k; this.rot.dy += e.movementY * k; this.setTouch(false); return; }
        if (Math.hypot(e.clientX - this.mouse.x, e.clientY - this.mouse.y) > 6) this.kb = false;
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
        // first click only captures the mouse (no action by accident)
        if (!this.locked) { this.lock(); this.onAny(); return; }
        if (e.button === 2) this.rmb = true; else if (e.button === 0) { this.clickAt = { x: e.clientX, y: e.clientY }; this.lmb = true; }
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
  /** turn speed of the mouse relative to camera.rotate (balancing camera.mouse) */
  mouseSens = .55;
  /** capture the mouse (PC, needs a click / key press of the user) */
  lock() { if (this.lastTouch || this.locked) return; const c = $('#c') as HTMLCanvasElement; try { const r = c.requestPointerLock() as unknown as Promise<void> | undefined; r?.catch?.(() => {}); } catch { /* not allowed now */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
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
  releaseAll() { this.mmb = null; this.drag.id = -1; this.rot = { dx: 0, dy: 0 }; this.keys.clear(); this.rmb = false; this.lmb = false; this.actHeld = false; this.atkHeld = false; this.eDown = false; this.eHeld = false; this.spaceHeld = false; this.stick.id = -1; this.clickAt = null; this.tapAt = null; this.actBtn = false; this.drawStick(); }

  /** spot under the mouse (PC) or nearest spot with work (touch) */
  hover(sim: DaySim, view: FarmView): Target | null {
    if (this.lastTouch || this.kb || this.locked) return sim.nearestTarget(sim.cfg.player.hover, this.locked || this.kb);
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
      it.attack = this.rmb || this.spaceHeld;
      if (this.locked || (this.spaceHeld && this.kb)) it.aimAuto = true; // third person / keyboard: aim at the nearest animal like on the phone
      it.hold = this.lmb || this.eHeld; if (it.hold) it.holdAt = this.hover(sim, view);
      if (this.eDown) { it.act = this.hover(sim, view); this.eDown = false; }
      if (this.clickAt && this.locked) { it.act = this.hover(sim, view); this.clickAt = null; }
      if (this.clickAt) { const c = view.ground(this.clickAt.x, this.clickAt.y), t = c ? sim.targetAt(c.x, c.z) : null; it.act = t && sim.actionFor(t) ? t : sim.nearestTarget(sim.cfg.player.hover); this.clickAt = null; }
    }
    // released this frame: the sim stops the work that was started by holding
    it.up = this.wasHold && !it.hold; this.wasHold = it.hold;
    return it;
  }
}
