// ladebalken.html: every animated progress bar at once, looping (developer page, not linked from the game)
import YAML from 'yaml';
import { BarCanvas, BarInput } from './actbar';
import { sceneFor } from './barScenes';
import { initAudio, setSoundConfig, sfx } from '../../audio';

interface Demo { name: string; kind: string; v: string; n: number; dur: number; per?: number; cap?: number; fill0?: number; need?: string[] }
const CROPS: [string, string, number][] = [['wheat', 'Weizen', 5], ['carrot', 'Karotte', 1], ['potato', 'Kartoffel', 3], ['onion', 'Zwiebel', 1], ['garlic', 'Knoblauch', 1], ['pea', 'Erbsen', 5], ['celery', 'Sellerie', 1], ['cab', 'Kohl', 1], ['radish', 'Radieschen', 2], ['bean', 'Bohnen', 3], ['leek', 'Lauch', 1], ['strawb', 'Erdbeeren', 3], ['lettuce', 'Salat', 1], ['corn', 'Mais', 1], ['pepper', 'Paprika', 1], ['tomato', 'Tomate', 1], ['zucchini', 'Zucchini', 1], ['eggplant', 'Aubergine', 1], ['asp', 'Spargel', 1], ['pumpkin', 'Kürbis', 1], ['melon', 'Melone', 1], ['chili', 'Chili', 3], ['rhubarb', 'Rhabarber', 1], ['fennel', 'Fenchel', 1]];
const DEMOS: Demo[] = [
  { name: 'Kanne füllen (Brunnen)', kind: 'refill', v: '', n: 3, dur: 1, cap: 6, fill0: 0 },
  { name: 'Gießen', kind: 'water', v: '', n: 1, dur: 2, cap: 6, fill0: 4 },
  { name: 'Wasser schöpfen (Fass)', kind: 'draw', v: '', n: 4, dur: 1.5, cap: 10, fill0: 3 },
  { name: 'Säen', kind: 'sow', v: 'wheat', n: 1, dur: 2 },
  { name: 'Jäten (Feld)', kind: 'weed', v: '', n: 3, dur: 1 },
  { name: 'Jäten (Wildkräuter)', kind: 'weedHof', v: 'hof', n: 1, dur: 1 },
  { name: 'Reparieren', kind: 'repair', v: '', n: 1, dur: 10 },
  { name: 'Düngen', kind: 'fertilize', v: '', n: 1, dur: 1.5 },
  ...CROPS.map(([v, name, per]) => ({ name: 'Ernten: ' + name, kind: 'harvestPlot', v, n: 3, dur: 1.33, per })),
  { name: 'Blaubeeren', kind: 'harvestBush', v: 'blue', n: 3, dur: 1.33 },
  { name: 'Brombeeren', kind: 'pickWild', v: 'bramble', n: 3, dur: 1.33 },
  { name: 'Apfelbaum schütteln', kind: 'shake', v: 'apple', n: 3, dur: 1.33, per: 2 },
  { name: 'Nussbaum schütteln', kind: 'shake', v: 'nut', n: 3, dur: 1.33, per: 3 },
  { name: 'Pilze sammeln', kind: 'gather', v: 'mushroom', n: 3, dur: 1.33 },
  { name: 'Brennholz sammeln', kind: 'gather', v: 'wood', n: 1, dur: 1.33 },
  { name: 'Steine sammeln', kind: 'gather', v: 'stone', n: 1, dur: 1.33 },
  { name: 'Füttern (Kühe)', kind: 'feed', v: 'cows', n: 1, dur: 2 },
  { name: 'Füttern (Hühner)', kind: 'feed', v: 'chickens', n: 1, dur: 2 },
  { name: 'Stroh auslegen', kind: 'straw', v: '', n: 1, dur: 2 },
  { name: 'Melken', kind: 'milk', v: '', n: 1, dur: 3 },
  { name: 'Eier sammeln', kind: 'eggs', v: 'egg', n: 1, dur: 2 },
  { name: 'Mahlen', kind: 'produce', v: 'mill', n: 1, dur: 3 },
  { name: 'Entsaften', kind: 'produce', v: 'juicer', n: 1, dur: 3, need: ['blue'] },
  { name: 'Backen', kind: 'produce', v: 'bakery', n: 1, dur: 4 },
  { name: 'Käse machen', kind: 'produce', v: 'dairy', n: 1, dur: 3 },
  { name: 'Kochen', kind: 'produce', v: 'house', n: 1, dur: 3, need: ['mushroom'] },
];
const only = new URLSearchParams(location.search).get('only');
const list = only ? DEMOS.filter(d => only.split(',').some(o => d.kind === o || d.v === o)) : DEMOS;
const GAP = .5, HOLD = 1, CW = +(new URLSearchParams(location.search).get('w') ?? 232);
(document.getElementById('g')!).style.gridTemplateColumns = `repeat(auto-fill,minmax(${CW + 12}px,1fr))`;
const items = list.map((d, i) => {
  const wrap = document.createElement('div'); wrap.className = 'c'; const c = new BarCanvas(); c.size(CW);
  const lab = document.createElement('span'); lab.textContent = d.name; wrap.append(c.el, lab); document.getElementById('g')!.appendChild(wrap);
  return { d, c, hits: new Map<string, number>(), seed: i + 1, t0: performance.now() / 1000 + i * .13 };
});
let soundOn = false;
document.getElementById('snd')!.onclick = async () => { initAudio(); soundOn = !soundOn; (document.getElementById('snd')!).textContent = soundOn ? 'Ton aus' : 'Ton an'; setSoundConfig(YAML.parse(await (await fetch('./design/sounds.yaml')).text())); };
function frame() {
  const now = performance.now() / 1000;
  for (const it of items) {
    const d = it.d, cycle = d.n * d.dur + (d.n - 1) * GAP + HOLD;
    let lt = now - it.t0; if (lt < 0) lt = 0; if (lt >= cycle) { it.t0 += cycle * Math.floor(lt / cycle); lt = now - it.t0; it.hits.clear(); it.seed++; }
    const slot = d.dur + GAP, step = Math.min(d.n, Math.floor(lt / slot)), inStep = lt - step * slot;
    let f = 0, done = step;
    if (step < d.n) { if (inStep <= d.dur) f = inStep / d.dur; else { done = step + 1; f = 0; } }
    const k = Math.min(1, (done + f) / d.n);
    const inp: BarInput = { kind: d.kind, v: d.v, k, step: done, f, n: d.n, per: d.per, need: d.need };
    if (d.kind === 'refill') { inp.cap = 6; inp.fill = Math.min(1, ((d.fill0 ?? 0) + 2 * (done + f)) / 6); }
    if (d.kind === 'water') { inp.cap = 6; inp.fill = Math.max(0, ((d.fill0 ?? 4) - k) / 6); }
    if (d.kind === 'draw') { inp.cap = 10; inp.fill = Math.min(1, ((d.fill0 ?? 0) + done + f) / 10); }
    it.c.draw(sceneFor(d.kind, d.v), inp, lt, it.seed, it.hits, s => { if (soundOn) sfx('bar.' + s); });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
