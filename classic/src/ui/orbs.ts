/**
 * HP + XP orbs (PC only, 24.11.2026 Basti): like Path of Exile / Diablo, HP bottom left, XP (golden) bottom right.
 * The art is pre-rendered (tools/orbs/render_orbs.py): empty glass, the liquid as a full sphere, and the glass
 * reflections + vine frame on top. Here the liquid is only clipped to the fill height, with a gently moving surface.
 * Geometry in render space: 1024 px, glass centre (512, 560), radius 300.
 */
const G = { size: 1024, cx: 512, cy: 560, r: 300 };
const SURF: Record<string, string> = { hp: '255,170,160', xp: '255,240,200' };
/** 24.11.2026 Basti: arc along the orb rim, just outside the rope ring, on the side facing the screen centre.
 *  HP orb: blue energy shield, XP orb: yellow stamina. Angles in canvas radians (0 = right, clockwise), filling from a0 towards a1. */
const ARC = { r: 368, w: 20, hp: { a0: Math.PI * .22, a1: -Math.PI * .45, c: ['#bfe8ff', '#3fa2ff', '#1550c8'] }, xp: { a0: Math.PI * .78, a1: Math.PI * 1.45, c: ['#fff3a8', '#ffd21f', '#c98a00'] } };

class Orb {
  cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private img: Record<'back' | 'fill' | 'front', HTMLImageElement>;
  private shown = -1; private target = 1; private drawn = '';
  /** rim arc (shield / stamina) 0..1, -1 = none; dim = drained (stamina locked) */
  private arc = -1; private arcShown = -1; private arcDim = false;
  constructor(public kind: 'hp' | 'xp', parent: HTMLElement) {
    this.cv = document.createElement('canvas'); this.cv.className = 'orbCv';
    parent.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d')!;
    const load = (l: string) => { const i = new Image(); i.src = `hud/orb-${kind}-${l}.webp`; i.onload = () => { this.drawn = ''; }; return i; };
    this.img = { back: load('back'), fill: load('fill'), front: load('front') };
  }
  set(v: number) { this.target = Math.max(0, Math.min(1, v)); }
  setArc(v: number, dim = false) { this.arc = v < 0 ? -1 : Math.max(0, Math.min(1, v)); this.arcDim = dim; }
  /** jump instead of animating (new game, level-up resets the XP orb) */
  snap() { this.shown = this.target; }
  tick(dt: number, t: number) {
    const el = this.cv, w = el.clientWidth; if (!w) return;
    const px = Math.round(w * Math.min(2, devicePixelRatio || 1));
    if (el.width !== px) { el.width = el.height = px; this.drawn = ''; }
    if (this.shown < 0) this.shown = this.target;
    const d = this.target - this.shown;
    this.shown += Math.abs(d) < .002 ? d : d * Math.min(1, dt * (d < 0 ? 9 : 5));
    if (this.arc < 0) this.arcShown = -1;
    else { const da = this.arc - (this.arcShown < 0 ? this.arc : this.arcShown); this.arcShown = Math.abs(da) < .002 ? this.arc : this.arcShown + da * Math.min(1, dt * 12); }
    const f = this.shown, moving = f > .005 && f < .995;
    // the surface sways slowly; redraw ~30x per second while it is visible
    const key = (moving ? `${f.toFixed(4)}|${Math.floor(t * 30)}` : f.toFixed(4)) + `|${this.arcShown.toFixed(3)}${this.arcDim ? Math.floor(t * 30) : ''}`;
    if (key === this.drawn || !this.img.front.complete) return; this.drawn = key;
    const c = this.ctx, k = px / G.size, cx = G.cx * k, cy = G.cy * k, r = G.r * k;
    c.clearRect(0, 0, px, px);
    c.drawImage(this.img.back, 0, 0, px, px);
    if (f > .003) {
      const sway = moving ? Math.sin(t * 1.7) * .012 + Math.sin(t * 2.9 + 1) * .006 : 0;
      const y = cy + r - 2 * r * f + sway * r * .4;
      const half = Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))), eh = half * .11;
      c.save(); c.beginPath();
      c.rect(0, y, px, px);
      if (moving) c.ellipse(cx, y, half, eh, sway * .6, 0, Math.PI * 2);
      c.clip(); c.drawImage(this.img.fill, 0, 0, px, px); c.restore();
      if (moving && half > 2) { // liquid surface: milky, light on its far rim
        c.save(); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
        const s = SURF[this.kind], g = c.createLinearGradient(0, y - eh, 0, y + eh);
        g.addColorStop(0, `rgba(${s},.55)`); g.addColorStop(.5, `rgba(${s},.22)`); g.addColorStop(1, `rgba(${s},.05)`);
        c.fillStyle = g; c.beginPath(); c.ellipse(cx, y, half, eh, sway * .6, 0, Math.PI * 2); c.fill();
        c.strokeStyle = `rgba(255,255,255,.35)`; c.lineWidth = Math.max(1, px / 260);
        c.beginPath(); c.ellipse(cx, y, half * .97, eh * .9, sway * .6, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
        c.restore();
      }
    }
    c.drawImage(this.img.front, 0, 0, px, px);
    if (this.arcShown >= 0) this.drawArc(c, k, t);
  }
  private drawArc(c: CanvasRenderingContext2D, k: number, t: number) {
    const A = ARC[this.kind], cx = G.cx * k, cy = G.cy * k, r = ARC.r * k, w = ARC.w * k, ccw = A.a1 < A.a0;
    const at = (v: number) => A.a0 + (A.a1 - A.a0) * v;
    c.save(); c.lineCap = 'round';
    // dark groove for the whole length
    c.strokeStyle = 'rgba(255,225,170,.3)'; c.lineWidth = w + 9 * k; // thin light rim, so the empty groove reads on dark ground
    c.beginPath(); c.arc(cx, cy, r, A.a0, A.a1, ccw); c.stroke();
    c.strokeStyle = 'rgba(10,8,4,.85)'; c.lineWidth = w + 4 * k;
    c.beginPath(); c.arc(cx, cy, r, A.a0, A.a1, ccw); c.stroke();
    const v = this.arcShown;
    if (v > .004) {
      const g = c.createRadialGradient(cx, cy, r - w / 2, cx, cy, r + w / 2);
      g.addColorStop(0, A.c[2]); g.addColorStop(.45, A.c[1]); g.addColorStop(1, A.c[0]);
      c.globalAlpha = this.arcDim ? .45 + .2 * Math.sin(t * 12) : 1;
      c.shadowColor = A.c[1]; c.shadowBlur = 10 * k;
      c.strokeStyle = g; c.lineWidth = w;
      c.beginPath(); c.arc(cx, cy, r, A.a0, at(v), ccw); c.stroke();
      c.shadowBlur = 0; c.globalAlpha = this.arcDim ? .3 : .7; // highlight on the outer edge
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1, w * .18);
      c.beginPath(); c.arc(cx, cy, r + w * .22, A.a0, at(v), ccw); c.stroke();
    }
    c.restore();
  }
}

export class Orbs {
  hp: Orb; xp: Orb; private last = performance.now(); private lv = -1;
  constructor(hud: HTMLElement) {
    const mk = (id: string) => { const d = document.createElement('div'); d.id = id; d.className = 'orb'; hud.appendChild(d); return d; };
    this.hp = new Orb('hp', mk('orbHp'));
    const xpBox = mk('orbXp'); this.xp = new Orb('xp', xpBox);
    const b = document.createElement('div'); b.id = 'orbLv'; xpBox.appendChild(b);
    if (import.meta.env.DEV) (window as any).__orbs = this; // screenshots: __orbs.force = [hp, xp]
  }
  force: [number, number] | null = null;
  private lk = '';
  /** label (25.11.2026 Werkbank-Techtree): research mode, the badge shows the icon of the idea being researched instead of the level */
  update(hp: number, xp: number, lv: number, shield = -1, stamina = -1, drained = false, label: { key: string; html: string } | null = null) {
    if (this.force) [hp, xp] = this.force;
    this.hp.set(hp); this.xp.set(xp); this.hp.setArc(shield); this.xp.setArc(stamina, drained);
    if (label) { if (label.key !== this.lk) { if (this.lk) this.xp.snap(); this.lk = label.key; this.lv = -1; const b = document.getElementById('orbLv')!; b.innerHTML = label.html; b.classList.add('ic'); } }
    else if (lv !== this.lv) { if (this.lv >= 0 && lv > this.lv) this.xp.snap(); this.lv = lv; this.lk = ''; const b = document.getElementById('orbLv')!; b.textContent = String(lv); b.classList.remove('ic'); }
    const now = performance.now(), dt = Math.min(.1, (now - this.last) / 1000); this.last = now;
    if (document.body.dataset.input !== 'pc') return;
    this.hp.tick(dt, now / 1000); this.xp.tick(dt, now / 1000 + 3.1);
  }
}
