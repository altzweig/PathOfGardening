// Player appearance (start menu): indices into the option lists of src/view/critters.ts / farmer.ts.
// Since 21.11.2026 the player is an animal on two legs (raccoon, red panda, fox, dog, cat) in bib overalls.
// Saved in localStorage, sent to the host in co-op and shared with all players via the lobby.

export interface Look {
  name: string;
  animal: number;   // 0 raccoon, 1 red panda, 2 fox, 3 dog, 4 cat
  fur: number;      // fur variant of that animal (5 each)
  eyes: number;     // eye colour
  outfit: number;   // overalls colour
  hat: number;      // 0 none, 1 straw hat, 2 cap, 3 bobble hat, 4 bucket hat, 5 flat cap
  hatCol: number;   // hat colour
  glasses: number;  // 0 none, 1 round, 2 square, 3 sunglasses
  glassCol: number; // frame colour
  earring: number;  // 0 none, 1 studs, 2 hoop, 3 several rings
  pierce: number;   // 0 none, 1 nose ring, 2 brow
  metal: number;    // jewellery metal
}
export const LOOK_COUNT = { animal: 5, fur: 5, eyes: 5, outfit: 6, hat: 6, hatCol: 6, glasses: 4, glassCol: 4, earring: 4, pierce: 3, metal: 3 } as const;
export type LookKey = keyof typeof LOOK_COUNT;
const KEY = 'pog.look';

export const FIRST = ['Krümelchen', 'Flocke', 'Schnuffel', 'Minka', 'Fridolin', 'Wuschel', 'Tatze', 'Zottel', 'Henriette', 'Pumuckel', 'Söckchen', 'Bommel', 'Fussel', 'Liselotte', 'Ottilia', 'Nelke', 'Brösel', 'Kringel', 'Frieda', 'Nugget', 'Rosi', 'Strolch', 'Wolle', 'Muffin', 'Trudi', 'Pelle', 'Klecks'];
export const LAST = ['Buddelmann', 'Möhrenbiss', 'Schnüffler', 'Pfotenhauer', 'von Kompost', 'Rübenbauer', 'Fellgruber', 'Kratzmeier', 'von Wedelingen', 'Beerenklau', 'Rotpelz', 'Stolzpfotens', 'Zausel', 'Gießgut', 'Krallwitz', 'Ackerbohne', 'Schnauzinger', 'Zaunkönig', 'Matschpfote', 'Dachsbart', 'Heubödler', 'Löwenzahn', 'Schlappohr', 'Samtpfote', 'Distelfink', 'Waldwicht', 'Mäusezahn', 'Kletterhoch', 'Saubermach', 'Muffelbart', 'Flinkwicht'];
const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const ri = (n: number) => Math.floor(Math.random() * n);

/** name = first name + surname (Basti's lists, 21.11.2026); both can be rolled or picked in the start menu */
export const NAME_MAX = 28;
export function randomName() { return pick(FIRST) + ' ' + pick(LAST); }
export function randomLook(): Look {
  const o = Math.random();
  return {
    name: randomName(), animal: ri(5), fur: ri(5), eyes: ri(5), outfit: ri(LOOK_COUNT.outfit),
    hat: Math.random() < .65 ? 1 + ri(5) : 0, hatCol: ri(LOOK_COUNT.hatCol),
    glasses: Math.random() < .3 ? 1 + ri(3) : 0, glassCol: ri(LOOK_COUNT.glassCol),
    earring: o < .45 ? 0 : 1 + ri(3), pierce: Math.random() < .2 ? 1 + ri(2) : 0, metal: ri(LOOK_COUNT.metal),
  };
}
const clampI = (v: unknown, n: number, d = 0) => { const x = Math.floor(Number(v)); return x >= 0 && x < n ? x : d; };
/** sanitise anything (localStorage, network, older saves) into a valid look; old human looks become a random animal */
export function cleanLook(o: any): Look {
  const d = o && typeof o === 'object' ? o : {};
  const fresh = d.animal === undefined ? randomLook() : null;
  const g = (k: LookKey) => fresh ? fresh[k] : clampI(d[k], LOOK_COUNT[k]);
  return {
    name: typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, NAME_MAX) : randomName(),
    animal: g('animal'), fur: g('fur'), eyes: g('eyes'), outfit: g('outfit'), hat: g('hat'), hatCol: g('hatCol'),
    glasses: g('glasses'), glassCol: g('glassCol'), earring: g('earring'), pierce: g('pierce'), metal: g('metal'),
  };
}
export function loadLook(): Look {
  try { const s = localStorage.getItem(KEY); if (s) return cleanLook(JSON.parse(s)); } catch { /* ignore */ }
  return randomLook();
}
export function saveLook(l: Look) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } }
export const lookKey = (l: Look) => JSON.stringify(l);
