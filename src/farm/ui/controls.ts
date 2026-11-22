// Visual controls page (options, the only place outside the tutorial that shows input). PC and mobile.
import { ic } from './ficons';

const GOLD = '#e3b964', TXT = '#efe3c8', MUT = '#a59a86';
const key = (x: number, y: number, w: number, h: number, l: string, fs = 28) =>
  `<g><rect x="${x}" y="${y + 5}" width="${w}" height="${h}" rx="10" fill="#0a0d10"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#2b3540" stroke="${GOLD}" stroke-width="3"/>
   <text x="${x + w / 2}" y="${y + h / 2 + fs * .36}" text-anchor="middle" font-size="${fs}" fill="${TXT}">${l}</text></g>`;
const label = (x: number, y: number, t: string, anchor = 'middle', size = 30, col = GOLD) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${col}">${t}</text>`;
const icon = (svg: string, x: number, y: number, s: number) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${s}" height="${s}" `);
/** curved double arrow: turn the camera */
const turn = (x: number, y: number, s: number) => `<g transform="translate(${x} ${y}) scale(${s / 100})" fill="none" stroke="${TXT}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
  <path d="M-40 10 A44 22 0 0 0 40 10"/><path d="M-52 -6 L-40 10 L-22 4"/><path d="M52 -6 L40 10 L22 4"/></g>`;
const tools = (x: number, y: number, s: number) => ['can', 'handrake', 'seed', 'hands', 'sickle'].map((t, i) => icon(ic(t), x + i * (s + 8), y, s)).join('');

export function pcControls() {
  return `<svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
  ${key(150, 60, 80, 80, 'W')}${key(60, 150, 80, 80, 'A')}${key(150, 150, 80, 80, 'S')}${key(240, 150, 80, 80, 'D')}
  ${label(190, 280, 'Laufen')}
  ${key(60, 318, 90, 60, 'Esc', 24)}${label(170, 358, 'Pause', 'start')}
  ${key(300, 318, 60, 60, 'B')}${icon(ic('book'), 372, 322, 52)}${label(432, 358, 'Buch', 'start')}
  ${key(300, 393, 80, 60, 'Tab', 24)}${icon(ic('seed'), 392, 397, 52)}${label(452, 433, 'Saatgut', 'start')}
  ${key(60, 393, 90, 60, 'E')}${label(170, 433, 'Arbeiten', 'start')}
  ${key(60, 468, 210, 60, 'Leertaste', 24)}${label(290, 508, 'Kämpfen', 'start')}
  <g transform="translate(560 90)">
    <rect x="0" y="0" width="150" height="230" rx="75" fill="#1a2027" stroke="#3a4550" stroke-width="3"/>
    <path d="M75 0 V95 M0 95 H150" stroke="#3a4550" stroke-width="3"/>
    <path d="M4 92 V75 A71 71 0 0 1 75 4 V92 Z" fill="#ffffff" opacity=".7"/>
    <path d="M146 92 V75 A71 71 0 0 0 75 4 V92 Z" fill="${GOLD}" opacity=".9"/>
    <rect x="66" y="30" width="18" height="40" rx="9" fill="#2b3540" stroke="#3a4550" stroke-width="2"/>
  </g>
  <path d="M560 140 H470" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>
  ${label(470, 70, 'Arbeiten', 'end')}${label(462, 150, 'halten: weiter', 'end', 22, TXT)}
  ${tools(282, 88, 32)}
  <path d="M710 140 H780" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>
  ${icon(ic('rake'), 826, 96, 64)}
  ${label(860, 200, 'Kämpfen')}
  <path d="M635 90 V50" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>${label(635, 38, 'Mausrad: Zoom')}
  <path d="M710 250 H780" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>${turn(840, 240, 70)}${label(860, 300, 'Maus bewegen', 'middle', 24, TXT)}${label(860, 330, 'Kamera drehen', 'middle', 28)}
</svg>`;
}

export function mobileControls() {
  return `<svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="30" width="960" height="500" rx="54" fill="#0b1016" stroke="#3a4550" stroke-width="6"/>
  <rect x="44" y="54" width="912" height="452" rx="34" fill="#10161c"/>
  <rect x="60" y="70" width="380" height="420" rx="26" fill="${GOLD}" opacity=".07" stroke="${GOLD}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="10 8"/>
  <circle cx="200" cy="330" r="74" fill="#0b1016aa" stroke="${GOLD}" stroke-opacity=".5" stroke-width="3"/>
  <circle cx="232" cy="306" r="32" fill="${GOLD}"/>
  ${label(250, 150, 'Laufen', 'middle', 34)}
  <rect x="830" y="150" width="60" height="330" rx="30" fill="#0b1016" stroke="#3a4550" stroke-width="3"/>
  <g transform="translate(860 190)"><circle r="30" fill="#161d24" stroke="#ff8a70" stroke-width="4"/>${icon(ic('rake'), -20, -20, 40)}</g>
  <g transform="translate(860 440)"><circle r="30" fill="#161d24" stroke="${GOLD}" stroke-width="4"/>${icon(ic('hands'), -20, -20, 40)}</g>
  <g transform="translate(860 315)"><circle r="58" fill="#1d252d" stroke="${GOLD}" stroke-width="5"/>${icon(ic('hands'), -34, -34, 68)}</g>
  <path d="M910 290 V215 M898 228 L910 214 L922 228" stroke="#ff8a70" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M910 340 V415 M898 402 L910 416 L922 402" stroke="${GOLD}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  ${label(800, 200, 'Kämpfen', 'end', 28)}${label(800, 450, 'Arbeiten', 'end', 28)}${label(800, 480, 'halten: weiter', 'end', 20, TXT)}
  ${tools(500, 452, 28)}
  <g transform="translate(690 355)"><rect x="-80" y="-28" width="160" height="56" rx="28" fill="#1d252d" stroke="${GOLD}" stroke-width="4"/>${icon(ic('wheat'), -72, -20, 40)}${label(18, 10, 'Weizen', 'middle', 24, TXT)}</g>
  ${label(690, 312, 'Saatgut', 'middle', 26)}${label(690, 402, 'tippen: weiter · halten: Liste', 'middle', 18, TXT)}
  <g transform="translate(480 200)"><circle r="30" fill="none" stroke="#fff2c0" stroke-width="4" stroke-dasharray="7 6"/><circle r="9" fill="${TXT}"/></g>
  ${label(480, 260, 'Tippen', 'middle', 24, TXT)}
  <g transform="translate(640 160)" fill="none" stroke="${TXT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="-24" cy="24" r="15" fill="${TXT}" fill-opacity=".25"/><circle cx="24" cy="-24" r="15" fill="${TXT}" fill-opacity=".25"/>
    <path d="M-44 44 L-64 64 M-64 46 V64 H-46"/><path d="M44 -44 L64 -64 M46 -64 H64 V-46"/></g>
  ${label(640, 255, 'Zoom', 'middle', 24, TXT)}
  <g transform="translate(872 104)"><rect x="-30" y="-30" width="60" height="60" rx="14" fill="#161d24" stroke="${GOLD}" stroke-width="3"/>${icon(ic('book'), -24, -24, 48)}</g>
  ${label(800, 114, 'Buch', 'end', 28)}
</svg>`;
}
