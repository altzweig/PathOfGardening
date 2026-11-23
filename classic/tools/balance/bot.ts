// Headless balancing bot for Classic: plays a full run of the real Sim (no rendering) and reports how it went.
// Usage via tools/balance/run.mjs. The bot only takes level-ups that give a real advantage right now (see score()).
import { Sim } from '../../src/sim/sim';
import { isBuilding, Balancing, SkillId } from '../../src/config';
import { emptyIntent } from '../../src/sim/snap';

export interface BotOpts { start?: string; old?: boolean; infAmmo?: boolean; weapons: 1 | 2; second?: SkillId; seconds?: SkillId[]; focus?: 'weapons' | 'main' | 'fields'; seedLog?: boolean; dt?: number; maxTime?: number }
export interface RunResult {
  won: boolean; wave: number; level: number; time: number; deaths: number; kills: number;
  lvAtWave: Record<number, number>; deathsAtWave: Record<number, number>; fieldHpAtWave: Record<number, number>;
  picks: Record<string, number>; wasted: number; /** XP per wave: harvest (incl. buildings), animals, juice */ xpHist: { w: number; h: number; e: number; j: number; lv: number }[]; second: string; noAmmoShare: number; peakAlive: number; bossEnd: boolean; bossAt: number[];
}

const GUN_FRUITS: SkillId[] = ['asp', 'cran', 'cab', 'lemon', 'chili'];

export function runBot(cfg: Balancing, o: BotOpts): RunResult {
  const sim = new Sim(cfg); const p = sim.players.length ? sim.players[0] : sim.addPlayer(1, 0xffffff);
  const second = o.second ?? GUN_FRUITS[Math.floor(Math.random() * GUN_FRUITS.length)];
  const extra: SkillId[] = o.seconds ?? (o.weapons === 2 ? [second] : []);
  const want = new Set<string>(o.old ? [second] : ['blue', ...extra]); const focus = o.focus ?? 'weapons';
  // 23.11.2026 start field choice: one berry at random (or opts.start); its fruit is shotgun ammo, so the bot wants it
  const SC = cfg.arena.startChoice ?? [], startB = o.start ?? SC[Math.floor(Math.random() * SC.length)];
  if (startB) want.add(startB);
  const res: RunResult = { won: false, wave: 0, level: 1, time: 0, deaths: 0, kills: 0, lvAtWave: {}, deathsAtWave: {}, fieldHpAtWave: {}, picks: {}, wasted: 0, xpHist: [], second: extra.length ? extra.join('+') : '-', noAmmoShare: 0, peakAlive: 0, bossEnd: false, bossAt: [] };
  const dt = o.dt ?? .05, maxT = o.maxTime ?? 3 * 3600; let lastWave = 0, noAmmo = 0, fightT = 0, mineX = 1e9, mineZ = 1e9;
  const slots = (sim as any).slots as { x: number; z: number; q: number; r: number; forest?: boolean }[];
  const hex = (a: { q: number; r: number }, b: { q: number; r: number }) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const learned = () => (Object.keys(p.skills) as SkillId[]).filter(k => p.skills[k].learned);
  const ownTypes = () => new Set(sim.fields.filter(f => f.alive).map(f => f.type as string));

  /** how much a card helps right now (0 = no real advantage, the bot only takes it if nothing else is offered) */
  function score(key: string): number {
    const [a, b] = key.split('_');
    if (a === 'start') return b === startB ? 100 : 1;
    if (a === 'tile') { // 23.11.2026 hex fields: berry field first (ammo), then the press (XP), processors as they open up
      if (b === 'press') return 62; if (b === startB) return 60; if (b === 'well') return 45; if (b === 'mill') return 40; if (b === 'bakery') return 35; if (b === 'wheat') return 30; return 20;
    }
    if (a === 'gold') return 80; if (a === 'x2') return 70;
    if (a === 'learn') return want.has(b) ? 100 : 0;
    if (a === 'combo') return 0;
    if (a === 'new' || a === 'field') {
      if (want.has(b)) return b === 'blue' ? 55 : (learned().includes(b as SkillId) ? 52 : 90); // ammo field for an owned / wanted weapon
      if (o.old) return b === 'blue' ? 30 : 20;
      if (isBuilding(b as any)) { // building: only worth it if it has something to work with
        const B = cfg.buildings[b as keyof typeof cfg.buildings]; const own = ownTypes();
        if (!B.needs && !B.needsAny) return 12;
        const ins = [...Object.keys(B.needs ?? {}), ...(B.needsAny ?? [])];
        return ins.some(t => own.has(t)) ? 15 : 0; // no input next to it yet: no real advantage
      }
      return sim.fields.filter(f => f.alive).length < 4 ? 50 : 20; // any other crop: more XP and one more tile the animals have to eat before the garden is lost
    }
    if (focus === 'fields' && (a === 'up' || a === 'yield')) return want.has(b) ? 70 : 45;
    if (a === 'up') return want.has(b) ? (b === 'blue' ? 30 : 35) : 10;
    if (a === 'yield') return want.has(b) ? 25 : 8;
    if (a === 'care') return 10;
    if (a === 'rake') return b === 'dmg' || b === 'cd' ? 5 : 3;
    if (a === 'tea') return 1;
    if (learned().includes(a as SkillId)) { // weapon upgrade
      if (focus === 'main' && extra.length && a === 'blue' && learned().includes(extra[0])) return 20; // all-in on the main weapon once it is there
      if (focus === 'fields') return b === 'dmg' || b === 'cd' ? 40 : 30;
      if (b === 'dmg') return 60; if (b === 'cd') return 58; if (b === 'pel') return 56; if (b === 'rng') return 30; return 40;
    }
    return 0;
  }
  function pickSlot(): number {
    const t = p.placing!; const best = { i: -1, s: -1e9 };
    for (let i = 0; i < slots.length; i++) {
      if ((sim as any).canPlace ? !sim.canPlace(p, i) : (!!sim.fieldAt(i) || slots[i].forest)) continue;
      const sl = slots[i]; let s = -Math.hypot(sl.x, sl.z) * .2;
      const f = sim.fieldAt(i);
      if ((p as any).placeMode === 'stack') s += (f!.rarity * 10 + f!.prog) + 5;
      else {
        if (f) s += f.alive && f.type === t ? 20 + f.rarity * 5 : -50; // 23.11.2026: level up a field of the same type first (max level 3), never overbuild
        for (const g of sim.fields) if (g.alive && hex(slots[g.slot], sl) === 1) {
          if (g.type === t) s += 3;
          if (isBuilding(t as any)) { const B = cfg.buildings[t as keyof typeof cfg.buildings]; if ((B.needs && g.type in B.needs) || B.needsAny?.includes(g.type as any)) s += 5; }
        }
      }
      if (s > best.s) { best.s = s; best.i = i; }
    }
    return best.i;
  }

  let seq = 0;
  while (sim.phase !== 'over' && sim.time < maxT) {
    if (sim.phase === 'lvl') {
      if (p.placing) { const i = pickSlot(); if (i >= 0) sim.place(p.id, i); else { p.placing = null; p.picked = true; (sim as any).checkAllPicked(); } }
      else if (!p.picked && p.offers) {
        const sc = p.offers.map(x => ({ k: x.key, s: score(x.key) })).sort((a, b) => b.s - a.s);
        if (sc[0].s <= 2) res.wasted++;
        res.picks[sc[0].k] = (res.picks[sc[0].k] || 0) + 1; sim.pick(p.id, sc[0].k);
      }
      continue;
    }
    // ---- Werkstatt (23.11.2026): buy the best ideas, then leave ----
    if (p.shopOpen && p.shop) {
      for (;;) { const c = p.shop.map((x, i) => ({ i, x, s: x.sold || (x.cost ?? 1) > p.ideas ? -1 : x.gold ? 80 : score(x.key) })).filter(c => c.s >= 0).sort((a, b) => b.s - a.s)[0]; if (!c) break; sim.buy(p.id, c.i); res.picks['shop:' + c.x.key] = (res.picks['shop:' + c.x.key] || 0) + 1; }
      sim.closeShop(p.id);
    }
    // ---- decide movement / fire ----
    if (o.infAmmo) for (const k of Object.keys(p.ammo) as SkillId[]) p.ammo[k] = 999;
    const it = { ...emptyIntent(), tapSeq: p.lastTap, cycle: p.lastCycle } as any;
    if (p.alive) {
      const ens = sim.enemies.filter(e => !e.dead && !e.leave);
      const go = (x: number, z: number, stop = .3) => { const dx = x - p.x, dz = z - p.z, l = Math.hypot(dx, dz); if (l > stop) { it.mx = dx / l; it.mz = dz / l; } };
      const near = (x: number, z: number, r: number) => { let b = null as any, bd = r; for (const e of ens) { const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; b = e; } } return b; };
      const weapons = learned().filter(w => sim.isReady(p, w));
      const sec = weapons.includes('cab') ? 'cab' : weapons.find(w => w !== 'blue'), gun = weapons.find(w => w !== 'blue' && w !== 'cab') ?? (weapons.includes('blue') ? 'blue' : undefined);
      // the enemy that matters most: close to the player, or eating the garden
      let tgt = null as any, td = 1e9;
      for (const e of ens) { const d = Math.hypot(e.x - p.x, e.z - p.z), dc = Math.hypot(e.x, e.z); if (dc > 14 && d > 6) continue; const pr = d + dc * .3 - (e.target?.kind === 'field' ? 5 : 0) - (e.type === 'toad' ? 2 : 0); if (pr < td) { td = pr; tgt = e; } }
      const fr = sim.fruits.filter(f => f.state === 'ground' || f.state === 'fly');
      let fb = null as any, fd = 1e9; for (const f of fr) { const d = Math.hypot(f.x - p.x, f.z - p.z) - (want.has(f.type) ? 2 : 0); if (d < fd) { fd = d; fb = f; } }
      const close = near(p.x, p.z, 2.2);
      const press = sim.fields.find(f => f.alive && f.type === 'press' && !f.broken);
      // no passive harvest (23.11.2026): with little ammo left, go and rake a ripe weapon field
      const ripe = (f: any) => f.alive && !isBuilding(f.type) && (f as any).cyc === 0;
      const low = gun && (p.ammo as any)[gun === 'blue' ? p.berry : gun] < 12;
      let rf = null as any; if (low) { let rd = 1e9; for (const f of sim.fields) if (ripe(f) && want.has(f.type)) { const d = Math.hypot(f.x - p.x, f.z - p.z); if (d < rd) { rd = d; rf = f; } } }
      if (rf && !close) { const d = Math.hypot(rf.x - p.x, rf.z - p.z); if (d > .4) go(rf.x, rf.z, .2); it.fire = 'rake'; }
      else if (gun && tgt) { // shoot
        fightT += dt; const d = Math.hypot(tgt.x - p.x, tgt.z - p.z), R = sim.stats(gun as SkillId, p.skills[gun as SkillId]).range;
        if (d > R * .75) go(tgt.x, tgt.z); else if (d < R * .3) { it.mx = (p.x - tgt.x) / d; it.mz = (p.z - tgt.z) / d; }
        it.fire = gun; it.aim = true; it.ax = tgt.x - p.x; it.az = tgt.z - p.z;
        if (sec === 'cab' && Math.hypot(p.x - mineX, p.z - mineZ) > 2.5 && d < 6 && sim.isReady(p, 'cab')) { it.fire = 'cab'; mineX = p.x; mineZ = p.z; }
      } else if (close) { // no gun: rake whatever is in reach (mines first)
        fightT += dt; noAmmo += dt;
        go(close.x, close.z, .9); it.fire = sec === 'cab' && Math.hypot(p.x - mineX, p.z - mineZ) > 2 ? 'cab' : 'rake'; if (it.fire === 'cab') { mineX = p.x; mineZ = p.z; }
      } else if (fb && fd < 6) go(fb.x, fb.z, .05);
      else if (sim.wavePause && p.ideas > 0 && !p.shopLock && p.shop && !p.shopOpen) go(0, 0, .3); // to the chest: Werkstatt
      else if (!tgt && press && (p.ammo as any)[p.berry] > 25) { const d = Math.hypot(press.x - p.x, press.z - p.z); if (d > .4) go(press.x, press.z, .2); it.fire = 'rake'; } // press spare berries into XP
      else { // tend the garden: broken building / wilting tile first, else the weapon fields (raking makes ammo)
        let ff = null as any, fs = 1e9;
        for (const f of sim.fields) { if (!f.alive) continue; const s = (f.broken ? -5 : 0) + f.hp / f.maxHp * 2 + (ripe(f) ? -2 : 0) + (want.has(f.type) ? (gun ? -1 : -3) : 0) + Math.hypot(f.x - p.x, f.z - p.z) * .05; if (s < fs) { fs = s; ff = f; } }
        if (tgt) { fightT += dt; noAmmo += dt; }
        if (ff) { const d = Math.hypot(ff.x - p.x, ff.z - p.z); if (d > .4) go(ff.x, ff.z, .2); it.fire = 'rake'; }
      }
    }
    it.tapSeq = p.lastTap; it.cycle = p.lastCycle; sim.setIntent(p.id, it); seq++;
    const al = p.alive; sim.update(dt); sim.events.length = 0;
    if (al && !p.alive) { res.deaths++; res.deathsAtWave[sim.wave] = (res.deathsAtWave[sim.wave] || 0) + 1; }
    if (sim.enemies.some(e => (e as any).boss && !e.dead) && !res.bossAt.includes(sim.wave) && !res.bossAt.some(w => w >= sim.wave - 1)) res.bossAt.push(sim.wave);
    res.peakAlive = Math.max(res.peakAlive, sim.enemies.length);
    if (sim.wave !== lastWave) { lastWave = sim.wave; res.lvAtWave[sim.wave] = sim.level; const g = sim.fields.filter(f => !f.starter || true); res.fieldHpAtWave[sim.wave] = Math.round(100 * g.reduce((a, f) => a + f.hp, 0) / Math.max(1, g.reduce((a, f) => a + f.maxHp, 0))); }
  }
  res.bossEnd = sim.enemies.some(e => (e as any).boss && !e.dead);
  res.xpHist = sim.xpHist; res.won = sim.won; res.wave = sim.wave; res.level = sim.level; res.time = Math.round(sim.time); res.kills = sim.kills; res.noAmmoShare = fightT ? +(noAmmo / fightT).toFixed(2) : 0;
  return res;
}
