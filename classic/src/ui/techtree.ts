// Werkbank-Techtree UI (25.11.2026): the techtree panel (Priv ro 1), the pickup popup of a finished idea (ro 2, panel dimmed below),
// the research progress for the XP bar / XP orb and the HUD button that opens the panel away from the bench.
// Everything is rebuilt from the snapshot (rsFromSnap), so host, solo and guests show the same; actions go out through the callbacks
// (main.ts: sim call on the host / solo, net message on a guest). No explanation texts: names, icons and values only.
import { AMMO_OF, Balancing, FruitType, ResearchNode, SkillId, ammoPool } from '../config';
import type { Snap } from '../sim/snap';
import { nodeAvailable, nodeDone, rNodes, rsFromSnap, segmentOpen } from '../sim/research';
import { fieldArt, fruitIcon, mini, skillIcon } from './icons';

type RS = ReturnType<typeof rsFromSnap>;
type St = 'done' | 'cur' | 'ready' | 'avail' | 'lock';
const esc = (t: string) => t.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const nf = (n: number, d = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: d });
/** compact time: 25 s, 1:40 min-style for long ones */
const tfmt = (s: number) => s < 100 ? `${Math.ceil(s - 1e-6)} s` : s < 3600 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : `${nf(s / 3600, 1)} h`;

export function nodeName(cfg: Balancing, n: ResearchNode) {
  const N = cfg.names;
  if (n.kind === 'speed') return N.research?.speed ?? 'Forschungstempo';
  if (n.kind === 'field') return (N.fields as Record<string, string>)[n.ref ?? ''] ?? n.ref ?? n.id;
  return (N.skills as Record<string, string>)[n.ref ?? ''] ?? n.ref ?? n.id;
}
export function nodeIcon(n: ResearchNode) { return n.kind === 'speed' ? mini('tempo') : n.kind === 'field' ? fieldArt(n.ref ?? '') : skillIcon(n.ref ?? ''); }

/** XP bar / orb in research mode: progress of the idea being researched (0..1), complete, icon of the idea (bulb = nothing chosen) */
export function researchBar(cfg: Balancing, s: Snap): { frac: number; ready: boolean; key: string; icon: string; text: string } | null {
  if (!s.rs) return null;
  const ns = rNodes(cfg), ci = s.rs[0] ?? -1, n = ci >= 0 ? ns[ci] : null, ready = !!s.rs[1];
  const frac = n ? (ready ? 1 : Math.min(1, s.rp?.[ci] ?? 0)) : 0;
  return { frac, ready, key: n ? n.id : '-', icon: n ? nodeIcon(n) : mini('bulb'), text: n ? (ready ? '100 %' : `${Math.floor(frac * 100)} %`) : '' };
}

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class TechTree {
  onChoose: (node: number) => void = () => {};
  onFinish: () => void = () => {};
  onClose: () => void = () => {};
  onOpen: () => void = () => {};
  private root: HTMLElement; private panel: HTMLElement; private scroll: HTMLElement; private canvas: HTMLElement; private pop: HTMLElement;
  private btn: HTMLButtonElement;
  private key = ''; private popKey = ''; private ro = 0; private lay: ReturnType<TechTree['layout']> | null = null;
  private nodeEls: HTMLElement[] = []; private wantFront = false; private finishSent = false;
  private drag: { x: number; y: number; sl: number; st: number; moved: boolean; id: number; vx: number; vy: number; t: number; lx: number; ly: number } | null = null; private dragEnd = -1e9; private glide = 0;

  constructor() {
    const hud = $('#hud');
    this.root = document.createElement('div'); this.root.id = 'rsTree'; this.root.hidden = true;
    this.root.innerHTML = `<div class="rtPanel" role="dialog"><div class="rtHead"><i class="rtHi">${mini('bulb')}</i><b class="rtTitle"></b><span class="rtTempo"></span>
      <button class="rtClose" aria-label="Schließen"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button></div>
      <div class="rtScroll"><div class="rtCanvas"></div></div></div>`;
    hud.appendChild(this.root);
    this.panel = this.root.querySelector('.rtPanel')!; this.scroll = this.root.querySelector('.rtScroll')!; this.canvas = this.root.querySelector('.rtCanvas')!;
    this.pop = document.createElement('div'); this.pop.id = 'rsPop'; this.pop.hidden = true; hud.appendChild(this.pop);
    // HUD button (phone + mouse): opens the panel anywhere; next to the pause button
    this.btn = document.createElement('button'); this.btn.className = 'ibtn'; this.btn.id = 'rsBtn'; this.btn.hidden = true; this.btn.setAttribute('aria-label', 'Techtree');
    this.btn.innerHTML = mini('bulb');
    const pause = $('#pauseBtn'); pause.parentElement!.insertBefore(this.btn, pause);
    this.btn.addEventListener('click', () => this.onOpen());
    this.root.querySelector('.rtClose')!.addEventListener('click', () => { if (this.ro === 1) this.onClose(); });
    this.root.addEventListener('click', e => { if (e.target === this.root && this.ro === 1) this.onClose(); }); // click on the dark backdrop
    // node click (delegated): only available ones; a mouse drag is no click
    this.canvas.addEventListener('click', e => {
      if (performance.now() - this.dragEnd < 350) return; // end of a drag, no click
      const b = (e.target as HTMLElement).closest<HTMLElement>('.rtNode'); if (!b || this.ro !== 1) return;
      if (b.classList.contains('avail') || b.classList.contains('cur')) { b.classList.add('chosen'); this.onChoose(+b.dataset.i!); }
      else this.deny(b);
    });
    // mouse wheel scrolls sideways
    this.scroll.addEventListener('wheel', e => {
      e.stopPropagation(); // not the game zoom behind
      const sc = this.scroll; if (sc.scrollWidth <= sc.clientWidth) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
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
    // PC: Enter = "Fertigstellen" in the popup
    addEventListener('keydown', e => { if (this.ro === 2 && !this.pop.hidden && (e.key === 'Enter' || e.key === 'NumpadEnter') && !e.repeat) { e.preventDefault(); this.finish(); } });
  }
  get open() { return this.ro > 0; }
  reset() { this.key = ''; this.popKey = ''; this.ro = 0; this.root.hidden = true; this.pop.hidden = true; this.btn.hidden = true; document.body.classList.remove('rsMode', 'rsOpen'); }

  private deny(b: HTMLElement) { b.classList.remove('deny'); void b.offsetWidth; b.classList.add('deny'); }
  private finish() { if (this.finishSent) return; this.finishSent = true; this.pop.querySelector('.rpGo')?.classList.add('done'); this.onFinish(); }

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
    if (ro === 0) { this.root.hidden = true; this.pop.hidden = true; this.finishSent = false; return; }
    if (was === 0) this.wantFront = true;
    this.root.hidden = false;
    this.root.classList.toggle('dim', ro === 2);
    // panel structure (rebuilt only when the tree state or the screen size changes)
    const L = this.layout(cfg);
    const key = `${L.key}|${(s.rd ?? []).join('')}|${st.cur}|${st.ready ? 1 : 0}|${st.speedLv}|${st.n}`;
    if (key !== this.key) { const sl = this.scroll.scrollLeft; this.key = key; this.build(cfg, st, L); this.scroll.scrollLeft = sl; }
    // progress of every node (another player may be hammering while this one looks)
    const ns = rNodes(cfg);
    this.nodeEls.forEach((el, i) => {
      const p = Math.min(1, s.rp?.[i] ?? 0), v = p.toFixed(3);
      if (el.dataset.p !== v) {
        el.dataset.p = v; el.style.setProperty('--p', v);
        const c = el.querySelector('.rtCost span'); if (c && !el.classList.contains('done')) c.textContent = tfmt(st.cost * (1 - p));
      }
    });
    if (this.wantFront && this.scroll.clientWidth) { this.wantFront = false; this.toFront(cfg, st); }
    // pickup popup
    if (ro === 2) {
      const ci = s.rs![0] ?? -1, n = ns[ci];
      const pk = `${ci}|${st.speedLv}|${innerWidth}x${innerHeight}`;
      if (n && pk !== this.popKey) { this.popKey = pk; this.finishSent = false; this.buildPopup(cfg, n, st); }
      this.pop.hidden = !n;
    } else { this.pop.hidden = true; this.popKey = ''; this.finishSent = false; }
  }

  /** sizes from the screen: rows fill the height (40..60 px nodes), columns scroll sideways */
  private layout(cfg: Balancing) {
    const ns = rNodes(cfg), rows = Math.max(...ns.map(n => n.row)) + 1, cols = Math.max(...ns.map(n => n.col)) + 1;
    const vw = innerWidth, vh = innerHeight, small = vh < 520 || vw < 720;
    const head = small ? 46 : 56, maxH = small ? vh : Math.min(vh * .86, 760);
    const availH = maxH - head - (small ? 10 : 28);
    const cellH = Math.max(50, Math.min(small ? 92 : 100, availH / rows));
    const N = Math.round(Math.max(40, Math.min(small ? 52 : 60, cellH - 12)));
    const labW = small ? 108 : 128, pillW = N + labW, gap = small ? 30 : 48, pad = small ? 14 : 26;
    const W = pad * 2 + cols * pillW + (cols - 1) * gap, H = rows * cellH + 8;
    return { key: `${vw}x${vh}`, rows, cols, cellH, N, pillW, gap, pad, W, H, small, head };
  }
  private x(L: NonNullable<TechTree['lay']>, col: number) { return L.pad + col * (L.pillW + L.gap); }
  private y(L: NonNullable<TechTree['lay']>, row: number) { return 4 + row * L.cellH + (L.cellH - L.N) / 2; }

  private state(cfg: Balancing, st: RS, n: ResearchNode): St {
    if (nodeDone(cfg, st, n.id)) return 'done';
    if (st.cur === n.id) return st.ready ? 'ready' : 'cur';
    return nodeAvailable(cfg, st, n.id) ? 'avail' : 'lock';
  }

  private build(cfg: Balancing, st: RS, L: ReturnType<TechTree['layout']>) {
    this.lay = L;
    const ns = rNodes(cfg), N = cfg.names.research ?? {};
    this.root.querySelector('.rtTitle')!.textContent = N.title ?? '';
    const R = cfg.research!, tempo = Math.pow(1 + R.speedPerLevel, st.speedLv);
    this.root.querySelector('.rtTempo')!.innerHTML = `<i>${mini('tempo')}</i>${nf(tempo * 100)} %`;
    this.panel.style.setProperty('--n', L.N + 'px'); this.panel.style.setProperty('--cw', L.W + 'px'); this.panel.style.setProperty('--head', L.head + 'px');
    this.panel.classList.toggle('small', L.small);
    const C = this.canvas; C.style.width = L.W + 'px'; C.style.height = L.H + 'px';
    const sts = ns.map(n => this.state(cfg, st, n));
    let html = '';
    // top row: research itself
    html += `<div class="rtBand" style="top:4px;height:${L.cellH}px"></div>`;
    // segments: divider + locked overlay with what opens it
    const segs = [...new Set(ns.map(n => n.segment))].sort((a, b) => a - b);
    const segX: Record<number, number> = {};
    for (const sg of segs) { const c = Math.min(...ns.filter(n => n.segment === sg && n.row > 0).map(n => n.col)); segX[sg] = c <= 0 ? 0 : this.x(L, c) - L.gap / 2; }
    segs.forEach((sg, k) => {
      const x0 = segX[sg], x1 = k + 1 < segs.length ? segX[segs[k + 1]] : L.W, top = 4 + L.cellH;
      if (k > 0) html += `<div class="rtDiv" style="left:${x0}px;top:${top}px;height:${L.H - top}px"></div>`;
      if (!segmentOpen(cfg, st, sg)) {
        const S = (R.segments ?? []).find(q => q.id === sg), from = S?.from ?? [];
        const got = (kind: string) => ns.filter(n => n.kind === kind && !n.start && from.includes(n.segment) && st.done.includes(n.id)).length;
        const req = [S?.needFields ? `<span><i class="rtHex"></i>${Math.min(got('field'), S.needFields)}/${S.needFields}</span>` : '', S?.needWeapons ? `<span><i>${skillIcon('pea')}</i>${Math.min(got('weapon'), S.needWeapons)}/${S.needWeapons}</span>` : ''].join('');
        html += `<div class="rtLock" style="left:${x0 + 2}px;top:${top}px;width:${x1 - x0 - 4}px;height:${L.H - top}px"><div class="rtLockChip"><i>${mini('lock')}</i>${req}</div></div>`;
      }
    });
    // links needs -> node (S-curves between the columns); roots of a later segment start at its divider
    let svg = '';
    const cy = (n: ResearchNode) => this.y(L, n.row) + L.N / 2;
    ns.forEach((n, i) => {
      const cls = sts[i] === 'done' ? 'done' : sts[i] === 'lock' ? 'lock' : 'open';
      const x2 = this.x(L, n.col), y2 = cy(n);
      const from = (n.needs ?? []).map(id => ns.find(q => q.id === id)).filter(Boolean) as ResearchNode[];
      for (const f of from) {
        const x1 = this.x(L, f.col) + L.pillW, y1 = cy(f), dx = Math.max(12, (x2 - x1) * .55);
        svg += `<path class="${cls}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`;
      }
      if (!from.length && n.row > 0 && segX[n.segment] > 0) { const x1 = segX[n.segment]; svg += `<path class="${cls}" d="M${x1} ${y2} H${x2}"/><circle class="${cls}" cx="${x1}" cy="${y2}" r="3.5"/>`; }
    });
    html += `<svg class="rtLinks" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}">${svg}</svg>`;
    // nodes
    ns.forEach((n, i) => {
      const s = sts[i], name = nodeName(cfg, n);
      const badge = s === 'done' ? `<b class="rtBadge ok">${mini('check')}</b>` : s === 'lock' ? `<b class="rtBadge lk">${mini('lock')}</b>` : n.kind === 'speed' && st.speedLv > 0 ? `<b class="rtBadge lv">${st.speedLv}</b>` : '';
      const sub = s === 'done' ? '' : s === 'ready' ? `<span class="rtCost rdy">${mini('bulb')}</span>` : `<span class="rtCost"><i>${mini('cd')}</i><span>${tfmt(st.cost * (1 - Math.min(1, (st.work[n.id] ?? 0) / st.cost)))}</span></span>`;
      html += `<button class="rtNode ${s} k-${n.kind}" data-i="${i}" style="left:${this.x(L, n.col)}px;top:${this.y(L, n.row)}px;width:${L.pillW}px" ${s === 'lock' || s === 'done' ? 'aria-disabled="true"' : ''}>
        <span class="rtIc"><span class="rtIcIn">${nodeIcon(n)}</span>${badge}</span>
        <span class="rtTx"><b>${esc(name)}</b>${n.kind === 'speed' ? `<small>+${nf(R.speedPerLevel * 100)} %</small>` : ''}${sub}</span><i class="rtBar"></i></button>`;
    });
    C.innerHTML = html;
    this.nodeEls = [...C.querySelectorAll<HTMLElement>('.rtNode')];
  }
  /** scroll so the current idea (or the first one that can be chosen) and the column after it are in view */
  private toFront(cfg: Balancing, st: RS) {
    const L = this.lay; if (!L) return;
    const all = rNodes(cfg), ns = all.filter(n => n.kind !== 'speed');
    const cur = all.find(n => n.id === st.cur), av = ns.filter(n => nodeAvailable(cfg, st, n.id));
    const col = cur ? cur.col : av.length ? Math.min(...av.map(n => n.col)) : all.find(n => n.kind === 'speed')?.col ?? 0;
    this.scroll.scrollLeft = Math.max(0, Math.min(this.x(L, col) - L.pad, this.x(L, col + 1) + L.pillW + L.pad - this.scroll.clientWidth)); // the front and the column behind it, as much on the left as fits
  }

  private buildPopup(cfg: Balancing, n: ResearchNode, st: RS) {
    const NR = cfg.names.research ?? {}, W = cfg.werkstatt?.names ?? {}, H = cfg.names.hints ?? {};
    const chip = (icon: string, val: string, label = '') => `<span class="rpSt"><i>${icon}</i><span>${label ? `<small>${esc(label)}</small>` : ''}<b>${val}</b></span></span>`;
    let kind = '', stats: string[] = [], fx = '';
    if (n.kind === 'speed') {
      const k = 1 + cfg.research!.speedPerLevel, a = Math.pow(k, st.speedLv), b = a * k;
      kind = NR.speed ?? '';
      stats = [chip(mini('tempo'), `+${nf(cfg.research!.speedPerLevel * 100)} %`), chip(mini('cd'), `${nf(a * 100)} % → <em>${nf(b * 100)} %</em>`), chip(`<b class="rpLv">${st.speedLv + 1}</b>`, `${NR.level ?? ''} ${st.speedLv} → <em>${st.speedLv + 1}</em>`)];
    } else if (n.kind === 'field') {
      const t = n.ref as FruitType, P = (cfg.plants as any)[t] ?? { interval: 1 }, C = cfg.fields.cycle, np = C?.plants ?? 6;
      kind = NR.field ?? '';
      stats = [chip(mini('cd'), `${nf(P.grow ?? C?.grow ?? P.interval, 1)} s`, W.grow), chip(mini('rake'), `${nf(np * (P.strokes ?? 1) * cfg.rake.cooldown, 1)} s`, W.harvest), chip(fruitIcon(t), String(np * (P.amount ?? 1)), W.yield)];
    } else {
      const id = n.ref as SkillId, S = (cfg.skills as any)[id] ?? {}, pool = ammoPool(id), ft = AMMO_OF[pool] ?? pool;
      kind = NR.weapon ?? '';
      const pel = id === 'wshot' || id === 'blue' || id === 'cran' ? S.pellets : 0;
      if (S.damage > 0) stats.push(chip(mini('dmg'), pel ? `${nf(S.damage, 1)} × ${pel}` : nf(S.damage, 1), W.dmg));
      if (S.cooldown > 0) stats.push(chip(mini('cd'), `${nf(S.cooldown, 2)} s`, H.cd ?? W.cd));
      if (id === 'wall' && S.hp) stats.push(chip(mini('heart'), nf(S.hp), NR.hp));
      if (S.ammoPerShot > 0) stats.push(chip(fruitIcon(ft), `${nf(S.ammoPerShot, 1)}`, W.ammo));
      if (S.range > 0 && id !== 'wall') stats.push(chip(mini('range'), `${nf(S.range, 1)} m`, W.rng));
      fx = (cfg.names.effects as Record<string, string> | undefined)?.[id] ?? '';
    }
    this.pop.innerHTML = `<div class="rpCard k-${n.kind}"><div class="rpScroll">
      <div class="rpIc"><span class="rpIcIn">${nodeIcon(n)}</span></div>
      <div class="rpKind">${esc(kind)}</div><h3>${esc(nodeName(cfg, n))}</h3>
      ${fx ? `<div class="rpFx">${esc(fx)}</div>` : ''}<div class="rpStats">${stats.join('')}</div></div>
      <button class="btn rpGo">${esc(NR.finish ?? 'Fertigstellen')}</button></div>`;
    this.pop.querySelector('.rpGo')!.addEventListener('click', () => this.finish());
  }
}
