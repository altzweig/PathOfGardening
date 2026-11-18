// The shed (Lager) in the middle of the clearing (18.11.2026): a pretty little garden hut, nailed together from boards.
// For now it only shows the team's life: HP bar above it, it shakes when hit, collapses when it breaks (game lost).
import * as THREE from 'three';
import { GEO, M, barGroup, burst, makeBar, part, rand, setBar, V } from './core';

/** board texture: warm wood with grain running along v and a few knots (painted once) */
let woodTex: THREE.CanvasTexture | null = null;
function wood() {
  if (woodTex) return woodTex;
  const W = 64, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d')!;
  g.fillStyle = '#b08a60'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 46; i++) { // grain lines
    const x = rand(0, W), w = rand(.6, 2.2); g.strokeStyle = `rgba(${Math.random() < .5 ? '90,60,35' : '200,170,130'},${rand(.12, .35)})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= H; y += 16) g.lineTo(x + Math.sin(y * .03 + i) * rand(1, 3), y); g.stroke();
  }
  for (let i = 0; i < 3; i++) { const x = rand(10, W - 10), y = rand(20, H - 20); const grd = g.createRadialGradient(x, y, 0, x, y, rand(4, 7)); grd.addColorStop(0, 'rgba(70,40,20,.8)'); grd.addColorStop(1, 'rgba(70,40,20,0)'); g.fillStyle = grd; g.beginPath(); g.ellipse(x, y, 6, 10, 0, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(60,40,25,.5)'; g.fillRect(0, 0, 1.5, H); g.fillRect(W - 1.5, 0, 1.5, H); // board edges
  woodTex = new THREE.CanvasTexture(cv); woodTex.colorSpace = THREE.SRGBColorSpace; woodTex.anisotropy = 4;
  return woodTex;
}
const woodMats = new Map<number, THREE.MeshStandardMaterial>();
const W = (c: number) => { let m = woodMats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ map: wood(), color: c, roughness: .9 }); woodMats.set(c, m); } return m; };
const TONES = [0xb98a5c, 0xa77b52, 0xc49a6a, 0x9c7048, 0xb08458, 0x8f6844];
const tone = () => W(TONES[Math.floor(Math.random() * TONES.length)]);
const nailMat = M(0x3a3a40, { m: .7, r: .4 });

/** one board, long along local y; returned mesh is placed by the caller */
function board(p: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat = tone()) {
  const m = part(p, GEO.box, mat, w, h, d, x, y, z); m.receiveShadow = true; return m;
}

export class Lager {
  g = new THREE.Group(); private body = new THREE.Group(); private snow: THREE.Mesh[] = [];
  bar: THREE.Group; private shake = 0; private down = 0; private broken = false; private hp = 1;
  constructor(parent: THREE.Object3D) {
    const b = this.body; this.g.add(b); parent.add(this.g);
    const WX = 1.7, WZ = 1.45, WH = 1.35, bw = .17; // walls: width (x), depth (z), height
    // stone footing
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; part(b, GEO.lo, M(0x8a8a86), rand(.16, .24), rand(.08, .12), rand(.14, .2), Math.cos(a) * WX * .56, .04, Math.sin(a) * WZ * .6); }
    part(b, GEO.box, W(0x6e5236), WX + .1, .08, WZ + .1, 0, .1, 0); // floor frame
    // vertical boards on all four walls, slightly uneven
    const wall = (len: number, along: 'x' | 'z', off: number, skipDoor: boolean) => {
      const n = Math.round(len / bw);
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + bw * (i + .5);
        if (skipDoor && Math.abs(t) < .36) continue; // door opening
        const h = WH + rand(-.05, .04), x = along === 'x' ? t : off, z = along === 'x' ? off : t;
        const m = board(b, along === 'x' ? bw - .012 : .05, h, along === 'x' ? .05 : bw - .012, x, .14 + h / 2, z);
        m.rotation[along === 'x' ? 'z' : 'x'] = rand(-.018, .018);
      }
    };
    wall(WX, 'x', WZ / 2, true); wall(WX, 'x', -WZ / 2, false); wall(WZ, 'z', WX / 2, false); wall(WZ, 'z', -WX / 2, false);
    // gable ends (triangles of shorter boards)
    const RH = .7; // roof height above the walls
    for (const s of [1, -1]) for (let i = 0; i < Math.round(WZ / bw); i++) { // ridge runs along x: gables on the left and right wall
      const t = -WZ / 2 + bw * (i + .5), h = Math.max(.02, RH * (1 - Math.abs(t) / (WZ / 2 + .05)));
      board(b, .05, h, bw - .012, s * WX / 2, .14 + WH + h / 2 - .02, t);
    }
    // horizontal battens with nails
    const batten = (x: number, y: number, z: number, len: number, rotY: number) => {
      const m = board(b, .07, len, .035, x, y, z, W(0x8a6440)); m.rotation.set(0, rotY, Math.PI / 2 + rand(-.03, .03));
      for (let k = -2; k <= 2; k++) { const d = k / 2 * (len / 2 - .08); part(b, GEO.sph, nailMat, .014, .014, .008, x + Math.cos(rotY) * d + Math.sin(rotY) * .02, y, z - Math.sin(rotY) * d + Math.cos(rotY) * .02, false); }
    };
    for (const y of [.42, 1.22]) { batten(-.6, y, WZ / 2 + .045, .52, 0); batten(.6, y, WZ / 2 + .045, .52, 0); batten(0, y, -WZ / 2 - .045, WX, Math.PI); batten(WX / 2 + .045, y, 0, WZ, Math.PI / 2); batten(-WX / 2 - .045, y, 0, WZ, -Math.PI / 2); }
    // door with a Z brace and a little handle
    const door = new THREE.Group(); door.position.set(-.34, .14, WZ / 2 + .02); door.rotation.y = .35; b.add(door); // ajar
    for (let i = 0; i < 4; i++) board(door, .17, 1.18, .04, .09 + i * .17, .59, 0, W(0x9a6a3e));
    for (const y of [.22, .98]) { const m = board(door, .06, .7, .03, .345, y, .035, W(0x7a5232)); m.rotation.z = Math.PI / 2; }
    const zb = board(door, .06, .95, .03, .345, .6, .035, W(0x7a5232)); zb.rotation.z = -.82;
    part(door, GEO.sph, M(0x2a2a2a, { m: .8, r: .3 }), .03, .03, .03, .6, .62, .06, false);
    part(b, GEO.box, M(0x1c140e), .7, 1.18, .02, 0, .73, WZ / 2 - .01, false); // dark inside behind the door
    // window on the right wall: dark pane, cross frame, flower box
    const win = new THREE.Group(); win.position.set(WX / 2 + .03, .9, 0); win.rotation.y = Math.PI / 2; b.add(win);
    part(win, GEO.box, M(0x2b3a44, { r: .2, m: .1 }), .46, .38, .02, 0, 0, 0, false);
    for (const [w, h, x, y] of [[.52, .05, 0, .21], [.52, .05, 0, -.21], [.05, .46, .25, 0], [.05, .46, -.25, 0], [.03, .38, 0, 0], [.46, .03, 0, 0]]) board(win, w, h, .04, x, y, .02, W(0xe8dcc0));
    board(win, .5, .1, .12, 0, -.3, .07, W(0x8a6440));
    for (let i = 0; i < 5; i++) part(win, GEO.ico, M([0xe8607a, 0xf0c040, 0xffffff, 0xd070e0][i % 4], { r: .7 }), .05, .05, .05, -.18 + i * .09, -.22, .08 + rand(-.02, .02), false);
    for (let i = 0; i < 4; i++) part(win, GEO.ico, M(0x4f8a35), .06, .04, .05, -.15 + i * .1, -.24, .1, false);
    // roof: two slopes of overlapping boards running down the slope, a ridge board, slight overhang
    const slope = Math.atan2(RH, WZ / 2), L = Math.hypot(RH, WZ / 2) + .28;
    for (const s of [1, -1]) {
      const n = Math.round((WX + .4) / .2);
      for (let i = 0; i < n; i++) {
        const x = -(WX + .4) / 2 + .2 * (i + .5), m = board(b, .2, L, .04 + (i % 2) * .015, x, .14 + WH + RH / 2 - .02 + (i % 2) * .012, s * (WZ / 4 + .05), W(i % 3 ? 0x7c5c40 : 0x6a4c34));
        m.rotation.x = -s * (Math.PI / 2 - slope) + rand(-.012, .012);
      }
      // snow on the roof in winter
      const sn = part(b, GEO.box, M(0xf2f6ff, { r: 1 }), WX + .38, L - .06, .06, 0, .14 + WH + RH / 2 + .03, s * (WZ / 4 + .06), false);
      sn.rotation.x = -s * (Math.PI / 2 - slope); sn.visible = false; this.snow.push(sn);
    }
    const ridge = board(b, .12, WX + .5, .08, 0, .14 + WH + RH + .02, 0, W(0x5e422c)); ridge.rotation.z = Math.PI / 2;
    // a little life around it: a barrel, a crate, a sack and a rake leaning on the wall
    const barrel = new THREE.Group(); barrel.position.set(WX / 2 + .35, 0, WZ / 2 - .1); b.add(barrel);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const m = board(barrel, .1, .62, .03, Math.cos(a) * .2, .31, Math.sin(a) * .2, W(0x8a5a34)); m.rotation.y = -a + Math.PI / 2; }
    for (const y of [.12, .5]) part(barrel, GEO.cyl, M(0x3a3a3a, { m: .6, r: .4 }), .215, .035, .215, 0, y, 0, false);
    part(barrel, GEO.cyl, W(0x7a5030), .19, .02, .19, 0, .6, 0, false);
    const crate = new THREE.Group(); crate.position.set(-WX / 2 - .32, 0, WZ / 2 - .05); crate.rotation.y = .4; b.add(crate);
    part(crate, GEO.box, W(0xb08458), .42, .34, .38, 0, .17, 0);
    for (const y of [.06, .28]) part(crate, GEO.box, W(0x8a6440), .44, .05, .4, 0, y, 0, false);
    for (let i = 0; i < 6; i++) part(crate, GEO.sph, M([0x3a5fff, 0xd0203a][i % 2], { r: .5 }), .045, .045, .045, rand(-.14, .14), .36, rand(-.12, .12), false);
    const sack = part(b, GEO.sph, M(0xc8b088, { r: 1 }), .2, .26, .18, WX / 2 + .3, .24, -WZ / 2 + .2); sack.rotation.z = .2;
    const rake = new THREE.Group(); rake.position.set(-WX / 2 - .06, 0, -.3); rake.rotation.set(0, 0, -.22); b.add(rake);
    part(rake, GEO.cyl, W(0x9a7a50), .018, 1.3, .018, 0, .65, 0);
    part(rake, GEO.box, M(0x5a5a5a, { m: .6 }), .03, .03, .3, 0, 1.3, 0);
    this.bar = makeBar(1.8, .16, 0x6fcf4a); this.bar.position.set(0, 2.8, 0);
  }
  /** hp: 0..1 (-1 = no shed), shake from the last hit, snow on the roof 0..1, camera for the bar */
  update(dt: number, hp: number, shake: number, snow: number, cam: THREE.Camera) {
    this.g.visible = hp >= 0 || this.down > 0; this.bar.visible = hp >= 0 && !this.broken;
    if (hp < 0) return;
    if (hp < this.hp - .001) this.shake = Math.max(this.shake, .3);
    this.hp = hp; this.shake = Math.max(0, Math.max(this.shake, shake) - dt);
    setBar(this.bar, hp); this.bar.quaternion.copy(cam.quaternion);
    (this.bar.userData.fg.material as THREE.MeshBasicMaterial).color.set(hp > .5 ? 0x6fcf4a : hp > .25 ? 0xe3b964 : 0xd23a2e);
    for (const s of this.snow) s.visible = snow > .35;
    const t = performance.now() / 1000;
    if (hp <= 0 && !this.broken) { this.broken = true; burst(V(0, 1, 0), 0x8a6a3a, 60, 4, .25, 1.4, { g: 6 }); }
    if (this.broken) { this.down = Math.min(1, this.down + dt * 1.5); this.body.scale.set(1 + this.down * .15, Math.max(.15, 1 - this.down * .85), 1 + this.down * .15); this.body.rotation.z = this.down * .12; return; }
    this.body.rotation.z = Math.sin(t * 45) * this.shake * .06; this.body.rotation.x = Math.cos(t * 39) * this.shake * .04;
  }
  reset() { this.broken = false; this.down = 0; this.hp = 1; this.body.scale.set(1, 1, 1); this.body.rotation.set(0, 0, 0); }
  dispose() { barGroup.remove(this.bar); this.g.parent?.remove(this.g); }
}
