// Werkbank-Techtree UI (25.11.2026): the techtree panel (Priv ro 1), the pickup popup of a finished idea (ro 2, panel dimmed below),
// the research progress for the XP bar / XP orb and the HUD button that opens the panel away from the bench.
// Everything is rebuilt from the snapshot (rsFromSnap), so host, solo and guests show the same; actions go out through the callbacks
// (main.ts: sim call on the host / solo, net message on a guest). No explanation texts: names, icons and values only.
import { AMMO_OF, Balancing, FruitType, MUSHROOMS, ResearchNode, SkillId, ammoPool } from '../config';
import type { Snap } from '../sim/snap';
import { fertAfford, fertCost, fertLv, fertMax, fertMode, fertRecipe, fieldUpOf, isPlaceNode, nodeAvailable, nodeDone, nodeMul, rNodes, rsFromSnap, seedMode, segmentOpen, treeOpen } from '../sim/research';
import { fieldArt, fruitIcon, mini, mushIcon, skillIcon } from './icons';

/** 27.11.2026 the fertilizer tab of the panel (Kompostierer) */
const FERT = '$fert';

type RS = ReturnType<typeof rsFromSnap>;
type St = 'done' | 'cur' | 'ready' | 'avail' | 'lock';
const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const nf = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d });
/** compact time: 25 s, 1:40 min-style for long ones */
const tfmt = (s: number) => s < 100 ? `${Math.ceil(s - 1e-6)} s` : s < 3600 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${nf(s / 3600, 1)} h`;

/** 26.11.2026 upgrade node: weapon of the upgrade key ("pea_dmg" -> pea) and its kind ("dmg") */
const upSplit = (key: string) => { const i = key.indexOf('_'); return [key.slice(0, i), key.slice(i + 1)] as [string, string]; };
/** name of an upgrade (names.upgrades: full key first, then the part after "_") */
export function upName(cfg: Balancing, key: string) { const U = cfg.names.upgrades ?? {}, [w, k] = upSplit(key); if (w === 'fld') return U.fld ?? 'Zykluszeit'; return U[key] ?? U[k] ?? k; }
/** icon + what one level of an upgrade adds (shown on the chip / in the popup; all numbers from balancing.yaml) */
export function upInfo(cfg: Balancing, key: string, lv = 1): { icon: string; txt: string } {
  const U = cfg.upgrades as any, S = cfg.skills as any, [w, k] = upSplit(key), pc = (v: number) => `+${nf(v * 100)} %`;
  if (w === 'fld') return { icon: mini('cd'), txt: `−${nf((1 - (cfg.fields.upgrade?.factor ?? .8)) * 100)} %` }; // 26.11.2026 Feld-Upgrade: cycle time
  switch (key) {
    case 'sack_hp': return { icon: mini('heart'), txt: `+${nf(S.sack.hpStep)}` };
    case 'sack_heal': return { icon: mini('repair'), txt: `+${nf(S.sack.repairStep)}/min` };
    case 'sack_cost': return { icon: mini('cost'), txt: `−${nf(S.sack.costStep)}` };
    case 'wall_hp': return { icon: mini('heart'), txt: `+${nf(S.wall.hpStep ?? 0)}` };
    case 'cab_rng': return { icon: mini('radius'), txt: pc(U.rangePerLevel) };
    case 'cab_mini': return { icon: mini('mini'), txt: `+${nf(U.cabMini.step)}` };
    case 'cab_pois': return { icon: mini('poison'), txt: pc(U.cabPoison.step) };
    case 'cab_gas': return { icon: mini('poison'), txt: pc(U.cabGas.step) };
    case 'chili_sweep': return { icon: mini('sweep'), txt: `+${nf(U.chiliSweep.sweepStep)}°` };
    case 'chili_tick': return { icon: mini('fire'), txt: `−${nf((1 - U.chiliTick.factor) * 100)} %` };
    case 'lemon_tgt': return { icon: mini('chain'), txt: `+${nf(U.lemonTargets.step)}` };
    case 'lemon_xfer': return { icon: mini('chain'), txt: pc(U.lemonTransfer.step) };
    case 'lemon_eff': return { icon: mini('chain'), txt: pc(U.lemonEfficiency.step) };
    case 'lemon_rng': return { icon: mini('radius'), txt: pc(U.rangePerLevel) };
    case 'asp_pierce': return { icon: mini('pierce'), txt: lv >= (U.aspPierce?.max ?? 4) ? '∞' : `+${nf(U.aspPierce.step)}` };
    case 'asp_pb': return { icon: mini('pierce'), txt: pc(U.aspPierceBonus.step) };
    case 'asp_salvo': { const sh = U.aspSalvo.shots as number[], a = lv > 1 ? sh[lv - 2] : S.asp.burstShots; return { icon: mini('pellet'), txt: `${a} → ${sh[Math.min(lv, sh.length) - 1]}` }; }
    case 'asp_size': return { icon: mini('size'), txt: pc(U.aspSize.step) };
  }
  void w;
  if (k === 'dmg') return { icon: mini('dmg'), txt: pc(U.damagePerLevel) };
  if (k === 'rng') return { icon: mini('range'), txt: pc(U.rangePerLevel) };
  if (k === 'cd') return { icon: mini('cd'), txt: `−${nf(U.cooldownPerLevel * 100)} %` };
  if (k === 'pel') return { icon: mini('pellet'), txt: `+${nf(U.cranPellets.step)}` };
  if (k === 'pierce') return { icon: mini('pierce'), txt: pc(U.cranPierce.step) };
  if (k === 'dur') return { icon: mini('fire'), txt: pc(U.wheatDuration?.step ?? .25) };
  return { icon: mini('up'), txt: '' };
}
export function nodeName(cfg: Balancing, n: ResearchNode) {
  const N = cfg.names;
  if (n.kind === 'speed') return N.research?.speed ?? 'Forschungstempo';
  if (isPlaceNode(n)) return (N.fields as Record<string, string>)[n.ref ?? ''] ?? n.ref ?? n.id;
  if (n.kind === 'upgrade') return upName(cfg, n.ref ?? '');
  return (N.skills as Record<string, string>)[n.ref ?? ''] ?? n.ref ?? n.id;
}
export function nodeIcon(n: ResearchNode, cfg?: Balancing) {
  if (n.kind === 'upgrade') return cfg ? upInfo(cfg, n.ref ?? '', n.lv).icon : mini('up');
  return n.kind === 'speed' ? mini('tempo') : isPlaceNode(n) ? fieldArt(n.ref ?? '') : skillIcon(n.ref ?? '');
}

/** XP bar / orb in research mode: progress of the idea being researched (0..1), complete, icon of the idea (bulb = nothing chosen) */
export function researchBar(cfg: Balancing, s: Snap): { frac: number; ready: boolean; key: string; icon: string; text: string } | null {
  if (!s.rs) return null;
  const ns = rNodes(cfg), ci = s.rs[0] ?? -1, n = ci >= 0 ? ns[ci] : null, ready = !!s.rs[1];
  const frac = n ? (ready ? 1 : Math.min(1, s.rp?.[ci] ?? 0)) : 0;
  return { frac, ready, key: n ? n.id : '-', icon: n ? (fieldUpOf(n) ? fieldArt(fieldUpOf(n)!) : n.kind === 'upgrade' ? skillIcon(upSplit(n.ref ?? '')[0]) : nodeIcon(n)) : mini('bulb'), text: n ? (ready ? '100 %' : `${Math.floor(frac * 100)} %`) : '' };
}

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class TechTree {
  onChoose: (node: number) => void = () => {};
  /** 26.11.2026 Samen-Suche: the tree (research.trees index) the next search at the chest opens */
  onSeed: (tree: number) => void = () => {};
  onFinish: () => void = () => {};
  onClose: () => void = () => {};
  onOpen: () => void = () => {};
  private root: HTMLElement; private panel: HTMLElement; private scroll: HTMLElement; private canvas: HTMLElement; private pop: HTMLElement; private tabs: HTMLElement; private speed: HTMLButtonElement;
  private btn: HTMLButtonElement;
  private key = ''; private popKey = ''; private ro = 0; private lay: ReturnType<TechTree['layout']> | null = null;
  /** 26.11.2026 Einzelbäume: tree shown (tab), chosen by the player (kept while the panel is open) */
  private tab = ''; private tabPicked = false;
  private nodeEls: HTMLElement[] = []; private wantFront = false; private finishSent = false;
  private drag: { x: number; y: number; sl: number; st: number; moved: boolean; id: number; vx: number; vy: number; t: number; lx: number; ly: number } | null = null; private dragEnd = -1e9; private glide = 0;

  constructor() {
    const hud = $('#hud');
    this.root = document.createElement('div'); this.root.id = 'rsTree'; this.root.hidden = true;
    this.root.innerHTML = `<div class="rtPanel" role="dialog"><div class="rtHead"><i class="rtHi">${mini('bulb')}</i><b class="rtTitle"></b><div class="rtTabs" role="tablist"></div>
      <button class="rtSpeed"></button>
      <button class="rtClose" aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button></div>
      <div class="rtScroll"><div class="rtCanvas"></div></div></div>`;
    hud.appendChild(this.root);
    this.panel = this.root.querySelector('.rtPanel')!; this.scroll = this.root.querySelector('.rtScroll')!; this.canvas = this.root.querySelector('.rtCanvas')!;
    this.tabs = this.root.querySelector('.rtTabs')!; this.speed = this.root.querySelector('.rtSpeed')!;
    this.pop = document.createElement('div'); this.pop.id = 'rsPop'; this.pop.hidden = true; hud.appendChild(this.pop);
    // HUD button (phone + mouse): opens the panel anywhere; next to the pause button
    this.btn = document.createElement('button'); this.btn.className = 'ibtn'; this.btn.id = 'rsBtn'; this.btn.hidden = true; this.btn.setAttribute('aria-label', 'Techtree');
    this.btn.innerHTML = mini('bulb');
    const pause = $('#pauseBtn'); pause.parentElement!.insertBefore(this.btn, pause);
    this.btn.addEventListener('click', () => this.onOpen());
    this.root.querySelector('.rtClose')!.addEventListener('click', () => { if (this.ro === 1) this.onClose(); });
    this.root.addEventListener('click', e => { if (e.target === this.root && this.ro === 1) this.onClose(); }); // click on the dark backdrop
    // tabs: one small tree per fruit
    this.tabs.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('.rtTab'); if (!b || this.ro !== 1) return;
      if (b.dataset.t !== this.tab) { this.tab = b.dataset.t!; this.tabPicked = true; this.key = ''; this.wantFront = true; this.scroll.scrollLeft = 0; this.scroll.scrollTop = 0; }
    });
    // Forschungstempo in the header (always available)
    this.speed.addEventListener('click', () => {
      if (this.ro !== 1) return; const i = +(this.speed.dataset.i ?? -1);
      if (i >= 0 && (this.speed.classList.contains('avail') || this.speed.classList.contains('cur'))) { this.speed.classList.add('chosen'); this.onChoose(i); } else this.deny(this.speed);
    });
    // node click (delegated): only available ones; a mouse drag is no click
    this.canvas.addEventListener('click', e => {
      if (performance.now() - this.dragEnd < 350) return; // end of a drag, no click
      const fb = (e.target as HTMLElement).closest<HTMLElement>('.rtFert'); if (fb && this.ro === 1) { if (fb.classList.contains('max') || fb.classList.contains('on')) this.deny(fb); else { fb.classList.add('on'); this.onSeed(+fb.dataset.tree!); } return; } // 27.11.2026 choose the fertilizer
      const sb = (e.target as HTMLElement).closest<HTMLElement>('.rtSeedBtn'); if (sb && this.ro === 1) { if (!sb.classList.contains('on')) { sb.classList.add('on'); this.onSeed(+sb.dataset.tree!); } else this.deny(sb); return; }
      const b = (e.target as HTMLElement).closest<HTMLElement>('.rtNode'); if (!b || this.ro !== 1) return;
      if (b.classList.contains('avail') || b.classList.contains('cur')) { b.classList.add('chosen'); this.onChoose(+b.dataset.i!); }
      else this.deny(b);
    });
    // mouse wheel scrolls sideways (vertical if the tree is taller than the panel and not wider)
    this.scroll.addEventListener('wheel', e => {
      e.stopPropagation(); // not the game zoom behind
      const sc = this.scroll, wide = sc.scrollWidth > sc.clientWidth + 1, tall = sc.scrollHeight > sc.clientHeight + 1;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { if (tall && !e.shiftKey) sc.scrollTop += e.deltaY; else if (wide) sc.scrollLeft += e.deltaY; e.preventDefault(); } // Shift + wheel: sideways
    }, { passive: false });
    this.tabs.addEventListener('wheel', e => { e.stopPropagation(); if (this.tabs.scrollWidth > this.tabs.clientWidth) { this.tabs.scrollLeft += e.deltaY + e.deltaX; e.preventDefault(); } }, { passive: false });
    // drag to scroll with mouse and finger (own code instead of native touch panning: the game turns touch-action off on the page), with a short glide
    this.scroll.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      cancelAnimationFrame(this.glide);
      this.drag = { x: e.clientX, y: e.clientY, sl: this.scroll.scrollLeft, st: this.scroll.scrollTop, moved: false, id: e.pointerId, vx: 0, vy: 0, t: performance.now(), lx: e.clientX, ly: e.clientY };
    });
    addEventListener('pointermove', e => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > (e.pointerType === 'mouse' ? 6 : 10)) { d.moved = true; this.scroll.classList.add('drag'); }
      if (!d.moved) return;
      const now = performance.now(), dt = Math.max(1, now - d.t), k = Math.min(1, dt / 60);
      d.vx = d.vx * (1 - k) + (e.clientX - d.lx) / dt * k; d.vy = d.vy * (1 - k) + (e.clientY - d.ly) / dt * k; d.t = now; d.lx = e.clientX; d.ly = e.clientY;
      this.scroll.scrollLeft = d.sl - (e.clientX - d.x); this.scroll.scrollTop = d.st - (e.clientY - d.y);
    });
    const end = (e: PointerEvent) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return; this.drag = null; this.scroll.classList.remove('drag');
      if (!d.moved) return;
      this.dragEnd = performance.now();
      let vx = performance.now() - d.t < 80 ? d.vx : 0, vy = performance.now() - d.t < 80 ? d.vy : 0, last = performance.now();
      const step = (now: number) => { const dt = Math.min(40, now - last); last = now; this.scroll.scrollLeft -= vx * dt; this.scroll.scrollTop -= vy * dt; const f = Math.pow(.994, dt); vx *= f; vy *= f; if (Math.hypot(vx, vy) > .02) this.glide = requestAnimationFrame(step); };
      if (Math.hypot(vx, vy) > .1) this.glide = requestAnimationFrame(step);
    };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    addEventListener('resize', () => { this.key = ''; this.popKey = ''; });
    // PC: Enter = "Fertigstellen" in the popup; 1..9 / Q E = switch the tree
    addEventListener('keydown', e => {
      if (this.ro === 2 && !this.pop.hidden && (e.key === 'Enter' || e.key === 'NumpadEnter') && !e.repeat) { e.preventDefault(); this.finish(); }
      if (this.ro === 1 && !e.repeat && /^[1-9]$/.test(e.key)) { const b = this.tabs.querySelectorAll<HTMLElement>('.rtTab')[+e.key - 1]; if (b) { e.preventDefault(); b.click(); } }
    });
  }
  get open() { return this.ro > 0; }
  reset() { this.key = ''; this.popKey = ''; this.ro = 0; this.tab = ''; this.tabPicked = false; this.root.hidden = true; this.pop.hidden = true; this.btn.hidden = true; document.body.classList.remove('rsMode', 'rsOpen'); }

  private deny(b: HTMLElement) { b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); }
  private finish() { if (this.finishSent) return; this.finishSent = true; this.pop.querySelector('.rpGo')?.classList.add('done'); this.onFinish(); }

  /** the trees (tabs); without research.trees one tree with every node (old yaml) */
  private trees(cfg: Balancing) { const T = cfg.research?.trees; return T?.length ? T : [{ id: '', icon: 'pea', segment: 1 }]; }
  private inTree(n: ResearchNode, t: string) { return n.kind !== 'speed' && (t === '' || n.tree === t); }
  /** tab to show when the panel opens: the tree of the idea in work, else the first open tree with something to choose */
  private pickTab(cfg: Balancing, st: RS) {
    const T = this.trees(cfg), ns = rNodes(cfg), cur = ns.find(n => n.id === st.cur && n.kind !== 'speed');
    if (cur) return cur.tree ?? T[0].id;
    if (this.tab && (this.tab === FERT || T.some(t => t.id === this.tab))) return this.tab;
    const av = T.find(t => ns.some(n => this.inTree(n, t.id) && n.kind !== 'upgrade' && nodeAvailable(cfg, st, n.id))) ?? T.find(t => ns.some(n => this.inTree(n, t.id) && nodeAvailable(cfg, st, n.id)));
    return (av ?? T[0]).id;
  }

  /** every frame (cheap when nothing changed) */
  update(s: Snap, me: number, cfg: Balancing) {
    const pr = s.me[me], on = !!s.rs && !!cfg.research;
    document.body.classList.toggle('rsMode', on);
    if (!on) { if (this.ro || !this.root.hidden) this.reset(); return; }
    const ro = (pr?.ro ?? 0) as number, was = this.ro; this.ro = ro;
    const st = rsFromSnap(cfg, s);
    document.body.classList.toggle('rsOpen', ro > 0);
    this.btn.hidden = !(ro === 0 && s.ph === 'play' && !!pr && pr.pc < 0);
    this.btn.classList.toggle('ready', st.ready);
    if (ro === 0) { this.root.hidden = true; this.pop.hidden = true; this.finishSent = false; this.tabPicked = false; return; }
    if (was === 0 && pr?.rf && fertMode(cfg)) { this.tab = FERT; this.tabPicked = true; this.key = ''; this.scroll.scrollLeft = 0; this.scroll.scrollTop = 0; } // 27.11.2026 opened at the Kompostierer
    else if (was === 0) { this.wantFront = true; this.tab = this.pickTab(cfg, st); this.key = ''; }
    else if (!this.tabPicked) { const t = this.pickTab(cfg, st); if (t !== this.tab) { this.tab = t; this.key = ''; this.wantFront = true; } } // follows the idea in work until the player picks a tab
    this.root.hidden = false;
    this.root.classList.toggle('dim', ro === 2);
    // panel structure (rebuilt only when the tree state, the tab or the screen size changes)
    const L = this.layout(cfg);
    (st as any).seedIdx = s.rs?.[6] ?? -1;
    const key = `${L.key}|${this.tab}|${(s.rd ?? []).join('')}|${st.cur}|${st.ready ? 1 : 0}|${st.speedLv}|${st.n}|${(s.rt ?? []).join(',')}|${s.rs?.[6] ?? -1}|${s.lv}|${(s.sm ?? []).join(',')}|${(s.fe ?? []).join(',')}`;
    if (key !== this.key) { const sl = this.scroll.scrollLeft, sy = this.scroll.scrollTop; this.key = key; this.build(cfg, st, L); this.scroll.scrollLeft = sl; this.scroll.scrollTop = sy; }
    // progress of every node (another player may be hammering while this one looks)
    const ns = rNodes(cfg);
    this.nodeEls.forEach(el => {
      const i = +el.dataset.i!, p = Math.min(1, s.rp?.[i] ?? 0), v = p.toFixed(3);
      if (el.dataset.p !== v) {
        el.dataset.p = v; el.style.setProperty('--p', v);
        const c = el.querySelector('.rtCost span'); if (c && !el.classList.contains('done')) c.textContent = tfmt(st.cost * nodeMul(cfg, ns[i], st) * (1 - p));
      }
    });
    for (const fb of this.canvas.querySelectorAll<HTMLElement>('.rtFert.on')) { const sp = st.seedP; fb.style.setProperty('--p', sp.toFixed(3)); const c = fb.querySelector('.rtCost span'); if (c) c.textContent = tfmt(st.seedCost * (1 - sp)); }
    { const sb = this.canvas.querySelector<HTMLElement>('.rtSeedBtn.on'); if (sb) { const sp = st.seedP; sb.style.setProperty('--p', sp.toFixed(3)); const c = sb.querySelector('.rtCost span'); if (c) c.textContent = tfmt(st.seedCost * (1 - sp)); } }
    { const tb = this.tabs.querySelector<HTMLElement>('.rtTab.cur'); if (tb) { const ci = s.rs![0] ?? -1; tb.style.setProperty('--p', (Math.min(1, s.rp?.[ci] ?? 0)).toFixed(3)); } }
    if (this.wantFront && this.scroll.clientWidth) { this.wantFront = false; this.toFront(cfg, st); }
    // pickup popup
    if (ro === 2) {
      const ci = s.rs![0] ?? -1, n = ns[ci];
      const pk = `${ci}|${st.speedLv}|${innerWidth}x${innerHeight}`;
      if (n && pk !== this.popKey) { this.popKey = pk; this.finishSent = false; this.buildPopup(cfg, n, st); }
      this.pop.hidden = !n;
    } else { this.pop.hidden = true; this.popKey = ''; this.finishSent = false; }
  }

  /** sizes from the screen: node size from the height (the tree scrolls both ways) */
  private layout(cfg: Balancing) {
    void cfg;
    const vw = innerWidth, vh = innerHeight, small = vh < 520 || vw < 720;
    const head = small ? 50 : 60;
    const N = small ? (vh < 380 ? 42 : 48) : 56, U = Math.round(N * .74), cellH = Math.max(N, U + 30) + (small ? 8 : 14);
    const labW = small ? 104 : 124, pillW = N + labW, chipW = U + 14, colW = small ? 66 : 84, gap = small ? 18 : 28, cgap = small ? 2 : 6, pad = small ? 12 : 20;
    const vgap = small ? 30 : 40, chainGap = small ? 8 : 10, chipTx = 16, capH = 15, rad = 7;
    return { key: `${vw}x${vh}`, cellH, N, U, pillW, chipW, colW, gap, cgap, pad, small, head, vgap, chainGap, chipTx, capH, rad };
  }

  private state(cfg: Balancing, st: RS, n: ResearchNode): St {
    if (nodeDone(cfg, st, n.id)) return 'done';
    if (st.cur === n.id) return st.ready ? 'ready' : 'cur';
    return nodeAvailable(cfg, st, n.id) ? 'avail' : 'lock';
  }

  private build(cfg: Balancing, st: RS, L: ReturnType<TechTree['layout']>) {
    this.lay = L;
    const all = rNodes(cfg), NR = cfg.names.research ?? {}, R = cfg.research!, T = this.trees(cfg);
    this.root.querySelector('.rtTitle')!.textContent = NR.title ?? '';
    this.panel.style.setProperty('--n', L.N + 'px'); this.panel.style.setProperty('--u', L.U + 'px'); this.panel.style.setProperty('--head', L.head + 'px');
    this.panel.classList.toggle('small', L.small);
    // ---- tabs ----
    const FM = fertMode(cfg), fertTab = FM ? `<button class="rtTab rtTabFert${this.tab === FERT ? ' sel' : ''}${(cfg.research!.trees ?? []).some(t => fertRecipe(cfg, t.id).length && fertLv(st, t.id) < fertMax(cfg) && fertAfford(cfg, st.stock, t.id)) ? ' avail' : ''}" data-t="${FERT}" role="tab" aria-selected="${this.tab === FERT}" aria-label="${esc(NR.fert ?? 'Dünger')}"><span class="rtTabIc">${mini('fert')}</span><small>${esc(NR.fert ?? '')}</small></button>` : '';
    this.tabs.innerHTML = fertTab + T.map(t => {
      const tn = all.filter(n => this.inTree(n, t.id)), open = treeOpen(cfg, st, t.id), seedT = !open && seedMode(cfg) && (cfg.research!.trees ?? []).findIndex(x => x.id === t.id) === (st as any).seedIdx;
      const cur = tn.some(n => n.id === st.cur), av = open && tn.some(n => nodeAvailable(cfg, st, n.id) && n.id !== st.cur);
      const done = tn.filter(n => nodeDone(cfg, st, n.id)).length;
      const cls = ['rtTab', t.id === this.tab ? 'sel' : '', open ? '' : 'lock', cur ? 'cur' : '', cur && st.ready ? 'ready' : '', av ? 'avail' : '', seedT ? 'seed' : ''].join(' ');
      return `<button class="${cls}" data-t="${esc(t.id)}" role="tab" aria-selected="${t.id === this.tab}" aria-label="${esc((cfg.names.fields as any)[t.icon] ?? t.id)}">
        <span class="rtTabIc">${fruitIcon(t.icon)}</span>${open ? '' : `<b class="rtBadge lk">${mini(seedT ? 'seed' : 'lock')}</b>`}${cur ? `<i class="rtTabRing"></i>` : ''}
        <small>${done}/${tn.length}</small></button>`;
    }).join('');
    const selTab = this.tabs.querySelector<HTMLElement>('.rtTab.sel'); if (selTab) { const tb = this.tabs, x = selTab.offsetLeft; if (x < tb.scrollLeft || x + selTab.offsetWidth > tb.scrollLeft + tb.clientWidth) tb.scrollLeft = x - 8; }
    // ---- Forschungstempo (header) ----
    const sp = all.find(n => n.kind === 'speed'), spi = sp ? all.indexOf(sp) : -1;
    if (sp) {
      const s0 = this.state(cfg, st, sp), tempo = Math.pow(1 + R.speedPerLevel, st.speedLv);
      this.speed.hidden = false; this.speed.dataset.i = String(spi); this.speed.className = `rtSpeed rtNode2 ${s0}`;
      this.speed.dataset.p = ''; this.speed.setAttribute('aria-label', nodeName(cfg, sp));
      this.speed.innerHTML = `<i class="rtSpIc">${mini('tempo')}<b class="rtBadge lv">${st.speedLv}</b></i><span class="rtSpTx"><b>${nf(tempo * 100)} %</b>${s0 === 'ready' ? `<span class="rtCost rdy">${mini('bulb')}</span>` : `<span class="rtCost"><small>+${nf(R.speedPerLevel * 100)} %</small><i>${mini('cd')}</i><span>${tfmt(st.cost * (1 - Math.min(1, (st.work[sp.id] ?? 0) / st.cost)))}</span></span>`}</span><i class="rtBar"></i>`;
    } else this.speed.hidden = true;
    // ---- 27.11.2026 fertilizer tab: one card per plant (what it needs, level, yield) ----
    if (this.tab === FERT && FM) {
      const C = this.canvas, cards = (R.trees ?? []).map((t, i) => fertRecipe(cfg, t.id).length ? this.fertCard(cfg, st, i) : '').join('');
      this.panel.style.setProperty('--cw', (L.small ? 0 : 780) + 'px');
      C.style.width = '100%'; C.style.height = 'auto'; C.innerHTML = `<div class="rtFertGrid">${cards}</div>`; this.nodeEls = sp ? [this.speed] : [];
      return;
    }
    // ---- the tree of the selected tab ----
    const tree = T.find(t => t.id === this.tab) ?? T[0], ns = all.filter(n => this.inTree(n, tree.id)), sts = new Map(ns.map(n => [n.id, this.state(cfg, st, n)] as const));
    const byId = new Map(ns.map(n => [n.id, n] as const));
    // 26.11.2026 top-down tree (Basti): the root sits in the middle at the top, what it opens splits below it to the left, middle and
    // right; same upgrades run down in one column, different ones stand side by side. Links are right angles with slightly rounded corners.
    const kids = new Map<string, ResearchNode[]>(), roots: ResearchNode[] = [];
    for (const n of ns) { const p = (n.needs ?? []).find(id => byId.has(id)); if (p) { const k = kids.get(p) ?? []; k.push(n); kids.set(p, k); } else roots.push(n); }
    const W = (n: ResearchNode) => n.kind === 'upgrade' ? L.colW : L.pillW, H = (n: ResearchNode) => n.kind === 'upgrade' ? L.U + L.chipTx : L.N;
    const SW = new Map<string, number>();
    const sw = (n: ResearchNode, d = 0): number => {
      const got = SW.get(n.id); if (got !== undefined) return got;
      const ch = d < 40 ? kids.get(n.id) ?? [] : [];
      const w = Math.max(W(n), ch.reduce((a, c, i) => a + sw(c, d + 1) + (i ? sib(ch[i - 1], c) : 0), 0));
      SW.set(n.id, w); return w;
    };
    const sib = (a: ResearchNode, b: ResearchNode) => a.kind === 'upgrade' && b.kind === 'upgrade' ? L.cgap : L.gap;
    const CX = new Map<string, number>(), Y = new Map<string, number>();
    const place = (n: ResearchNode, cx: number, y: number, d = 0) => {
      CX.set(n.id, cx); Y.set(n.id, y);
      const ch = d < 40 ? kids.get(n.id) ?? [] : []; if (!ch.length) return;
      const tot = ch.reduce((a, c, i) => a + sw(c) + (i ? sib(ch[i - 1], c) : 0), 0);
      let x = cx - tot / 2;
      ch.forEach((c, i) => {
        if (i) x += sib(ch[i - 1], c);
        const up = c.kind === 'upgrade', chain = up && n.kind === 'upgrade';
        place(c, x + sw(c) / 2, y + H(n) + (chain ? L.chainGap : L.vgap + (up ? L.capH : 0)), d + 1); x += sw(c);
      });
    };
    const rw = roots.reduce((a, r, i) => a + sw(r) + (i ? L.gap : 0), 0);
    { let x = L.pad; roots.forEach((r, i) => { if (i) x += L.gap; place(r, x + sw(r) / 2, L.pad + (r.kind === 'upgrade' ? L.capH : 0)); x += sw(r); }); }
    const X = new Map(ns.map(n => [n.id, CX.get(n.id)! - W(n) / 2] as const));
    const lockedF = FM && !treeOpen(cfg, st, tree.id);
    const Wc = Math.max(L.pad * 2 + L.pillW, rw + L.pad * 2, lockedF ? 300 : 0), Hc = Math.max(L.N + L.pad * 2, lockedF ? 190 : 0, ...ns.map(n => Y.get(n.id)! + H(n) + L.pad));
    this.panel.style.setProperty('--cw', Math.max(Wc, L.small ? 0 : 780) + 'px');
    const C = this.canvas; C.style.width = Wc + 'px'; C.style.height = Hc + 'px';
    let html = '';
    // locked tree: overlay with what opens it
    if (FM && !treeOpen(cfg, st, tree.id)) { // 27.11.2026 the tree opens with its fertilizer: the card shows what it takes
      const ti = (R.trees ?? []).findIndex(x => x.id === tree.id);
      html += `<div class="rtLock rtSeed" style="left:4px;top:2px;right:4px;bottom:2px">${this.fertCard(cfg, st, ti)}</div>`;
    } else if (seedMode(cfg) && !treeOpen(cfg, st, tree.id)) { // 26.11.2026 Samen-Suche: the chosen tree is searched for at the chest
      const ti = (R.trees ?? []).findIndex(x => x.id === tree.id), on = ti === (st as any).seedIdx, sp = on ? (st as any).seedP as number : 0;
      const left = (st as any).seedCost * (1 - sp);
      html += `<div class="rtLock rtSeed" style="left:4px;top:2px;right:4px;bottom:2px"><button class="rtSeedBtn${on ? ' on' : ''}" data-tree="${ti}" style="--p:${sp.toFixed(3)}" aria-label="${esc(NR.seed ?? 'Samen')}">
        <span class="rtSeedIc">${mini('seed')}</span><span class="rtSeedTx"><b>${esc(NR.seed ?? 'Samen')}</b><span class="rtCost"><i>${mini('chest')}</i><i>${mini('cd')}</i><span>${tfmt(left)}</span></span></span><i class="rtBar"></i></button></div>`;
    } else if (!seedMode(cfg) && !segmentOpen(cfg, st, tree.segment)) {
      const S = (R.segments ?? []).find(q => q.id === tree.segment), from = S?.from ?? [];
      const got = (fields: boolean) => all.filter(n => (fields ? isPlaceNode(n) : n.kind === 'weapon') && !n.start && from.includes(n.segment) && st.done.includes(n.id)).length;
      const req = [S?.needFields ? `<span><i class="rtHex"></i>${Math.min(got(true), S.needFields)}/${S.needFields}</span>` : '', S?.needWeapons ? `<span><i>${skillIcon('pea')}</i>${Math.min(got(false), S.needWeapons)}/${S.needWeapons}</span>` : ''].join('');
      html += `<div class="rtLock" style="left:4px;top:2px;right:4px;bottom:2px"><div class="rtLockChip"><i>${mini('lock')}</i>${req}</div></div>`;
    }
    // links needs -> node: down from the parent, across on a shared bar, down into the child (rounded corners)
    let svg = '';
    for (const n of ns) {
      const s0 = sts.get(n.id)!, cls = s0 === 'done' ? 'done' : s0 === 'lock' ? 'lock' : 'open', x2 = CX.get(n.id)!, y2 = Y.get(n.id)!;
      for (const id of n.needs ?? []) {
        const f = byId.get(id); if (!f) continue;
        const x1 = CX.get(f.id)!, y1 = Y.get(f.id)! + H(f) - (f.kind === 'upgrade' ? 0 : 2), yt = y2 - (n.kind === 'upgrade' && f.kind !== 'upgrade' ? L.capH : 0);
        if (Math.abs(x2 - x1) < 1) { svg += `<path class="${cls}" d="M${x1} ${y1} V${yt}"/>`; continue; }
        const yb = y1 + Math.min(L.vgap / 2, (yt - y1) / 2), dir = Math.sign(x2 - x1), r = Math.min(L.rad, Math.abs(x2 - x1) / 2, (yb - y1), (yt - yb));
        svg += `<path class="${cls}" d="M${x1} ${y1} V${yb - r} Q${x1} ${yb} ${x1 + dir * r} ${yb} H${x2 - dir * r} Q${x2} ${yb} ${x2} ${yb + r} V${yt}"/>`;
      }
    }
    html += `<svg class="rtLinks" width="${Wc}" height="${Hc}" viewBox="0 0 ${Wc} ${Hc}">${svg}</svg>`;
    // nodes
    for (const n of ns) {
      const i = all.indexOf(n), s0 = sts.get(n.id)!, x = X.get(n.id)!, y = Y.get(n.id)!, left = Math.max(0, 1 - Math.min(1, (st.work[n.id] ?? 0) / (st.cost * nodeMul(cfg, n, st))));
      const badge = s0 === 'done' ? `<b class="rtBadge ok">${mini('check')}</b>` : s0 === 'lock' ? `<b class="rtBadge lk">${mini('lock')}</b>` : '';
      const sub = s0 === 'done' ? '' : s0 === 'ready' ? `<span class="rtCost rdy">${mini('bulb')}</span>` : `<span class="rtCost"><i>${mini('cd')}</i><span>${tfmt(st.cost * nodeMul(cfg, n, st) * left)}</span></span>`;
      if (n.kind === 'upgrade') {
        const inf = upInfo(cfg, n.ref ?? '', n.lv), first = (n.lv ?? 1) === 1;
        html += `<button class="rtNode k-upgrade ${s0}" data-i="${i}" style="left:${x}px;top:${y - (first ? L.capH : 0)}px;width:${L.colW}px" title="${esc(upName(cfg, n.ref ?? ''))} ${n.lv}/${n.count}">
          ${first ? `<span class="rtCap">${esc(upName(cfg, n.ref ?? ''))}</span>` : ''}<span class="rtIc"><span class="rtIcIn">${inf.icon}</span>${badge || `<b class="rtLvN">${n.lv}</b>`}</span>
          <span class="rtUpTx">${s0 === 'done' ? `<em>${esc(inf.txt)}</em>` : sub}</span></button>`;
      } else {
        html += `<button class="rtNode ${s0} k-${n.kind}${isPlaceNode(n) ? ' k-field' : ''}" data-i="${i}" style="left:${x}px;top:${y}px;width:${L.pillW}px" ${s0 === 'lock' || s0 === 'done' ? 'aria-disabled="true"' : ''}>
          <span class="rtIc"><span class="rtIcIn">${nodeIcon(n, cfg)}</span>${badge}</span>
          <span class="rtTx"><b>${esc(nodeName(cfg, n))}</b>${sub}</span><i class="rtBar"></i></button>`;
      }
    }
    C.innerHTML = html;
    this.nodeEls = [...C.querySelectorAll<HTMLElement>('.rtNode'), ...(sp ? [this.speed] : [])];
  }
  /** 27.11.2026 one fertilizer: plant, level pips, yield per level, the mushrooms one level takes (have / need), time. on = in work at the Kompostierer */
  private fertCard(cfg: Balancing, st: RS, ti: number) {
    const T = cfg.research!.trees![ti], NR = cfg.names.research ?? {}, C = cfg.compost!, lv = fertLv(st, T.id), max = fertMax(cfg), open = treeOpen(cfg, st, T.id);
    const on = st.fertT === T.id && lv < max, can = fertAfford(cfg, st.stock, T.id), sp = on ? st.seedP : 0, cost = fertCost(cfg, st, T.id);
    const rec = fertRecipe(cfg, T.id).map(([m, n]) => { const have = st.stock[m] ?? 0, id = MUSHROOMS[m]; return `<span class="rtFm${have >= n ? ' ok' : ''}" title="${esc(cfg.names.mushrooms?.[id] ?? id)}"><i>${mushIcon(id)}</i><b>${Math.min(have, 999)}/${n}</b><small>${esc(cfg.names.mushrooms?.[id] ?? '')}</small></span>`; }).join('');
    const pips = Array.from({ length: max }, (_, k) => `<u class="${k < lv ? 'f' : ''}"></u>`).join('');
    const name = (cfg.names.items as Record<string, string>)?.[T.icon] ?? (cfg.names.plants as Record<string, string>)?.[T.icon] ?? T.id;
    return `<button class="rtFert${on ? ' on' : ''}${can ? ' can' : ''}${lv >= max ? ' max' : ''}${open ? '' : ' lk'}" data-tree="${ti}" style="--p:${sp.toFixed(3)}" aria-label="${esc((NR.fert ?? 'Dünger') + ' ' + name)}">
      <span class="rtFertIc">${fruitIcon(T.icon)}<i class="rtFertBag">${mini('fert')}</i>${open ? '' : `<b class="rtBadge lk">${mini('lock')}</b>`}</span>
      <span class="rtFertTx"><b>${esc(name)}</b><span class="rtFertLv">${pips}<em>${fruitIcon(T.icon)}+${nf((C.yield ?? 0) * 100)} %</em></span>
      ${lv >= max ? '' : `<span class="rtFertRec">${rec}</span><span class="rtCost"><i>${mini('cd')}</i><span>${tfmt(cost * (1 - sp))}</span></span>`}</span><i class="rtBar"></i></button>`;
  }
  /** scroll so the current idea (or the first one that can be chosen) is in view, as far left / up as fits */
  private toFront(cfg: Balancing, st: RS) {
    const L = this.lay; if (!L) return;
    const els = [...this.canvas.querySelectorAll<HTMLElement>('.rtNode')];
    const el = els.find(e => e.classList.contains('cur') || e.classList.contains('ready')) ?? els.find(e => e.classList.contains('avail') && !e.classList.contains('k-upgrade')) ?? els.find(e => e.classList.contains('avail'));
    void cfg; void st;
    if (!el) { this.scroll.scrollLeft = Math.max(0, (this.scroll.scrollWidth - this.scroll.clientWidth) / 2); this.scroll.scrollTop = 0; return; }
    const x = el.offsetLeft, y = el.offsetTop, sc = this.scroll;
    sc.scrollLeft = Math.max(0, x + el.offsetWidth / 2 - sc.clientWidth / 2); // centred across, the node and the one above it in view
    sc.scrollTop = Math.max(0, Math.min(y - L.N - L.vgap, y + el.offsetHeight + 10 - sc.clientHeight));
  }

  private buildPopup(cfg: Balancing, n: ResearchNode, st: RS) {
    const NR = cfg.names.research ?? {}, W = cfg.werkstatt?.names ?? {}, H = cfg.names.hints ?? {};
    const chip = (icon: string, val: string, label = '') => `<span class="rpSt"><i>${icon}</i><span>${label ? `<small>${esc(label)}</small>` : ''}<b>${val}</b></span></span>`;
    let kind = '', stats: string[] = [], fx = '', title = nodeName(cfg, n), icon = nodeIcon(n, cfg), kcls = n.kind;
    if (n.kind === 'speed') {
      const k = 1 + cfg.research!.speedPerLevel, a = Math.pow(k, st.speedLv), b = a * k;
      kind = NR.speed ?? '';
      stats = [chip(mini('tempo'), `+${nf(cfg.research!.speedPerLevel * 100)} %`), chip(mini('cd'), `${nf(a * 100)} % → <em>${nf(b * 100)} %</em>`), chip(`<b class="rpLv">${st.speedLv + 1}</b>`, `${NR.level ?? ''} ${st.speedLv} → <em>${st.speedLv + 1}</em>`)];
    } else if (n.kind === 'building') { // 26.11.2026 Mühle / Bäckerei: what goes in, what comes out, how long
      const B = (cfg.buildings as any)[n.ref ?? ''] ?? {};
      kind = NR.building ?? ''; kcls = 'field';
      const ins = B.needs ? Object.entries(B.needs as Record<string, number>).map(([t, v]) => chip(fruitIcon(t), `${nf(v)} ×`, (cfg.names.items as any)?.[t] ?? (cfg.names.plants as any)?.[t] ?? '')) : [];
      stats = [...ins, chip(fruitIcon(B.makes), `→ ${nf(B.amount ?? 1)}`, (cfg.names.items as any)?.[B.makes] ?? ''), chip(mini('cd'), `${nf(B.time ?? B.interval ?? 1, 1)} s`, W.harvest)];
    } else if (n.kind === 'field') {
      const t = n.ref as FruitType, P = (cfg.plants as any)[t] ?? { interval: 1 }, C = cfg.fields.cycle, np = C?.plants ?? 6;
      kind = NR.field ?? '';
      stats = [chip(mini('cd'), `${nf(P.grow ?? C?.grow ?? P.interval, 1)} s`, W.grow), chip(mini('rake'), `${nf(np * (P.strokes ?? 1) * cfg.rake.cooldown, 1)} s`, W.harvest), chip(fruitIcon(t), String(np * (P.amount ?? 1)), W.yield)];
    } else if (fieldUpOf(n)) { // 26.11.2026 Feld-Upgrade: grow + harvest time of the field x factor
      const t = fieldUpOf(n)! as FruitType, P = (cfg.plants as any)[t] ?? {}, C = cfg.fields.cycle, np = C?.plants ?? 6, F = cfg.fields.upgrade?.factor ?? .8, lv = n.lv ?? 1;
      const g = P.grow ?? C?.grow ?? 8, h = np * (P.strokes ?? 1) * cfg.rake.cooldown, a = Math.pow(F, lv - 1), b = Math.pow(F, lv);
      kind = (cfg.names.fields as any)[t] ?? NR.field ?? ''; icon = fieldArt(t); kcls = 'field';
      stats = [chip(mini('cd'), `${nf(g * a, 1)} s → <em>${nf(g * b, 1)} s</em>`, W.grow), chip(mini('rake'), `${nf(h * a, 1)} s → <em>${nf(h * b, 1)} s</em>`, W.harvest), chip(`<b class="rpLv">${lv}</b>`, `${lv} / ${n.count}`, NR.level)];
    } else if (n.kind === 'upgrade') { // 26.11.2026 one level of a weapon upgrade
      const [w] = upSplit(n.ref ?? ''), inf = upInfo(cfg, n.ref ?? '', n.lv);
      kind = (cfg.names.skills as Record<string, string>)[w] ?? NR.upgrade ?? ''; icon = skillIcon(w);
      stats = [chip(inf.icon, `<em>${esc(inf.txt)}</em>`, upName(cfg, n.ref ?? '')), chip(`<b class="rpLv">${n.lv}</b>`, `${n.lv} / ${n.count}`, NR.level)];
    } else {
      const id = n.ref as SkillId, S = (cfg.skills as any)[id] ?? {}, pool = ammoPool(id), ft = AMMO_OF[pool] ?? pool;
      kind = NR.weapon ?? '';
      const pel = id === 'wshot' || id === 'blue' || id === 'cran' ? S.pellets : 0;
      if (S.damage > 0) stats.push(chip(mini('dmg'), pel ? `${nf(S.damage, 1)} × ${pel}` : nf(S.damage, 1), W.dmg));
      if (S.cooldown > 0 && id !== 'sack') stats.push(chip(mini('cd'), `${nf(S.cooldown, 2)} s`, H.cd ?? W.cd));
      if ((id === 'wall' || id === 'sack') && S.hp) stats.push(chip(mini('heart'), nf(S.hp), NR.hp));
      if (S.ammoPerShot > 0) stats.push(chip(fruitIcon(ft), `${nf(S.ammoPerShot, 1)}`, W.ammo));
      if (S.range > 0 && id !== 'wall') stats.push(chip(mini('range'), `${nf(S.range, 1)} m`, W.rng));
      fx = (cfg.names.effects as Record<string, string> | undefined)?.[id] ?? '';
    }
    this.pop.innerHTML = `<div class="rpCard k-${kcls}"><div class="rpScroll">
      <div class="rpIc"><span class="rpIcIn">${icon}</span></div>
      <div class="rpKind">${esc(kind)}</div><h3>${esc(title)}</h3>
      ${fx ? `<div class="rpFx">${esc(fx)}</div>` : ''}<div class="rpStats">${stats.join('')}</div></div>
      <button class="btn rpGo">${esc(NR.finish ?? 'Fertigstellen')}</button></div>`;
    this.pop.querySelector('.rpGo')!.addEventListener('click', () => this.finish());
  }
}
