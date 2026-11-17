// Player appearance (start menu): indices into the option lists of src/view/farmer.ts.
// Saved in localStorage, sent to the host in co-op and shared with all players via the lobby.

export interface Look {
  name: string;
  hair: number;    // 0 Pippi braids, 1 bob, 2 tonsure, 3 afro
  hairCol: number; // 0 red, 1 black, 2 light blond
  skin: number;    // 0 dark brown, 1 light brown, 2 almost white
  outfit: number;  // 0 blue overalls + pink shirt, 1 black + white-red, 2 green + light green-yellow
}
export const LOOK_COUNT = { hair: 4, hairCol: 3, skin: 3, outfit: 3 } as const;
const KEY = 'pog.look';

const FIRST = ['Toni', 'Kim', 'Sascha', 'Robin', 'Alex', 'Kai', 'Charlie', 'Jo', 'Luca', 'Mika', 'Nicki', 'Sam', 'Uli', 'Chris', 'Andi', 'Maxi', 'Flo', 'Kiki', 'Bo', 'Jule', 'Rike', 'Fritzi', 'Hanni', 'Pepe', 'Lou', 'Wenzel', 'Ronja', 'Mats'];
const LAST = ['Klee', 'Rübe', 'Lauch', 'Distel', 'Krume', 'Furche', 'Hafer', 'Kohl', 'Moos', 'Senf', 'Dinkel', 'Raps', 'Kresse', 'Quitte', 'Kümmel', 'Mohn', 'Holunder', 'Rhabarber'];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const ri = (n: number) => Math.floor(Math.random() * n);

export function randomName() {
  for (let i = 0; i < 20; i++) { const n = pick(FIRST) + ' ' + pick(LAST); if (n.length <= 16) return n; }
  return pick(FIRST);
}
export function randomLook(): Look {
  return { name: randomName(), hair: ri(LOOK_COUNT.hair), hairCol: ri(LOOK_COUNT.hairCol), skin: ri(LOOK_COUNT.skin), outfit: ri(LOOK_COUNT.outfit) };
}
const clampI = (v: unknown, n: number) => { const x = Math.floor(Number(v)); return x >= 0 && x < n ? x : 0; };
/** sanitise anything (localStorage, network, older saves) into a valid look */
export function cleanLook(o: any): Look {
  const d = o && typeof o === 'object' ? o : {};
  return {
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 16) : randomName(),
    hair: clampI(d.hair, LOOK_COUNT.hair), hairCol: clampI(d.hairCol, LOOK_COUNT.hairCol),
    skin: clampI(d.skin, LOOK_COUNT.skin), outfit: clampI(d.outfit, LOOK_COUNT.outfit),
  };
}
export function loadLook(): Look {
  try { const s = localStorage.getItem(KEY); if (s) return cleanLook(JSON.parse(s)); } catch { /* ignore */ }
  return randomLook();
}
export function saveLook(l: Look) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } }
export const lookKey = (l: Look) => JSON.stringify([l.name, l.hair, l.hairCol, l.skin, l.outfit]);
