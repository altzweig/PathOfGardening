import * as THREE from 'three';
import type { CropId } from '../config';
import { GEO, M, part, rand } from './core';

// 18.11.2026 (Bastis Erntekalender): Gemüse, Beeren und Kräuter, deren Früchte XP geben.
// Je Pflanze: Farbe der Frucht (Chips, Partikel), Material am Boden (leuchtet) und an der Pflanze,
// Blatt-/Stängelfarbe, Pflanzenmodell (gleiche Maße wie die übrigen Büsche: ca. 0,6 Radius, 0,3-1 hoch) und Fruchtmodell.
type Mat = THREE.MeshStandardMaterial;
interface CropVis {
  col: number; leaf: number; head: number;
  ground: Mat; bush: Mat;
  /** g: Pflanze, L/H: Blatt- und Stängelmaterial, B: Fruchtmaterial (muss für Fruchtteile benutzt werden), fr: Fruchtteile (leuchten beim Harken, im Winter unsichtbar) */
  plant(g: THREE.Group, L: Mat, H: Mat, B: Mat, fr: THREE.Mesh[]): void;
  fruit(g: THREE.Group, mat: Mat): void;
}
const gm = (color: number, emissive: number, ei = .9, r = .45, flat = false) => new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: r, flatShading: flat });
const bm = (color: number, r = .45, flat = false) => new THREE.MeshStandardMaterial({ color, roughness: r, flatShading: flat });
const STEM = bm(0x4f7a2a, .7), STRAW_SEED = bm(0xf0d070, .5), WHITE = bm(0xf2efe0, .6), ROOTY = bm(0xe8dcc0, .7), GOLD = bm(0xd8b048, .5, true);
const ring = (n: number, f: (a: number, i: number) => void) => { for (let i = 0; i < n; i++) f(i / n * Math.PI * 2 + rand(-.2, .2), i); };
const at = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const;
/** flat leaf rosette on the ground */
function rosette(g: THREE.Group, L: Mat, n: number, r: number, w: number, l: number, y = .05, tilt = .4) {
  ring(n, a => { const [x, z] = at(a, r); const lf = part(g, GEO.lo, L, w, .03, l, x, y, z); lf.rotation.set(tilt, -a + Math.PI / 2, 0); });
}
/** upright stalks/blades */
function blades(g: THREE.Group, L: Mat, n: number, r: number, h: [number, number], w = .03) {
  ring(n, a => { const [x, z] = at(a, rand(0, r)), hh = rand(h[0], h[1]); const b = part(g, GEO.cone, L, w, hh, w, x, hh / 2, z); b.rotation.set(rand(-.25, .25), 0, rand(-.25, .25)); });
}
/** climbing frame of three canes with leaves along it (beans, peas, tomatoes) */
function canes(g: THREE.Group, L: Mat, h: number, leaves: number, lw = .12) {
  const W = bm(0x8a6a40, .8);
  ring(3, a => { const [x, z] = at(a, .22); const c = part(g, GEO.cyl, W, .018, h, .018, x * .7, h / 2, z * .7); c.rotation.set(-z * .25, 0, x * .25); });
  for (let i = 0; i < leaves; i++) { const a = rand(0, 7), y = rand(.15, h - .05), r = .2 - y / h * .1; const [x, z] = at(a, r); const lf = part(g, GEO.lo, L, lw, .04, lw * 1.2, x, y, z); lf.rotation.set(rand(-.6, .6), a, rand(-.6, .6)); }
}

export const CROP_VIS: Record<CropId, CropVis> = {
  // Bärlauch: breite, spitze Blätter dicht am Waldboden, weiße Sternblüten-Dolden
  ramsons: { col: 0x6ad050, leaf: 0x3f8a2a, head: 0x4f9a35, ground: gm(0x6ad050, 0x3aa020, .9, .5), bush: bm(0xf4f4ea, .6),
    plant(g, L, H, B, fr) {
      ring(9, a => { const [x, z] = at(a, rand(.05, .3)); const lf = part(g, GEO.lo, L, .07, .32, .02, x, .18, z); lf.rotation.set(rand(-.3, .3), a, (x > 0 ? -1 : 1) * rand(.1, .4)); });
      for (let i = 0; i < 4; i++) { const [x, z] = at(rand(0, 7), rand(.05, .25)); part(g, GEO.cyl, H, .01, .42, .01, x, .21, z); for (let k = 0; k < 5; k++) fr.push(part(g, GEO.sph, B, .03, .02, .03, x + rand(-.05, .05), .44 + rand(-.02, .03), z + rand(-.05, .05), false)); }
    },
    fruit(g, m) { const lf = part(g, GEO.lo, m, .05, .015, .17, 0, 0, 0); lf.rotation.y = .3; part(g, GEO.cyl, STEM, .008, .1, .008, 0, 0, -.18).rotation.x = Math.PI / 2; } },
  // Bohne: Stangenbohne an drei Stangen, grüne Hülsen hängen
  bean: { col: 0x7ac840, leaf: 0x3f7a2a, head: 0x7a5a30, ground: gm(0x7ac840, 0x4aa020), bush: bm(0x6aac38, .5),
    plant(g, L, H, B, fr) {
      canes(g, L, 1.0, 16);
      for (let i = 0; i < 10; i++) { const a = rand(0, 7), y = rand(.25, .85); const [x, z] = at(a, .2); const p = part(g, GEO.capsule, B, .022, .14, .022, x, y, z, false); p.rotation.z = rand(-.2, .2); fr.push(p); }
    },
    fruit(g, m) { const p = part(g, GEO.capsule, m, .03, .2, .028, 0, 0, 0); p.rotation.z = Math.PI / 2 + .2; } },
  // Erbse: niedriger rankender Busch mit Ranken, prall gefüllte Schoten
  pea: { col: 0x9ae060, leaf: 0x5a9a3a, head: 0x6aa84a, ground: gm(0x9ae060, 0x60b020), bush: bm(0x8ad050, .45),
    plant(g, L, H, B, fr) {
      canes(g, L, .7, 18, .1);
      for (let i = 0; i < 9; i++) { const a = rand(0, 7), y = rand(.2, .6); const [x, z] = at(a, .22); const p = part(g, GEO.capsule, B, .035, .1, .025, x, y, z, false); p.rotation.set(0, a, rand(-.5, .5)); fr.push(p); }
    },
    fruit(g, m) { const p = part(g, GEO.capsule, m, .04, .12, .03, 0, 0, 0); p.rotation.z = Math.PI / 2; for (let k = -1; k <= 1; k++) part(g, GEO.sph, m, .03, .03, .03, k * .05, .02, .012); } },
  // Erdbeere: Rosette aus dreiteiligen Blättern, rote Früchte mit gelben Nüsschen liegen außen
  straw: { col: 0xff3048, leaf: 0x2f6a2a, head: 0x3f7a2a, ground: gm(0xe8202e, 0xff2030, .6, .3), bush: bm(0xd8182a, .3),
    plant(g, L, H, B, fr) {
      ring(8, a => { const rr = rand(.08, .24), h = rand(.16, .28), [sx, sz] = at(a, rr * .5); part(g, GEO.cyl, H, .012, h, .012, sx, h / 2, sz); for (let k = -1; k <= 1; k++) { const b = a + k * .5, [x, z] = at(b, rr + .04); const lf = part(g, GEO.lo, L, .1, .03, .12, x, h + rand(-.02, .03), z); lf.rotation.set(.25 * k, -b, .2); } });
      for (let k = 0; k < 3; k++) { const b = k * 2.1, [x, z] = at(b, .05); const lf = part(g, GEO.lo, L, .11, .03, .13, x, .3, z); lf.rotation.set(.2, -b, 0); }
      ring(9, a => { const [x, z] = at(a, rand(.3, .42)); const b = part(g, GEO.sph, B, .05, .06, .045, x, .06, z, false); b.rotation.set(rand(-.6, .6), rand(0, 7), rand(-.6, .6)); fr.push(b); });
    },
    fruit(g, m) { const b = part(g, GEO.sph, m, .065, .08, .06, 0, 0, 0); b.rotation.z = .4; part(g, GEO.lo, STEM, .035, .01, .035, -.03, .075, 0).rotation.z = .4; for (let i = 0; i < 6; i++) { const a = i; part(g, GEO.sph, STRAW_SEED, .007, .007, .007, Math.cos(a) * .06, -.01 - (i % 2) * .025, Math.sin(a) * .055, false); } } },
  // Kartoffel: buschiges Kraut mit weißen Blüten, Knollen schauen aus der Erde
  potato: { col: 0xd8b070, leaf: 0x3f6f2a, head: 0x4a7a2c, ground: gm(0xc8a060, 0xa07a30, .7, .7, true), bush: bm(0xb8905a, .8, true),
    plant(g, L, H, B, fr) {
      for (let i = 0; i < 7; i++) { const [x, z] = at(i / 7 * 7, i ? .25 : 0); part(g, GEO.ico, L, rand(.18, .24), rand(.16, .2), rand(.18, .24), x, .36 + (i ? 0 : .12), z); }
      for (let i = 0; i < 5; i++) { const [x, z] = at(rand(0, 7), rand(.1, .3)); part(g, GEO.sph, WHITE, .03, .025, .03, x, .58 + rand(0, .06), z, false); }
      ring(6, a => { const [x, z] = at(a, rand(.38, .5)); fr.push(part(g, GEO.ico, B, .08, .06, .07, x, .03, z, false)); });
    },
    fruit(g, m) { part(g, GEO.ico, m, .1, .075, .085, 0, 0, 0); } },
  // Knoblauch: steife Blattscheiden, Knolle sitzt oben auf der Erde
  garlic: { col: 0xf0e8f8, leaf: 0x5a8a50, head: 0x6a9a5a, ground: gm(0xf0eaf4, 0xc8a8e8, .6, .5), bush: bm(0xece2f0, .55),
    plant(g, L, H, B, fr) {
      ring(4, a => { const [x, z] = at(a, .22); fr.push(part(g, GEO.sph, B, .08, .07, .08, x, .05, z, false)); blades(g, L, 4, .02, [.35, .5], .025); g.children.slice(-4).forEach(c => c.position.add(new THREE.Vector3(x, 0, z))); });
    },
    fruit(g, m) { part(g, GEO.sph, m, .09, .08, .09, 0, 0, 0); part(g, GEO.cone, m, .03, .07, .03, 0, .09, 0); for (let i = 0; i < 4; i++) part(g, GEO.cyl, ROOTY, .004, .04, .004, Math.cos(i) * .03, -.08, Math.sin(i) * .03, false); } },
  // Kopfsalat: lockere hellgrüne Köpfe
  lettuce: { col: 0xa8f070, leaf: 0x6ab83a, head: 0x8ad050, ground: gm(0xa8f070, 0x6ac030, .8, .6, true), bush: bm(0x9ae060, .6, true),
    plant(g, L, H, B, fr) {
      rosette(g, L, 8, .26, .16, .2, .06, .5);
      fr.push(part(g, GEO.ico, B, .2, .16, .2, 0, .14, 0, false));
      ring(5, a => { const [x, z] = at(a, .1); const l = part(g, GEO.lo, B, .13, .08, .15, x, .2, z, false); l.rotation.set(.6, -a, 0); fr.push(l); });
    },
    fruit(g, m) { part(g, GEO.ico, m, .13, .1, .13, 0, 0, 0); ring(4, a => { const [x, z] = at(a, .07); const l = part(g, GEO.lo, m, .08, .05, .1, x, .02, z); l.rotation.set(.5, -a, 0); }); } },
  // Kürbis: große Blätter am Boden, dicke orange Kürbisse
  pumpkin: { col: 0xff8a20, leaf: 0x3f7a2a, head: 0x4f8a30, ground: gm(0xf07a18, 0xff7010, .7, .5, true), bush: bm(0xe8781a, .5, true),
    plant(g, L, H, B, fr) {
      ring(6, a => { const [x, z] = at(a, rand(.15, .45)); const lf = part(g, GEO.lo, L, .2, .04, .2, x, .12 + rand(0, .1), z); lf.rotation.set(rand(-.3, .3), a, rand(-.3, .3)); part(g, GEO.cyl, H, .015, .15, .015, x * .6, .07, z * .6); });
      for (let i = 0; i < 2; i++) { const [x, z] = at(i * Math.PI + rand(-.5, .5), .38); fr.push(part(g, GEO.sph, B, .18, .14, .18, x, .12, z, false)); part(g, GEO.cyl, STEM, .02, .06, .02, x, .27, z, false); }
    },
    fruit(g, m) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; part(g, GEO.sph, m, .08, .13, .08, Math.cos(a) * .07, 0, Math.sin(a) * .07); } part(g, GEO.cyl, STEM, .02, .07, .02, 0, .14, 0); } },
  // Lauch: weißer Schaft, blaugrüne Blattfächer
  leek: { col: 0xd8f0b0, leaf: 0x3a7a5a, head: 0x4a8a6a, ground: gm(0xdaf0c0, 0x9ad070, .6, .5), bush: bm(0xf0f2e0, .55),
    plant(g, L, H, B, fr) {
      ring(5, a => { const [x, z] = at(a, rand(.15, .35)); fr.push(part(g, GEO.cyl, B, .045, .28, .045, x, .14, z, false));
        for (let k = 0; k < 4; k++) { const b = a + k * 1.6, lf = part(g, GEO.lo, L, .03, .3, .012, x + Math.cos(b) * .03, .4, z + Math.sin(b) * .03); lf.rotation.set(Math.sin(b) * .5, b, Math.cos(b) * .5); } });
    },
    fruit(g, m) { const s = part(g, GEO.cyl, m, .04, .3, .04, 0, 0, 0); s.rotation.z = Math.PI / 2; const t = part(g, GEO.cone, bm(0x3a7a5a), .05, .14, .03, .21, 0, 0); t.rotation.z = -Math.PI / 2; } },
  // Löwenzahn: gezackte Rosette, gelbe Blüten und Pusteblumen
  dandel: { col: 0xffd828, leaf: 0x4a8a2a, head: 0x5a9a35, ground: gm(0xffd020, 0xffb810, 1.0, .5), bush: bm(0xf8d020, .5),
    plant(g, L, H, B, fr) {
      ring(10, a => { const [x, z] = at(a, .2); const lf = part(g, GEO.lo, L, .05, .02, .22, x, .04, z); lf.rotation.set(.15, -a + Math.PI / 2, 0); });
      for (let i = 0; i < 5; i++) { const [x, z] = at(rand(0, 7), rand(0, .15)), h = rand(.25, .4); part(g, GEO.cyl, H, .008, h, .008, x, h / 2, z);
        if (i === 4) part(g, GEO.sph, WHITE, .06, .06, .06, x, h, z, false); else fr.push(part(g, GEO.sph, B, .05, .025, .05, x, h, z, false)); }
    },
    fruit(g, m) { part(g, GEO.sph, m, .07, .035, .07, 0, 0, 0); part(g, GEO.lo, STEM, .05, .015, .05, 0, -.03, 0); } },
  // Mais: hohe Stängel mit langen Blättern, Kolben mit Hüllblättern, Rispe oben
  corn: { col: 0xffd040, leaf: 0x4f8a2a, head: 0x6a9a3a, ground: gm(0xf8c838, 0xffb020, .8, .5), bush: bm(0xf0c040, .5),
    plant(g, L, H, B, fr) {
      for (let i = 0; i < 3; i++) { const [x, z] = at(i / 3 * 7, .18), h = rand(1.1, 1.3);
        part(g, GEO.cyl, H, .03, h, .03, x, h / 2, z);
        for (let k = 0; k < 4; k++) { const b = rand(0, 7), lf = part(g, GEO.lo, L, .03, .02, .35, x + Math.cos(b) * .12, h * (.3 + k * .15), z + Math.sin(b) * .12); lf.rotation.set(-.5, b + Math.PI / 2, 0); }
        part(g, GEO.cone, GOLD, .04, .18, .04, x, h + .08, z);
        const c = part(g, GEO.capsule, B, .045, .12, .045, x + .06, h * .5, z, false); c.rotation.z = -.3; fr.push(c);
        const hk = part(g, GEO.cone, L, .05, .2, .05, x + .07, h * .5 - .06, z); hk.rotation.z = Math.PI - .3; }
    },
    fruit(g, m) { const c = part(g, GEO.capsule, m, .05, .16, .05, 0, 0, 0); c.rotation.z = Math.PI / 2; const h = part(g, GEO.cone, bm(0x8ab84a, .7), .06, .18, .06, -.1, 0, 0); h.rotation.z = Math.PI / 2; } },
  // Möhre: fedriges Kraut, orange Schulter schaut aus der Erde
  carrot: { col: 0xff7a18, leaf: 0x4a9a30, head: 0x5aa83a, ground: gm(0xf07018, 0xff6a10, .8, .5), bush: bm(0xf07a20, .5),
    plant(g, L, H, B, fr) {
      ring(5, a => { const [x, z] = at(a, rand(.15, .35)); fr.push(part(g, GEO.cyl, B, .04, .05, .04, x, .02, z, false));
        for (let k = 0; k < 5; k++) { const b = rand(0, 7), h = rand(.2, .32), lf = part(g, GEO.cone, L, .04, h, .02, x + Math.cos(b) * .03, .04 + h / 2, z + Math.sin(b) * .03); lf.rotation.set(Math.sin(b) * .45, 0, Math.cos(b) * .45); } });
    },
    fruit(g, m) { const c = part(g, GEO.cone, m, .045, .26, .045, 0, 0, 0); c.rotation.z = Math.PI / 2; for (let k = 0; k < 3; k++) { const t = part(g, GEO.cone, bm(0x4a9a30), .02, .12, .01, .17, 0, (k - 1) * .02); t.rotation.z = -Math.PI / 2 + (k - 1) * .3; } } },
  // Paprika: kompakter Busch, rote und gelbe Schoten hängen
  pepper: { col: 0xff4a20, leaf: 0x2f6a28, head: 0x3f7a2a, ground: gm(0xe83a18, 0xff3a10, .7, .3), bush: bm(0xd8301a, .3),
    plant(g, L, H, B, fr) {
      for (let i = 0; i < 5; i++) { const [x, z] = at(i / 5 * 7, i ? .2 : 0); part(g, GEO.ico, L, rand(.16, .2), rand(.12, .16), rand(.16, .2), x, .48 + (i ? 0 : .08), z); }
      for (let i = 0; i < 3; i++) { const [x, z] = at(i / 3 * 7, .06); part(g, GEO.cyl, H, .02, .45, .02, x, .22, z); }
      ring(6, a => { const [x, z] = at(a, rand(.26, .36)); fr.push(part(g, GEO.ico, B, .07, .08, .07, x, .3 + rand(-.05, .05), z, false)); });
    },
    fruit(g, m) { part(g, GEO.ico, m, .08, .09, .08, 0, 0, 0); part(g, GEO.cyl, STEM, .015, .05, .015, 0, .1, 0); } },
  // Radieschen: kleine Blattrosette, rote Knöllchen auf der Erde
  radish: { col: 0xff3a70, leaf: 0x4a9a35, head: 0x5aa83a, ground: gm(0xe8285a, 0xff2060, .6, .3), bush: bm(0xd8205a, .3),
    plant(g, L, H, B, fr) {
      ring(4, a => { const [x, z] = at(a, rand(.15, .35)); fr.push(part(g, GEO.sph, B, .06, .055, .06, x, .04, z, false));
        for (let k = 0; k < 4; k++) { const b = a + k * 1.6, lf = part(g, GEO.lo, L, .045, .015, .1, x + Math.cos(b) * .05, .14, z + Math.sin(b) * .05); lf.rotation.set(.6, -b + Math.PI / 2, 0); } });
    },
    fruit(g, m) { part(g, GEO.sph, m, .065, .06, .065, 0, 0, 0); part(g, GEO.cone, WHITE, .015, .06, .015, 0, -.08, 0).rotation.x = Math.PI; } },
  // Rhabarber: riesige Blätter auf roten Stielen
  rhubarb: { col: 0xe03a5a, leaf: 0x3a7a2a, head: 0x4a8a30, ground: gm(0xd8304e, 0xe0204a, .7, .5), bush: bm(0xc82848, .5),
    plant(g, L, H, B, fr) {
      ring(5, a => { const [x, z] = at(a, .28), st = part(g, GEO.cyl, B, .028, .45, .028, x * .55, .22, z * .55, false); st.rotation.set(-z * 1.0, 0, x * 1.0); fr.push(st);
        const lf = part(g, GEO.lo, L, .26, .04, .24, x, .46, z); lf.rotation.set(rand(-.2, .2), a, rand(-.2, .2)); });
    },
    fruit(g, m) { const s = part(g, GEO.cyl, m, .03, .36, .03, 0, 0, 0); s.rotation.z = Math.PI / 2; part(g, GEO.lo, bm(0x3a7a2a), .08, .03, .08, .2, 0, 0); } },
  // Stachelbeere: verholzter Strauch, grüne gestreifte Beeren
  goose: { col: 0xb8e060, leaf: 0x3a6a2a, head: 0x6a5030, ground: gm(0xb8e070, 0x80c030, .6, .35), bush: bm(0xa8d060, .35),
    plant(g, L, H, B, fr) {
      for (let i = 0; i < 5; i++) { const [x, z] = at(i / 5 * 7, .1), h = rand(.5, .7), b = part(g, GEO.cyl, H, .02, h, .02, x, h / 2, z); b.rotation.set(rand(-.35, .35), 0, rand(-.35, .35)); }
      for (let i = 0; i < 7; i++) { const [x, z] = at(i / 7 * 7, i ? .24 : 0); part(g, GEO.ico, L, rand(.15, .2), rand(.13, .17), rand(.15, .2), x, .5 + (i ? 0 : .12), z); }
      for (let i = 0; i < 12; i++) { const a = rand(0, 7), y = rand(.25, .55), r = .44 - Math.abs(y - .4) * .3; const [x, z] = at(a, r); fr.push(part(g, GEO.sph, B, .05, .045, .045, x, y, z, false)); }
    },
    fruit(g, m) { part(g, GEO.sph, m, .08, .07, .07, 0, 0, 0); part(g, GEO.cyl, STEM, .006, .05, .006, 0, .09, 0); } },
  // Tomate: an Stangen, rote Tomaten in Rispen
  tomato: { col: 0xff3020, leaf: 0x3a7a2a, head: 0x4a8a30, ground: gm(0xe82818, 0xff2010, .6, .25), bush: bm(0xd82018, .25),
    plant(g, L, H, B, fr) {
      canes(g, L, 1.0, 14, .13);
      for (let i = 0; i < 4; i++) { const a = rand(0, 7), y = rand(.3, .8), [x, z] = at(a, .24);
        for (let k = 0; k < 3; k++) fr.push(part(g, GEO.sph, B, .06, .055, .06, x + rand(-.05, .05), y - k * .07, z + rand(-.05, .05), false)); }
    },
    fruit(g, m) { part(g, GEO.sph, m, .09, .075, .09, 0, 0, 0); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, s = part(g, GEO.lo, STEM, .012, .006, .04, Math.cos(a) * .025, .075, Math.sin(a) * .025); s.rotation.y = -a; } } },
  // Zwiebel: Röhrenlaub, Knollen sitzen halb auf der Erde
  onion: { col: 0xd8a050, leaf: 0x4a8a50, head: 0x5a9a5a, ground: gm(0xd09048, 0xc87828, .6, .5), bush: bm(0xc88a40, .5),
    plant(g, L, H, B, fr) {
      ring(4, a => { const [x, z] = at(a, .26); fr.push(part(g, GEO.sph, B, .09, .075, .09, x, .05, z, false));
        for (let k = 0; k < 3; k++) { const b = rand(0, 7), h = rand(.3, .45), t = part(g, GEO.cyl, L, .018, h, .018, x + Math.cos(b) * .02, .1 + h / 2, z + Math.sin(b) * .02); t.rotation.set(Math.sin(b) * .3, 0, Math.cos(b) * .3); } });
    },
    fruit(g, m) { part(g, GEO.sph, m, .095, .085, .095, 0, 0, 0); part(g, GEO.cone, m, .03, .07, .03, 0, .1, 0); } },
};
