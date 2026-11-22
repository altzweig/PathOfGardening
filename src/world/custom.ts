// Farm props built in code for the world editor: fence segment (2 m, like the pens), post, round hay bale, log pile, lantern.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hasModel, registerModel } from '../view/nature';
import { lanternParts } from '../farm/view/lanterns';

const wood = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: .85, flatShading: true });
const darkWood = new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: .9, flatShading: true });
const straw = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, map: strawTex() });
/** pressed straw: fine light and dark stalks, wound around the bale */
function strawTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d')!;
  g.fillStyle = '#cfae5a'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * 128, y = Math.random() * 128, l = 6 + Math.random() * 18, v = Math.random();
    g.strokeStyle = v < .5 ? `rgba(120,90,30,${.25 + v * .4})` : `rgba(250,232,160,${.2 + (v - .5) * .6})`; g.lineWidth = .8 + Math.random();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + l, y + (Math.random() - .5) * 3); g.stroke();
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
}
const cut = new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: .9, flatShading: true });

function boxAt(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); return g;
}
function log(r: number, l: number, x: number, y: number, z: number, seg = 7) {
  const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateZ(Math.PI / 2); g.translate(x, y, z); return g.toNonIndexed();
}
const merge = (list: THREE.BufferGeometry[]) => { const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)); g.computeVertexNormals(); g.computeBoundingSphere(); return g; };

export function registerCustomModels() {
  if (hasModel('Zaun')) return;
  // fence: 3 posts, 2 rails along x (2 m)
  registerModel('Zaun', [{ geo: merge([-1, 0, 1].map(x => boxAt(.1, .9, .1, x, .45, 0)).concat([.35, .75].map(y => boxAt(2.04, .06, .05, 0, y, 0)))), mat: 'custom', vc: false, m: wood }]);
  registerModel('Zaun_Pfosten', [{ geo: merge([boxAt(.12, 1, .12, 0, .5, 0)]), mat: 'custom', vc: false, m: darkWood }]);
  // round hay bale lying on its side
  const bale = new THREE.CylinderGeometry(.6, .6, 1.1, 16, 1); bale.rotateZ(Math.PI / 2); bale.translate(0, .6, 0);
  registerModel('Heuballen', [{ geo: merge([bale]), mat: 'custom', vc: false, m: straw }]);
  // log pile: 4-3-2 logs, cut faces lighter
  const logs: THREE.BufferGeometry[] = [], ends: THREE.BufferGeometry[] = [];
  [4, 3, 2].forEach((n, row) => { for (let i = 0; i < n; i++) {
    const z = (i - (n - 1) / 2) * .25, y = .12 + row * .21;
    logs.push(log(.12, 1.5, 0, y, z));
    for (const sx of [-1, 1]) { const e = new THREE.CylinderGeometry(.1, .1, .02, 7); e.rotateZ(Math.PI / 2); e.translate(sx * .755, y, z); ends.push(e.toNonIndexed()); }
  } });
  // old-fashioned lantern (22.11.2026): stands at the entrances of the farm, glows at night (farm/view/lanterns.ts)
  registerModel('Laterne', lanternParts());
  registerModel('Holzstapel', [{ geo: merge(logs), mat: 'custom', vc: false, m: darkWood }, { geo: merge(ends), mat: 'custom', vc: false, m: cut }]);
}
