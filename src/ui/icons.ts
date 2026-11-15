// Inline SVG icons for HUD, level-up cards and the controls page.
const svg = (body: string, vb = '0 0 40 40') => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const FRUIT = {
  blue: `<circle cx="14" cy="22" r="7" fill="#4a64f0"/><circle cx="26" cy="19" r="7" fill="#3550e0"/><circle cx="21" cy="29" r="6" fill="#5a74ff"/><path d="M24 13l2-3 2 3" stroke="#9fb4ff" stroke-width="1.6" fill="none"/>`,
  asp: `<path d="M8 33 L29 12" stroke="#7fbf45" stroke-width="5" stroke-linecap="round"/><path d="M29 12 L35 5 L32 15 Z" fill="#a46cc0"/><path d="M15 26l-3-1M20 21l-3-1M25 16l-3-1" stroke="#4f8a2a" stroke-width="2"/>`,
  cran: `<circle cx="14" cy="22" r="6" fill="#e2384a"/><circle cx="26" cy="18" r="6" fill="#c42638"/><circle cx="21" cy="30" r="5.5" fill="#ff5466"/><path d="M20 12 q4-8 10-6" stroke="#3f6b2a" stroke-width="2" fill="none"/>`,
  cab: `<circle cx="20" cy="21" r="13" fill="#8fd16a"/><path d="M20 8 q-6 13 0 26 M20 8 q6 13 0 26 M8 18 q12 4 24 0" stroke="#4f8a2a" stroke-width="2" fill="none"/>`,
};
const RAKE = `<path d="M8 34 L28 10" stroke="#c8935a" stroke-width="3.5" stroke-linecap="round"/><path d="M20 4 L36 18" stroke="#c9d0d6" stroke-width="3.5" stroke-linecap="round"/><path d="M22 6l-4 4M26 9.5l-4 4M30 13l-4 4M34 16.5l-4 4" stroke="#c9d0d6" stroke-width="2.2" stroke-linecap="round"/>`;
const SKILL = {
  rake: RAKE,
  asp: `<rect x="5" y="17" width="20" height="7" rx="2" fill="#5a4630"/><rect x="18" y="15" width="17" height="5" rx="2" fill="#7fbf45"/><path d="M35 17.5 L39 15 L39 20 Z" fill="#a46cc0"/><path d="M9 24 l-2 8 h5 l2-8" fill="#3d2f20"/><circle cx="31" cy="11" r="2" fill="#c8ff9a"/>`,
  cran: `<rect x="4" y="18" width="18" height="7" rx="2" fill="#5a4630"/><rect x="16" y="15" width="16" height="4.5" rx="2" fill="#8a8f96"/><rect x="16" y="20" width="16" height="4.5" rx="2" fill="#8a8f96"/><circle cx="35" cy="12" r="3" fill="#ff4d5e"/><circle cx="37" cy="21" r="2.6" fill="#e2384a"/><circle cx="34" cy="29" r="2.8" fill="#ff5466"/>`,
  cab: `<circle cx="18" cy="23" r="12" fill="#8fd16a"/><path d="M18 11 q-5 12 0 24 M18 11 q5 12 0 24 M7 20 q11 4 22 0" stroke="#4f8a2a" stroke-width="2" fill="none"/><path d="M27 12 q4-6 9-5" stroke="#c8935a" stroke-width="2" fill="none"/><circle cx="36" cy="7" r="2.6" fill="#ffd27a"/>`,
};
const BED = `<path d="M20 26 l15 5 l-15 6 l-15 -6 z" fill="#3a2818" stroke="#5a5048" stroke-width="1.5"/>`;
const PLANT = {
  blue: `<circle cx="13" cy="20" r="7" fill="#2f5a34"/><circle cx="26" cy="19" r="7.5" fill="#2f5a34"/><circle cx="20" cy="13" r="7" fill="#376a3d"/><circle cx="12" cy="21" r="2" fill="#5a74ff"/><circle cx="24" cy="15" r="2" fill="#5a74ff"/><circle cx="28" cy="23" r="2" fill="#5a74ff"/><circle cx="18" cy="24" r="2" fill="#5a74ff"/>`,
  asp: `<path d="M12 30 V12 M17 30 V8 M22 30 V11 M27 30 V14" stroke="#6aa83c" stroke-width="2.6" stroke-linecap="round"/><path d="M12 12 l-1.6 3 h3.2z M17 8 l-1.6 3 h3.2z M22 11 l-1.6 3 h3.2z M27 14 l-1.6 3 h3.2z" fill="#a46cc0"/>`,
  cran: `<ellipse cx="14" cy="25" rx="7" ry="4" fill="#335a2a"/><ellipse cx="25" cy="24" rx="8" ry="4.5" fill="#335a2a"/><ellipse cx="20" cy="20" rx="7" ry="4" fill="#3d6a32"/><circle cx="13" cy="22" r="2" fill="#e2384a"/><circle cx="20" cy="18" r="2" fill="#ff4d5e"/><circle cx="27" cy="21" r="2" fill="#e2384a"/><circle cx="23" cy="25" r="2" fill="#c42638"/>`,
  cab: `<circle cx="13" cy="22" r="6" fill="#9ad870"/><circle cx="27" cy="22" r="6" fill="#9ad870"/><circle cx="20" cy="16" r="6.5" fill="#a8e27e"/><path d="M8 26 q5 3 10 0 M22 26 q5 3 10 0" stroke="#4f8a2a" stroke-width="2" fill="none"/>`,
};
const MINI: Record<string, string> = {
  ...FRUIT,
  rake: RAKE,
  dmg: `<path d="M20 3 l4 10 l11 -3 l-7 9 l8 8 l-11 0 l-2 11 l-5 -10 l-10 5 l4 -10 l-9 -6 l11 -2 z" fill="#ffcf33" stroke="#7a4a00" stroke-width="1.4"/>`,
  range: `<path d="M4 20 H36" stroke="#e3d9c3" stroke-width="3"/><path d="M4 20 l7 -6 v12 z M36 20 l-7 -6 v12 z" fill="#e3d9c3"/>`,
  radius: `<circle cx="20" cy="20" r="14" fill="none" stroke="#c8ff80" stroke-width="3" stroke-dasharray="5 3"/><path d="M20 20 H33" stroke="#e3d9c3" stroke-width="2.6"/><circle cx="20" cy="20" r="3" fill="#e3d9c3"/>`,
  cd: `<path d="M11 5 h18 M11 35 h18 M13 5 q0 10 7 15 q-7 5 -7 15 M27 5 q0 10 -7 15 q7 5 7 15" stroke="#e3d9c3" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M16 31 q4 -5 8 0 z" fill="#e3b964"/>`,
  pierce: `<circle cx="14" cy="20" r="6" fill="none" stroke="#e3d9c3" stroke-width="2.4"/><circle cx="26" cy="20" r="6" fill="none" stroke="#e3d9c3" stroke-width="2.4"/><path d="M3 20 H35" stroke="#8fe36a" stroke-width="3"/><path d="M35 20 l-6 -5 v10 z" fill="#a46cc0"/>`,
  pellet: `<circle cx="10" cy="14" r="4" fill="#ff4d5e"/><circle cx="18" cy="26" r="4" fill="#e2384a"/><circle cx="28" cy="12" r="4" fill="#ff5466"/><circle cx="31" cy="27" r="4" fill="#c42638"/>`,
  mine: `<circle cx="20" cy="22" r="8" fill="#ff2040"/><path d="M20 8v6M20 30v6M6 22h6M28 22h6M10 12l4 4M30 12l-4 4M10 32l4-4M30 32l-4-4" stroke="#ff8090" stroke-width="2.4" stroke-linecap="round"/>`,
  mini: `<circle cx="13" cy="24" r="8" fill="#8fd16a"/><circle cx="28" cy="18" r="5.5" fill="#a8e27e"/><circle cx="31" cy="30" r="4" fill="#a8e27e"/>`,
  x2: `<text x="20" y="27" text-anchor="middle" font-family="Cinzel,Georgia,serif" font-weight="700" font-size="30" fill="#e3b964">×2</text>`,
  heart: `<path d="M20 34 C6 24 4 16 9 11 C13 7 18 9 20 13 C22 9 27 7 31 11 C36 16 34 24 20 34 Z" fill="#ff5a4e"/>`,
  fieldhp: `<path d="M20 6 l13 7.5 v15 l-13 7.5 l-13 -7.5 v-15 z" fill="#3a2818" stroke="#6fcf4a" stroke-width="2.4"/><path d="M20 14v12M14 20h12" stroke="#6fcf4a" stroke-width="3"/>`,
  poison: `<path d="M20 5 C14 15 10 20 10 25 a10 10 0 0 0 20 0 C30 20 26 15 20 5z" fill="#6dff3a"/>`,
  stun: `<path d="M20 4 l3.5 9 9.5 .5 -7.5 6 2.5 9.5 -8 -5.5 -8 5.5 2.5 -9.5 -7.5 -6 9.5 -.5z" fill="#ffe066"/>`,
  unlock: `<rect x="9" y="18" width="22" height="17" rx="3" fill="#e3b964"/><path d="M14 18 v-5 a6 6 0 0 1 12 0" stroke="#e3b964" stroke-width="3.4" fill="none" transform="rotate(-20 26 13)"/>`,
  player: `<circle cx="20" cy="12" r="6" fill="#e0b08a"/><path d="M8 36 q12 -22 24 0z" fill="#3c5a3e"/><path d="M11 8 h18 l-3 -4 h-12z" fill="#c9a35a"/>`,
};
const TEA = `<path d="M8 16 h20 v10 a9 9 0 0 1 -9 9 h-2 a9 9 0 0 1 -9 -9z" fill="#c9a35a"/><path d="M28 19 h3 a4 4 0 0 1 0 8 h-3" stroke="#c9a35a" stroke-width="2.6" fill="none"/><path d="M14 12 q-2 -4 1 -7 M20 12 q-2 -4 1 -7" stroke="#8fe36a" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="18" cy="17" rx="9" ry="2" fill="#6a8f3a"/>`;

export function mini(name: string) { return MINI[name] ? svg(MINI[name]) : ''; }
export function skillIcon(w: string) { return svg((SKILL as any)[w] || RAKE); }
export function fruitIcon(t: string) { return svg((FRUIT as any)[t]); }
/** big card picture */
export function pic(name: string) {
  const [kind, id] = name.split('_');
  if (kind === 'skill') return svg((SKILL as any)[id]);
  if (kind === 'field') return svg(BED + (PLANT as any)[id] + `<g transform="translate(25 2) scale(.38)">${(FRUIT as any)[id]}</g>`);
  if (kind === 'plant') return svg(BED + (PLANT as any)[id] + `<g transform="translate(22 0) scale(.45)">${MINI.x2}</g>`);
  if (kind === 'tea') return svg(TEA);
  return svg(MINI.dmg);
}
/** replaces {token} with inline mini icons */
export function iconText(s: string) {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return esc.replace(/\{(\w+)\}/g, (_, n) => `<i class="ic">${mini(n)}</i>`);
}
