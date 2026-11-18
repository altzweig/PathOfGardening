// ARCHIV (18.11.2026): Modell + Kratzspuren + Animation der alten Harke (aus src/view/arsenal.ts, core.ts, models.ts, view.ts).
/** rake handle: turned ash pole (along +z, length L) with a leather grip zone and a brass ferrule */
export function rakeHandle(L: number) {
  const K = kit(), g = new THREE.Group();
  mesh(g, lathe([[.018, 0], [.024, .01], [.025, L * .5], [.023, L - .02], [.02, L]], 14), K.ash);
  wrapZ(g, K.leather, .0265, L * .3, L * .48);
  band(g, K.brass, .029, .05, L - .02); band(g, K.brass, .028, .015, .012);
  return g;
}
/** forged rake head: bevelled back bar, tapered and slightly curved tines, brass collar */
export function rakeHeadModel(n: number, gap: number, w: number) {
  const K = kit(), g = new THREE.Group();
  mesh(g, rbox(n * gap + .02, .036, .045, .012), K.iron, 0, 0, 0);
  mesh(g, rbox(.07, .05, .07, .015), K.iron, 0, .005, -.03);
  band(g, K.brass, .03, .02, -.065);
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + w * (i + .5) / n;
    mesh(g, sweep([V3(x, -.01, .01), V3(x, -.07, .03), V3(x, -.13, .06)], t => .009 * (1 - t * .7), { radial: 8, steps: 10, caps: true }), K.iron);
  }
  for (const sd of [-1, 1]) rivet(g, K.brass, .008, sd * (n * gap / 2 - .005), .02, 0);
  return g;
}
}
/** rake tines: fixed spacing, a wider rake gets more tines (and leaves more scratches), nothing is stretched */
export const TINE_GAP = .075;
export const rakeTines = (w: number) => Math.max(4, Math.round(w / TINE_GAP));
/** flat rectangle in the XZ plane: width along X, length along +Z from the origin (rotate with rotation.y = aim angle) */
export function rectGeo(w: number, l: number) { const g = new THREE.PlaneGeometry(w, l); g.rotateX(-Math.PI / 2); g.translate(0, 0, l / 2); return g; }
/** rake stroke: scratch marks of the tines in the ground, one per tine (same spacing as the rake head), each slightly
 *  wavy, tapered and with ragged start/end (random length, short side scratches where the tines bite in and lift off).
 *  They fill the hit circle: diameter w, far edge `len` ahead; each tine scratches the chord of the circle it crosses. */
export function rakeSweep(x: number, z: number, angle: number, len: number, w: number) {
  const pos: number[] = [], n = rakeTines(w);
  const strip = (cx: number, z0: number, z1: number, hw: number, wob: number) => {
    const S = 10, ph = rand(0, 7), pts: [number, number, number][] = [];
    for (let i = 0; i <= S; i++) {
      const t = i / S, zz = lerp(z0, z1, t), taper = Math.pow(Math.sin(Math.PI * Math.min(1, .15 + t * .85)), .6);
      pts.push([cx + Math.sin(ph + t * 5) * wob + rand(-.004, .004), zz, hw * taper * rand(.6, 1.15)]);
    }
    for (let i = 0; i < S; i++) {
      const [ax, az, aw] = pts[i], [bx, bz, bw] = pts[i + 1];
      pos.push(ax - aw, 0, az, bx - bw, 0, bz, bx + bw, 0, bz, ax - aw, 0, az, bx + bw, 0, bz, ax + aw, 0, az);
    }
  };
  for (let i = 0; i < n; i++) {
    const r = w / 2, c = len - r, cx = -r + w * (i + .5) / n, h = Math.sqrt(Math.max(0, r * r - cx * cx));
    const z0 = c - h + 2 * h * rand(0, .12), z1 = c + h - 2 * h * rand(0, .15);
    strip(cx, z0, z1, .011, .012);
    // frayed ends: short skewed scratches where the tine bit in (far end) and lifted off (near end)
    if (Math.random() < .55) { const s = rand(-.03, .03); strip(cx + s, z1 - rand(.06, .16), z1 + rand(0, .05), .006, .01); }
    if (Math.random() < .45) { const s = rand(-.03, .03); strip(cx + s, Math.max(0, z0 - rand(0, .04)), z0 + rand(.05, .14), .006, .01); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x24170d, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.y = angle; m.position.set(x, .05, z); scene.add(m); fx.push({ m, t: 0, life: 1.2, r0: 1, r1: 1, op: .5, own: true });
}
export const PLAYER_RING = [0xffd890, 0x8fc8ff, 0xff9a8a, 0xd0a0ff];
/** rake head as wide as the raked strip: one tine per scratch, same spacing (wider rake = more tines) */
export function rakeHead(w: number) {
  const head = rakeHeadModel(rakeTines(w), TINE_GAP, w);
  head.userData.w = w; return head;
}
// --- view.ts animPlayer (Harke) ---
    v.recoil = Math.max(0, v.recoil - dt); v.body.position.z = -v.recoil * .6;
    // rake model: handle from the hands (pivot .62 m up) to the head; head distance d and height y set length + tilt
    const R = this.cfg.rake, reach = s.rr || R.range, L0 = R.range - .12, HY = .62;
    const rw = s.ra || R.diameter; // diameter upgrade: rebuild the head with more tines (nothing stretched)
    if (v.head.userData.w !== rw) { const h = rakeHead(rw); h.position.copy(v.head.position); v.rake.remove(v.head); v.rake.add(h); v.head = h; }
    v.rake.position.z = 0;
    const aimRake = (d: number, y: number) => { v.rake.scale.z = Math.hypot(HY - y, d) / L0; v.rake.rotation.x = Math.atan2(HY - y, d); };
    if (swinging) { // one stroke, always the same: pull from the front to the left back in one swing, then shove forward
      // the pull ends at the near edge of the hit circle, the push goes out to the full reach (far edge)
      const RC = this.cfg.rake, P = RC.pullTime / (RC.pullTime + RC.pushTime), k = s.sw, BACK = 1.75, NEAR = Math.max(.25, reach - rw);
      let yaw: number, d: number, y: number, lean: number;
      if (k < P) { // pull: head drags over the ground, sweeps round to the left back and lifts off at the end (swing)
        const t = k / P, e = t * t * (3 - 2 * t);
        yaw = BACK * e; d = lerp(reach, NEAR, e); y = .02 + .3 * Math.pow(t, 4); lean = .2 * (1 - e);
      } else { // push: swings round to the front and shoots forward, accelerating, slams down at the impact
        const t = (k - P) / (1 - P), e = t * t, r = 1 - Math.pow(1 - Math.min(1, t * 1.5), 2);
        yaw = BACK * (1 - r); d = lerp(NEAR, reach, e); y = .32 * (1 - e) + .02; lean = .28 * e;
      }
      v.rake.rotation.y = yaw; aimRake(d, y); v.body.rotation.x = lean; v.twist = yaw * .3;
    } else {
      v.rake.rotation.y = lerp(v.rake.rotation.y, -.55, .2); v.body.rotation.x = lerp(v.body.rotation.x, 0, .2); v.twist = lerp(v.twist || 0, 0, .2);
      const L = reach - .12; v.rake.scale.z = lerp(v.rake.scale.z, L / L0, .2); v.rake.rotation.x = lerp(v.rake.rotation.x, Math.atan2(.5, L), .2);
    }
    v.head.scale.z = 1 / Math.max(.05, v.rake.scale.z); // the handle stretches with the reach, the head keeps its shape
