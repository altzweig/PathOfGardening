// Soft contact shadows (look analysis 22.11.2026, instead of screen-space ambient occlusion): a dark, soft round patch on
// the ground under trees, bushes, plants, rocks and farm props, so they sit on the ground. One InstancedMesh of flat quads
// per call (the props make one per 16 m tile, so three.js culls them with the tile). Costs a few draw calls, no extra pass.
import * as THREE from 'three';

let mat: THREE.MeshBasicMaterial | null = null;
function material() {
  if (mat) return mat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(.45, 'rgba(0,0,0,.7)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: .42, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  return mat;
}
const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
export interface Blob { x: number; z: number; r: number; sx?: number }
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
/** builds the patches (not added anywhere); null for an empty list */
export function blobMesh(list: Blob[]): THREE.InstancedMesh | null {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, material(), list.length);
  list.forEach((b, i) => { q.setFromAxisAngle(up, 0); im.setMatrixAt(i, m4.compose(p.set(b.x, .015, b.z), q, s.set(b.r * (b.sx ?? 1), 1, b.r))); });
  im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  im.castShadow = im.receiveShadow = false; im.renderOrder = -1; im.name = 'blobs';
  im.raycast = () => {}; // never picked (world editor)
  return im;
}
