// Erbsenpistole (P2 Werkbank-Paket, 25.11.2026): heavy pistol in a Desert-Eagle outline. Light beech frame + trigger guard,
// checkered walnut grip panels, the slide on top lacquered pea-green, small steel / brass accents (muzzle, sights, hammer,
// pins). A pea peeks out of the bore and out of the ejection port. Built like the weapons in arsenal.ts: +z = aim, y up,
// origin at the top of the grip. Plus the projectile: one big glossy pea (geometry + material shared, fits InstancedMesh).
import * as THREE from 'three';
import { V3, craftKit, lathe, mesh, profile, rbox, sph } from './craftkit';

/** shared projectile pea: unit sphere (scale = radius) + glowing pea material like fruit lying on the ground */
export const PEA_GEO = new THREE.SphereGeometry(1, 18, 14);
export const PEA_MAT = new THREE.MeshStandardMaterial({ color: 0x7cc84a, emissive: 0x3c8a1a, emissiveIntensity: .38, roughness: .32 });
/** pea projectile as an Object3D (for projObj in view.ts): radius r, the little hilum (dark spot) on the back */
export function peaProjectile(r = .09) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(PEA_GEO, PEA_MAT); m.scale.set(r, r * .96, r); g.add(m);
  const spot = new THREE.Mesh(PEA_GEO, HILUM); spot.scale.set(r * .22, r * .12, r * .1); spot.position.set(0, 0, -r * .96); g.add(spot);
  return g;
}
const HILUM = new THREE.MeshStandardMaterial({ color: 0x4a6a22, roughness: .6 });

/** pea in the bore / port: same look as the projectile, smaller */
const PEA_SMALL = PEA_MAT;

export interface PeaPistol {
  /** add this to the player group (position like the other guns, e.g. (.2, .9, .3)) */
  g: THREE.Group;
  /** inner group for recoil (anim.position.z / rotation.x) - hand points are in its space */
  anim: THREE.Group;
  /** the pea-green slide: slide.position.z = -k * .035 for the blow-back on a shot */
  slide: THREE.Group;
  /** the pea shown in the muzzle (hide it for a moment after a shot) */
  loaded: THREE.Object3D;
  /** hand targets in anim space: t0 = shooting hand on the grip (+x hand), t1 = support hand under the front of the grip */
  t0: THREE.Vector3; t1: THREE.Vector3;
  /** muzzle in anim space (projectile spawn / flash) */
  muzzle: THREE.Vector3;
}
/** Erbsenpistole. Size: ~0.42 m long after the built-in scale 1.35 (reads from the game camera like the egg sling). */
export function peaPistol(): PeaPistol {
  const K = craftKit(), g = new THREE.Group(), a = new THREE.Group(); g.add(a);
  // ---- frame (beech): rails under the slide, dust cover to the front, raked grip with a beavertail ----
  mesh(a, profile([[-.128, .004], [.165, .004], [.165, -.026], [-.03, -.028], [-.045, -.04], [-.07, -.16], [-.078, -.168], [-.148, -.168], [-.153, -.16], [-.125, -.04], [-.146, -.02], [-.14, .002]], .032, .005), K.beech);
  // grip panels: checkered walnut, slightly proud of the frame, a brass screw in each
  mesh(a, profile([[-.052, -.048], [-.072, -.148], [-.14, -.148], [-.122, -.048]], .037, .003), K.gripPanel);
  for (const sd of [-1, 1]) { const s = mesh(a, new THREE.CylinderGeometry(.005, .005, .003, 10), K.brass, sd * .0195, -.098, -.096); s.rotation.z = Math.PI / 2; }
  // magazine base pad (walnut) at the bottom of the grip
  mesh(a, profile([[-.08, -.166], [-.146, -.166], [-.15, -.178], [-.076, -.178]], .036, .003), K.walnut);
  // trigger guard: squared front like the Desert Eagle, with a little hook
  mesh(a, profile([[-.032, -.026], [.05, -.026], [.057, -.034], [.055, -.07], [.06, -.076], [.05, -.082], [-.026, -.082], [-.042, -.06]], .024, .004,
    [[[-.022, -.034], [.042, -.034], [.046, -.068], [.038, -.073], [-.018, -.073], [-.028, -.056]]]), K.beech);
  // trigger (steel)
  mesh(a, profile([[.002, -.028], [.011, -.028], [.008, -.048], [-.002, -.064], [-.006, -.061], [.001, -.046]], .008, .0015), K.steel);
  // barrel + muzzle (steel), a pea in the bore
  const by = .03;
  mesh(a, lathe([[.0105, .1], [.0105, .164], [.0135, .166], [.0135, .176], [.0115, .179], [.0075, .179], [.0075, .17]], 22), K.steel, 0, by, 0);
  mesh(a, new THREE.CircleGeometry(.0076, 16), K.soot, 0, by, .171);
  const loaded = mesh(a, sph(12, 10), PEA_SMALL, 0, by, .174, .0085);
  // pins and the takedown lever on the frame (brass)
  for (const sd of [-1, 1]) for (const z of [.09, -.112]) { const p = mesh(a, new THREE.CylinderGeometry(.0028, .0028, .0025, 8), K.brass, sd * .0165, -.012, z); p.rotation.z = Math.PI / 2; }
  mesh(a, rbox(.004, .01, .03, .002), K.steel, -.0175, -.012, .035); // takedown lever (left)
  // ---- slide (pea-green lacquer), separate group for the blow-back ----
  const slide = new THREE.Group(); a.add(slide);
  mesh(slide, profile([[-.13, .004], [.162, .004], [.162, .04], [.15, .056], [-.115, .056], [-.13, .046]], .037, .0055), K.pea);
  for (let i = 0; i < 6; i++) mesh(slide, rbox(.0395, .036, .0035, .0012), K.peaDark, 0, .03, -.118 + i * .0075); // rear serrations
  mesh(slide, rbox(.012, .004, .2, .0015), K.peaDark, 0, .058, .02); // top rib
  mesh(slide, rbox(.024, .011, .012, .002), K.steel, 0, .061, -.11); // rear sight
  mesh(slide, rbox(.0055, .012, .012, .002), K.steel, 0, .061, .145); // front sight
  // ejection port on the right (+x): dark slot, one pea waiting inside
  mesh(slide, rbox(.004, .022, .05, .002), K.soot, .0182, .03, .03);
  mesh(slide, sph(12, 10), PEA_SMALL, .0165, .03, .03, .0095);
  // slide stop (left) + safety / decocker levers at the back (steel)
  mesh(slide, rbox(.004, .008, .045, .002), K.steel, -.0195, .012, -.005);
  for (const sd of [-1, 1]) { const l = mesh(slide, rbox(.006, .006, .02, .002), K.steel, sd * .021, .04, -.108); l.rotation.x = -.25; }
  // hammer (steel) behind the slide, cocked a little
  const hm = mesh(a, profile([[-.006, 0], [.004, 0], [.0, .022], [-.012, .032], [-.016, .028], [-.008, .016]], .012, .002), K.steel, 0, .01, -.132); hm.rotation.x = .15;
  g.scale.setScalar(1.35);
  return { g, anim: a, slide, loaded, t0: V3(0, -.085, -.095), t1: V3(0, -.125, -.06), muzzle: V3(0, by, .18) };
}
