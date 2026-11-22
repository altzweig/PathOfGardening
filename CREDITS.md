# Credits

Alle Credits stehen auch im Spiel unter *Optionen → Credits* (`src/ui/credits.ts`). Bitte beides gemeinsam pflegen.

## Texturen

### FreeStylized (Texturkonzept 20.11.2026, Hof)

Von **FreeStylized.com** – https://freestylized.com/
Lizenz: Royalty Free, frei für kommerzielle und nicht-kommerzielle Nutzung, Credit erbeten (laut `license.txt` im Paket).
Credit-Zeile: „Textures: FreeStylized.com“.
Mit `tools/build-textures.mjs` nach KTX2 (Basis Universal ETC1S, mit Mipmaps) konvertiert, nur Farbe und Normal-Map (GL). Liegen in `public/textures/terrain/` und `public/textures/props/`.

| Textur | Datei im Spiel | Verwendet für |
|---|---|---|
| grass_01, moss_ground_02, ground_02, ground_06, grass_04, cobblestone_01 | `terrain/terrain_c_1024.ktx2`, `terrain_c_512.ktx2`, `terrain_n_1024.ktx2` (Array-Texturen, ein Layer je Textur) | Boden: Gras, Waldboden/feuchte Stellen, Feldboden, Trampelpfade, trockene Flecken, Pflaster auf dem Hofplatz |
| alle 29 Bodentexturen für den Welt-Editor: grass_01, moss_ground_02, ground_02, ground_06, grass_04, cobblestone_01, grass_05, grass_with_rocks_01, moss_ground_01, moss_ground_03, ground_with_roots_01, ground_03, ground_05, ground_07, ground_with_rocks_01, ground_with_rocks_03, desert_ground_01, ground_tiles_13, ground_tiles_21, cliff_rocks_02, cliff_rocks_04, cliff_rocks_05, cliff_rocks_08, rock_01, rocks_with_water_01, water_01, water_02, snow_01, ground_tiles_with_snow_01 | `terrain/<id>_c_1024.ktx2`, `_c_512.ktx2`, `_n_1024.ktx2`, Vorschau `swatch/<id>.jpg` (Liste in `terrain/terrain.json`) | Bodenebenen im Welt-Editor (21.11.2026) |
| wood_planks_20, wood_planks_13 | `props/wood_planks_20_*.ktx2`, `props/wood_planks_13_*.ktx2` | Holzwände, Tore; Schuppen und Zäune |
| hay_roof_01 | `props/hay_roof_01_*.ktx2` | alle Dächer |
| stone_bricks_wall_03 | `props/stone_bricks_wall_03_*.ktx2` | Sockel, Brunnen, Kamine, Fundamente |
| cliff_rocks_02 | `props/cliff_rocks_02_*.ktx2` | große Felsen im Wald |

### juliovii

Von **juliovii** – https://juliovii.itch.io/
Lizenz: [Creative Commons Attribution 4.0 (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/) (laut den itch.io-Seiten).
Für das Spiel verkleinert (Farbe 1024 px bzw. 512 px, Normalen 512 px) und neu als JPEG komprimiert, liegen in `public/textures/`. Seit dem Texturkonzept nur noch im VFX-Labor (`vfx.html`) und für die Beete des alten Spiels.

| Asset-Paket | Link | Verwendete Texturen | Datei im Spiel | Verwendet für |
|---|---|---|---|---|
| FTP Dirt Ground (Materials_Ground_Dirt_01) | https://juliovii.itch.io/ftp-dirt-ground | GroundGrass_01, GroundDirt_03 | `grass`, `grassdirt` | Boden im VFX-Labor |
| | | GroundDirt_05 | `dirt` | Boden im VFX-Labor |
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
Regen/Gewitter (`rain_light.mp3`, `rain_heavy.mp3` als nahtlose 24-s-Stereo-Loops, `thunder_1–6.mp3`) sind mit `tools/build-rain.py` aus den vier Regen-Aufnahmen gemischt (Lizenzen laut Basti, Freesound-Seiten aus der Cloud nicht erreichbar).
Gießkanne (`can_pour_*`, `can_fill_*`, `can_empty`, 21.11.2026) mit `tools/build-can.py` geschnitten; Rohdateien liegen in den Projektdateien unter `giesskanne/rohsounds/`.
Kampf und Nachtwellen (22.11.2026: `wave_far_*`, `hare_*`, `player_hurt_*`, `player_effort_*`, `swing_*`, `hit_thwack_*`, `rac_bite_*`, `rac_hurt_*`) sind mit `tools/build-fight.py` im Code erzeugt (Sinus, Rauschen, Formantfilter, künstlicher Hall), eigenes Werk. Nur die Waschbär-Schreie in `rac_hurt_*` und `wave_far_*` sind Ausschnitte aus `sfx/animals/racoon_aggro.wav` (Bastis Sound-Sammlung, dieselbe Quelle wie die übrigen `rac_*`-Clips).

| Datei im Spiel | Quelle | Autor | Lizenz |
|---|---|---|---|
| flame_start_1–3, flame_end_1–2 | [Flamethrower short and medium length bursts](https://freesound.org/s/395038/) | aslakhostaker | CC0 |
| flame_start_4 | [Flamethrower](https://freesound.org/s/831929/) | 1bob | CC0 |
| flame_loop | [Flamethrower loop](https://freesound.org/s/867029/) | raphavpires | CC0 |
| bb_collect_1–4, bb_drop_1–4 | „blueberry“ (aus Bastis Sound-Sammlung, `sfx/collect/blueberry.mp3`; geschnitten, tiefpassgefiltert, tiefer) | – | CC0 |
| rain_heavy, thunder_6 | [ambience_rain_thunder 2](https://freesound.org/s/877124/) | adamdavidsmith | CC0 |
| rain_light | [Rooftop Rain Perspective A](https://freesound.org/s/869487/) | thelittlecrow | CC0 |
| rain_light | [Rain and Drips](https://freesound.org/s/853565/) | hoshisato | CC0 |
| rain_heavy, thunder_1–5 | [ThunderRain_SFX](https://freesound.org/s/867416/) | kbro935 | CC0 |
| can_pour_1–3 (Gießen) | [Watering sound](https://freesound.org/s/625061/) | nokta | CC0 |
| can_pour_1–3 (leise, tiefpassgefiltert darunter) | [Watering](https://freesound.org/s/488401/) | wobesound | CC0 |
| can_fill_1–9 (Kanne am Brunnen füllen) | [Foley Object Watering Can Steel Water Movement Single](https://freesound.org/s/711528/) | nox_sound | CC0 |
| can_empty (Kanne leer) | [Hit Metallic Watering Can, Flicking a Metal Watering Can 01](https://freesound.org/s/406558/) | anthousai | CC0 |
| amb_day | „calm birds“ (Freesound, aus Bastis Sound-Sammlung, Ausschnitt als Loop) | – | CC0 |
| ripe_1 | „clear notification“ (koiroylers, aus Bastis Sound-Sammlung, `sfx/ui/koiroylers-clear-notification-355970.mp3`, gekürzt) | koiroylers | laut Basti frei nutzbar |
| harvest_pop | „pop sound“ (soundreality, aus Bastis Sound-Sammlung, `sfx/collect/soundreality-pop-sound-423716.mp3`, Ausschnitt) | soundreality | laut Basti frei nutzbar |
| harvest_ding | „menu beep accept glass b“ (liecio, aus Bastis Sound-Sammlung, `sfx/ui/liecio-menu_beep_accept_glass_b-533781.mp3`, gekürzt) | liecio | laut Basti frei nutzbar |

(Nicht verwendet: [Flamethrower weapon long bursts](https://freesound.org/s/395039/) von aslakhostaker.)

Animierte Ladebalken (22.11.2026): alle Geräusche im Balken (Beeren-Plopp, Sichel, Ausreißen, Graben, Schneiden, Melken usw.) sind im Spiel per WebAudio selbst erzeugt (`src/audio.ts`, `bar*`), keine fremden Dateien.
