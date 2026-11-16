import './style.css';
import { Balancing, FRUITS, FruitType, WEAPONS, Weapon, loadBalancing, loadSounds } from './config';
import { Sim } from './sim/sim';
import type { Ev, Intent, Snap } from './sim/snap';
import { GameView } from './view/view';
import { applyQuality, gfx, isTouch } from './view/core';
import { Input } from './input/input';
import { Hud, PLAYER_CSS, cardEl } from './ui/hud';
import { mini, pic } from './ui/icons';
import { mobileControls, pcControls } from './ui/controls';
import { creditsHtml } from './ui/credits';
import { ambient, audio, initAudio, setSoundConfig, sfx, tickAmbient, tickAudio } from './audio';
import { Client, Host } from './net/net';
import { Editor } from './ui/editor';
import { Look, loadLook } from './look';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const OVERLAYS = ['#menu', '#editor', '#coop', '#lobby', '#options', '#credits', '#controls', '#levelup', '#pause', '#over', '#cheat'];
function only(id: string | null) { for (const o of OVERLAYS) show(o, o === id); }

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
  look: Look = loadLook();
  private editor = new Editor();

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
    addEventListener('wheel', e => { if (this.mode !== 'idle' && !this.view.placing && $('#pause').hidden) this.view.zoomBy(e.deltaY); }, { passive: true });
    this.editor.onSound = k => sfx(k);
    click('#soloBtn', () => this.openEditor(() => this.startSolo(false)));
    click('#testBtn', () => this.startSolo(true));
    click('#cheatBtn', () => this.toggleCheat());
    click('#cheatClose', () => this.toggleCheat());
    this.input.onCheat = () => this.toggleCheat();
    click('#coopBtn', () => this.openEditor(() => { $('#coopErr').hidden = true; only('#coop'); }));
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
  /** character editor first; then the given next step (solo start / co-op menu) */
  private openEditor(next: () => void) {
    only('#editor');
    this.editor.open(this.look, l => { this.look = l; next(); }, () => only('#menu'));
  }
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
  private enterGame() {
    only(null); show('#hud'); this.hud.reset(); this.view.reset(); this.view.me = this.me;
    this.input.enabled = true; this.luShownFor = ''; this.overShown = false;
    try { if (this.input.isTouch && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch { /* ignore */ }
    try { (navigator as any).wakeLock?.request('screen').catch(() => {}); } catch { /* ignore */ }
  }

  // ---------- modes ----------
  testMode = false;
  startSolo(test = this.testMode) { this.testMode = test; show('#cheatBtn', test); this.mode = 'solo'; this.me = 0; this.sim = new Sim(this.cfg); this.sim.addPlayer(0, 0); this.view.setLooks([{ id: 0, look: this.look }]); this.view.smooth = false; this.enterGame(); }
  restart() {
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
    this.testMode = false; show('#cheatBtn', false);
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
    const menusOpen = !$('#pause').hidden || !$('#controls').hidden || !$('#credits').hidden || !$('#options').hidden || !$('#cheat').hidden;
    this.input.enabled = (this.mode !== 'idle') && !menusOpen && $('#levelup').hidden && $('#over').hidden && this.view.snap?.ph !== 'lvl';
    if (this.mode === 'idle') {
      if (this.sim) this.view.apply(this.sim.snapshot());
    } else if (this.mode === 'solo' || this.mode === 'host') {
      const sim = this.sim!;
      sim.setIntent(this.me, this.input.intent(this.activeWeapon()));
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
    if (s && this.mode !== 'idle') { this.hud.update(s, this.me); this.hud.updateAmmo(s, this.me, dt, this.view.playerScreen(), this.view.cfg.hud.ammo); this.syncPhase(s); }
    else (document.getElementById('ammoPop') as HTMLElement).style.opacity = '0';
    this.view.frame(dt);
    tickAudio(dt); tickAmbient(dt);
  }
  private syncPhase(s: Snap) {
    const pr = s.me[this.me];
    // build mode: card chosen, now pick a spot in the top-down view
    const placing = s.ph === 'lvl' && pr && pr.pc >= 0 ? FRUITS[pr.pc] : null;
    this.view.setPlacing(placing);
    show('#placeBar', !!placing);
    if (!placing && this.view.confirmSlot >= 0) { this.view.confirmSlot = -1; show('#placeConfirm', false); }
    if (placing) {
      show('#levelup', false);
      if (this.placeShown !== placing) { this.placeShown = placing; $('#placeBar').innerHTML = `<div class="pic">${pic('field_' + placing)}</div>`; }
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

const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

new Game().boot();
