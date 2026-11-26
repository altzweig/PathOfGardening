// PC key bindings (24.11.2026 Basti): every action has one key, changeable on the controls page, saved in localStorage.
export type Act = 'up' | 'down' | 'left' | 'right' | 'harvest' | 'sprint' | 'nextP' | 'nextS' | 'berry' | 'keys' | 'cheat' | 'tree'
  | 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 's8' | 's9' | 's10';
export const SLOT_ACTS: Act[] = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10'];
export const DEFAULT_KEYS: Record<Act, string> = {
  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
  harvest: 'Space', sprint: 'ShiftLeft', nextP: 'KeyQ', nextS: 'KeyE', berry: 'KeyR', keys: 'AltLeft', cheat: 'KeyT', tree: 'KeyF', // 25.11.2026 tree: Techtree (Forschung) auf/zu
  s1: 'Digit1', s2: 'Digit2', s3: 'Digit3', s4: 'Digit4', s5: 'Digit5', s6: 'Digit6', s7: 'Digit7', s8: 'Digit8', s9: 'Digit9', s10: 'Digit0',
};
const LS = 'pog-classic.keys';

function load(): Record<Act, string> {
  const k = { ...DEFAULT_KEYS };
  try { const s = JSON.parse(localStorage.getItem(LS) || '{}'); for (const a in s) if (a in k && typeof s[a] === 'string') k[a as Act] = s[a]; } catch { /* no storage */ }
  return k;
}
export const keys = load();
/** key code -> action (Alt left/right both count for the Alt binding, same for Shift / Ctrl) */
export function actOf(code: string): Act | null {
  for (const a in keys) if (same(keys[a as Act], code)) return a as Act;
  return null;
}
const same = (a: string, b: string) => a === b || (a.replace(/(Left|Right)$/, '') === b.replace(/(Left|Right)$/, '') && /^(Alt|Shift|Control|Meta)/.test(a));
/** binds a key; a key that was already bound elsewhere swaps over to the old key of this action */
export function bind(a: Act, code: string) {
  const other = actOf(code);
  if (other && other !== a) keys[other] = keys[a];
  keys[a] = code; save();
}
export function resetKeys() { Object.assign(keys, DEFAULT_KEYS); save(); }
function save() { try { localStorage.setItem(LS, JSON.stringify(keys)); } catch { /* no storage */ } }

/** short label for a key code (shown on the bar and on the controls page) */
let layout: Map<string, string> | null = null; // real key caps (QWERTZ: KeyY shows Z), Chrome / Edge only
try { (navigator as any).keyboard?.getLayoutMap?.().then((m: Map<string, string>) => { layout = m; }).catch(() => {}); } catch { /* not supported */ }
export function keyLabel(code: string): string {
  const l = layout?.get(code); if (l && l.trim() && /^(Key|Digit)/.test(code)) return l.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  const M: Record<string, string> = { Space: 'Leertaste', AltLeft: 'Alt', AltRight: 'AltGr', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Strg', ControlRight: 'Strg',
    Tab: 'Tab', CapsLock: 'Caps', Enter: 'Enter', Backspace: '⌫', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '^', Minus: 'ß', Equal: '´',
    BracketLeft: 'Ü', BracketRight: '+', Semicolon: 'Ö', Quote: 'Ä', Backslash: '#', Comma: ',', Period: '.', Slash: '-', IntlBackslash: '<' };
  return M[code] ?? code;
}
