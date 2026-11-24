/**
 * HP + XP orbs (PC only, 24.11.2026 Basti): like Path of Exile / Diablo, HP bottom left, XP (golden) bottom right.
 * The art is pre-rendered (tools/orbs/render_orbs.py): empty glass, the liquid as a full sphere, and the glass
 * reflections + vine frame on top. Here the liquid is only clipped to the fill height, with a gently moving surface.
 * Geometry in render space: 1024 px, glass centre (512, 560), radius 300.
 */
const G = { size: 1024, cx: 512, cy: 560, r: 300 };
const SURF: Record<string, string> = { hp: '255,170,160', xp: '255,240,200' };

class Orb {
  cv: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private img: Record<'back' | 'fill' | 'front', HTMLImageElement>;
  private shown = -1; private target = 1; private drawn = '';
  constructor(public kind: 'hp' | 'xp', parent: HTMLElement) {
    this.cv = document.createElement('canvas'); this.cv.className = 'orbCv';
    parent.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d')!;
    const load = (l: string) => { const i = new Image(); i.src = `hud/orb-${kind}-${l}.webp`; i.onload = () => { this.drawn = ''; }; return i; };
    this.img = { back: load('back'), fill: load('fill'), front: load('front') };
  }
  set(v: number) { this.target = Math.max(0, Math.min(1, v)); }
  /** jump instead of animating (new game, level-up resets the XP orb) */
  snap() { this.shown = this.target; }
  tick(dt: number, t: number) {
    const el = this.cv, w = el.clientWidth; if (!w) return;
    const px = Math.round(w * Math.min(2, devicePixelRatio || 1));
    if (el.width !== px) { el.width = el.height = px; this.drawn = ''; }
    if (this.shown < 0) this.shown = this.target;
    const d = this.target - this.shown;
    this.shown += Math.abs(d) < .002 ? d : d * Math.min(1, dt * (d < 0 ? 9 : 5));
    const f = this.shown, moving = f > .005 && f < .995;
    // the surface sways slowly; redraw ~30x per second while it is visible
    const key = moving ? `${f.toFixed(4)}|${Math.floor(t * 30)}` : f.toFixed(4);
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
  update(hp: number, xp: number, lv: number) {
    if (this.force) [hp, xp] = this.force;
    this.hp.set(hp); this.xp.set(xp);
    if (lv !== this.lv) { if (this.lv >= 0 && lv > this.lv) this.xp.snap(); this.lv = lv; (document.getElementById('orbLv')!).textContent = String(lv); }
    const now = performance.now(), dt = Math.min(.1, (now - this.last) / 1000); this.last = now;
    if (document.body.dataset.input !== 'pc') return;
    this.hp.tick(dt, now / 1000); this.xp.tick(dt, now / 1000 + 3.1);
  }
}
