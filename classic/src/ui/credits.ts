// Credits page (main menu > Optionen > Credits). Keep in sync with CREDITS.md.
interface Link { name: string; url: string }
interface Group { title: string; author: Link; items: Link[]; license?: Link }

const CC_BY = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
const CC0 = { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' };

export const CREDITS: Group[] = [
  {
    title: 'Texturen', author: { name: 'FreeStylized.com', url: 'https://freestylized.com/' },
    items: ['Grass 01', 'Grass 04', 'Moss Ground 02', 'Ground 02', 'Ground 06', 'Cobblestone 01'].map(name => ({ name, url: 'https://freestylized.com/' })),
  },
  {
    title: 'Texturen', author: { name: 'juliovii', url: 'https://juliovii.itch.io/' }, license: CC_BY,
    items: [
      { name: 'FTP Dirt Ground', url: 'https://juliovii.itch.io/ftp-dirt-ground' },
      { name: 'FTP Grass & Dirt', url: 'https://juliovii.itch.io/ftpgrass-dirt' },
      { name: 'FTP Stylized Mix Stones 01', url: 'https://juliovii.itch.io/ftp-stylized-mix-stones-01' },
    ],
  },
  { title: '3D-Modelle', author: { name: 'Quaternius', url: 'https://quaternius.com/' }, license: CC0, items: [{ name: 'Stylized Nature MegaKit', url: 'https://quaternius.com/packs/stylizednaturemegakit.html' }] },
  { title: 'Effekte', author: { name: 'Kenney', url: 'https://kenney.nl/' }, license: CC0, items: [{ name: 'Particle Pack', url: 'https://kenney.nl/assets/particle-pack' }] },
  { title: 'Sounds', author: { name: 'aslakhostaker', url: 'https://freesound.org/people/aslakhostaker/' }, license: CC0, items: [{ name: 'Flamethrower short and medium length bursts', url: 'https://freesound.org/s/395038/' }] },
  { title: 'Sounds', author: { name: '1bob', url: 'https://freesound.org/people/1bob/' }, license: CC0, items: [{ name: 'Flamethrower', url: 'https://freesound.org/s/831929/' }] },
  { title: 'Sounds', author: { name: 'raphavpires', url: 'https://freesound.org/people/raphavpires/' }, license: CC0, items: [{ name: 'Flamethrower loop', url: 'https://freesound.org/s/867029/' }] },
];

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const a = (l: Link) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)}</a>`;

export function creditsHtml() {
  let html = '', last = '';
  for (const g of CREDITS) {
    if (g.title !== last) { html += `<h3>${esc(g.title)}</h3>`; last = g.title; }
    html += `<section class="credit"><ul>${g.items.map(x => `<li>${a(x)}</li>`).join('')}</ul><p>von ${a(g.author)}${g.license ? ' · ' + a(g.license) : ''}</p></section>`;
  }
  return html;
}
