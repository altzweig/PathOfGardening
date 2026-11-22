# Umsetzungs-Prompt: Kombiwaffen (Stand 17.11.2026)

Dieser Prompt ist die Arbeitsanweisung für die Umsetzung der Kombiwaffen. Quelle der Inhalte ist Bastis Tabelle „PathOfGardening – Waffenkombinationen“ (Claude Doc), Zahlen landen ausschließlich in `balancing.yaml`.

---

## Rolle

Du bist Senior Gameplay Engineer und Technical Artist in einem AA-Studio. Du setzt ein Waffen-Evolutions-System für ein isometrisches Koop-Action-Spiel (Three.js, TypeScript, Host-autoritative Simulation in `src/sim/sim.ts`, Darstellung in `src/view/`) um. Qualitätsmaßstab: Jede Kombiwaffe muss sich beim ersten Schuss wie ein Belohnungsmoment anfühlen – klar lesbar, wuchtig, eindeutig anders als ihre beiden Ausgangswaffen.

## Ziel

Zehn Kombiwaffen, je aus zwei der fünf Fruchtwaffen (Harke ist ausgenommen). Haben beide Ausgangswaffen eines Paares je mindestens 5 Upgrade-Stufen, bietet das nächste Level-up die Kombiwaffe als große Freischaltkarte an. Wer sie nimmt, verschmilzt beide Waffen zu einer: Sie belegt den Platz der Hauptwaffe, der Platz der Nebenwaffe wird frei.

## Harte Regeln (aus dem Projekt)

1. Keine Erklärtexte im Spiel. Karten: Bild, Titel, Werte als Icon-Chips, eine kurze Effektzeile.
2. Alle Zahlen in `balancing.yaml` unter `combos`, Regeln in `Design-Entscheidungen.md`.
3. PC und Mobil gleichwertig: Kombiwaffe nutzt denselben Knopf/Joystick wie die Hauptwaffe, Auto-Zielen funktioniert für jede Waffe.
4. Koop: Alles läuft in der Simulation des Hosts, die Darstellung bekommt nur Snapshot-Felder und Events. Keine Zufallsentscheidungen im View, die das Spielgeschehen ändern.
5. Stun-Definition, Resistenzen, Elite/Boss-Regeln und Luftphasen (Kröte) gelten auch für Kombiwaffen.
6. Performance: Mobilgeräte zuerst. Pro Waffe nur gebündelte Effekte (ein Event pro Salve statt pro Partikel), keine neuen Lichtquellen pro Projektil.

## Freischaltung und Upgrade-Übernahme

- Zähler je Waffe: Summe aller genommenen Upgrades dieser Waffe (Schaden, Reichweite, Abklingzeit und alle Spezial-Upgrades).
- Bedingung: beide ≥ `combos.unlockUpgrades` (5), beide gelernt, keine schon verschmolzen.
- Übernahme: Allgemeine Stufen (Schaden, Reichweite, Abklingzeit) beider Waffen addieren sich. Spezial-Upgrades wirken weiter, wo sie zur Kombiwaffe passen (Liste je Waffe in `balancing.yaml`). Passt ein Spezial-Upgrade nicht, wird jede Stufe zu `combos.convertDamage` Schadensbonus.
- Munition: Die Kombiwaffe verbraucht die Frucht der Hauptwaffe. Früchte der Nebenwaffe werden beim Einsammeln mit `subAmmo` in Hauptwaffen-Munition umgerechnet. Vorhandene Munition der Nebenwaffe wird beim Verschmelzen genauso umgerechnet.
- Danach bietet das Level-up für die Kombiwaffe Schaden, Reichweite, Abklingzeit und die passenden Spezial-Upgrades an.

## Die zehn Waffen (Bastis Vorgaben, präzisiert)

| Waffe | Haupt + Neben | Mechanik |
| --- | --- | --- |
| Jam-Bow | Spargel + Beeren | Armbrust aus rotem Holz, 3er-Salve. Spargelbolzen mit Beerenspitze explodieren bei Kontakt, Blutung für alle im Umkreis von 0,5 m. |
| Coleateral Bomb | Kohl + Spargel | Mit Spargelstacheln gespickter Kohl, tickt sichtbar und hörbar immer schneller. Explosion schießt ca. 20 Spargel in 360°, jeder durchbohrt bis zu 3 Gegner. |
| Sourbow | Zitrone + Spargel | Gelbe Armbrust, 3 Pfeile mit Zitronenspitze im 40°-Fächer, 20 m, durchbohren alles. Getroffene stehen unter Strom: sichtbares Knistern und Schadens-Ticks bei sich und Nachbarn in 0,5 m. |
| Fire Lance | Spargel + Chili | Langer Spargelstab mit Chili-Bündel. Pulsierender Feuerball (0,5 m Radius) fliegt durch Gegner, Schaden und Brand bei Berührung. |
| Cabboomberry | Kohl + Beeren | Kohlkopf mit roten Beeren. Explosion mit Schaden und Giftlache, streut 10 Beeren in 5 Richtungen (72°). Liegende Beeren platzen (0,5 m, leichter Schaden, Blutung). |
| Shockgun | Beeren + Zitrone | Zitronengelbe Schrotflinte. Beeren fliegen durch Gegner und bleiben liegen. Jede Beere schickt bis zu 2 Blitze (Upgrade: mehr) zu benachbarten Beeren. Jeder Blitz trifft, was dazwischen steht: 3 Ticks im Abstand von 0,5 s. |
| Hotgun | Beeren + Chili | Schrotflinte in Chiliform. Brennende Beeren: +50 % Beeren, +30 % Reichweite, +1 Durchschuss, entzündet Getroffene sofort. |
| Rocabblauncher | Zitrone + Kohl | Panzerfaust: grüne Stange, Zitrone als Sprengkopf. 50-cm-Geschoss fliegt bis 20 m, Explosion mit 4 m Radius und hohem Schaden, alle 2 s. |
| Kimchi | Kohl + Chili | Geschossener Kohl splittert in 3 kleinere, die jeweils in 3 kleinere. Statt Gift brennt die Lache länger: Schaden pro Tick und Gegner brennen weiter. |
| Chillightning | Chili + Zitrone | Große gelb-rote Chilischote als breite Klinge. Schlag auf den Boden, von dort rast ein 1 m breiter, leicht verästelter Blitz 10 m nach vorn. Gegner auf dem Weg werden zur nächsten Seite geschleudert, bekommen Schaden und stehen unter Strom (wie Sourbow). |

Annahme, wo die Tabelle offen ist: Kimchi hat Kohl als Hauptwaffe, Chillightning Chili.

## Visuelle Anforderungen (AA-Maßstab)

- **Silhouette zuerst:** Jede Waffe ist in der Hand des Spielers aus der Spielkamera auf einen Blick erkennbar (Größe, Grundform, Leitfarbe). Haupt-Frucht bestimmt die Form, Neben-Frucht die Akzentfarbe.
- **Antizipation → Aktion → Nachwirkung:** Mündungsblitz/Ausholen, deutliches Geschoss mit eigener Leuchtfarbe, Einschlag mit Boden-Decal, Partikeln und abklingendem Nachglühen.
- **Wucht über Kamera und Licht:** Kamera-Shake skaliert mit Waffengewicht (Raketenwerfer > Kimchi > Schrotflinten > Armbrüste), Bloom über Emissive statt zusätzlicher Lichter.
- **Lesbarkeit von Zuständen:** „Unter Strom“ = gelb-weißes Knistern am Gegner, Blitzbögen zu Nachbarn bei jedem Tick. Brand und Blutung behalten ihre bestehende Optik.
- **Farbsprache:** Spargel grün/violett, Beeren rot, Kohl hellgrün, Zitrone gelb/weißblau, Chili rot-orange. Kombination = Mischung beider.
- **Icons/Karten:** Eigenes SVG je Kombiwaffe für Karte und Waffenknopf, gleicher Stil wie die bestehenden Icons. Freischaltkarte im großen leuchtenden Waffenkarten-Stil.
- **Sound:** Bestehende Synth- und Sample-Sounds kombinieren (z. B. Armbrust-Twang + Beeren-Platzen), Zeitbombe mit beschleunigtem Ticken.

## Technische Leitplanken

- Kombi-Zustand auf der Hauptwaffe (`combo`), Nebenwaffe als `merged` markiert; HUD, Waffenwechsel, Auto-Feuer und Munitionsanzeige laufen unverändert über die Hauptwaffe.
- Neue Geschoss- und Bombenarten über ein `kind`-Feld in den bestehenden Listen, Snapshot-Format nur additiv erweitern.
- „Unter Strom“ als eigener Gegnerstatus (Dauer, Tick, Schaden) mit Flag im Enemy-Snapshot.
- Test-Menü: Kombiwaffen direkt freischaltbar, damit jede Waffe sofort ausprobiert werden kann.

## Abnahme

1. Build (`npm run build`) ohne Fehler.
2. Jede der 10 Waffen im Test-Menü freigeschaltet, gefeuert, Treffer, Statuseffekte und Optik auf Screenshots geprüft (PC und Handy-Format).
3. Normales Spiel: Kombikarte erscheint erst bei 5/5 Upgrades, Verschmelzen gibt den Platz der Nebenwaffe frei, Upgrades bleiben erhalten.
