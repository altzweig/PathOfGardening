// Control sensitivity (Basti 22.11.2026): sliders on the controls page, kept per device in localStorage.
// Factors around 1 = the balancing values. PC: mouse (camera turn). Phone: stick (how far the thumb goes for full speed),
// pinch zoom, camera follow speed.
export type SensKey = 'mouse' | 'stick' | 'zoom' | 'cam';
export const SENS: Record<SensKey, number> = { mouse: 1, stick: 1, zoom: 1, cam: 1 };
const KEY = 'pog-sens';
try { const s = JSON.parse(localStorage.getItem(KEY) ?? '{}'); for (const k of Object.keys(SENS) as SensKey[]) if (Number.isFinite(s[k])) SENS[k] = Math.min(3, Math.max(.25, s[k])); } catch { /* defaults */ }
export function setSens(k: SensKey, v: number) { SENS[k] = v; try { localStorage.setItem(KEY, JSON.stringify(SENS)); } catch { /* private mode */ } }
/** slider position 0..100 <-> factor 0.25..3 (1 in the middle, logarithmic) */
const toPos = (v: number) => Math.round(50 + 50 * Math.log(v) / Math.log(v < 1 ? 4 : 3));
const toVal = (p: number) => p < 50 ? Math.pow(4, (p - 50) / 50) : Math.pow(3, (p - 50) / 50);
const ROWS: Record<'pc' | 'mobile', [SensKey, string, string][]> = {
  pc: [['mouse', 'Maus', 'M']],
  mobile: [['stick', 'Joystick', 'J'], ['zoom', 'Zoom', 'Z'], ['cam', 'Kamera', 'K']],
};
/** the slider rows under the controls picture */
export function sensRows(el: HTMLElement, tab: 'pc' | 'mobile') {
  el.innerHTML = ROWS[tab].map(([k, l]) => `<label class="sens"><span>${l}</span><input type="range" min="0" max="100" step="1" data-k="${k}" value="${toPos(SENS[k])}"><b>${SENS[k].toFixed(1)}×</b></label>`).join('');
  el.querySelectorAll<HTMLInputElement>('input').forEach(i => i.addEventListener('input', () => {
    let v = toVal(+i.value); if (Math.abs(v - 1) < .06) { v = 1; i.value = '50'; } // snaps to the default
    setSens(i.dataset.k as SensKey, v); (i.nextElementSibling as HTMLElement).textContent = v.toFixed(1) + '×';
  }));
}
