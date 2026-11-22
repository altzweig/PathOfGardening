# Effekt-System (`src/fx`)

Datengetriebene Skill-Effekte. Ein Effekt ist reines JSON (`EffectDef` in `schema.ts`) aus mehreren **Ebenen**:

| Ebene | Wofür |
|---|---|
| Partikel | Flammen, Glut, Funken, Rauch, Schnee, Blasen, Blätter … (instanzierte Sprites, 1 Draw-Call pro Ebene) |
| Bodeneffekt | Glut-Risse, Frost, Giftpfütze, Brandfleck, Heilkreis, Schein |
| Blitz | verästelter Zitronenblitz (Kette, Fächer oder vom Himmel) |
| Schockwelle | Ringe am Boden |
| Kristalle | Eissplitter, die aus dem Boden wachsen und zerfallen |
| Licht | Punktlicht, dauerhaft flackernd oder als Blitz |

## Bearbeiten
VFX-Labor: `vfx.html` (online: `https://altzweig.github.io/PathOfGardening/vfx.html`, lokal `npm run dev` → `/vfx.html`).
Alle Regler wirken live, der Arbeitsstand wird im Browser gespeichert, unter *Presets & Export* gibt es JSON zum Kopieren/Herunterladen.
Startwerte stehen in `presets.ts`.

## Benutzen (Spiel)
```ts
const sys = new FxSystem(scene, fxTop);           // fxTop: Overlay-Szene nach dem Bloom (für scharfe Blitze)
const fx = new FxInstance(effectJson, sys);
fx.setActive(true);                               // Dauer-Effekt an / Einzel-Effekt mit Wiederholung
fx.trigger();                                     // Einzel-Effekt auslösen
// jedes Frame:
sys.setResolution(w, h);
fx.update(dt, { origin, dir, targets, range, time });
```
`origin` = Quelle (Hand bzw. Mittelpunkt), `dir` = waagerechte Zielrichtung, `targets` = Bodenpunkte der Ziele.
