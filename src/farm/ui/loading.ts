// Loading screen at start: farm preview image, progress bar, a new tip every few seconds.
// The screen itself is static HTML (#load) so it shows before the game script has loaded.
import * as THREE from 'three';
import type { FarmCfg } from '../config';

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class LoadScreen {
  private el = $('#load'); private fill = $('#loadFill'); private tip = $('#loadTip');
  private shown = 0; private target = 0; private raf = 0; private t0 = performance.now();
  private tips: string[] = []; private tipI = 0; private tipTimer = 0;
  /** three.js loaders (models, textures) report here; mapped onto [a, b] of the bar */
  private span: [number, number] = [0, 0];

  constructor() {
    THREE.DefaultLoadingManager.onProgress = (_u, done, total) => {
      const [a, b] = this.span; if (total) this.set(a + (b - a) * done / total);
    };
    const tick = () => {
      this.shown += (this.target - this.shown) * .12;
      if (this.target - this.shown < .002) this.shown = this.target;
      this.fill.style.transform = `scaleX(${this.shown})`;
      if (this.shown < 1 || !this.el.classList.contains('out')) this.raf = requestAnimationFrame(tick);
    };
    this.fill.style.animation = 'none'; // the CSS creep only covers the time before this script runs
    this.raf = requestAnimationFrame(tick);
  }
  /** bar never goes back */
  set(k: number) { this.target = Math.max(this.target, Math.min(1, k)); }
  /** range of the bar that three.js loading fills */
  loaders(a: number, b: number) { this.span = [a, b]; this.set(a); }
  startTips(cfg: FarmCfg) {
    const L = cfg.loading; if (!L?.tips?.length) return;
    this.tips = [...L.tips].sort(() => Math.random() - .5);
    const show = () => {
      this.tip.classList.remove('in'); void this.tip.offsetWidth;
      this.tip.textContent = this.tips[this.tipI++ % this.tips.length]; this.tip.classList.add('in');
    };
    show(); this.tipTimer = window.setInterval(show, L.tipEvery * 1000);
  }
  /** fills the bar and waits until the minimum time has passed */
  async finish(cfg: FarmCfg | null) {
    this.set(1);
    const rest = (cfg?.loading?.minTime ?? 0) * 1000 - (performance.now() - this.t0);
    await new Promise(r => setTimeout(r, Math.max(400, rest)));
  }
  async fadeOut(cfg: FarmCfg | null) {
    const fade = (cfg?.loading?.fade ?? .6) * 1000;
    this.el.style.transitionDuration = fade + 'ms'; this.el.classList.add('out');
    await new Promise(r => setTimeout(r, fade));
    clearInterval(this.tipTimer); cancelAnimationFrame(this.raf); THREE.DefaultLoadingManager.onProgress = () => {};
    this.el.remove();
  }
}
