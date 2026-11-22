// Free line of sight camera -> farmer (Basti 21.11.2026): whatever stands in between (trees, bushes, roofs, fences)
// is faded out softly, as good third person games do. Done in the shaders of the world materials (no sorting problems
// with instanced props): fragments inside a soft cylinder around the line camera -> player, in front of the player,
// are dissolved with a fine screen-space dither (a cone camera -> player, i.e. a round spot around the farmer on screen). A thin ghost stays, so one still sees what is there. Shadows stay.
import * as THREE from 'three';

export const occU = {
  uOccCam: { value: new THREE.Vector3() },
  uOccPly: { value: new THREE.Vector3() },
  /** x = inner radius (fully faded), y = outer radius (untouched), m */
  uOccR: { value: new THREE.Vector2(1.2, 2.8) },
  /** 0..1, eased in/out (off in the menu and in cutscenes) */
  uOccOn: { value: 0 },
  /** how much of a covering mesh goes at most (rest = ghost) */
  uOccMax: { value: .88 },
};

const VERT_HEAD = 'varying vec3 vOccW;\n';
const VERT = `
#ifdef USE_INSTANCING
  vOccW = (modelMatrix * instanceMatrix * vec4(transformed, 1.)).xyz;
#else
  vOccW = (modelMatrix * vec4(transformed, 1.)).xyz;
#endif
#include <project_vertex>`;
const FRAG_HEAD = 'varying vec3 vOccW;\nuniform vec3 uOccCam, uOccPly;\nuniform vec2 uOccR;\nuniform float uOccOn, uOccMax;\n';
const FRAG = `#include <clipping_planes_fragment>
if (uOccOn > .001) {
  vec3 sg = uOccPly - uOccCam; float L = length(sg); vec3 dir = sg / max(L, 1e-3);
  vec3 q = vOccW - uOccCam; float t = dot(q, dir);
  // a cone from the camera to the player (= a round spot on the screen), radius measured at the player's distance;
  // it ends softly just in front of the player, low stuff (grass, beds) stays
  float r = length(q - dir * t) / max(t, .1) * L;
  float k = (1. - smoothstep(uOccR.x, uOccR.y, r)) * smoothstep(.3, 1.3, L - t) * step(0., t) * smoothstep(.35, .95, vOccW.y);
  k *= uOccOn * uOccMax;
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  if (k > n) discard;
}`;

const done = new WeakSet<THREE.Material>();
/** adds the fade to one material (keeps its own shader tweaks) */
export function occlude(m: THREE.Material) {
  if (done.has(m)) return; done.add(m);
  const any = m as THREE.Material & { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshBasicMaterial?: boolean };
  if (!(any.isMeshStandardMaterial || any.isMeshLambertMaterial || any.isMeshPhongMaterial || any.isMeshBasicMaterial)) return;
  const prev = m.onBeforeCompile.bind(m), prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    Object.assign(sh.uniforms, occU);
    sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <project_vertex>', VERT);
    sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('#include <clipping_planes_fragment>', FRAG);
  };
  m.customProgramCacheKey = () => prevKey() + '|occ';
  m.needsUpdate = true;
}
/** all meshes below these roots (call again when new things were added; cheap for known materials) */
export function occludeTree(...roots: (THREE.Object3D | null | undefined)[]) {
  for (const root of roots) root?.traverse(o => {
    const mm = (o as THREE.Mesh).material; if (!mm || (o as THREE.Sprite).isSprite) return;
    if (Array.isArray(mm)) mm.forEach(occlude); else occlude(mm);
  });
}
/** per frame: camera, player (chest height) and whether it is on at all */
export function updateOcclusion(cam: THREE.Vector3, px: number, pz: number, on: boolean, dt: number, r?: [number, number]) {
  if (r) occU.uOccR.value.set(r[0], r[1]);
  occU.uOccCam.value.copy(cam); occU.uOccPly.value.set(px, 1, pz);
  const u = occU.uOccOn; u.value += ((on ? 1 : 0) - u.value) * (1 - Math.exp(-dt * 6));
}
