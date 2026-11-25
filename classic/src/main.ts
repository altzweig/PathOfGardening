import './style.css';
import { Balancing, COMBOS, ComboId, EnemyType, FRUITS, FruitType, SKILLS, SkillId, WEAPONS, Weapon, loadBalancing, loadSounds } from './config';
import { SB_ENEMIES, Sim } from './sim/sim';
import type { Ev, Intent, Snap } from './sim/snap';
import { GameView } from './view/view';
import { applyQuality, gfx, isTouch } from './view/core';
import { Input } from './input/input';
import { Hud, PLAYER_CSS, cardEl } from './ui/hud';
import { Bulbs, WerkstattUI, hexEl } from './ui/werkstatt';
import { bulb, comboIcon, mini, pic, skillIcon } from './ui/icons';
import { mobileControls, pcControls } from './ui/controls';
import { Act, bind as bindKey, resetKeys } from './input/keys';
import { Tutorial, setTutorialOn, tutorialOn } from './ui/tutorial';
import { creditsHtml } from './ui/credits';
import { ambient, audio, initAudio, play, setSoundConfig, sfx, tickAmbient, tickAudio } from './audio';
import { Client, Host, LobbyPlayer } from './net/net';
import { GuestSync, MV, NetCfg, Rewind, guestQ, lerpSnap, netCfg, sharedQ } from './net/sync';
import { predictStep } from './sim/move';
import type { Player } from './sim/sim';
import { StartMenu } from './ui/startmenu';
import { Look, loadLook } from './look';
import { CHEAT_WEAPONS, loadCheats, saveCheats } from './ui/cheats';
import { TILE_TYPES } from './sim/sim';
import { SaveInfo, deleteSave, listSaves, loadGame, saveGame } from './save';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const OVERLAYS = ['#menu', '#saves', '#coop', '#lobby', '#options', '#credits', '#controls', '#levelup', '#pause', '#over', '#cheat', '#cheatOpt'];
let onMenu: (on: boolean) => void = () => {};
function only(id: string | null) { for (const o of OVERLAYS) show(o, o === id); onMenu(id === '#menu'); }

type Mode = 'idle' | 'solo' | 'host' | 'client';
const QL: Record<string, string> = { hoch: 'Hoch', mittel: 'Mittel', niedrig: 'Niedrig' };

class Game {
  cfg!: Balancing;
  mode: Mode = 'idle';
  sim: Sim | null = null;
  host: Host | null = null;
  client: Client | null = null;
  view = new GameView();
  input: Input;
  hud = new Hud();
  tut!: Tutorial;
  bulbs = new Bulbs();
  shop = new WerkstattUI(this.bulbs);
  private frozen = false; // pause / level-up state, for the slow-down + speed-up sounds
  me = 0;
  // co-op (25.11.2026 Koop-Netcode): fixed simulation ticks, snapshots between them drawn interpolated
  private nc!: NetCfg; private tickAcc = 0; private netTick = 0; private sendAcc = 0;
  private prevSnap: Snap | null = null; private curSnap: Snap | null = null; private viewEv: Ev[] = [];
  private rewind: Rewind | null = null; private gsync: GuestSync | null = null;
  /** guests whose figure waits for them (connection lost, or a saved co-op game not joined yet), by token */
  private parked = new Map<string, Player>();
  /** co-op save: token per player id (so a guest gets its figure back) */
  private coopToks = new Map<number, string>();
  private luShownFor = '';
  private overShown = false;
  private placeShown: string | null = null;
  private backTo = '#menu';
  private menu = new StartMenu(loadLook());
  get look(): Look { return this.menu.look; }

  constructor() {
    this.input = new Input(this.view, isTouch);
    this.view.onEvent = e => {
      if (e.k === 'pdie' && e.p === this.me) this.input.releaseAll();
      else if (e.k === 'idea') play('idea');
      else if (e.k === 'shopOpen' && e.p === this.me) { this.input.releaseAll(); play('shop'); }
      else if (e.k === 'buy' && e.p === this.me) play('buy', !!e.g);
      else if (e.k === 'reroll' && e.p === this.me) play('reroll');
      else if (e.k === 'merchCome') { play('merchBell'); this.hud.toast(this.view.cfg.names?.merchant ?? '', 'merch'); }
      else if (e.k === 'merchReady') { play('merchBell', .6); play('idea'); }
    };
    this.input.onPause = () => { if (this.building) { this.exitBuild(); return; } if (this.shop.open) { this.closeShop(); return; } this.togglePause(); };
    this.shop.onBuy = i => { if (this.mode === 'client') this.client?.send({ t: 'buy', i }); else this.sim?.buy(this.me, i); };
    this.shop.onClose = () => this.closeShop();
    this.shop.onReroll = () => { initAudio(); if (this.mode === 'client') this.client?.send({ t: 'reroll' }); else this.sim?.reroll(this.me); };
    this.shop.onDeny = () => play('deny');
  }
  async boot() {
    try { this.cfg = await loadBalancing(); }
    catch (e) { only('#menu'); const er = $('#menuErr'); er.hidden = false; er.textContent = 'balancing.yaml: ' + (e as Error).message; return; }
    this.view.setConfig(this.cfg);
    document.documentElement.style.setProperty('--uiFade', (this.cfg.transitions?.uiFade ?? .25) + 's');
    setSoundConfig(await loadSounds());
    applyQuality();
    this.idle();
    this.wire();
    this.renderMenuSaves();
    await this.view.prewarm(); // compile every weapon / effect shader now, not on its first use in the game
    only('#menu');
    let last = performance.now();
    let lastRaf = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); lastRaf = performance.now(); const dt = Math.min(.05, (now - last) / 1000); last = now; this.frame(dt); };
    requestAnimationFrame(loop);
    // browsers stop requestAnimationFrame in hidden tabs: a co-op host keeps simulating for the others
    // (timer runs in a worker because hidden tabs throttle normal timers to 1/s)
    const tick = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),50)'], { type: 'text/javascript' })));
    tick.onmessage = () => {
      const now = performance.now();
      if (this.mode !== 'host' || now - lastRaf < 250) return;
      const dt = Math.min(.1, (now - last) / 1000); last = now; this.frame(dt, true);
    };
    (window as any).__pog = this;
    if (location.search.includes('perf')) import('./view/core').then(c => { (window as any).__core = c; }); // perf measurements (tools/perf)
  }
  /** garden behind the menus */
  idle() {
    this.mode = 'idle'; this.sim = new Sim(this.cfg); this.view.reset(); this.view.me = -1; this.view.smooth = false;
    this.input.enabled = false; show('#hud', false);
  }
  private wire() {
    const click = (id: string, f: () => void) => $(id).addEventListener('click', () => { initAudio(); ambient(true); sfx('ui.click'); f(); });
    addEventListener('wheel', e => {
      if (this.sandbox) { if (!this.sbOpen && this.mode === 'solo') this.sbWheel(e.deltaY); return; } // test room: the wheel switches weapons
      if (this.mode !== 'idle' && !this.view.placing && $('#pause').hidden) this.view.zoomBy(e.deltaY);
    }, { passive: true });
    this.menu.onSound = k => sfx(k);
    onMenu = on => this.menu.setActive(on); this.menu.setActive(!$('#menu').hidden);
    click('#soloBtn', () => this.startSolo(false));
    click('#contBtn', () => { const l = listSaves(); if (l[0]) this.loadSave(l[0].id); });
    click('#savesBtn', () => this.openSaves());
    click('#savesBack', () => only('#menu'));
    click('#pSaveBtn', () => { const ok = this.autosave(true); const b = $('#pSaveBtn'); b.classList.add(ok ? 'saved' : 'failed'); setTimeout(() => b.classList.remove('saved', 'failed'), 1200); });
    addEventListener('pagehide', () => this.autosave(true));
    click('#testBtn', () => this.startSolo(true));
    click('#wtestBtn', () => this.startSandbox());
    this.wireSandbox();
    click('#cheatBtn', () => this.toggleCheat());
    click('#cheatClose', () => this.toggleCheat());
    this.input.onCheat = () => this.toggleCheat();
    this.input.onKeysToggle = () => this.hud.toggleKeys();
    this.tut = new Tutorial(this.input);
    this.tut.onSkip = () => { if (this.sim) this.sim.tutPause = false; this.updateOptLabels(); };
    for (const id of ['#tutBtn', '#pTutBtn']) click(id, () => { setTutorialOn(!tutorialOn()); this.updateOptLabels(); });
    click('#coopBtn', () => { $('#coopErr').hidden = true; only('#coop'); });
    click('#coopBack', () => only('#menu'));
    click('#optBtn', () => { this.backTo = '#menu'; this.updateOptLabels(); only('#options'); });
    click('#optBack', () => only(this.backTo === '#pause' ? '#pause' : '#menu'));
    click('#ctrlBtn', () => this.openControls('#options'));
    click('#pCtrlBtn', () => this.openControls('#pause'));
    click('#ctrlBack', () => { this.input.capture = null; only(this.backTo); });
    click('#keyReset', () => { resetKeys(); this.ctrlTab('pc'); });
    click('#credBtn', () => { $('#credView').innerHTML = creditsHtml(); only('#credits'); });
    click('#credBack', () => only('#options'));
    click('#cheatOptBtn', () => this.openCheatOpt('#options'));
    click('#pCheatOptBtn', () => this.openCheatOpt('#pause'));
    click('#coBack', () => this.closeCheatOpt());
    click('#buildBtn', () => this.enterBuild());
    click('#bDone', () => this.exitBuild());
    $('#bList').addEventListener('wheel', e => { const l = $('#bList'); if (l.scrollWidth > l.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { l.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false }); // PC: mouse wheel scrolls the bar sideways
    document.querySelectorAll<HTMLElement>('#bTools .bTool').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.tool as 'del' | 'down'; sfx('ui.click'); this.buildTool = this.buildTool === t ? 'build' : t; this.applyBuild();
    }));
    for (const id of ['#qualBtn', '#pQualBtn']) click(id, () => { gfx.auto = false; gfx.quality = gfx.quality === 'hoch' ? 'mittel' : gfx.quality === 'mittel' ? 'niedrig' : 'hoch'; applyQuality(); this.updateOptLabels(); });
    for (const id of ['#sndBtn', '#pSndBtn']) click(id, () => { audio.on = !audio.on; ambient(audio.on); this.updateOptLabels(); });
    document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => { sfx('ui.click'); this.ctrlTab(t.dataset.tab!); }));
    click('#hostBtn', () => this.hostGame());
    click('#joinBtn', () => this.joinGame());
    ($('#codeIn') as HTMLInputElement).addEventListener('keydown', e => { if (e.key === 'Enter') { initAudio(); this.joinGame(); } });
    click('#lobbyStart', () => this.startHost());
    click('#lobbyBack', () => this.leave());
    click('#pauseBtn', () => this.togglePause());
    click('#resumeBtn', () => this.togglePause());
    click('#restartBtn', () => { only(null); this.restart(); });
    click('#leaveBtn', () => this.leave());
    click('#againBtn', () => { only(null); this.restart(); });
    click('#overMenu', () => this.leave());
    // build mode input (mouse or touch on the 3D view)
    const canvas = $('#c');
    canvas.addEventListener('pointermove', e => { if (this.view.placing) this.view.setHover(e.clientX, e.clientY); });
    canvas.addEventListener('pointerdown', e => { if (this.view.placing) this.view.setHover(e.clientX, e.clientY); });
    canvas.addEventListener('pointerup', e => {
      if (this.building) { this.buildAt(e.clientX, e.clientY); return; }
      if (!this.view.placing || this.view.confirmSlot >= 0) return;
      const slot = this.view.slotFromScreen(e.clientX, e.clientY); if (slot < 0) return;
      // touch: first tap shows the preview (rates, neighbour synergies), a second tap on the same spot builds
      if (e.pointerType !== 'mouse' && slot !== this.touchSel) { this.touchSel = slot; this.view.setHover(e.clientX, e.clientY); sfx('ui.hover'); return; }
      this.touchSel = -1;
      // overbuilding another fruit: safety confirmation first
      const there = this.view.fieldTypeAt(slot);
      if (there && there !== this.view.placing) { this.askOverbuild(slot, there, this.view.placing); return; }
      this.doPlace(slot);
    });
    click('#pcYes', () => this.answerOverbuild(true));
    click('#pcNo', () => this.answerOverbuild(false));
    addEventListener('keydown', e => {
      if (this.building && e.key === 'Enter') { e.preventDefault(); this.exitBuild(); return; }
      if (this.view.confirmSlot < 0) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.answerOverbuild(true); }
      else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.answerOverbuild(false); }
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autosave(true); if (document.hidden && this.mode === 'solo' && !this.building && $('#pause').hidden && !this.sim?.paused) this.togglePause(); });
    this.updateOptLabels();
  }
  private touchSel = -1;
  closeShop() { initAudio(); sfx('ui.click'); if (this.mode === 'client') this.client?.send({ t: 'shopClose' }); else this.sim?.closeShop(this.me); }
  private doPlace(slot: number) {
    if (this.mode === 'client') this.client?.send({ t: 'place', slot }); else this.sim?.place(this.me, slot);
    sfx('ui.confirm');
  }
  private askOverbuild(slot: number, old: FruitType, neu: FruitType) {
    this.view.confirmSlot = slot; sfx('ui.click');
    $('#pcOld').innerHTML = pic('field_' + old); $('#pcNew').innerHTML = pic('field_' + neu);
    show('#placeConfirm', true);
  }
  private answerOverbuild(yes: boolean) {
    const slot = this.view.confirmSlot; if (slot < 0) return;
    this.view.confirmSlot = -1; show('#placeConfirm', false);
    if (yes && this.view.placing) this.doPlace(slot);
  }
  private updateOptLabels() {
    for (const id of ['#qualBtn', '#pQualBtn']) $(id).textContent = 'Grafik: ' + QL[gfx.quality];
    for (const id of ['#sndBtn', '#pSndBtn']) $(id).textContent = 'Ton: ' + (audio.on ? 'An' : 'Aus');
    for (const id of ['#tutBtn', '#pTutBtn']) $(id).textContent = 'Tutorial: ' + (tutorialOn() ? 'An' : 'Aus');
  }
  private openControls(back: string) { this.backTo = back; only('#controls'); this.ctrlTab(this.input.isTouch ? 'mobile' : 'pc'); }
  private ctrlTab(t: string) {
    document.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    this.input.capture = null;
    $('#ctrlView').innerHTML = t === 'pc' ? pcControls() : mobileControls();
    $('#keyReset').hidden = t !== 'pc';
    // 24.11.2026 (Basti): every key on the PC page can be changed: click it, press the new key (Esc = keep)
    if (t === 'pc') $('#ctrlView').querySelectorAll<SVGGElement>('.kbind').forEach(g => g.addEventListener('click', () => {
      sfx('ui.click');
      $('#ctrlView').querySelectorAll('.kbind.wait').forEach(o => o.classList.remove('wait'));
      g.classList.add('wait');
      this.input.capture = code => { this.input.capture = null; if (code) bindKey(g.dataset.act as Act, code); this.ctrlTab('pc'); };
    }));
  }
  enterGame() {
    this.exitBuild(); this.startCheats = false;
    only(null); show('#hud'); this.hud.reset(); this.tut.reset(); this.bulbs.reset(); this.shop.reset(); this.hud.names = (this.view.cfg.names.items ?? {}) as Record<string, string>; this.view.reset(); this.view.me = this.me;
    this.input.enabled = true; this.luShownFor = ''; this.overShown = false; this.syncBuildBtn();
    try { if (this.input.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
    try { (navigator as any).wakeLock?.request('screen').catch(() => {}); } catch { /* ignore */ }
  }

  // ---------- modes ----------
  testMode = false;
  startSolo(test = this.testMode) { this.endSandbox(); this.testMode = test; this.newSaveId(); show('#cheatBtn', test); this.mode = 'solo'; this.me = 0; this.sim = new Sim(this.cfg); this.sim.addPlayer(0, 0); this.view.setLooks([{ id: 0, look: this.look }]); this.view.smooth = false; this.enterGame(); this.startCheats = true; }
  // ---------- Spielstände (24.11.2026) ----------
  private saveId = ''; private saveStarted = 0; private saveT = 0; private saveWave = -1;
  private newSaveId() { this.saveId = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); this.saveStarted = Date.now(); this.saveT = 0; this.saveWave = -1; }
  /** only normal solo games are saved (no test mode, no weapon test room, no co-op) */
  private canSave() { return (this.mode === 'solo' || (this.mode === 'host' && !!this.host?.started)) && !this.testMode && !this.sandbox && !!this.sim && !!this.saveId && this.sim.phase !== 'over' && !this.sim.startPick; }
  autosave(force = false) {
    if (!this.canSave()) return false;
    if (!force && this.building) return false;
    this.saveT = 0; this.saveWave = this.sim!.wave;
    if (this.mode !== 'host') return saveGame(this.saveId, this.saveStarted, this.sim!, this.look);
    // co-op (25.11.2026): the host saves the whole game, guests that are away included, with their tokens
    const sim = this.sim!, away = [...this.parked.values()].filter(p => !sim.player(p.id));
    const seats = [...sim.players, ...away].filter(p => p.id !== this.me && this.coopToks.has(p.id)).map(p => ({ id: p.id, tok: this.coopToks.get(p.id)!, color: p.color }));
    sim.players.push(...away);
    try { return saveGame(this.saveId, this.saveStarted, sim, this.look, seats); } finally { sim.players.splice(sim.players.length - away.length, away.length); }
  }
  /** every cfg.save.autosave s of play and whenever a new wave starts */
  private tickSave(dt: number) {
    if (!this.canSave()) return;
    this.saveT += dt;
    if (this.saveT >= ((this.cfg as any).save?.autosave ?? 30) || (this.sim!.wave !== this.saveWave && this.saveWave >= 0)) this.autosave();
    else if (this.saveWave < 0) this.saveWave = this.sim!.wave;
  }
  loadSave(id: string) {
    const g = loadGame(id, this.cfg);
    if (!g) { deleteSave(id); this.renderMenuSaves(); return; }
    if (g.coop) { // co-op game: open the lobby again, the guests get their figures back when they join
      this.saveId = g.info.id; this.saveStarted = g.info.started || Date.now(); this.saveT = 0; this.saveWave = g.sim.wave;
      this.coopToks = new Map(g.coop.map(c => [c.id, c.tok]));
      this.hostGame(g.sim, g.coop); return;
    }
    this.endSandbox(); this.testMode = false; show('#cheatBtn', false);
    this.mode = 'solo'; this.me = g.sim.players[0]?.id ?? 0; this.sim = g.sim;
    this.saveId = g.info.id; this.saveStarted = g.info.started || Date.now(); this.saveT = 0; this.saveWave = g.sim.wave;
    this.view.setLooks([{ id: this.me, look: this.look }]); this.view.smooth = false;
    this.enterGame();
  }
  renderMenuSaves() {
    const l = listSaves(), top = l[0];
    show('#contBtn', !!top); show('#savesBtn', l.length > 0);
    $('#soloBtn').classList.toggle('main', !top);
    $('#contBtn').classList.toggle('main', !!top);
    if (top) $('#contBtn').innerHTML = `Weiterspielen<small>${saveLine(top)}</small>`;
    $('#soloBtn').textContent = top ? 'Neues Spiel' : 'Spielen';
  }
  private openSaves() {
    const l = listSaves(); if (!l.length) return;
    $('#savesList').innerHTML = l.map(s => `<div class="svRow"><button class="btn svLoad" data-id="${s.id}"><b>${s.coop ? `<span class="svCoop">${mini('player').repeat(Math.min(4, s.coop))}</span>` : ''}${esc(s.name || '—')}</b><small>${saveLine(s)}</small></button><button class="btn sec svDel" data-id="${s.id}" aria-label="Löschen">✕</button></div>`).join('');
    $('#savesList').querySelectorAll<HTMLElement>('.svLoad').forEach(b => b.addEventListener('click', () => { initAudio(); sfx('ui.confirm'); this.loadSave(b.dataset.id!); }));
    $('#savesList').querySelectorAll<HTMLElement>('.svDel').forEach(b => b.addEventListener('click', () => {
      sfx('ui.click'); const row = b.parentElement!;
      if (!row.classList.contains('ask')) { row.classList.add('ask'); b.textContent = '✓'; return; } // second tap deletes
      deleteSave(b.dataset.id!); this.renderMenuSaves(); if (listSaves().length) this.openSaves(); else only('#menu');
    }));
    only('#saves');
  }
  restart() {
    if (this.mode === 'solo' && this.sandbox) return this.startSandbox();
    if (this.mode === 'solo') return this.startSolo();
    if (this.mode === 'host' && this.host) { this.startHost(); }
  }
  private coopLoad: Sim | null = null; private skipStart = false;
  async hostGame(saved?: Sim, seats?: { id: number; tok: string; color: number }[]) {
    $('#coopErr').hidden = true; ($('#hostBtn') as HTMLButtonElement).disabled = true;
    const h = new Host(this.cfg); this.host = h; h.players[0].look = this.look;
    this.coopLoad = saved ?? null; if (!saved) this.coopToks.clear();
    if (saved && seats) { for (const c of seats) h.reserved.set(c.tok, { id: c.id, color: c.color }); h.reserveIds(Math.max(0, ...saved.players.map(p => p.id), ...seats.map(c => c.id)) + 1); }
    try { await h.open(); }
    catch { ($('#hostBtn') as HTMLButtonElement).disabled = false; $('#coopErr').hidden = false; $('#coopErr').textContent = '✕'; this.host = null; return; }
    ($('#hostBtn') as HTMLButtonElement).disabled = false;
    h.onChange = () => { this.view.setLooks(h.players); this.renderLobby(); };
    h.onPick = (id, key) => this.sim?.pick(id, key);
    h.onPlace = (id, slot) => this.sim?.place(id, slot);
    h.onBuy = (id, i) => this.sim?.buy(id, i);
    h.onShopClose = id => this.sim?.closeShop(id);
    h.onReroll = id => this.sim?.reroll(id);
    h.onJoin = (p, again) => { if (p.tok) this.coopToks.set(p.id, p.tok); if (this.mode === 'host' && this.sim && !again) this.seat(p); };
    h.onLeave = (id, gone) => {
      if (this.mode !== 'host' || !this.sim) return;
      const pl = this.sim.player(id); if (!pl) return;
      if (gone) { this.sim.setIntent(id, { ...pl.intent, mx: 0, mz: 0, fire: null }); return; } // waits net.reconnectWindow s
      const tok = this.coopToks.get(id); this.sim.removePlayer(id); if (tok) this.parked.set(tok, pl); // gone for good: kept for a later return
    };
    this.me = 0; this.renderLobby(); only('#lobby'); show('#lobbyStart');
  }
  startHost() {
    const h = this.host!; this.mode = 'host'; this.me = 0;
    const loaded = this.coopLoad; this.coopLoad = null;
    if (loaded) { // saved co-op game: players not here yet wait (parked) until they join
      this.sim = loaded; this.parked.clear();
      for (const pl of [...loaded.players]) if (pl.id !== 0 && !h.players.some(p => p.id === pl.id)) { const tok = this.coopToks.get(pl.id); loaded.removePlayer(pl.id); if (tok) this.parked.set(tok, pl); }
      const host = loaded.players.find(p => p.id === 0); if (!host) loaded.addPlayer(0, 0);
      for (const p of h.players) if (!loaded.player(p.id)) this.seat(p);
    } else {
      this.newSaveId(); this.parked.clear();
      this.sim = new Sim(this.cfg);
      for (const p of h.players) this.sim.addPlayer(p.id, p.color);
    }
    this.startNet(); h.start(); this.view.smooth = false; this.enterGame();
  }
  /** a guest joins the running game: its own figure back if it had one, else a new one */
  private seat(p: LobbyPlayer) {
    const sim = this.sim!; if (sim.player(p.id)) return;
    const old = p.tok ? this.parked.get(p.tok) : undefined;
    if (old) { this.parked.delete(p.tok!); old.id = p.id; old.color = p.color; sim.restorePlayer(old); }
    else sim.addPlayer(p.id, p.color);
  }
  private startNet() {
    this.nc = netCfg(this.cfg); this.tickAcc = 0; this.sendAcc = 0; // netTick keeps counting over restarts (guests' clocks) this.prevSnap = this.curSnap = null; this.viewEv = [];
    this.rewind = new Rewind(this.nc);
    const sim = this.sim!, h = this.host!;
    // lag compensation: a guest's attacks are worked out against where the guest saw the animals
    sim.rewindFor = p => { const g = h.players.find(q => q.id === p.id)?.net; return g && this.rewind ? this.rewind.apply(g.view, this.netTick, sim.enemies) : null; };
  }
  /** one fixed simulation tick of the host: guests' inputs, simulate, snapshot, send */
  private hostTick(it: Intent) {
    const sim = this.sim!, h = this.host!, dt = 1 / this.nc.simHz;
    for (const p of h.peers) { const gi = p.net.nextIntent(); if (gi) sim.setIntent(p.id, gi); }
    sim.setIntent(this.me, it);
    sim.update(dt); this.netTick++;
    this.rewind?.record(this.netTick, sim.enemies);
    const snap = sim.snapshot(); this.prevSnap = this.curSnap; this.curSnap = snap; this.viewEv.push(...snap.ev);
    for (const p of h.peers) p.net.queueEvents(this.netTick, snap.ev);
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / this.nc.sendHz - 1e-6) {
      this.sendAcc -= 1 / this.nc.sendHz; if (this.sendAcc > dt) this.sendAcc = 0;
      const sh = sharedQ(snap);
      for (const p of h.peers) {
        const pl = sim.player(p.id);
        const mv: MV | null = pl ? [pl.x, pl.z, pl.face, pl.walk, pl.sta, pl.staT, pl.staX ? 1 : 0, pl.sprint ? 1 : 0, sim.stunF(pl), pl.kb ? 1 : 0, pl.alive ? 1 : 0] : null;
        p.net.sendSnap(this.netTick, guestQ(sh, snap.me, p.id, mv));
      }
    }
  }
  /** the own figure drawn where it is now: the last tick + the movement since (no wait for the next tick) */
  private ownNow(s: Snap, at: { x: number; z: number; face: number; walk: number } | null, it: Intent): Snap {
    if (!at) return s;
    return { ...s, pl: s.pl.map(p => p.id !== this.me ? p : { ...p, x: at.x, z: at.z, wk: at.walk, f: it.aim ? Math.atan2(it.ax, it.az) : it.fire ? p.f : at.face }) };
  }
  joinGame() {
    const code = ($('#codeIn') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length < 4) return;
    $('#coopErr').hidden = true; ($('#joinBtn') as HTMLButtonElement).disabled = true;
    const c = new Client(); this.client = c; c.look = this.look; this.gsync = null; this.skipStart = false;
    c.onWelcome = again => {
      this.nc = netCfg(c.cfg!);
      const clock = () => performance.now() / 1000;
      if (this.gsync && again) this.gsync.reset(); // came back after a lost connection: same figure, fresh snapshots
      else this.gsync = new GuestSync(c.cfg!, this.nc, c.id, b => c.link.u(b), clock);
      this.gsync.id = c.id;
      const g = this.gsync; c.onData = b => g.onMessage(b);
      if (again && this.mode === 'client') { this.skipStart = true; return; }
      ($('#joinBtn') as HTMLButtonElement).disabled = false; this.me = c.id; this.view.setConfig(c.cfg!); $('#lobbyCode').textContent = code; show('#lobbyStart', false); only('#lobby'); this.renderLobby();
    };
    c.onLobby = () => { this.view.setLooks(c.lobby); if (this.mode !== 'client') this.renderLobby(); };
    c.onStart = () => { this.gsync?.reset(); if (this.skipStart) { this.skipStart = false; return; } this.mode = 'client'; this.tickAcc = 0; this.view.smooth = false; this.enterGame(); };
    c.onRetry = () => {};
    c.onClose = r => {
      ($('#joinBtn') as HTMLButtonElement).disabled = false;
      this.client = null; this.idle(); only('#coop');
      const er = $('#coopErr'); er.hidden = false; er.textContent = r === 'notfound' ? 'Code ✕' : r === 'full' ? '4/4' : '✕';
    };
    c.join(code);
  }
  leave() {
    this.autosave(true);
    if (this.host) { this.host.close(); this.host = null; }
    if (this.client) { const c = this.client; this.client = null; c.onClose = () => {}; c.close(); }
    this.gsync = null; this.coopLoad = null; this.parked.clear();
    this.testMode = false; show('#cheatBtn', false); this.endSandbox(); this.exitBuild(); show('#buildBtn', false);
    this.idle(); this.view.setConfig(this.cfg); only('#menu'); this.renderMenuSaves();
  }
  private renderLobby() {
    const list = this.host ? this.host.players.map(p => ({ id: p.id, color: p.color, look: p.look })) : this.client ? this.client.lobby : [];
    if (this.host) $('#lobbyCode').textContent = this.host.code;
    $('#lobbyPlayers').innerHTML = list.map(p => `<div class="lp${p.id === this.me ? ' me' : ''}" style="background:${PLAYER_CSS[p.color % 4]}">${mini('player')}<b>${esc(p.look?.name ?? '')}</b></div>`).join('');
  }
  /** test mode only: cheat menu with every upgrade as +/− (no limits) */
  toggleCheat() {
    if (!this.testMode || this.mode !== 'solo' || !this.sim) return;
    const c = $('#cheat');
    if (!c.hidden) { only(null); this.sim.paused = false; return; }
    if (!$('#levelup').hidden || !$('#over').hidden) return;
    this.input.releaseAll(); only('#cheat'); this.sim.paused = true; this.renderCheat();
  }
  private renderCheat() {
    const sim = this.sim!; let html = '', group = '';
    $('#cheatWave').innerHTML = `Welle <input id="cheatWaveIn" type="number" min="1" max="100" value="${Math.max(1, sim.wave)}"><button class="btn sec" id="cheatWaveGo">Start</button>`;
    $('#cheatWaveGo').addEventListener('click', () => {
      const w = Math.min(100, Math.max(1, +($('#cheatWaveIn') as HTMLInputElement).value || 1));
      sim.jumpToWave(w); this.toggleCheat();
    });
    for (const [key, g, label, val] of sim.cheatRows(this.me)) {
      if (g !== group) { group = g; html += `<h4>${g}</h4>`; }
      html += `<div class="crow"><span>${label}</span><button data-k="${key}" data-d="-1">−</button><b>${val}</b><button data-k="${key}" data-d="1">+</button></div>`;
    }
    $('#cheatRows').innerHTML = html;
    $('#cheatRows').querySelectorAll<HTMLElement>('button').forEach(b => b.addEventListener('click', () => { sim.cheat(this.me, b.dataset.k!, +b.dataset.d!); this.renderCheat(); }));
  }
  // ---------- Cheat-Optionen (24.11.2026) ----------
  cheats = loadCheats();
  private startCheats = false;
  private coFrom = '#options';
  private coWave0 = 0;
  /** solo game running: the page changes it directly; otherwise it sets start values for the next solo game */
  private get cheatLive() { return this.mode === 'solo' && !this.sandbox && !!this.sim; }
  private openCheatOpt(from: string) {
    this.coFrom = from; only('#cheatOpt');
    this.coWave0 = this.cheatLive ? Math.max(1, this.sim!.wave) : 0;
    this.coVals = this.cheatLive ? { level: this.sim!.level, wave: this.coWave0 } : { level: this.cheats.level, wave: this.cheats.wave };
    this.renderCheatOpt();
  }
  private coVals = { level: 1, wave: 1 };
  private renderCheatOpt() {
    const live = this.cheatLive, p = live ? this.sim!.player(this.me) : null, N = this.cfg.names;
    const on = (w: SkillId) => live ? !!p?.skills[w].learned : this.cheats.weapons.includes(w);
    const step = (k: string, v: number) => `<div class="coStep"><button data-k="${k}" data-d="-1" aria-label="−">−</button><input data-k="${k}" type="number" min="1" max="100" inputmode="numeric" value="${v}"><button data-k="${k}" data-d="1" aria-label="+">+</button></div>`;
    $('#coBody').innerHTML =
      `<div class="coRow"><span>Level</span>${step('level', this.coVals.level)}</div>` +
      `<div class="coRow"><span>Welle</span>${step('wave', this.coVals.wave)}</div>` +
      `<div class="coRow coWrap"><span>Waffen</span><div class="coWeps">${CHEAT_WEAPONS.map(w => `<button class="coWep${on(w) ? ' on' : ''}" data-w="${w}" aria-pressed="${on(w)}">${skillIcon(w)}<b>${esc(N.skills[w] ?? w)}</b></button>`).join('')}</div></div>` +
      `<div class="coRow"><span>All fields unlocked</span><button class="coTog${this.cheats.allFields ? ' on' : ''}" id="coAll" role="switch" aria-checked="${this.cheats.allFields}"><i></i></button></div>`;
    const setVal = (k: string, v: number) => {
      v = Math.min(100, Math.max(1, Math.round(v) || 1)); (this.coVals as any)[k] = v;
      if (k === 'level' && live) this.sim!.cheatSetLevel(v);
      if (!live) { (this.cheats as any)[k] = v; saveCheats(this.cheats); }
      ($('#coBody').querySelector(`input[data-k="${k}"]`) as HTMLInputElement).value = String(v);
    };
    $('#coBody').querySelectorAll<HTMLButtonElement>('.coStep button').forEach(b => b.addEventListener('click', () => { sfx('ui.click'); setVal(b.dataset.k!, (this.coVals as any)[b.dataset.k!] + +b.dataset.d!); }));
    $('#coBody').querySelectorAll<HTMLInputElement>('.coStep input').forEach(i => i.addEventListener('change', () => setVal(i.dataset.k!, +i.value)));
    $('#coBody').querySelectorAll<HTMLButtonElement>('.coWep').forEach(b => b.addEventListener('click', () => {
      const w = b.dataset.w as SkillId, now = !on(w); sfx('ui.click');
      if (live) this.sim!.cheatWeapon(this.me, w, now);
      else { this.cheats.weapons = now ? [...this.cheats.weapons, w] : this.cheats.weapons.filter(x => x !== w); saveCheats(this.cheats); }
      b.classList.toggle('on', on(w)); b.setAttribute('aria-pressed', String(on(w)));
    }));
    $('#coAll').addEventListener('click', () => {
      sfx('ui.click'); this.cheats.allFields = !this.cheats.allFields; saveCheats(this.cheats);
      $('#coAll').classList.toggle('on', this.cheats.allFields); $('#coAll').setAttribute('aria-checked', String(this.cheats.allFields)); this.syncBuildBtn();
    });
  }
  private closeCheatOpt() {
    if (this.cheatLive && this.coVals.wave !== this.coWave0) this.sim!.jumpToWave(this.coVals.wave);
    only(this.coFrom);
  }
  /** start values from the main menu, once the start field is chosen */
  private applyStartCheats() {
    const sim = this.sim!, c = this.cheats;
    if (c.level > 1) sim.cheatSetLevel(c.level);
    for (const w of c.weapons) sim.cheatWeapon(this.me, w, true);
    if (c.wave > 1) sim.jumpToWave(c.wave);
  }
  private syncBuildBtn() { show('#buildBtn', this.cheats.allFields && this.mode === 'solo' && !this.sandbox); }
  // free build mode: every field / building anywhere, demolish, downgrade; confirm goes back into the game
  building = false;
  private buildType: FruitType = 'blue';
  private buildTool: 'build' | 'down' | 'del' = 'build';
  private enterBuild() {
    const s = this.view.snap;
    if (this.building || !this.sim || this.mode !== 'solo' || !this.cheats.allFields || s?.ph !== 'play' || this.shop.open || !$('#pause').hidden) return;
    this.building = true; this.input.releaseAll(); this.sim.paused = true;
    document.body.classList.add('building'); show('#buildUI', true);
    show('#placeBar', false); show('#placeConfirm', false); this.view.confirmSlot = -1;
    $('#bList').innerHTML = TILE_TYPES.map(t => `<button class="bItem" data-t="${t}"><i>${pic('field_' + t)}</i><span>${esc(this.cfg.names.fields[t] ?? t)}</span></button>`).join('');
    $('#bList').querySelectorAll<HTMLElement>('.bItem').forEach(b => b.addEventListener('click', () => { sfx('ui.click'); this.buildType = b.dataset.t as FruitType; this.buildTool = 'build'; this.applyBuild(); }));
    this.measureBuildInset(); this.applyBuild();
  }
  private applyBuild() {
    this.view.setFree(true, this.buildType, this.buildTool);
    $('#bList').querySelectorAll<HTMLElement>('.bItem').forEach(b => b.classList.toggle('on', this.buildTool === 'build' && b.dataset.t === this.buildType));
    document.querySelectorAll<HTMLElement>('#bTools .bTool').forEach(b => b.classList.toggle('on', b.dataset.tool === this.buildTool));
    document.body.dataset.tool = this.buildTool;
  }
  exitBuild() {
    if (!this.building) return;
    this.building = false; document.body.classList.remove('building'); show('#buildUI', false);
    this.view.setFree(false, null); this.placeShown = null;
    if (this.sim && $('#pause').hidden) this.sim.paused = false;
    sfx('ui.confirm');
  }
  private buildAt(cx: number, cy: number) {
    const slot = this.view.slotFromScreen(cx, cy); if (slot < 0 || !this.sim) return;
    if (this.buildTool === 'del') { this.sim.cheatDemolish(slot); sfx('ui.click'); }
    else if (this.buildTool === 'down') { this.sim.cheatDowngrade(slot); sfx('ui.click'); }
    else { this.sim.cheatBuild(slot, this.buildType); sfx('ui.confirm'); }
    this.view.setHover(cx, cy);
  }
  /** the bar covers the right edge (phone) or the bottom (PC): the garden is framed in the free rest */
  private measureBuildInset() {
    const r = $('#buildUI').getBoundingClientRect(), side = getComputedStyle($('#buildUI')).flexDirection === 'column';
    this.view.inset = side ? { t: 12, r: innerWidth - r.left + 8, b: 12 } : { t: 12, r: 0, b: innerHeight - r.top + 8 };
  }
  togglePause() {
    if (this.sandbox && this.mode === 'solo') return this.toggleSb();
    if (this.mode === 'idle' || !$('#levelup').hidden || !$('#over').hidden) return;
    const p = $('#pause');
    if (p.hidden && !$('#controls').hidden) { only(null); }
    if (p.hidden && $('#options').hidden && $('#controls').hidden && $('#credits').hidden) {
      this.input.releaseAll(); only('#pause'); this.backTo = '#pause'; this.updateOptLabels();
      show('#restartBtn', this.mode !== 'client'); show('#pCheatOptBtn', this.mode === 'solo'); show('#pSaveBtn', this.canSave()); this.autosave(true);
      if (this.mode === 'solo' && this.sim) this.sim.paused = true;
    } else { only(null); if (this.sim) this.sim.paused = false; }
  }

  // ---------- per frame ----------
  private activeWeapon(): Weapon { const s = this.view.snap; const pr = s?.me[this.me]; return pr ? WEAPONS[pr.ac] : 'rake'; }
  frame(dt: number, headless = false) {
    const menusOpen = !$('#pause').hidden || !$('#controls').hidden || !$('#credits').hidden || !$('#options').hidden || !$('#cheat').hidden || !$('#cheatOpt').hidden || this.sbOpen || this.building;
    this.input.enabled = (this.mode !== 'idle') && !menusOpen && $('#levelup').hidden && $('#over').hidden && this.view.snap?.ph !== 'lvl' && !this.shop.open;
    if (this.mode === 'idle') {
      if (this.sim) this.view.apply(this.sim.snapshot());
    } else if (this.mode === 'host' && this.host) {
      const sim = this.sim!, it = this.input.intent(this.activeWeapon()), DT = 1 / this.nc.simHz;
      this.tickAcc += dt; let n = 0;
      while (this.tickAcc >= DT) { this.tickAcc -= DT; this.hostTick(it); if (++n >= 6) { this.tickAcc = 0; break; } }
      if (!headless) this.tickSave(dt);
      if (!headless && this.curSnap) {
        const a = this.prevSnap ?? this.curSnap, k = this.tickAcc / DT;
        const p = sim.player(this.me); let at: { x: number; z: number; face: number; walk: number } | null = null;
        if (p && p.alive) { const st = { x: p.x, z: p.z, face: p.face, walk: p.walk, sta: p.sta, staT: p.staT, staX: p.staX, sprint: p.sprint }; if (!p.kb) predictStep(this.cfg, st, it, this.tickAcc, { sf: sim.stunF(p), kb: false, chest: sim.chestOn, sb: sim.sb }); at = st; }
        this.view.apply({ ...this.ownNow(lerpSnap(a, this.curSnap, k), at, it), ev: this.viewEv }); this.viewEv = [];
      }
    } else if (this.mode === 'solo') {
      const sim = this.sim!;
      if (this.startCheats && this.mode === 'solo' && !sim.startPick && sim.phase === 'play') { this.startCheats = false; this.applyStartCheats(); }
      const it = this.input.intent(this.activeWeapon());
      if (this.sandbox && this.sbOpen) this.sbAutoAim(it); // settings open: the player keeps firing as live preview
      sim.setIntent(this.me, it);
      sim.update(dt);
      if (!headless) this.tickSave(dt);
      const snap = sim.snapshot();
      if (!headless) this.view.apply(snap);
    } else if (this.mode === 'client' && this.client && this.gsync) {
      const g = this.gsync, it: Intent = this.input.intent(this.activeWeapon()), DT = 1 / this.nc.simHz;
      this.tickAcc += dt; let n = 0;
      while (this.tickAcc >= DT) { this.tickAcc -= DT; g.tick(it, g.renderTick); if (++n >= 6) { this.tickAcc = 0; break; } }
      const s = g.sample();
      if (s) this.view.apply(this.ownNow(s, g.ownPos(it, this.tickAcc / DT, dt), it));
    }
    if (headless) return;
    const s = this.view.snap;
    // soft sound when the game eases into a pause (level-up, menu) and out of it again
    const frozen = this.mode !== 'idle' && !!s && s.ph !== 'over' && (s.ph === 'lvl' || !$('#pause').hidden || !$('#cheat').hidden || this.building || (this.shop.open && s.ts < 1));
    if (this.mode === 'idle' || s?.ph === 'over') this.frozen = false;
    else if (frozen !== this.frozen) { this.frozen = frozen; sfx(frozen ? 'ui.pauseIn' : 'ui.pauseOut'); }
    if (s && this.mode !== 'idle') { this.hud.update(s, this.me); { const menu = !$('#pause').hidden || !$('#cheat').hidden || !$('#controls').hidden || !$('#options').hidden || !$('#cheatOpt').hidden || this.building || this.shop.open;
        this.tut.update(s, this.me, this.view.cfg, s.me[this.me]?.of?.map(o => o.key) ?? null, menu);
        if (this.sim && this.mode === 'solo') this.sim.tutPause = this.tut.pause; } this.hud.updateWave(s, this.view.cfg.waves, this.view.cfg.dayNight?.dayWaves ?? 0); this.hud.updateAmmo(s, this.me, dt, this.view.playerScreen(), this.view.cfg.hud.ammo); this.syncPhase(s); this.syncShop(s); }
    else { (document.getElementById('ammoPop') as HTMLElement).style.opacity = '0'; this.tut.hide(); }
    if (this.building) this.measureBuildInset();
    this.view.frame(dt);
    tickAudio(dt); tickAmbient(dt);
  }
  /** bulbs next to the XP bar, the merchant's bench while open (next to the ready merchant) */
  private syncShop(s: Snap) {
    const pr = s.me[this.me], W = this.view.cfg.werkstatt;
    this.bulbs.set(pr?.id ?? 0, innerWidth < 560 ? Math.min(4, W?.maxBulbs ?? 10) : W?.maxBulbs ?? 10); // narrow phones: fewer bulbs, then the number
    this.shop.update(s, this.me, this.view.cfg); // 24.11.2026: the merchant screen leaves the frozen world visible on the right
  }
  private syncPhase(s: Snap) {
    const pr = s.me[this.me];
    if (this.building) return; // Cheat build mode owns the build view
    // build mode: card chosen, now pick a spot in the top-down view
    const placing = s.ph === 'lvl' && pr && pr.pc >= 0 ? FRUITS[pr.pc] : null;
    const stack = !!placing && (pr?.pm ?? 0) >= 1; // 2 = hex field: new tile or the next tile of the same type
    this.view.setAllowed(placing ? pr?.ps : null);
    this.view.setPlacing(placing, stack);
    if (!placing) this.touchSel = -1;
    show('#placeBar', !!placing);
    if (!placing && this.view.confirmSlot >= 0) { this.view.confirmSlot = -1; show('#placeConfirm', false); }
    if (placing) {
      show('#levelup', false);
      if (this.placeShown !== placing + stack) { this.placeShown = placing + stack; $('#placeBar').innerHTML = `<div class="pic">${pic((stack && pr?.pm !== 2 ? 'up_' : 'field_') + placing)}</div>`; }
      return;
    }
    this.placeShown = null;
    if (s.ph === 'lvl' && pr?.of) {
      if (!pr.pk && $('#levelup').hidden && this.luShownFor) this.luShownFor = ''; // came back from build mode with another level pending
      const key = s.lr + ':' + pr.of.map(o => o.key).join(',');
      if (this.luShownFor !== key) {
        this.luShownFor = key; this.input.releaseAll(); only('#levelup');
        $('#luTitle').textContent = pr.of[0]?.key.startsWith('start_') ? '' : String(s.lv - 0); // start field choice: no number
        const box = $('#cards'); box.innerHTML = ''; box.classList.remove('cards-done');
        const hexes = pr.of.every(o => /^(tile|tea|start)_/.test(o.key)); // 23.11.2026: fields come as hexagons
        box.classList.toggle('hexes', hexes);
        $('#levelup').classList.toggle('hexMode', hexes);
        if (hexes && !pr.of[0]?.key.startsWith('start_')) $('#luTitle').innerHTML = `<span class="luLv">${s.lv}</span><span class="luBulb">${bulb()}</span>`;
        pr.of.forEach((o, oi) => {
          const b = hexes ? hexEl(o, this.view.cfg, oi) : cardEl(o);
          b.addEventListener('pointerenter', () => { if (!box.classList.contains('cards-done')) sfx('ui.hover'); });
          b.addEventListener('click', () => {
            if (box.classList.contains('cards-done')) return;
            box.classList.add('cards-done'); b.classList.add('chosen'); sfx('ui.confirm');
            if (this.mode === 'client') this.client?.send({ t: 'pick', key: o.key }); else this.sim?.pick(this.me, o.key);
          });
          box.appendChild(b);
        });
      }
      $('#luWait').innerHTML = s.pl.length > 1 ? s.pl.map(p => `<span class="${s.me[p.id]?.pk ? 'ok' : ''}" style="background:${PLAYER_CSS[p.c % 4]};color:${PLAYER_CSS[p.c % 4]}"></span>`).join('') : '';
    } else if ($('#levelup').hidden === false && s.ph !== 'lvl') { show('#levelup', false); this.luShownFor = ''; }
    if (s.ph === 'over' && !this.overShown) {
      this.overShown = true; this.input.releaseAll();
      if (this.saveId && this.mode === 'solo') { deleteSave(this.saveId); this.saveId = ''; }
      const m = Math.floor(s.t / 60), sec = Math.floor(s.t % 60);
      $('#overStats').innerHTML = `<span><i class="ic">${mini('cd')}</i>${m}:${String(sec).padStart(2, '0')}</span><span><i class="ic">${mini('x2').replace('×2', '★')}</i>${s.lv}</span><span><i class="ic">${mini('dmg')}</i>${s.ki}</span><span><i class="ic">${mini('blue')}</i>${s.cx}</span>`;
      $('#over h1').textContent = s.won ? 'Die Ernte ist gerettet' : 'Die Ernte ist verloren';
      show('#againBtn', this.mode !== 'client');
      setTimeout(() => only('#over'), 900);
    }
    if (s.ph !== 'over' && this.overShown) { this.overShown = false; show('#over', false); }
  }
}

// ---------- weapon test room ----------
type SbWeapon = Weapon | ComboId;
const SB_LIST: SbWeapon[] = [...WEAPONS, ...COMBOS];
const SB_RATES = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
const ENEMY_NAMES: Record<EnemyType, string> = { raccoon: 'Waschbär', panda: 'Panda', toad: 'Kröte', sheep: 'Schaf', hedgehog: 'Igel', squirrel: 'Eichhörnchen' };

interface Game {
  sandbox: boolean; sbOpen: boolean; sbWeapon: SbWeapon; sbWheelAcc: number; sbWheelT: number;
  startSandbox(): void; endSandbox(): void; wireSandbox(): void; toggleSb(): void; sbPick(w: SbWeapon): void; sbWheel(dy: number): void; sbRate(d: number): void;
  sbAutoAim(it: Intent): void; renderSbBar(): void; renderSbPanel(): void;
}
Object.assign(Game.prototype, {
  sandbox: false, sbOpen: false, sbWeapon: 'rake', sbWheelAcc: 0, sbWheelT: 0,
  startSandbox(this: Game) {
    this.testMode = false; show('#cheatBtn', false);
    const old = this.sim?.sb;
    this.sandbox = true; this.mode = 'solo'; this.me = 0;
    this.sim = new Sim(this.cfg, { sandbox: true }); this.sim.addPlayer(0, 0);
    if (old) Object.assign(this.sim.sb!, { rate: old.rate, type: old.type, hour: old.hour }); // restart keeps the room settings
    this.view.setLooks([{ id: 0, look: this.look }]); this.view.smooth = false; this.view.setSandbox(true);
    document.body.classList.add('sandbox'); show('#sbBar', true);
    this.enterGame(); this.sbOpen = false; this.view.sbSheet = false; show('#sbPanel', false);
    this.sbPick(this.sbWeapon);
  },
  endSandbox(this: Game) {
    if (!this.sandbox) return;
    this.sandbox = false; this.sbOpen = false; this.view.sbSheet = false; show('#sbPanel', false); show('#sbBar', false);
    document.body.classList.remove('sandbox'); this.view.setSandbox(false);
  },
  wireSandbox(this: Game) {
    $('#sbBar').addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null; if (!b) return;
      if (b.dataset.w) this.sbPick(b.dataset.w as SbWeapon); else if (b.dataset.r) this.sbRate(+b.dataset.r);
    });
    addEventListener('keydown', e => {
      if (!this.sandbox || this.mode !== 'solo' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === '+' || e.code === 'NumpadAdd') this.sbRate(1);
      else if (e.key === '-' || e.code === 'NumpadSubtract') this.sbRate(-1);
    });
  },
  toggleSb(this: Game) {
    this.sbOpen = !this.sbOpen; this.input.releaseAll();
    sfx(this.sbOpen ? 'ui.pauseIn' : 'ui.pauseOut');
    if (this.sbOpen) this.renderSbPanel();
    show('#sbPanel', this.sbOpen); this.view.sbSheet = this.sbOpen;
    if (this.sim?.sb) this.sim.sb.freeze = this.sbOpen; // settings open: enemies stand still
  },
  sbPick(this: Game, w: SbWeapon) {
    this.sbWeapon = w; this.sim?.sbSelect(this.me, w);
    this.renderSbBar(); if (this.sbOpen) this.renderSbPanel();
  },
  sbWheel(this: Game, dy: number) {
    const now = performance.now(); this.sbWheelAcc += dy;
    if (Math.abs(this.sbWheelAcc) < 40 && now - this.sbWheelT < 400) return;
    const d = Math.sign(this.sbWheelAcc || dy); this.sbWheelAcc = 0;
    if (now - this.sbWheelT < 90) return; // one step per notch, even on smooth touchpads
    this.sbWheelT = now;
    const i = SB_LIST.indexOf(this.sbWeapon);
    this.sbPick(SB_LIST[(i + d + SB_LIST.length) % SB_LIST.length]); sfx('ui.hover');
  },
  sbRate(this: Game, d: number) {
    const B = this.sim?.sb; if (!B) return;
    let i = SB_RATES.findIndex(r => r >= B.rate); if (i < 0) i = SB_RATES.length - 1;
    if (SB_RATES[i] !== B.rate && d < 0) i++; // between two steps
    B.rate = SB_RATES[Math.max(0, Math.min(SB_RATES.length - 1, i + d))];
    sfx('ui.click'); this.renderSbBar(); if (this.sbOpen) this.renderSbPanel();
  },
  /** live preview: aim at the nearest enemy (or straight right) and keep firing */
  sbAutoAim(this: Game, it: Intent) {
    const sim = this.sim!, p = sim.player(this.me); if (!p) return;
    const e = sim.nearestEnemy(p.x, p.z, 40);
    let dx = 1, dz = 0; if (e) { const l = Math.hypot(e.x - p.x, e.z - p.z) || 1; dx = (e.x - p.x) / l; dz = (e.z - p.z) / l; }
    it.aim = true; it.ax = dx; it.az = dz; it.fire = 'active'; it.mx = it.mz = 0;
  },
  renderSbBar(this: Game) {
    const N = this.cfg.names;
    $('#sbWeps').innerHTML = SB_LIST.map(w => {
      const c = (COMBOS as string[]).includes(w), name = c ? N.combos?.[w as ComboId] ?? w : N.skills[w as Weapon];
      return `<button class="sbW${c ? ' combo' : ''}${w === this.sbWeapon ? ' on' : ''}" data-w="${w}" title="${esc(name)}" aria-label="${esc(name)}">${c ? comboIcon(w) : skillIcon(w)}</button>`;
    }).join('');
    $('#sbBar .sbRateV').innerHTML = `${this.sim?.sb?.rate ?? 0}<small>/min</small>`;
  },
  renderSbPanel(this: Game) {
    const N = this.cfg.names, w = this.sbWeapon, B = this.sim?.sb, P = $('#sbPanel');
    const isC = (COMBOS as string[]).includes(w), name = isC ? N.combos?.[w as ComboId] ?? w : N.skills[w as Weapon];
    // upgrades of the weapon in the hand: level with - / +, "/ max" = regular maximum from the level-up cards, red above it
    const ups = this.sim?.sbUps(this.me, w) ?? [], multi = new Set(ups.map(u => u.w)).size > 1;
    const rows = ups.map(u => `<div class="sbUp${u.lv > 0 ? ' chg' : ''}">${multi ? `<i>${skillIcon(u.w)}</i>` : ''}<span>${esc(u.label)}</span>`
      + `<button data-u="${u.key}" data-d="-1"${u.lv <= 0 ? ' disabled' : ''}>−</button>`
      + `<b class="${u.max > 0 && u.lv > u.max ? 'over' : ''}">${u.lv}${u.max > 0 ? `<small>/${u.max}</small>` : ''}</b>`
      + `<button data-u="${u.key}" data-d="1"${u.cap > 0 && u.lv >= u.cap ? ' disabled' : ''}>+</button></div>`);
    const hour = B?.hour ?? 5, clock = (h: number) => { const c = (h + 6) % 24; return `${String(Math.floor(c)).padStart(2, '0')}:${String(Math.round((c % 1) * 60) % 60).padStart(2, '0')}`; };
    P.innerHTML = `
      <div id="sbHead"><b>Waffentest</b><button class="btn" id="sbGo">Weiter</button><button class="btn sec" id="sbMenu">Menü</button></div>
      <div class="sbSec"><h4>Waffe</h4><div class="sbWepsP">${$('#sbWeps').innerHTML}</div><div class="sbName">${esc(name)}</div></div>
      <div class="sbSec"><h4>Upgrades</h4>${rows.join('')}
        <div class="sbBtns"><button id="sbReset">Zurücksetzen</button></div></div>
      <div class="sbSec"><h4>Gegner</h4><div class="sbChips">${(['random', ...SB_ENEMIES] as const).map(t => `<button class="sbChip${B?.type === t ? ' on' : ''}" data-e="${t}">${t === 'random' ? 'Zufall' : ENEMY_NAMES[t]}</button>`).join('')}</div>
        <div class="sbRate"><button data-r="-1">−</button><b>${B?.rate ?? 0}<small>/min</small></b><button data-r="1">+</button></div></div>
      <div class="sbSec"><h4>Tageszeit</h4><div class="sbRow"><span>${hour < 16 ? '☀' : '☾'}</span><input type="range" id="sbHour" min="0" max="24" step=".25" value="${hour}"><b>${clock(hour)}</b></div></div>`;
    P.querySelector('#sbGo')!.addEventListener('click', () => this.toggleSb());
    P.querySelector('#sbMenu')!.addEventListener('click', () => this.leave());
    P.querySelectorAll<HTMLElement>('.sbW').forEach(b => b.addEventListener('click', () => this.sbPick(b.dataset.w as SbWeapon)));
    P.querySelectorAll<HTMLElement>('[data-r]').forEach(b => b.addEventListener('click', () => this.sbRate(+b.dataset.r!)));
    P.querySelectorAll<HTMLElement>('[data-e]').forEach(b => b.addEventListener('click', () => { if (B) { B.type = b.dataset.e as EnemyType | 'random'; this.sim!.sbClear(); } sfx('ui.click'); this.renderSbPanel(); }));
    P.querySelectorAll<HTMLElement>('[data-u]').forEach(b => b.addEventListener('click', () => { this.sim?.sbUp(this.me, w, b.dataset.u!, +b.dataset.d!); sfx('ui.click'); this.renderSbPanel(); }));
    const hi = P.querySelector('#sbHour') as HTMLInputElement;
    hi.addEventListener('input', () => { const h = +hi.value; if (B) B.hour = h; const r = hi.parentElement!; r.querySelector('b')!.textContent = clock(h); r.querySelector('span')!.textContent = h < 16 ? '☀' : '☾'; });
    P.querySelector('#sbReset')!.addEventListener('click', () => { for (const u of ups) this.sim?.sbUp(this.me, w, u.key, -u.lv); sfx('ui.click'); this.renderSbPanel(); });
  },
});

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

new Game().boot();
/** "Welle 7 · Lvl 5 · 24.11. 23:40" */
function saveLine(s: SaveInfo) {
  const d = new Date(s.t), two = (n: number) => String(n).padStart(2, '0');
  return `Welle ${Math.max(1, s.wave)} · Lvl ${s.level} · ${d.getDate()}.${d.getMonth() + 1}. ${two(d.getHours())}:${two(d.getMinutes())}`;
}
