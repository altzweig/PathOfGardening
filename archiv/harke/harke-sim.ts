// ARCHIV (18.11.2026): alte Harke aus src/sim/sim.ts (Klasse Sim), ersetzt durch die Hacke. Wird nicht kompiliert.
// Zug nach links hinten + Stoß nach vorne, Trefferkreis (Sphere-Overlap) am Ende des Stoßes, Beackern anteilig zur
// überdeckten Fläche je Hex-Dreieck (32-Eck-Clipping).
  /** rake hit: a sphere overlap at the end of the push. The rake model is only the animation; the damage comes from a
   *  circle between the point where the pull ends and the full reach (diameter = that distance, upgradable) */
  private inRakeCircle(p: Player, e: Enemy, dx: number, dz: number) {
    const RS = this.rakeStats(p), cx = p.x + dx * RS.centre, cz = p.z + dz * RS.centre;
    return Math.hypot(e.x - cx, e.z - cz) <= RS.dia / 2 + e.r;
  }
  /** area of the rake circle on each of the 6 triangles of a hex field (triangle k: centre, corner k, corner k+1;
   *  one plant stands in each). The circle is a 32-gon; each triangle is clipped by its edges (Sutherland-Hodgman + shoelace). */
  rakeOverlap(f: Field, p: Player, dx: number, dz: number): number[] {
    const RS = this.rakeStats(p), H = hexR(this.cfg), out = [0, 0, 0, 0, 0, 0], r = RS.dia / 2;
    const cx = p.x + dx * RS.centre, cz = p.z + dz * RS.centre;
    if (Math.hypot(f.x - cx, f.z - cz) > r + H) return out;
    // points relative to the circle centre
    const c: [number, number] = [f.x - cx, f.z - cz], cs: [number, number][] = [];
    for (let k = 0; k < 6; k++) { const a = cornerAngle(k); cs.push([c[0] + Math.cos(a) * H, c[1] + Math.sin(a) * H]); }
    for (let k = 0; k < 6; k++) out[k] = this.clipCircle([c, cs[k], cs[(k + 1) % 6]], r);
    return out;
  }
  private clipCircle(tri: [number, number][], r: number) {
    const N = 32; // edges touch the circle from outside (area +0.3 %)
    let poly = tri;
    for (let i = 0; i < N && poly.length; i++) { // half plane: x*nx + z*nz <= r (tangent edge with outward normal n)
      const t = (i + .5) / N * Math.PI * 2, nx = Math.cos(t), nz = Math.sin(t), out: [number, number][] = [];
      const d = (q: [number, number]) => q[0] * nx + q[1] * nz - r;
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length], da = d(a), db = d(b);
        if (da <= 0) out.push(a);
        if ((da <= 0) !== (db <= 0)) { const k = da / (da - db); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
      }
      poly = out;
    }
    let A = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; A += a[0] * b[1] - b[0] * a[1]; }
    return Math.abs(A) / 2;
  }
  /** rake stroke duration: pull (front -> left back, one swing) + push (quickly forward, impact); with the speed
   *  upgrade the stroke gets faster so it always ends before the next one (at most 90 % of the cooldown) */
  rakeTime(p: Player) { const R = this.cfg.rake, T = R.pullTime + R.pushTime; return Math.min(T, this.rakeStats(p).cd * .9); }
  /** starts a stroke. The direction is not fixed: it follows aim / movement live (rakeDir) until the impact. */
  rakeAttack(p: Player, dx: number, dz: number) {
    p.rakeCd = this.rakeStats(p).cd; p.aimX = dx; p.aimZ = dz; p.face = p.swingDir = Math.atan2(dx, dz);
    p.swing = this.rakeTime(p); p.rakeHit = true;
    this.snd('rake');
  }
  /** live stroke direction: explicit aim (mouse / aim stick) > nearest enemy in reach > movement > last direction */
  rakeDir(p: Player): [number, number] {
    const it = p.intent;
    if (it.aim) { const l = Math.hypot(it.ax, it.az); if (l > .01) return [it.ax / l, it.az / l]; }
    const n = this.nearestEnemy(p.x, p.z, this.rakeStats(p).range + 1.5);
    if (n) { const dx = n.x - p.x, dz = n.z - p.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }
    const ml = Math.hypot(it.mx, it.mz); if (ml > .05) return [it.mx / ml, it.mz / ml];
    return [p.aimX, p.aimZ];
  }
  /** impact at the end of the push (rake fully extended): sphere overlap of the hit circle (see inRakeCircle):
   *  hits every enemy in it (damage, stun, knockback) and tills every field it covers (in proportion to the covered area) */
  rakeImpact(p: Player, dx: number, dz: number) {
    const R = this.cfg.rake, RS = this.rakeStats(p);
    const targets = this.enemies.filter(e => !e.dead && this.inRakeCircle(p, e, dx, dz));
    this.emit({ k: 'swipe', x: r2(p.x), z: r2(p.z), a: r2(Math.atan2(dx, dz)), p: p.id, r: r2(RS.range), w: r2(RS.dia) });
    this.till(p, dx, dz);
    let hits = 0;
    for (const e of targets) {
      const boss = !!e.boss; // bosses: damage only (a stun every stroke would lock them)
      if (!this.hurtEnemy(e, RS.dmg, { color: 'r', punch: true, stun: boss ? 0 : R.stun })) continue;
      hits++;
      if (RS.kb > 0 && !e.dead && !boss) { const ex = e.x - p.x, ez = e.z - p.z, l = Math.hypot(ex, ez) || 1; e.kbx = ex / l; e.kbz = ez / l; e.kbLeft = RS.kb; }
    }
    if (hits) this.emit({ k: 'punches', n: hits, x: r2(p.x), z: r2(p.z) });
  }
  /** tilling: every field under the rake circle advances its harvest by tillStroke s x (covered area / area of the
   *  base rake circle). Raking a field with the base rake: harvest every (interval x rake cooldown); wider/longer rake and
   *  faster cooldown = more yield. A harvest completed by a stroke falls out of the bushes. */
  till(p: Player, dx: number, dz: number) {
    const F = this.cfg.fields, R = this.cfg.rake, A0 = Math.PI * R.diameter * R.diameter / 4;
    let best: Field | null = null, bestA = 0, any = false;
    for (const f of this.fields) {
      if (!f.alive) continue;
      const tri = this.rakeOverlap(f, p, dx, dz), A = tri.reduce((s, x) => s + x, 0); if (A < .01) continue;
      any = true;
      if (A > bestA) { bestA = A; best = f; }
      f.tilledT = F.tillDuration; f.shake = Math.max(f.shake, .2);
      if (this.yields(f)) f.t -= F.tillStroke * (A / A0) * this.prodMult(f) * this.hpF(f);
      while (f.t <= 0) { f.t += this.cfg.plants[f.type].interval; this.produce(f, tri); }
      // view: field flash; only the plants of the raked triangles wobble and shed leaves (bit mask m), rustle
      let m = 0; tri.forEach((x, k) => { if (x > .01) m |= 1 << k; });
      // w: raked share of each triangle (0..1) -> the berries of that plant light up accordingly
      const TA = Math.sqrt(3) / 4 * hexR(this.cfg) ** 2;
      this.emit({ k: 'till', s: f.slot, a: r2(Math.min(1, A / A0)), m, w: tri.map(x => r2(Math.min(1, x / TA))) });
    }
    if (!any) return;
    // the field covered most counts as this player's tilled field
    for (const o of this.fields) if (o !== best && o.tilledBy === p.id) o.tilledBy = -1;
    if (best) best.tilledBy = p.id;
    const RS = this.rakeStats(p);
    this.sfx('player.till', p.x + dx * RS.centre, p.z + dz * RS.centre);
    this.burst(p.x + dx * RS.centre, .1, p.z + dz * RS.centre, 0x8a6a3a, 10, 1.2, .14, .4, { g: 4 });
  }
