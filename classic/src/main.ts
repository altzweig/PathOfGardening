import './style.css';
import { Balancing, COMBOS, ComboId, EnemyType, FRUITS, FruitType, SKILLS, WEAPONS, Weapon, loadBalancing, loadSounds } from './config';
import { SB_ENEMIES, Sim } from './sim/sim';
import type { Ev, Intent, Snap } from './sim/snap';
import { GameView } from './view/view';
import { applyQuality, gfx, isTouch } from './view/core';
import { Input } from './input/input';
import { Hud, PLAYER_CSS, cardEl } from './ui/hud';
import { comboIcon, mini, pic, skillIcon } from './ui/icons';
import { mobileControls, pcControls } from './ui/controls';
import { creditsHtml } from './ui/credits';
import { ambient, audio, initAudio, setSoundConfig, sfx, tickAmbient, tickAudio } from './audio';
import { Client, Host } from './net/net';
import { StartMenu } from './ui/startmenu';
import { Look, loadLook } from './look';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const OVERLAYS = ['#menu', '#coop', '#lobby', '#options', '#credits', '#controls', '#levelup', '#pause', '#over', '#cheat'];
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
  private frozen = false; // pause / level-up state, for the slow-down + speed-up sounds
  me = 0;
  private netAcc = 0; private inAcc = 0; private netEvents: Ev[] = [];
  private lastIntent = '';
  private luShownFor = '';
  private overShown = false;
  private placeShown: string | null = null;
  private backTo = '#menu';
  private menu = new StartMenu(loadLook());
  get look(): Look { return this.menu.look; }

  constructor() {
    this.input = new Input(this.view, isTouch);
    this.input.onPause = () => this.togglePause();
    this.view.onEvent = e => { if (e.k === 'pdie' && e.p === this.me) this.input.releaseAll(); };
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
    click('#testBtn', () => this.startSolo(true));
    click('#wtestBtn', () => this.startSandbox());
    this.wireSandbox();
    click('#cheatBtn', () => this.toggleCheat());
    click('#cheatClose', () => this.toggleCheat());
    this.input.onCheat = () => this.toggleCheat();
    click('#coopBtn', () => { $('#coopErr').hidden = true; only('#coop'); });
    click('#coopBack', () => only('#menu'));
    click('#optBtn', () => { this.backTo = '#menu'; this.updateOptLabels(); only('#options'); });
    click('#optBack', () => only(this.backTo === '#pause' ? '#pause' : '#menu'));
    click('#ctrlBtn', () => this.openControls('#options'));
    click('#pCtrlBtn', () => this.openControls('#pause'));
    click('#ctrlBack', () => only(this.backTo));
    click('#credBtn', () => { $('#credView').innerHTML = creditsHtml(); only('#credits'); });
    click('#credBack', () => only('#options'));
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
      if (this.view.confirmSlot < 0) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.answerOverbuild(true); }
      else if (e.key === 'Escape' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.answerOverbuild(false); }
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'solo' && $('#pause').hidden && !this.sim?.paused) this.togglePause(); });
    this.updateOptLabels();
  }
  private touchSel = -1;
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
  }
  private openControls(back: string) { this.backTo = back; only('#controls'); this.ctrlTab(this.input.isTouch ? 'mobile' : 'pc'); }
  private ctrlTab(t: string) {
    document.querySelectorAll<HTMLElement>('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    $('#ctrlView').innerHTML = t === 'pc' ? pcControls() : mobileControls();
  }
  enterGame() {
    only(null); show('#hud'); this.hud.reset(); this.hud.names = (this.view.cfg.names.items ?? {}) as Record<string, string>; this.view.reset(); this.view.me = this.me;
    this.input.enabled = true; this.luShownFor = ''; this.overShown = false;
    try { if (this.input.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
    try { (navigator as any).wakeLock?.request('screen').catch(() => {}); } catch { /* ignore */ }
  }

  // ---------- modes ----------
  testMode = false;
  startSolo(test = this.testMode) { this.endSandbox(); this.testMode = test; show('#cheatBtn', test); this.mode = 'solo'; this.me = 0; this.sim = new Sim(this.cfg); this.sim.addPlayer(0, 0); this.view.setLooks([{ id: 0, look: this.look }]); this.view.smooth = false; this.enterGame(); }
  restart() {
    if (this.mode === 'solo' && this.sandbox) return this.startSandbox();
    if (this.mode === 'solo') return this.startSolo();
    if (this.mode === 'host' && this.host) { this.startHost(); }
  }
  async hostGame() {
    $('#coopErr').hidden = true; ($('#hostBtn') as HTMLButtonElement).disabled = true;
    const h = new Host(this.cfg); this.host = h; h.players[0].look = this.look;
    try { await h.open(); }
    catch { ($('#hostBtn') as HTMLButtonElement).disabled = false; $('#coopErr').hidden = false; $('#coopErr').textContent = '✕'; this.host = null; return; }
    ($('#hostBtn') as HTMLButtonElement).disabled = false;
    h.onChange = () => { this.view.setLooks(h.players); this.renderLobby(); };
    h.onIntent = (id, it) => this.sim?.setIntent(id, it);
    h.onPick = (id, key) => this.sim?.pick(id, key);
    h.onPlace = (id, slot) => this.sim?.place(id, slot);
    h.onJoin = p => { if (this.mode === 'host' && this.sim) this.sim.addPlayer(p.id, p.color); };
    h.onLeave = id => { if (this.mode === 'host' && this.sim) this.sim.removePlayer(id); };
    this.me = 0; this.renderLobby(); only('#lobby'); show('#lobbyStart');
  }
  startHost() {
    const h = this.host!; this.mode = 'host'; this.me = 0;
    this.sim = new Sim(this.cfg);
    for (const p of h.players) this.sim.addPlayer(p.id, p.color);
    h.start(); this.netEvents = []; this.view.smooth = false; this.enterGame();
  }
  joinGame() {
    const code = ($('#codeIn') as HTMLInputElement).value.trim().toUpperCase();
    if (code.length < 4) return;
    $('#coopErr').hidden = true; ($('#joinBtn') as HTMLButtonElement).disabled = true;
    const c = new Client(); this.client = c;
    c.onWelcome = () => { c.send({ t: 'hello', look: this.look }); ($('#joinBtn') as HTMLButtonElement).disabled = false; this.me = c.id; this.view.setConfig(c.cfg!); $('#lobbyCode').textContent = code; show('#lobbyStart', false); only('#lobby'); this.renderLobby(); };
    c.onLobby = () => { this.view.setLooks(c.lobby); this.renderLobby(); };
    c.onStart = () => { this.mode = 'client'; this.view.smooth = true; this.enterGame(); };
    c.onSnap = s => { if (this.mode === 'client') this.view.apply(s); };
    c.onClose = r => {
      ($('#joinBtn') as HTMLButtonElement).disabled = false;
      this.client = null; this.idle(); only('#coop');
      const er = $('#coopErr'); er.hidden = false; er.textContent = r === 'notfound' ? 'Code ✕' : r === 'full' ? '4/4' : '✕';
    };
    c.join(code);
  }
  leave() {
    if (this.host) { this.host.close(); this.host = null; }
    if (this.client) { const c = this.client; this.client = null; c.onClose = () => {}; c.close(); }
    this.testMode = false; show('#cheatBtn', false); this.endSandbox();
    this.idle(); this.view.setConfig(this.cfg); only('#menu');
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
  togglePause() {
    if (this.sandbox && this.mode === 'solo') return this.toggleSb();
    if (this.mode === 'idle' || !$('#levelup').hidden || !$('#over').hidden) return;
    const p = $('#pause');
    if (p.hidden && !$('#controls').hidden) { only(null); }
    if (p.hidden && $('#options').hidden && $('#controls').hidden && $('#credits').hidden) {
      this.input.releaseAll(); only('#pause'); this.backTo = '#pause'; this.updateOptLabels();
      show('#restartBtn', this.mode !== 'client');
      if (this.mode === 'solo' && this.sim) this.sim.paused = true;
    } else { only(null); if (this.sim) this.sim.paused = false; }
  }

  // ---------- per frame ----------
  private activeWeapon(): Weapon { const s = this.view.snap; const pr = s?.me[this.me]; return pr ? WEAPONS[pr.ac] : 'rake'; }
  frame(dt: number, headless = false) {
    const menusOpen = !$('#pause').hidden || !$('#controls').hidden || !$('#credits').hidden || !$('#options').hidden || !$('#cheat').hidden || this.sbOpen;
    this.input.enabled = (this.mode !== 'idle') && !menusOpen && $('#levelup').hidden && $('#over').hidden && this.view.snap?.ph !== 'lvl';
    if (this.mode === 'idle') {
      if (this.sim) this.view.apply(this.sim.snapshot());
    } else if (this.mode === 'solo' || this.mode === 'host') {
      const sim = this.sim!;
      const it = this.input.intent(this.activeWeapon());
      if (this.sandbox && this.sbOpen) this.sbAutoAim(it); // settings open: the player keeps firing as live preview
      sim.setIntent(this.me, it);
      sim.update(dt);
      const snap = sim.snapshot();
      if (!headless) this.view.apply(snap);
      if (this.mode === 'host' && this.host) {
        this.netEvents.push(...snap.ev); this.netAcc += dt;
        if (this.netAcc >= 1 / this.cfg.coop.snapshotRate) { this.netAcc = 0; this.host.broadcast({ t: 's', s: { ...snap, ev: this.netEvents } }); this.netEvents = []; }
      }
    } else if (this.mode === 'client' && this.client) {
      const it: Intent = this.input.intent(this.activeWeapon());
      this.inAcc += dt; const js = JSON.stringify(it);
      const urgent = !!it.fire && !this.lastIntent.includes('"fire":"');
      if ((this.inAcc >= 1 / 30 || urgent) && (js !== this.lastIntent || this.inAcc > .25)) { this.inAcc = 0; this.lastIntent = js; this.client.send({ t: 'in', i: it }); }
    }
    if (headless) return;
    const s = this.view.snap;
    // soft sound when the game eases into a pause (level-up, menu) and out of it again
    const frozen = this.mode !== 'idle' && !!s && s.ph !== 'over' && (s.ph === 'lvl' || !$('#pause').hidden || !$('#cheat').hidden);
    if (this.mode === 'idle' || s?.ph === 'over') this.frozen = false;
    else if (frozen !== this.frozen) { this.frozen = frozen; sfx(frozen ? 'ui.pauseIn' : 'ui.pauseOut'); }
    if (s && this.mode !== 'idle') { this.hud.update(s, this.me); this.hud.updateWave(s, this.view.cfg.waves, this.view.cfg.dayNight?.dayWaves ?? 0); this.hud.updateAmmo(s, this.me, dt, this.view.playerScreen(), this.view.cfg.hud.ammo); this.syncPhase(s); }
    else (document.getElementById('ammoPop') as HTMLElement).style.opacity = '0';
    this.view.frame(dt);
    tickAudio(dt); tickAmbient(dt);
  }
  private syncPhase(s: Snap) {
    const pr = s.me[this.me];
    // build mode: card chosen, now pick a spot in the top-down view
    const placing = s.ph === 'lvl' && pr && pr.pc >= 0 ? FRUITS[pr.pc] : null;
    const stack = !!placing && pr?.pm === 1;
    this.view.setPlacing(placing, stack);
    if (!placing) this.touchSel = -1;
    show('#placeBar', !!placing);
    if (!placing && this.view.confirmSlot >= 0) { this.view.confirmSlot = -1; show('#placeConfirm', false); }
    if (placing) {
      show('#levelup', false);
      if (this.placeShown !== placing + stack) { this.placeShown = placing + stack; $('#placeBar').innerHTML = `<div class="pic">${pic((stack ? 'up_' : 'field_') + placing)}</div>`; }
      return;
    }
    this.placeShown = null;
    if (s.ph === 'lvl' && pr?.of) {
      if (!pr.pk && $('#levelup').hidden && this.luShownFor) this.luShownFor = ''; // came back from build mode with another level pending
      const key = s.lr + ':' + pr.of.map(o => o.key).join(',');
      if (this.luShownFor !== key) {
        this.luShownFor = key; this.input.releaseAll(); only('#levelup');
        $('#luTitle').textContent = String(s.lv - 0);
        const box = $('#cards'); box.innerHTML = ''; box.classList.remove('cards-done');
        for (const o of pr.of) {
          const b = cardEl(o);
          b.addEventListener('pointerenter', () => { if (!box.classList.contains('cards-done')) sfx('ui.hover'); });
          b.addEventListener('click', () => {
            if (box.classList.contains('cards-done')) return;
            box.classList.add('cards-done'); b.classList.add('chosen'); sfx('ui.confirm');
            if (this.mode === 'client') this.client?.send({ t: 'pick', key: o.key }); else this.sim?.pick(this.me, o.key);
          });
          box.appendChild(b);
        }
      }
      $('#luWait').innerHTML = s.pl.length > 1 ? s.pl.map(p => `<span class="${s.me[p.id]?.pk ? 'ok' : ''}" style="background:${PLAYER_CSS[p.c % 4]};color:${PLAYER_CSS[p.c % 4]}"></span>`).join('') : '';
    } else if ($('#levelup').hidden === false && s.ph !== 'lvl') { show('#levelup', false); this.luShownFor = ''; }
    if (s.ph === 'over' && !this.overShown) {
      this.overShown = true; this.input.releaseAll();
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
