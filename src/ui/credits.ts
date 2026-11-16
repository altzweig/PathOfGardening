// Credits page (main menu > Optionen > Credits). Keep in sync with CREDITS.md.
export interface Credit { author: string; authorUrl: string; assets: { name: string; url: string }[]; license: string; licenseUrl: string }

export const CREDITS: Credit[] = [
  {
    author: 'juliovii', authorUrl: 'https://juliovii.itch.io/',
    assets: [
      { name: 'FTP Grass & Dirt', url: 'https://juliovii.itch.io/ftpgrass-dirt' },
      { name: 'FTP Stylized Mix Stones 01', url: 'https://juliovii.itch.io/ftp-stylized-mix-stones-01' },
      { name: 'FTP Dirt Ground', url: 'https://juliovii.itch.io/ftp-dirt-ground' },
    ],
    license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
];

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const a = (href: string, t: string) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(t)}</a>`;

export function creditsHtml() {
  return CREDITS.map(c => `<section class="credit">
    <h3>Texturen</h3>
    <ul>${c.assets.map(x => `<li>${a(x.url, x.name)}</li>`).join('')}</ul>
    <p>von ${a(c.authorUrl, c.author)} · ${a(c.licenseUrl, c.license)}</p>
  </section>`).join('');
}
