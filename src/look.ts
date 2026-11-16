// Player appearance (character editor): indices into the option lists of src/view/farmer.ts.
// Saved in localStorage, sent to the host in co-op and shared with all players via the lobby.

export const HATS = ['sun', 'straw', 'top', 'cap'] as const; // sun hat with bow, straw hat, top hat, flat cap
export type Hat = typeof HATS[number] | '';

export interface Look {
  name: string;
  face: number; body: number; hair: number; hairCol: number; skin: number; eyes: number;
  shirt: number; pants: number;
  stache: boolean; pierce: boolean; tattoo: boolean; band: boolean;
  hat: Hat;
}

export const LOOK_N = 5; // 5 options per category
const KEY = 'pog.look';

const FIRST = ['Toni', 'Kim', 'Sascha', 'Robin', 'Alex', 'Kai', 'Charlie', 'Jo', 'Luca', 'Mika', 'Nicki', 'Sam', 'Uli', 'Chris', 'Andi', 'Maxi', 'Flo', 'Kiki', 'Bo', 'Jule', 'Rike', 'Fritzi', 'Hanni', 'Pepe', 'Lou', 'Wenzel', 'Ronja', 'Mats'];
const LAST = ['Klee', 'Rübe', 'Lauch', 'Distel', 'Krume', 'Furche', 'Hafer', 'Kohl', 'Moos', 'Senf', 'Dinkel', 'Raps', 'Kresse', 'Quitte', 'Sauerampfer', 'Kümmel', 'Schnittlauch', 'Mohn', 'Holunder', 'Rhabarber'];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const ri = (n = LOOK_N) => Math.floor(Math.random() * n);

export function randomName() {
  for (let i = 0; i < 20; i++) { const n = pick(FIRST) + ' ' + pick(LAST); if (n.length <= 16) return n; }
  return pick(FIRST);
}
export function randomLook(keepName?: string): Look {
  const hat: Hat = Math.random() < .55 ? pick(HATS) : '';
  return {
    name: keepName ?? randomName(),
    face: ri(), body: ri(), hair: ri(), hairCol: ri(), skin: ri(), eyes: ri(), shirt: ri(), pants: ri(),
    stache: Math.random() < .25, pierce: Math.random() < .15, tattoo: Math.random() < .15,
    band: !hat && Math.random() < .2, hat,
  };
}
const clampI = (v: unknown) => { const n = Math.floor(Number(v)); return n >= 0 && n < LOOK_N ? n : 0; };
/** sanitise anything (localStorage, network) into a valid look */
export function cleanLook(o: any): Look {
  const d = o && typeof o === 'object' ? o : {};
  const hat: Hat = (HATS as readonly string[]).includes(d.hat) ? d.hat : '';
  return {
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 16) : 'Gärtner',
    face: clampI(d.face), body: clampI(d.body), hair: clampI(d.hair), hairCol: clampI(d.hairCol), skin: clampI(d.skin), eyes: clampI(d.eyes),
    shirt: clampI(d.shirt), pants: clampI(d.pants),
    stache: !!d.stache, pierce: !!d.pierce, tattoo: !!d.tattoo, band: !!d.band && !hat, hat,
  };
}
export function loadLook(): Look {
  try { const s = localStorage.getItem(KEY); if (s) return cleanLook(JSON.parse(s)); } catch { /* ignore */ }
  return randomLook();
}
export function saveLook(l: Look) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } }
export const lookKey = (l: Look) => JSON.stringify(l);
