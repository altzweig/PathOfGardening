// HUD of a farm day: life, level + XP, sun clock with the day, Taler, water in the can, weapon + ammo,
// tool icon at the cursor (what a click does), touch buttons, floating numbers, tutorial hint box.
import type { FarmCfg } from '../config';
import { nextLevelXp } from '../config';
import type { FarmState, Quest } from '../state';
import { cycleSeed, questProgress } from '../state';
import type { ActionInfo, DaySim, Target } from '../sim';
import type { FarmView } from '../view/farmView';
import { ic } from './ficons';
import { goodInfo } from './storePage';
import { ActBar } from './actbar';
import { VP } from '../../view/core';

const $ = (s: string) => document.querySelector(s) as HTMLElement;
/** setAttribute only when the value changed (the clock is updated every frame) */
const setA = (el: Element, k: string, v: string) => { const o = el as unknown as Record<string, string>, c = '_a' + k; if (o[c] !== v) { o[c] = v; el.setAttribute(k, v); } };
/** remaining seconds as "m:ss" */
const mss = (sec: number) => { const t = Math.max(0, Math.ceil(sec)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const mix = (a: number[], b: number[], k: number) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = (c: number[]) => `rgb(${c[0]},${c[1]},${c[2]})`;
/** sun colour over the day: warm at sunrise, light yellow at noon, orange-red at sunset */
function sunCol(k: number) {
  const dawn = [255, 190, 110], noon = [255, 226, 110], dusk = [255, 120, 60];
  return k < .5 ? mix(dawn, noon, Math.min(1, k / .25)) : mix(noon, dusk, Math.max(0, (k - .62) / .38));
}
/** the sun clock: arc (centre 75/56, radius 58 x 46), horizon, trail of the day so far, sun with glow + rays, moon, stars */
const CLOCK = `<svg class="ck" viewBox="0 0 150 72"><defs>
  <radialGradient id="ckGlow"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset=".45" stop-color="#ffd070" stop-opacity=".45"/><stop offset="1" stop-color="#ff9a40" stop-opacity="0"/></radialGradient>
  <radialGradient id="ckMGlow"><stop offset="0" stop-color="#e8f0ff" stop-opacity=".8"/><stop offset=".5" stop-color="#8aa8ff" stop-opacity=".3"/><stop offset="1" stop-color="#6a88ff" stop-opacity="0"/></radialGradient>
  <linearGradient id="ckDayG" x1="0" x2="1"><stop offset="0" stop-color="#ffb870"/><stop offset=".5" stop-color="#ffe27a"/><stop offset="1" stop-color="#ff7a40"/></linearGradient>
  <linearGradient id="ckNightG" x1="0" x2="1"><stop offset="0" stop-color="#6a7ae0"/><stop offset="1" stop-color="#b8c8ff"/></linearGradient>
  <clipPath id="ckClip"><rect x="-10" y="-20" width="170" height="76"/></clipPath></defs>
  <g id="ckStars" opacity="0" fill="#dfe8ff"><circle cx="30" cy="18" r="1"/><circle cx="52" cy="7" r="1.3"/><circle cx="96" cy="9" r=".9"/><circle cx="118" cy="22" r="1.2"/><circle cx="76" cy="20" r=".8"/><circle cx="18" cy="38" r=".8"/><circle cx="134" cy="40" r=".9"/></g>
  <path d="M17 56 A58 46 0 0 1 133 56" fill="none" stroke="#e3b96433" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="1 6"/>
  <path id="ckTrail" d="M17 56 A58 46 0 0 1 133 56" fill="none" stroke="url(#ckDayG)" stroke-width="3.5" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>
  <g clip-path="url(#ckClip)">
    <g id="ckSun"><circle r="17" fill="url(#ckGlow)"/><g id="ckRays" stroke-width="2.2" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4, c = Math.cos(a), s = Math.sin(a); return `<path d="M${(c * 9.5).toFixed(1)} ${(s * 9.5).toFixed(1)}L${(c * 13).toFixed(1)} ${(s * 13).toFixed(1)}"/>`; }).join('')}</g>
      <circle id="ckCore" r="7" stroke="#7a4a10" stroke-width="1.4"/><circle cx="-2.2" cy="-2.4" r="2.3" fill="#fffbe8" opacity=".75"/></g>
    <g id="ckMoon" opacity="0"><circle r="16" fill="url(#ckMGlow)"/><path d="M3 -8a8.5 8.5 0 1 0 5 14.5a7 7 0 0 1 -5 -14.5z" fill="#e4ebff" stroke="#3a4a80" stroke-width="1.2"/><circle cx="-3" cy="2" r="1.2" fill="#b8c4e8"/><circle cx="-1" cy="-3" r=".8" fill="#b8c4e8"/></g>
  </g>
  <path d="M2 56 H148" stroke="#e3b96499" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 60 H140" stroke="#e3b96433" stroke-width="1.2" stroke-linecap="round"/></svg>
  <b class="ckDay" id="fDay">1</b><div class="ckCd" id="fCd"></div>`;
const TOOL_ICON: Record<string, string> = { can: 'can', handrake: 'handrake', seed: 'seed', hands: 'hands', sickle: 'sickle', bucket: 'bucket' };
/** left mouse button (PC label) */
const LMB = `<svg class="ms" viewBox="0 0 30 42"><rect x="2" y="2" width="26" height="38" rx="13" fill="#1a2027" stroke="#fff2c0" stroke-width="2.4"/><path d="M15 2v17M2 19h26" stroke="#5a6570" stroke-width="2"/><path d="M15 3.5a12 12 0 0 0-11.5 12V19H15z" fill="#e3b964"/></svg>`;
/** E key (PC label when played with the keyboard) */
const KEY_E = `<kbd class="ke">E</kbd>`;
/** height of the label over a target (m) */
const LABEL_Y: Record<string, number> = { bld: 2.4, stall: 1.9, well: 2.8, tree: 3.4, plot: 1.7, bush: 1.9, bramble: 1.5, forage: .9, weed: .9 };

export class FarmHud {
  /** played with the keyboard (E / Space): the label shows the E key instead of the mouse */
  kb = false;
  private key = '';
  private s: FarmState | null = null;
  /** quest list open (Q / tap on the box) */
  questsOpen = true; private qKey = '';
  private nums: { el: HTMLElement; x: number; y: number; z: number; t: number }[] = [];
  /** animated progress bar of the running action (22.11.2026) */
  private bar: ActBar; private lastT = performance.now();
  constructor(public cfg: FarmCfg) {
    this.bar = new ActBar(cfg, $('#fHud'));
    // seed list (Basti 22.11.2026): tap a seed = it is active and the list closes, tap beside it = closes, nothing changes
    const bg = document.createElement('div'); bg.id = 'fSeedsBg'; bg.hidden = true; $('#fHud').insertBefore(bg, $('#fSeeds'));
    bg.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.seedMenu(false); });
    $('#fSeeds').addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation(); const b = (e.target as HTMLElement).closest('button');
      if (b) this.pickSeed(b.dataset.c!); this.seedMenu(false);
    });
    $('#fQuests').addEventListener('pointerdown', e => { e.stopPropagation(); this.toggleQuests(); });
    $('#fClock').innerHTML = CLOCK;
    // level-up reached at night (Basti 22.11.2026): the XP bar lights up, this note opens the level-up screen
    const n = document.createElement('button'); n.id = 'fLvNote'; n.hidden = true; $('#fLeft').appendChild(n);
    n.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.onLvNote(); });
    const r = document.createElement('div'); r.id = 'fRipe'; $('#fLeft').appendChild(r);
    $('#fHpIc').innerHTML = ic('heart'); $('#fCoinIc').innerHTML = ic('coin'); $('#fBook').innerHTML = ic('book'); $('#fPause').innerHTML = '<svg viewBox="0 0 40 40"><rect x="11" y="9" width="6" height="22" rx="2" fill="currentColor"/><rect x="23" y="9" width="6" height="22" rx="2" fill="currentColor"/></svg>';
  }
  /** the level-up note was tapped / clicked */
  onLvNote: () => void = () => {};
  private lvKey = '';
  /** level-up note under the XP bar (null: none) */
  lvNote(level: number | null, touch: boolean) {
    const key = level ? level + '|' + touch : ''; if (key === this.lvKey) return; this.lvKey = key;
    const n = $('#fLvNote'); n.hidden = !level;
    document.querySelector('#fLeft .fBar.xp')?.classList.toggle('lvGlow', !!level);
    if (level) n.innerHTML = `${ic('star')}<span>Level ${level}</span>${touch ? '' : '<kbd>L</kbd>'}`;
  }
  private cdKey = '';
  /** sun clock: by day the sun rises out of the horizon, crosses the arc and sinks behind it at nightfall, the countdown shows the
   *  time to the night; at night the moon crosses the arc, stars come out, the countdown runs down the night, dots = waves */
  private clock(sim: DaySim) {
    const night = sim.nightOn, k = night ? sim.nightK : sim.k;
    // a bit beyond both ends: rises out of / sinks into the horizon (clipped below it)
    const u = -.035 + k * 1.07, a = Math.PI * (1 - u), x = 75 + Math.cos(a) * 58, y = 56 - Math.sin(a) * 46;
    const sun = $('#ckSun'), moon = $('#ckMoon');
    const body = night ? moon : sun, other = night ? sun : moon;
    setA(body, 'transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`); setA(body, 'opacity', '1'); setA(other, 'opacity', '0');
    if (!night) {
      const c = sunCol(k), low = 1 - Math.min(1, Math.sin(Math.max(0, Math.min(Math.PI, a))) * 1.6); // near the horizon: bigger, redder glow
      setA($('#ckCore'), 'fill', rgb(c)); setA($('#ckRays'), 'stroke', rgb(c));
      setA($('#ckRays'), 'transform', `rotate(${(performance.now() / 120) % 360}) scale(${(1 + low * .15).toFixed(3)})`);
      setA((sun.firstElementChild as SVGElement), 'r', (17 + low * 6).toFixed(1));
    }
    setA($('#ckTrail'), 'stroke', night ? 'url(#ckNightG)' : 'url(#ckDayG)');
    setA($('#ckTrail'), 'stroke-dasharray', `${(Math.min(1, Math.max(0, u)) * 100).toFixed(2)} 100`);
    setA($('#ckStars'), 'opacity', night ? (.5 + .5 * Math.min(1, sim.nightK * 8)).toFixed(2) : (sim.k > .9 ? ((sim.k - .9) * 4).toFixed(2) : '0'));
    // countdown: to the night (moon), at night the rest of the night + one dot per wave (red = it came)
    const left = night ? sim.nightLeft : sim.dayLeft, hot = night ? left <= 15 : left <= 30;
    const txt = mss(left), waves = night ? sim.waves.length : 0, inn = night ? sim.wavesIn : 0;
    const key = [night, hot, txt, waves, inn, sim.nightLen > 0].join('|');
    if (key === this.cdKey) return; this.cdKey = key;
    const cd = $('#fCd'); cd.hidden = !sim.nightLen && !night; // tutorial: no night, no countdown
    cd.className = 'ckCd' + (night ? ' night' : '') + (hot ? ' hot' : '');
    cd.innerHTML = (night ? ic('house') : ic('moon')) + `<b>${txt}</b>` + (waves ? `<span class="ckW">${Array.from({ length: waves }, (_, i) => `<i class="${i < inn ? 'on' : ''}"></i>`).join('')}</span>` : '');
  }
  /** "Die Nacht bricht herein!" (with the night's sound, played by the view) */
  warn(on: boolean, sec = 5) {
    const w = $('#fWarn'); clearTimeout((w as any)._t); clearTimeout((w as any)._t2);
    if (!on) { w.hidden = true; return; }
    w.innerHTML = `<div class="wIc">${ic('moon')}${ic('raccoon')}${ic('hare')}</div><div><b>Die Nacht bricht herein!</b><span>Wilde Tiere nähern sich und wollen eure Vorräte stehlen.</span></div>`;
    w.hidden = false; w.className = 'in';
    (w as any)._t = setTimeout(() => { w.className = 'out'; (w as any)._t2 = setTimeout(() => { w.hidden = true; }, 600); }, sec * 1000);
  }
  toggleQuests() { this.questsOpen = !this.questsOpen; this.qKey = ''; }
  /** daily orders at the top right: title + reward, objectives "- 0/5 [icon] Name", green tick when done; collapsed only "Quests [Q]" */
  private quests(s: FarmState, touch: boolean) {
    const P = questProgress(s), list = s.tutorialDone ? s.quests.active : [];
    const key = [this.questsOpen, touch, list.map(q => q.done + ':' + Object.values(P.get(q) ?? {}).join(',')).join('|')].join('/');
    if (key === this.qKey) return; this.qKey = key;
    const head = `<div class="qh">Quests${touch ? '' : ' <kbd>[Q]</kbd>'}</div>`;
    const name = (k: string) => this.cfg.names.items[k] ?? k;
    const one = (q: Quest) => { const p = P.get(q) ?? {};
      return `<div class="qq${q.done ? ' done' : ''}"><div class="qt">${q.done ? ic('check') : ''}<b>${q.title ?? ''}</b><span class="qr"><span>${ic('xp')}${q.reward.xp}</span><span>${ic('coin')}${q.reward.money}</span></span></div>
        ${Object.entries(q.need).map(([k, v]) => `<div class="qo${(p[k] ?? 0) >= v ? ' ok' : ''}">- <i>${p[k] ?? 0}/${v}</i>${ic(k)}${name(k)}</div>`).join('')}</div>`; };
    $('#fQuests').innerHTML = list.length ? head + (this.questsOpen ? list.map(one).join('') : '') : '';
  }
  show(on: boolean) { $('#fHud').hidden = !on; if (!on) this.seedMenu(false); }
  // ---------------- seeds (Basti 22.11.2026) ----------------
  /** active seed of this farmer and the seeds of the farm (endless) */
  seed = ''; seeds: string[] = [];
  /** a new seed was chosen (the owner keeps it in the save) */
  onSeed: (k: string) => void = () => {};
  onSound: (k: string) => void = () => {};
  /** the active seed, valid for the farm's seeds */
  activeSeed() { if (!this.seeds.includes(this.seed)) this.seed = this.seeds[0] ?? 'wheat'; return this.seed; }
  pickSeed(k: string) {
    if (!this.seeds.includes(k)) return;
    const was = this.seed; this.seed = k; this.key = '';
    if (was !== k) { this.onSeed(k); this.onSound('ui.click'); for (const id of ['#bSeed', '#fSeedPc']) { const el = $(id); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); } }
  }
  nextSeed(dir = 1) { if (this.seedOpen) this.seedMenu(false); this.pickSeed(cycleSeed(this.seeds, this.activeSeed(), dir)); }
  get seedOpen() { return !$('#fSeeds').hidden; }
  seedMenu(on: boolean) {
    const p = $('#fSeeds'), bg = $('#fSeedsBg'); p.hidden = !on || !this.seeds.length; if (bg) bg.hidden = p.hidden; if (p.hidden) return;
    const cur = this.activeSeed(), name = (c: string) => this.cfg.crops[c]?.name ?? this.cfg.names.items[c] ?? c;
    p.style.gridTemplateColumns = `repeat(${Math.min(this.seeds.length, innerHeight < 520 ? 4 : 3)},auto)`;
    p.innerHTML = this.seeds.map(c => `<button data-c="${c}" class="${c === cur ? 'on' : ''}">${ic(c)}<span>${name(c)}</span></button>`).join('');
    this.onSound('ui.page');
  }
  private hpW = ''; private xpW = '';
  /** per frame */
  update(sim: DaySim, s: FarmState, view: FarmView, hover: Target | null, hoverInfo: ActionInfo | null, touch: boolean, mouse: { x: number; y: number }) {
    const P = sim.player; this.s = s;
    // style writes only on change (performance plan 1.2)
    const hpW = (P.hp / P.maxHp * 100).toFixed(1) + '%'; if (hpW !== this.hpW) { this.hpW = hpW; $('#fHpFill').style.width = hpW; }
    const nx = nextLevelXp(this.cfg, s.level), px = this.cfg.levels.xp[s.level - 1] ?? 0;
    const xpW = (nx ? Math.min(1, (s.xp - px) / (nx - px)) * 100 : 100).toFixed(1) + '%'; if (xpW !== this.xpW) { this.xpW = xpW; $('#fXpFill').style.width = xpW; }
    this.clock(sim); this.ripe(s);
    if (sim.s.seeds !== this.seeds && sim.s.seeds.join() !== this.seeds.join()) this.seeds = [...sim.s.seeds];
    const seed = this.activeSeed();
    const key = [s.level, s.day, s.money, s.water, s.weapon, s.ammo, s.ammoCount, touch, seed, this.seeds.length].join('|');
    if (key !== this.key) {
      this.key = key;
      $('#fLvlN').textContent = '' + s.level;
      $('#fDay').textContent = '' + s.day;
      const sn = this.cfg.crops[seed]?.name ?? this.cfg.names.items[seed] ?? seed;
      $('#bSeed').innerHTML = `${ic(seed)}<span>${sn}</span>`;
      const pc = $('#fSeedPc'); pc.hidden = touch; pc.innerHTML = `<kbd>Tab</kbd>${ic(seed)}<span>${sn}</span>`;
      $('#fMoney').textContent = '' + s.money;
      let w = ''; for (let i = 0; i < this.cfg.can.capacity; i++) w += `<i class="${i < s.water ? '' : 'e'}">${ic(i < s.water ? 'drop' : 'dropEmpty')}</i>`;
      $('#fWater').innerHTML = w;
      const gun = sim.canShoot() || (s.weapon && s.weapon !== 'rake' && s.ammo);
      $('#fWeap').innerHTML = gun ? `${ic(s.weapon!)}<span>${ic(s.ammo!)}<b>${s.ammoCount}</b></span>` : ic('rake');
      $('#bAtk').innerHTML = gun && s.ammoCount > 0 ? ic(s.weapon!) : ic('rake');
    }
    this.quests(s, touch);
    const now = performance.now(), dt = Math.min(.1, (now - this.lastT) / 1000); this.lastT = now;
    this.bar.update(sim, s, view, sim.paused ? 0 : dt, touch);
    // tool at the cursor (PC) / on the action button (touch)
    const tool = hoverInfo ? TOOL_ICON[hoverInfo.tool] : null;
    const cur = $('#fCursor');
    if (!touch && !this.kb && hover && tool && !sim.inputLocked && !P.action) {
      cur.hidden = false; cur.style.transform = `translate(${mouse.x + 16}px,${mouse.y + 10}px)`;
      cur.classList.toggle('no', !hoverInfo!.ok);
      if (cur.dataset.t !== tool + hoverInfo!.ok) { cur.dataset.t = tool + hoverInfo!.ok; cur.innerHTML = ic(tool) + (hoverInfo!.ok ? '' : `<em>${ic(hoverInfo!.why === 'water' ? 'dropEmpty' : hoverInfo!.why === 'seed' ? 'seed' : 'lock')}</em>`); }
    } else cur.hidden = true;
    // "[Aktion]" over the spot the player would work at (hidden while an action runs: the bar shows then)
    const lab = $('#fLabel');
    if (hover && hoverInfo && !sim.inputLocked && !P.action && !P.goal) {
      // buildings: over the wall next to the player, not over the middle of the roof
      const tp = hover.k === 'bld' || hover.k === 'stall' ? sim.facePoint(hover) : sim.targetPos(hover), p = view.screen(tp.x, LABEL_Y[hover.k] ?? 1.5, tp.z);
      lab.hidden = !p.on;
      const x = Math.max(110, Math.min(VP.w - 110, p.x)), y = Math.max(110, Math.min(VP.h - 20, p.y));
      lab.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-100%)`;
      const need = !hoverInfo.ok && hoverInfo.need ? Object.entries(hoverInfo.need).map(([k, n]) => `<span class="need">${ic(k)}${n}</span>`).join('') : '';
      const why = !hoverInfo.ok && !need ? ic(hoverInfo.why === 'water' ? 'dropEmpty' : hoverInfo.why === 'seed' ? 'seed' : hoverInfo.why === 'weeds' ? 'green' : 'lock') : '';
      const html = (touch ? '' : this.kb ? KEY_E : LMB) + `<span>[${hoverInfo.label}]</span>` + (hoverInfo.item ? ic(hoverInfo.item) : '') + (hoverInfo.count ? `<i>${hoverInfo.count}</i>` : '') + need + why;
      if (lab.dataset.h !== html) { lab.dataset.h = html; lab.innerHTML = html; }
      lab.classList.toggle('no', !hoverInfo.ok);
    } else lab.hidden = true;
    const act = $('#bAct'), t2 = touch && hoverInfo ? TOOL_ICON[hoverInfo.tool] : 'hands';
    // pulled up (Basti 22.11.2026): the knob shows the weapon, else the tool of the spot
    const atk = $('#bDual').classList.contains('atk'), kk = atk ? 'atk' + $('#bAtk').innerHTML.length : t2 + (hoverInfo?.ok ?? '');
    if (act.dataset.t !== kk) { act.dataset.t = kk; act.innerHTML = atk ? $('#bAtk').innerHTML : ic(t2); if (!atk) $('#bDn').innerHTML = ic(t2); }
    act.classList.toggle('idle', !atk && (!hoverInfo || !hoverInfo.ok));
    // floating numbers follow their world point
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += dt;
      // 22.11.2026: they come up from below (fast, then slowing down) and fade in, then out
      const k = Math.min(1, n.t / 1.2), rise = 1.5 * (1 - (1 - k) * (1 - k));
      const p = view.screen(n.x, n.y + rise, n.z);
      n.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%)`; n.el.style.opacity = '' + Math.min(n.t / .15, Math.max(0, 1 - Math.max(0, n.t - .75) / .45));
      if (n.t > 1.2) { n.el.remove(); this.nums.splice(i, 1); }
    }
  }
  /** ripe fields (Basti 22.11.2026): under HP/XP. The first ripe field fades in from below ("Weizen erntereif"), every further
   *  one slides up from below into it with a small pop ("2 Felder erntereif"); fades out when nothing is ripe any more */
  private ripeN = 0; private ripeT = 0;
  private ripe(s: FarmState) {
    const ripe = s.plots.filter(p => p.open && p.stage === 'ripe' && p.crop), n = ripe.length;
    if (n === this.ripeN) return;
    const box = $('#fRipe'), was = this.ripeN; this.ripeN = n;
    const crop = ripe[0]?.crop ?? '', name = this.cfg.crops[crop]?.name ?? this.cfg.names.items[crop] ?? crop;
    const html = n ? (n === 1 ? `${ic(crop)}<span>${name} erntereif</span>` : `<b>${n}</b><span>Felder erntereif</span>`) : '';
    clearTimeout(this.ripeT); box.querySelectorAll('.ghost').forEach(e => e.remove());
    if (!n) { box.classList.remove('in'); box.classList.add('out'); return; }
    if (!was || !box.classList.contains('in')) {
      box.innerHTML = `<div class="rt">${html}</div>`; box.classList.remove('out'); void box.offsetWidth; box.classList.add('in'); return;
    }
    if (n < was) { box.querySelector('.rt')!.innerHTML = html; return; }
    // a new one comes up from below and merges into the existing toast
    const g = document.createElement('div'); g.className = 'rt ghost'; g.innerHTML = html; box.appendChild(g);
    this.ripeT = window.setTimeout(() => {
      g.remove(); const t = box.querySelector('.rt') as HTMLElement; t.innerHTML = html;
      t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    }, 380);
  }
  float(x: number, z: number, html: string, cls = '') {
    const el = document.createElement('b'); el.className = cls; el.innerHTML = html; $('#fFloat').appendChild(el);
    // several at once on one spot (wild herbs: weed + herbs) stack instead of covering each other
    const same = this.nums.filter(n => n.t < .05 && Math.abs(n.x - x) < .3 && Math.abs(n.z - z) < .3).length;
    this.nums.push({ el, x, y: .6 + same * .3, z, t: 0 });
  }
  /** harvest (Basti 22.11.2026): "amount icon name", the text in the colour of the rarity; a lucky roll a bit bigger */
  harvest(x: number, z: number, item: string, n: number, lucky = false) {
    const name = (this.cfg.names.items as Record<string, string>)[item] ?? item, r = goodInfo(this.cfg, item).rarity;
    this.float(x, z, `<span class="hn">${n}</span>${ic(item)}<span>${name}</span>`, `harv r${r[0]}${lucky ? ' lucky' : ''}`);
  }
  hint(text: string | null, icon?: string) {
    const h = $('#fHint'); h.hidden = !text; if (text) h.innerHTML = (icon ? ic(icon) : '') + `<span>${text}</span>`;
  }
  /** pause card that explains fighting (tutorial): PC shows the right mouse button, touch the attack button */
  fightCard(on: boolean, text = '', touch = false) {
    const c = $('#fFight'); c.hidden = !on; if (!on) return;
    const mouse = `<svg viewBox="0 0 60 90"><rect x="4" y="4" width="52" height="82" rx="26" fill="#1a2027" stroke="#e3b964" stroke-width="3"/><path d="M30 4v34M4 38h52" stroke="#3a4550" stroke-width="3"/><path d="M33 7.5a23 23 0 0 1 19.5 22V36H33z" fill="#e3b964"/></svg>`;
    const up = '<svg viewBox="0 0 40 40"><path d="M20 34V8M9 18l11-11 11 11" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    c.innerHTML = `<div class="fk">${touch ? `<div class="tbd"><i class="ar">${up}</i><div class="tb">${ic('rake')}</div></div>` : mouse}</div><div class="ft">${text}</div>`;
  }
  fade(on: boolean, slow = false) { const f = $('#fFade'); f.style.transitionDuration = slow ? '1.4s' : '.5s'; f.classList.toggle('on', on); }
  letterbox(on: boolean) { $('#fBars').classList.toggle('on', on); }
  clear() { this.bar.hide(); this.warn(false); $('#fLabel').hidden = true; for (const n of this.nums) n.el.remove(); this.nums.length = 0; this.hint(null); this.fightCard(false); this.letterbox(false); this.lvNote(null, false); }
}
