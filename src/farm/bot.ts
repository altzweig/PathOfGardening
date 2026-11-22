// Test helper for co-op (22.11.2026): a simple computer farmer that plays a guest on the farm without a network.
// It walks to the nearest work and holds the action button, at night it hunts the nearest animal with the hand rake.
// Console: __pog.bot() adds one, __pog.bot(0) removes them all.
import type { DaySim, Intent, Player } from './sim';
import { emptyIntent } from './sim';
import { randomLook, randomName } from '../look';

export class Bot {
  private hold: Intent['act'] = null;
  constructor(public P: Player) {}
  static add(sim: DaySim, id: number) { return new Bot(sim.addPlayer(id, { name: randomName(), look: randomLook() })); }
  intent(sim: DaySim): Intent {
    const P = this.P, it = emptyIntent();
    if (!sim.up(P)) return it;
    // an animal close by (always at night, by day only raccoons that come for it): fight
    let foe = null as null | { x: number; z: number }, fd = sim.nightOn ? 14 : 3;
    for (const a of sim.animals) { if (a.gone || a.driven || a.state === 'flee' || a.state === 'script' || (!sim.nightOn && a.type === 'hare')) continue; const d = Math.hypot(a.x - P.x, a.z - P.z); if (d < fd) { fd = d; foe = a; } }
    if (foe) {
      this.hold = null;
      const dx = foe.x - P.x, dz = foe.z - P.z, l = Math.hypot(dx, dz) || 1;
      if (l > 1.3) { it.mx = dx / l; it.mz = dz / l; }
      it.aimX = foe.x; it.aimZ = foe.z; it.attack = l < 1.6;
      return it;
    }
    // work: the nearest thing to do (others' targets are skipped by the simulation), hold the button on it
    if (!P.action && !P.goal && !P.after) this.hold = sim.as(P, () => sim.nearestTarget(40));
    if (this.hold) { it.act = P.action || P.goal || P.after ? null : this.hold; it.hold = true; it.holdAt = this.hold; }
    else { const d = sim.cfg.hof.door, dx = d.x + 2 - P.x, dz = d.z + 2 - P.z, l = Math.hypot(dx, dz); if (l > 1) { it.mx = dx / l; it.mz = dz / l; } }
    return it;
  }
}
