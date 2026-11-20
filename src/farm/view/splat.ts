// Splatmap of the farm ground (texture concept 20.11.2026): one RGBA texel per ~33 cm, each channel = weight of one terrain
// layer over the grass base (grass_01). Built from the hof layout at start; the world editor can paint it (paint/fill/load).
//   r = moos (moss_ground_02)   g = feld (ground_02)   b = pfad (ground_06)   a = pflaster (cobblestone_01)
// Dry grass (grass_04) is not painted: it comes from noise on the lawn. The shader frays every border with noise.
import * as THREE from 'three';

export const SPLAT_CHANNELS = ['moos', 'feld', 'pfad', 'pflaster'] as const;
export type SplatChannel = typeof SPLAT_CHANNELS[number];

export class SplatMap {
  readonly data: Uint8Array;
  readonly tex: THREE.DataTexture;
  /** world (m) covered by the map, centred on 0,0; size = texels per side */
  constructor(readonly world: number, readonly size = 512) {
    this.data = new Uint8Array(size * size * 4);
    this.tex = new THREE.DataTexture(this.data, size, size, THREE.RGBAFormat);
    this.tex.colorSpace = THREE.NoColorSpace; this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
  }
  /** texel of a world point (row 0 = +z edge, matches the plane's UVs) */
  texel(x: number, z: number) { return { c: (x / this.world + .5) * this.size, r: (.5 - z / this.world) * this.size }; }
  /** copies the red channel of a canvas painted in "top-down" coordinates (canvas row 0 = -z edge) into one channel */
  fromCanvas(ch: SplatChannel, cv: HTMLCanvasElement) {
    const k = SPLAT_CHANNELS.indexOf(ch), S = this.size, g = cv.getContext('2d')!, src = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let r = 0; r < S; r++) {
      const sy = Math.min(cv.height - 1, Math.floor((S - r - .5) / S * cv.height));
      for (let c = 0; c < S; c++) { const sx = Math.floor((c + .5) / S * cv.width); this.data[(r * S + c) * 4 + k] = src[(sy * cv.width + sx) * 4]; }
    }
    this.tex.needsUpdate = true;
  }
  /** soft round brush: amount 0..1 adds weight, negative removes it; hard 0 = soft falloff .. 1 = hard edge */
  paint(ch: SplatChannel, x: number, z: number, radius: number, amount: number, hard = .3) {
    const k = SPLAT_CHANNELS.indexOf(ch), S = this.size, { c, r } = this.texel(x, z), rp = radius / this.world * S;
    for (let y = Math.max(0, Math.floor(r - rp)); y <= Math.min(S - 1, Math.ceil(r + rp)); y++)
      for (let xx = Math.max(0, Math.floor(c - rp)); xx <= Math.min(S - 1, Math.ceil(c + rp)); xx++) {
        const d = Math.hypot(xx - c, y - r) / rp; if (d >= 1) continue;
        const f = d < hard ? 1 : 1 - (d - hard) / (1 - hard), i = (y * S + xx) * 4 + k;
        this.data[i] = Math.max(0, Math.min(255, this.data[i] + amount * f * 255));
      }
    this.tex.needsUpdate = true;
  }
  /** whole channel to one value (0..1) */
  fill(ch: SplatChannel, v: number) { const k = SPLAT_CHANNELS.indexOf(ch); for (let i = k; i < this.data.length; i += 4) this.data[i] = v * 255; this.tex.needsUpdate = true; }
  /** weight (0..1) of a channel at a world point */
  get(ch: SplatChannel, x: number, z: number) { const { c, r } = this.texel(x, z), S = this.size; return this.data[(Math.min(S - 1, Math.max(0, Math.floor(r))) * S + Math.min(S - 1, Math.max(0, Math.floor(c)))) * 4 + SPLAT_CHANNELS.indexOf(ch)] / 255; }
  /** raw RGBA (to save a painted map) and back */
  save() { return this.data.slice(); }
  load(d: Uint8Array) { if (d.length === this.data.length) { this.data.set(d); this.tex.needsUpdate = true; } }
}
