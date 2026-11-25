# Teure Designentscheidungen in Classic und günstigere Alternativen

Stand: 25.11.2026, Commit `3723bec` (main). Das hier ist nur eine Analyse, am Spiel ist noch nichts geändert.
Basti entscheidet, was davon umgesetzt wird.

Die Frage war: Welche Entscheidungen bei Inhalt, Grafik und Spiellogik kosten solo oder im Koop unnötig viel GPU, CPU oder Netz,
und wie ließe sich das günstiger lösen? Den Netzcode selbst (Vorhersage, Delta-Snapshots, Binärprotokoll) baut der Thread
„Koop-Netcode hochoptimieren“. Hier geht es nur darum, *was* das Spiel darstellt und überträgt, nicht *wie*.

## Kurzfassung

1. **Die Gegner sind mit großem Abstand der teuerste Inhalt.** Ein Tier hat 5.000 bis 10.000 Dreiecke und wird dreimal
   gezeichnet (Körper, Umriss-Hülle, Schatten). 117 Gegner sind **2,1 Mio. Dreiecke pro Frame**, der ganze Rest der
   Classic-Szene nur **57.000**. Auf einem Mittelklasse-Handy (4× CPU-Drossel) steigt die Frame-Zeit von **31 auf 76 ms**
   (32 → 13 fps). Die Simulation der 117 Tiere kostet davon nur einen kleinen Teil, fast alles ist Darstellung.
2. **Im Koop werden es doppelt so viele.** `maxAlive` 117 wird mit dem Koop-Faktor (bis ×2) multipliziert, also bis zu
   **234 Gegner**, und jeder Gast muss alle rendern.
3. **Drei billige Hebel bringen zusammen etwa die Hälfte der Gegnerkosten zurück**, fast ohne sichtbaren Verlust:
   gröbere Tiermodelle, Umriss im Material statt als zweite Hülle, Blob-Schatten statt echter Schatten für normale Gegner.
4. **Netz:** Ein Snapshot im Kampf ist im Schnitt 8 KB (Spitze 13 KB), 20-mal pro Sekunde. Davon sind 26 % Gegner,
   19 % die eigenen Privatwerte, 16 % am Boden liegende Früchte, 14 % Spieler, 13 % Felder. Ereignisse (Partikel, Sounds,
   Schadenszahlen) sind mit 1,5 KB/s unerheblich. Was das Design hier entscheidet: **wie viele Dinge gleichzeitig existieren**
   und **ob liegende Dinge (Früchte, Minen, Wolken, Felder) jeden Tick neu geschickt werden müssen**.
5. **Nicht lohnend** nach Messung: Punktlichter abschalten, Bloom abschalten (bei der Testauflösung kein messbarer Gewinn),
   Partikel-Ereignisse kürzen.

## Prioritätenliste

Sortiert nach Nutzen pro Aufwand. „Handy“ = 393×852, 4× CPU-Drossel, 117 Gegner auf dem Bildschirm.
Gewinne sind gemessen, wo „gemessen“ steht, sonst geschätzt.

| # | Heute | Günstiger | Gewinn | Was man verliert | Aufwand |
|---|---|---|---|---|---|
| 1 | Jeder Gegner wirft einen echten Schatten (Schattenpass mit Skinning, +1 Draw Call je Tier) | Normale Gegner bekommen einen weichen Blob-Schatten (ein instanzierter dunkler Fleck für alle). Echter Schatten nur für Boss, Elite und Spieler | gemessen: Handy **−20 ms/Frame**, PC GPU −17 %, −780k Dreiecke | Schatten zeigen nicht mehr die Tierform. Aus der Spielkamera kaum zu sehen | S |
| 2 | Tiermodelle mit 5.000–10.000 Dreiecken (Igel 10k, Waschbär 8,9k, Schaf 8,6k, Panda 6,6k, Kröte 5,3k) | Gröbere Variante der Tiere (Segmente der Grundformen halbieren, etwa 2.000–3.000 Dreiecke). Volle Variante nur für Boss, Händlervorschau und Nahsicht | geschätzt: −65 bis −75 % der Gegner-Dreiecke in allen drei Pässen (2,1 Mio. → ~0,6 Mio.), GPU spürbar, CPU kaum | Etwas eckigere Silhouette bei großem Zoom. Bei Spielkamera sind die Tiere nur wenige Dutzend Pixel groß | S–M |
| 3 | Umriss als zweite Hülle je Tier (eigene Skinned Mesh, +1 Draw Call, +35 % Dreiecke) | Dunkler Rand im Tiermaterial selbst (Fresnel/Rim im Shader), keine zweite Mesh. Hülle nur für Boss (violett) und Elite | gemessen: Handy **−10 bis −14 ms/Frame**, −140 Draw Calls, −750k Dreiecke | Rand ist an flachen Kanten weicher und etwas unregelmäßiger als die Hülle. Lesbarkeit bleibt, weil der Kontrast im Material sitzt | S |
| 4 | `maxAlive` 117 und im Koop Anzahl ×√Spieler (bis 234) | Koop skaliert stärker über HP und Elite-Anteil statt über die Anzahl: z. B. `enemyCountExponent` 0,5 → 0,25 und `enemyHpExponent` 0,5 → 0,75. 4 Spieler: ×1,41 statt ×2 Gegner, dafür ×2,83 HP. Optional `maxAlive` 117 → 90 und dafür mehr Elite-Tiere | linear: jeder Gegner weniger spart Darstellung, Snapshot (26 % sind Gegner) und Sim. 4er-Koop bei vollem Feld etwa −30 % Gegnerkosten | Weniger „Horde“ im Koop, Tiere halten länger. Mit Rudeln (PR #120) bleibt der Eindruck von Masse besser erhalten als früher | S (nur balancing.yaml, Bot-Sim nachlaufen) |
| 5 | Früchte fallen einzeln und liegen als eigene Objekte (bis 117 gleichzeitig gemessen, jedes mit Schatten und im Snapshot) | Jedes Feld legt einen **Haufen** ab (ein Objekt, Größe zeigt Menge), Einsammeln wie bisher per Hinlaufen/Magnet. Alternativ fliegen Früchte direkt in den Beutel und der Flug ist reine Optik beim Gast | Netz −10 bis −15 % (fr = 16 % des Snapshots), −80 bis −110 Objekte, weniger Verschmelz-Prüfungen | Das Gewusel einzelner Beeren und das Verschmelzen zu Stufen. Laufwege bleiben beim Haufen gleich | M |
| 6 | Liegende Dinge werden jeden Tick komplett geschickt: Kohlminen (bis 100), Mehlwolken (bis 100), Spiegeleier, liegende Beeren, Felder | Liegende Dinge bekommen eine **feste Lebensdauer ab Ablage** (wie schon `mineLife` 60 s, Wolken 10 s) und werden nur beim Entstehen, Zünden und Verschwinden gemeldet; der Gast zählt selbst herunter. Felder: Wachstum läuft nach festem Takt, Schütteln/Treffer als Ereignis | 100 Minen oder Wolken sind heute je ~4,5 KB pro Snapshot (≈ 90 KB/s pro Gast). Felder −10 % Snapshot | Nichts Spielerisches, solange Lebensdauern fest bleiben. Sonderfälle (Wolke treibt, Mine wird geschoben) brauchen ein Ereignis | M (gemeinsam mit dem Netcode-Thread, Delta-Snapshots lösen einen Teil davon schon) |
| 7 | Bis zu 24 Leichen spielen ihre Todesanimation voll (Skinning, Umriss, Schatten) | Höchstens 8 animierte Leichen, der Rest verschwindet sofort in der Staubwolke, die es für „Welle vorbei“ schon gibt | bei Massentoden bis −15 % Gegnerkosten für 1–2 s, glättet Ruckler genau in den heftigsten Momenten | Weniger umfallende Tiere bei großen Explosionen | S |
| 8 | Lebensbalken für jeden Gegner (3 Meshes je Tier, immer sichtbar) | Balken nur bei Elite, Boss und Tieren, die gerade Schaden bekommen haben (2 s nach dem letzten Treffer) | Handy gemessen bis −10 ms, Messung aber unruhig; PC kaum | Man sieht HP unverletzter Tiere nicht. Die sind sowieso voll | S |
| 9 | Snapshots laufen auch in Pausen mit 20/s (Level-up-Auswahl, Händler, Werkstatt), obwohl sich fast nichts bewegt | In Pausen 2–4 Snapshots/s, Karten- und Händlertexte nur bei Änderung | ~90 % weniger Traffic während Pausen | nichts | S (Absprache mit Netcode-Thread) |
| 10 | Eigene Privatwerte (Waffenwerte je Waffe, Karten, Händlerbank mit Texten) in jedem Snapshot (19 %) | Werte ändern sich nur bei Level-up/Kauf: dann einmal schicken. Kartentexte baut der Gast aus dem Kartenschlüssel selbst | −15 bis −19 % Snapshot | nichts | M (eher Netcode-Thread, hier nur als Hinweis) |
| 11 | Gegner sind einzeln geriggte Skinned Meshes mit eigenem Material und prozeduraler Animation je Tier | Langfristig: Bewegungen je Art vorbacken (Vertex-Animation-Textur) und alle Tiere einer Art als **eine** InstancedMesh zeichnen (≈ 6 Draw Calls für alle Gegner statt ~400) | geschätzt: Gegnerkosten auf ein Viertel bis Zehntel, 200+ Gegner im Koop am Handy möglich | Individuelle Kleinigkeiten (Blick, Ohrenzucken, Reaktion auf Treffer) werden pro Art gleich, Treffer-Blitz nur noch als Farbe | L |

### Was davon zusammen bringt

Nur 1 + 3 (beide Aufwand S): auf dem Handy mit 117 Gegnern grob **76 → 45 ms** (13 → 22 fps), gemessen einzeln, zusammen
etwas weniger als die Summe. Mit 2 und 7 dazu ist die Gegnerlast etwa ein Drittel von heute. Punkt 4 wirkt dann zusätzlich im
Koop, wo jeder Gast heute doppelt so viele Tiere rendert wie solo.

## Umgesetzt am 25.11.2026 (Punkte 1–3, Bastis Auswahl)

- **Tiermodelle reduziert**: gleiche Formen, gröbere Kugeln/Röhren, alle Flächen gelöscht, die in einer anderen Form stecken
  (Beinansätze, Wolllocken, Kopf im Hals …). Das Fell (Masken, Streifen, Fellrauschen) ist nicht mehr Vertexfarbe, sondern
  pro Form in eine kleine Textur gebacken, damit es trotz grobem Netz scharf bleibt. Igelstacheln: 3-seitige Kegel, Farbbänder aus Textur.
- **Umriss im Material** (Rim im Shader) statt zweiter Hülle, Elite dünner, Boss violett.
- **Schatten** aus einem Ultra-Low-Poly-Stellvertreter auf demselben Skelett (Layer 1, nur im Schattenpass gezeichnet, `core.ts`).

| Tier | vorher Körper + Umriss + Schatten | nachher Körper + Schatten |
|---|---|---|
| Igel | 27.200 | 2.380 + 350 = **2.730** |
| Boss | 25.200 | 2.720 + 1.050 = **3.770** |
| Waschbär | 23.800 | 2.640 + 990 = **3.630** |
| Schaf | 22.400 | 2.800 + 1.350 = **4.150** |
| Roter Panda | 16.800 | 2.070 + 790 = **2.860** |
| Frosch | 12.500 | 1.280 + 520 = **1.800** |

Messung mit 117 Gegnern (`tools/perf/kosten.cjs`, gleiche Szene wie oben):

| | vorher | nachher |
|---|---|---|
| Dreiecke pro Frame (PC) | 2.125k | **326k** (−85 %) |
| Zusatz-GPU der Gegner (SwiftShader, PC) | +219 | **+97** (−56 %) |
| Draw Calls (PC) | 862 | 710 |
| Handy Frame-Zeit (4× Drossel) | 76,2 ms | **60,3 ms** (13 → 17 fps) |

Auf dem Handy bleibt die CPU der Engpass: Es zählt dort vor allem die **Zahl der Draw Calls** pro Tier, nicht die Dreiecke.
Nach dem Umbau kosten am Handy noch: Schattenpass (1 Draw Call je Tier) ~17 ms, Lebensbalken (3 Meshes je Tier) ~15 ms.
Nächste Hebel dafür: Punkt 8 (Balken nur nach Treffer) und Punkt 11 (Instancing).

## Messwerte

### Gegner-Darstellung (Messskript `classic/tools/perf/kosten.cjs`)

Solo-Spiel, 117 Gegner (6 Arten gemischt, stehend, unsterblich) im Garten verteilt. Headless Chromium mit SwiftShader,
PC 640×360, Handy 393×852 mit 4× CPU-Drossel. „View-JS“ = JavaScript-Zeit von `view.frame` (three.js-Szenengraph,
Animation, Draw-Aufrufe), „Frame“ = ganze Frame-Zeit ohne GPU-Rasterung (am PC durch 60 Hz gedeckelt),
„GPU“ = SwiftShader-Zeit, nur als Anteil lesbar. Jede Zeile schaltet genau eine Sache ab.

| Variante | Handy View-JS | Handy Frame | PC View-JS | PC GPU (SwiftShader) | Draw Calls (PC) | Dreiecke (PC) |
|---|---|---|---|---|---|---|
| 0 Gegner | 17,8 ms | 31,5 ms | 3,4 ms | 431 | 418 | 57k |
| **117 Gegner** | **55,0 ms** | **76,2 ms** | **8,2 ms** | **650** | **862** | **2.125k** |
| ohne Umriss-Hüllen | 44,5 | 62,3 | 7,1 | 601 | 719 | 1.370k |
| ohne Lebensbalken | 46,6 | 64,4 | 8,1 | 622 | 861 | 2.125k |
| Gegner ohne Schatten | 39,5 | 56,1 | 7,1 | 539 | 721 | 1.343k |
| gar keine Schatten | 33,9 | 49,3 | 5,9 | 537 | 622 | 1.326k |
| ohne Bloom | 58,9 | 76,6 | 10,2 | 625 | 989 | 2.170k |
| ohne alle 5 Punktlichter | – | – | 10,1 | 638 | 1.002 | 2.170k |
| Gegner unsichtbar (nur Sim + Animation) | 28,3 | 44,5 | 4,2 | 426 | 418 | 57k |

Lesart: Die Tiere unsichtbar zu machen spart auf dem Handy 32 ms, sie zu simulieren und zu animieren kostet nur ~13 ms.
Bloom und Punktlichter bringen bei dieser Auflösung nichts Messbares (die Zeilen sind sogar etwas schlechter, das ist
Streuung, weil sich zwischendurch Früchte und Effekte ansammeln). Auf einem echten Handy mit voller Auflösung kostet Bloom
mehr Pixelarbeit, ist aber in „Niedrig“ schon aus.

### Netz (Bot-Lauf mit `classic/tools/coop/netsize.ts`, nur Ticks mit mehr als 20 Gegnern)

4 Spieler bis Welle 23 (max. 137 Gegner), Bytes pro Snapshot je Schlüssel, so wie `Host.sendSnap` sie schickt:

| Teil | Mittel | Spitze | Anteil | Inhalt |
|---|---|---|---|---|
| `en` Gegner | 2.113 B | 6.087 B | 26 % | 11 Werte je Tier |
| `me` Privatwerte | 1.564 B | 1.821 B | 19 % | Munition, Waffenwerte je Waffe, Karten, Händler |
| `fr` Früchte am Boden | 1.316 B | 3.349 B | 16 % | bis 117 Früchte |
| `pl` Spieler | 1.108 B | 1.126 B | 14 % | ~30 Werte je Spieler |
| `fi` Felder | 1.062 B | 1.210 B | 13 % | 14 Werte je Feld, ändert sich selten |
| `ev` Ereignisse | 307 B | 5.610 B | 4 % | Spitzen bei Massentoden |
| Rest | < 300 B | | 8 % | |

Ein Snapshot im Kampf ist damit im Schnitt ~8 KB, also ~130–165 KB/s pro Gast bei 20/s. Ereignisse im Solo-Lauf
(bis Welle 24): 1,5 KB/s gesamt, davon Partikel-Bursts 0,5 KB/s, Sounds 0,35 KB/s, Schadenszahlen 0,2 KB/s.
Die Simulation von Host und Snapshot bleibt unter 1 ms pro Tick, ist also kein Kostenpunkt.

Minen, Wolken, Eier und liegende Beeren kamen im Bot-Lauf nicht vor (der Bot nutzt sie nicht). Hochgerechnet aus dem Format:
eine Mine sind 11 Zahlen, eine Wolke 9, also ~45 B je Stück und bei je 100 Stück ~4,5 KB zusätzlich pro Snapshot.

## Was ich bewusst nicht vorschlage

- **Simulation vereinfachen** (Pathfinding, Rudel, Gift-Ticks): kostet unter 1 ms pro Tick, kein Hebel.
- **Ereignisse kürzen**: 1,5 KB/s ist neben 130 KB/s Snapshot vernachlässigbar.
- **Punktlichter und Bloom streichen**: nicht messbar teurer, aber prägen die Nacht-Optik.
- **Kohlminen/Mehlwolken weiter optimieren**: sind seit PR #115 instanziert (Draw Calls 594 → 51), für die Darstellung kein Thema mehr,
  nur fürs Netz (Punkt 6).

## Nachmessen

```
cd classic && npx vite --port 5174              # Dev-Server
node tools/perf/kosten.cjs pc 117               # Gegnerkosten am PC
node tools/perf/kosten.cjs handy 117            # Handy mit 4x CPU-Drossel (dauert ~10 min)
npx esbuild tools/coop/netsize.ts --bundle --platform=node --format=cjs --outfile=tools/coop/netsize.cjs
BREAK=20 node tools/coop/netsize.cjs 4          # Netzlast mit 4 Spielern, Bytes je Schlüssel bei Welle 20
```

SwiftShader ist eine Software-GPU: absolute GPU-Zeiten sind 50–100× zu langsam, nur die Anteile zählen. Die CPU-Zeiten
mit Handy-Drossel sind realistisch. Die Messung streut um ±5–10 %, einzelne Zeilen (Lebensbalken) noch mehr.
