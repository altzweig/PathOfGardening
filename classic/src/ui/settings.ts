// Optionen-Panel (25.11.2026, Basti): alle Optionen in einem Panel mit Reitern wie in großen Spielen.
// Grafik und Ton sind in Einzelwerte aufgeteilt, alles wird gespeichert (localStorage) und beim Start angewendet.
import { GFX_PRESETS, GfxPreset, applyQuality, gfx, isTouch, syncQuality } from '../view/core';
import { ambient, applyVolumes, audio, vol, sfx, play } from '../audio';
import { setTutorialOn, tutorialOn } from './tutorial';

export type Tab = 'gfx' | 'snd' | 'ctrl' | 'game' | 'cheat' | 'cred';
const KEY = 'pog-classic.settings';

/** display settings that are not part of the renderer (frame limit, FPS counter) */
export const disp = { fpsCap: 0, fpsShow: false };

interface Stored {
  gfx?: Partial<typeof GFX_PRESETS.hoch>;
  disp?: Partial<typeof disp>;
  snd?: Partial<typeof vol> & { on?: boolean };
}
function save() {
  const s: Stored = {
    gfx: { scale: gfx.scale, shadow: gfx.shadow, aa: gfx.aa, bloom: gfx.bloom, particles: gfx.particles, outline: gfx.outline },
    disp: { ...disp }, snd: { ...vol, on: audio.on },
  };
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* no storage */ }
}
const DEF_PRESET: GfxPreset = isTouch ? 'mittel' : 'hoch';
const DEF_VOL = { master: 1, fx: 1, amb: 1, ui: 1, bgMute: true };

/** read the stored settings and apply them (before the first frame) */
export function loadSettings() {
  Object.assign(gfx, GFX_PRESETS[DEF_PRESET]);
  let s: Stored = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { /* broken / no storage */ }
  for (const k of Object.keys(GFX_PRESETS.hoch) as (keyof typeof GFX_PRESETS.hoch)[]) if (s.gfx && typeof s.gfx[k] === typeof gfx[k]) (gfx as any)[k] = s.gfx[k];
  gfx.auto = false; syncQuality();
  if (s.disp) { if (typeof s.disp.fpsCap === 'number') disp.fpsCap = s.disp.fpsCap; disp.fpsShow = !!s.disp.fpsShow; }
  if (s.snd) { for (const k of Object.keys(DEF_VOL) as (keyof typeof vol)[]) if (typeof s.snd[k] === typeof vol[k]) (vol as any)[k] = s.snd[k]; if (typeof s.snd.on === 'boolean') audio.on = s.snd.on; }
  applyQuality(); applyVolumes(); fpsMeter();
}
/** preset whose values equal the current ones, or null (own mix) */
function currentPreset(): GfxPreset | null {
  for (const p of Object.keys(GFX_PRESETS) as GfxPreset[]) {
    const v = GFX_PRESETS[p];
    if (v.scale === gfx.scale && v.shadow === gfx.shadow && v.aa === gfx.aa && v.bloom === gfx.bloom && v.particles === gfx.particles && v.outline === gfx.outline) return p;
  }
  return null;
}

// ---------- FPS counter ----------
let fpsEl: HTMLElement | null = null, fpsN = 0, fpsT = 0;
function fpsMeter() {
  if (disp.fpsShow && !fpsEl) { fpsEl = document.createElement('div'); fpsEl.id = 'fpsMeter'; document.body.appendChild(fpsEl); fpsT = performance.now(); fpsN = 0; }
  if (fpsEl) fpsEl.hidden = !disp.fpsShow;
}
/** called once per drawn frame */
export function fpsFrame(now: number) {
  if (!disp.fpsShow || !fpsEl) return;
  fpsN++; if (now - fpsT < 500) return;
  fpsEl.textContent = Math.round(fpsN * 1000 / (now - fpsT)) + ' FPS'; fpsN = 0; fpsT = now;
}

// ---------- rows ----------
const seg = (k: string, opts: [string | number, string][], cur: string | number | null) =>
  `<div class="seg" data-k="${k}" role="radiogroup">${opts.map(([v, l]) => `<button data-v="${v}" role="radio" aria-checked="${v === cur}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const tog = (k: string, on: boolean) => `<button class="coTog${on ? ' on' : ''}" data-k="${k}" role="switch" aria-checked="${on}"><i></i></button>`;
const slider = (k: string, v: number) => `<div class="opSl"><input type="range" min="0" max="100" step="1" value="${Math.round(v * 100)}" data-k="${k}" aria-label="${k}"><output>${Math.round(v * 100)}</output></div>`;
const row = (label: string, ctl: string, cls = '') => `<div class="opRow${cls}"><span>${label}</span>${ctl}</div>`;
const head = (t: string) => `<h3 class="opH">${t}</h3>`;
const canFull = () => !!document.documentElement.requestFullscreen && (document as any).fullscreenEnabled !== false;

export const TAB_ICONS: Record<Tab, string> = {
  gfx: '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M9 20h6M12 16.5V20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M6.5 13.5l3.5-4 2.5 2.5 2-2 3 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  snd: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  ctrl: '<svg viewBox="0 0 24 24"><rect x="2.5" y="7" width="19" height="11" rx="5.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M7.5 10.5v4M5.5 12.5h4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="15.5" cy="11.2" r="1.3" fill="currentColor"/><circle cx="17.8" cy="13.8" r="1.3" fill="currentColor"/></svg>',
  game: '<svg viewBox="0 0 24 24"><path d="M12 21V11" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M12 12c-1-4.5-4.5-6.5-8-6 0 4 3 6.5 8 6zM12 10c.5-4 3.5-6.5 8-6.5-.3 4.5-3.5 6.5-8 6.5z" fill="currentColor"/></svg>',
  cheat: '<svg viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  cred: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10A4.2 4.2 0 0112 7.6 4.2 4.2 0 0119.5 10c0 5.4-7.5 10-7.5 10z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/></svg>',
};

/** the Grafik / Ton / Spiel pages; Steuerung, Cheats and Credits are filled by main.ts */
export class SettingsPages {
  onChange: () => void = () => {};
  render(tab: Tab, el: HTMLElement) {
    if (tab === 'gfx') this.gfx(el);
    else if (tab === 'snd') this.snd(el);
    else if (tab === 'game') this.game(el);
  }
  /** Standard: the tab's values back to the defaults */
  reset(tab: Tab, el: HTMLElement) {
    if (tab === 'gfx') { Object.assign(gfx, GFX_PRESETS[DEF_PRESET]); syncQuality(); disp.fpsCap = 0; disp.fpsShow = false; applyQuality(); fpsMeter(); }
    if (tab === 'snd') { Object.assign(vol, DEF_VOL); if (!audio.on) { audio.on = true; ambient(true); } applyVolumes(); }
    if (tab === 'game') { setTutorialOn(true); setShowKeys(false); }
    save(); this.render(tab, el); this.onChange();
  }

  private gfx(el: HTMLElement) {
    const P = currentPreset();
    el.innerHTML =
      row('Voreinstellung', seg('preset', [['niedrig', 'Niedrig'], ['mittel', 'Mittel'], ['hoch', 'Hoch'], ['ultra', 'Ultra']], P), ' opWide') +
      head('Bild') +
      row('Renderauflösung', seg('scale', [[.5, '50 %'], [.67, '67 %'], [.75, '75 %'], [.85, '85 %'], [1, '100 %']], gfx.scale), ' opWide') +
      row('Kantenglättung', seg('aa', [[0, 'Aus'], [2, '2×'], [4, '4×']], gfx.aa)) +
      row('Bildrate', seg('fpsCap', [[30, '30'], [60, '60'], [120, '120'], [0, '∞']], disp.fpsCap)) +
      row('FPS anzeigen', tog('fpsShow', disp.fpsShow)) +
      (canFull() ? row('Vollbild', tog('full', !!document.fullscreenElement)) : '') +
      head('Effekte') +
      row('Schatten', seg('shadow', [[0, 'Aus'], [1024, 'Mittel'], [2048, 'Hoch'], [4096, 'Ultra']], gfx.shadow), ' opWide') +
      row('Partikel', seg('particles', [[.4, 'Wenig'], [.7, 'Mittel'], [1, 'Viel']], gfx.particles)) +
      row('Leuchten', tog('bloom', gfx.bloom)) +
      row('Umrisse', tog('outline', gfx.outline));
    this.wireSeg(el, (k, v) => {
      if (k === 'preset') Object.assign(gfx, GFX_PRESETS[v as GfxPreset]);
      else if (k === 'fpsCap') disp.fpsCap = +v;
      else (gfx as any)[k] = +v;
      syncQuality(); applyQuality(); save(); this.gfx(el);
    });
    this.wireTog(el, k => {
      if (k === 'fpsShow') { disp.fpsShow = !disp.fpsShow; fpsMeter(); }
      else if (k === 'full') { try { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); } catch { /* not allowed */ } setTimeout(() => this.gfx(el), 300); return; }
      else (gfx as any)[k] = !(gfx as any)[k];
      applyQuality(); save(); this.gfx(el);
    });
  }
  private snd(el: HTMLElement) {
    el.innerHTML =
      row('Ton', tog('on', audio.on)) +
      `<div class="opGrp${audio.on ? '' : ' off'}">` +
      row('Gesamt', slider('master', vol.master), ' opSlRow') +
      row('Effekte', slider('fx', vol.fx), ' opSlRow') +
      row('Umgebung', slider('amb', vol.amb), ' opSlRow') +
      row('Menü', slider('ui', vol.ui), ' opSlRow') +
      row('Im Hintergrund stumm', tog('bgMute', vol.bgMute)) +
      `</div>`;
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(i => {
      const k = i.dataset.k as 'master' | 'fx' | 'amb' | 'ui';
      i.addEventListener('input', () => { vol[k] = +i.value / 100; (i.nextElementSibling as HTMLElement).textContent = i.value; applyVolumes(); });
      // a short sample of the group when the slider is let go
      i.addEventListener('change', () => { save(); if (k === 'fx') play('cropRipe'); else if (k === 'ui' || k === 'master') sfx('ui.confirm'); });
    });
    this.wireTog(el, k => {
      if (k === 'on') { audio.on = !audio.on; ambient(audio.on); }
      else vol.bgMute = !vol.bgMute;
      applyVolumes(); save(); this.snd(el);
    });
  }
  private game(el: HTMLElement) {
    el.innerHTML =
      row('Tutorial', tog('tut', tutorialOn())) +
      (isTouch ? '' : row('Tastenhinweise', tog('keys', document.body.classList.contains('showKeys'))));
    this.wireTog(el, k => {
      if (k === 'tut') setTutorialOn(!tutorialOn());
      else setShowKeys(!document.body.classList.contains('showKeys'));
      this.game(el); this.onChange();
    });
  }
  private wireSeg(el: HTMLElement, f: (k: string, v: string) => void) {
    el.querySelectorAll<HTMLElement>('.seg button').forEach(b => b.addEventListener('click', () => { sfx('ui.click'); f((b.parentElement as HTMLElement).dataset.k!, b.dataset.v!); }));
  }
  private wireTog(el: HTMLElement, f: (k: string) => void) {
    el.querySelectorAll<HTMLElement>('.coTog').forEach(b => b.addEventListener('click', () => { sfx('ui.click'); f(b.dataset.k!); }));
  }
}
/** weapon bar key labels (same switch as the Alt key) */
function setShowKeys(on: boolean) {
  document.body.classList.toggle('showKeys', on);
  try { localStorage.setItem('pog-classic.showKeys', on ? '1' : '0'); } catch { /* no storage */ }
}
