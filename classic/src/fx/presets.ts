// Start presets of the VFX lab. Every value can be edited in vfx.html and exported as JSON.
import { BoltLayer, CrystalLayer, DecalLayer, EffectDef, Layer, LightLayer, ParticleLayer, RingLayer, newLayer } from './schema';

const P = (name: string, o: Partial<ParticleLayer>): Layer => ({ ...(newLayer('particles') as ParticleLayer), name, ...o });
const D = (name: string, o: Partial<DecalLayer>): Layer => ({ ...(newLayer('decal') as DecalLayer), name, ...o });
const B = (name: string, o: Partial<BoltLayer>): Layer => ({ ...(newLayer('bolt') as BoltLayer), name, ...o });
const R = (name: string, o: Partial<RingLayer>): Layer => ({ ...(newLayer('ring') as RingLayer), name, ...o });
const C = (name: string, o: Partial<CrystalLayer>): Layer => ({ ...(newLayer('crystals') as CrystalLayer), name, ...o });
const L = (name: string, o: Partial<LightLayer>): Layer => ({ ...(newLayer('light') as LightLayer), name, ...o });
const E = (id: string, name: string, o: Partial<EffectDef>, layers: Layer[]): EffectDef =>
  ({ id, name, version: 1, mode: 'burst', repeat: 0, offTime: 0, ramp: 0, source: 'spieler', range: 3.5, ...o, layers });

export const PRESETS: EffectDef[] = [
  E('feuer', 'Feuer – Flammenwerfer', { mode: 'loop', repeat: 2.6, offTime: 1.2, ramp: .12, source: 'spieler', range: 3.5 }, [
    P('Flammenzungen', { max: 1400, rate: 130, sprite: 'feuerAlle', shape: 'punkt', radius: .03, height: 0, dir: 'vorne', spread: 46, flat: true, speed: [8.5, 11.5], life: [.38, .55],
      gravity: -1.6, drag: 2.2, turb: 2, turbFreq: 1.5, size: [.28, 1.4], sizeVar: .25, spin: 2,
      colors: [[0, '#fffae6'], [.2, '#ffd659'], [.5, '#ff730d'], [.8, '#ff1f0d'], [1, '#bf0540']], texHeat: 1, intensity: .32, opacity: 1, fadeIn: .08, fadeOut: .45, brightVar: .15 }),
    P('Heißer Kern', { max: 160, rate: 40, sprite: 'feuer', shape: 'punkt', radius: 0, height: 0, dir: 'vorne', spread: 10, flat: true, speed: [3, 5], life: [.12, .18], drag: 5,
      size: [.22, .45], sizeVar: .2, spin: 3, colors: [[0, '#dfe8ff'], [.4, '#fff4c8'], [1, '#ffc040']], texHeat: .5, intensity: .35, opacity: 1, fadeIn: 0, fadeOut: .6, brightVar: .1 }),
    P('Glut', { max: 300, rate: 32, sprite: 'funke', at: 'strahl', along: [.3, 1], shape: 'kugel', radius: .35, height: .5, dir: 'oben', spread: 70, speed: [.5, 2], life: [.8, 1.6],
      gravity: -1.4, drag: .8, turb: 3, turbFreq: 1.8, size: [.06, .02], sizeVar: .4, stretch: .4, colors: [[0, '#fff2b0'], [.4, '#ff8a1a'], [1, '#a01000']], intensity: 3.5, fadeIn: .05, fadeOut: .4, brightVar: .5 }),
    P('Funken', { max: 300, rate: 40, sprite: 'funke', shape: 'punkt', height: 0, dir: 'vorne', spread: 60, speed: [6, 12], life: [.25, .6], gravity: 6, drag: 1,
      size: [.04, .02], sizeVar: .3, stretch: .6, floor: true, colors: [[0, '#ffffff'], [.3, '#ffe080'], [1, '#ff6a10']], intensity: 3, fadeIn: 0, fadeOut: .3, brightVar: .4 }),
    P('Rauch', { max: 400, rate: 14, sprite: 'rauch', blend: 'normal', at: 'strahl', along: [.75, 1.05], shape: 'kugel', radius: .25, height: .9, dir: 'oben', spread: 30, speed: [.6, 1.1], life: [1.1, 1.8],
      gravity: -.4, drag: 1, turb: 1, size: [.6, 2.2], sizeVar: .3, spin: .5, colors: [[0, '#3a1a10'], [.5, '#1e1614'], [1, '#151212']], intensity: 1, opacity: .45, fadeIn: .25, fadeOut: .5, brightVar: .1 }),
    D('Bodenglühen', { style: 'glut', at: 'strahl', along: [.35, 1], rate: 12, count: 0, max: 192, radius: [.35, .6], scatter: .3, life: [6, 9], grow: .1,
      colorA: '#ffd890', colorB: '#ff3a06', intensity: .7, noise: 2.6, pulse: .15 }),
    D('Brandfleck', { style: 'brand', at: 'strahl', along: [.3, 1], rate: 6, count: 0, max: 128, radius: [.4, .7], scatter: .3, life: [10, 14], grow: .3, colorA: '#0d0805', colorB: '#1c120a', opacity: .35, noise: 2.5 }),
    L('Licht', { color: '#ff7a2a', intensity: 14, distance: 8, y: .9, flicker: .35, flickerSpeed: 18 }),
  ]),

  E('blitz', 'Blitz – Zitronenblitz', { mode: 'loop', ramp: 0, source: 'spieler', range: 6 }, [
    B('Kettenblitz', { path: 'kette', count: 3, interval: .45, life: .28, width: .022, rough: .14, branch: .15, depth: 2, twigs: 2, restrike: true, core: '#f2f6ff', halo: '#7f99ff', intensity: 1 }),
    P('Einschlagfunken', { at: 'ziele', max: 200, rate: 0, burst: 18, sprite: 'funke', height: .42, shape: 'punkt', dir: 'zufall', speed: [1.5, 4], life: [.12, .3], gravity: 4,
      size: [.06, .02], stretch: .8, colors: [[0, '#ffffff'], [1, '#a8c0ff']], intensity: 4, fadeIn: 0, fadeOut: .5 }),
    P('Zielglühen', { at: 'ziele', max: 32, rate: 0, burst: 3, sprite: 'glow', height: .42, shape: 'punkt', speed: [0, 0], life: [.18, .22], size: [.8, 1.2], sizeVar: 0,
      colors: [[0, '#c8d8ff'], [1, '#4060ff']], intensity: 1.5, opacity: .6, fadeIn: 0, fadeOut: .8 }),
    P('Zitrone leuchtet', { at: 'quelle', max: 64, rate: 22, sprite: 'glow', height: 0, shape: 'punkt', speed: [0, 0], life: [.15, .25], size: [.3, .4], sizeVar: .2,
      colors: [[0, '#fff8c0'], [1, '#ffe040']], intensity: 1.5, opacity: .7, fadeIn: .2, fadeOut: .6 }),
    R('Bodenring', { at: 'ziele', life: .25, radius: [.1, .5], thick: .08, soft: .6, colorA: '#c8d8ff', colorB: '#5a70ff', intensity: 1.2 }),
    L('Lichtblitz', { at: 'ziele', color: '#a8c0ff', intensity: 20, distance: 7, y: 1.2, life: .2 }),
  ]),

  E('eis', 'Eis – Frostnova', { mode: 'burst', repeat: 3.2, source: 'boden', range: 3 }, [
    C('Eiskristalle', { count: 16, radius: [.4, 2.1], height: [.5, 1.4], width: .22, tilt: 28, grow: .18, hold: 1.4, shatter: .35, color: '#5aa8e8', rim: '#e8fbff', intensity: 1.3, opacity: .85 }),
    D('Frostboden', { style: 'frost', count: 1, radius: [2.6, 2.6], life: [3, 3], grow: .25, colorA: '#f0fbff', colorB: '#5aa8e0', intensity: .8, opacity: .7, noise: 2.5 }),
    R('Schockwelle', { radius: [.2, 3], life: .45, thick: .25, soft: .7, colorA: '#e8fbff', colorB: '#3a8cff', intensity: 1 }),
    P('Kältenebel', { max: 128, rate: 0, burst: 30, sprite: 'rauch', blend: 'normal', shape: 'ring', radius: .6, height: .2, dir: 'aussen', spread: 20, flat: true, speed: [2, 4], drag: 2.5,
      gravity: -.15, life: [1.2, 2], size: [.6, 1.6], spin: .5, colors: [[0, '#e0f4ff'], [1, '#8ab8e0']], opacity: .25, fadeIn: .1, fadeOut: .6 }),
    P('Schneeflocken', { max: 200, rate: 20, emitTime: 1.5, burst: 40, sprite: 'flocke', shape: 'scheibe', radius: 2.5, height: 1.8, dir: 'unten', spread: 40, speed: [.3, .8], life: [1.5, 2.5],
      turb: 1.5, size: [.12, .08], spin: 2, colors: [[0, '#ffffff'], [1, '#bfe6ff']], intensity: 1.2, fadeIn: .15, fadeOut: .3 }),
    P('Glitzer', { delay: .15, max: 128, rate: 0, burst: 30, sprite: 'stern', shape: 'scheibe', radius: 2.2, height: .4, dir: 'oben', spread: 60, speed: [.2, 1], life: [.4, 1],
      size: [.22, 0], colors: [[0, '#ffffff'], [1, '#9fd8ff']], intensity: 3, fadeIn: .1, fadeOut: .3 }),
    P('Eissplitter', { delay: 1.55, max: 128, rate: 0, burst: 40, sprite: 'splitter', shape: 'scheibe', radius: 1.8, height: .5, dir: 'aussen', spread: 60, speed: [1.5, 3.5], gravity: 9,
      floor: true, life: [.6, 1], size: [.18, .12], spin: 8, colors: [[0, '#e8fbff'], [1, '#7fc8ff']], intensity: 1.2, fadeIn: 0, fadeOut: .3 }),
    L('Licht', { color: '#8fd0ff', intensity: 10, distance: 7, y: 1, life: .9 }),
  ]),

  E('gift', 'Gift – Giftwolke', { mode: 'loop', ramp: .4, source: 'boden', range: 3 }, [
    D('Giftpfütze', { style: 'gift', count: 3, rate: .4, max: 16, radius: [1.3, 1.8], scatter: .4, life: [6, 8], grow: .6, colorA: '#a8f030', colorB: '#163208', intensity: .75, opacity: .75, noise: 1.8, pulse: .3 }),
    P('Blasen', { max: 128, rate: 18, sprite: 'blase', shape: 'scheibe', radius: 1.5, height: .05, dir: 'oben', spread: 10, speed: [.2, .6], life: [.6, 1.4], size: [.08, .22],
      colors: [[0, '#d8ff6a'], [1, '#6aff3a']], intensity: 1.5, fadeIn: .2, fadeOut: .2 }),
    P('Giftschwaden', { max: 128, rate: 10, sprite: 'rauch', blend: 'normal', shape: 'scheibe', radius: 1.4, height: .3, dir: 'oben', spread: 40, speed: [.2, .5], life: [2.5, 3.5],
      gravity: -.1, turb: 1, size: [.8, 2.4], spin: .4, colors: [[0, '#4a8a1a'], [1, '#203a0c']], opacity: .45, fadeIn: .3, fadeOut: .5 }),
    P('Leuchtschwaden', { max: 64, rate: 6, sprite: 'rauch', shape: 'scheibe', radius: 1.3, height: .3, dir: 'oben', spread: 40, speed: [.2, .5], life: [2, 3], turb: 1, size: [.8, 2],
      spin: .3, colors: [[0, '#8aff2a'], [1, '#204a00']], intensity: .35, opacity: .4, fadeIn: .3, fadeOut: .5 }),
    P('Giftfunken', { max: 64, rate: 10, sprite: 'stern', shape: 'scheibe', radius: 1.6, height: .5, dir: 'oben', speed: [.3, .8], life: [.6, 1.2], turb: 2, size: [.12, 0],
      colors: [[0, '#efff8a'], [1, '#5aff2a']], intensity: 3 }),
    P('Tropfen an Gegnern', { at: 'ziele', max: 64, rate: 8, sprite: 'glow', shape: 'kugel', radius: .25, height: .9, dir: 'unten', spread: 0, speed: [0, .2], gravity: 6, life: [.4, .6],
      size: [.07, .05], colors: [[0, '#b8ff3a'], [1, '#6ad020']], intensity: 2, fadeIn: .1, fadeOut: .2 }),
    L('Licht', { color: '#7aff3a', intensity: 6, distance: 5, y: .6, flicker: .2, flickerSpeed: 4, fadeIn: .4 }),
  ]),

  E('explosion', 'Explosion – Kohlbombe', { mode: 'burst', repeat: 2.5, source: 'boden', range: 3 }, [
    P('Blitz', { max: 4, rate: 0, burst: 1, sprite: 'glow', height: .6, shape: 'punkt', speed: [0, 0], life: [.1, .1], size: [1.6, 2.4], sizeVar: 0, colors: [[0, '#ffffff'], [1, '#ffd080']],
      intensity: 1.6, fadeIn: 0, fadeOut: .8, brightVar: 0 }),
    P('Feuerball', { max: 64, rate: 0, burst: 26, sprite: 'feuer', shape: 'kugel', radius: .3, height: .5, dir: 'zufall', speed: [2, 4.5], drag: 4, gravity: -1, life: [.35, .7],
      size: [.6, 1.6], spin: 2, colors: [[0, '#fff5c8'], [.25, '#ffc040'], [.55, '#ff5a10'], [.85, '#a01808'], [1, '#3a0806']], texHeat: .7, intensity: .9, fadeIn: 0, fadeOut: .5 }),
    P('Kohlblätter', { max: 64, rate: 0, burst: 26, sprite: 'blatt', blend: 'normal', shape: 'kugel', radius: .2, height: .4, dir: 'oben', spread: 140, speed: [3, 7], gravity: 9, drag: .6,
      floor: true, life: [1.2, 2], size: [.22, .18], spin: 9, colors: [[0, '#b8f070'], [1, '#5a9a30']], intensity: 1, opacity: 1, fadeIn: 0, fadeOut: .25 }),
    P('Rauch', { delay: .05, max: 64, rate: 0, burst: 14, sprite: 'rauch', blend: 'normal', shape: 'kugel', radius: .4, height: .6, dir: 'oben', spread: 120, speed: [.8, 2], drag: 2,
      gravity: -.5, life: [1.4, 2.2], size: [.8, 2.6], spin: .6, colors: [[0, '#4a3a2a'], [1, '#2a2420']], opacity: .5, fadeIn: .1, fadeOut: .6 }),
    P('Funken', { max: 128, rate: 0, burst: 40, sprite: 'funke', shape: 'kugel', radius: .2, height: .4, dir: 'oben', spread: 160, speed: [4, 9], gravity: 8, floor: true, life: [.4, .9],
      size: [.05, .03], stretch: .9, colors: [[0, '#ffffff'], [.3, '#ffe080'], [1, '#ff6a10']], intensity: 4, fadeIn: 0, fadeOut: .3 }),
    R('Schockwelle', { radius: [.2, 2.8], life: .35, thick: .3, colorA: '#fff0c0', colorB: '#ff7a30', intensity: 1 }),
    D('Brandfleck', { style: 'brand', count: 1, radius: [1.6, 1.6], life: [5, 5], grow: .1, colorA: '#0d0805', colorB: '#1c120a', opacity: .6 }),
    D('Glut', { style: 'glut', count: 1, radius: [1.2, 1.2], life: [3, 3], grow: .05, colorA: '#ffe6a0', colorB: '#ff3a06' }),
    L('Licht', { color: '#ffb060', intensity: 22, distance: 9, y: 1.2, life: .5 }),
  ]),

  E('heilung', 'Heilung', { mode: 'burst', repeat: 2, source: 'spieler', range: 2 }, [
    D('Heilkreis', { style: 'heil', count: 1, radius: [1.1, 1.1], life: [2, 2], grow: .25, colorA: '#fff6b0', colorB: '#5aff8a', intensity: 1.2, pulse: .3 }),
    P('Lichter', { max: 128, rate: 30, emitTime: 2, sprite: 'glow', shape: 'scheibe', radius: .9, height: -.85, dir: 'oben', spread: 5, speed: [.6, 1.4], life: [.8, 1.5], turb: .6,
      size: [.14, .04], colors: [[0, '#fffbe0'], [.4, '#7aff9a'], [1, '#2aff6a']], intensity: 2.5 }),
    P('Pluszeichen', { max: 32, rate: 4, emitTime: 2, sprite: 'plus', shape: 'scheibe', radius: .7, height: -.4, dir: 'oben', spread: 0, speed: [.5, .8], life: [1, 1.4], size: [.18, .26],
      colors: [[0, '#c8ffb0'], [1, '#4aff6a']], intensity: 2, fadeIn: .2, fadeOut: .4 }),
    P('Lichtsäule', { max: 64, rate: 15, emitTime: 2, sprite: 'glow', shape: 'scheibe', radius: .5, height: -.8, dir: 'oben', spread: 0, speed: [2, 3], life: [.5, .7], size: [.5, .3],
      stretch: 1, colors: [[0, '#fff8c0'], [1, '#7aff9a']], intensity: 1, opacity: .35 }),
    R('Ring', { count: 2, interval: .25, radius: [.2, 1.3], life: .7, thick: .12, y: 0, colorA: '#fff6b0', colorB: '#5aff8a', intensity: 1.5 }),
    L('Licht', { color: '#9affb0', intensity: 6, distance: 5, y: 1.2, life: 2 }),
  ]),

  E('stun', 'Betäubung', { mode: 'burst', repeat: 3, source: 'ziel', range: 2 }, [
    P('Kreisende Sterne', { at: 'ziele', max: 64, rate: 0, burst: 15, sprite: 'stern', shape: 'ring', radius: .35, height: 1.25, dir: 'oben', spread: 0, speed: [0, 0], orbit: 4,
      life: [2.4, 2.6], size: [.22, .18], sizeVar: .1, local: true, colors: [[0, '#fff6a0'], [1, '#ffd030']], intensity: 2.5, fadeIn: .05, fadeOut: .15 }),
    P('Treffer-Stern', { at: 'ziele', max: 16, rate: 0, burst: 3, sprite: 'stern', shape: 'punkt', height: .8, speed: [0, 0], life: [.2, .2], size: [.3, 1.2], sizeVar: 0,
      colors: [[0, '#ffffff'], [1, '#ffe060']], intensity: 3, fadeIn: 0, fadeOut: .5 }),
    P('Funken', { at: 'ziele', max: 128, rate: 0, burst: 24, sprite: 'funke', shape: 'punkt', height: .8, dir: 'zufall', speed: [2, 4], life: [.2, .35], size: [.05, .02], stretch: .6,
      colors: [[0, '#ffffff'], [1, '#ffd040']], intensity: 3, fadeIn: 0 }),
    R('Ring', { at: 'ziele', radius: [.1, .7], life: .3, thick: .1, colorA: '#fff6a0', colorB: '#ffb020', intensity: 1.3 }),
    L('Licht', { at: 'ziele', color: '#ffe080', intensity: 8, distance: 5, y: 1.2, life: .3 }),
  ]),

  E('wind', 'Blätterwirbel', { mode: 'loop', ramp: .5, source: 'boden', range: 2 }, [
    P('Blätter', { max: 256, rate: 40, sprite: 'blatt', blend: 'normal', shape: 'ring', radius: 1.2, height: .1, dir: 'oben', spread: 20, speed: [1, 2.5], orbit: 3.2, drag: .3, gravity: -.2,
      turb: 1.5, life: [1.5, 2.5], size: [.2, .16], spin: 6, colors: [[0, '#9ad850'], [.6, '#4a8a2a'], [1, '#c8a040']], intensity: 1, opacity: 1, fadeIn: .1, fadeOut: .3 }),
    P('Windstreifen', { max: 128, rate: 30, sprite: 'funke', shape: 'ring', radius: 1.3, height: .3, dir: 'oben', spread: 10, speed: [1.5, 2.5], orbit: 3.5, life: [.5, .9],
      size: [.08, .04], stretch: 1, colors: [[0, '#ffffff'], [1, '#d8ffd0']], intensity: 1, opacity: .4 }),
    P('Staub', { max: 64, rate: 6, sprite: 'rauch', blend: 'normal', shape: 'scheibe', radius: 1.2, height: .1, dir: 'oben', speed: [.2, .5], orbit: 2, life: [1.5, 2], size: [.6, 1.4],
      colors: [[0, '#b8a080'], [1, '#8a7a60']], opacity: .25, fadeIn: .3, fadeOut: .5 }),
    P('Pollen', { max: 64, rate: 12, sprite: 'glow', shape: 'ring', radius: 1, height: .2, dir: 'oben', speed: [.5, 1.4], orbit: 2.8, life: [1, 2], size: [.06, .03],
      colors: [[0, '#fff8b0'], [1, '#fff8b0']], intensity: 2 }),
  ]),
];
