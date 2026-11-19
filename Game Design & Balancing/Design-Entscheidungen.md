# PathOfGardening – Design-Entscheidungen

Zahlen stehen ausschließlich in `balancing.yaml`. Hier stehen die Regeln und das „Warum“.
Seit 19.11.2026 ist das Spiel ein **Hof-Spiel mit Tagesablauf** (Basti, Gameloop-Skizze). Die Regeln des alten Wellen-Survivals liegen unverändert in `archiv/garden-defence-v1/design/Design-Entscheidungen.md`. Ablauf, Phasen und Annahmen des Umbaus: `Farming-Gameloop.md`.

## Grundsätze
- **Keine Erklärtexte im Spiel.** Mechaniken werden nicht erklärt, Spieler entdecken selbst. Ausnahmen: der **Tutorial-Tag** (Tag 1), Texte in `tutorial.texts`, und die **Tipps im Ladebildschirm** (`loading.tips`).
- **Ladebildschirm** beim Start: Vorschaubild der Farm (`public/loading/farm.jpg`), Ladebalken, darunter alle `loading.tipEvery` s ein neuer zufälliger Tipp. Bleibt mindestens `loading.minTime` s stehen, damit man den ersten Tipp lesen kann.
- **Charakter-Editor:** Würfeln dreht die Figur einmal ganz herum, sie landet immer mit Blick nach vorne.
- **Steuerung** steht nur auf der Seite *Optionen → Steuerung* (bzw. *Pause → Steuerung*): visuell, getrennt für PC und Mobil.
- Im Abend- und Morgen-Bildschirm nur Icons, Zahlen und Namen, keine Sätze.
- PC- und Mobile-Steuerung werden immer parallel gebaut.
- Arbeitstitel: **PathOfGardening**.
- Spielstand wird im Browser gespeichert (localStorage), Menü: *Weiterspielen* / *Neues Spiel*. Koop ist vorerst aus (Code im Archiv).

## Tagesablauf (Gameloop)
1. **Morgen:** genau **eine Waffe** und **eine Munitionssorte** wählen (Menge per Regler). Gesperrte Waffen sind sichtbar (Schloss oder ★Level). Ohne Waffe = nur Harke.
2. **Tag** (`day.length`, ca. 5 min): Hof-Aufgaben erledigen und Tiere vertreiben. Man schafft nie alles. Oben läuft die Sonne über einen Bogen.
3. **Zeit um:** Bild wird schwarz, der Spieler ist im Haus.
4. **Abend (nur im Haus):** Tagesbilanz (geerntet, gestohlen, vertrieben, XP), Level-up mit freigeschalteten Gebäuden, Tabs *Aufträge*, *Bauen*, *Produktion*, *Lager*. *Schlafen* → nächster Morgen.
- Nur Sommer. Keine Jahreszeiten, keine Monatswellen, kein Erntekalender.
- Regen bleibt: zufällige Schauer (`day.rain`) mit dem Gewitter-Sound; Regen gießt Felder und Busch.

## Steuerung
- **PC:** WASD laufen. **Linksklick** auf Busch, Feld oder Brunnen = Arbeit dort (läuft automatisch hin, wenn zu weit weg). Das passende Werkzeug erscheint von selbst (Gießkanne, Harke, Saatbeutel, Hände, Sichel), kein Werkzeugwechsel. Neben dem Mauszeiger zeigt ein Icon, was ein Klick tut (rot = geht gerade nicht, z. B. Kanne leer). **Rechtsklick (halten)** = kämpfen mit der Waffe des Tages Richtung Maus. Ohne Waffe oder ohne Munition: schwertartiger Schlag mit der Harke. Mausrad = Zoom, Esc = Pause.
- **Mobil:** linker Daumen = laufen (kurz tippen = auf die Stelle tippen). **Aktion**-Knopf = Arbeit an der nächsten Stelle mit Arbeit (zeigt das Werkzeug). **Angriff**-Knopf = kämpfen, zielt automatisch aufs nächste Tier. Auf eine Stelle in der Welt tippen startet dort die Arbeit.
- Arbeiten und Kämpfen gehen nie gleichzeitig: Angriff oder Laufen bricht die Arbeit ab.

## Hof
- Layout nach Bastis Skizze (Koordinaten in `hof`): Haupthaus mit Küche und **Lager** (rotes Doppeltor, davor der Erntekorb), Hofladen, Mühle, Bäckerei, Brunnen, Schreinerei, Werkstatt, Molkerei, Saftpresse, Silo, Hühner, Kühe, Feldflächen, Bäume. Rundherum Wald mit **5 Lücken**: nur dort kommen Tiere herein.
- Gebäude starten als **Baustelle** mit Schild ★Level. Freigabe über das Level (`levels.unlocks`), Bau im Abend-Tab *Bauen*. Der Brunnen startet **kaputt** und kann ab Tag 1 repariert werden.
- Felder: abgesteckte Flächen. Wie viele man anlegen darf, hängt vom Level ab (`plots.byLevel`), Kosten `plots.cost`.
- Ernte landet direkt im Korb am Lager. Lager vorerst unbegrenzt (`storage.capacity`).

## Pflanzen
- **Blaubeerbusch** (täglich): gießen → reift `bush.ripen` s (dezenter Ladebalken nach 1 s) → ernten (Beere für Beere, ca. 1 min) → leer bis morgen.
- **Weizen** (Feld): harken → säen (1 Weizen = Saatgut) → an `crops.wheat.days` Tagen je einmal gießen → reif → mit der Sichel ernten: Weizen + Stroh. Ungegossene Tage zählen nicht. Ein Tropfen-Icon über dem Feld zeigt, dass es heute noch Wasser braucht.
- **Gießkanne** verbraucht pro Gießen eine Füllung (`can.capacity`), Auffüllen am Brunnen (erst nach der Reparatur). Im Tutorial ist sie voll.
- Nässe-System bleibt: gegossen = dunkle Erde, Regen gießt alles.
- Alle alten Pflanzen (18er-Startpool, Nussbäume …) sind im Archiv und kommen später als neue Sorten zurück.

## Kämpfen
- Waffen (Munition laut Basti): Schrotflinte (Beeren, Nüsse, Körner, Knoblauch), Armbrust (Spargel, Bohnen, Lauch, Karotten), Schleuder (Knoblauch, Nüsse, Zitronen, Äpfel), Streitkolben (Kohl, Kürbis, Melone), Kanone (Kohl, Kürbis, Melone). Spielbar ist vorerst nur die **Schrotflinte**, die anderen sind gesperrt sichtbar.
- Schießen verbraucht die gewählte Munition aus dem Lager. Unbenutzte Munition geht abends zurück ins Lager.
- Blaubeeren als Munition frieren weiterhin ein und machen Schaden.
- Harke als Notwaffe: schwertartiger Schlag, kurzer Stun und Rückstoß.

## Tiere
- Vorerst nur **Waschbär** und **Hase**, wenige, in kleinen Gruppen (`spawns`). Alle anderen Tiere sind im Archiv (Code und Modelle bleiben).
- **Waschbär:** klaut aus dem Korb am Lager, vom Busch und von reifen Feldern, trägt die Beute sichtbar auf dem Rücken. Wird er getroffen, fällt die Beute herunter und rollt zum Spieler. Manche sind scheu und fliehen, sobald man nahe kommt; mutige greifen an, wenn man sie schlägt.
- **Hase:** scheu, flieht sobald man sich nähert, frisst an gesäten Feldern (wirft sie um einen Tag zurück) und am Busch.
- Tiere werden **vertrieben, nicht getötet**: bei 0 HP oder Annäherung (scheue) laufen sie durch die nächste Lücke in den Wald.
- Schwierigkeit steigt mit dem Level (mehr Gruppen, größere Gruppen, mehr HP/Schaden/Tempo, `spawns.scaling`).

## Fortschritt
- **XP nur aus Aufträgen und vertriebenen Tieren.** Das Level schaltet Gebäude, Felder und Waffen frei.
- Die alte Level-up-Karten-Mechanik ist komplett raus (Archiv). Upgrades kommen später über ein Gebäude.
- **Aufträge:** abends annehmen / abgeben, Belohnung Taler + XP (+ Waren). Startauftrag „10 Blaubeeren“.
- **Ohnmacht bei 0 HP:** man wacht abends im Haus auf, der Rest des Tages ist verloren, gegossene Felder sind wieder trocken (wachsen nicht). Kein anderer Schaden. Man kann nicht verlieren.
- Nachtmodus kommt später.

## Tutorial-Tag (Tag 1)
Genau nach Bastis Ablauf: Pfeil zum Busch „Blaubeeren gießen“ → „Gießen“ → Ladebalken nach 1 s → „In der Zwischenzeit das Feld harken, säen und gießen“ (Unterhinweise Harken / Säen / Gießen) → „Felder jeden Tag einmal gießen. In 3 Tagen ist der Weizen reif.“ → „Die Blaubeeren sind fast reif“ → „Ernten“ → Cutscene: Rascheln + Waschbär-Laut, Kamera zum Waldrand, Waschbär lugt heraus mit Gedankenblase „Hunger!“, schleicht zum Korb am Lager (Kamera folgt), klaut 5 Beeren, rennt über den Hof am Spieler vorbei → „Vertreib den Eindringling!“ → Waschbär startet 3 m neben dem Spieler Richtung Wald (langsamer als der Spieler) → Spiel pausiert, Karte zeigt rechte Maustaste bzw. Angriffs-Knopf „Kämpfen“ → erster Schlag setzt das Spiel fort → Beute zurück oder weg → „Ganz schön viel für den ersten Tag.“ → Spieler geht heim, schwarz, Abend. Keine Schrotflinte im Tutorial. Erster Abend: Startauftrag abgeben, Brunnen reparieren (Startgeld + Auftragsgeld).

## Texturen und Credits
- Texturen immer natürlich gemischt, kein sichtbares Tiling. Fremd-Assets mit Credits (Name, Link, Lizenz) in `src/ui/credits.ts`.
