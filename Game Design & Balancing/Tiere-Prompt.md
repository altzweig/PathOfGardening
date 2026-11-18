# Prompt: Tiere mit 3D-Modellen und Animationen (AA-Qualität)

**Rolle:** Du bist Lead Creature Artist und Technical Animator in einem Double-A-Studio und gleichzeitig Three.js-Engineer. Du baust für das Browser-Spiel *PathOfGardening* (TypeScript, Vite, Three.js 0.160, GitHub Pages, Koop bis 4 Spieler, PC + Mobile) alle Tiere neu: Modelle, Rig und Animationen.

**Ziel:** Jedes Tier liest sich aus der isometrischen Spielkamera sofort an seiner Silhouette, wirkt lebendig und hat Charakter. Kein Low-Poly-Synthi-Look aus Einzelkugeln, sondern weiche, organische Formen mit gedeckten, mehrtonigen Fellfarben. Gameplay, Größen, Kollisionsradien und Lesbarkeit bleiben unverändert.

## 1. Tiere (Bestand im Code)
| Tier | Rolle | Silhouette-Merkmale |
|---|---|---|
| Waschbär | streunt, klaut Blaubeeren, flieht | gebuckelter Rücken, schwarze Maske mit weißen Brauen, weiße Wangenkrause, geringelter buschiger Schwanz, schwarze „Handschuhe“ |
| Waschbär-Boss | Boss (2,4x, violette Outline) | wie Waschbär plus eingerissenes Ohr, Narbe, rotes Halstuch, richtet sich beim Aufladen auf die Hinterbeine auf |
| Roter Panda | Nahkampf, klaut Früchte | rostrotes Fell, weißes Gesicht mit Tränenstreifen, große weiß gerandete Ohren, schwarze Beine und Bauch, langer geringelter Schwanz |
| Kröte | hüpft, Giftzunge | breit und flach, warzige Haut, dunkle Flecken auf Oliv, gelblicher Kehlsack, Augenhöcker, kräftige gefaltete Hinterbeine mit Schwimmhäuten |
| Schaf | Schild, Anlauf + Rammen | Wollwolke aus vielen Locken, schwarzes Gesicht und Beine, Hängeohren, eingerollte Hörner, kleine Hufe |
| Igel | Gruppe, plustert sich auf | Stachelkuppel mit gebänderten Stacheln (dunkel – hell – dunkel), helle Spitzschnauze, schwarze Nase, Trippelbeinchen |
| Eichhörnchen | Zickzack-Hüpfer, klaut Nüsse | schlank, S-förmiger Buschschwanz über dem Rücken, Pinselohren, weißer Bauch, große Hinterläufe |

## 2. Modell-Vorgaben
- Weiche, verformte Grundkörper (Lathe/Kugel mit Verformung, Röhren entlang Kurven), Vertexfarben mit Verläufen (Rücken dunkler, Bauch heller), Fellrauschen und Zeichnungen (Masken, Ringe, Flecken) direkt in den Vertexfarben, keine Texturkacheln.
- Gedeckte, natürliche Paletten mit 3–5 Tönen pro Tier. Augen leuchten weiter in der bekannten Farbe (Nachtlesbarkeit), mit dunkler Pupille.
- Ein Material pro Tier (Vertexfarben), Augen als ein zweites. Pro Knochen ein zusammengeführtes Mesh: höchstens ca. 16 Draw-Calls pro Tier statt bisher bis zu 80.
- Geometrie wird pro Tierart einmal gebaut und von allen Exemplaren geteilt.

## 3. Rig
- Knochen: Rumpf, Hals, Kopf, Kiefer, 2 Ohren, Schwanzkette (3 Glieder), 4 Beine mit je Ober- und Unterschenkel (Kröte: Oberschenkel, Unterschenkel, Fuß). Igel: zusätzlich Stachelmantel; Schaf: Hörner am Kopf.

## 4. Animationen (prozedural, aus Simulationsdaten abgeleitet)
- **Idle:** Atmen, Kopf schaut sich um, Ohrzucken, Blinzeln, Schwanz pendelt.
- **Laufen/Rennen:** Gangart je Tier (Waschbär/Panda Trab mit Hüftschwung, Schaf Trab und Galopp beim Rammen, Igel Trippeln, Eichhörnchen Sprunggalopp, Kröte Sprung), Schrittweite an die echte Geschwindigkeit gekoppelt, Kopf gleicht aus, Schwanz schwingt nach (Feder).
- **Angriff:** Panda/Boss Biss mit Pfotenhieb, Kröte Maul auf + Zunge, Schaf Kopf runter + Hufscharren beim Anlauf, Igel Einrollen beim Aufplustern, Boss Aufrichten beim Aufladen.
- **Treffer:** kurzer Rückstoß von Rumpf und Kopf, Quetschen.
- **Betäubt:** Kopf hängt, Wanken, Sterne bleiben.
- **Tod:** aufbäumen, auf die Seite kippen, Beine zucken, dann in den Boden sinken (max. 1,6 s, Leichen werden begrenzt).
- **Flucht:** Ohren angelegt, schnellerer Lauf.

## 5. Muss weiter funktionieren
Elite-Outline (pro Knochen-Mesh), Boss-Outline, Tag-Nacht-Licht, Gift/Feuer/Blitz/Blutungs-Leuchten, Kröte halbtransparent in der Luft, Schaf-Schild + Augen, Igel-Stachelblitz, Eichhörnchen-Hüpfen und Klettern, getragene Früchte, Lebensbalken. Keine Erklärtexte im UI. Keine externen Assets (alles prozedural, daher keine Credits nötig).

## 6. Abnahme
Vorschauseite `tiere.html` mit allen Tieren und umschaltbaren Animationen, Screenshots in `tiere/`, Build ohne Fehler, auf `main` gepusht.
