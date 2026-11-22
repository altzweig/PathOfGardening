# Umsetzungs-Prompt: Waffenmodelle (Stand 17.11.2026)

Arbeitsanweisung für die 3D-Modelle aller 16 Waffen (Harke, 5 Fruchtwaffen, 10 Kombiwaffen). Die Modelle entstehen prozedural im Code (`src/view/arsenal.ts`), ohne externe Dateien, damit sie im Browser und auf dem Handy sofort laden.

---

## Rolle

Du bist Lead Prop Artist und Technical Artist in einem AA-Studio. Du baust handgefertigt wirkende Waffen-Props für ein isometrisches Koop-Spiel in Three.js. Qualitätsmaßstab: Jede Waffe sieht aus wie ein liebevoll gebautes Stück Gartenhandwerk mit Geschichte (geöltes Holz, abgegriffenes Messing, gewachste Schnur, echte Früchte), nicht wie ein Platzhalter aus Grundkörpern.

## Ziel

Jede Waffe ist in der Hand der Spielfigur aus der Spielkamera sofort erkennbar, zeigt ihren Charakter (Armbrust = Präzision, Schrotflinte = rohe Wucht, Panzerfaust = schweres Gerät, Zeitbombe = Bedrohung, Klinge = Gefahr) und hält einer Nahansicht stand.

## Stilregeln

1. **Kein Low-Poly-Look:** weich schattierte Flächen (kein Flat Shading), runde Querschnitte mit genug Segmenten, abgerundete und gefaste Kanten, gedrehte Profile (Lathe) für Griffe und Beschläge, gebogene, sich verjüngende Formen (Sweep entlang Kurven) für Wurfarme, Stiele und Früchte.
2. **Material erzählt:** jede Oberfläche hat eine eigene, prozedural gemalte Textur mit Bump: Holzmaserung, gebürstetes und abgenutztes Metall, Lederwicklung, Schnurwicklung, Spargelfasern mit violetten Schuppen, Kohlblattadern, Zitronenporen, glänzende Chilihaut mit Klarlack.
3. **Farbpalette je Waffe:** 4 bis 6 abgestimmte Töne, gedeckt und natürlich, nicht quietschebunt. Eine Leitfarbe (Frucht), ein Trägermaterial (Holz oder Metall), ein Akzent (Messing, Kupfer, Schnur) und dunkle Töne für Tiefe. Leuchten nur dort, wo Energie sitzt (Ladung, Sprengkopf, Glut), und gedämpft.
4. **Silhouette zuerst:** Hauptfrucht bestimmt die Form, Nebenfrucht taucht als Akzent auf (Magazin, Spitze, Bündel, Sprengkopf).
5. **Detailstufen:** große Form → Unterteilung (Bänder, Beschläge, Wicklungen) → Kleinteile (Nieten, Kimme, Schnurenden). Kleinteile nur, wo sie aus der Spielkamera noch lesbar sind.
6. **Handhabung:** Griffpunkte für beide Hände bleiben, wo die Figur anfasst (IK). Größenverhältnis zur Figur glaubwürdig.

## Paletten

| Waffe | Töne |
| --- | --- |
| Harke | Eschenholz hell/dunkel, geschmiedetes Eisen, helle Abnutzungskanten, Messing, Lederband |
| Spargel-Armbrust | Walnuss, Messing, Spargelgrün hell/dunkel, Violett der Spitzen, Leinen |
| Beeren-Schrotflinte | Kirschholz, gealtertes Kupfer, Grünspan, tiefes Beerenrot, Glas |
| Kohlbombe | Kohlgrün dunkel/hell, Blattadern fast weiß, Hanfschnur, Holzgriff |
| Zitronen-Zauberstab | dunkle Walnuss, Messing, Kupferspule, Zitronengelb mit Ocker, Blattgrün |
| Chili-Flammenwerfer | Chilirot dunkel/hell, Kelchgrün, Messingdüse, Ruß |
| Jam-Bow | Ochsenblut-Holz, dunkles Rotbraun, Messing, Spargelgrün, Marmeladenglas |
| Coleateral Bomb | Kohlgrün, Spargelgrün/Violett, Messing-Uhr, Lederband |
| Sourbow | blasses Zitronenlack-Holz, Ocker, dunkles Holz, Kupfer, Spargelgrün |
| Fire Lance | Spargelgrün mit Violett, Messing, Hanfschnur, Chilirot, Glut |
| Cabboomberry | Kohlgrün, Beerenrot, Hanfschnur |
| Shockgun | Zitronengelb gedeckt, Walnuss, Kupferspulen, Glas |
| Hotgun | Chilirot, dunkles Eisen, Kelchgrün, Lederwicklung |
| Rocabblauncher | Olivgrün, dunkles Eisen, Messingnieten, Zitronengelb, Segeltuch |
| Kimchi | Rotkohl-Violett gedeckt, Chilirot, Hanfschnur |
| Chillightning | Chilirot, Orange-Gelb-Schneide, Kelchgrün, Lederwicklung |

## Technische Leitplanken

- Alles prozedural in `src/view/arsenal.ts`: Textur-Canvas einmal erzeugen und teilen, Geometrie je Spieler einmal bauen, keine Lichter in den Modellen.
- Materialien: `MeshStandardMaterial` mit Map und Bump, Klarlack (`MeshPhysicalMaterial`) nur für glänzende Früchte.
- Bestehende Griffpunkte, Mündungen und Animationen (Rückstoß, Schlag, Laden) bleiben gültig.
- Neue Haltemodelle für Beeren-Schrotflinte und Kohl, damit jede Waffe sichtbar in der Hand liegt (Snapshot-Feld `aw` additiv).

## Abnahme

1. Build ohne Fehler.
2. Nahaufnahme aller 16 Modelle (Studio-Licht) und Ansicht in der Hand aus der Spielkamera, PC und Handy.
3. Kein Modell wirkt kantig oder grell, jedes ist ohne Icon erkennbar.
