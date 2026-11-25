# Credits

Alle Credits stehen auch im Spiel unter *Optionen → Credits* (`src/ui/credits.ts`). Bitte beides gemeinsam pflegen.

## Texturen

### Boden (seit 23.11.2026)

Von **FreeStylized.com** – https://freestylized.com/ (Credit „Textures: FreeStylized.com“).
Wie im Hof-Spiel: `public/textures/terrain/terrain_c_512.ktx2`, `terrain_c_1024.ktx2` (Farbe) und `terrain_n_1024.ktx2` (Normalen) als KTX2-Array mit den Ebenen Grass 01, Moss Ground 02, Ground 02, Ground 06, Grass 04, Cobblestone 01 (gebaut mit `tools/build-textures.mjs` im Hauptprojekt). Verwendet: Grass 01 + Grass 04 als Wiese, Ground 02 + Ground 06 als nasse Erde um die Felder.
Boden-Editor (`boden.html`, seit 23.11.2026): alle Natur-Bodentexturen einzeln in `public/textures/terrain/<id>_c_512|1024.ktx2` + `<id>_n_1024.ktx2`, Vorschaubilder in `public/textures/swatch/`, Liste in `terrain.json`: Cliff Rocks 02, Cliff Rocks 04, Cliff Rocks 05, Cliff Rocks 08, Cobblestone 01, Desert Ground 01, Grass 01, Grass 04, Grass 05, Grass With Rocks 01, Ground 02, Ground 03, Ground 05, Ground 06, Ground 07, Ground With Rocks 01, Ground With Rocks 03, Ground With Roots 01, Moss Ground 01, Moss Ground 02, Moss Ground 03, Rock 01, Rocks With Water 01, Water 01, Water 02. Basis-Transcoder in `public/basis/` (three.js, Apache 2.0).

### Weitere Texturen

Von **juliovii** – https://juliovii.itch.io/
Lizenz: [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) (laut den itch.io-Seiten).
Für das Spiel verkleinert (Farbe 1024 px bzw. 512 px, Normalen 512 px) und neu als JPEG komprimiert, liegen in `public/textures/`.

| Asset-Paket | Link | Verwendete Texturen | Datei im Spiel | Verwendet für |
|---|---|---|---|---|
| FTP Dirt Ground (Materials_Ground_Dirt_01) | https://juliovii.itch.io/ftp-dirt-ground | GroundGrass_01, GroundDirt_03, GroundDirt_06 | `grass`, `grassdirt`, `dry` | Waffen-Vorschau (`grass`, `grassdirt`; früher Rasen rund um den Garten) |
| | | GroundDirt_05, GroundDirt_01 | `dirt`, `pebble` | Waffen-Vorschau (`dirt`; früher Gartenboden) |
| | | GroundMud_01 | `mud` | Beete (Felder) |
| FTP Grass & Dirt (Stylized_GrassAndDirt) | https://juliovii.itch.io/ftpgrass-dirt | Stylized_HandpaintedStones_02 | `rock` | (früher Steine am Gartenrand, derzeit nicht verwendet) |
| FTP Stylized Mix Stones 01 | https://juliovii.itch.io/ftp-stylized-mix-stones-01 | Stylized_LavaRock_02 (+ Emissive) | `lava` | Chili-Beet |

## 3D-Modelle (Umgebung)

Von **Quaternius** – https://quaternius.com/ ([Patreon](https://www.patreon.com/quaternius))
**Stylized Nature MegaKit** (Standard/Free-Version), Lizenz [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (laut `License_Standard.txt` im Paket).
Verwendet für die Nussbäume (früher auch Wald, Büsche, Farne, Gras, Blumen, Pilze, Felsen; seit 23.11.2026 durch Nebel ersetzt).
Für das Spiel in `public/nature/nature.glb` zusammengefasst (Rinde/Pilze/Steine mit weniger Polygonen, Meshopt-komprimiert, gebaut mit `tools/build-nature.mjs`); Texturen auf 512 px (Gras 256 px) verkleinert, liegen ebenfalls in `public/nature/`.

## Effekte

Von **Kenney** – https://kenney.nl/assets/particle-pack (Particle Pack 1.1), Lizenz CC0.
`public/textures/fx_fire.png`: Atlas (4×2, Graustufen, je 256 px) aus flame_01–04, fire_01, fire_02, smoke_02, smoke_05 für das Feuer des Flammenwerfers.

## Sounds (Freesound)

Zugeschnitten auf kurze Clips in `public/audio/` (Mono, 44,1 kHz).

| Datei im Spiel | Quelle | Autor | Lizenz |
|---|---|---|---|
| flame_start_1–3, flame_end_1–2 | [Flamethrower short and medium length bursts](https://freesound.org/s/395038/) | aslakhostaker | CC0 |
| flame_start_4 | [Flamethrower](https://freesound.org/s/831929/) | 1bob | CC0 |
| flame_loop | [Flamethrower loop](https://freesound.org/s/867029/) | raphavpires | CC0 |
| bb_collect_1–4, bb_drop_1–4 | „blueberry“ (aus Bastis Sound-Sammlung, `sfx/collect/blueberry.mp3`; geschnitten, tiefpassgefiltert, tiefer) | – | CC0 |
| amb_day | „calm birds“ (Freesound, aus Bastis Sound-Sammlung, Ausschnitt als Loop) | – | CC0 |

Händler (24.11.2026): Handglocke, Räderquietschen und Rollgeräusch des Wagens sind im Code erzeugt (WebAudio, `src/audio.ts`: merchBell, cartSqueak, cartRoll), keine fremden Dateien. Das Händler-Modell ist ebenfalls prozedural (`src/view/merchantModel.ts`, Vorschau `haendler.html`).

Werkbank / Techtree (25.11.2026): Erbsenpistolen-Schuss, Werkbank-Arbeit (Hammer, Säge, Schrauben), Idee fertig / Fertigstellen und Steinkohl-Mauer (setzen, Treffer, zerbrechen) sind im Code erzeugt (WebAudio, `src/audio.ts`: peaShot, benchHit, benchSaw, benchScrew, benchWork, ideaReady, ideaClaim, wallPlace, wallHit, wallBreak), keine fremden Dateien. Die Modelle (Erbsenpistole, Werkbank, Hammer, Steinkohl-Pfosten, graue Staubwolke) sind ebenfalls prozedural (`src/view/peapistol.ts`, `workbench.ts`, `wallpool.ts`, `dustfx.ts`, Vorschau `werkbank.html`).

(Nicht verwendet: [Flamethrower weapon long bursts](https://freesound.org/s/395039/) von aslakhostaker.)
