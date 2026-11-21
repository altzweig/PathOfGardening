// PathOfGardening: farming game loop (19.11.2026). Menu -> day on the farm -> evening in the house -> next day
// (21.11.2026: no weapon choice in the morning any more, the day starts right away with the hand rake).
// The old wave survival game lives in archiv/garden-defence-v1/.
import './style.css';
import './farm/farm.css';
import { applyQuality, gfx, isTouch } from './view/core';
import { updateTexQuality } from './view/textures';
import { ambient, audio, initAudio, setSoundConfig, sfx, tickAmbient, tickAudio, stopAllLoops } from './audio';
import { StartMenu } from './ui/startmenu';
import { creditsHtml } from './ui/credits';
import { loadLook } from './look';
import { FarmCfg, loadFarmCfg, loadSounds } from './farm/config';
import { FarmState, checkQuests, endDay, morningWeeds, newState, nextDay } from './farm/state';
import { SaveMeta, createSave, deleteSave, freeName, listSaves, migrateOldSave, readSave, writeSave } from './farm/saves';
import type { DaySnap } from './farm/sim';
import { Hof } from './farm/hof';
import { DaySim } from './farm/sim';
import { FarmView } from './farm/view/farmView';
import { FarmInput } from './farm/input';
import { FarmHud } from './farm/ui/hud';
import { HouseUi } from './farm/ui/house';
import { Tutorial } from './farm/tutorial';
import { mobileControls, pcControls } from './farm/ui/controls';
import { ic } from './farm/ui/ficons';
import { LoadScreen } from './farm/ui/loading';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const OVERLAYS = ['#menu', '#newGame', '#saves', '#options', '#credits', '#controls', '#pause'];
const QL: Record<string, string> = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const SAVE_I = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 28c-6-3-10-8-10-15 4 0 8 1 10 4 2-3 6-4 10-4 0 7-4 12-10 15z" fill="currentColor" fill-opacity=".25"/><path d="M16 28V12M16 12c0-4 2-7 5-9"/></svg>';
const TRASH_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
const YES_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
const NO_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const MENU_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
/** "Basti" -> "Bastis Hof", "Hans" -> "Hans' Hof" */
const farmName = (n: string) => (n.trim() || 'Mein') === 'Mein' ? 'Mein Hof' : /[sßxz]$/i.test(n.trim()) ? `${n.trim()}' Hof` : `${n.trim()}s Hof`;
const when = (ms: number) => { const d = new Date(ms), p = (x: number) => String(x).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`; };

type Mode = 'menu' | 'day' | 'evening';

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
  /** the save this game writes to (null = tutorial: nothing is saved) */
  private slot: string | null = null;
  private tutorialMode = false;
  private autoT = 0;

  async boot() {
    const load = new LoadScreen(); load.set(.08);
    try { this.cfg = await loadFarmCfg(); }
    catch (e) { await load.finish(null); this.only('#menu'); const er = $('#menuErr'); er.hidden = false; er.textContent = 'balancing.yaml: ' + (e as Error).message; load.fadeOut(null); return; }
    load.startTips(this.cfg); load.set(.15);
    setSoundConfig(await loadSounds());
    load.loaders(.2, .9); // models + textures
    const q = new URLSearchParams(location.search).get('q'); if (q && q in QL) { gfx.quality = q as typeof gfx.quality; gfx.auto = false; } // ?q=niedrig (tests, slow devices)
    applyQuality(); updateTexQuality();
    this.hof = new Hof(this.cfg);
    migrateOldSave(this.cfg, farmName(this.menu.look.name));
    // the menu shows the farm of the newest save behind it
    const newest = listSaves()[0], data = newest ? readSave(this.cfg, newest.id) : null;
    this.s = data?.s ?? newState(this.cfg);
    this.view = new FarmView(this.cfg, this.hof, this.s);
    this.view.setLook(this.menu.look);
    this.hud = new FarmHud(this.cfg);
    this.house = new HouseUi(this.cfg, this.s);
    this.view.floatXp = (x, z, xp) => this.hud.float(x, z, `${ic('xp')}+${xp}`, 'xp');
    this.wire();
    this.only(null); this.updateMenu();
    let last = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); const raw = (now - last) / 1000, dt = Math.min(.05, raw); last = now; this.autosave(Math.min(1, raw)); this.frame(dt); };
    requestAnimationFrame(loop);
    (window as any).__pog = this;
    // wait for the forest, then a few rendered frames (shader compile) so the menu starts smooth
    await this.view.world.ready; load.set(.93);
    for (let i = 0; i < 3; i++) await new Promise(r => requestAnimationFrame(r));
    await load.finish(this.cfg);
    this.only('#menu');
    await load.fadeOut(this.cfg);
  }
  private only(id: string | null) { for (const o of OVERLAYS) $(o).hidden = o !== id; this.menu.setActive(id === '#menu'); }
  private updateMenu() {
    const any = listSaves().length > 0;
    $('#playBtn').hidden = !any; $('#loadBtn').hidden = !any;
    $('#newBtn').classList.toggle('main', !any);
  }
  private wire() {
    const click = (id: string, f: () => void) => $(id).addEventListener('click', () => { initAudio(); ambient(audio.on); sfx('ui.click'); f(); });
    this.menu.onSound = k => sfx(k);
    click('#playBtn', () => { const m = listSaves()[0]; if (m) this.load(m.id); });
    click('#newBtn', () => this.openNew());
    $('#newForm').addEventListener('submit', e => { e.preventDefault(); initAudio(); sfx('ui.confirm'); this.startNew(); });
    $('#newName').addEventListener('keydown', e => e.stopPropagation());
    click('#newNo', () => this.only('#menu'));
    click('#loadBtn', () => this.openSaves());
    click('#savesBack', () => this.only('#menu'));
    click('#tutBtn', () => this.startTutorial());
    click('#saveBtn', () => this.manualSave());
    document.querySelectorAll<HTMLElement>('.hMenu').forEach(b => { b.innerHTML = MENU_I; b.addEventListener('click', () => { sfx('ui.click'); this.togglePause(); }); });
    $('#saveIco').innerHTML = SAVE_I;
    // closing the tab / switching apps on the phone: keep the progress
    addEventListener('pagehide', () => this.persist(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.persist(false); });
    click('#optBtn', () => { this.backTo = '#menu'; this.updateOpt(); this.only('#options'); });
    click('#optBack', () => this.only(this.backTo === '#pause' ? '#pause' : '#menu'));
    click('#ctrlBtn', () => this.openControls('#options'));
    click('#pCtrlBtn', () => this.openControls('#pause'));
    click('#ctrlBack', () => this.only(this.backTo));
    click('#credBtn', () => { $('#credView').innerHTML = creditsHtml(); this.only('#credits'); });
    click('#credBack', () => this.only('#options'));
    for (const id of ['#qualBtn', '#pQualBtn']) click(id, () => { gfx.auto = false; gfx.quality = gfx.quality === 'hoch' ? 'mittel' : gfx.quality === 'mittel' ? 'niedrig' : 'hoch'; applyQuality(); updateTexQuality(); this.updateOpt(); });
    for (const id of ['#sndBtn', '#pSndBtn']) click(id, () => { audio.on = !audio.on; ambient(audio.on); if (!audio.on) stopAllLoops(); this.updateOpt(); });
    document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => { sfx('ui.click'); this.ctrlTab(t.dataset.tab!); }));
    click('#fPause', () => this.togglePause());
    addEventListener('keydown', e => { if (e.code === 'KeyQ' && !e.repeat && this.mode === 'day' && !this.paused) { this.hud.toggleQuests(); sfx('ui.click'); } });
    click('#resumeBtn', () => this.togglePause());
    click('#leaveBtn', () => this.leave());
    this.input.onPause = () => { if (this.mode !== 'menu') this.togglePause(); };
    addEventListener('wheel', e => { if (this.mode === 'day' && !this.paused) this.view.zoomBy(e.deltaY); }, { passive: true });
    addEventListener('pointermove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'day' && !this.paused) this.togglePause(); });
    this.house.onSound = k => sfx(k);
    this.house.onChange = () => { this.view.syncBuildings(); this.persist(false); };
    this.house.onSleep = () => this.sleep();
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

  // ---------------- saves ----------------
  /** writes the current game into its save (also in the middle of a day); `show` = save icon */
  persist(show = true) {
    if (!this.slot || this.tutorialMode || this.mode === 'menu' || this.ending) return false;
    const snap = this.mode === 'day' && this.sim ? this.sim.snapshot() : null;
    const ok = writeSave(this.slot, this.s, snap);
    this.autoT = 0;
    if (ok && show) { const i = $('#saveIco'); i.classList.remove('on'); void i.offsetWidth; i.classList.add('on'); clearTimeout((i as any)._t); (i as any)._t = setTimeout(() => i.classList.remove('on'), 1400); }
    return ok;
  }
  private manualSave() {
    const b = $('#saveBtn') as HTMLButtonElement, ok = this.persist();
    if (!this.slot || this.tutorialMode) return;
    b.textContent = ok ? 'Gespeichert' : 'Speicher voll'; b.classList.toggle('done', ok); if (ok) sfx('ui.confirm');
    clearTimeout((b as any)._t); (b as any)._t = setTimeout(() => { b.textContent = 'Speichern'; b.classList.remove('done'); }, 1600);
  }
  private openNew() {
    const n = $('#newName') as HTMLInputElement; n.maxLength = this.cfg.saves?.nameMax ?? 24;
    n.value = freeName(farmName(this.menu.look.name));
    this.only('#newGame');
    if (!this.input.isTouch) setTimeout(() => { n.focus(); n.select(); }, 60);
  }
  /** "Neues Spiel": a fresh farm without the tutorial, starts with the first morning */
  private startNew() {
    const n = ($('#newName') as HTMLInputElement).value.trim() || freeName(farmName(this.menu.look.name));
    const s = newState(this.cfg); s.tutorialDone = true; s.phase = 'morning';
    const m = createSave(freeName(n), s);
    this.s = s; this.slot = m.id; this.tutorialMode = false; this.play();
  }
  /** "Tutorial": the tutorial day on a fresh farm, nothing is saved, back to the menu afterwards */
  private startTutorial() {
    this.s = newState(this.cfg); this.slot = null; this.tutorialMode = true; this.play();
  }
  private load(id: string) {
    const d = readSave(this.cfg, id);
    if (!d) { deleteSave(id); this.openSaves(); return; }
    this.s = d.s; this.slot = id; this.tutorialMode = false;
    if (!this.s.tutorialDone) this.s.tutorialDone = true; // a save never replays the tutorial
    this.play(d.snap);
  }
  private openSaves() {
    const list = listSaves();
    if (!list.length) { this.updateMenu(); this.only('#menu'); return; }
    const box = $('#saveList');
    const row = (m: SaveMeta) => `<div class="sv" role="button" tabindex="0" data-id="${m.id}"><div class="sMain"><b>${esc(m.name)}</b>
      <div class="sInfo"><span>${ic('sun')}${m.day}</span><span><i class="lv">${m.level}</i></span><span>${ic('coin')}${m.money}</span><time>${when(m.updated)}</time></div></div>
      <button class="sDel" aria-label="Löschen">${TRASH_I}</button></div>`;
    box.innerHTML = list.map(row).join('');
    box.querySelectorAll<HTMLElement>('.sv').forEach(el => {
      const id = el.dataset.id!;
      el.addEventListener('click', e => {
        const b = (e.target as HTMLElement).closest('button');
        if (b?.classList.contains('yes')) { sfx('ui.click'); deleteSave(id); this.openSaves(); return; }
        if (b?.classList.contains('no')) { sfx('ui.click'); this.openSaves(); return; }
        if (b?.classList.contains('sDel')) {
          sfx('ui.click'); el.classList.add('ask');
          b.outerHTML = `<button class="sDel no" aria-label="Zurück">${NO_I}</button><button class="sDel yes" aria-label="Löschen">${YES_I}</button>`; return;
        }
        if (el.classList.contains('ask')) return;
        initAudio(); ambient(audio.on); sfx('ui.confirm'); this.load(id);
      });
      el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === el) el.click(); });
      el.addEventListener('pointerenter', () => sfx('ui.hover'));
    });
    this.only('#saves');
  }

  // ---------------- flow ----------------
  play(snap: DaySnap | null = null) {
    this.view.setLook(this.menu.look);
    this.house.s = this.s; this.view.setState(this.s);
    this.only(null);
    try { if (this.input.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
    this.autoT = 0;
    if (this.s.phase === 'evening') this.toEvening(false);
    else if (this.s.phase === 'morning') this.startDay();
    else { this.startDay(); if (snap && this.sim) { this.sim.restore(snap); this.view.snapCamera(this.sim.player.x, this.sim.player.z); } }
  }
  private leave() {
    this.persist(false); // a day that is left halfway goes on from here next time
    if (this.tutorialMode) { // back to the farm of the newest save behind the menu
      const m = listSaves()[0], d = m ? readSave(this.cfg, m.id) : null;
      this.s = d?.s ?? newState(this.cfg); this.slot = null; this.tutorialMode = false;
    }
    this.paused = false; this.sim = null; this.tut = null; this.mode = 'menu';
    this.input.enabled = false; this.input.releaseAll(); this.hud.show(false); this.hud.clear(); this.view.clearDynamic(); this.hud.fade(false);
    this.house.showEvening(false);
    this.house.s = this.s; this.view.setState(this.s);
    this.only('#menu'); this.updateMenu();
  }
  private togglePause() {
    if (this.mode === 'menu' || this.ending || (this.mode === 'day' && !this.sim)) return;
    if (this.tut?.waitingForAttack) return;
    this.paused = !this.paused; this.only(this.paused ? '#pause' : null); if (this.paused) { this.updateOpt(); this.input.releaseAll(); }
    $('#saveBtn').hidden = !this.slot || this.tutorialMode;
    sfx(this.paused ? 'ui.pauseIn' : 'ui.pauseOut');
  }
  startDay() {
    const s = this.s, tutorial = !s.tutorialDone;
    if (tutorial) s.water = this.cfg.can.capacity;
    s.weapon = null; s.ammo = null; s.ammoCount = 0; // no weapons for now: the hand rake is always there
    morningWeeds(this.cfg, s, tutorial);             // new weeds on the plots, once per morning
    s.phase = 'day';
    this.sim = new DaySim(this.cfg, s, this.hof, { tutorial }); this.sim.initRipe();
    // weeds + forage only grow where nobody is looking
    this.sim.visible = (x, z) => { const p = this.view.screen(x, .3, z); return p.x > -60 && p.x < innerWidth + 60 && p.y > -60 && p.y < innerHeight + 60; };
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
    if (this.tutorialMode) { // tutorial mode ends with the day: back to the menu
      this.ending = false; this.leave(); this.hud.fade(false, true); return;
    }
    s.tutorialDone = true;
    endDay(this.cfg, s); this.ending = false; this.persist(false); this.ending = true;
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
    nextDay(this.cfg, this.s);
    this.startDay(); this.persist(false); this.hud.fade(false, true);
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
  /** autosave every few minutes of real play time (not while paused or in the menu) */
  private autosave(dt: number) {
    if (this.cfg && this.mode !== 'menu' && !this.paused && this.slot && (this.autoT += dt) >= (this.cfg.saves?.autosave ?? 300)) this.persist();
  }
  /** simulation + HUD of one step (also used by tests to fast-forward without rendering) */
  tick(dt: number) {
    const sim = this.sim;
    if (this.mode !== 'day' || !sim || this.paused) return;
    const hover = this.input.hover(sim, this.view), info = hover ? sim.actionFor(hover) : null;
    this.view.hover = hover; this.view.hoverOk = info?.ok ?? true;
    let it = this.input.intent(sim, this.view);
    // camera turning; the stick / WASD walk relative to the view
    const r = this.input.takeRotate(); if (r.dx || r.dy) this.view.rotateBy(r.dx, r.dy);
    const cy = Math.cos(this.view.camYaw), sy = Math.sin(this.view.camYaw), mx = it.mx, mz = it.mz;
    it.mx = mx * cy + mz * sy; it.mz = -mx * sy + mz * cy;
    if (this.tut) it = this.tut.update(dt, it);
    sim.update(dt, it);
    for (const e of sim.ev) {
      if (e.k === 'store') this.hud.float(e.x ?? sim.player.x, e.z ?? sim.player.z, `${ic(e.item)}+${e.n}`);
      if (e.k === 'faint') this.endOfDay('faint');
    }
    // daily orders: delivered as soon as all goods are in the storage (reward in the evening)
    if (this.s.tutorialDone) for (const q of checkQuests(this.cfg, this.s)) { sfx('ui.levelup'); this.hud.float(sim.player.x, sim.player.z, `${ic('check')}${q.title ?? ''}`, 'xp'); }
    if (sim.finished === 'time' && !this.tut) this.endOfDay('time');
    this.hud.update(sim, this.s, this.view, hover, info, this.input.lastTouch, this.mouse);
  }
  /** tests: run the day for `sec` seconds without rendering */
  fast(sec: number) { for (let t = 0; t < sec && this.mode === 'day'; t += .05) this.tick(.05); }
}

new Game().boot();
