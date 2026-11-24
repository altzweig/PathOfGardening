// PC (WASD + mouse: left click rakes, Space shoots, Tab switches weapon) and touch (move stick + attack, shoot and switch buttons) both produce the same Intent.
import { WEAPONS, Weapon } from '../config';
import { Intent, emptyIntent } from '../sim/snap';
import type { GameView } from '../view/view';

interface Stick { id: number | null; ox: number; oy: number; R: number; x: number; y: number; mag: number }
const newStick = (): Stick => ({ id: null, ox: 0, oy: 0, R: 52, x: 0, y: 0, mag: 0 });

export class Input {
  enabled = false;
  onPause: () => void = () => {};
  onCheat: () => void = () => {};
  private keys: Record<string, boolean> = {};
  private mouse: { x: number; y: number } | null = null;
  private mouseDown = false;
  private clickLatch = false; // a click shorter than a frame still fires once
  private spaceLatch = false; // a Space tap shorter than a frame still fires one shot
  private mode: 'pc' | 'touch';
  private cycle = 0; private berry = 0; private tapSeq = 0; private tapW: Weapon | null = null;
  private move = newStick();
  private aim = newStick();
  private aimW: Weapon | null = null; private aimT0 = 0; private aimEl: HTMLElement | null = null; private aimLong = false;
  private moveEl = document.getElementById('moveStick')!;
  private aimStickEl = document.getElementById('aimStick')!;
  /** touches on the free screen (not on a button): one on the left = move stick; two at once = pinch zoom (23.11.2026) */
  private free = new Map<number, { x: number; y: number }>();
  private pinch: { a: number; b: number; d0: number; z0: number } | null = null;

  constructor(private view: GameView, touchDefault: boolean) {
    this.mode = touchDefault ? 'touch' : 'pc';
    document.body.dataset.input = this.mode;
    addEventListener('pointerdown', e => this.down(e), { passive: false });
    addEventListener('pointermove', e => this.pmove(e));
    addEventListener('pointerup', e => this.up(e)); addEventListener('pointercancel', e => this.up(e));
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mouseup', () => { this.mouseDown = false; });
    addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys[e.code] = true; this.setMode('pc');
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && this.enabled) this.spaceLatch = true; } // shoot: tap = one shot, held = continuous fire, see intent()
      if (e.code === 'Tab') { e.preventDefault(); if (!e.repeat && this.enabled) this.cycle++; } // next weapon
      if (e.code === 'KeyQ' && !e.repeat && this.enabled) this.berry++; // shotgun: next berry
      if (e.code === 'Escape') this.onPause();
      if (e.code === 'KeyE' && !e.repeat) this.onCheat();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => this.releaseAll());
  }
  private setMode(m: 'pc' | 'touch') { if (this.mode !== m) { this.mode = m; document.body.dataset.input = m; } }
  get isTouch() { return this.mode === 'touch'; }

  private down(e: PointerEvent) {
    if ((e.target as HTMLElement)?.closest?.('.berry') && this.enabled) { this.berry++; e.preventDefault(); return; } // shotgun badge: next berry
    if ((e.target as HTMLElement)?.closest?.('#cycBtn') && this.enabled) { this.cycle++; this.setMode('touch'); e.preventDefault(); return; } // touch: tap = next weapon (24.11.2026)
    if (e.pointerType === 'mouse') {
      this.setMode('pc'); this.mouse = { x: e.clientX, y: e.clientY };
      if (this.enabled && e.button === 0 && (e.target as HTMLElement).id === 'c') { this.mouseDown = true; this.clickLatch = true; }
      return;
    }
    this.setMode('touch');
    if (!this.enabled) return;
    const t = e.target as HTMLElement;
    if (t.closest('button') || t.closest('.ov')) return;
    const sk = t.closest('.skill') as HTMLElement | null;
    if (sk && !sk.hidden) {
      if (this.aim.id !== null) return;
      const r = sk.getBoundingClientRect();
      this.startAim(e, sk.dataset.skill as Weapon, r.left + r.width / 2, r.top + r.height / 2, 56, sk);
      e.preventDefault(); return;
    }
    // free screen: the left part moves; a second finger anywhere turns both into a pinch (zoom), no second stick any more
    this.free.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.pinch && this.free.size >= 2) {
      const [a, b] = [...this.free.keys()].slice(-2), A = this.free.get(a)!, B = this.free.get(b)!;
      this.pinch = { a, b, d0: Math.max(20, Math.hypot(A.x - B.x, A.y - B.y)), z0: this.view.zoom };
      if (this.move.id === a || this.move.id === b) { Object.assign(this.move, newStick()); this.moveEl.style.display = 'none'; }
    } else if (!this.pinch && e.clientX < innerWidth * .45 && this.move.id === null) {
      Object.assign(this.move, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, mag: 0 });
      this.showStick(this.moveEl, e.clientX, e.clientY);
    }
    e.preventDefault();
  }
  private startAim(e: PointerEvent, w: Weapon, ox: number, oy: number, R: number, el: HTMLElement | null) {
    Object.assign(this.aim, { id: e.pointerId, ox, oy, R, x: 0, y: 0, mag: 0 });
    this.aimW = w; this.aimT0 = performance.now(); this.aimEl = el; this.aimLong = false;
    if (el) el.classList.add('held');
  }
  private showStick(el: HTMLElement, x: number, y: number) { el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px'; (el.firstElementChild as HTMLElement).style.transform = ''; }
  private stickVec(s: Stick, x: number, y: number) {
    let dx = x - s.ox, dy = y - s.oy; const m = Math.hypot(dx, dy);
    if (m > s.R) { dx *= s.R / m; dy *= s.R / m; }
    s.x = dx / s.R; s.y = dy / s.R; s.mag = Math.min(1, m / s.R); return [dx, dy];
  }
  private pmove(e: PointerEvent) {
    if (e.pointerType === 'mouse') { this.mouse = { x: e.clientX, y: e.clientY }; return; }
    const fp = this.free.get(e.pointerId); if (fp) { fp.x = e.clientX; fp.y = e.clientY; }
    if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) {
      const A = this.free.get(this.pinch.a), B = this.free.get(this.pinch.b);
      if (A && B) this.view.setZoom(this.pinch.z0 * this.pinch.d0 / Math.max(20, Math.hypot(A.x - B.x, A.y - B.y))); // fingers apart = closer
      return;
    }
    if (e.pointerId === this.move.id) { const [dx, dy] = this.stickVec(this.move, e.clientX, e.clientY); (this.moveEl.firstElementChild as HTMLElement).style.transform = `translate(${dx}px,${dy}px)`; }
    else if (e.pointerId === this.aim.id) {
      const [dx, dy] = this.stickVec(this.aim, e.clientX, e.clientY);
      const kn = this.aimEl ? this.aimEl.querySelector('.kn') as HTMLElement : this.aimStickEl.firstElementChild as HTMLElement;
      kn.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }
  private up(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    this.free.delete(e.pointerId);
    if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) this.pinch = null;
    if (e.pointerId === this.move.id) { Object.assign(this.move, newStick()); this.moveEl.style.display = 'none'; }
    else if (e.pointerId === this.aim.id) this.releaseAim(true);
  }
  private releaseAim(allowTap: boolean) {
    if (allowTap && this.aimW && !this.aimLong && this.enabled) { this.tapSeq++; this.tapW = this.aimW; }
    if (this.aimEl) { this.aimEl.classList.remove('held'); (this.aimEl.querySelector('.kn') as HTMLElement).style.transform = ''; }
    Object.assign(this.aim, newStick()); this.aimW = null; this.aimEl = null; this.aimStickEl.style.display = 'none';
  }
  releaseAll() {
    this.free.clear(); this.pinch = null;
    this.releaseAim(false); Object.assign(this.move, newStick()); this.moveEl.style.display = 'none';
    this.mouseDown = false; this.spaceLatch = false; this.keys = {};
  }

  /** builds the intent for this frame; activeWeapon comes from the latest snapshot */
  intent(activeWeapon: Weapon): Intent {
    const it = emptyIntent(); it.cycle = this.cycle; it.berry = this.berry; it.tapSeq = this.tapSeq; it.tapW = this.tapW;
    this.view.localAim.show = false;
    if (!this.enabled) return it;
    let mx = this.move.x, mz = this.move.y;
    const k = this.keys;
    if (k.KeyW || k.ArrowUp) mz -= 1; if (k.KeyS || k.ArrowDown) mz += 1;
    if (k.KeyA || k.ArrowLeft) mx -= 1; if (k.KeyD || k.ArrowRight) mx += 1;
    const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
    it.mx = mx; it.mz = mz;
    if (this.mode === 'pc') {
      const d = this.mouse ? this.view.groundDir(this.mouse.x, this.mouse.y) : null;
      if (d) { it.ax = d[0]; it.az = d[1]; it.aim = true; Object.assign(this.view.localAim, { weapon: activeWeapon, x: d[0], z: d[1], show: true }); }
      // 23.11.2026 (Basti): Space shoots the active weapon, left click rakes / harvests, Tab switches the weapon
      if (k.Space || this.spaceLatch) it.fire = 'active'; else if (this.mouseDown || this.clickLatch) it.fire = 'rake';
      this.clickLatch = false; this.spaceLatch = false;
    } else if (this.aimW) {
      const long = performance.now() - this.aimT0 > 140 || this.aim.mag > .25;
      if (long) { this.aimLong = true; it.fire = this.aimW; }
      if (this.aim.mag > .25) {
        it.ax = this.aim.x; it.az = this.aim.y; it.aim = true;
        Object.assign(this.view.localAim, { weapon: this.aimW, x: this.aim.x / this.aim.mag, z: this.aim.y / this.aim.mag, show: true });
      }
    }
    return it;
  }
}
export { WEAPONS };
