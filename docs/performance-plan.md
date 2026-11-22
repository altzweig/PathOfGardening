# Umsetzungsplan Performance (PathOfGardening)

Stand 22.11.2026 · baut auf [performance-analyse.md](performance-analyse.md) auf · **noch nichts umgesetzt**

## 0. Ziel und Rahmen

| | heute | Ziel nach Phase 1 | Ziel nach Phase 3 |
|---|---|---|---|
| Handy (4× CPU), Tag, Frame-CPU | 38 ms | ≤ 22 ms | ≤ 14 ms (60 fps knapp, 30 fps sicher) |
| Handy, Nacht | 45 ms | ≤ 28 ms | ≤ 18 ms |
| Dreiecke pro Frame (Tag, Feld) | ~1,95 Mio. | ~0,9 Mio. | ≤ 0,4 Mio. |
| Draw Calls | ~390 | ~300 | ≤ 250 |
| GPU-Anteil Boden (SwiftShader) | 45 % | 45 % | ≤ 20 % |
| Abend/Buch: 3D-Render | voll | 0 | 0 |
| Download bis spielbar (Handy) | 4,5 + 8,8 MB | 4,5 + 2 MB | ≤ 5 MB gesamt |

**Referenz-Kamera:** nur die Third-Person-Kamera (Abstand 3–10 m, Neigung −0,2…1,35 rad, FOV 40°, far 120). Die Top-Down-Ansicht gilt als nicht vorhanden. Die meiste Spielzeit steht man auf dem Feld (Ernten, Kämpfen), nur gelegentlich läuft man weiter.

**Grundregel für die Welt:** `public/world/welt.json` bleibt die eine Quelle, die der Welt-Editor bearbeitet. Alles, was „radikal ausblendet“ (Löschen, Kacheln, LOD-Zuordnung), passiert als **Bake-Schritt beim Build** (`tools/bake-world.mjs` → `public/world/welt.baked.json`) oder als Filter beim Laden. Der Editor lädt weiterhin `welt.json` und sieht alles.

Jede Aufgabe hat eine Messung mit den Skripten aus `tools/perf/` (`all.sh`, `abl.cjs`, `ground.cjs`, `pvs.cjs`, `inrock.cjs`). Ein Schritt gilt erst als fertig, wenn die Messung das Ziel trifft und die Sichtprüfung (Screenshots Tag/Nacht, PC/Handy, gleiche Kameraposition vorher/nachher) keinen sichtbaren Unterschied am Feld zeigt.

---

## 1. Neue Messergebnisse für diesen Plan

### 1.1 Was ist aus der Spielkamera überhaupt sichtbar? (`tools/perf/pvs.cjs`)

Methode:
- Jedes der 945 Welt-Objekte wird mit einer eigenen ID-Farbe gezeichnet (Blätter mit Alpha-Test). Gebäude und Boden verdecken.
- Kamerapositionen: 7-m-Raster über die ganze Lauffläche (144 Punkte) × 8 Blickrichtungen × 3 Posen (10 m flach, 10 m steil, 3 m nah) = 3.456 Aufnahmen.

Ergebnis:
- **Nur 7 von 945 Objekten sind nie sichtbar:** 2 Fern_1, 2 Rock_Medium_1, 1 Rock_Medium_3, 1 Pine_4, 1 Pine_1.
- Der Wald ist kompakt um die Lauffläche gebaut:
  - 706 Objekte liegen höchstens 5 m von begehbarem Boden entfernt.
  - 856 liegen innerhalb von 20 m.
  - Das weiteste Objekt liegt 51 m entfernt.

**Konsequenz:** „Nie sichtbaren Wald löschen“ spart fast nichts (< 1 %). Der Hebel ist ein anderer:
- *Pro Frame* ist nur ein Teil sichtbar. Mit 16-m-Kacheln liegen im Sichtkegel im Mittel **40 %** der Wald-Dreiecke, höchstens 50 %.
- Der Schatten deckt nur ±19 m um die Kartenmitte ab, zeichnet aber heute trotzdem den ganzen Wald.
- Der Großteil des Sichtbaren ist weiter als 20 m weg und braucht dort keine 2.000 Dreiecke pro Baum.

Die 7 Objekte werden trotzdem im Bake entfernt, weil es nichts kostet.

### 1.2 Deko in Felsen (`tools/perf/inrock.cjs`)

Methode: 13 Punkte der gedrehten und skalierten Bounding-Box jeder Deko-Pflanze werden gegen die Felsen getestet (Strahl nach oben, ungerade Trefferzahl = innen).

| | Anzahl | Modelle | Aktion |
|---|---|---|---|
| komplett im Fels | **5** | 5 × Fern_1 | im Bake entfernen |
| streift nur | 15 | 8 Fern_1, 3 Pebble_Round_2, 1 Pebble_Round_1, 2 Petal_1, 1 Petal_3 | bleiben |

Die Liste liegt in `tools/perf/out/inrock.json`. Der Bake-Schritt rechnet den Test bei jedem Build neu. Neue Fälle aus dem Editor fallen so automatisch weg.

### 1.3 Boden-Shader: Anzahl, Auflösung oder Rauschen? (`tools/perf/ground.cjs`)

Gemessen wurde PC 720p, Tag, mit SwiftShader. Die Werte sind relative GPU-Anteile, keine echten Millisekunden.

| Variante | GPU/Frame | Δ zu Basis |
|---|---|---|
| Basis (heutiger Shader) | 2.150 | – |
| Rauschen (tFbm) abgeschaltet | 2.044 | −5 % |
| nur 1 statt 2 Anti-Tiling-Samples pro Schicht | 1.880 | −12 % |
| Schichten unter 25 % Gewicht überspringen | 2.125 | ±0 % |
| Schleifen über 6 statt 16 Slots | 1.937 | −10 % |
| 6 Slots + 1 Sample + einfaches Rauschen | 1.598 | **−26 %** |
| ohne Beleuchtung (nur zum Vergleich) | 1.778 | −17 % |
| einfacher Boden (eine Farbe, gleiche Beleuchtung) | 1.130 | **−48 %** |

Pro Texel der Gewichtskarte (512²) sind nur **2,4 Schichten im Mittel** aktiv (Verteilung: 1 → 3 %, 2 → 57 %, 3 → 36 %, 4 → 4 %, 5 → 0,4 %). Genutzt werden 6 Slots.

**Antwort auf „Anzahl oder Auflösung?“: weder noch, es ist die Bauart des Shaders.**

- **Die Auflösung ist nicht das Problem.**
  - Die Texturen haben Mipmaps (`textureGrad`), aus der Entfernung wird also ohnehin eine kleine Stufe gelesen.
  - 1024 → 512 würde die Bandbreite in der Nähe senken, aber nicht die Rechenarbeit.
- **Die Zahl der bemalten Schichten ist es auch nicht.** Pro Pixel sind nur 2–3 aktiv. Weniger Schichten überspringen bringt nichts (±0 %).
- **Teuer ist, wie der Shader jede Schicht behandelt:**
  - Er läuft in jedem Pixel dreimal über alle 16 möglichen Slots.
  - Er liest 4 Gewichtstexturen.
  - Er rechnet pro aktiver Schicht eine eigene fraktale Rauschfunktion für die zerfransten Ränder.
  - Danach sampelt er pro Schicht 2× Farbe + 2× Normale (Anti-Tiling), plus 4 weitere Rauschfunktionen für Farbvariation.
  - Die Schleifen mit Array-Zugriff (`w[i]`, `t[i]`, `uTileL[i]`) sind auf echten GPUs teuer, weil der Compiler sie nicht sauber ausrollt und viele Register braucht.
- Der Boden ist außerdem eine 223 m breite Fläche. Der volle Shader läuft auch im dunklen Rand außerhalb der Karte.

**Die Schichten bleiben wie jetzt.** Optisch ändert sich nichts. Es wird nur vorberechnet, was sich nie ändert (siehe Phase 3).

### 1.4 Weitere Befunde

- **Schatten-Kamera fest:** Die Schattenkamera ist fest auf die Kartenmitte gerichtet (±19 m, `core.ts:35`, `daynight.ts:52`). Trotzdem werden alle Wald-Instanzen der ganzen Karte in die Schattenkarte gezeichnet, weil die Instanzen-Bounding-Sphere die ganze Karte umfasst.
- **Nebel an der falschen Stelle:** `daynight.ts:65` nimmt `camera.position.length()`, also den Abstand zur Weltmitte und nicht zum Spieler.
  - Am Kartenrand rückt der Nebel deshalb weit weg, und der ferne Wald wird voll gezeichnet.
  - Das ist ein Überbleibsel der Top-Down-Kamera um die Mitte.

---

## 2. Phase 1 – Quick Wins (ohne Optik-Änderung, ~1–2 Tage)

Reihenfolge = Verhältnis Nutzen zu Aufwand.

### 1.1 Keine Welt im Haus/Buch
- **Wo:**
  - `farmView.ts:878` (`composer.render()` läuft immer)
  - `main.ts` (Szenenwechsel)
  - `houseBg.ts`
  - `book.css:249`
- **Was:**
  - Ist das Abend-Buch offen, oder das Buch tagsüber **deckend**, dann `composer.render()` überspringen und das Canvas ausblenden (`visibility:hidden`).
  - Die Simulation läuft weiter, wo das Spiel es braucht.
  - Fürs Tagesbuch (Taste B) mit durchscheinendem Hintergrund beim Öffnen **einmal** einen Schnappschuss rendern:
    - `renderer.domElement.toDataURL` oder ein kleines Render-Target, halbe Auflösung.
    - Unscharf als `<img>` hinter das Buch legen.
    - `backdrop-filter: blur(7px)` entfernen.
  - `houseBg.ts` von 30 fps auf eine Animation per CSS umstellen oder auf 10 fps senken. Ohne Bewegung: gar nicht.
- **Ziel:** Buch offen → Frame-Intervall PC von 121 ms auf ≤ 17 ms. Abend-GPU ≈ 0.
- **Messen:** `all.sh` Szenen „Abend“ und „Buch“.

### 1.2 HUD ohne erzwungenes Layout
- **Wo:**
  - `farmView.ts:347/376/395/685/884` (`innerHeight > innerWidth`)
  - `hud.ts:124` (Style-Writes)
  - `hud.ts:169`
- **Was:**
  - Viewportgröße einmal in einer `resize`-Behandlung cachen (`view.portrait`, `view.w`, `view.h`). Im Frame nie mehr `innerWidth`/`innerHeight` lesen.
  - HUD-Werte nur schreiben, wenn sie sich geändert haben (`if (el._v !== v)`).
  - Zahlen in ganzen Schritten.
  - Positionen per `transform` statt `left`/`top`.
  - Den Timer `n.t += 1/60` auf echtes `dt` umstellen. Das ist ein Korrektheitsfehler bei < 60 fps.
- **Ziel:** `hud.update` + `screen()` auf dem Handy von ~4,2 ms auf ≤ 0,5 ms.

### 1.3 Feldplätze: nur bebaute Plots als 3D-Objekte
- **Wo:** `farmView.ts:260–330` (`makePlot`), `updatePlot` (367).
- **Was:**
  - Heute: 68 Plätze × ~115 Objekte = ~7.800 Objekte, fast alle unsichtbar, aber jedes in `updateMatrixWorld`.
  - Neu: Freie Plätze erzeugen nur das kleine Markierungsobjekt. Die vollen Plot-Ansichten (Saat-Meshes, Trampelmeshes, Balken, Sprites) entstehen **lazy**, wenn der Platz bebaut wird.
  - Innerhalb eines Plots:
    - Die 30 Saat-Meshes und 70 Trampel-Meshes zu je einem `InstancedMesh` zusammenfassen (Zustand per `instanceMatrix`/`count`).
    - Statische Teile mit `matrixAutoUpdate = false`.
- **Ziel:**
  - Objekte in der Szene von 9.400 auf ≤ 1.500.
  - `updateMatrixWorld` von 25 % JS auf ≤ 5 %.
  - Handy-Tag −6…8 ms.

### 1.4 `matrixAutoUpdate` aus für alles Statische
- **Wo:** Gebäude, Zäune, Hofdeko, Feldrahmen (`hofWorld.ts`, `buildings*.ts`).
- **Was:**
  - Nach dem Aufbau `updateMatrix()` einmal aufrufen, dann `matrixAutoUpdate = false`.
  - Unsichtbare Gruppen zusätzlich `matrixWorldAutoUpdate = false` (three 0.160 unterstützt das).
  - So überspringt der Szenen-Walk sie.
- **Ziel:** zusammen mit 1.3 ≤ 1 ms für `updateMatrixWorld` auf dem Handy.

### 1.5 Nebel relativ zum Spieler, Sichtweite begrenzen
- **Wo:** `daynight.ts:65–67`, `core.ts` (camera.far).
- **Was:**
  - `cd` = Abstand Kamera ↔ Spieler (Kamera-Zoom) statt Abstand zur Weltmitte.
  - `camera.far` = `fog.far + 5` (≈ 60 m tags, 35 m nachts) statt 120.
  - Damit hat Phase 2 eine harte Grenze, ab der nichts mehr gezeichnet werden muss.
- **Achtung:** Sichtprüfung an Kartenrand und Gebäuden. Es darf kein Wald „abbrechen“, also muss Nebel = Himmelsfarbe vor `far` erreicht sein.

### 1.6 Bloom und Anti-Aliasing aufräumen
- **Wo:** `core.ts:20` (`antialias:true` ist mit Composer wirkungslos), `core.ts:67`.
- **Was:**
  - `antialias:false`. Das spart auf manchen Handys einen MSAA-Puffer.
  - Bloom auf halber Auflösung (`UnrealBloomPass` mit `resolution/2`).
  - Auf dem Handy höchstens 3 statt 5 Mips.
  - `cleanPass` und `topPass` prüfen, ob sie zu einem Pass zusammengehen.
  - Optional FXAA/SMAA nur auf PC-„Hoch“.
- **Ziel:** Bloom-Kosten Handy −50 % (heute 15 % GPU).

### 1.7 Ton: Opus/MP3 statt WAV, nachladen nach Bedarf
- **Wo:** `audio.ts:155` (lädt alle 122 Clips auf einmal), `public/sfx/`.
- **Was:**
  - Alle 114 WAV einmalig nach `.ogg` (Opus 64 kbit) plus `.m4a` als Safari-Fallback konvertieren (Skript `tools/build-sfx.mjs` mit ffmpeg).
  - Beim Start nur die ~15 Kernsounds laden (Schritte, Säen, Gießen, Ernte, UI). Den Rest beim ersten Gebrauch oder im Leerlauf (`requestIdleCallback`).
- **Ziel:** +8,8 MB → ≤ 1,5 MB nach dem ersten Klick.

### 1.8 Startmenü: zweiten WebGL-Kontext abbauen
- **Wo:** `startmenu.ts:121`.
- **Was:** Den Menü-Renderer beim Spielstart `dispose()` + `forceContextLoss()`, oder den Hauptrenderer mitbenutzen. Ohne `antialias`.
- **Ziel:** −1 GPU-Kontext (Handy-Speicher, Abstürze auf iOS).

### 1.9 Kleinigkeiten
- `animals.ts:416`: Material pro Tier → ein Material pro Tierart. Unterschiede per `instanceColor`/Uniform.
- Der Boden-Rand außerhalb der Karte bekommt einen eigenen billigen Shader (Phase 3.4), hier schon einmal die Fläche von 223 m auf Karte + 2 × 35 m verkleinern.

**Abnahme Phase 1:**
- `all.sh` auf PC und Handy.
- Handy-Tag ≤ 22 ms, Nacht ≤ 28 ms.
- Buch/Abend ohne 3D.
- Screenshots identisch.

---

## 3. Phase 2 – Wald: Bake, Kacheln, LOD, Impostor, Schatten (~3–5 Tage)

Der größte GPU-Brocken: Props −43…45 %, Schatten −29…31 %, davon Blätter-Schatten −17…18 %.

### 2.1 Welt-Bake beim Build
- **Neu:** `tools/bake-world.mjs`. Läuft in `npm run build` vor Vite und im Dev per `npm run bake`.
- **Eingabe:** `public/world/welt.json`, Modell-Bounding-Boxen (aus `nature.glb` gelesen oder in `catalog.ts` hinterlegt).
- **Schritte:**
  1. **Entfernen: Deko komplett in Felsen** (Test wie `inrock.cjs`, aber in Node mit three-mesh-bvh oder einfachem Strahltest gegen die Fels-Geometrie). Heute 5 Fern_1.
  2. **Entfernen: nie sichtbar.** PVS-Liste aus `pvs.cjs` (heute 7). Die Liste wird nicht bei jedem Build neu gerechnet (das dauert ~8 min im Browser), sondern als `public/world/pvs.json` eingecheckt, mit Hash der Objektpositionen.
     - Hat der Editor die Welt geändert, wird die Liste ignoriert (lieber alles zeigen) und eine Warnung „pvs veraltet“ ausgegeben.
     - `npm run pvs` aktualisiert sie.
  3. **Kacheln:** 16 × 16 m. Jedes Objekt bekommt die Kachel seines Mittelpunkts.
  4. **LOD-Stufe pro Objekt vorbelegen** (siehe 2.3): Abstand zur nächsten begehbaren Fläche.
     - Bäume weiter als 25 m weg werden nie näher als 25 m gesehen und bekommen nur LOD1/Impostor.
     - Das betrifft u. a. 9 Pine_4 und 25 Rock_Medium_3.
  5. **Schattenwerfer markieren:** nur Objekte, deren Schatten im Schattenbereich und auf begehbarem Boden landen kann (Abstand ≤ 8 m zur Lauffläche + Sonnenrichtung).
- **Ausgabe:** `welt.baked.json` mit `props` gruppiert nach `tile → model → [x,z,ry,s,c,lod,cast]` (kompakter als heute, gzip-freundlicher).
- **Laden:** `hofWorld.ts` lädt `welt.baked.json`, wenn vorhanden, sonst `welt.json` (Fallback, Editor). Der Editor (`welt.html`) bleibt unverändert auf `welt.json`.
- **Ziel:**
  - 12 Objekte weniger.
  - Datei 670 KB → ~250 KB.
  - Neues Testskript `tools/perf/bake-check.cjs` vergleicht den Screenshot vorher/nachher von 20 festen Kamerapositionen (Pixel-Diff < 0,5 %).

### 2.2 Wald in Kacheln (Frustum- und Schatten-Culling)
- **Wo:** `nature.ts:187–199` (`instance()`), `hofWorld.ts`.
- **Was:**
  - Statt eines `InstancedMesh` pro Modell für die ganze Karte: ein `InstancedMesh` pro Modell **pro Kachel**, mit eigener, enger Bounding-Sphere (`computeBoundingSphere()` nach dem Füllen).
  - three.js cullt dann selbst gegen Kamera *und* gegen die Schattenkamera.
  - Draw Calls steigen höchstens moderat: ~25 Kacheln mit Wald × ~6 Modelle im Schnitt, sichtbar ~40 %.
  - Falls zu viele Calls: Kacheln auf 24 m vergrößern oder pro Kachel `BatchedMesh` (three ≥ 0.159) nutzen. Das ist ein Call für alle Modelle einer Kachel.
  - Gras ist schon in 10-m-Kacheln (`hofWorld.ts:236`) und bleibt so.
- **Dynamisches Laden/Entladen?** Nicht nötig.
  - Die ganze Welt hat ~950 Objekte, die Geometrie liegt nur einmal pro Modell im Speicher.
  - Kacheln werden nur sichtbar/unsichtbar geschaltet (Culling). Echtes Streaming lohnt sich erst bei einer viel größeren Karte.
  - Vorbereitet ist es trotzdem: Kacheln haben feste IDs.
- **Ziel:**
  - Wald-Dreiecke im Hauptpass −55…60 % (Messung: im Mittel 40 % der Wald-Dreiecke im Sichtkegel).
  - Im Schattenpass ≥ −70 %.

### 2.3 LOD für Bäume, Büsche, Felsen
- **Wo:** `tools/build-nature.mjs` (meshopt `simplify` ist schon eingebunden), `nature.ts`.
- **Was:** Pro Modell 2 zusätzliche Stufen in `nature.glb` erzeugen:

  | Stufe | Abstand zur Kamera | Dreiecke |
  |---|---|---|
  | LOD0 | < 15 m | Original |
  | LOD1 | 15–30 m | ~35 % |
  | LOD2 | > 30 m | ~12 % oder Impostor |

  - **Rinde:** `simplify` mit Fehler 0,01.
  - **Blätter:** Cluster ausdünnen (jede 2./3. Blattkarte weglassen und die übrigen 1,3× skalieren), denn `simplifySloppy` zerreißt Alpha-Karten.
  - Auswahl **pro Kachel**, nicht pro Instanz: Kachelmittelpunkt-Abstand zur Kamera, mit 2 m Hysterese gegen Flackern. Das hält es CPU-billig.
  - Bei Bedarf nachträglich pro Instanz über zwei `InstancedMesh` pro Kachel.
  - Übergang: Dithering über 1,5 m (Alpha-Test-Rauschen im Blatt-Shader, kein Transparenz-Sortieren).
- **Ziel:** Restliche Wald-Dreiecke −50 %. Gesamt pro Frame ≤ 0,6 Mio.

### 2.4 Impostor für ferne Bäume
- **Was:**
  - Für die 6 Baummodelle (Pine_1–4, CommonTree_1, TwistedTree_2) je ein **Oktaeder-Impostor** baken: 8 × 8 Ansichten à 128 px, Farbe + Normale, eine Atlas-Textur KTX2 pro Modell (~150 KB).
  - Bake-Skript `tools/build-impostors.mjs` (three.js headless wie in `tools/perf`).
  - Gezeichnet als ein `InstancedMesh` aus Quads pro Modell, Shader wählt die Ansicht.
  - Ab > 30 m statt LOD2. Bei Nebel ab ~40 m ist der Unterschied nicht zu sehen.
- **Einfachere Alternative**, falls Oktaeder zu aufwendig ist: Kreuz-Billboards (2 gekreuzte Quads mit gebackener Seitenansicht). Für die stilisierten Kiefern reicht das aus der Third-Person-Kamera vermutlich.
- **Reihenfolge:** erst 2.2 + 2.3 messen. Impostor nur, wenn die Ziele nicht erreicht sind.

### 2.5 Schatten gezielt
- **Wo:** `core.ts:25,34–35`, `daynight.ts:52`.
- **Was:**
  1. **Schattenkamera folgt dem Spieler**, auf Texel gerastet gegen Flimmern. Fläche ±14 m statt ±19 m fest um die Mitte. Das gibt schärfere Schatten am Feld bei gleicher Karte.
  2. **Schattenkarte nur neu zeichnen, wenn nötig:**
     - `shadowMap.autoUpdate = false`, `needsUpdate = true` alle 3 Frames bzw. wenn Sonne/Spieler sich spürbar bewegt hat.
     - Die bewegten Figuren (Spieler, Tiere) bekommen einen günstigen Blob-Schatten als Ergänzung, falls das Nachziehen sichtbar ist.
     - Alternative ohne Nachziehen: zwei Schattenkarten (statisch selten + dynamisch klein) ist aufwendiger. Erst ausprobieren, ob „alle 3 Frames“ genügt.
  3. **Blätter werfen nur nah Schatten:**
     - Blatt-Meshes bekommen `castShadow` nur in Kacheln < 20 m vom Spieler.
     - Ferne Bäume werfen gar keinen Schatten (Nebel).
     - Bake-Flag `cast` aus 2.1.
     - Messung heute: Blätter-Schatten 17…18 % GPU.
  4. **Handy: PCF statt PCFSoft** (−10 % dort), Schattenkarte 1024.
- **Ziel:** Schattenpass −60 % gegenüber heute.

**Abnahme Phase 2:**
- `all.sh` + `bake-check.cjs`.
- Dreiecke Tag am Feld ≤ 0,6 Mio.
- Handy-Tag ≤ 16 ms CPU.
- Kein sichtbares Aufploppen bei normalem Laufen (Video-Check mit `tools/perf` + Playwright-Recording über 3 Wege: Feld → Brunnen → Waldrand).

---

## 4. Phase 3 – Boden-Shader (Schichten bleiben, ~2–3 Tage)

Prinzip: Alles vorberechnen, was nur von der Position abhängt und sich nie ändert. Die Schichten, ihre Texturen und die zerfransten Ränder sehen danach gleich aus.

### 3.1 Top-4-Schichten pro Texel vorbacken
- **Wo:** `terrain.ts` (`GroundWeights`, `layeredGround`), Bake beim Laden (oder im Editor beim Speichern).
- **Was:**
  - Auf der CPU aus den 16 Gewichten pro Texel (512²) die **4 stärksten** Schichten bestimmen. Gemessen sind fast immer ≤ 3 aktiv; 4 reichen für 99,6 % der Texel.
  - Das Ergebnis in **2 Texturen** speichern: Index-Textur `RGBA8` (4 Slot-Nummern) + Gewicht-Textur `RGBA8`.
  - Dabei schon die **zerfransten Ränder** einrechnen, also `t[i] = w[i] + (tFbm(...)−.5)·fr` und das Schärfen (`mx`, `qs`). Der Shader liest dann fertige Mischanteile.
    - Damit die Ränder fein genug bleiben: Index/Gewicht in **1024²** baken. Bei 83 m Karte = 8 cm pro Texel.
    - Oder die Rand-Rauschfunktion bleibt als *eine* billige Textur-Rausch-Abfrage im Shader (3.2), und nur die Auswahl wird vorgebacken.
  - Shader: keine 16er-Schleifen mehr, sondern genau 4 feste `layerS`-Aufrufe (bei Gewicht 0 übersprungen). Keine Array-Indizes.
- **Wichtig für den Editor:**
  - Der Editor malt weiter in die 16 Gewichte.
  - Nach jedem Pinselstrich wird nur das betroffene Rechteck neu gebacken (`GroundWeights` hat schon ein Dirty-Rechteck, `terrain.ts:85–95`).
- **Ziel:** Boden −20…25 % des Frames (Messung „6 Slots + 1 Sample + einfaches Rauschen“ = −26 %, das ist noch ohne Vorbacken).

### 3.2 Rauschen aus einer Textur statt aus Rechnung
- **Was:**
  - `tNoise`/`tFbm` (Hash + Interpolation, 3 Oktaven) durch **eine** kachelbare 256²-Rauschtextur (RGBA, 4 Frequenzen in 4 Kanälen) ersetzen.
  - Die Farbvariation `lf`, `lf2` und die Schnee-/Herbst-Werte `n1`, `n3` lesen alle aus diesem einen Sample. Schnee/Herbst sind seit der Neuausrichtung ohnehin aus (nur Sommer); ihr Code kann per `#define` raus.
  - Die niederfrequente Farbvariation (`lf`, `lf2`, Rand-Abdunkeln `rimB`) direkt in die Gewicht-/Index-Bake-Textur als 5. Kanal oder kleine eigene Textur.
- **Ziel:** weitere −5 %.

### 3.3 Anti-Tiling billiger
- **Was:**
  - Heute 2 Farb- + 2 Normalen-Samples pro Schicht (Messung: zweites Sample = −12 %).
  - Nah (< 12 m) bleibt es bei 2 Samples. Weiter weg nur noch 1 Sample. Dort ist Tiling durch die Mipmaps ohnehin weich.
  - Normalen-Map-Samples ab 20 m ganz weglassen (`uNorOn` pro Pixel per Abstand).
- **Ziel:** −6…8 %.

### 3.4 Rand außerhalb der Karte billig
- **Was:** Die Bodenfläche außerhalb der Karte (Rand bis 70 m) bekommt ein eigenes Mesh mit einfachem Lambert-Shader und einer Farbe aus der Basistextur + Rauschtextur, abgedunkelt. Die Karte selbst nur 83 × 83 m mit dem Schichten-Shader.
- **Ziel:** je nach Blickrichtung −5…15 % der Boden-Pixel.

### 3.5 Optional: fertig gebackene Albedo für die Ferne
- **Was:**
  - Einmal beim Laden die gemischte Bodenfarbe als 2048²-Textur rendern (Render-Target, orthografisch von oben).
  - Pixel weiter als ~25 m lesen nur noch diese eine Textur (+ Rauschdetail). Nahe Pixel nutzen die vollen Schichten.
  - Das ist eine Ein-Stufen-Form von Virtual Texturing.
  - Echtes Virtual Texturing (Seiten-Cache, Feedback-Pass) ist für 83 m Karte überdimensioniert und lohnt den Aufwand nicht.
- **Wann:** nur falls 3.1–3.4 das Ziel nicht schaffen.

### 3.6 Texturauflösung
- PC bleibt bei 1024² Farbe + Normale.
- Handy (`lowTex()`) lädt heute 512² Farbe und keine Normalen. Das bleibt so.
- Auflösung ist nicht der Engpass (siehe 1.3), also hier nichts weiter senken.

**Abnahme Phase 3:**
- `ground.cjs` Basis ≤ 1,25 × „einfacher Boden“ (heute 1,9×).
- Sichtvergleich der Schichtränder nah am Feld und am Weg mit Screenshot-Diff (darf leicht abweichen, muss gleich wirken). Basti schaut drauf.

---

## 5. Phase 4 – Qualitätsstufen und Feinschliff (~1–2 Tage)

### 4.1 Qualitätsstufen im Optionsmenü
- **Wo:** `core.ts:45–49` (QUAL-Presets gibt es schon), Optionsseite.
- **Was:** Die Presets um die neuen Hebel erweitern:

  | | Niedrig (Handy-Standard) | Mittel | Hoch (PC-Standard) |
  |---|---|---|---|
  | Pixel-Ratio | 1 (max 0,75 × DPR) | 1,25 | DPR (max 2) |
  | Schatten | 1024, PCF, nur Spieler/Bäume nah | 2048, PCFSoft | 2048, PCFSoft |
  | Bloom | aus oder ½ Auflösung, 3 Mips | ½ Auflösung | voll |
  | LOD-Abstände | ×0,7 | ×1 | ×1,3 |
  | Gras-Dichte | 60 % | 100 % | 100 % |
  | Boden-Normalen | aus | nah | nah + mittel |

- **Automatik:** Die ersten 5 s nach Spielstart die Frame-Zeit messen. Liegt sie über 25 ms, eine Stufe runter (einmalig, gespeichert). In den Optionen ist es als Symbol sichtbar, ohne Erklärtext (Spielregel).
- **Dynamische Auflösung (optional):** Pixel-Ratio in Schritten von 0,1 zwischen 0,7 und 1 nachführen, wenn die Frame-Zeit länger als 2 s über dem Ziel liegt.

### 4.2 Nacht-Tiere und Spielfigur
- **Problem:** Nacht-Tiere haben ~10–17k Dreiecke pro Tier, Farmer ~14k.
- **Was:** Skinned Meshes in `tools/build-*.mjs` mit `simplify` auf ~5k (Tiere) bzw. ~8k (Farmer). Das bewahrt Silhouette und Rig-Gewichte. Ab 15 m eine LOD-Stufe mit ~1,5k.
- Ein Material pro Tierart (siehe 1.9).
- **Ziel:** Nacht mit 12 Tieren −100k Dreiecke, weniger Skinning-CPU.

### 4.3 Weizen-Ähren
- **Problem:** Die Kapsel-Ähren sind gemessen teuer pro Feld.
- **Was:** Statt Kapselgeometrie eine flache, gekreuzte Ähren-Karte mit Alpha-Test, oder Kapsel mit 4 statt 8 Segmenten. Als `InstancedMesh` pro Feld (passt zu 1.3).

### 4.4 Laden
- `welt.baked.json` (2.1) und Opus-Sounds (1.7).
- `basis`-wasm nur laden, wenn KTX2 wirklich gebraucht wird (Menü).
- Ziel: Handy ≤ 5 MB bis spielbar.

---

## 6. Problematische Assets (Übersicht)

| Asset | Dreiecke/Instanz | Instanzen | Problem | Maßnahme |
|---|---|---|---|---|
| TwistedTree_2 | ~4.340 | wenige | teuerster Baum | LOD1/2 + Impostor (2.3/2.4) |
| CommonTree_1 | ~3.190 | | sehr dichte Blätter | LOD, Blätter ausdünnen |
| Pine_4 | ~1.950 | 128 | **250k Dreiecke gesamt**, 40 Stück > 15 m entfernt | LOD + Impostor, 9 fest LOD2 (> 25 m) |
| Pine_1 | ~1.850 | 112 | 207k gesamt | LOD + Impostor |
| Pine_3 / Pine_2 | ~2.020 / 1.770 | | | LOD + Impostor |
| Bush_Common_Flowers | ~1.370 | | Busch nah am Weg | LOD1 ab 15 m |
| Rock_Medium_3 | ~520 | | Median 20 m vom Weg, 25 Stück > 25 m | fest LOD1 im Bake |
| Fern_1 | 288 | 155 | 5 komplett im Fels, 2 nie sichtbar | 7 im Bake entfernen; LOD1 ab 15 m |
| Nacht-Tiere | 10–17k | bis ~12 | zu fein für die Kamera-Entfernung | auf ~5k reduzieren (4.2) |
| Farmer/Spielfigur | ~14k | 1–4 | | auf ~8k (4.2) |
| Weizen-Ähren | Kapseln | pro Feld | viele kleine Kapseln | Karten/Instancing (4.3) |
| Feldplatz-Ansicht | ~115 Objekte | 68 | 7.800 unsichtbare Objekte | lazy + Instancing (1.3) |
| Bodenfläche | 223 × 223 m | 1 | voller Shader im Außenrand | Rand-Mesh billig (3.4) |
| Sounds | 114 WAV, 9,1 MB | | alle auf einmal | Opus + nach Bedarf (1.7) |

---

## 7. Reihenfolge und Aufwand

| Schritt | Aufwand | Erwarteter Gewinn | Risiko |
|---|---|---|---|
| 1.1 keine Welt im Buch | ½ Tag | Abend/Buch ≈ gratis | gering |
| 1.2 HUD-Layout | ½ Tag | Handy −4 ms | gering |
| 1.3 + 1.4 Feldplätze lazy, statische Matrizen | 1 Tag | Handy −6…8 ms | mittel (Plot-Zustände testen) |
| 1.5 Nebel/far | 1 h | Grundlage für Phase 2 | gering (Sichtprüfung) |
| 1.6–1.9 Post, Ton, Menü | 1 Tag | Handy GPU −10 %, −7 MB | gering |
| 2.1 Bake-Skript | 1 Tag | Daten + Grundlage | gering, Editor unberührt |
| 2.2 Kacheln | 1 Tag | Wald −55 %, Schatten −70 % | gering |
| 2.5 Schatten | 1 Tag | Schatten −60 % | mittel (Flimmern) |
| 2.3 LOD | 1–2 Tage | Wald −50 % vom Rest | mittel (Blätter-Optik) |
| 2.4 Impostor | 1–2 Tage | optional | mittel |
| 3.1–3.4 Boden | 2–3 Tage | Boden ≈ halbiert | mittel (Rand-Optik) |
| 4.x Stufen, Tiere, Ähren | 1–2 Tage | Handy-Sicherheit | gering |

**Empfehlung:**
- Phase 1 komplett als ein PR. Danach neu messen.
- Dann 2.1 + 2.2 + 2.5 als zweiter PR. Das ist der größte GPU-Gewinn bei kleinstem Optikrisiko.
- Danach LOD (2.3) und Boden (3.x) je als eigener PR, mit Screenshot-Vergleich für Basti.
- Impostor und gebackene Ferne-Albedo nur, wenn danach noch nötig.

## 8. Messen und Absichern (für jeden PR)

1. Dev-Server auf `:5173`, dann `tools/perf/all.sh` (PC + Handy 4×, Tag/Nacht/Abend/Buch/Editor) → `tools/perf/out/*.json`. Vorher-/Nachher-Tabelle in den PR.
2. `ground.cjs pc` bei Boden-Änderungen, `pvs.cjs` + `inrock.cjs` bei Welt-Änderungen.
3. Screenshot-Vergleich an festen Kamerapositionen (neues `tools/perf/shots.cjs`: Feld nah, Feld 10 m, Brunnen, Waldrand, Kartenrand; Tag + Nacht).
4. Editor öffnen, malen, speichern, Spiel neu laden. Der Bake muss die Änderung übernehmen.
5. Erst dann mergen (Merge-Regel: direkt, danach melden).

---

## 9. Umsetzungsstand (22.11.2026, PR „Performance Phase 1–3“)

Umgesetzt, gemessen im selben Lauf gegen den alten Stand (`main` vorher), Headless-Chromium mit SwiftShader. Die Messungen streuen auf dieser Maschine um etwa ±15 %.

| Szene | vorher CPU/Frame | nachher | Dreiecke vorher → nachher |
|---|---|---|---|
| Handy 4×, Tag | 35,4 ms | 28,5–30,7 ms | 1,87 Mio. → 0,31 Mio. |
| Handy 4×, Nacht | 42,9 ms | 29–34 ms | 1,98 Mio. → 0,41 Mio. |
| PC, Tag | 8,5 ms | 5,8–6,2 ms | 1,89 Mio. → 0,38 Mio. |
| PC, Nacht | 10,2 ms | 6,5–8,0 ms | 2,01 Mio. → 0,47 Mio. |
| Handy, Buch offen | 35,4 ms | **0,2 ms** (keine Draw Calls) | → 0 |
| Handy, Abend im Haus | 32,7 ms | **0,1 ms** | → 0 |
| Sounds nach dem ersten Klick | 9,1 MB (meist WAV) | **2,9 MB** (alles MP3, inkl. der neuen Kampf-Sounds) | |

Was drin ist:
- **1.1:** Unter dem Buch (Abend und Tagesbuch) wird die Welt weder animiert noch gezeichnet. Das Canvas behält das letzte Bild als unscharfen Hintergrund. Das Kaminfeuer läuft mit 20 statt 30 fps.
- **1.2:** Die Viewport-Größe wird bei `resize` gemerkt (`VP` in `core.ts`) und im Frame nicht mehr gelesen. HP/XP-Balken und Uhr schreiben nur bei Änderung. Die Schwebezahlen nutzen echtes `dt`.
- **1.3/1.4:**
  - Feldplätze bauen ihre 3D-Ansicht erst, wenn sie offen sind.
  - Statische Teile haben `matrixAutoUpdate = false`.
  - Versteckte Teilbäume werden beim Matrix-Update pro Frame übersprungen und beim Wiederanzeigen nachgeführt (`core.ts`).
  - Die Szene hat jetzt ~2.500 statt 9.400 Objekte.
- **1.5:** Der Nebel misst vom Kamera-Ziel statt von der Weltmitte. `camera.far` folgt dem Nebel.
- **1.6:** `antialias:false` (mit Composer ohnehin wirkungslos).
- **1.7:**
  - Alle Clips liegen als MP3 vor. Ein Name ohne Endung lädt erst `.mp3`, dann `.wav`, damit frisch geschnittene Clips weiter funktionieren.
  - Die Ambient-Loops nutzen dieselben Loop-Grenzen wie der Regen.
- **2.1:** `public/world/hidden.json` (aus `tools/perf/hidden.cjs`) enthält 7 nie sichtbare Objekte und 5 Farne im Fels. Das Spiel lässt sie beim Laden weg, der Editor zeigt alle.
- **2.2:**
  - Der Wald ist in 16-m-Kacheln aufgeteilt, ein InstancedMesh pro Modell, Material und Kachel (`src/world/props.ts`).
  - three.js cullt Kacheln außerhalb von Kamera und Schattenkamera.
  - Allein das hat die Dreiecke pro Frame um ~80 % gesenkt.
- **2.3:**
  - Fern-Versionen `<Modell>__lod1` für 26 Modelle (`tools/build-lod.mjs`, in `nature.glb`): Rinde und Felsen mit meshopt vereinfacht, Blattkarten ausgedünnt und die übrigen vergrößert.
  - Kacheln ab 24 m Abstand zur Kamera zeigen sie (2 m Hysterese).
  - Insgesamt 56.900 → 20.500 Dreiecke über alle Modelle.
  - Der Editor zeigt immer die vollen Modelle.
- **2.5:** Blattkronen werfen nur in Kacheln bis 26 m vom Spieler Schatten. Stämme, Felsen und Büsche behalten ihren.
- **3:**
  - Der Boden-Shader läuft nur über die tatsächlich genutzten Schicht-Slots (Konstante beim Kompilieren, neu bei geänderter Slot-Zahl).
  - Unbenutzte Gewichtstexturen werden nicht gelesen.
  - Die Schichten selbst sind unverändert.

**Korrektur zu 1.4 der Messergebnisse:** Die Schattenkamera ist nicht fest. `FarmView.sun()` passt sie jedes Frame an das an, was die Kamera sieht. Teuer war nur, dass der ungekachelte Wald immer komplett in die Schattenkarte gezeichnet wurde. Das ist mit 2.2 behoben.

**Sichtprüfung:**
- `tools/perf/shots.cjs` fotografiert 7 feste Kamerapositionen (Feld nah/weit, Haus, zwei Waldränder, flach über das Gras, Nacht).
- Vorher und nachher zeigen keinen sichtbaren Unterschied am Wald. Abweichungen gibt es nur bei zufälligen Dingen wie Figur, Quests und Wildpflanzen.

**Noch offen (nächste Schritte):**
- Impostor für sehr ferne Bäume (2.4), falls nötig.
- Boden-Vorbacken der Top-4-Schichten (3.1).
- Rauschtextur (3.2).
- Qualitätsstufen-Automatik (4.1).
- Tiere und Farmer vereinfachen (4.2).
- Weizen-Ähren (4.3).
- Auf dem Handy dominiert jetzt die CPU-Seite von three.js (Szenen-Walk, Frustum-Tests, Draw Calls, zusammen ~23 ms bei 4× Drosselung). Der nächste große Hebel wäre `BatchedMesh` pro Kachel und weniger Einzelobjekte bei Figuren und Gebäuden.

Neue Werkzeuge:
- `tools/build-lod.mjs`: Fern-Versionen erzeugen. Nach jedem `build-nature.mjs` erneut laufen lassen.
- `tools/perf/hidden.cjs`: Liste unsichtbarer Objekte nach Änderungen im Welt-Editor neu erzeugen, nach `pvs.cjs` und `inrock.cjs`.
- `tools/perf/shots.cjs`: Sichtvergleich.
- `run.cjs` mit `URL=` und `TAG=` für Vorher-/Nachher-Läufe.
