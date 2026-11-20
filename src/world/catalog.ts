// What the world editor can place: every model of the Nature MegaKit (Quaternius, CC0) plus a few built in code
// (fence, post, hay bale). Default size, size range, height offset, lean, tint family, shadow and collision per model.
export type Cat = 'Bäume' | 'Büsche' | 'Pflanzen' | 'Gras' | 'Blumen' | 'Pilze' | 'Steine' | 'Hof';
export const CATS: Cat[] = ['Bäume', 'Büsche', 'Pflanzen', 'Gras', 'Blumen', 'Pilze', 'Steine', 'Hof'];

/** tint family (h, s, l ranges); null = wood/stone: only a brightness variation (shade) */
type Hsl = [[number, number], [number, number], [number, number]];
export interface ModelDef {
  m: string; label: string; cat: Cat;
  /** default scale and random factor range when placing */
  s: number; vary: [number, number];
  y?: number; tilt?: number; shadow?: boolean;
  /** collision radius in model units (x scale) - only on the farm itself (not in the forest ring) */
  solid?: number;
  /** box collision (fence): half length, half depth in model units */
  wall?: [number, number];
  tint: Hsl | null; shade?: [number, number];
  /** the scale the wind of the leaves was tuned for (trees) */
  wind?: number;
}

const leafCommon: Hsl = [[.22, .3], [.5, .65], [.34, .42]];
const pine: Hsl = [[.22, .3], [.3, .45], [.62, .78]];
const twisted: Hsl = [[.2, .28], [.5, .65], [.36, .44]];
const bush: Hsl = [[.25, .33], [.5, .62], [.3, .38]];
const fern: Hsl = [[.25, .35], [.35, .5], [.55, .68]];
const grass: Hsl = [[.2, .3], [.35, .5], [.58, .7]];
const clover: Hsl = [[.24, .32], [.4, .4], [.6, .7]];
const flower: Hsl = [[.08, .15], [.3, .3], [.95, .95]];
const stone: [number, number] = [1.3, 1.65];   // the pack's rock texture is dark: lighter on the farm

const D: ModelDef[] = [];
const add = (m: string, label: string, cat: Cat, o: Partial<ModelDef> & { s: number }) => D.push({ m, label, cat, vary: [.85, 1.15], tint: null, ...o });
for (const i of [1, 3, 5]) add('CommonTree_' + i, 'Laubbaum ' + i, 'Bäume', { s: .7, vary: [.8, 1.25], y: -.1, shadow: true, solid: .55, tint: leafCommon, shade: [.8, 1.05], wind: .7 });
for (const i of [1, 2, 4, 5]) add('Pine_' + i, 'Tanne ' + i, 'Bäume', { s: .8, vary: [.8, 1.25], y: -.1, shadow: true, solid: .45, tint: pine, shade: [.8, 1.05], wind: .8 });
for (const i of [1, 2, 3, 4, 5]) add('TwistedTree_' + i, 'Knorriger Baum ' + i, 'Bäume', { s: .4, vary: [.8, 1.25], y: -.1, shadow: true, solid: 1.2, tint: twisted, shade: [.8, 1.05], wind: .4 });
for (const i of [1, 2, 3, 4, 5]) add('DeadTree_' + i, 'Toter Baum ' + i, 'Bäume', { s: .45, vary: [.8, 1.2], y: -.1, shadow: true, solid: .8, tint: null, shade: [.8, 1.05], wind: .45 });
add('Bush_Common', 'Busch', 'Büsche', { s: .85, vary: [.75, 1.3], shadow: true, tint: bush });
add('Bush_Common_Flowers', 'Blühender Busch', 'Büsche', { s: .85, vary: [.75, 1.3], shadow: true, tint: bush });
add('Plant_1_Big', 'Große Staude', 'Büsche', { s: .4, vary: [.8, 1.2], shadow: true, tint: fern });
add('Fern_1', 'Farn', 'Pflanzen', { s: .25, vary: [.75, 1.2], tilt: .25, tint: fern });
add('Plant_1', 'Staude', 'Pflanzen', { s: .45, vary: [.8, 1.2], tint: fern });
add('Plant_7', 'Blattrosette', 'Pflanzen', { s: .6, vary: [.8, 1.2], tint: fern });
add('Plant_7_Big', 'Große Rosette', 'Pflanzen', { s: .6, vary: [.8, 1.2], tint: fern });
add('Clover_1', 'Klee', 'Pflanzen', { s: .38, vary: [.8, 1.2], tint: clover });
add('Clover_2', 'Klee dicht', 'Pflanzen', { s: .38, vary: [.8, 1.2], tint: clover });
add('Grass_Common_Short', 'Gras kurz', 'Gras', { s: .45, vary: [.75, 1.2], tint: grass });
add('Grass_Common_Tall', 'Gras hoch', 'Gras', { s: .45, vary: [.75, 1.2], tint: grass });
add('Grass_Wispy_Short', 'Wildgras kurz', 'Gras', { s: .6, vary: [.75, 1.25], tint: grass });
add('Grass_Wispy_Tall', 'Wildgras hoch', 'Gras', { s: .65, vary: [.75, 1.25], tint: grass });
add('Flower_3_Group', 'Blumen weiß', 'Blumen', { s: .28, vary: [.8, 1.2], tint: flower });
add('Flower_4_Group', 'Blumen gelb', 'Blumen', { s: .28, vary: [.8, 1.2], tint: flower });
add('Flower_3_Single', 'Blume weiß', 'Blumen', { s: .28, vary: [.8, 1.2], tint: flower });
add('Flower_4_Single', 'Blume gelb', 'Blumen', { s: .28, vary: [.8, 1.2], tint: flower });
for (const i of [1, 2, 3, 4, 5]) add('Petal_' + i, 'Blüten ' + i, 'Blumen', { s: .8, vary: [.8, 1.2], tint: flower });
add('Mushroom_Common', 'Pilze', 'Pilze', { s: .5, vary: [.8, 1.2], tint: null, shade: [1, 1] });
add('Mushroom_Laetiporus', 'Baumpilz', 'Pilze', { s: .4, vary: [.8, 1.2], tint: null, shade: [1, 1] });
for (const i of [1, 2, 3]) add('Rock_Medium_' + i, 'Fels ' + i, 'Steine', { s: .6, vary: [.65, 1.35], y: -.12, tilt: .3, shadow: true, solid: 1.2, tint: null, shade: stone });
for (const i of [1, 2, 3, 4, 5]) add('Pebble_Round_' + i, 'Kiesel ' + i, 'Steine', { s: .85, vary: [.7, 1.3], y: -.02, tilt: .3, tint: null, shade: [.85, 1.1] });
for (const i of [1, 2, 3]) add('RockPath_Round_Small_' + i, 'Trittstein ' + i, 'Steine', { s: .9, vary: [.85, 1.15], y: -.03, tint: null, shade: stone });
add('Zaun', 'Zaun', 'Hof', { s: 1, vary: [1, 1], shadow: true, wall: [1, .08], tint: null, shade: [.85, 1.05] });
add('Zaun_Pfosten', 'Pfosten', 'Hof', { s: 1, vary: [.9, 1.1], shadow: true, solid: .1, tint: null, shade: [.85, 1.05] });
add('Heuballen', 'Heuballen', 'Hof', { s: .75, vary: [.9, 1.1], shadow: true, solid: .6, tint: null, shade: [.9, 1.05] });
add('Holzstapel', 'Holzstapel', 'Hof', { s: 1, vary: [.9, 1.1], shadow: true, wall: [.8, .4], tint: null, shade: [.85, 1.05] });

export const MODELS = D;
export const MODEL = new Map(D.map(d => [d.m, d]));
