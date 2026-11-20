# PathOfGardening

Hof-Spiel im Browser (Three.js, TypeScript, Vite): tagsüber den Hof bewirtschaften und Waschbären und Hasen vertreiben, abends im Haus Aufträge, Bauen und Produktion. Der Spielstand bleibt im Browser gespeichert.

Das frühere Garten-Survival (Wellen, Level-up-Karten, Koop) liegt in `archiv/garden-defence-v1/`.

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
npm run dev
```

Dann die angezeigte Adresse öffnen (auch im WLAN vom Handy aus, `--host` ist aktiv).

## Balancing

Alle Stellschrauben stehen in **`Game Design & Balancing/balancing.yaml`**. Die Datei wird bei jedem Spielstart geladen; im Dev-Modus lädt das Spiel beim Speichern automatisch neu. Ablauf und Annahmen des Umbaus: `Farming-Gameloop.md`, Regeln und Begründungen: `Design-Entscheidungen.md`.

Test-Hilfen: `?q=niedrig` startet mit niedriger Grafik, `?h=12` zeigt eine feste Tageszeit.

## Welt-Editor

`welt.html` (online: `…/PathOfGardening/welt.html`) zeigt den echten Hof und lässt die Welt selbst gestalten:

- **Objekte**: Bäume, Büsche, Pflanzen, Gras, Blumen, Pilze, Steine (Nature MegaKit) und Zaun, Pfosten, Heuballen, Holzstapel setzen, verschieben, drehen, skalieren, löschen; mit dem Pinsel streuen oder entfernen. Bäume, Felsen und Zäune auf dem Hof sind feste Hindernisse.
- **Boden**: Gras, saftiges Gras, Grasnarbe, Trockenrasen, Erde und Kies malen (weiche, ausgefranste Übergänge), Wildgras-Halme dazu- oder wegmalen, „Original“ radiert zurück zum generierten Boden.
- **Speichern**: Der Arbeitsstand bleibt als Entwurf im Browser. *Im Spiel testen* öffnet das Spiel mit dem Entwurf (`?welt=entwurf`). *Ins Spiel übernehmen (GitHub)* schreibt `public/world/welt.json` direkt ins Repo (eigenes fine-grained Token mit „Contents: Read and write“); alternativ `welt.json` herunterladen und nach `public/world/` legen.
- Ohne `public/world/welt.json` erzeugt das Spiel den Wald wie bisher zufällig.

## Auf GitHub Pages veröffentlichen

1. Repository auf GitHub anlegen und diesen Ordner pushen (Branch `main`).
2. Auf GitHub: *Settings → Pages → Source: GitHub Actions*.
3. Jeder Push auf `main` baut und veröffentlicht automatisch (`.github/workflows/deploy.yml`).

## Projektstruktur

- `src/farm/config.ts`, `state.ts` – Balancing-Typen, Spielstand (Lager, Geld, XP, Felder, Gebäude, Aufträge) und Tag/Abend-Übergänge
- `src/farm/sim.ts` – ein Tag: Spieler, Aktionen, Kampf, Tiere, Beute, Regen
- `src/farm/tutorial.ts` – Tutorial-Tag mit Waschbär-Cutscene
- `src/farm/view/` – Hof, Wald, Gebäude, Felder, Busch, Figur mit Werkzeugen, Kamera
- `src/farm/input.ts`, `src/farm/ui/` – PC- und Touch-Eingabe, HUD, Abend- und Morgen-Bildschirm, Steuerungsseite
- `src/world/`, `src/editor/` – Weltdaten (Objekte, Bodenmalerei) und der Welt-Editor (`welt.html`)
- `src/view/` – gemeinsame Three.js-Bausteine (Licht, Effekte, Tiere, Figur, Natur, Texturen)
- `archiv/garden-defence-v1/` – das alte Spiel (nicht im Build)

## Sounds

- Rohaufnahmen: `sfx/<zweck>/`, ungenutzte in `sfx/unused/` (werden nicht ausgeliefert)
- Geschnittene Clips: `public/audio/` (werden ausgeliefert)
- Zuordnung zu Spielereignissen: `Game Design & Balancing/sounds.yaml`
- Neu schneiden: `npm run dev`, dann in der Browser-Konsole
  `const T = await import('/tools/sfx-tool.js'); await T.load(); await T.cut('name', 'datei.wav', start, ende)`

## Credits

Fremde Assets (Autor, Links, Lizenz) stehen in [`CREDITS.md`](CREDITS.md) und im Spiel unter *Optionen → Credits*.
