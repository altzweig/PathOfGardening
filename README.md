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

`welt.html` (online: `…/PathOfGardening/welt.html`) baut die Spielwelt von Grund auf. Eine neue Welt ist eine leere Landschaft mit trockenem Gras; „Vorlage: bisheriger Hof“ lädt den alten Hof als Ausgangspunkt. Drei Reiter:

- **Logik**: Kartengröße (40–256 m, Standard 128 m), begehbarer Bereich und Baubereich als Spline-Flächen (Punkte ziehen, auf die Linie klicken für neue Punkte, „Neu zeichnen“), Feldplätze als Sechsecke (am Raster ausgerichtet, nur im Baubereich), Gegner-Spawns (rote Kreise mit Waschbär und Nummer, Häufigkeit je Spawn), das Haupthaus und Interaktionsobjekte (Brunnen, Korb, Blaubeerbusch, Obstbäume, Brombeeren). Unter „Anzeigen“ lassen sich Grenzen, Felder, Spawns und Nummern ein- und ausblenden.
- **Objekte**: alle 68 Modelle des Nature MegaKit plus Zaun, Pfosten, Heuballen und Holzstapel; setzen, sprühen (Dichte, Überlappen, Größe, Streuung, Drehung zufällig oder fest), entfernen. Größe, Drehung, Neigung und Höhe per Regler mit Zurücksetzen-Knopf.
- **Boden**: Texturen in Ebenen wie in einem Malprogramm (sichtbar/aus, hoch/runter, löschen, füllen, Grundboden wählen), bis zu 16 verschiedene Texturen pro Welt aus 29 FreeStylized-Bodentexturen. Pinselformen: Kreis, Noise-Masken mit Verlauf nach außen und die Effekt-Masken (Flammen, Feuer, Rauch, Glühen, Stern, Schneeflocke, Blatt, Splitter). Größe ab 10 cm stufenlos, Stärke, Härte, Abstand, Streuung, Drehung. Wildgras dichter (bis 300 %) und höher (bis ×3) malen oder wegnehmen.
- Alle Regler: ziehen, Wert direkt eintippen oder mit einem Klick zurücksetzen.
- **Speichern**: Der Arbeitsstand bleibt als Entwurf im Browser. *Im Spiel testen* öffnet das Spiel mit dem Entwurf (`?welt=entwurf`). *Ins Spiel übernehmen (GitHub)* schreibt `public/world/welt.json` direkt ins Repo (eigenes fine-grained Token mit „Contents: Read and write“); alternativ `welt.json` herunterladen und nach `public/world/` legen.
- Das Spiel liest die Logik der Welt: nur das Haupthaus (und der Brunnen, falls gesetzt), Felder auf den Sechseck-Plätzen, Waschbären und Hasen kommen aus den Spawns (nach Häufigkeit gewichtet), die Spielfigur bleibt im begehbaren Bereich.
- Ohne `public/world/welt.json` spielt das Spiel den bisherigen, generierten Hof.

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
