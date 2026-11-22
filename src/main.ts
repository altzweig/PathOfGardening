// PathOfGardening: farming game loop (19.11.2026). Menu -> day on the farm -> evening in the house -> next day
// (21.11.2026: no weapon choice in the morning any more, the day starts right away with the hand rake).
// The old wave survival game lives in archiv/garden-defence-v1/.
import './style.css';
import './farm/farm.css';
import { applyQuality, gfx, isTouch, VP } from './view/core';
import { propOpts } from './world/props';
propOpts.lod = true; // far versions of the forest (performance plan 2.3)
import { updateTexQuality } from './view/textures';
import { ambient, audio, initAudio, setSoundConfig, sfx, tickAmbient, tickAudio, stopAllLoops } from './audio';
import { StartMenu } from './ui/startmenu';
import { creditsHtml } from './ui/credits';
import { loadLook } from './look';
import { FarmCfg, levelFor, loadFarmCfg, loadSounds } from './farm/config';
import { FarmState, checkQuests, endDay, gainXp, morningWeeds, newState, nextDay } from './farm/state';
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
import { sensRows } from './farm/sens';
import { ic } from './farm/ui/ficons';
import { LoadScreen } from './farm/ui/loading';
import { CutscenePlayer } from './farm/cutscene/cutscene';
import { faintCutscene } from './farm/cutscene/faint';
import { WINDOWS } from './farm/view/buildings';
import { play } from './audio';
import { Bot } from './farm/bot';
import { NetGuest, NetHost, Visitor, cleanCode, peek } from './farm/net';
import { Online, VisitAsk } from './online/online';
import { Phase, resetSnapSeq, applySnap, applyState, cleanIntent, predict, smooth, snapOf, stateOf, versionOf } from './farm/coop';
import type { Ev } from './farm/sim';
import * as THREE from 'three';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
/** co-op guest without a farm (Basti 22.11.2026): figure + level + XP of a wanderer, kept for the next visits */
const WANDER = 'pog-wanderer-v1';
const wanderer = (): { level: number; xp: number } => { try { const w = JSON.parse(localStorage.getItem(WANDER) ?? ''); if (w && Number.isFinite(w.xp)) return { level: w.level ?? 1, xp: w.xp }; } catch { /* none yet */ } return { level: 1, xp: 0 }; };
const saveWanderer = (w: { level: number; xp: number }) => { try { localStorage.setItem(WANDER, JSON.stringify(w)); } catch { /* private mode */ } };
const OVERLAYS = ['#menu', '#newGame', '#saves', '#options', '#credits', '#controls', '#pause', '#visit', '#coop', '#friends', '#joinSave', '#joining'];
const QL: Record<string, string> = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const SAVE_I = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 28c-6-3-10-8-10-15 4 0 8 1 10 4 2-3 6-4 10-4 0 7-4 12-10 15z" fill="currentColor" fill-opacity=".25"/><path d="M16 28V12M16 12c0-4 2-7 5-9"/></svg>';
const TRASH_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>';
const COPY_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';
const MSG_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>';
const GO_I = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-6 8 6v9h-5v-5h-6v5H4z"/></svg>';
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
  /** the house book opened during the day (key B / book button): the game is paused while it is open */
  private bookOpen = false;
  private mouse = { x: 0, y: 0 };
  private ending = false;
  /** the save this game writes to (null = tutorial: nothing is saved) */
  private slot: string | null = null;
  private tutorialMode = false;
  /** co-op test farmers (console: __pog.bot()) */
  private bots: Bot[] = [];
  private autoT = 0;
  // ---------------- co-op visits (22.11.2026) ----------------
  /** this farm is open for visitors */
  private netHost: NetHost | null = null;
  /** this device visits someone else's farm */
  private netGuest: NetGuest | null = null;
  /** who knocks: over the farm code (Visitor) or from the friends list (VisitAsk) */
  private asks: (Visitor | VisitAsk)[] = [];
  /** friends over Supabase (null = not configured): src/online/online.ts */
  private online: Online | null = null;
  /** a running knock at a friend's farm */
  private knock: { cancel: () => void } | null = null;
  private hostEv: Ev[] = []; private snapT = 0; private stT = 0; private lastSt = '';
  private gEv: Ev[] = []; private gSteer = 0; private gSt = '';
  /** where the guest comes from: one of its saves (XP go into that farm) or none (wanderer profile, Basti 22.11.2026) */
  private gFrom: string | null | undefined = undefined;
  /** guest XP: from its farm / profile at the start, earned on this visit and not booked yet, the farmer's XP of today so far */
  /** when the last snapshot came (the owner's tab in the background stops his farm: the guest sees an hourglass) */
  private gLast = 0;
  private gXp0 = 0; private gGain = 0; private gDayXp = 0; private gClaimed: Set<string> | null = null;
  /** guests on the farm or visiting: nothing pauses (Basti 22.11.2026) */
  get coopLive() { return !!this.netHost?.guests.length || !!this.netGuest; }
  /** cutscenes (21.11.2026): the faint scene runs on every faint */
  cut = new CutscenePlayer();
  private cdTick = -1;

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
    if (this.pendingVisit) this.openVisit(this.pendingVisit);
    void this.startOnline();
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
    addEventListener('keydown', e => { if (e.code === 'KeyB' && !e.repeat && !(e.target as HTMLElement)?.closest?.('input,textarea')) this.toggleBook(); });
    addEventListener('keydown', e => { if (e.code === 'KeyQ' && !e.repeat && this.mode === 'day' && !this.paused) { this.hud.toggleQuests(); sfx('ui.click'); } });
    click('#resumeBtn', () => this.togglePause());
    click('#leaveBtn', () => this.leave());
    this.input.onPause = () => { if (this.mode !== 'menu') this.togglePause(); };
    this.input.onUnlock = () => { if (this.mode === 'day' && !this.paused) this.togglePause(); };
    this.input.mouseSens = this.cfg.camera.mouse ?? .55;
    this.input.onZoom = dy => { if (this.mode === 'day' && !this.paused) this.view.zoomBy(dy); };
    addEventListener('wheel', e => { if (this.mode === 'day' && !this.paused) this.view.zoomBy(e.deltaY); }, { passive: true });
    addEventListener('pointermove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'day' && !this.paused) this.togglePause(); });
    this.house.onSound = k => sfx(k);
    this.house.onChange = () => { this.view.syncBuildings(); this.persist(false); this.sendState(true); };
    this.house.onSleep = () => this.sleep();
    this.house.onClose = () => this.closeBook();
    click('#fBook', () => this.toggleBook());
    // co-op
    click('#visitBtn', () => this.openVisit(''));
    click('#visitFrom', () => { const ids = [...listSaves().map(m => m.id), null]; this.gFrom = ids[(ids.indexOf(this.gFrom ?? null) + 1) % ids.length]; this.showFrom(); });
    click('#visitBack', () => this.only('#menu'));
    for (const id of ['#vJoin', '#pJoin']) this.wireJoin($(id));
    click('#friendBtn', () => this.openFriends('#menu'));
    click('#pFriendBtn', () => this.openFriends('#pause'));
    click('#frBack', () => { this.knock?.cancel(); this.knock = null; this.online?.markRead(); this.only(this.frBack); });
    $('#frCopy').innerHTML = COPY_I;
    click('#frCopy', () => { const c = this.online?.me.code; if (!c) return; navigator.clipboard?.writeText(c).then(() => this.toast('Code kopiert')).catch(() => prompt('Code', c)); });
    $('#frYes').innerHTML = YES_I; $('#frNo').innerHTML = NO_I;
    click('#frYes', () => void this.addFriend());
    click('#frNo', () => this.clearFound());
    $('#frForm').addEventListener('submit', e => e.preventDefault());
    $('#frCode').addEventListener('keydown', e => e.stopPropagation());
    $('#frCode').addEventListener('input', () => { const i = $('#frCode') as HTMLInputElement; i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); void this.findFriend(i.value); });
    click('#jsYes', () => this.joinGo(true));
    click('#jsNo', () => this.joinGo(false));
    click('#jsBack', () => { this.pendingJoin = null; this.only('#pause'); });
    click('#joinBack', () => { this.netGuest?.close(); this.netGuest = null; this.only('#menu'); this.updateMenu(); });
    click('#coopBtn', () => this.openCoop());
    click('#coopBack', () => this.only('#pause'));
    click('#coopClose', () => { this.closeFarm(); this.only('#pause'); });
    click('#coopCopy', () => { const u = this.inviteLink(); navigator.clipboard?.writeText(u).then(() => { $('#coopCopy').textContent = 'Kopiert'; setTimeout(() => { $('#coopCopy').textContent = 'Link kopieren'; }, 1500); }).catch(() => prompt('Link', u)); });
    $('#coopYes').innerHTML = YES_I; $('#coopNo').innerHTML = NO_I;
    click('#coopYes', () => this.answer(true));
    click('#coopNo', () => this.answer(false));
    const code = new URLSearchParams(location.search).get('hof'); if (code) this.pendingVisit = cleanCode(code);
  }
  /** an invitation link opened the game: the visit screen comes up after loading */
  private pendingVisit = '';
  private updateOpt() {
    for (const id of ['#qualBtn', '#pQualBtn']) $(id).textContent = 'Grafik: ' + QL[gfx.quality];
    for (const id of ['#sndBtn', '#pSndBtn']) $(id).textContent = 'Ton: ' + (audio.on ? 'An' : 'Aus');
  }
  private openControls(back: string) { this.backTo = back; this.only('#controls'); this.ctrlTab(this.input.lastTouch ? 'mobile' : 'pc'); }
  private ctrlTab(t: string) {
    document.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#ctrlView').innerHTML = t === 'pc' ? pcControls() : mobileControls();
    sensRows($('#ctrlSens'), t === 'pc' ? 'pc' : 'mobile');
  }

  // ---------------- saves ----------------
  /** writes the current game into its save (also in the middle of a day); `show` = save icon */
  persist(show = true) {
    if (this.netGuest) this.bookGuestXp(); // a guest keeps its XP of the visit
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
  private leave(save = true) {
    if (save) this.persist(false); // a day that is left halfway goes on from here next time
    else if (this.netGuest) this.bookGuestXp();
    this.house.closeDay();
    const visited = !this.slot && !this.tutorialMode; // back from someone else's farm (co-op guest)
    if (this.tutorialMode || visited) { // back to the farm of the newest save behind the menu
      const m = listSaves()[0], d = m ? readSave(this.cfg, m.id) : null;
      this.s = d?.s ?? newState(this.cfg); this.slot = null; this.tutorialMode = false;
    }
    $('#coopLag').hidden = true;
    this.closeFarm(); if (this.netGuest) { this.bookGuestXp(); this.netGuest.close(); this.netGuest = null; }
    this.paused = false; this.bookOpen = false; this.sim = null; this.tut = null; this.mode = 'menu';
    this.input.enabled = false; this.input.releaseAll(); this.input.unlock(); this.hud.show(false); this.hud.clear(); this.view.clearDynamic(); this.hud.fade(false);
    this.house.showEvening(false);
    this.house.s = this.s; this.view.setState(this.s);
    this.only('#menu'); this.updateMenu();
  }
  /** the house book over the running day (Basti 21.11.2026): pauses the game, Esc / B / the button close it again */
  private toggleBook() {
    if (this.bookOpen) { this.closeBook(); return; }
    if (this.netGuest && this.mode === 'evening' && !this.paused) { this.bookOpen = true; this.house.s = this.s; this.house.openDay({}); return; }
    if (this.mode !== 'day' || !this.sim || this.ending || this.paused || this.tut || this.cut.active) return;
    this.bookOpen = true; this.paused = true;
    this.input.releaseAll(); this.input.unlock();
    this.house.s = this.s; this.house.openDay(this.sim.got);
  }
  private closeBook() {
    if (!this.bookOpen) return;
    this.bookOpen = false; this.paused = false;
    this.house.closeDay();
    if (this.mode === 'day') this.input.lock();
  }
  private togglePause() {
    if (this.bookOpen) { this.closeBook(); return; }
    if (this.mode === 'menu' || this.ending || (this.mode === 'day' && !this.sim)) return;
    if (this.tut?.waitingForAttack) return;
    this.paused = !this.paused; this.only(this.paused ? '#pause' : null); if (this.paused) { this.updateOpt(); this.input.releaseAll(); this.input.unlock(); }
    else if (this.mode === 'day') this.input.lock(); // third person: back to the captured mouse
    $('#saveBtn').hidden = !this.slot || this.tutorialMode;
    $('#coopBtn').hidden = !this.slot || this.tutorialMode || !!this.netGuest;
    $('#pFriendBtn').hidden = !this.online;
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
    const sim = this.sim; // ... and not next to another farmer (co-op)
    sim.visible = (x, z) => { const p = this.view.screen(x, .3, z); return (p.x > -60 && p.x < VP.w + 60 && p.y > -60 && p.y < VP.h + 60) || sim.players.some(P => P !== sim.player && Math.hypot(P.x - x, P.z - z) < 22); };
    if (!tutorial) this.bots = this.bots.map(b => new Bot(sim.addPlayer(b.P.id, { name: b.P.name, look: b.P.look }))); else this.bots = [];
    for (const v of this.netHost?.guests ?? []) sim.addPlayer(v.id, { name: v.name, look: v.look });
    this.hostEv = []; this.sendState(true);
    this.view.clearDynamic(); this.view.setState(s); this.view.snapCamera(this.sim.player.x, this.sim.player.z); this.view.resetLight();
    this.tut = tutorial ? new Tutorial(this.cfg, this.sim, this.view, this.hud, () => this.input.lastTouch) : null;
    if (this.tut) this.tut.onDone = () => this.endOfDay('time');
    this.mode = 'day'; this.ending = false; this.paused = false;
    this.input.enabled = true; this.hud.show(true); this.hud.clear(); this.hud.fade(false);
  }
  private async endOfDay(reason: 'time' | 'faint') {
    if (this.ending || !this.sim) return; this.ending = true;
    const sim = this.sim, s = this.s;
    this.input.enabled = false; this.input.releaseAll(); this.input.unlock();
    if (reason === 'faint') sim.applyKO(); // the worst case: harvest of the day gone, every field trampled (Basti 21.11.2026)
    // stolen goods still on the ground are picked up in the evening
    else for (const l of sim.loot) { const n = l.n ?? 1; s.items[l.item] = (s.items[l.item] ?? 0) + n; sim.lost[l.item] = Math.max(0, (sim.lost[l.item] ?? 0) - n); }
    s.summary = { day: s.day, got: { ...sim.got }, lost: { ...sim.lost }, driven: sim.driven, xp: sim.xpGained, fainted: reason === 'faint', broken: sim.broken };
    if (reason === 'faint') await this.faintScene(sim);
    else { this.hud.fade(true, true); await wait(this.tut ? 200 : 1500); }
    if (this.tutorialMode) { // tutorial mode ends with the day: back to the menu
      this.ending = false; this.leave(); this.hud.fade(false, true); return;
    }
    s.tutorialDone = true;
    endDay(this.cfg, s); this.ending = false; this.persist(false); this.ending = true;
    this.sim = null; this.tut = null; this.view.clearDynamic(); this.hud.show(false); this.hud.clear();
    this.toEvening(true);
  }
  /** fainted: short fall into black, then the cutscene (first person, waking up in the evening), it ends in black */
  private async faintScene(sim: DaySim) {
    this.hud.fade(true); await wait(550);
    this.hud.show(false); this.hud.clear(); this.view.hover = null;
    sim.animals.length = 0; sim.pellets.length = 0; // they are gone when the farmer wakes up
    const H = this.cfg.hof, P = sim.player;
    // the trampled field next to the farmer (all are trampled now) and where he lies: a few metres in front of it
    let fi = -1, fd = 1e9;
    H.plots.forEach((p, i) => { if (!this.s.plots[i].open) return; const d = Math.hypot(p.x - P.x, p.z - P.z); if (d < fd) { fd = d; fi = i; } });
    const field = fi >= 0 ? H.plots[fi] : { x: P.x + 3, z: P.z };
    // the lit window of the main house nearest to the farmer
    const house = this.view.buildings.get('house'); house?.root.updateMatrixWorld(true);
    let light = { x: H.door.x, y: 1.7, z: H.door.z }, ld = 1e9;
    for (const w of WINDOWS) { let o: THREE.Object3D | null = w, inHouse = false; while (o) { if (o === house?.root) inHouse = true; o = o.parent; } if (!inHouse) continue;
      const p = w.getWorldPosition(new THREE.Vector3()), d = Math.hypot(p.x - P.x, p.z - P.z); if (d < ld) { ld = d; light = { x: p.x, y: p.y, z: p.z }; } }
    // lie between the field and the house, 3 m from the field (pushed out of anything solid): the lights ahead, the field behind
    const dx = light.x - field.x, dz = light.z - field.z, l = Math.hypot(dx, dz) || 1;
    const c = this.hof.collide(field.x + dx / l * 3.2, field.z + dz / l * 3.2, .45, true);
    this.view.hour = this.cfg.night.light[1];
    this.view.resetLight();
    const done = this.cut.play(faintCutscene({ at: c, light, field }));
    this.hud.fade(false);
    await done;
    this.hud.fade(true); const f = $('#fFade'); f.style.transitionDuration = '0s'; void f.offsetWidth; // black stays: the evening fades in from it
    this.cut.stop(); this.view.cine = null; this.view.hour = null;
  }
  private toEvening(fade: boolean) {
    this.mode = 'evening'; this.view.setState(this.s); this.house.s = this.s; this.view.resetLight();
    this.house.tab = 'quests'; this.house.showEvening(true); // Basti 22.11.2026: the evening opens on orders + farm shop
    this.sendState(true);
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
    if (this.netGuest) this.tickGuest(dt); else this.tick(dt);
    if (this.cut.active) this.view.cine = this.cut.update(dt);
    const sim = this.sim;
    const frozen = this.paused && !this.coopLive;
    // performance plan 1.1: under the book (evening room / day book) the world is not drawn; the canvas keeps its last frame
    this.view.render3d = !this.house.covering;
    this.view.frame(frozen ? 0 : dt, this.mode === 'day' ? sim : null, this.mode === 'menu' ? 'menu' : this.mode === 'day' ? 'day' : 'evening');
    if ((frozen || this.netGuest) && sim) sim.ev.length = 0;
  }
  /** autosave every few minutes of real play time (not while paused or in the menu) */
  private autosave(dt: number) {
    if (this.cfg && this.mode !== 'menu' && !this.paused && this.slot && (this.autoT += dt) >= (this.cfg.saves?.autosave ?? 300)) this.persist();
  }
  /** simulation + HUD of one step (also used by tests to fast-forward without rendering) */
  tick(dt: number) {
    const sim = this.sim;
    if (this.mode !== 'day' || !sim || (this.paused && !this.coopLive)) return;
    const hover = this.input.hover(sim, this.view), info = hover ? sim.actionFor(hover) : null;
    this.view.hover = info ? hover : null; this.view.hoverOk = info?.ok ?? true; // nearest spot with nothing to do: no glow
    let it = this.input.intent(sim, this.view);
    // camera turning; the stick / WASD walk relative to the view
    const r = this.input.takeRotate(); if (r.dx || r.dy) this.view.rotateBy(r.dx, r.dy); this.view.follow = this.input.lastTouch;
    const cy = Math.cos(this.view.camYaw), sy = Math.sin(this.view.camYaw), mx = it.mx, mz = it.mz;
    it.mx = mx * cy + mz * sy; it.mz = -mx * sy + mz * cy;
    if (this.tut) it = this.tut.update(dt, it);
    if (this.paused) it = { ...it, mx: 0, mz: 0, act: null, hold: false, holdAt: null, attack: false }; // co-op: the game goes on behind the menu
    for (const b of this.bots) sim.intents.set(b.P.id, b.intent(sim));
    sim.update(dt, it);
    this.sendSnap(dt);
    for (const e of sim.ev) {
      if (e.k === 'store' && (e.pid ?? 0) === sim.localId) this.hud.harvest(e.x ?? sim.player.x, e.z ?? sim.player.z, e.item, e.n, !!e.lucky);
      if (e.k === 'faint') this.endOfDay('faint');
      if (e.k === 'xp' && (e.pid ?? 0) === sim.localId) this.hud.float(e.x ?? sim.player.x, e.z ?? sim.player.z, `${ic('xp')}+${e.xp}`, 'xp');
      if (e.k === 'nightfall') this.hud.warn(true, this.cfg.night.warn);
      if (e.k === 'pocket') { let dy = 0; for (const [k, n] of Object.entries(e.items as Record<string, number>)) { this.hud.float(e.x + dy * .3, e.z, `${ic(k)}−${n}`, 'loss'); dy++; } }
    }
    // daily orders: delivered as soon as all goods are in the storage (reward in the evening)
    if (this.s.tutorialDone) for (const q of checkQuests(this.cfg, this.s)) { sfx('ui.levelup'); this.hud.float(sim.player.x, sim.player.z, `${ic('check')}${q.title ?? ''}`, 'xp'); }
    if (sim.finished === 'time' && !this.tut) this.endOfDay('time');
    // last seconds before the night / of the night: a dry clock tick
    const left = sim.nightLen ? (sim.nightOn ? sim.nightLeft : sim.dayLeft) : 99, sec = Math.ceil(left);
    if (sec !== this.cdTick) { this.cdTick = sec; if (sec <= 10 && sec > 0 && !sim.finished) play('cdTick', sec <= 3); }
    this.hud.kb = this.input.kb || this.input.locked;
    this.hud.update(sim, this.s, this.view, hover, info, this.input.lastTouch, this.mouse);
  }
  // ---------------- co-op: the owner ----------------
  private inviteLink() { return `${location.origin}${location.pathname}?hof=${this.netHost?.code ?? ''}`; }
  /** pause menu "Besuch": opens the farm under a code (link to share), shows the guests */
  private async openCoop() {
    this.only('#coop'); this.coopList();
    if (!this.netHost) {
      const h = new NetHost(versionOf(this.cfg), this.cfg.coop?.maxPlayers ?? 4);
      h.onAsk = v => { this.asks.push(v); this.showAsk(); };
      h.onIntent = (id, i) => this.sim?.intents.set(id, cleanIntent(i));
      h.onLeave = v => { this.sim?.removePlayer(v.id); this.asks = this.asks.filter(a => a !== v); this.showAsk(); this.coopList(); };
      this.netHost = h;
      $('#coopCode').textContent = '…';
      h.onTicket = v => { if (h.let(v)) this.admit(v); };
      h.name = this.menu.look.name || 'Gast';
      try { $('#coopCode').textContent = await h.open(); void this.online?.setOpen(true); }
      catch { $('#coopCode').textContent = '—'; this.netHost = null; }
    } else $('#coopCode').textContent = this.netHost.code;
  }
  private closeFarm() {
    if (!this.netHost) return;
    for (const v of this.netHost.guests) this.sim?.removePlayer(v.id);
    this.netHost.close(); this.netHost = null;
    for (const a of this.asks) if (!('conn' in a)) void this.online?.answerVisit(a.id, false, '');
    this.asks = []; this.showAsk(); this.coopList(); void this.online?.setOpen(false);
  }
  private coopList() {
    const box = $('#coopList'), g = this.netHost?.guests ?? [];
    box.innerHTML = g.map(v => `<div class="cg" data-id="${v.id}"><b>${esc(v.name)}</b><i class="lv">${v.level}</i><button class="sDel" aria-label="Nach Hause schicken">${NO_I}</button></div>`).join('');
    box.querySelectorAll<HTMLElement>('.cg button').forEach(b => b.addEventListener('click', () => {
      const v = this.netHost?.guests.find(x => x.id === +b.closest<HTMLElement>('.cg')!.dataset.id!); if (!v) return;
      sfx('ui.click'); this.netHost!.deny(v); this.sim?.removePlayer(v.id); setTimeout(() => this.coopList(), 400);
    }));
    $('#coopClose').hidden = !this.netHost;
  }
  /** somebody knocks: name + level, the owner says yes or no */
  private showAsk() {
    const v = this.asks[0], box = $('#coopAsk'); box.hidden = !v;
    if (v) { $('#coopAskName').innerHTML = `${esc(v.name)} <i class="lv">${v.level}</i>`; sfx('ui.levelup'); }
  }
  /** a guest is in: on the farm right away during the day */
  private admit(v: Visitor) {
    if (this.mode === 'day' && this.sim) this.sim.addPlayer(v.id, { name: v.name, look: v.look });
    this.lastSt = ''; this.sendState(true); this.coopList();
  }
  private answer(yes: boolean) {
    const v = this.asks.shift(); this.showAsk(); const h = this.netHost; if (!v) return;
    if (!('conn' in v)) { // a friend from the friends list: yes = room code + ticket, it then comes in without a second question
      const room = yes && h ? h.code : '';
      void this.online?.answerVisit(v.id, !!room, room, t => h!.tickets.add(t));
      return;
    }
    if (!h) return;
    if (!yes) { h.deny(v); return; }
    if (h.let(v)) this.admit(v);
  }
  /** fast snapshot to every guest (20/s) */
  private sendSnap(dt: number) {
    const h = this.netHost, sim = this.sim; if (!h?.guests.length || !sim) { this.hostEv = []; return; }
    for (const e of sim.ev) if (e.k !== 'faint') this.hostEv.push(e);
    if ((this.snapT += dt) >= .05) { this.snapT = 0; h.broadcastFast({ t: 'sn', d: snapOf(sim, this.hostEv) }); this.hostEv = []; }
    if ((this.stT += dt) >= .25) this.sendState(false);
  }
  /** the whole farm to the guests: on every change of phase / in the book (now) or 4 times a second when it changed */
  private sendState(now: boolean) {
    const h = this.netHost; if (!h?.guests.length || this.mode === 'menu') return;
    this.stT = 0;
    const d = stateOf(this.mode === 'day' ? this.sim : null, this.s, this.mode === 'day' ? 'day' : 'evening');
    if (!now && d === this.lastSt) return;
    this.lastSt = d; h.broadcast({ t: 'st', d });
  }

  // ---------------- co-op: the guest ----------------
  private openVisit(code: string) {
    $('#visitMsg').textContent = '';
    if (this.gFrom === undefined || (this.gFrom && !listSaves().some(m => m.id === this.gFrom))) this.gFrom = listSaves()[0]?.id ?? null;
    this.showFrom();
    this.only('#visit');
    const i = $('#vJoin').querySelector('input')!; i.value = code; i.dispatchEvent(new Event('input'));
    if (!this.input.isTouch) setTimeout(() => i.focus(), 60);
  }
  /** a join row (main menu "Besuchen", pause menu): typing the code asks the farm whose it is, the button then says "Welt von …" */
  private wireJoin(form: HTMLElement) {
    const inp = form.querySelector('input')!, go = form.querySelector<HTMLButtonElement>('.jGo')!, small = go.querySelector('small')!;
    let ask: ReturnType<typeof peek> | null = null, name = '';
    inp.addEventListener('keydown', e => e.stopPropagation());
    inp.addEventListener('input', () => {
      inp.value = cleanCode(inp.value); ask?.cancel(); ask = null; name = ''; go.disabled = true; small.textContent = '';
      const code = inp.value; if (code.length < 5) return;
      if (this.netHost && code === this.netHost.code) { small.textContent = 'Dein Hof'; return; }
      small.textContent = '…'; const a = peek(code, versionOf(this.cfg)); ask = a;
      void a.done.then(r => {
        if (ask !== a) return; ask = null;
        if (typeof r === 'object') { name = r.name; small.textContent = 'Welt von ' + r.name; go.disabled = false; }
        else if (r === 'lost') go.disabled = false; // no answer in time: joining may still work (the farm says then)
        else small.textContent = { notfound: 'Kein Hof', version: 'Andere Version', full: 'Hof voll' }[r];
      });
    });
    form.addEventListener('submit', e => {
      e.preventDefault(); if (go.disabled || inp.value.length < 5) return;
      initAudio(); sfx('ui.confirm'); const code = inp.value; inp.value = ''; go.disabled = true; small.textContent = '';
      this.goJoin(code, name);
    });
  }
  /** join a farm: from my own farm first the question whether to save, then my world closes and the connecting screen comes */
  private pendingJoin: { code: string; name: string; ticket?: string } | null = null;
  private goJoin(code: string, name: string, ticket?: string) {
    this.pendingJoin = { code, name, ticket };
    if (this.mode !== 'menu' && this.slot && !this.tutorialMode && !this.netGuest) { this.only('#joinSave'); return; }
    this.joinGo(true);
  }
  private joinGo(save: boolean) {
    const j = this.pendingJoin; this.pendingJoin = null; if (!j) return;
    // where the guest's XP go: the farm it comes from (in the menu: the chosen one, tutorial: the wanderer profile)
    if (this.mode !== 'menu') { if (!this.netGuest) this.gFrom = this.tutorialMode ? null : this.slot; this.leave(save); }
    else if (this.gFrom === undefined || (this.gFrom && !listSaves().some(m => m.id === this.gFrom))) this.gFrom = listSaves()[0]?.id ?? null;
    $('#joinName').textContent = j.name || j.code; $('#joinMsg').textContent = '';
    this.only('#joining');
    this.join(j.code, j.ticket);
  }
  private join(code: string, ticket?: string) {
    this.netGuest?.close(); resetSnapSeq();
    const g = new NetGuest(), msg = $('#joinMsg');
    this.netGuest = g;
    this.gXp0 = this.fromXp(); this.gGain = 0; this.gDayXp = 0; this.gClaimed = null;
    const level = levelFor(this.cfg, this.gXp0);
    g.onWait = () => { msg.textContent = 'Klopf, klopf …'; };
    g.onWelcome = () => { msg.textContent = '✓'; };
    g.onMsg = m => {
      if (m.t === 'st') this.guestState(JSON.parse(m.d as string), m.d as string);
      else if (m.t === 'sn' && this.sim && this.mode === 'day') this.gLast = performance.now(), this.gEv.push(...applySnap(this.sim, JSON.parse(m.d as string), this.gSteer > 0));
    };
    g.onClose = why => {
      if (this.netGuest !== g) return;
      this.netGuest = null; const inGame = this.mode !== 'menu'; this.bookGuestXp();
      if (inGame) this.leave();
      this.openVisit('');
      $('#visitMsg').textContent = { full: 'Der Hof ist voll.', deny: 'Nicht reingelassen.', version: 'Andere Spielversion: bitte neu laden.', gone: 'Nach Hause geschickt.', lost: 'Verbindung verloren.', notfound: 'Kein Hof mit diesem Code.', bye: 'Der Hof wurde geschlossen.' }[why];
    };
    g.join(code, { v: versionOf(this.cfg), name: this.menu.look.name || 'Gast', look: this.menu.look, level, xp: this.gXp0, ticket });
  }
  /** the owner's farm arrived (or changed): day on the farm, or the evening with the book (read only) */
  private guestState(d: { ph: Phase; s: FarmState; d: any }, raw: string) {
    // orders the owner collected while the guest is there: the guest gets the same XP (Basti 22.11.2026)
    const claimed = new Set(d.s.quests.active.filter(q => q.claimed).map(q => q.id));
    if (this.gClaimed) for (const q of d.s.quests.active) if (q.claimed && !this.gClaimed.has(q.id)) { this.gGain += q.reward.xp; if (this.mode === 'evening') sfx('ui.levelup'); }
    this.gClaimed = claimed;
    if (d.ph === 'day') {
      if (this.mode !== 'day' || !this.sim || this.s.day !== d.s.day) {
        this.house.closeDay(); this.house.showEvening(false); this.bookOpen = false;
        this.s = d.s; this.slot = null; this.tutorialMode = false;
        const sim = new DaySim(this.cfg, this.s, this.hof, {}); sim.localId = this.netGuest!.id;
        sim.players = [sim.newPlayer(sim.localId, { guest: true, look: this.menu.look, name: this.menu.look.name })];
        this.sim = sim; this.tut = null; applyState(sim, this.s, d); this.gDayXp = 0;
        this.view.setLook(this.menu.look); this.house.s = this.s;
        this.view.clearDynamic(); this.view.setState(this.s); this.view.snapCamera(this.cfg.hof.door.x, this.cfg.hof.door.z); this.view.resetLight();
        this.only(null); this.mode = 'day'; this.ending = false; this.paused = false;
        this.input.enabled = true; this.hud.show(true); this.hud.clear(); this.hud.fade(false);
        this.gSt = raw; this.gLast = performance.now(); return;
      }
    } else if (this.mode !== 'evening') { // the owner went into the house: the guest reads along in the book
      this.only(null); this.mode = 'evening'; this.sim = null; this.input.enabled = false; this.input.releaseAll(); this.input.unlock();
      this.hud.show(false); this.hud.clear(); this.view.clearDynamic(); this.house.closeDay();
      Object.assign(this.s, d.s); this.view.setState(this.s); this.view.resetLight();
      this.bookOpen = true; this.house.s = this.s; this.house.openDay({}); this.gSt = raw; this.bookGuestXp(); return;
    }
    if (raw === this.gSt) return; this.gSt = raw;
    applyState(this.sim, this.s, d);
    if (this.bookOpen) this.house.render();
  }
  /** a guest's frame: no simulation, the owner's farm as it comes in, the own farmer walks ahead locally */
  private tickGuest(dt: number) {
    const sim = this.sim, g = this.netGuest;
    $('#coopLag').hidden = !(g && this.mode === 'day' && this.gLast && performance.now() - this.gLast > 2000);
    if (this.mode !== 'day' || !sim || !g) return;
    sim.ev.length = 0; sim.ev.push(...this.gEv); this.gEv = [];
    const hover = this.paused || this.bookOpen ? null : this.input.hover(sim, this.view), info = hover ? sim.actionFor(hover) : null;
    this.view.hover = info ? hover : null; this.view.hoverOk = info?.ok ?? true; // nearest spot with nothing to do: no glow
    let it = this.input.intent(sim, this.view);
    const r = this.input.takeRotate(); if (r.dx || r.dy) this.view.rotateBy(r.dx, r.dy); this.view.follow = this.input.lastTouch;
    const cy = Math.cos(this.view.camYaw), sy = Math.sin(this.view.camYaw), mx = it.mx, mz = it.mz;
    it.mx = mx * cy + mz * sy; it.mz = -mx * sy + mz * cy;
    if (this.paused || this.bookOpen) it = { ...it, mx: 0, mz: 0, act: null, hold: false, holdAt: null, attack: false };
    const steer = Math.hypot(it.mx, it.mz) > .15; this.gSteer = steer ? .3 : Math.max(0, this.gSteer - dt);
    sim.t += dt; smooth(sim, dt); if (steer) predict(sim, it, dt);
    const me = sim.player; if (me.xp > this.gDayXp) { this.gGain += me.xp - this.gDayXp; this.gDayXp = me.xp; }
    it.px = sim.player.x; it.pz = sim.player.z;
    g.send({ t: 'in', i: it });
    for (const e of sim.ev) {
      const mine = (e.pid ?? -1) === sim.localId;
      if (e.k === 'store' && mine) this.hud.harvest(e.x ?? sim.player.x, e.z ?? sim.player.z, e.item, e.n, !!e.lucky);
      if (e.k === 'xp' && mine) this.hud.float(e.x ?? sim.player.x, e.z ?? sim.player.z, `${ic('xp')}+${e.xp}`, 'xp');
      if (e.k === 'nightfall') this.hud.warn(true, this.cfg.night.warn);
      if (e.k === 'pocket' && mine) { let dy = 0; for (const [k, n] of Object.entries(e.items as Record<string, number>)) { this.hud.float(e.x + dy * .3, e.z, `${ic(k)}−${n}`, 'loss'); dy++; } }
    }
    this.hud.kb = this.input.kb || this.input.locked;
    // the guest's own level, XP and watering can over the owner's farm
    const own = Object.create(this.s) as FarmState, xp = this.gXp0 + this.gGain;
    own.xp = xp; own.level = levelFor(this.cfg, xp); own.water = me.water ?? 0;
    this.hud.update(sim, own, this.view, hover, info, this.input.lastTouch, this.mouse);
  }
  /** the guest's XP of this visit go into its own farm (or the wanderer profile): every evening and when it leaves */
  private bookGuestXp() {
    const n = this.gGain; if (n <= 0) return;
    this.gGain = 0; this.gXp0 += n;
    if (this.gFrom) {
      const d = readSave(this.cfg, this.gFrom); if (!d) return;
      gainXp(this.cfg, d.s, n); writeSave(this.gFrom, d.s, d.snap);
    } else { const w = wanderer(); w.xp += n; w.level = levelFor(this.cfg, w.xp); saveWanderer(w); }
  }
  private fromXp() { if (this.gFrom) return readSave(this.cfg, this.gFrom)?.s.xp ?? 0; return wanderer().xp; }
  private showFrom() {
    const m = listSaves().find(x => x.id === this.gFrom);
    $('#visitFrom').innerHTML = m ? `${ic('house')}${esc(m.name)} <i class="lv">${m.level}</i>` : `${ic('sun')}Ohne Hof <i class="lv">${levelFor(this.cfg, wanderer().xp)}</i>`;
  }

  // ---------------- friends (Supabase, Basti 22.11.2026) ----------------
  private toast(t: string, ms = 2600) { const e = $('#toast'); e.textContent = t; e.classList.add('in'); clearTimeout((e as any)._t); (e as any)._t = setTimeout(() => e.classList.remove('in'), ms); }
  /** best level of this device: the friends see it next to the name */
  private bestLevel() { return Math.max(levelFor(this.cfg, wanderer().xp), ...listSaves().map(m => m.level)); }
  private msgText(n: number) { return this.cfg.coop?.messages?.[n] ?? '…'; }
  private async startOnline() {
    const o = await Online.start(); if (!o) return;
    this.online = o; $('#friendBtn').hidden = false;
    o.onChange = () => { $('#friendDot').hidden = !o.asks.length && !o.unread.size; if (!$('#friends').hidden) this.friendList(); };
    o.onVisit = a => { if (!this.netHost) { void o.answerVisit(a.id, false, ''); return; } this.asks.push(a); this.showAsk(); };
    o.onMessage = (_from, name, n) => { sfx('ui.levelup'); this.toast(`${name}: ${this.msgText(n)}`, 4000); };
    try { await o.profile(this.menu.look.name || 'Gast', this.bestLevel()); await o.goOnline(); }
    catch (e) { console.warn('online', e); }
  }
  /** where "Zurück" in the friends list goes (main menu or pause menu) */
  private frBack = '#menu';
  /** the friend found by the code that is being typed */
  private found: { id: string; name: string; level: number; code: string } | null = null;
  /** friend whose message choice is open */
  private msgFor = '';
  private openFriends(back: string) {
    const o = this.online; if (!o) return;
    this.frBack = back; this.msgFor = '';
    $('#frMine').textContent = o.me.code || '…'; $('#frMsg').textContent = ''; ($('#frCode') as HTMLInputElement).value = ''; this.clearFound();
    this.only('#friends'); this.friendList();
    // without a code something is missing in Supabase: the reason shows (Basti sends it, 22.11.2026)
    void o.profile(this.menu.look.name || 'Gast', this.bestLevel()).then(() => { $('#frMine').textContent = o.me.code; })
      .catch((e: Error) => { $('#frMine').textContent = '—'; $('#frMsg').textContent = e.message || 'Keine Verbindung'; });
    void o.refresh();
  }
  private clearFound() { this.found = null; $('#frFound').hidden = true; }
  /** a full code typed: show whose it is, then add (✓) or not (✗) */
  private async findFriend(code: string) {
    const o = this.online; this.clearFound(); $('#frMsg').textContent = ''; if (!o || code.length < 6) return;
    const r = await o.lookup(code); if (($('#frCode') as HTMLInputElement).value !== code) return;
    if (r === 'self') { $('#frMsg').textContent = 'Das ist dein Code.'; return; }
    if (!r) { $('#frMsg').textContent = 'Kein Spieler mit diesem Code.'; return; }
    if (o.friends.some(f => f.id === r.id && !f.pending)) { $('#frMsg').textContent = `${r.name} ist schon dein Freund.`; return; }
    this.found = { ...r, code }; $('#frFoundName').innerHTML = `${esc(r.name)} <i class="lv">${r.level}</i>`; $('#frFound').hidden = false; sfx('ui.hover');
  }
  private async addFriend() {
    const o = this.online, f = this.found; if (!o || !f) return;
    this.clearFound(); ($('#frCode') as HTMLInputElement).value = '';
    const r = await o.addFriend(f.code);
    if (r === 'sent' || r === 'accepted') { sfx('ui.confirm'); this.toast(`${f.name} hinzugefügt`); }
    else $('#frMsg').textContent = r === 'error' ? 'Verbindung verloren.' : 'Kein Spieler mit diesem Code.';
  }
  private friendList() {
    const o = this.online; if (!o) return;
    const box = $('#frList'), msgs = this.cfg.coop?.messages ?? [];
    const status = (f: (typeof o.friends)[number]) => f.pending ? 'Angefragt' : f.open ? 'Hof offen' : f.online ? 'Online' : 'Offline';
    const last = (id: string) => { const m = o.inbox.get(id); return m ? `<small class="${o.unread.has(id) ? 'new' : ''}">„${esc(this.msgText(m.msg))}“</small>` : ''; };
    box.innerHTML = o.asks.map(a => `<div class="fr ask" data-ask="${a.id}"><div class="nm"><b>${esc(a.name)}</b><small>Anfrage</small></div><i class="lv">${a.level}</i><button class="sDel no" aria-label="Ablehnen">${NO_I}</button><button class="sDel yes" aria-label="Annehmen">${YES_I}</button></div>`).join('')
      + o.friends.map(f => `<div class="fr" data-id="${f.id}"><span class="dot${f.pending ? ' pend' : f.open ? ' open' : f.online ? ' on' : ''}"></span><div class="nm"><b>${esc(f.name)}</b>${last(f.id) || `<small>${status(f)}</small>`}</div><i class="lv">${f.level}</i>`
        + (f.open ? `<button class="sDel yes go" aria-label="Besuchen">${GO_I}</button>` : '')
        + (f.pending ? '' : `<button class="sDel msg" aria-label="Nachricht">${MSG_I}</button>`)
        + `<button class="sDel del" aria-label="Entfernen">${NO_I}</button></div>`
        + (this.msgFor === f.id ? `<div class="frMsgs" data-to="${f.id}">${msgs.map((t, i) => `<button data-m="${i}">${esc(t)}</button>`).join('')}</div>` : '')).join('');
    box.querySelectorAll<HTMLElement>('.fr.ask').forEach(r => r.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { sfx('ui.click'); void o.answerFriend(r.dataset.ask!, b.classList.contains('yes')); })));
    box.querySelectorAll<HTMLElement>('.fr[data-id]').forEach(r => {
      const id = r.dataset.id!;
      r.querySelector('.go')?.addEventListener('click', () => { sfx('ui.confirm'); this.visitFriend(id); });
      r.querySelector('.msg')?.addEventListener('click', () => { sfx('ui.click'); this.msgFor = this.msgFor === id ? '' : id; this.friendList(); });
      const del = r.querySelector<HTMLElement>('.del')!;
      // two taps remove a friend (no browser dialog)
      del.addEventListener('click', () => { sfx('ui.click'); if (del.classList.contains('sure')) void o.removeFriend(id); else { del.classList.add('sure'); setTimeout(() => del.classList.remove('sure'), 2500); } });
    });
    box.querySelectorAll<HTMLElement>('.frMsgs button').forEach(b => b.addEventListener('click', async () => {
      const to = b.parentElement!.dataset.to!, f = o.friends.find(x => x.id === to); this.msgFor = ''; this.friendList();
      sfx('ui.confirm'); this.toast(await o.send(to, +b.dataset.m!) ? `An ${f?.name ?? '?'}: ${b.textContent}` : 'Nicht gesendet');
    }));
  }
  /** knock at a friend's open farm: once the friend says yes, the game joins with room code + ticket */
  private visitFriend(id: string) {
    const o = this.online, f = o?.friends.find(x => x.id === id); if (!o || !f) return;
    const msg = $('#frMsg'); msg.textContent = `Klopf, klopf bei ${f.name} …`;
    this.knock?.cancel(); const k = o.visit(id); this.knock = k;
    k.done.then(({ room, ticket }) => { if (this.knock !== k) return; this.knock = null; msg.textContent = ''; this.goJoin(room, f.name, ticket); })
      .catch((e: Error) => { if (this.knock !== k) return; this.knock = null; msg.textContent = { deny: 'Nicht reingelassen.', timeout: 'Keine Antwort.', notfriend: 'Nicht reingelassen.', lost: 'Verbindung verloren.' }[e.message] ?? ''; });
  }

  /** tests (co-op without a network): n computer farmers join the farm, bot(0) sends them home */
  bot(n = 1) {
    const sim = this.sim; if (!sim || this.tut) return 'kein Tag';
    if (n <= 0) { for (const b of this.bots) sim.removePlayer(b.P.id); this.bots = []; return 0; }
    for (let i = 0; i < n && sim.players.length < (this.cfg.coop?.maxPlayers ?? 4); i++) { const id = Math.max(0, ...sim.players.map(p => p.id)) + 1; this.bots.push(Bot.add(sim, id)); }
    return this.bots.length;
  }
  /** tests: run the day for `sec` seconds without rendering */
  fast(sec: number) { for (let t = 0; t < sec && this.mode === 'day'; t += .05) this.tick(.05); }
}

new Game().boot();
