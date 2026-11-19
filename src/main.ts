// PathOfGardening: farming game loop (19.11.2026). Menu -> day on the farm -> evening in the house -> morning loadout -> next day.
// The old wave survival game lives in archiv/garden-defence-v1/.
import './style.css';
import './farm/farm.css';
import { applyQuality, gfx, isTouch } from './view/core';
import { ambient, audio, initAudio, setSoundConfig, sfx, tickAmbient, tickAudio, stopAllLoops } from './audio';
import { StartMenu } from './ui/startmenu';
import { creditsHtml } from './ui/credits';
import { loadLook } from './look';
import { FarmCfg, loadFarmCfg, loadSounds } from './farm/config';
import { FarmState, clearSave, endDay, hasSave, loadState, newState, nextDay, saveState, takeLoadout } from './farm/state';
import { Hof } from './farm/hof';
import { DaySim } from './farm/sim';
import { FarmView } from './farm/view/farmView';
import { FarmInput } from './farm/input';
import { FarmHud } from './farm/ui/hud';
import { HouseUi } from './farm/ui/house';
import { Tutorial } from './farm/tutorial';
import { mobileControls, pcControls } from './farm/ui/controls';
import { ic } from './farm/ui/ficons';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const OVERLAYS = ['#menu', '#confirmNew', '#options', '#credits', '#controls', '#pause'];
const QL: Record<string, string> = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

type Mode = 'menu' | 'day' | 'evening' | 'morning';

class Game {
  cfg!: FarmCfg; hof!: Hof; s!: FarmState;
  view!: FarmView; input = new FarmInput(isTouch); hud!: FarmHud; house!: HouseUi;
  sim: DaySim | null = null; tut: Tutorial | null = null;
  mode: Mode = 'menu';
  private menu = new StartMenu(loadLook());
  private backTo = '#menu';
  private paused = false;
  private mouse = { x: 0, y: 0 };
  private ending = false;

  async boot() {
    try { this.cfg = await loadFarmCfg(); }
    catch (e) { this.only('#menu'); const er = $('#menuErr'); er.hidden = false; er.textContent = 'balancing.yaml: ' + (e as Error).message; return; }
    setSoundConfig(await loadSounds());
    const q = new URLSearchParams(location.search).get('q'); if (q && q in QL) { gfx.quality = q as typeof gfx.quality; gfx.auto = false; } // ?q=niedrig (tests, slow devices)
    applyQuality();
    this.hof = new Hof(this.cfg);
    this.s = loadState(this.cfg) ?? newState(this.cfg);
    this.view = new FarmView(this.cfg, this.hof, this.s);
    this.view.setLook(this.menu.look);
    this.hud = new FarmHud(this.cfg);
    this.house = new HouseUi(this.cfg, this.s);
    this.view.floatXp = (x, z, xp) => this.hud.float(x, z, `${ic('xp')}+${xp}`, 'xp');
    this.wire();
    this.only('#menu'); this.updateMenu();
    let last = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); const dt = Math.min(.05, (now - last) / 1000); last = now; this.frame(dt); };
    requestAnimationFrame(loop);
    (window as any).__pog = this;
  }
  private only(id: string | null) { for (const o of OVERLAYS) $(o).hidden = o !== id; this.menu.setActive(id === '#menu'); }
  private updateMenu() { $('#playBtn').textContent = hasSave() ? 'Weiterspielen' : 'Spielen'; $('#newBtn').hidden = !hasSave(); }
  private wire() {
    const click = (id: string, f: () => void) => $(id).addEventListener('click', () => { initAudio(); ambient(audio.on); sfx('ui.click'); f(); });
    this.menu.onSound = k => sfx(k);
    click('#playBtn', () => this.play());
    click('#newBtn', () => this.only('#confirmNew'));
    click('#newYes', () => { clearSave(); this.s = newState(this.cfg); this.play(); });
    click('#newNo', () => this.only('#menu'));
    click('#optBtn', () => { this.backTo = '#menu'; this.updateOpt(); this.only('#options'); });
    click('#optBack', () => this.only(this.backTo === '#pause' ? '#pause' : '#menu'));
    click('#ctrlBtn', () => this.openControls('#options'));
    click('#pCtrlBtn', () => this.openControls('#pause'));
    click('#ctrlBack', () => this.only(this.backTo));
    click('#credBtn', () => { $('#credView').innerHTML = creditsHtml(); this.only('#credits'); });
    click('#credBack', () => this.only('#options'));
    for (const id of ['#qualBtn', '#pQualBtn']) click(id, () => { gfx.auto = false; gfx.quality = gfx.quality === 'hoch' ? 'mittel' : gfx.quality === 'mittel' ? 'niedrig' : 'hoch'; applyQuality(); this.updateOpt(); });
    for (const id of ['#sndBtn', '#pSndBtn']) click(id, () => { audio.on = !audio.on; ambient(audio.on); if (!audio.on) stopAllLoops(); this.updateOpt(); });
    document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => { sfx('ui.click'); this.ctrlTab(t.dataset.tab!); }));
    click('#fPause', () => this.togglePause());
    click('#resumeBtn', () => this.togglePause());
    click('#leaveBtn', () => this.leave());
    this.input.onPause = () => { if (this.mode === 'day') this.togglePause(); };
    addEventListener('wheel', e => { if (this.mode === 'day' && !this.paused) this.view.zoomBy(e.deltaY); }, { passive: true });
    addEventListener('pointermove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'day' && !this.paused) this.togglePause(); });
    this.house.onSound = k => sfx(k);
    this.house.onChange = () => { this.view.syncBuildings(); saveState(this.s); };
    this.house.onSleep = () => this.sleep();
    this.house.onStart = (w, a, n) => this.startMorning(w, a, n);
  }
  private updateOpt() {
    for (const id of ['#qualBtn', '#pQualBtn']) $(id).textContent = 'Grafik: ' + QL[gfx.quality];
    for (const id of ['#sndBtn', '#pSndBtn']) $(id).textContent = 'Ton: ' + (audio.on ? 'An' : 'Aus');
  }
  private openControls(back: string) { this.backTo = back; this.only('#controls'); this.ctrlTab(this.input.lastTouch ? 'mobile' : 'pc'); }
  private ctrlTab(t: string) {
    document.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#ctrlView').innerHTML = t === 'pc' ? pcControls() : mobileControls();
  }

  // ---------------- flow ----------------
  play() {
    this.view.setLook(this.menu.look);
    this.house.s = this.s; this.view.setState(this.s);
    this.only(null);
    try { if (this.input.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
    if (this.s.phase === 'evening') this.toEvening(false);
    else if (this.s.phase === 'morning') this.toMorning();
    else this.startDay();
  }
  private leave() {
    if (this.sim && this.mode === 'day') { /* a day that is left halfway starts again from the morning */ }
    this.paused = false; this.sim = null; this.tut = null; this.mode = 'menu';
    this.input.enabled = false; this.input.releaseAll(); this.hud.show(false); this.hud.clear(); this.view.clearDynamic(); this.hud.fade(false);
    this.house.showEvening(false); this.house.showMorning(false);
    this.only('#menu'); this.updateMenu();
  }
  private togglePause() {
    if (this.mode !== 'day' || !this.sim) return;
    if (this.tut?.waitingForAttack) return;
    this.paused = !this.paused; this.only(this.paused ? '#pause' : null); if (this.paused) { this.updateOpt(); this.input.releaseAll(); }
    sfx(this.paused ? 'ui.pauseIn' : 'ui.pauseOut');
  }
  startDay() {
    const s = this.s, tutorial = !s.tutorialDone;
    if (tutorial) { s.water = this.cfg.can.capacity; s.weapon = null; s.ammo = null; s.ammoCount = 0; }
    s.phase = 'day';
    this.sim = new DaySim(this.cfg, s, this.hof, { tutorial }); this.sim.initRipe();
    this.view.clearDynamic(); this.view.setState(s); this.view.snapCamera(this.sim.player.x, this.sim.player.z); this.view.resetLight();
    this.tut = tutorial ? new Tutorial(this.cfg, this.sim, this.view, this.hud, () => this.input.lastTouch) : null;
    if (this.tut) this.tut.onDone = () => this.endOfDay('time');
    this.mode = 'day'; this.ending = false; this.paused = false;
    this.input.enabled = true; this.hud.show(true); this.hud.clear(); this.hud.fade(false);
  }
  private async endOfDay(reason: 'time' | 'faint') {
    if (this.ending || !this.sim) return; this.ending = true;
    const sim = this.sim, s = this.s;
    this.input.enabled = false; this.input.releaseAll();
    if (reason === 'faint') sim.applyFaint();
    // stolen goods still on the ground are picked up in the evening
    for (const l of sim.loot) { s.items[l.item] = (s.items[l.item] ?? 0) + 1; sim.lost[l.item] = Math.max(0, (sim.lost[l.item] ?? 0) - 1); }
    s.summary = { day: s.day, got: { ...sim.got }, lost: { ...sim.lost }, driven: sim.driven, xp: sim.xpGained, fainted: reason === 'faint' };
    this.hud.fade(true, true); await wait(this.tut ? 200 : 1500);
    s.tutorialDone = true;
    endDay(this.cfg, s); saveState(s);
    this.sim = null; this.tut = null; this.view.clearDynamic(); this.hud.show(false); this.hud.clear();
    this.toEvening(true);
  }
  private toEvening(fade: boolean) {
    this.mode = 'evening'; this.view.setState(this.s); this.house.s = this.s; this.view.resetLight();
    this.house.tab = 'quests'; this.house.showEvening(true);
    if (fade) setTimeout(() => this.hud.fade(false, true), 300); else this.hud.fade(false);
  }
  private async sleep() {
    this.hud.fade(true, true); await wait(1500);
    this.house.showEvening(false);
    nextDay(this.cfg, this.s); saveState(this.s);
    this.toMorning(); this.hud.fade(false, true);
  }
  private toMorning() { this.mode = 'morning'; this.view.setState(this.s); this.house.s = this.s; this.house.showMorning(true); }
  private startMorning(w: Parameters<typeof takeLoadout>[2], a: string | null, n: number) {
    takeLoadout(this.cfg, this.s, w, a, n); saveState(this.s);
    this.house.showMorning(false); this.startDay();
  }

  // ---------------- per frame ----------------
  frame(dt: number) {
    tickAudio(dt); tickAmbient(dt);
    if (!this.view) return;
    this.tick(dt);
    const sim = this.sim;
    this.view.frame(this.paused ? 0 : dt, this.mode === 'day' ? sim : null, this.mode === 'menu' ? 'menu' : this.mode === 'day' ? 'day' : 'evening');
    if (this.paused && sim) sim.ev.length = 0;
  }
  /** simulation + HUD of one step (also used by tests to fast-forward without rendering) */
  tick(dt: number) {
    const sim = this.sim;
    if (this.mode !== 'day' || !sim || this.paused) return;
    const hover = this.input.hover(sim, this.view), info = hover ? sim.actionFor(hover) : null;
    this.view.hover = hover; this.view.hoverOk = info?.ok ?? true;
    let it = this.input.intent(sim, this.view);
    if (this.tut) it = this.tut.update(dt, it);
    sim.update(dt, it);
    for (const e of sim.ev) {
      if (e.k === 'store' && e.item !== 'blue') this.hud.float(this.cfg.hof.basket.x, this.cfg.hof.basket.z, `${ic(e.item)}+${e.n}`);
      if (e.k === 'faint') this.endOfDay('faint');
    }
    if (sim.finished === 'time' && !this.tut) this.endOfDay('time');
    this.hud.update(sim, this.s, this.view, hover, info, this.input.lastTouch, this.mouse);
  }
  /** tests: run the day for `sec` seconds without rendering */
  fast(sec: number) { for (let t = 0; t < sec && this.mode === 'day'; t += .05) this.tick(.05); }
}

new Game().boot();
