// Visual controls page (the only place in the game that explains input).
import { fruitIcon, skillIcon } from './icons';
import { Act, SLOT_ACTS, keyLabel, keys } from '../input/keys';

const GOLD = '#e3b964', TXT = '#efe3c8', MUT = '#a59a86';
const key = (x: number, y: number, w: number, h: number, label: string, hot = true, fs = 28) =>
  `<g><rect x="${x}" y="${y + 5}" width="${w}" height="${h}" rx="10" fill="#0a0d10"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${hot ? '#2b3540' : '#1a2027'}" stroke="${hot ? GOLD : '#3a4550'}" stroke-width="3"/>
   <text x="${x + w / 2}" y="${y + h / 2 + fs * .36}" text-anchor="middle" font-size="${fs}" fill="${hot ? TXT : MUT}">${label}</text></g>`;
const label = (x: number, y: number, t: string, anchor = 'middle', size = 30, col = GOLD) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${col}">${t}</text>`;
const icon = (svg: string, x: number, y: number, s: number) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${s}" height="${s}" `);
const arrow = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>`;

/** a key the player can change (24.11.2026): click it on the controls page, then press the new key */
const kc = (x: number, y: number, a: Act, minW = 70, h = 64, anchor: 'start' | 'middle' = 'start') => {
  const t = keyLabel(keys[a]), fs = t.length > 4 ? 22 : 28, w = Math.max(minW, t.length * fs * .62 + 30), x0 = anchor === 'middle' ? x - w / 2 : x;
  return `<g class="kbind" data-act="${a}" style="cursor:pointer">${key(x0, y, w, h, t, true, fs)}<rect class="kwait" x="${x0 - 4}" y="${y - 4}" width="${w + 8}" height="${h + 13}" rx="13" fill="none" stroke="#fff" stroke-width="3" opacity="0"/></g>`;
};
const mouseSvg = (x: number, y: number, s: number, side: 'l' | 'r' | '') => `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="0" y="0" width="150" height="230" rx="75" fill="#1a2027" stroke="#3a4550" stroke-width="3"/>
    <path d="M75 0 V95 M0 95 H150" stroke="#3a4550" stroke-width="3"/>
    ${side === 'l' ? `<path d="M4 92 V75 A71 71 0 0 1 75 4 V92 Z" fill="${GOLD}" opacity=".9"/>` : ''}
    ${side === 'r' ? `<path d="M146 92 V75 A71 71 0 0 0 75 4 V92 Z" fill="${GOLD}" opacity=".9"/>` : ''}
    <rect x="66" y="30" width="18" height="40" rx="9" fill="#2b3540" stroke="#3a4550" stroke-width="2"/></g>`;

export function pcControls() {
  // weapon bar: 2 groups of 5 slots, the key of each slot under it
  const S = 58, G = 10, gx = [120, 560];
  const PRIM = ['blue', 'asp', 'wheat', 'chili', 'lemon'], SEC = ['cab', 'flour', 'sling', 'pan', 'cran'];
  let bar = '';
  for (let g = 0; g < 2; g++) for (let k = 0; k < 5; k++) {
    const x = gx[g] + k * (S + G), w = (g ? SEC : PRIM)[k], sel = k === 0;
    bar += `<rect x="${x}" y="70" width="${S}" height="${S}" rx="7" fill="#10161c" stroke="${sel ? GOLD : '#8a8f96'}" stroke-width="${sel ? 4 : 1.5}"/>${icon(skillIcon(w), x + 7, 77, S - 14)}`;
    bar += kc(x + S / 2, 140, SLOT_ACTS[g * 5 + k], 50, 50, 'middle');
  }
  return `<svg viewBox="0 0 1000 710" xmlns="http://www.w3.org/2000/svg">
  <!-- weapon bar -->
  ${mouseSvg(56, 72, .3, 'l')}${mouseSvg(908, 72, .3, 'r')}
  ${bar}
  ${label(gx[0] + (5 * S + 4 * G) / 2, 40, 'Primärwaffe · Linksklick', 'middle', 24)}
  ${label(gx[1] + (5 * S + 4 * G) / 2, 40, 'Sekundärwaffe · Rechtsklick', 'middle', 24)}
  <!-- Q / E: next weapon of a group -->
  ${kc(gx[0] + (5 * S + 4 * G) / 2, 214, 'nextP', 64, 56, 'middle')}${label(gx[0] + (5 * S + 4 * G) / 2, 300, 'nächste Primärwaffe', 'middle', 22, TXT)}
  ${kc(gx[1] + (5 * S + 4 * G) / 2, 214, 'nextS', 64, 56, 'middle')}${label(gx[1] + (5 * S + 4 * G) / 2, 300, 'nächste Sekundärwaffe', 'middle', 22, TXT)}
  <!-- WASD -->
  ${kc(150, 350, 'up')}${kc(60, 424, 'left')}${kc(150, 424, 'down')}${kc(240, 424, 'right')}
  ${label(190, 528, 'Laufen')}
  <!-- Space: harvest -->
  ${kc(500, 440, 'harvest', 300, 64, 'middle')}
  ${icon(skillIcon('rake'), 400, 362, 54)}${label(470, 400, 'Ernten', 'start')}
  ${label(500, 540, 'halten = weiter ernten', 'middle', 20, MUT)}
  <!-- R: shotgun berry -->
  ${kc(40, 562, 'berry', 64, 56)}${label(118, 600, 'Beere', 'start', 24)}
  ${icon(fruitIcon('blue'), 190, 570, 36)}${icon(fruitIcon('black'), 226, 570, 36)}${icon(fruitIcon('cran'), 262, 570, 36)}
  <!-- Alt: show keys on the bar -->
  ${kc(360, 562, 'keys', 80, 56)}${label(460, 600, 'Tasten zeigen', 'start', 24)}
  <!-- Shift: sprint (24.11.2026) -->
  ${kc(40, 636, 'sprint', 110, 56)}${label(170, 674, 'Sprinten', 'start', 24)}
  <!-- Esc -->
  ${key(360, 636, 80, 56, 'Esc', true, 22)}${label(460, 674, 'Pause', 'start', 24)}
  <!-- mouse: aim + zoom -->
  ${mouseSvg(800, 350, .62, '')}
  ${label(846, 530, 'Mausrad: Zoom', 'middle', 22)}
  <g transform="translate(940 420)">
    <circle r="30" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="7 6"/>
    <path d="M-6 -6 L17 3 L6 6 L3 17 Z" fill="${TXT}"/>
  </g>
  ${label(940, 480, 'Zielen', 'middle', 22)}
</svg>`;
}

export function mobileControls() {
  if (innerHeight > innerWidth) return mobilePortrait(); // 25.11.2026: phone held upright -> upright drawing, big enough to read
  return `<svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="30" width="960" height="500" rx="54" fill="#0b1016" stroke="#3a4550" stroke-width="6"/>
  <rect x="44" y="54" width="912" height="452" rx="34" fill="#10161c"/>
  <!-- left half: move -->
  <rect x="60" y="70" width="380" height="420" rx="26" fill="${GOLD}" opacity=".07" stroke="${GOLD}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="10 8"/>
  <circle cx="200" cy="330" r="74" fill="#0b1016aa" stroke="${GOLD}" stroke-opacity=".5" stroke-width="3"/>
  <circle cx="232" cy="306" r="32" fill="${GOLD}"/>
  ${label(250, 150, 'Laufen', 'middle', 34)}
  ${label(250, 188, 'Daumen irgendwo links', 'middle', 22, MUT)}
  <!-- right side: attack, shoot (active weapon), switch weapon (24.11.2026) -->
  <g transform="translate(870 420)">
    <circle r="58" fill="#1d252d" stroke="${GOLD}" stroke-width="4"/>${icon(skillIcon('rake'), -36, -36, 72)}
  </g>
  ${label(870, 512, 'Ernten', 'middle', 24)}
  <g transform="translate(720 430)"><circle r="48" fill="#1d252d" stroke="#ff4d5e" stroke-width="4"/>${icon(skillIcon('blue'), -32, -32, 64)}
    <circle cx="40" cy="-40" r="17" fill="#0b1016" stroke="${GOLD}" stroke-width="2"/>${icon(fruitIcon('black'), 27, -53, 26)}</g>
  ${label(720, 512, 'Schießen', 'middle', 24)}
  ${label(560, 410, 'tippen = 1 Schuss', 'end', 20, TXT)}
  ${label(560, 438, 'halten = Dauerfeuer', 'end', 20, TXT)}
  ${label(560, 466, 'ziehen = zielen', 'end', 20, TXT)}
  ${label(720, 345, 'Beere', 'middle', 20, MUT)}<path d="M745 352 q14 8 14 22" stroke="${MUT}" stroke-width="2" stroke-dasharray="5 5" fill="none"/>
  <g transform="translate(870 290)"><circle r="34" fill="#1d252d" stroke="${GOLD}" stroke-width="3"/>
    <g transform="translate(-20 -20) scale(1.67)"><path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="${TXT}" stroke-width="2.4" stroke-linecap="round"/><path d="M18.8 2.6v4.6h-4.6M5.2 21.4v-4.6h4.6" fill="none" stroke="${TXT}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></g>
  ${label(870, 228, 'Waffe wechseln', 'middle', 24)}
  ${icon(skillIcon('blue'), 740, 130, 40)}<text x="786" y="158" font-size="26" fill="${MUT}">›</text>
  ${icon(skillIcon('asp'), 800, 130, 40)}<text x="846" y="158" font-size="26" fill="${MUT}">›</text>
  ${icon(skillIcon('wheat'), 860, 130, 40)}
</svg>`;
}

/** the same controls on a phone held upright (layout like the game in portrait: buttons bottom right, thumb left) */
function mobilePortrait() {
  const cyc = `<path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" fill="none" stroke="${TXT}" stroke-width="2.4" stroke-linecap="round"/><path d="M18.8 2.6v4.6h-4.6M5.2 21.4v-4.6h4.6" fill="none" stroke="${TXT}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 600 1000" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="560" height="960" rx="54" fill="#0b1016" stroke="#3a4550" stroke-width="6"/>
  <rect x="44" y="44" width="512" height="912" rx="34" fill="#10161c"/>
  <!-- shooting hints -->
  ${label(300, 140, 'Schießen', 'middle', 40)}
  ${label(300, 200, 'tippen = 1 Schuss', 'middle', 32, TXT)}
  ${label(300, 246, 'halten = Dauerfeuer', 'middle', 32, TXT)}
  ${label(300, 292, 'ziehen = zielen', 'middle', 32, TXT)}
  ${icon(skillIcon('blue'), 190, 340, 56)}<text x="256" y="380" font-size="34" fill="${MUT}">›</text>
  ${icon(skillIcon('asp'), 272, 340, 56)}<text x="338" y="380" font-size="34" fill="${MUT}">›</text>
  ${icon(skillIcon('wheat'), 354, 340, 56)}
  <!-- left: move -->
  <rect x="60" y="470" width="250" height="330" rx="26" fill="${GOLD}" opacity=".07" stroke="${GOLD}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="10 8"/>
  ${label(185, 530, 'Laufen', 'middle', 38)}
  ${label(185, 570, 'Daumen', 'middle', 26, MUT)}
  ${label(185, 600, 'irgendwo links', 'middle', 26, MUT)}
  <circle cx="185" cy="700" r="70" fill="#0b1016aa" stroke="${GOLD}" stroke-opacity=".5" stroke-width="3"/>
  <circle cx="215" cy="678" r="30" fill="${GOLD}"/>
  <!-- right: switch weapon, shoot, harvest -->
  ${label(540, 560, 'Waffe wechseln', 'end', 28)}
  <g transform="translate(480 640)"><circle r="40" fill="#1d252d" stroke="${GOLD}" stroke-width="3"/><g transform="translate(-24 -24) scale(2)">${cyc}</g></g>
  ${label(370, 790, 'Beere', 'middle', 24, MUT)}
  <g transform="translate(370 870)"><circle r="54" fill="#1d252d" stroke="#ff4d5e" stroke-width="4"/>${icon(skillIcon('blue'), -36, -36, 72)}
    <circle cx="44" cy="-44" r="19" fill="#0b1016" stroke="${GOLD}" stroke-width="2"/>${icon(fruitIcon('black'), 30, -58, 28)}</g>
  ${label(370, 950, 'Schießen', 'middle', 28)}
  <g transform="translate(490 800)"><circle r="56" fill="#1d252d" stroke="${GOLD}" stroke-width="4"/>${icon(skillIcon('rake'), -36, -36, 72)}</g>
  ${label(490, 885, 'Ernten', 'middle', 28)}
</svg>`;
}
