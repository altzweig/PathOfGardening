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
const tools = (x: number, y: number, s: number) => ['can', 'rake', 'seed', 'hands', 'sickle'].map((t, i) => icon(ic(t), x + i * (s + 8), y, s)).join('');

export function pcControls() {
  return `<svg viewBox="0 0 1000 560" xmlns="http://www.w3.org/2000/svg">
  ${key(150, 60, 80, 80, 'W')}${key(60, 150, 80, 80, 'A')}${key(150, 150, 80, 80, 'S')}${key(240, 150, 80, 80, 'D')}
  ${label(190, 280, 'Laufen')}
  ${key(60, 360, 90, 70, 'Esc', 24)}${label(170, 405, 'Pause', 'start')}
  <g transform="translate(560 90)">
    <rect x="0" y="0" width="150" height="230" rx="75" fill="#1a2027" stroke="#3a4550" stroke-width="3"/>
    <path d="M75 0 V95 M0 95 H150" stroke="#3a4550" stroke-width="3"/>
    <path d="M4 92 V75 A71 71 0 0 1 75 4 V92 Z" fill="#ffffff" opacity=".7"/>
    <path d="M146 92 V75 A71 71 0 0 0 75 4 V92 Z" fill="${GOLD}" opacity=".9"/>
    <rect x="66" y="30" width="18" height="40" rx="9" fill="#2b3540" stroke="#3a4550" stroke-width="2"/>
  </g>
  <path d="M560 140 H470" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>
  ${label(455, 120, 'Arbeiten', 'end')}
  ${tools(235, 140, 40)}
  <path d="M710 140 H780" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>
  ${icon(ic('rake'), 790, 96, 64)}${icon(ic('shotgun'), 862, 96, 64)}
  ${label(860, 200, 'Kämpfen')}
  <path d="M635 90 V50" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>${label(635, 38, 'Mausrad: Zoom')}
  <path d="M710 250 H780" stroke="${MUT}" stroke-width="3" stroke-dasharray="6 6"/>${turn(840, 240, 70)}${label(860, 300, 'Mausrad gedrückt', 'middle', 24, TXT)}${label(860, 330, 'Kamera drehen', 'middle', 28)}
  <g transform="translate(640 420)">
    <rect x="-150" y="-60" width="300" height="120" rx="16" fill="#5c4436" stroke="#7a5634" stroke-width="5"/>
    <path d="M-130 -25h260M-130 5h260M-130 35h260" stroke="#3a2a20" stroke-width="5"/>
    <rect x="-160" y="-70" width="320" height="140" rx="20" fill="none" stroke="#fff2c0" stroke-width="4" stroke-dasharray="12 8"/>
    <path d="M60 10 L100 26 L82 32 L76 50 Z" fill="${TXT}" stroke="#000" stroke-width="2"/>
    ${icon(ic('rake'), 104, 30, 46)}
  </g>
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
  <g transform="translate(860 410)"><circle r="66" fill="#1d252d" stroke="${GOLD}" stroke-width="5"/>${icon(ic('hands'), -40, -40, 80)}</g>
  ${label(860, 312, 'Arbeiten', 'middle', 28)}
  ${tools(650, 190, 40)}
  <g transform="translate(700 440)"><circle r="50" fill="#1d252d" stroke="#ff8a70" stroke-width="5"/>${icon(ic('rake'), -32, -32, 64)}</g>
  ${label(700, 370, 'Kämpfen', 'middle', 28)}
  <g transform="translate(560 300)"><circle r="30" fill="none" stroke="#fff2c0" stroke-width="4" stroke-dasharray="7 6"/><circle r="9" fill="${TXT}"/></g>
  ${label(560, 360, 'Tippen', 'middle', 24, TXT)}
  ${turn(560, 150, 90)}${label(560, 210, 'Wischen: Kamera drehen', 'middle', 24, TXT)}
</svg>`;
}
