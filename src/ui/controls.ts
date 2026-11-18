// Visual controls page (the only place in the game that explains input).
import { skillIcon } from './icons';

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
  <!-- Space -->
  ${key(330, 400, 330, 70, 'Leertaste', true, 26)}
  ${label(495, 510, 'Waffe wechseln')}
  ${icon(skillIcon('rake'), 318, 320, 52)}<text x="376" y="355" font-size="30" fill="${MUT}">›</text>
  ${icon(skillIcon('can'), 392, 320, 52)}<text x="450" y="355" font-size="30" fill="${MUT}">›</text>
  ${icon(skillIcon('asp'), 466, 320, 52)}<text x="524" y="355" font-size="30" fill="${MUT}">›</text>
  ${icon(skillIcon('cran'), 540, 320, 52)}<text x="598" y="355" font-size="30" fill="${MUT}">›</text>
  ${icon(skillIcon('cab'), 614, 320, 52)}
  <!-- mouse -->
  <g transform="translate(760 70)">
    <rect x="0" y="0" width="150" height="230" rx="75" fill="#1a2027" stroke="#3a4550" stroke-width="3"/>
    <path d="M75 0 V95 M0 95 H150" stroke="#3a4550" stroke-width="3"/>
    <path d="M4 92 V75 A71 71 0 0 1 75 4 V92 Z" fill="${GOLD}" opacity=".85"/>
    <rect x="66" y="30" width="18" height="40" rx="9" fill="#2b3540" stroke="#3a4550" stroke-width="2"/>
  </g>
  ${arrow(760, 120, 700, 120)}
  ${label(690, 112, 'Angriff', 'end')}
  ${label(690, 146, '(halten = Dauerfeuer)', 'end', 22, MUT)}
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
  <!-- right side: drag = aim rake -->
  ${label(600, 150, 'Wischen', 'middle', 30)}
  ${label(600, 186, 'Harke zielen', 'middle', 22, MUT)}
  <path d="M560 250 q40 -30 90 -10" stroke="${TXT}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M650 240 l-14 -10 l2 16 z" fill="${TXT}"/>
  <!-- buttons -->
  <g transform="translate(870 420)">
    <circle r="58" fill="#1d252d" stroke="${GOLD}" stroke-width="4"/>${icon(skillIcon('rake'), -36, -36, 72)}
  </g>
  <g transform="translate(735 445)"><circle r="40" fill="#1d252d" stroke="#8fe36a" stroke-width="4"/>${icon(skillIcon('asp'), -26, -26, 52)}</g>
  <g transform="translate(760 330)"><circle r="40" fill="#1d252d" stroke="#ff4d5e" stroke-width="4"/>${icon(skillIcon('cran'), -26, -26, 52)}</g>
  <g transform="translate(880 300)"><circle r="36" fill="#1d252d" stroke="#7fd0ff" stroke-width="4"/>${icon(skillIcon('can'), -24, -24, 48)}</g>
  <g transform="translate(790 225)"><circle r="40" fill="#1d252d" stroke="#b8f070" stroke-width="4"/>${icon(skillIcon('cab'), -26, -26, 52)}</g>
  ${label(935, 128, 'Tippen = automatisch zielen', 'end', 22, TXT)}
  ${label(935, 100, 'Halten + ziehen = zielen', 'end', 22, TXT)}
</svg>`;
}
