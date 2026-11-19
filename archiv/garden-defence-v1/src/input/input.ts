// PC (WASD + mouse + Space) and touch (twin sticks + skill buttons) both produce the same Intent.
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
  private rightDown = false; private rightLatch = false; // right mouse button: hoe swing (slash)
  private mode: 'pc' | 'touch';
  private cycle = 0; private tapSeq = 0; private tapW: Weapon | 'slash' | null = null;
  private move = newStick();
  private aim = newStick();
  private aimW: Weapon | 'slash' | null = null; private aimT0 = 0; private aimEl: HTMLElement | null = null; private aimLong = false;
  private moveEl = document.getElementById('moveStick')!;
  private aimStickEl = document.getElementById('aimStick')!;

  constructor(private view: GameView, touchDefault: boolean) {
    this.mode = touchDefault ? 'touch' : 'pc';
    document.body.dataset.input = this.mode;
    addEventListener('pointerdown', e => this.down(e), { passive: false });
    addEventListener('pointermove', e => this.pmove(e));
    addEventListener('pointerup', e => this.up(e)); addEventListener('pointercancel', e => this.up(e));
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mouseup', e => { if (e.button === 2) this.rightDown = false; else this.mouseDown = false; });
    addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      this.keys[e.code] = true; this.setMode('pc');
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && this.enabled) this.cycle++; }
      if (e.code === 'Escape') this.onPause();
      if (e.code === 'KeyE' && !e.repeat) this.onCheat();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => this.releaseAll());
  }
  private setMode(m: 'pc' | 'touch') { if (this.mode !== m) { this.mode = m; document.body.dataset.input = m; } }
  get isTouch() { return this.mode === 'touch'; }

  private down(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      this.setMode('pc'); this.mouse = { x: e.clientX, y: e.clientY };
      if (this.enabled && e.button === 0 && (e.target as HTMLElement).id === 'c') { this.mouseDown = true; this.clickLatch = true; }
      if (this.enabled && e.button === 2 && (e.target as HTMLElement).id === 'c') { this.rightDown = true; this.rightLatch = true; }
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
      this.startAim(e, sk.dataset.skill as Weapon | 'slash', r.left + r.width / 2, r.top + r.height / 2, 56, sk);
      e.preventDefault(); return;
    }
    if (e.clientX < innerWidth * .45) {
      if (this.move.id !== null) return;
      Object.assign(this.move, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0, mag: 0 });
      this.showStick(this.moveEl, e.clientX, e.clientY);
    } else {
      if (this.aim.id !== null) return;
      this.startAim(e, 'slash', e.clientX, e.clientY, 52, null); // free right side: aim + swing the hoe (fighting)
      this.showStick(this.aimStickEl, e.clientX, e.clientY);
    }
    e.preventDefault();
  }
  private startAim(e: PointerEvent, w: Weapon | 'slash', ox: number, oy: number, R: number, el: HTMLElement | null) {
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
    if (e.pointerId === this.move.id) { const [dx, dy] = this.stickVec(this.move, e.clientX, e.clientY); (this.moveEl.firstElementChild as HTMLElement).style.transform = `translate(${dx}px,${dy}px)`; }
    else if (e.pointerId === this.aim.id) {
      const [dx, dy] = this.stickVec(this.aim, e.clientX, e.clientY);
      const kn = this.aimEl ? this.aimEl.querySelector('.kn') as HTMLElement : this.aimStickEl.firstElementChild as HTMLElement;
      kn.style.transform = `translate(${dx}px,${dy}px)`;
    }
  }
  private up(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    if (e.pointerId === this.move.id) { Object.assign(this.move, newStick()); this.moveEl.style.display = 'none'; }
    else if (e.pointerId === this.aim.id) this.releaseAim(true);
  }
  private releaseAim(allowTap: boolean) {
    if (allowTap && this.aimW && !this.aimLong && this.enabled) { this.tapSeq++; this.tapW = this.aimW; }
    if (this.aimEl) { this.aimEl.classList.remove('held'); (this.aimEl.querySelector('.kn') as HTMLElement).style.transform = ''; }
    Object.assign(this.aim, newStick()); this.aimW = null; this.aimEl = null; this.aimStickEl.style.display = 'none';
  }
  releaseAll() {
    this.releaseAim(false); Object.assign(this.move, newStick()); this.moveEl.style.display = 'none';
    this.mouseDown = false; this.rightDown = false; this.keys = {};
  }

  /** builds the intent for this frame; activeWeapon comes from the latest snapshot */
  intent(activeWeapon: Weapon): Intent {
    const it = emptyIntent(); it.cycle = this.cycle; it.tapSeq = this.tapSeq; it.tapW = this.tapW;
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
      if (this.mouseDown || this.clickLatch) it.fire = 'active';
      if (this.rightDown || this.rightLatch) { it.fire = 'slash'; this.view.localAim.weapon = 'slash'; } // right mouse button: hoe swing
      this.clickLatch = false; this.rightLatch = false;
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
