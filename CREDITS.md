# Credits

Alle Credits stehen auch im Spiel unter *Optionen → Credits* (`src/ui/credits.ts`). Bitte beides gemeinsam pflegen.

## Texturen

Von **juliovii** – https://juliovii.itch.io/
Lizenz: [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) (laut den itch.io-Seiten).
Für das Spiel verkleinert (Farbe 1024 px bzw. 512 px, Normalen 512 px) und neu als JPEG komprimiert, liegen in `public/textures/`.

| Asset-Paket | Link | Verwendete Texturen | Datei im Spiel | Verwendet für |
|---|---|---|---|---|
| FTP Dirt Ground (Materials_Ground_Dirt_01) | https://juliovii.itch.io/ftp-dirt-ground | GroundGrass_01, GroundDirt_03, GroundDirt_06 | `grass`, `grassdirt`, `dry` | Rasen rund um den Garten |
| | | GroundDirt_05, GroundDirt_01 | `dirt`, `pebble` | Gartenboden in der Mitte |
| | | GroundMud_01 | `mud` | Beete (Felder) |
| FTP Grass & Dirt (Stylized_GrassAndDirt) | https://juliovii.itch.io/ftpgrass-dirt | Stylized_HandpaintedStones_02 | `rock` | (früher Steine am Gartenrand, derzeit nicht verwendet) |
| FTP Stylized Mix Stones 01 | https://juliovii.itch.io/ftp-stylized-mix-stones-01 | Stylized_LavaRock_02 (+ Emissive) | `lava` | Chili-Beet |

## 3D-Modelle (Umgebung)

Von **Quaternius** – https://quaternius.com/ ([Patreon](https://www.patreon.com/quaternius))
**Stylized Nature MegaKit** (Standard/Free-Version), Lizenz [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (laut `License_Standard.txt` im Paket).
Verwendet für Wald (Twisted/Dead/Pine/Common Trees), Büsche, Farne, Pflanzen, Gras, Klee, Blumen, Pilze, Felsen, Kiesel und Trittsteine.
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
| amb_day | „calm birds“ (Freesound, aus Bastis Sound-Sammlung, Ausschnitt als Loop) | – | CC0 |

(Nicht verwendet: [Flamethrower weapon long bursts](https://freesound.org/s/395039/) von aslakhostaker.)
