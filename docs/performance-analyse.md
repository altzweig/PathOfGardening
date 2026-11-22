# Performance-Analyse PathOfGardening

Stand: 22.11.2026, Commit `dac5c21` (main). Nur Analyse, noch keine Code-Änderungen am Spiel.
Messskripte liegen in `tools/perf/` (Anleitung am Ende), damit sich jede Zahl nachmessen lässt.

## Kurzfassung

- **Die GPU bekommt pro Frame rund 2 Mio. Dreiecke**, obwohl man nur einen kleinen Teil des Waldes sieht. Der Wald ist pro Modell
  eine einzige InstancedMesh über die ganze Karte, damit greift kein Frustum-Culling, weder im Bild noch im Schattenpass.
  Wald aus: **−43 % (PC) / −45 % (Handy) GPU-Zeit**.
- **Schatten** zeichnen fast den kompletten Wald ein zweites Mal (≈1 Mio. Dreiecke, +240 Draw Calls). Schatten aus: **−29 % / −31 %**.
- **Der Boden-Shader** ist der teuerste Pixel-Shader (16-Schichten-Schleife, viele Rausch-Funktionen pro Pixel).
  Einfaches Bodenmaterial: **−39 % / −28 %**.
- **Auf dem Handy ist die CPU das Limit**: mit 4× CPU-Drossel (≈ Mittelklasse-Handy) braucht allein das JavaScript pro Frame
  **38 ms am Tag, 45 ms in der Nacht**, also höchstens 22–26 fps, bevor die GPU überhaupt etwas tut.
  Hauptgründe: 9.400 Szenen-Objekte (8.850 davon unsichtbar) werden jeden Frame neu durchgerechnet, und das HUD erzwingt jeden
  Frame ein synchrones Layout (≈4 ms).
- **Es wird gerendert, was niemand sieht**: im Abend-Buch läuft die komplette 3D-Szene weiter (gleiche GPU-Last wie am Tag),
  beim Buch am Tag wird die pausierte Szene jeden Frame neu gezeichnet und zusätzlich live geblurrt.
- Laden: ok für das Spiel selbst (6,4 MB bis zum Menü), aber beim ersten Klick werden **alle 122 Sounds als WAV** (9 MB) auf einmal
  geladen und dekodiert.

Mit den Quick Wins aus der Roadmap (alle Aufwand S, ohne sichtbaren Optikverlust) ist auf dem Handy grob eine Halbierung der
CPU-Zeit pro Frame und ein Drittel weniger GPU-Last realistisch; mit Phase 2 (Wald-Kacheln + LOD, Boden-Shader) noch einmal
deutlich mehr.

## 1. Messaufbau

| | |
|---|---|
| Build | `npm run build` (Vite 5, three 0.160), Szenen im Dev-Server gemessen (gleicher Code, Module direkt erreichbar), Ladezeit im Produktions-Build (`vite preview`) |
| Browser | Headless Chromium (Playwright), WebGL2 über **SwiftShader** (Software-GPU, keine echte Grafikkarte im Container) |
| PC | 1920×1080, DPR 1, Qualität „Hoch“ (pixelRatio 1, Shadow-Map 2048, Bloom) |
| Handy | 393×852 bei DPR 3, Touch, Qualität „Mittel“ (pixelRatio 1,5 → 589×1278 px, Shadow-Map 1024, Bloom), CPU-Drossel 4× per DevTools-Protokoll, Netzwerk für Ladezeit 9 Mbit/s / 60 ms |
| Szenen | Menü (Kamera kreist), Tag (neues Spiel, 60 s vorgespult, 3 Felder), Nacht (bis Welle 3 vorgespult, ~10 Tiere), Buch am Tag (Taste B), Abend (Haus-Buch), Welt-Editor |

**Wie die Zahlen zu lesen sind**

- **CPU ms/Frame** = gesamte JavaScript-Zeit eines Frames (Simulation, HUD, Animation, three.js-Szenengraph, Culling,
  Uniform-Uploads, WebGL-Aufrufe). Gemessen mit unterdrückten Draw-Befehlen (alle three.js-Arbeit läuft, nur die eigentlichen
  `drawElements`-Aufrufe werden verworfen), damit die Software-GPU die CPU-Messung nicht verfälscht. Diese Zahlen sind realistisch.
- **GPU ms (SwiftShader)** = Zeit, bis die Software-GPU einen Frame fertig gerastert hat. Die absoluten Werte sind 50–100× langsamer
  als eine echte GPU und **keine fps-Prognose**. Sie zeigen aber zuverlässig die *Anteile*: wird ein Feature abgeschaltet, sinkt
  die Zeit um seinen Anteil an Vertex- und Pixelarbeit. Darauf beruhen die Abschalt-Experimente (Abschnitt 3).
  Streuung ±5–10 % (wenige Frames pro Variante).
- Draw Calls, Dreiecke, Programme, Geometrien, Texturen aus `renderer.info` (alle Passes eines Frames zusammen, inkl. Schattenpass).

## 2. Messtabelle pro Szene

### PC (1920×1080, Hoch, ohne CPU-Drossel)

| Szene | CPU ms Mittel / P95 | davon three.js-Render (CPU) | Draw Calls | Dreiecke | Shader-Programme | GPU ms (SwiftShader) | JS-Heap |
|---|---|---|---|---|---|---|---|
| Menü | 16,8 / 24,2 | 15,6 | 438 | 1,88 Mio. | 70 | – | 88 MB |
| Tag | 8,3 / 9,2 | 7,0 | 390 | 1,95 Mio. | 79 | 3557 | 93 MB |
| Nacht (Welle 3) | 8,5 / 9,9 | 7,2 | 507 | 2,07 Mio. | 82 | 3348 | 95 MB |
| Buch am Tag | 8,2 / 10,7 | 6,9 | 391 | 1,95 Mio. | 62 | 3499 | 92 MB |
| Abend (Haus-Buch) | 11,8 / 9,8 | 10,7 | 255 | 1,88 Mio. | 84 | 3837 | 92 MB |
| Welt-Editor | 4,2 / 6,1 | 3,9 | 489 | 1,75 Mio. | 70 | 3270 | 75 MB |

Auffällig: im **Buch am Tag** fällt die Bildrate selbst ohne GPU-Arbeit von 43 auf 8 fps (Frame-Abstand 121 ms statt 23 ms):
der `backdrop-filter: blur(7px)` über der jeden Frame neu gezeichneten Szene kostet den Compositor mehr als das ganze Spiel.

### Handy (589×1278 Render-Auflösung, Mittel, **4× CPU-Drossel**)

| Szene | CPU ms Mittel / P95 | ⇒ max. fps nur durch CPU | davon three.js-Render | davon Spiel-Tick (Sim+HUD) | Draw Calls | Dreiecke | GPU ms (SwiftShader) |
|---|---|---|---|---|---|---|---|
| Menü | 32,9 / 42,7 | 30 | 24,9 | – | 308 | 1,80 Mio. | 2515 |
| Tag | **38,4 / 57,4** | **26** | 28,7 | 4,8 (HUD 4,2) | 335 | 1,92 Mio. | 1503 |
| Nacht (Welle 3) | **44,9 / 65,4** | **22** | 33,6 | 5,5 (HUD 4,6) | 446 | 2,06 Mio. | 1507 |
| Buch am Tag | 36,3 / 55,5 | 27 | 29,4 | – | 339 | 1,92 Mio. | 1540 |
| Abend (Haus-Buch) | 32,6 / 46,9 | 30 | 25,3 | – | 227 | 1,86 Mio. | 1401 |
| Welt-Editor | 19,2 / 31,1 | 52 | 17,6 | – | 256 | 1,69 Mio. | 1460 |

Ohne Drossel (schnelles Handy): Tag 6,4 / 8,9 ms, Nacht 8,0 / 10,4 ms CPU. JS-Heap 65–68 MB.

**GC-Druck ist kein Problem**: 3–5 MB/s Allokationen bei 4×, Garbage Collector 0,3–1,7 % der aktiven CPU-Zeit.
Die größten Allokateure (three.js `getParameters`, `updatePlot`, `fadeObj`) sind Kleinkram.

### CPU-Profil (Handy Tag, 4×, Selbstzeit in % der aktiven JS-Zeit)

| Funktion | % | Bedeutung |
|---|---|---|
| `Object3D.updateMatrixWorld` (three) | 22,5 | Matrizen aller 9.400 Objekte, auch der unsichtbaren |
| `FarmView.screen` (`src/farm/view/farmView.ts:962`) | 8,7 | wird nur 1× pro Frame aufgerufen, liest aber `innerWidth`/`innerHeight` direkt nach HUD-Stilwerten ⇒ **erzwungenes Layout** |
| `multiplyMatrices` (three) | 6,7 | Teil der Matrix-Updates |
| `projectObject`, `intersectsObject` (three) | 5,7 | Culling-Durchlauf über den Szenengraphen |
| `renderBufferDirect`, `setProgram`, `renderObject`, Uniform-Uploads (three) | ≈12 | Kosten pro Draw Call |
| `getParameters`, `getProgram`, `getProgramCacheKey` (three) | ≈3,6 | einmal pro Messfenster wurden alle Materialien neu ausgewertet (Lichtzustand wechselt) ⇒ Mini-Ruckler |
| `updatePlot` (`farmView.ts:367`) | 1,1 | 68 Feldplätze pro Frame, auch geschlossene |
| `sim.update` gesamt | < 0,5 ms | Simulation, Pathfinding und Kollision sind **kein** Engpass |

Spielfigur, Tieranimation (prozedural, Skinned Meshes), Feld-Timer, Kamera-Okklusion (läuft im Shader, nicht per Raycast),
Pathfinding (`nav.ts`, max. 3–6 Suchen/Frame) liegen jeweils unter 1,1 ms bei 4× Drossel.

## 3. Abschalt-Experimente (GPU-Anteile)

Tag-Szene, gleiche Kameraposition, nur ein Feature geändert. Werte: SwiftShader-ms pro Frame und Änderung gegenüber Basis.

| Variante | PC 1280×720 Hoch | Handy 589×1278 Mittel | Dreiecke/Frame | Draw Calls |
|---|---|---|---|---|
| **Basis** | 1978 | 1341 | 2,02 Mio. | 403 / 349 |
| ohne Wald/Props | 1120 (**−43 %**) | 741 (**−45 %**) | 0,29 Mio. | 329 |
| ohne Schatten | 1398 (**−29 %**) | 930 (**−31 %**) | 1,00 Mio. | 161 |
| Boden: einfaches Material (Basis-Wdh. 1961 / 1205) | 1192 (**−39 %**) | 869 (**−28 %**) | gleich | gleich |
| Blätter/Nadeln werfen keinen Schatten | 1613 (−18 %) | 1115 (−17 %) | 1,54 Mio. | 382 |
| ohne Gras | 1711 (−13 %) | 1209 (−10 %) | 1,98 Mio. | 390 |
| Shadow-Map 1024 statt 2048 | 1722 (−13 %) | (ist schon 1024) | gleich | gleich |
| ohne Bloom | 1811 (−8 %) | 1141 (−15 %) | gleich | −10 |
| PCF statt PCFSoft | 1912 (−3 %) | 1200 (−10 %) | gleich | gleich |
| ohne die 3 Punktlichter (tagsüber Intensität 0) | −4 % | −8 % | gleich | gleich |
| Pixel Ratio × 0,5 | 986 (**−50 %**) | 613 (**−54 %**) | gleich | gleich |
| Pixel Ratio × 0,1 (≈ nur Vertexarbeit übrig) | 607 (−69 %) | 423 (−68 %) | gleich | gleich |
| Kombination pr 1, ohne Schatten, ohne Bloom | 1294 (−35 %) | 481 (**−64 %**) | 1,00 Mio. | 147 / 137 |
| ohne Post-Processing, direkt aufs Canvas | 2012 (±0) | 1385 (±0) | | |

Lesart: Bei pixelRatio 0,1 bleiben ~30 % der Zeit übrig, das ist fast reine Vertex-/Dreiecksarbeit (2 Mio. Dreiecke).
Die übrigen ~70 % sind Pixelarbeit (Boden-Shader, Blätter mit alphaTest, Schatten-Filterung, Post-Processing).
„Direkt aufs Canvas“ spart nichts, weil das Canvas mit `antialias: true` angelegt ist und dann 4×-MSAA rendert,
was das Post-Processing sonst gar nicht nutzt (siehe Punkt 8).

## 4. Top-10-Kostenstellen nach Impact

Gewinn = geschätzte Einsparung gegenüber heute auf dem jeweils betroffenen Teil (GPU oder CPU). Aufwand S ≤ 1 Tag, M 2–4 Tage, L > 1 Woche.

### 1. Wald ohne Culling und mit vollem Detail überall (GPU, Vertex + Schatten)

- **Beleg**: Wald aus −43 % / −45 % GPU, −1,73 Mio. Dreiecke pro Frame. Größte Posten: `Pine_4` 250k, `Pine_1` 207k, `Pine_2` 71k,
  `Bush_Common_Flowers` 62k, `Fern_1` 45k Dreiecke. `src/view/nature.ts:187-199`: `instance()` baut **eine InstancedMesh pro Modell
  und Material für die ganze Karte** und ruft `computeBoundingSphere()` über alle Instanzen. Die Kugel umfasst den ganzen Waldring,
  liegt also immer im Sichtfeld: three.js zeichnet jede Instanz, auch die hinter der Kamera und hinter dem Nebel, und das im
  Hauptpass **und** im Schattenpass. Die Graskacheln (`hofWorld.ts:236`, 10-m-Kacheln) machen es schon richtig.
- **Maßnahme**: Props wie das Gras in räumliche Kacheln aufteilen (z. B. 16 m × 16 m, eine InstancedMesh pro Modell und Kachel),
  dann culled three.js automatisch im Bild und im Schattenfrustum. Dazu 2 LOD-Stufen für Bäume und Büsche (meshopt `simplify`
  auf 50 % / 20 % im Build-Skript `tools/build-nature.mjs`), Umschalten pro Kachel nach Entfernung; Kacheln jenseits von `fog.far`
  ganz ausblenden.
- **Gewinn**: −50–70 % Dreiecke, −25–35 % GPU-Zeit, dazu weniger Schatten-Draw-Calls. **Aufwand M. Risiko Optik: gering**
  (LOD-Wechsel liegt im Nebel/Entfernung, Editor-Picking muss die Kachel-Indizes kennen).

### 2. Schatten: ganzer Wald im Schattenpass, jeden Frame neu (GPU)

- **Beleg**: Schatten aus −29 % / −31 %, Schattenpass ≈1 Mio. Dreiecke und +242 Draw Calls. Blätter ohne Schatten allein −18 %.
  261 Schattenwerfer mit 958k Dreiecken (Census Tag). Shadow-Map 2048 + `PCFSoftShadowMap` (`src/view/core.ts:25`, `:46`).
  Das Schattenfrustum wird zwar schon an die Kamera angepasst (`farmView.ts:928 sun()`), nützt aber wegen Punkt 1 nichts.
- **Maßnahme**: (a) kommt größtenteils mit Punkt 1 (Culling im Schattenfrustum). (b) Bäume/Blätter nur innerhalb ~25–30 m um den
  Spieler Schatten werfen lassen (pro Kachel `castShadow`). (c) Die Sonne bewegt sich über 480 s sehr langsam: Shadow-Map nur alle
  2–4 Frames oder bei merklicher Kamera-/Lichtbewegung neu zeichnen (`renderer.shadowMap.autoUpdate = false`, `needsUpdate`
  gezielt setzen; Spielfigur/Tiere ggf. in eigener kleiner Map oder als Blob-Schatten). (d) Mobile: PCF statt PCFSoft.
- **Gewinn**: −20–30 % GPU. **Aufwand S–M. Risiko: gering** (bei (c) leichtes Nachziehen bewegter Schatten, deshalb Figur getrennt).

### 3. Boden-Shader (GPU, Pixel)

- **Beleg**: einfaches Bodenmaterial −39 % (PC, mit Normalmaps) / −28 % (Handy, ohne Normalmaps). Der Boden füllt den Großteil des
  Bildes. `src/view/terrain.ts:120-160` (`layeredGround`): pro Pixel 4 Gewichts-Texturen, Schleife über 16 Schichten mit je einem
  `tFbm` (3 Value-Noise = 12 Hashes), pro aktiver Schicht 2 Farb- **und** 2 Normal-Samples mit `textureGrad` (Anti-Tiling),
  danach noch 4 weitere `tFbm` (Farbvariation, Schnee, Rand) und die volle PBR-Beleuchtung mit 5 Lichtern + PCFSoft-Schatten.
- **Maßnahme**: Rauschen aus einer kleinen, gekachelten Noise-Textur lesen statt rechnen (1 Sample ersetzt ~12 Hashes);
  die Gewichte pro Texel vorab auf die stärksten 3–4 Schichten reduzieren (Index + Gewicht in eine Textur backen, statt 16er-Schleife);
  großflächige Farbvariation und Randabdunklung einmalig in die Gewichts-/Farbkarte backen; auf Mittel/Niedrig nur 1 Sample pro
  Schicht (Anti-Tiling über die Noise-Textur), auf Hoch wie heute. Boden als `MeshLambertMaterial` auf Niedrig.
- **Gewinn**: −20–30 % GPU. **Aufwand M. Risiko Optik: gering–mittel**, nur mit Vorher/Nachher-Screenshots umsetzen
  (Regel „Texturen natürlich mischen, kein sichtbares Tiling“ muss erhalten bleiben).

### 4. 9.400 Szenen-Objekte, davon 8.850 unsichtbar, jeden Frame durchgerechnet (CPU)

- **Beleg**: `updateMatrixWorld` + `multiplyMatrices` ≈ 29 % der JS-Zeit (≈ 8–10 ms pro Frame bei 4× Drossel). Census: 9.421 Objekte,
  8.847 unsichtbar, alle mit `matrixAutoUpdate`. Ursache: Die Welt hat **68 Feldplätze**, und für jeden wird beim Start die
  komplette Feld-Ansicht gebaut (`farmView.ts:300-330 makePlot`, aufgerufen in `:260`): 30 einzelne Saatkorn-Meshes, 70 Meshes
  für den zertrampelten Boden, Balken (je 3 Meshes), Timer-/Namens-Sprites mit eigener Canvas-Textur, Tropfen-Sprite usw.
  (~115 Objekte pro Feld), obwohl am Anfang nur 3 Felder offen sind. three.js überspringt unsichtbare Objekte beim Zeichnen,
  **aber nicht beim Matrix-Update**. Zusätzlich läuft `updatePlot` jeden Frame für alle 68 Plätze.
- **Maßnahme**: Feld-Ansichten erst bauen, wenn ein Feld geöffnet wird; Saatkörner und zertrampelten Boden je als eine InstancedMesh
  (oder zusammengeführte Geometrie) statt 100 Einzelmeshes; versteckte Gruppen aus der Szene nehmen statt `visible = false`;
  statische Objekte (Gebäude, Beete, Zäune) mit `matrixAutoUpdate = false` + einmal `updateMatrix()`.
  `updatePlot` für geschlossene Felder überspringen.
- **Gewinn**: CPU −25–30 % (Handy ≈ −8 ms/Frame). **Aufwand S–M. Risiko: keins** (Optik unverändert).

### 5. Erzwungenes Layout durch das HUD (CPU, DOM)

- **Beleg**: `hud.update` 4,2 ms (Tag) / 4,6 ms (Nacht) bei 4× auf dem Handy, auf dem PC 0,2 ms. Im Profil steht `FarmView.screen`
  (`farmView.ts:962`) mit 8,7 % Selbstzeit, obwohl es nur 1× pro Frame aufgerufen wird (nachgezählt). Ablauf: `hud.update` schreibt
  Stilwerte (`hud.ts:124` Lebensbalken-`width`, XP-Balken, Labels, `innerHTML`), dann liest `screen()` `innerWidth`/`innerHeight`
  ⇒ der Browser muss sofort das Layout neu berechnen. Dasselbe Muster `innerHeight > innerWidth` steht in `farmView.ts:347, 376,
  395, 685, 884` und kostet z. B. `updateSleep` im Abend 2,5 ms.
- **Maßnahme**: Viewport-Größe einmal im vorhandenen Resize-Handler (`core.ts:95 resize()`) speichern und überall diese Werte
  benutzen; Balken über `transform: scaleX()` statt `width` animieren (kein Layout); DOM-Schreibzugriffe am Frame-Ende bündeln.
- **Gewinn**: Handy −4–6 ms/Frame CPU. **Aufwand S. Risiko: keins.**

### 6. Rendern, was niemand sieht: Abend-Buch, Tages-Buch, Menü (GPU + CPU, Akku)

- **Beleg**: Abend (Haus-Buch, deckt den Bildschirm komplett ab): 255 Draw Calls, 1,88 Mio. Dreiecke, GPU 3837 ms SwiftShader, also
  **genauso teuer wie der Tag**. `main.ts frame()` → `view.frame()` → `composer.render()` (`farmView.ts:878`) läuft in jedem Modus.
  Dazu zeichnet `HouseBg` den Kamin mit 30 fps in ein Canvas, das per CSS `filter: blur(4px)` (`book.css:3`) jedes Mal neu
  geblurrt wird. Buch am Tag: Spiel ist pausiert, die Szene wird trotzdem jeden Frame gerendert und per
  `backdrop-filter: blur(7px)` (`book.css:249`) live geblurrt ⇒ Frame-Abstand 121 ms statt 23 ms (PC, ohne GPU-Last gemessen).
  Menü: 3D-Hof im Hintergrund + zweiter WebGL-Kontext mit MSAA für die Figurenvorschau (`startmenu.ts:121`), CPU 16,8 ms (PC) /
  32,9 ms (Handy 4×).
- **Maßnahme**: Im Abend gar nicht 3D rendern (nur Audio/Logik weiter). Buch am Tag: einen letzten Frame rendern, verkleinert in ein
  Canvas kopieren und dort einmal blurren, dann 3D-Rendern pausieren und `backdrop-filter` entfernen. Kamin-Hintergrund in kleinerer
  Auflösung zeichnen und mit vorgeblurrtem Raum (einmal) statt Live-CSS-Filter. Menü: Hof-Hintergrund mit halber Auflösung und
  ohne Schatten-Update rendern; Figurenvorschau ohne MSAA, nur bei Drehung neu zeichnen.
- **Gewinn**: Abend und Buch ≈ −90–100 % GPU (Akku, Hitze, Lüfter), Menü −40–60 %. **Aufwand S. Risiko: keins.**

### 7. Auflösung und fehlende Anpassung an das Gerät (GPU, Pixel)

- **Beleg**: pixelRatio × 0,5 halbiert die GPU-Zeit (−50 % / −54 %), die Pixelarbeit macht ~70 % aus. Handy „Mittel“ rendert mit
  pixelRatio 1,5 (`core.ts:47`), auf 3×-Displays 0,75 Megapixel, dazu die ganze Post-Kette in voller Größe. `gfx.auto` existiert,
  wird aber nirgends ausgewertet (keine automatische Anpassung).
- **Maßnahme**: Dynamische Auflösung: Frame-Zeit über ~1 s mitteln, pixelRatio in Stufen zwischen 0,75 und Maximum anpassen
  (Ziel 60 fps, auf schwachen Geräten 30 fps); Startstufe nach Gerät wählen (Touch, `hardwareConcurrency`, GPU-Name).
  Post-Processing (Bloom) in halber Auflösung rechnen.
- **Gewinn**: −20–40 % GPU auf dem Handy, stabile fps statt Einbrüchen. **Aufwand S–M. Risiko: gering** (Bild minimal weicher, nur wenn nötig).

### 8. Post-Processing-Kette und wirkungsloses MSAA (GPU + Speicher)

- **Beleg**: Pro Frame laufen RenderPass → `cleanPass` → UnrealBloom (5 Mip-Stufen, je 2 Blur-Passes) → `topPass` → `gradePass` →
  `OutputPass`, alles in HalfFloat (`core.ts:52-90`). Bloom aus: −8 % PC / −15 % Handy. Das Canvas wird mit `antialias: true`
  erzeugt (`core.ts:20`), das Bild entsteht aber in den Render-Targets des Composers ohne Multisampling: **das Spiel hat derzeit gar
  keine Kantenglättung**, reserviert aber einen 4×-MSAA-Framebuffer (geschätzt ~66 MB bei 1080p, ~24 MB auf dem Handy).
- **Maßnahme**: `antialias: false`; `cleanPass` + `gradePass` + `OutputPass` zu einem Shader zusammenfassen (Tonemapping und
  Grading in einem Durchgang); Bloom in halber Auflösung, auf Niedrig aus. Kantenglättung bewusst: Hoch = Render-Target mit
  `samples: 4`, Mittel = FXAA im letzten Pass, Niedrig = keine.
- **Gewinn**: −10–15 % GPU, −25–65 MB Grafikspeicher, auf Hoch sogar schönere Kanten. **Aufwand S. Risiko: gering.**

### 9. Zu viele Draw Calls und Materialien (CPU)

- **Beleg**: three.js-Render-CPU 28,7 ms von 38,4 ms (Handy Tag 4×), 335–507 Draw Calls, 79–84 Shader-Programme.
  Nacht +117 Draw Calls: jedes Tier bekommt ein eigenes Material (`animals.ts:416`), nachts eigene Augen-Materialien + 2 Halo-Sprites
  (`farmView.ts:42-53`), Lebensbalken aus 3 transparenten Meshes; Gebäude bestehen aus vielen Einzelmeshes.
- **Maßnahme**: Nach Punkt 1 und 4 fällt ein großer Teil weg. Danach: Materialien pro Tierart teilen (Blitz/Frost per Instanz-Attribut
  oder `onBeforeRender`-Uniform), statische Gebäudeteile pro Material zusammenführen (`mergeGeometries`, three r160 hat auch
  `BatchedMesh`), Balken und Namensschilder als ein Sprite-Atlas.
- **Gewinn**: −30–40 % Draw Calls, Handy −5–8 ms CPU. **Aufwand M. Risiko: gering.**

### 10. Laden: alle Sounds als WAV auf einmal, Shader-Kompilierung (Ladezeit, Speicher)

- **Beleg**: bis zum Menü 6,4 MB (PC) / 4,5 MB (Handy), 52–59 Requests (KTX2 2,8 MB, `nature.glb` 1,33 MB, Basis-Transcoder 0,48 MB,
  `welt.json` 0,44 MB, JS 0,40 MB). Beim ersten Klick lädt `loadSamples()` (`audio.ts:155`) **alle 122 Clips** (114 WAV, 9,1 MB)
  parallel und dekodiert sie: Handy +8,8 MB direkt zum Spielstart, dekodiert liegen sie unkomprimiert im RAM (geschätzt 40+ MB).
  `welt.json` (670 kB) lässt sich kaum komprimieren (eingebettete Malschicht). Bis zum Menü vergingen im Test 25–31 s, das liegt vor
  allem an der Software-GPU (≈80 Shader-Programme kompilieren), auf echten Handys ist das Kompilieren aber auch spürbar.
  JS-Bundle ist unkritisch (three 556 kB / 142 kB gzip, `farmView` 295 kB / 108 kB gzip).
- **Maßnahme**: Sounds als Opus/OGG (Fallback AAC für alte Safari) mit 96 kbit/s: ~1 MB statt 9 MB. Nur laden, was die Szene braucht
  (Nacht-Sounds bei Einbruch der Nacht, Ambiente als Stream). Malschicht der Welt als PNG/Binärdatei statt JSON-Text.
  Shader während des Ladebildschirms mit `renderer.compileAsync(scene, camera)` vorkompilieren und Varianten reduzieren
  (gleiche Optionen für verwandte Materialien).
- **Gewinn**: −80 % Audio-Download, weniger RAM, kein Ruckler beim ersten Nachteinbruch. **Aufwand S. Risiko: keins**
  (96 kbit/s Opus ist von WAV nicht zu unterscheiden).

### Weitere kleinere Funde

- **Punktlichter tagsüber**: Laterne, Fackel und Gartenlicht haben tagsüber Intensität 0, werden aber in jedem beleuchteten Pixel
  berechnet (−4 % / −8 %). Am Tag `visible = false`; die Programm-Variante mit Lichtern im Ladebildschirm vorkompilieren, damit
  der Nachteinbruch nicht ruckelt.
- **Partikel**: `PART.update` (`core.ts:161-172`) rechnet alle 2.400 Partikel jeden Frame in JS und lädt alle 4 Attribute komplett
  hoch, auch wenn kaum welche leben. Nur den aktiven Bereich aktualisieren (`addUpdateRange`) oder auf GPU-Simulation umstellen.
- **Gras**: −13 % / −10 %, alphaTest-Kreuzquads. Dichte pro Stufe passt schon (`hofWorld.ts`), auf Niedrig evtl. nur nahe Kacheln.
- **Tiere**: nachts kommen ~100k Dreiecke für ~10 Tiere dazu (≈10–17k pro Tier, je mit Schatten). Für die kleine Bildschirmgröße
  reicht eine LOD-Stufe mit ~30 %. Wichtig für Koop bis 4 Spieler: jede weitere Spielfigur (~14k Dreiecke, Skinned Mesh + Schatten +
  Brillen-/Augen-Materialien mit `MeshPhysicalMaterial`) sollte für entfernte Spieler eine LOD-Stufe haben.
- **Allokationen pro Frame** in `updatePlot` (`new THREE.Vector3`, Template-String-Schlüssel pro Feld) und `fadeObj` (`traverse`
  mit Closure): harmlos, beim Umbau von Punkt 4 gleich mit erledigen.
- **Nebenbei (kein Performance-Thema)**: Die schwebenden Zahlen im HUD laufen mit festem `n.t += 1/60` (`hud.ts:169`), auf 30-fps-
  Geräten also halb so schnell.

## 5. Priorisierte Roadmap

### Phase 1: Quick Wins (je Aufwand S, keine sichtbare Optikänderung)

| # | Maßnahme | Bezug | Erwartung |
|---|---|---|---|
| 1 | Viewport-Größe cachen, HUD-Balken per `transform`, DOM-Schreiben bündeln | Punkt 5 | Handy −4–6 ms CPU |
| 2 | Abend: kein 3D-Rendern; Buch am Tag: Standbild statt Live-Szene + `backdrop-filter` | Punkt 6 | Abend/Buch −90 % GPU |
| 3 | Feld-Ansichten erst beim Öffnen bauen, Saat/Trampel-Deko instanziert, statische Objekte ohne Auto-Matrix | Punkt 4 | CPU −25–30 % |
| 4 | `antialias: false`, Post-Passes zusammenlegen, Bloom halbe Auflösung | Punkt 8 | GPU −10–15 %, −25–65 MB VRAM |
| 5 | Schatten: Blätter/Bäume nur nah als Werfer, Shadow-Map nicht jeden Frame, Mobile PCF | Punkt 2 (a–d ohne Kacheln) | GPU −15–20 % |
| 6 | Sounds als Opus + szenenweise laden; Punktlichter tagsüber aus; Shader vorkompilieren | Punkt 10, Kleinkram | −8 MB Download, keine Ruckler |

Erwartung nach Phase 1 auf dem Handy (4×): CPU von ~38 ms auf ~22–25 ms pro Frame (≈ 40+ fps möglich), GPU-Last −25–35 %.

### Phase 2: die großen Hebel (Aufwand M)

| # | Maßnahme | Bezug | Erwartung |
|---|---|---|---|
| 7 | Wald in räumliche Kacheln + 2 LOD-Stufen, Culling im Bild und Schattenpass | Punkte 1, 2 | Dreiecke −50–70 %, GPU −25–35 % |
| 8 | Boden-Shader: Noise-Textur, Top-4-Schichten gebacken, Anti-Tiling nur auf Hoch | Punkt 3 | GPU −20–30 % |
| 9 | Qualitätsstufen (unten) + dynamische Auflösung + automatische Startstufe | Punkt 7 | stabile fps auf allen Geräten |
| 10 | Materialien teilen, Gebäude zusammenführen, Balken/Schilder als Atlas | Punkt 9 | Draw Calls −30–40 % |

### Phase 3: wenn mehr gebraucht wird (Aufwand L)

- Impostoren (vorgerenderte Billboards) für den fernen Waldring.
- GPU-Partikel, LOD für Tiere und entfernte Koop-Spieler.
- Erst bei sehr vielen Tieren (geplanter Nachtmodus): Simulation/Pathfinding in einen Web Worker. Heute < 1 ms, nicht nötig.

## 6. Vorschlag Qualitätsstufen (Fokus Mobile)

| Einstellung | Niedrig | Mittel (Handy-Standard) | Hoch (PC-Standard) |
|---|---|---|---|
| Pixel Ratio | 1,0, dynamisch 0,75–1,0 | 1,25, dynamisch 0,9–1,5 | min(DPR, 2), dynamisch 0,75×–1× |
| Ziel-fps | 30 (Option) | 60, sonst 30 | 60 |
| Schatten | aus, Blob-Schatten unter Figur/Tieren | 1024, PCF, nur Werfer < 20 m, Update jeden 2. Frame | 2048, PCFSoft, Werfer < 35 m, Update jeden Frame |
| Blätter werfen Schatten | nein | nur nahe Bäume | ja (nahe Kacheln) |
| Bloom | aus (Emissives etwas heller) | ¼ Auflösung | ½ Auflösung |
| Kantenglättung | keine | FXAA | MSAA 4× im Render-Target |
| Boden | 2 Schichten, 1 Sample, Lambert | 3 Schichten, 1 Sample, ohne Normalmaps | 4 Schichten, Anti-Tiling (2 Samples), Normalmaps |
| Wald-Dichte / LOD | 50 %, LOD1 ab 12 m, Impostor fern | 75 %, LOD1 ab 20 m | 100 %, LOD1 ab 30 m |
| Gras | 30 %, nur nahe Kacheln | 55 % | 100 % |
| Partikel | 50 % | 75 % | 100 % |
| Punktlichter | nur nachts, max. 1 | nur nachts | nur nachts |

Die Stufe wird beim Start automatisch gewählt (Touch, CPU-Kerne, GPU-Name aus `WEBGL_debug_renderer_info`) und danach über die
gemessene Frame-Zeit nachjustiert; die Optionsseite überschreibt das wie heute. Alle Werte gehören wie die übrigen Parameter in
`Game Design & Balancing/balancing.yaml` (Abschnitt `grafik`), damit sie ohne Code-Änderung einstellbar sind.

## 7. Messskripte (`tools/perf/`)

Voraussetzung: Playwright mit Chromium (`require('playwright')`), Dev-Server auf Port 5173 (`npx vite --port 5173`), für die Ladezeit
der Produktions-Build auf Port 4173 (`npm run build && npx vite preview --port 4173`).

| Skript | Zweck |
|---|---|
| `run.cjs <pc\|handy> <menu\|day\|night\|buch\|abend\|editor> <CPU-Drossel>` | CPU pro Frame (aufgeteilt nach Subsystem), GPU (SwiftShader), renderer.info, Census, CPU-/Heap-Profil ⇒ `out/*.json` |
| `abl.cjs <pc\|handy> day [W H]` | Abschalt-Experimente aus Abschnitt 3 (`V2=1` für Boden/Punktlichter) |
| `load.cjs <pc\|handy> <none\|4g>` | Ladezeit, Bytes nach Dateityp, Nachladen nach dem ersten Klick |
| `show.cjs <datei>` | Ausgabe eines Ergebnisses lesbar anzeigen |
| `all.sh` | alle Szenen nacheinander |
| `inpage.js` | Instrumentierung im Browser (Zeitmessung, Draw-Unterdrückung, Census, Abschalter) |

Auf echten Geräten lassen sich die gleichen Szenen über Chrome-Remote-Debugging (Android) oder Safari Web Inspector (iOS) prüfen;
die Instrumentierung aus `inpage.js` kann dort per Konsole geladen werden. Empfehlung: nach Phase 1 einmal auf einem echten
Mittelklasse-Handy gegenmessen, weil die GPU-Werte hier nur Anteile, keine echten fps sind.

## Anhang: Prompt für die Analyse

Der Auftrag, mit dem diese Analyse erstellt wurde (wiederverwendbar für spätere Nachmessungen):

> **Rolle**: Du bist Senior Graphics/Performance Engineer für WebGL/Three.js-Spiele.
>
> **Kontext**: Repo altzweig/PathOfGardening (TypeScript + Vite + Three.js, GitHub Pages, Ziel PC + Mobile, Koop bis 4 Spieler).
>
> **Ziel**: Eine ausführliche, belegte Performance-Analyse: Was kostet am meisten (CPU, GPU, Speicher, Ladezeit), und wo lässt sich
> massiv sparen? Zunächst nur analysieren, keine Code-Änderungen am Spiel.
>
> **Vorgehen**:
> 1. Messen statt raten: Build lokal starten, mit headless Chromium (Playwright) typische Szenen messen: Tag auf dem Hof, Nacht mit
>    Wellen, Haus-Buch offen, Welt-Editor. Jeweils PC-Viewport und Handy-Viewport (inkl. CPU-Throttling 4×). Erfassen: FPS/Frametime
>    (Mittel, P95), renderer.info (Draw Calls, Dreiecke, Geometrien, Texturen, Programme), JS-Heap, GPU-Speicher grob, Ladezeit +
>    Bundle-/Assetgrößen.
> 2. CPU-Profil pro Frame: Update-Schleife, Pathfinding, Kollision, Feld-Timer/Labels, Kamera-Okklusion, Partikel, prozedurale
>    Tieranimation, Skinned Meshes, Spielfigur, GC-Druck durch Allokationen pro Frame.
> 3. GPU: Draw Calls/Batching (Instancing für Gras, Bäume, Nature-Kit), Schatten (Shadow-Map-Größe, Caster-Anzahl),
>    Post-Processing/Bloom, Transparenz/Overdraw, Shader-Varianten/Kompilier-Ruckler, KTX2-Texturen, Pixel Ratio auf Mobile.
> 4. DOM/UI: HTML-Overlays, Layout-Thrashing, CSS-Effekte im Buch (Blur, Filter).
> 5. Laden: Bundle-Split, Asset-Größen (Sounds, Modelle, Texturen), Lazy Loading.
>
> **Ergebnis**: Bericht als Markdown im Repo (`docs/performance-analyse.md`) mit Messtabelle pro Szene, Top-10-Kostenstellen nach
> Impact mit Beleg (Messwert, Datei:Zeile), pro Punkt konkrete Maßnahme, geschätzter Gewinn, Aufwand (S/M/L) und Risiko für die
> Optik; am Ende eine priorisierte Roadmap (Quick Wins zuerst) und ein Vorschlag für Qualitätsstufen (Niedrig/Mittel/Hoch) für Mobile.
> Keine Erklärtexte im Spiel einbauen.
