// Input for one day on the farm.
// PC (Basti 21.11.2026, third person): the mouse is captured (pointer lock) and turns the camera, WASD walk relative to the
// view (W = where the camera looks), left button / E = action on the nearest spot in front (held = one after the other),
// right button / Space (hold) = fight (aims at the nearest animal), wheel = zoom, Esc = pause. The middle button is free.
// Keyboard only (Basti 21.11.2026): E = action on the nearest spot (held = keeps going), Space (hold) = fight at the nearest animal.
// Touch: left thumb anywhere = move stick, one button for both (22.11.2026): touch = action on the nearest spot (held = keeps going),
// pulled up = fight with automatic aim (held); the seed button beside it: tap = next seed, hold = list. PC: Tab = next seed.
// tapping a spot in the world (inside its zone) also starts its action. Basti 22.11.2026: the camera always looks
// where the farmer walks (no turning by hand any more), two fingers anywhere = pinch zoom (also into / out of top down).
import type { DaySim, Intent, Target } from './sim';
import { emptyIntent } from './sim';
import type { FarmView } from './view/farmView';
import { SENS } from './sens';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class FarmInput {
  enabled = false;
  isTouch: boolean;
  onPause: () => void = () => {};
  /** the browser gave the mouse back (Esc while captured) */
  onUnlock: () => void = () => {};
  private unlockAt = -1e9;
  private wasHold = false;
  /** mouse capture wanted (unpaused game): retried a few times when the browser refuses right after Esc */
  private wantLock = 0;
  /** touch: two fingers = pinch zoom (a and b = pointer ids, d = their distance last frame) */
  private pinch: { a: number; b: number; d: number } | null = null;
  /** every touch on the canvas: where it is now */
  private tp = new Map<number, { x: number; y: number }>();
  onZoom: (dy: number) => void = () => {};
  /** Tab is held: the mouse wheel switches the berry instead of zooming */
  tabHeld = false;
  /** next (1) / previous (-1) seed: Tab / Shift+Tab, tap on the seed button (Basti 22.11.2026) */
  onSeed: (dir: number) => void = () => {};
  /** seed button held: the list of seeds */
  onSeedMenu: () => void = () => {};
  /** state of the work / fight button (phone) */
  private dual: '' | 'act' | 'atk' = '';
  private dualReset = () => {};
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
      if (e.key === 'Escape') { if (performance.now() - this.unlockAt > 250) this.onPause(); return; }
      if (e.code === 'Space') e.preventDefault(); // no button click / page scroll
      if (this.enabled && e.code === 'KeyE') { this.eDown = true; this.eHeld = true; this.kb = true; this.setTouch(false); }
      if (this.enabled && e.code === 'Space') { this.spaceHeld = true; this.kb = true; this.setTouch(false); }
      // Basti 22.11.2026: Tab = next berry; Tab held + mouse wheel = switch quickly back and forth
      if (e.code === 'Tab') { e.preventDefault(); if (this.enabled && !e.repeat) { this.tabHeld = true; this.onSeed(e.shiftKey ? -1 : 1); } }
      this.keys.add(e.code); if (this.enabled) this.onAny();
    });
    addEventListener('keyup', e => { this.keys.delete(e.code); if (e.code === 'Tab') this.tabHeld = false; if (e.code === 'KeyE') this.eHeld = false; if (e.code === 'Space') this.spaceHeld = false; });
    addEventListener('blur', () => this.releaseAll());
    c.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockerror', () => {
      // Chrome refuses the capture for a moment after Esc gave the mouse back: try again shortly (the key press still counts)
      if (this.wantLock && performance.now() < this.wantLock && this.enabled) setTimeout(() => this.lock(true), 350);
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === c;
      // the browser lets go of the mouse with Esc: that is the pause
      if (was && !this.locked) { this.unlockAt = performance.now(); if (this.enabled) { this.releaseAll(); this.onUnlock(); } }
    });
    c.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no auto scroll
    // on the window: a touch keeps sending to the element it started on (a pinch finger may land on the HUD)
    addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') {
        if (this.locked) { const k = this.mouseSens * SENS.mouse; this.rot.dx += e.movementX * k; this.rot.dy += e.movementY * k; this.setTouch(false); return; }
        if (Math.hypot(e.clientX - this.mouse.x, e.clientY - this.mouse.y) > 6) this.kb = false;
        this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.on = true; this.setTouch(false);
      } else {
        const t = this.tp.get(e.pointerId); if (t) { t.x = e.clientX; t.y = e.clientY; }
        const P = this.pinch;
        if (P && (e.pointerId === P.a || e.pointerId === P.b)) {
          // two fingers: spreading = closer, pinching = further out (on into top down)
          const a = this.tp.get(P.a), b = this.tp.get(P.b);
          if (a && b) { const d = Math.hypot(a.x - b.x, a.y - b.y); this.onZoom((P.d - d) * 4 * SENS.zoom); P.d = d; }
        } else if (e.pointerId === this.drag.id) { const d = this.drag; if (!d.moved && Math.hypot(e.clientX - d.ox, e.clientY - d.oy) > 12) d.moved = true; }
        else this.moveStick(e);
      }
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
      this.tp.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinchStart(e)) return;
      const s = this.stick;
      if (e.clientX < innerWidth * .45 && s.id < 0) { this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() }; this.drawStick(); }
      else if (this.drag.id < 0) this.drag = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, moved: false };
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') { if (e.button === 2) this.rmb = false; if (e.button === 0) this.lmb = false; if (e.button === 1) this.mmb = null; return; }
      this.tp.delete(e.pointerId);
      if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) { this.pinch = null; return; }
      if (e.pointerId === this.drag.id) { if (!this.drag.moved) this.tapAt = { x: this.drag.ox, y: this.drag.oy }; this.drag.id = -1; }
      if (e.pointerId === this.stick.id) {
        // a short tap without moving on the left side is a tap on the world (not a stick)
        const s = this.stick; if (performance.now() - s.t < 260 && Math.hypot(s.x - s.ox, s.y - s.oy) < 12) this.tapAt = { x: s.ox, y: s.oy };
        s.id = -1; this.drawStick();
      }
    };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    // second finger of a pinch on a HUD panel (not on a button): still a pinch
    addEventListener('pointerdown', e => {
      if (!this.enabled || e.pointerType === 'mouse' || e.target === c || (e.target as Element | null)?.closest?.('button,#fLabel')) return;
      this.tp.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (!this.pinchStart(e)) this.tp.delete(e.pointerId);
    }, true);
    addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') return; if (e.button === 2) this.rmb = false; if (e.button === 0) this.lmb = false; if (e.button === 1) this.mmb = null; });
    // touch buttons
    const btn = (id: string, down: () => void, upF: () => void) => {
      const b = $(id);
      b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.setTouch(true); b.classList.add('down'); down(); this.onAny(); });
      const u = () => { b.classList.remove('down'); upF(); };
      b.addEventListener('pointerup', u); b.addEventListener('pointercancel', u); b.addEventListener('pointerleave', u);
    };
    // phone (Basti 22.11.2026): ONE button for work and fight. Touching it works at once (like the old action button, held = keeps going);
    // pulled up = fight (held), back to the middle or down = work again
    const dual = $('#bDual'), knob = $('#bAct'), PULL = 26, MAXY = 56;
    let dId = -1, dY = 0;
    const dualSet = (mode: '' | 'act' | 'atk', y = 0) => {
      dual.classList.toggle('act', mode === 'act'); dual.classList.toggle('atk', mode === 'atk');
      knob.style.transform = mode ? `translateY(${y.toFixed(0)}px) scale(.94)` : '';
      this.actHeld = mode === 'act'; this.atkHeld = mode === 'atk'; this.dual = mode;
    };
    knob.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); if (dId >= 0) return;
      dId = e.pointerId; dY = e.clientY; try { knob.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      this.setTouch(true); this.actBtn = true; dualSet('act'); this.onAny();
    });
    knob.addEventListener('pointermove', e => {
      if (e.pointerId !== dId) return;
      const y = Math.max(-MAXY, Math.min(MAXY, e.clientY - dY));
      dualSet(y < -PULL ? 'atk' : 'act', y);
    });
    const dualUp = (e: PointerEvent) => { if (e.pointerId !== dId) return; dId = -1; dualSet(''); };
    knob.addEventListener('pointerup', dualUp); knob.addEventListener('pointercancel', dualUp);
    this.dualReset = () => { dId = -1; dualSet(''); };
    // phone (Basti 22.11.2026): the label over the spot ("[Gießen]") can be tapped too, one step per tap
    btn('#fLabel', () => { this.actBtn = true; }, () => {});
    // seed button beside it: tap = next seed, held = the list of seeds
    const sb = $('#bSeed'); let sT = 0, sLong = false, sId = -1;
    sb.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); this.setTouch(true); sb.classList.add('down'); sId = e.pointerId; sLong = false;
      clearTimeout(sT); sT = window.setTimeout(() => { if (sId < 0) return; sLong = true; sb.classList.remove('down'); this.onSeedMenu(); }, 420);
    });
    const sUp = (e: PointerEvent) => { if (e.pointerId !== sId) return; sId = -1; clearTimeout(sT); sb.classList.remove('down'); if (!sLong && e.type === 'pointerup') this.onSeed(1); };
    sb.addEventListener('pointerup', sUp); sb.addEventListener('pointercancel', sUp);
    this.setTouch(touch);
  }
  /** a second finger: pinch with the free finger, or with a stick finger that has only just touched down and not moved yet */
  private pinchStart(e: PointerEvent) {
    const s = this.stick, young = s.id >= 0 && performance.now() - s.t < 350 && Math.hypot(s.x - s.ox, s.y - s.oy) < 14;
    const other = this.drag.id >= 0 ? this.drag.id : young ? s.id : -1, o = this.tp.get(other);
    if (this.pinch || other < 0 || !o) return false;
    this.pinch = { a: other, b: e.pointerId, d: Math.hypot(e.clientX - o.x, e.clientY - o.y) };
    if (other === s.id) { s.id = -1; this.drawStick(); } else this.drag.id = -1;
    return true;
  }
  /** turn speed of the mouse relative to camera.rotate (balancing camera.mouse) */
  mouseSens = .55;
  /** capture the mouse (PC, needs a click / key press of the user) */
  lock(retry = false) { if (!retry) this.wantLock = performance.now() + 2500; if (this.lastTouch || this.locked || !this.wantLock) return; const c = $('#c') as HTMLCanvasElement; try { const r = c.requestPointerLock() as unknown as Promise<void> | undefined; r?.catch?.(() => {}); } catch { /* not allowed now */ } }
  unlock() { this.wantLock = 0; if (document.pointerLockElement) document.exitPointerLock(); }
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
  releaseAll() { this.mmb = null; this.drag.id = -1; this.rot = { dx: 0, dy: 0 }; this.keys.clear(); this.rmb = false; this.lmb = false; this.actHeld = false; this.atkHeld = false; this.eDown = false; this.eHeld = false; this.spaceHeld = false; this.stick.id = -1; this.dualReset(); this.pinch = null; this.tp.clear(); this.clickAt = null; this.tapAt = null; this.actBtn = false; this.drawStick(); }

  /** the spot an action goes to (Basti 22.11.2026): the nearest one whose zone the farmer stands in (sim.focusTarget); PC without
   *  captured mouse: the spot under the mouse when the farmer stands in its zone */
  hover(sim: DaySim, view: FarmView): Target | null {
    if (this.lastTouch || this.kb || this.locked) return sim.focusTarget();
    const g = this.mouse.on ? view.ground(this.mouse.x, this.mouse.y) : null, t = g ? sim.targetAt(g.x, g.z) : null;
    return t && sim.actionFor(t) && sim.inZone(t) ? t : sim.focusTarget();
  }
  /** a tapped / clicked spot: only inside its zone (outside nothing happens) */
  private tapTarget(sim: DaySim, view: FarmView, x: number, y: number) {
    const g = view.ground(x, y), t = g ? sim.targetAt(g.x, g.z) : null;
    return t && sim.inZone(t) ? t : null;
  }
  intent(sim: DaySim, view: FarmView): Intent {
    const it = emptyIntent(); if (!this.enabled) return it;
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    if (this.stick.id >= 0) { const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, l = Math.hypot(dx, dy), R = 50 / SENS.stick; if (l > 8) { const m = Math.min(1, (l - 8) / Math.max(4, R - 8)); mx = dx / l * m; mz = dy / l * m; } }
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    it.mx = mx; it.mz = mz;
    if (this.lastTouch) {
      it.aimAuto = true; it.attack = this.atkHeld;
      it.hold = this.actHeld; if (it.hold) it.holdAt = sim.focusTarget();
      if (this.actBtn) { it.act = sim.focusTarget(); this.actBtn = false; }
      if (this.tapAt) { it.act = this.tapTarget(sim, view, this.tapAt.x, this.tapAt.y) ?? it.act; this.tapAt = null; }
    } else {
      const g = view.ground(this.mouse.x, this.mouse.y); if (g) { it.aimX = g.x; it.aimZ = g.z; }
      it.attack = this.rmb || this.spaceHeld;
      if (this.locked || (this.spaceHeld && this.kb)) it.aimAuto = true; // third person / keyboard: aim at the nearest animal like on the phone
      it.hold = this.lmb || this.eHeld; if (it.hold) it.holdAt = this.hover(sim, view);
      if (this.eDown) { it.act = this.hover(sim, view); this.eDown = false; }
      if (this.clickAt && this.locked) { it.act = this.hover(sim, view); this.clickAt = null; }
      if (this.clickAt) { const t = this.tapTarget(sim, view, this.clickAt.x, this.clickAt.y); it.act = t && sim.actionFor(t) ? t : sim.focusTarget(); this.clickAt = null; }
    }
    if (this.locked) it.face = view.camFace;
    // released this frame: the sim stops the work that was started by holding
    it.up = this.wasHold && !it.hold; this.wasHold = it.hold;
    return it;
  }
}
