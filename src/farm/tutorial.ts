// Tutorial day (day 1), exactly as Basti wrote it: water the bush, meanwhile rake/sow/water the field, harvest the
// berries, then the raccoon cutscene ("Hunger!", steals from the basket at the Lager, runs past the player),
// "Vertreib den Eindringling!", a short pause that explains fighting, chase, end cutscene, night.
// The only place in the game with explaining text (texts in balancing.yaml -> tutorial.texts).
import type { FarmCfg } from './config';
import { addItem, count } from './state';
import type { Animal, DaySim, Intent } from './sim';
import type { FarmView } from './view/farmView';
import type { FarmHud } from './ui/hud';
import { sfx, play } from '../audio';

type Step = 'water' | 'field' | 'daily' | 'wait' | 'harvest' | 'cutIn' | 'peek' | 'sneak' | 'steal' | 'run' | 'fight' | 'chase' | 'after' | 'end' | 'done';
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

export class Tutorial {
  step: Step = 'water';
  private t = 0; private stolen = 0; private rac: Animal | null = null; private gap = 0; private fightPrompt = false;
  onDone: () => void = () => {};
  constructor(public cfg: FarmCfg, public sim: DaySim, public view: FarmView, public hud: FarmHud, public touch: () => boolean) {}
  private get T() { return this.cfg.tutorial.texts; }
  private go(s: Step) { this.step = s; this.t = 0; }

  /** per frame, before sim.update: may change the intent (locks input during cutscenes, first swing) */
  update(dt: number, it: Intent): Intent {
    const sim = this.sim, s = sim.s, H = this.cfg.hof, P = sim.player, V = this.view, T = this.T;
    this.t += dt;
    const plot = s.plots[0], b = s.bush, near = (x: number, z: number) => dist(P.x, P.z, x, z) < this.cfg.player.reach + 1.2;
    switch (this.step) {
      case 'water':
        V.setArrow({ x: H.bush.x, z: H.bush.z, y: 2.1 });
        this.hud.hint(near(H.bush.x, H.bush.z) || P.action ? T.waterHere : T.water, 'can');
        if (b.phase === 'growing') this.go('field');
        break;
      case 'field': {
        const p = H.plots[0]; V.setArrow({ x: p.x, z: p.z, y: 1.6 });
        const sub = plot.stage === 'empty' ? ['rake', T.rake] : plot.stage === 'raked' ? ['seed', T.sow] : ['can', T.waterField];
        this.hud.hint(this.t < 4 || !near(p.x, p.z) ? T.meanwhile : sub[1], sub[0]);
        if (plot.stage === 'sown' && plot.watered && !P.action) { this.go('daily'); V.setArrow(null); }
        break;
      }
      case 'daily':
        this.hud.hint(T.daily, 'wheat');
        sim.ripenMul = 2.5; // nothing left to do: the berries ripen a bit faster
        if (this.t > this.cfg.tutorial.fieldHint) this.go('wait');
        break;
      case 'wait':
        if (b.phase === 'growing' && b.t >= this.cfg.bush.ripen * this.cfg.bush.almostAt) { this.hud.hint(T.almost, 'blue'); V.setArrow({ x: H.bush.x, z: H.bush.z, y: 2.1 }); }
        else this.hud.hint(null);
        if (b.phase === 'ripe') this.go('harvest');
        break;
      case 'harvest':
        V.setArrow(P.action ? null : { x: H.bush.x, z: H.bush.z, y: 2.1 }); this.hud.hint(T.harvest, 'rake');
        if (b.phase === 'empty' && !P.action) this.startCutscene();
        break;
      // ---------------- cutscene: the raccoon ----------------
      case 'cutIn':
        it = this.lock(it);
        if (this.t > 1.2) { sfx('raccoon.wave', this.rac!.x, this.rac!.z); this.go('peek'); }
        break;
      case 'peek': {
        it = this.lock(it); const r = this.rac!;
        V.shot = { x: r.x, z: r.z + 1.5, zoom: .62 };
        if (!r.path!.length && this.t > .8) V.setBubble(r.id, T.hunger);
        if (this.t > 3.2) { V.setBubble(null); r.path = this.sneakPath(); this.go('sneak'); }
        break;
      }
      case 'sneak': {
        it = this.lock(it); const r = this.rac!;
        V.shot = { x: r.x, z: r.z + 1, zoom: .7 };
        if (!r.path!.length) { this.go('steal'); }
        break;
      }
      case 'steal': {
        it = this.lock(it); const r = this.rac!; V.shot = { x: r.x, z: r.z + 1, zoom: .65 };
        if (this.t > .45 && this.stolen < this.cfg.tutorial.raccoonSteal && count(s, 'blue') > 0) {
          this.t = 0; this.stolen++; addItem(this.cfg, s, 'blue', -1); r.carry.blue = (r.carry.blue ?? 0) + 1; r.carryN++;
          sfx('raccoon.steal', r.x, r.z);
        } else if (this.t > .8) { r.path = this.runPath(); sfx('raccoon.laugh', r.x, r.z); this.go('run'); }
        break;
      }
      case 'run': {
        it = this.lock(it); const r = this.rac!; V.shot = { x: (r.x + P.x) / 2, z: (r.z + P.z) / 2 + 1, zoom: .8 };
        if (r.path!.length <= 2 && dist(r.x, r.z, P.x, P.z) > 2.2 || this.t > 6) {
          // cutscene end: the raccoon starts 3 m beside the player, running for the forest
          const g = this.sim.hof.gapOut(this.gap), dx = g.x - P.x, dz = g.z - P.z, l = Math.hypot(dx, dz) || 1, k = this.cfg.tutorial.raccoonStart;
          const c = sim.hof.collide(P.x + dx / l * k, P.z + dz / l * k, .35, false);
          r.x = c.x; r.z = c.z; r.path = undefined; r.state = 'flee'; r.gap = this.gap; r.speedMul = this.cfg.tutorial.raccoonSpeed / this.cfg.animals.raccoon.fleeSpeed;
          V.shot = null; this.hud.letterbox(false);
          this.hud.hint(T.intruder, 'raccoon');
          sim.paused = true; this.fightPrompt = true; this.hud.fightCard(true, T.fight, this.touch()); play('pauseIn');
          this.go('fight');
        }
        break;
      }
      case 'fight':
        // paused until the player attacks once (right mouse button / attack button)
        if (it.attack) { sim.paused = false; this.hud.fightCard(false); this.fightPrompt = false; play('pauseOut'); this.go('chase'); }
        break;
      case 'chase': {
        const r = this.rac!, gone = !sim.animals.includes(r);
        if (this.t > 2.5) this.hud.hint(null);
        if (gone && !sim.loot.length || (gone && this.t > 3) || this.t > 25) this.go('after');
        break;
      }
      case 'after':
        if (this.t > .8) { this.go('end'); this.hud.letterbox(true); this.hud.hint(T.enough, 'sun'); }
        break;
      case 'end': {
        it = this.lock(it);
        // the player walks home to the house door, then night falls
        const d = H.door, dx = d.x - P.x, dz = d.z + .3 - P.z, l = Math.hypot(dx, dz);
        if (l > .4 && this.t > 1.5) { it.mx = dx / l; it.mz = dz / l; }
        V.shot = { x: (P.x + d.x) / 2, z: (P.z + d.z) / 2 + 1, zoom: .9 };
        if (this.t > 2.5) this.hud.fade(true, true);
        if (this.t > 4.6) { this.go('done'); this.hud.hint(null); this.onDone(); }
        break;
      }
    }
    return it;
  }
  /** cutscene: no movement, no fight; inputLocked would also drop the scripted walk home */
  private lock(it: Intent): Intent { return { ...it, mx: 0, mz: 0, act: null, attack: false }; }

  private startCutscene() {
    const sim = this.sim, H = this.cfg.hof, P = sim.player;
    this.view.setArrow(null); this.hud.hint(null); this.hud.letterbox(true);
    play('rustle'); setTimeout(() => play('rustle'), 300);
    // the raccoon comes from the gap closest to the bush and peeks out of the forest
    const gi = sim.hof.nearestGap(H.bush.x, H.bush.z), gp = sim.hof.edge(sim.hof.gaps[gi].a, 1.08), peek = sim.hof.edge(sim.hof.gaps[gi].a, .97);
    const r = sim.spawn('raccoon', gi, { x: gp.x, z: gp.z, state: 'script', hp: this.cfg.tutorial.raccoonHp, maxHp: this.cfg.tutorial.raccoonHp, shy: false });
    r.path = [{ x: peek.x, z: peek.z, speed: 1 }]; this.rac = r;
    // it will flee through the gap that lies "behind" the player, seen from the basket
    const K = sim.basketAt ?? H.basket, bx = P.x - K.x, bz = P.z - K.z; let best = 0, bd = -2;
    sim.hof.gaps.forEach((g, i) => { const l = Math.hypot(bx, bz) || 1, d = (Math.cos(g.a) * bx + Math.sin(g.a) * bz) / l; if (d > bd) { bd = d; best = i; } });
    this.gap = best;
    this.view.shot = { x: peek.x, z: peek.z + 1.5, zoom: .62 };
    this.go('cutIn');
  }
  /** sneak from the forest edge to the basket at the Lager (around the buildings) */
  private sneakPath() {
    const r = this.rac!, K = this.sim.basketAt ?? this.cfg.hof.basket, sp = 1.7, out: { x: number; z: number; speed: number }[] = [];
    // walk in steps, sidestepping buildings: sample the straight line and push points out of obstacles
    const n = 8;
    for (let i = 1; i <= n; i++) {
      const k = i / n, x = r.x + (K.x - .4 - r.x) * k, z = r.z + (K.z + .7 - r.z) * k;
      const c = this.sim.hof.collide(x, z, .9, false, 'basket'); out.push({ x: c.x, z: c.z, speed: sp });
    }
    out.push({ x: K.x - .3, z: K.z + .6, speed: sp });
    return out;
  }
  /** run across the yard, close past the player, towards the gap */
  private runPath() {
    const r = this.rac!, P = this.sim.player, gi = this.sim.hof.gapIn(this.gap), go = this.sim.hof.gapOut(this.gap), sp = 4;
    const dx = P.x - r.x, dz = P.z - r.z, l = Math.hypot(dx, dz) || 1, side = 1.4;
    const by = this.sim.hof.collide(P.x - dz / l * side, P.z + dx / l * side, .5, false);
    return [{ x: by.x, z: by.z, speed: sp }, { x: gi.x, z: gi.z, speed: sp }, { x: go.x, z: go.z, speed: sp }];
  }
  /** the fight card waits for the first attack */
  get waitingForAttack() { return this.fightPrompt; }
}
