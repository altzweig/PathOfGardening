// Visual controls page (the only place in the game that explains input).
import { fruitIcon, skillIcon } from './icons';

const GOLD = '#e3b964', TXT = '#efe3c8', MUT = '#a59a86';
const key = (x: number, y: number, w: number, h: number, label: string, hot = true, fs = 28) =>
  `<g><rect x="${x}" y="${y + 5}" width="${w}" height="${h}" rx="10" fill="#0a0d10"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${hot ? '#2b3540' : '#1a2027'}" stroke="${hot ? GOLD : '#3a4550'}" stroke-width="3"/>
   <text x="${x + w / 2}" y="${y + h / 2 + fs * .36}" text-anchor="middle" font-size="${fs}" fill="${hot ? TXT : MUT}">${label}</text></g>`;
const label = (x: number, y: number, t: string, anchor = 'middle', size = 30, col = GOLD) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${col}">${t}</text>`;
const icon = (svg: string, x: number, y: number, s: number) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${s}" height="${s}" `);
const arrow = (x1: number, y1: number, x2: number, y2: number) => `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>`;

export function pcControls() {
  return `<svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
  <!-- WASD -->
  ${key(150, 70, 80, 80, 'W')}${key(60, 160, 80, 80, 'A')}${key(150, 160, 80, 80, 'S')}${key(240, 160, 80, 80, 'D')}
  ${label(190, 290, 'Laufen')}
  <!-- Esc -->
  ${key(40, 360, 90, 70, 'Esc', true, 24)}${label(150, 405, 'Pause', 'start')}
  <!-- Space: shoot -->
  ${key(330, 400, 330, 70, 'Leertaste', true, 26)}
  ${label(495, 510, 'Schießen')}
  ${label(495, 540, 'tippen = 1 Schuss · halten = Dauerfeuer', 'middle', 22, MUT)}
  <!-- Tab: next weapon -->
  ${key(400, 210, 120, 70, 'Tab', true, 26)}${label(460, 310, 'Waffe wechseln')}
  ${icon(skillIcon('blue'), 380, 130, 46)}<text x="432" y="162" font-size="28" fill="${MUT}">›</text>
  ${icon(skillIcon('asp'), 445, 130, 46)}<text x="497" y="162" font-size="28" fill="${MUT}">›</text>
  ${icon(skillIcon('wheat'), 510, 130, 46)}
  <!-- Shift: sprint (24.11.2026) -->
  ${key(570, 210, 140, 70, 'Shift', true, 26)}${label(655, 310, 'Sprinten')}
  <!-- Q: shotgun berry -->
  ${key(40, 460, 80, 70, 'Q', true, 28)}${label(135, 505, 'Beere', 'start', 26)}
  ${icon(fruitIcon('blue'), 215, 470, 40)}${icon(fruitIcon('black'), 255, 470, 40)}${icon(fruitIcon('cran'), 295, 470, 40)}
  <!-- mouse -->
  <g transform="translate(760 70)">
    <rect x="0" y="0" width="150" height="230" rx="75" fill="#1a2027" stroke="#3a4550" stroke-width="3"/>
    <path d="M75 0 V95 M0 95 H150" stroke="#3a4550" stroke-width="3"/>
    <path d="M4 92 V75 A71 71 0 0 1 75 4 V92 Z" fill="${GOLD}" opacity=".85"/>
    <rect x="66" y="30" width="18" height="40" rx="9" fill="#2b3540" stroke="#3a4550" stroke-width="2"/>
  </g>
  ${arrow(760, 120, 700, 120)}
  ${label(690, 112, 'Ernten', 'end')}
  ${icon(skillIcon('rake'), 600, 128, 44)}
  ${arrow(835, 95, 835, 40)}${label(835, 30, 'Mausrad: Zoom')}
  <g transform="translate(835 340)">
    <circle r="40" fill="none" stroke="${GOLD}" stroke-width="3" stroke-dasharray="7 6"/>
    <path d="M-8 -8 L22 4 L8 8 L4 22 Z" fill="${TXT}"/>
  </g>
  ${label(835, 420, 'Zielen')}
</svg>`;
}

export function mobileControls() {
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
