import './style.css';
import { Balancing, WEAPONS, Weapon, loadBalancing } from './config';
import { Sim } from './sim/sim';
import type { Ev, Intent, Snap } from './sim/snap';
import { GameView } from './view/view';
import { applyQuality, gfx, isTouch } from './view/core';
import { Input } from './input/input';
import { Hud, PLAYER_CSS, cardEl } from './ui/hud';
import { mini } from './ui/icons';
import { mobileControls, pcControls } from './ui/controls';
import { audio, initAudio, tickAudio } from './audio';
import { Client, Host } from './net/net';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const show = (id: string, on = true) => { $(id).hidden = !on; };
const OVERLAYS = ['#menu', '#coop', '#lobby', '#options', '#controls', '#levelup', '#pause', '#over'];
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
  me = 0;
  private netAcc = 0; private inAcc = 0; private netEvents: Ev[] = [];
  private lastIntent = '';
  private luShownFor = '';
  private overShown = false;
  private backTo = '#menu';

  constructor() {
    this.input = new Input(this.view, isTouch);
    this.input.onPause = () => this.togglePause();
    this.view.onEvent = e => { if (e.k === 'pdie' && e.p === this.me) this.input.releaseAll(); };
  }
  async boot() {
    try { this.cfg = await loadBalancing(); }
    catch (e) { only('#menu'); const er = $('#menuErr'); er.hidden = false; er.textContent = 'balancing.yaml: ' + (e as Error).message; return; }
    this.view.setConfig(this.cfg);
    applyQuality();
    this.idle();
    this.wire();
    only('#menu');
    let last = performance.now();
    const loop = (now: number) => { requestAnimationFrame(loop); const dt = Math.min(.05, (now - last) / 1000); last = now; this.frame(dt); };
    requestAnimationFrame(loop);
    (window as any).__pog = this;
  }
  /** garden behind the menus */
  idle() {
    this.mode = 'idle'; this.sim = new Sim(this.cfg); this.view.reset(); this.view.me = -1; this.view.smooth = false;
    this.input.enabled = false; show('#hud', false);
  }
  private wire() {
    const click = (id: string, f: () => void) => $(id).addEventListener('click', () => { initAudio(); f(); });
    click('#soloBtn', () => this.startSolo());
    click('#coopBtn', () => { $('#coopErr').hidden = true; only('#coop'); });
    click('#coopBack', () => only('#menu'));
    click('#optBtn', () => { this.backTo = '#menu'; this.updateOptLabels(); only('#options'); });
    click('#optBack', () => only(this.backTo === '#pause' ? '#pause' : '#menu'));
    click('#ctrlBtn', () => this.openControls('#options'));
    click('#pCtrlBtn', () => this.openControls('#pause'));
    click('#ctrlBack', () => only(this.backTo));
    for (const id of ['#qualBtn', '#pQualBtn']) click(id, () => { gfx.auto = false; gfx.quality = gfx.quality === 'hoch' ? 'mittel' : gfx.quality === 'mittel' ? 'niedrig' : 'hoch'; applyQuality(); this.updateOptLabels(); });
    for (const id of ['#sndBtn', '#pSndBtn']) click(id, () => { audio.on = !audio.on; this.updateOptLabels(); });
    document.querySelectorAll<HTMLElement>('.tab').forEach(t => t.addEventListener('click', () => this.ctrlTab(t.dataset.tab!)));
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
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'solo' && $('#pause').hidden && !this.sim?.paused) this.togglePause(); });
    this.updateOptLabels();
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
  startSolo() { this.mode = 'solo'; this.me = 0; this.sim = new Sim(this.cfg); this.sim.addPlayer(0, 0); this.view.smooth = false; this.enterGame(); }
  restart() {
    if (this.mode === 'solo') return this.startSolo();
    if (this.mode === 'host' && this.host) { this.startHost(); }
  }
  async hostGame() {
    $('#coopErr').hidden = true; ($('#hostBtn') as HTMLButtonElement).disabled = true;
    const h = new Host(this.cfg); this.host = h;
    try { await h.open(); }
    catch { ($('#hostBtn') as HTMLButtonElement).disabled = false; $('#coopErr').hidden = false; $('#coopErr').textContent = '✕'; this.host = null; return; }
    ($('#hostBtn') as HTMLButtonElement).disabled = false;
    h.onChange = () => this.renderLobby();
    h.onIntent = (id, it) => this.sim?.setIntent(id, it);
    h.onPick = (id, key) => this.sim?.pick(id, key);
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
    c.onWelcome = () => { ($('#joinBtn') as HTMLButtonElement).disabled = false; this.me = c.id; this.view.setConfig(c.cfg!); $('#lobbyCode').textContent = code; show('#lobbyStart', false); only('#lobby'); this.renderLobby(); };
    c.onLobby = () => this.renderLobby();
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
    this.idle(); this.view.setConfig(this.cfg); only('#menu');
  }
  private renderLobby() {
    const list = this.host ? this.host.players.map(p => ({ id: p.id, color: p.color })) : this.client ? this.client.lobby : [];
    if (this.host) $('#lobbyCode').textContent = this.host.code;
    $('#lobbyPlayers').innerHTML = list.map(p => `<div class="lp${p.id === this.me ? ' me' : ''}" style="background:${PLAYER_CSS[p.color % 4]}">${mini('player')}</div>`).join('');
  }
  togglePause() {
    if (this.mode === 'idle' || !$('#levelup').hidden || !$('#over').hidden) return;
    const p = $('#pause');
    if (p.hidden && !$('#controls').hidden) { only(null); }
    if (p.hidden && $('#options').hidden && $('#controls').hidden) {
      this.input.releaseAll(); only('#pause'); this.backTo = '#pause'; this.updateOptLabels();
      show('#restartBtn', this.mode !== 'client');
      if (this.mode === 'solo' && this.sim) this.sim.paused = true;
    } else { only(null); if (this.sim) this.sim.paused = false; }
  }

  // ---------- per frame ----------
  private activeWeapon(): Weapon { const s = this.view.snap; const pr = s?.me[this.me]; return pr ? WEAPONS[pr.ac] : 'rake'; }
  frame(dt: number) {
    const menusOpen = !$('#pause').hidden || !$('#controls').hidden || !$('#options').hidden;
    this.input.enabled = (this.mode !== 'idle') && !menusOpen && $('#levelup').hidden && $('#over').hidden;
    if (this.mode === 'idle') {
      if (this.sim) this.view.apply(this.sim.snapshot());
    } else if (this.mode === 'solo' || this.mode === 'host') {
      const sim = this.sim!;
      sim.setIntent(this.me, this.input.intent(this.activeWeapon()));
      sim.update(dt);
      const snap = sim.snapshot();
      this.view.apply(snap);
      if (this.mode === 'host' && this.host) {
        this.netEvents.push(...snap.ev); this.netAcc += dt;
        if (this.netAcc >= 1 / this.cfg.coop.snapshotRate) { this.netAcc = 0; this.host.broadcast({ t: 's', s: { ...snap, ev: this.netEvents } }); this.netEvents = []; }
      }
    } else if (this.mode === 'client' && this.client) {
      const it: Intent = this.input.intent(this.activeWeapon());
      this.inAcc += dt; const js = JSON.stringify(it);
      if (this.inAcc >= 1 / 30 && (js !== this.lastIntent || this.inAcc > .25)) { this.inAcc = 0; this.lastIntent = js; this.client.send({ t: 'in', i: it }); }
    }
    const s = this.view.snap;
    if (s && this.mode !== 'idle') { this.hud.update(s, this.me); this.syncPhase(s); }
    this.view.frame(dt);
    tickAudio(dt);
  }
  private syncPhase(s: Snap) {
    const pr = s.me[this.me];
    if (s.ph === 'lvl' && pr?.of) {
      const key = s.lr + ':' + pr.of.map(o => o.key).join(',');
      if (this.luShownFor !== key) {
        this.luShownFor = key; this.input.releaseAll(); only('#levelup');
        $('#luTitle').textContent = String(s.lv - 0);
        const box = $('#cards'); box.innerHTML = ''; box.classList.remove('cards-done');
        for (const o of pr.of) {
          const b = cardEl(o);
          b.addEventListener('click', () => {
            if (box.classList.contains('cards-done')) return;
            box.classList.add('cards-done'); b.classList.add('chosen');
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
      show('#againBtn', this.mode !== 'client');
      setTimeout(() => only('#over'), 900);
    }
    if (s.ph !== 'over' && this.overShown) { this.overShown = false; show('#over', false); }
  }
}

new Game().boot();
