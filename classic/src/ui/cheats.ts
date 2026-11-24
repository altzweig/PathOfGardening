// Cheat-Optionen (24.11.2026, Basti): Optionen / Pause > Cheat-Optionen.
// From the main menu the values are start values for the next solo game; during a solo game they change the running game.
import type { SkillId } from '../config';

/** weapons that can be unlocked (the shotgun is always there) */
export const CHEAT_WEAPONS: SkillId[] = ['asp', 'cab', 'lemon', 'chili', 'flour', 'pan', 'wheat', 'sling'];
export interface Cheats { level: number; wave: number; weapons: SkillId[]; allFields: boolean }
const KEY = 'pog-classic.cheats';
export function loadCheats(): Cheats {
  const d: Cheats = { level: 1, wave: 1, weapons: [], allFields: false };
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...d, ...v, weapons: Array.isArray(v.weapons) ? v.weapons.filter((w: SkillId) => CHEAT_WEAPONS.includes(w)) : [] }; }
  catch { return d; }
}
export function saveCheats(c: Cheats) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ } }
