// Editor widgets of the VFX lab, generated from the parameter descriptions (src/fx/schema.ts).
import type { Grad, ParamDesc, Range } from '../fx/schema';

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
}
const fmt = (v: number, step = .01) => { const d = step >= 1 ? 0 : step >= .1 ? 1 : step >= .01 ? 2 : 3; return (+v).toFixed(d); };

/** slider + number box */
function numInput(v: number, d: ParamDesc, set: (v: number) => void) {
  const w = el('div', 'num');
  const r = el('input'); r.type = 'range'; r.min = String(d.min ?? 0); r.max = String(d.max ?? 1); r.step = String(d.step ?? .01); r.value = String(v);
  const n = el('input', 'nbox'); n.type = 'number'; n.step = String(d.step ?? .01); n.value = fmt(v, d.step);
  r.oninput = () => { n.value = fmt(+r.value, d.step); set(+r.value); };
  n.onchange = () => { const x = +n.value; if (Number.isFinite(x)) { r.value = String(x); set(x); } };
  w.append(r, n); return w;
}

/** one editor row for a parameter of obj; onChange(desc) after every edit */
export function field(d: ParamDesc, obj: Record<string, any>, onChange: (d: ParamDesc) => void): HTMLElement {
  const row = el('div', 'row k-' + d.kind);
  const lab = el('label', 'lab', d.label); row.append(lab);
  const set = (v: unknown) => { obj[d.key] = v; onChange(d); };
  switch (d.kind) {
    case 'num': row.append(numInput(obj[d.key], d, set)); break;
    case 'range': {
      const v = obj[d.key] as Range, box = el('div', 'pair');
      const a = numInput(v[0], d, x => { v[0] = x; onChange(d); }), b = numInput(v[1], d, x => { v[1] = x; onChange(d); });
      a.prepend(el('span', 'tag', 'A')); b.prepend(el('span', 'tag', 'B'));
      box.append(a, b); row.append(box); break;
    }
    case 'color': {
      const box = el('div', 'colrow'), c = el('input'); c.type = 'color'; c.value = obj[d.key];
      const t = el('input', 'hex'); t.value = obj[d.key];
      c.oninput = () => { t.value = c.value; set(c.value); };
      t.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(t.value)) { c.value = t.value; set(t.value); } };
      box.append(c, t); row.append(box); break;
    }
    case 'select': {
      const s = el('select'); for (const [k, l] of d.options ?? []) { const o = el('option'); o.value = k; o.textContent = l; s.append(o); }
      s.value = obj[d.key]; s.onchange = () => set(s.value); row.append(s); break;
    }
    case 'bool': {
      const sw = el('label', 'switch'), c = el('input'); c.type = 'checkbox'; c.checked = !!obj[d.key];
      c.onchange = () => set(c.checked); sw.append(c, el('span')); row.classList.add('inline'); row.append(sw); break;
    }
    case 'text': { const t = el('input', 'txt'); t.value = obj[d.key]; t.oninput = () => set(t.value); row.append(t); break; }
    case 'grad': row.append(gradEditor(obj[d.key] as Grad, () => onChange(d))); break;
  }
  if (d.hint) row.append(el('div', 'hint', d.hint));
  return row;
}

/** colour gradient: preview bar + stops (colour, position, remove) */
function gradEditor(g: Grad, changed: () => void) {
  const w = el('div', 'grad'), bar = el('div', 'gbar'), list = el('div', 'gstops');
  const paint = () => { const s = [...g].sort((a, b) => a[0] - b[0]); bar.style.background = `linear-gradient(90deg, ${s.map(([p, c]) => `${c} ${Math.round(p * 100)}%`).join(', ')})`; };
  const build = () => {
    list.innerHTML = '';
    g.forEach((st, i) => {
      const r = el('div', 'gstop'), c = el('input'); c.type = 'color'; c.value = st[1];
      c.oninput = () => { st[1] = c.value; paint(); changed(); };
      const p = numInput(st[0], { key: '', label: '', kind: 'num', min: 0, max: 1, step: .01 }, v => { st[0] = v; paint(); changed(); });
      const x = el('button', 'mini', '✕'); x.title = 'Farbstopp entfernen'; x.disabled = g.length <= 1;
      x.onclick = () => { g.splice(i, 1); build(); paint(); changed(); };
      r.append(c, p, x); list.append(r);
    });
    const add = el('button', 'mini wide', '+ Farbstopp'); add.disabled = g.length >= 6;
    add.onclick = () => { const s = [...g].sort((a, b) => a[0] - b[0]); const last = s[s.length - 1]; g.push([Math.min(1, last ? (last[0] + 1) / 2 : .5), last ? last[1] : '#ffffff']); build(); paint(); changed(); };
    list.append(add);
  };
  build(); paint(); w.append(bar, list); return w;
}

export function button(label: string, onClick: () => void, cls = 'btn') { const b = el('button', cls, label); b.onclick = onClick; return b; }
