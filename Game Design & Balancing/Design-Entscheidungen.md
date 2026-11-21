# PathOfGardening – Design-Entscheidungen

Zahlen stehen ausschließlich in `balancing.yaml`. Hier stehen die Regeln und das „Warum“.
Seit 19.11.2026 ist das Spiel ein **Hof-Spiel mit Tagesablauf** (Basti, Gameloop-Skizze). Die Regeln des alten Wellen-Survivals liegen unverändert in `archiv/garden-defence-v1/design/Design-Entscheidungen.md`. Ablauf, Phasen und Annahmen des Umbaus: `Farming-Gameloop.md`.

## Grundsätze
- **Keine Erklärtexte im Spiel.** Mechaniken werden nicht erklärt, Spieler entdecken selbst. Ausnahmen: der **Tutorial-Tag** (eigener Modus im Hauptmenü), Texte in `tutorial.texts`, und die **Tipps im Ladebildschirm** (`loading.tips`).
- **Ladebildschirm** beim Start: Vorschaubild der Farm (`public/loading/farm.jpg`), Ladebalken, darunter alle `loading.tipEvery` s ein neuer zufälliger Tipp. Bleibt mindestens `loading.minTime` s stehen, damit man den ersten Tipp lesen kann.
- **Charakter-Editor:** Würfeln dreht die Figur einmal ganz herum, sie landet immer mit Blick nach vorne.
- **Steuerung** steht nur auf der Seite *Optionen → Steuerung* (bzw. *Pause → Steuerung*): visuell, getrennt für PC und Mobil.
- Im Abend-Bildschirm nur Icons, Zahlen und Namen, keine Sätze.
- PC- und Mobile-Steuerung werden immer parallel gebaut.
- Arbeitstitel: **PathOfGardening**.
- **Spielstände (20.11.2026, Basti):** lokal im Browser (localStorage), keine Cloud. Mehrere Spielstände mit Namen. Menü: *Weiterspielen* (neuester Spielstand), *Neues Spiel* (Name vergeben, startet ohne Tutorial mit dem ersten Morgen), *Laden* (Liste mit Name, Tag, Level, Taler, Zeit; Löschen mit Bestätigung), *Tutorial*, *Optionen*. Koop ist vorerst aus (Code im Archiv).
  - *Speichern* jederzeit im Pausemenü (auch abends und morgens über das Menü-Symbol im Haus). Autospeichern alle `saves.autosave` s, außerdem bei jedem Tageswechsel, beim Verlassen ins Hauptmenü und beim Schließen/Wechseln des Browser-Tabs. Ein kleines Blatt-Symbol unten rechts zeigt das Speichern.
  - Speichern mitten am Tag merkt sich Uhrzeit, Position, Leben, Tagesbilanz, Stall, Regen und den Tierplan des restlichen Tages; Tiere, die gerade auf dem Hof sind, verschwinden beim Laden, was sie tragen, liegt dann am Boden.
  - Spielstände liegen nur in diesem Browser auf diesem Gerät. Browserdaten löschen löscht sie. Der alte Einzel-Spielstand wird beim ersten Start einmal als „<Name>s Hof“ übernommen.
- **Tutorial ist ein eigener Modus** im Hauptmenü: frischer Hof, Tutorial-Tag, danach zurück ins Hauptmenü. Es wird nichts gespeichert.

## Tagesablauf (Gameloop)
1. **Morgen:** neue Unkräuter auf den Feldern, der Tag beginnt sofort. (Bis 21.11.2026 gab es hier eine Waffenwahl; sie ist weg, man startet ohne Waffe, nur mit der Handharke.)
2. **Tag** (`day.length`, ca. 5 min): Hof-Aufgaben erledigen und Tiere vertreiben. Man schafft nie alles. Oben läuft die Sonne über einen Bogen.
3. **Zeit um:** Bild wird schwarz, der Spieler ist im Haus.
4. **Abend (nur im Haus):** Tagesbilanz (geerntet, gestohlen, vertrieben, XP), Level-up mit freigeschalteten Gebäuden, Tabs *Aufträge*, *Bauen*, *Produktion*, *Lager*. *Schlafen* → nächster Morgen.
- Nur Sommer. Keine Jahreszeiten, keine Monatswellen, kein Erntekalender.
- Regen bleibt: zufällige Schauer (`day.rain`) mit dem Gewitter-Sound; Regen gießt Felder und Busch.

## Steuerung
- **PC:** WASD laufen. **Linksklick** auf Busch, Feld oder Brunnen = Arbeit dort (läuft automatisch hin, wenn zu weit weg). Das passende Werkzeug erscheint von selbst (Gießkanne, Handharke, Saatbeutel, Hände, Sichel), kein Werkzeugwechsel. **Linke Maustaste gedrückt halten** = nach jeder Arbeit startet die nächste mögliche am anvisierten Ziel (siehe unten). Neben dem Mauszeiger zeigt ein Icon, was ein Klick tut (rot = geht gerade nicht, z. B. Kanne leer). **Rechtsklick (halten)** = kämpfen mit der Waffe des Tages Richtung Maus. Ohne Waffe: einhändiger Schlag mit der Handharke (120°-Kegel). Mausrad = Zoom, Esc = Pause.
- **Mobil:** linker Daumen = laufen (kurz tippen = auf die Stelle tippen). **Aktion**-Knopf = Arbeit an der nächsten Stelle mit Arbeit (zeigt das Werkzeug), gedrückt halten = immer weiter. **Angriff**-Knopf = kämpfen, zielt automatisch aufs nächste Tier. Auf eine Stelle in der Welt tippen startet dort die Arbeit.
- Arbeiten und Kämpfen gehen nie gleichzeitig: Angriff oder Laufen bricht die Arbeit ab.

## Hof
- Layout nach Bastis Skizze (Koordinaten in `hof`): Haupthaus mit Küche und **Lager** (rotes Doppeltor, davor der Erntekorb), Hofladen, Mühle, Bäckerei, Brunnen, Schreinerei, Werkstatt, Molkerei, Saftpresse, Silo, Hühner, Kühe, Feldflächen, Bäume. Rundherum Wald mit **5 Lücken**: nur dort kommen Tiere herein.
- Gebäude starten als **Baustelle** mit Schild ★Level. Freigabe über das Level (`levels.unlocks`), Bau im Abend-Tab *Bauen*. Der Brunnen startet **kaputt** und kann ab Tag 1 repariert werden.
- Felder: abgesteckte Flächen. Wie viele man anlegen darf, hängt vom Level ab (`plots.byLevel`), Kosten `plots.cost`.
- Ernte landet direkt im Lager (seit 21.11.2026 kein Korb mehr). Lager vorerst unbegrenzt (`storage.capacity`).

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
- Handharke als Notwaffe: einhändiger Schlag (120°-Kegel), kurzer Stun und Rückstoß.

## Tiere
- Vorerst nur **Waschbär** und **Hase**, wenige, in kleinen Gruppen (`spawns`). Alle anderen Tiere sind im Archiv (Code und Modelle bleiben).
- **Waschbär:** klaut aus dem Lager (Eingang neben dem Haupthaus), vom Busch und von reifen Feldern, trägt die Beute sichtbar auf dem Rücken. Wird er getroffen, fällt die Beute herunter und rollt zum Spieler. Manche sind scheu und fliehen, sobald man nahe kommt; mutige greifen an, wenn man sie schlägt.
- **Hase:** scheu, flieht sobald man sich nähert, frisst an gesäten Feldern (wirft sie um einen Tag zurück) und am Busch.
- Tiere werden **vertrieben, nicht getötet**: bei 0 HP oder Annäherung (scheue) laufen sie durch die nächste Lücke in den Wald.
- Schwierigkeit steigt mit dem Level (mehr Gruppen, größere Gruppen, mehr HP/Schaden/Tempo, `spawns.scaling`).

## Fortschritt
- **XP nur aus Aufträgen und vertriebenen Tieren.** Das Level schaltet Gebäude, Felder und Waffen frei.
- Die alte Level-up-Karten-Mechanik ist komplett raus (Archiv). Upgrades kommen später über ein Gebäude.
- **Aufträge:** abends annehmen / abgeben, Belohnung Taler + XP (+ Waren). Startauftrag „10 Blaubeeren“.
- **Ohnmacht bei 0 HP:** man wacht abends im Haus auf, der Rest des Tages ist verloren, gegossene Felder sind wieder trocken (wachsen nicht). Kein anderer Schaden. Man kann nicht verlieren.
- Nachtmodus kommt später.

## Tutorial-Tag (Modus „Tutorial“)
Genau nach Bastis Ablauf: Pfeil zum Busch „Blaubeeren gießen“ → „Gießen“ → Ladebalken nach 1 s → „In der Zwischenzeit das Feld harken, säen und gießen“ (Unterhinweise Harken / Säen / Gießen) → „Felder jeden Tag einmal gießen. In 3 Tagen ist der Weizen reif.“ → „Die Blaubeeren sind fast reif“ → „Ernten“ → Cutscene: Rascheln + Waschbär-Laut, Kamera zum Waldrand, Waschbär lugt heraus mit Gedankenblase „Hunger!“, schleicht zum Korb am Lager (Kamera folgt), klaut 5 Beeren, rennt über den Hof am Spieler vorbei → „Vertreib den Eindringling!“ → Waschbär startet 3 m neben dem Spieler Richtung Wald (langsamer als der Spieler) → Spiel pausiert, Karte zeigt rechte Maustaste bzw. Angriffs-Knopf „Kämpfen“ → erster Schlag setzt das Spiel fort → Beute zurück oder weg → „Ganz schön viel für den ersten Tag.“ → Spieler geht heim, schwarz, Abend. Keine Schrotflinte im Tutorial. Erster Abend: Startauftrag abgeben, Brunnen reparieren (Startgeld + Auftragsgeld).

## Texturen und Credits
- Texturen immer natürlich gemischt, kein sichtbares Tiling. Fremd-Assets mit Credits (Name, Link, Lizenz) in `src/ui/credits.ts`.

## Texturkonzept (20.11.2026)
- Ein Stil: nur FreeStylized-Texturen (kommerziell frei, Credit „Textures: FreeStylized.com“). Nicht verwendet: GroundDirt (zu realistisch), Handpainted-Paket (anderer, gelbstichiger Stil), Schnee, Beton, Metall, Fantasy. Quelle: `Blender/Texturen/PBR_Material/Sammlung_Stylized-Mix`, Konvertierung mit `tools/build-textures.mjs`.
- Gelände: grass_01 als Basis, moss_ground_02 für Waldboden und feuchte Stellen, ground_02 um die Felder, ground_06 für Trampelpfade, grass_04 als trockene Flecken (per Rauschen, nicht gemalt), cobblestone_01 als Pflaster auf dem Hofplatz vor dem Haus und zur Haustür.
- Gebäude: wood_planks_20 (Holzwände, Pfosten, Zaun), wood_planks_13 (Schuppen, rote Tore, getönt), hay_roof_01 (alle Dächer), stone_bricks_wall_03 (Sockel, Brunnen, Kamine). Felsen im Wald: cliff_rocks_02. Putz und Fachwerk bleiben gemalt.
- Splatmap (RGBA, ca. 33 cm pro Texel): r Moos, g Feld, b Pfad, a Pflaster, Gras ist die Basis. Wird beim Start aus dem Hof-Layout gebaut; der Welt-Editor kann sie über `HofWorld.splat` bemalen (`paint`, `fill`, `save`/`load`, siehe `src/farm/view/splat.ts`). Unter den wilden Grasgruppen bleibt der Boden reines grass_01.
- Kein sichtbares Tiling: jeder Layer wird zweimal gelesen, mit pro Rauschzelle zufällig gedrehter und verschobener UV, weich überblendet. Dazu großflächige Farb- und Helligkeitsschwankung per Low-Frequency-Noise und ausgefranste Layer-Ränder.
- Performance: Texturen als KTX2 (Basis Universal ETC1S, mit Mipmaps). Gelände 1024 px, Gebäude und Felsen 512 px. Pro Material nur Farbe und Normal-Map, Rauheit als Konstante, kein Height, kein AO. Alle Gelände-Layer liegen in einer Array-Textur (Farbe) und einer (Normalen): das Gelände ist ein Material und ein Draw Call. Grafik „niedrig“ und Handy: Gelände 512 px ohne Normal-Maps.
- Gebäude sind tri-planar im Objektraum texturiert (Meter-Maßstab, unabhängig von der Kistengröße; Dachstroh läuft auf beiden Dachseiten nach unten).
- Werte (Kachelgrößen, Mischschärfe, Ausfransen, Farbvariation, Normalstärke): `texturen` in balancing.yaml.

## Gebäude und Tagesaktionen (19.11.2026, Bastis Aktionsliste)
- Jede Aktion (außer Kämpfen) geht nur, wenn das Gebäude gebaut ist. Steht man im Radius, erscheint "[Aktionsname]" über dem Ziel (PC mit Linksklick-Symbol, rot mit fehlenden Waren, wenn es gerade nicht geht). Linksklick (Handy: Aktionsknopf) startet sie, ein kleiner Zeitbalken (1–4 s) füllt sich. Zeiten und Namen: `actions` in balancing.yaml.
- Wiederholbare Aktionen laufen von selbst weiter, solange die Bedingung gilt: Busch ernten bis leer, Brombeeren pflücken, Feld ernten, Wasser schöpfen bis das Fass voll ist.
- Busch: alle ~1,5 s 3–4 Beeren (8 Durchgänge), danach 4 Durchgänge mit je 1 kleinen Beere. Beeren hüpfen im Bogen zur Figur (Sammel-Sound) und sind sofort im Lager (seit 21.11.2026 kein Korb). Busch wackelt, Blätter fliegen (alte Ernteanimation). Busch-Kollision größer (`bush.radius`).
- Feld (Stand 21.11.2026, siehe unten): Säen, Gießen, Jäten (morgens 0-2 neue, höchstens 3, bremsen das Wachstum), Düngen 1×/Tag (+30 % Ernten), Ernten mehrmals, danach direkt wieder säen.
- Ställe (Kühe, Schafe & Ziegen, Hühner): Füttern am Stall (Kuh 3×, Schaf/Ziege 2×, Huhn 1×), Stroh auslegen (+30 % Ertrag), Melken / Eier sammeln 1× je Tageshälfte (morgens, abends). Ertrag anteilig zur Fütterung. Hungrige Tiere zeigen ein Napf-Symbol, satte Tiere legen sich hin und schlafen (Zzz).
- Hof: Unkraut und Sammelgut (Bärlauch, Sauerampfer, Pilze, Brennholz, Steine; Mengen seit 20.11.2026 halbiert, siehe unten) wachsen nur dort nach, wo gerade niemand hinschaut. Jäten gibt Grünschnitt. Wilde Brombeeren am Waldrand: etwa halber Ertrag pro Zeit wie der Busch. Apfelbäume schütteln.
- Gebäude-Produktion am Tag statt abends: Mühle (Mahlen), Bäckerei (Backen: Mehl + Wasser → Brot), Saftpresse, Küche im Haupthaus (Kochen), Molkerei (Käse), Güllesilo (Dünger aus Grünschnitt + Gülle).
- Tiere: am Anfang 2–3 zufällige Hasen, genau 1 Waschbär-Überfall zufällig in der 2. Tageshälfte, +1 Waschbär je Level. Tutorial-Waschbär stiehlt nur 4 Beeren, erste Quest 20 Blaubeeren.
- Lichtung ca. 10 m größer, Wald bis zur maximalen Sichtweite. Kamera frei drehbar: mittlere Maustaste ziehen (PC) bzw. auf der rechten Bildschirmhälfte wischen (Handy); Laufen richtet sich nach der Kamera.

### Annahmen (bitte prüfen)
- Küche nimmt das erste Rezept, für das alles da ist (Reihenfolge in balancing.yaml).
- Kühe geben zusätzlich Gülle (für den Dünger), Schafe und Ziegen geben Milch.
- Futter: Kühe/Schafe/Ziegen Grünschnitt, Hühner Weizen.
- Ställe werden zur Tagesmitte wieder hungrig (= "morgens und abends").
- "Bäume" = die Apfelbäume auf dem Hof.
- Kein Pflügen mehr (21.11.2026); nach der letzten Ernte kann direkt neu gesät werden.

## Wilde Grasgruppen und Sammelgut (20.11.2026)
- Keine Streudeko mehr auf dem Hof (einzelne Grasbüschel, Klee, Blumen, Kiesel). Stattdessen dichte Grasgruppen aus dem Nature MegaKit, nie gleichmäßig verteilt: unregelmäßige Gruppen aus mehreren Flecken, innen dicht und hoch, nach außen lichter und niedriger, mit zerfranstem Rand.
- Gras-Büschel sind eigene, günstige Kreuzflächen (16 Dreiecke, gemalte Halm-Textur) in 10-m-Kacheln, damit nur sichtbares Gras gezeichnet wird.
- Gras wächst nur, wo keiner läuft oder mäht: viel auf der feuchten Wiese hinter dem Brunnen, an Gebäuderückseiten, an den geschlossenen Zaunseiten der Ställe (Tor vorne bleibt frei), am Waldrand hinter Büschen und zwischen Bäumen, unter Obstbäumen nur niedrig. Nie auf Wegen, Feldern, in den Waldlücken der Tiere oder vor der Haustür. Unter den Gruppen ist der Boden grüne Grastextur, die an den Rändern zerfranst in den Boden daneben übergeht.
- Alles Einsammelbare ist etwas größer und hat eine dezente, warm leuchtende Outline, über die ab und zu ein Glanz läuft; in Kameranähe steigen gelegentlich kleine Funken auf.
- Halb so viel Sammelgut und Unkraut, thematisch: Äste, Pilze und Steine am Waldrand, Bärlauch am Waldrand und auf der feuchten Wiese hinter dem Brunnen, Sauerampfer und Unkraut rund um die dichten Grasflächen, wilde Brombeeren (5) zwischen normalen Büschen am Waldrand.
- Ältere Spielstände: Unkraut und Sammelgut werden einmal neu verteilt.
- Werte: `grass` und `wild` in balancing.yaml.

## Welt-Editor (20.11.2026)
- Basti gestaltet die Welt selbst in `welt.html`: Objekte setzen/verschieben/drehen/skalieren/löschen/streuen, Bodentexturen und Wildgras malen.
- Gespeichert wird `public/world/welt.json` (Objektliste + Bodenmalerei). Das Spiel liest sie beim Start; ohne Datei wird der Wald wie bisher generiert. Sobald die Datei existiert, ist die Welt bei jedem Start gleich.
- Gemalter Boden ersetzt den generierten nur dort, wo gemalt wurde; Übergänge immer mit Rauschen ausgefranst (kein sichtbarer Pinselrand, kein Tiling).
- Bäume, Felsen, Zäune, Heuballen, Holzstapel auf dem Hof (innerhalb des Waldrands) sind Hindernisse; im Waldring nicht, damit die Tiere durchkommen.
- Obstbäume, Brombeeren, Gebäude und Felder bleiben Spielobjekte aus `balancing.yaml` und sind nicht im Editor.


## Welt-Editor v2: Landschaft und Hoflogik neu (20.11.2026)
- Die Landschaft wird komplett neu gedacht: neue Welt = leere Fläche mit trockenem Gras, alles Weitere setzt Basti im Editor.
- Gebäude vorerst nur das Haupthaus (Lager darin). Alle anderen Gebäude sind aus, solange die Welt eine Logik hat.
- Kartengröße einstellbar 40–256 m, Standard 128 m (etwa 3–4× so groß wie der bisherige Baubereich).
- Begehbarer Bereich und Baubereich sind geschlossene Spline-Flächen. Die Spielfigur bleibt im begehbaren Bereich, Felder nur im Baubereich.
- Felder sind Sechsecke. Der Editor setzt nur die Feldplätze, auf denen später ein Feld stehen kann, sonst nichts. Spielstart mit so vielen Feldern wie bisher (höchstens so viele wie Plätze).
- Gegner-Spawns: rote Kreise mit Waschbär und Nummer. Die Nummer ist der Bezug für Anweisungen wie „Spawn 1 erhöhen“ (= Häufigkeit dieses Spawns).
- Interaktionsobjekte mit Logik: Brunnen (Wasser für die Gießkanne), Lager-Eingang (im Editor noch „Korb“, dort klauen Waschbären), Blaubeerbusch, Obstbäume, Brombeeren.
- Boden in Ebenen; bis zu 16 Texturen pro Welt (Grenze des Boden-Shaders, eine Zeichnung für den ganzen Boden).
- Ohne Weltdatei läuft der bisherige generierte Hof unverändert.

## Feldfrüchte und Feldzyklus (Basti, 20.11.2026)
- Referenz fürs Balancing: 1 Tag = 480 s. Jede Pflanze: Säen 2 s (kostet kein Saatgut), 1 s Keimen, Gießen 2 s, dann Wachstumszeit in Sekunden (Fruchttabelle), Ernte 1,33 s pro Erntevorgang, danach 1 s bis das Feld wieder bestellbar ist. Zyklus ≈ 10 s + Wachstum.
- Alle einjährigen Früchte der Fruchttabelle sind Feldfrüchte (balancing.yaml `crops`), freigeschaltet nach Level: Common L1-3, Uncommon L4-6, Rare L7-10.
- Saatgut wählt man über das Saatgut-Symbol oben rechts (PC Klick, Mobile Tippen); es erscheint ab der zweiten freigeschalteten Frucht.
- Mehrjährige (Blaubeerbusch, Brombeeren, Apfel-, Nussbaum) tragen einmal pro Tag bzw. nach `every` Tagen; Erntevorgänge und Menge pro Vorgang laut Tabelle.
- Wilde Pflanzen (Bärlauch, Löwenzahn, Sauerampfer, Pilze) wachsen am Hofrand nach, mehrere Erntevorgänge pro Pflanze.
- Preiselbeeren, Zitronen und Stachelbeeren (Kultur, mehrjährig) haben noch keinen Platz auf dem Hof und kommen später.

## Tagesaufträge und Gefallen (Basti, 21.11.2026)
- Jeden Morgen kommen 3 neue Aufträge und sind automatisch angenommen; abends verfallen die offenen. Titel 3-5 Wörter, darunter die Ziele „- 0/5 [Icon] Ware“.
- Aufträge enthalten nur Früchte der freigeschalteten Felder (plus Blaubeeren vom Busch), also kein Deadlock. Menge nach Referenz: alle 3 zusammen belegen 55 % der Feld-Sekunden des Tages (Felder × 480 s), Weizen 30 s pro Durchgang = 30 Stück. Ohne Brunnen begrenzt das Wasser in der Kanne die Menge (eine Füllung pro Durchgang, eine bleibt für den Busch).
- Sobald alle Waren im Lager sind, wird der Auftrag abgegeben (grüner Haken). Die Belohnung holt man abends ab: pro Auftrag eine große Kachel mit XP und „Gefallen“ des Dorfes.
- Gefallen ersetzt die Taler (gleiche Währung zum Bauen, Symbol: goldene Marke mit Herz). Pro Auftrag mindestens 15, damit man nach Tag 1 den Brunnen reparieren kann.
- XP: die 3 Aufträge eines Tages bringen etwa 1/1,5 Level, die Belohnung steht auch im Kopf des Auftrags.
- Anzeige tagsüber oben rechts, Q (PC) bzw. Tippen klappt ein und aus; eingeklappt steht nur „Quests [Q]“.
- Start mit 3 Feldern (Referenz: 3 Weizenfelder, realistisch 1000-1200 Weizen am Tag), mehr Felder pro Level: 3, 4, 5, 6, 8, 10, 12, 14, 16, 18.
- Offen: das Ladengeschäft gab vorher ein zusätzliches Auftragsangebot, das entfällt jetzt.

## Jäten, Hock-Aktionen und Halten (Basti, 21.11.2026)
- **Start ohne Waffe**, die Waffenwahl am Morgen ist weg. Nach dem Schlafen beginnt direkt der nächste Tag. Waffen-Code bleibt für später im Spiel (Schrotflinte usw. sind nur nicht wählbar).
- **Feld nur noch: Säen, Gießen, Ernten, morgens Jäten.** Kein Pflügen/Harken mehr: ein Feld ist sofort bestellbar, nach der letzten Ernte (1 s Abräumen) kann direkt neu gesät werden, ohne Jäten.
- **Unkraut nur morgens:** jedes offene Feld bekommt jeden Morgen 0/1/2 Unkräuter dazu (25 % / 50 % / 25 %, `plots.weeds.morning`), höchstens 3 pro Feld. Tagsüber wächst auf den Feldern kein Unkraut. Unkraut blockiert nichts, bremst aber das Wachstum: 1/2/3 Unkräuter = 5/10/15 % langsamer (`plots.weeds.slow`). Jäten nimmt pro Durchgang ein Unkraut (1 Grünschnitt) und läuft von selbst weiter.
- **Reihenfolge am Feld** (was hilft am meisten zuerst): Ernten → Säen → (während die Pflanze keimt: Jäten) → Gießen → Jäten → Düngen. Düngen bleibt als freiwilliges Extra ab dem Güllesilo (Annahme: „nur Säen, Gießen, Ernten“ meint den Pflichtzyklus).
- **Handharke** statt Harke: klein, einhändig, immer in der rechten Hand. Damit wird gejätet (Feld und Hof) und geschlagen (Rechtsklick / Angriffsknopf, Trefferkegel 120°).
- **Knien:** Arbeit am Boden (Jäten, Säen, Ernten am Feld, Düngen, Sammeln) macht die Figur auf einem Knie. Sie geht dafür nah an die Stelle (`player.kneel`), beim Jäten zum jeweiligen Unkraut.
- **Halten:** Aktionsknopf bzw. linke Maustaste kann immer gehalten werden. Ist eine Arbeit fertig, startet die nächste mögliche am anvisierten Ziel (PC: unter der Maus, sonst das nächste; Handy: das nächste). Gibt es keine, endet die Kette; wird später (beim Weiterlaufen) eine möglich, geht es weiter.
- **Laufen während einer Arbeit** geht (langsamer, `player.actionSpeed`); wer sich zu weit entfernt (`player.leave`), bricht sie ab. Nach einer Arbeit am Boden bleibt die Figur in der Hocke, solange der Knopf gehalten wird, und **watschelt** langsam (`player.crouchSpeed`). Erst nach dem Loslassen läuft sie wieder normal.
- **Kein Korb mehr:** Ernte geht sofort ins Lager (Blaubeeren hüpfen zur Figur, „+n“ schwebt hoch). Waschbären klauen am Lager-Eingang neben dem Haupthaus.
- **Grafik:** Schattenbereich passt sich jetzt dem sichtbaren Bild an (vorher fester 40-m-Kasten um den Spieler, im Hochformat und rausgezoomt endeten die Schatten mitten im Bild). Schwarze Kästen, die kurz aufblitzten: ungültige Pixel (NaN) wurden vom Bloom zu Blöcken verwischt, ein Filter davor entfernt sie jetzt.

## Ernte-XP, Felder pro Level und Hofladen (Basti, 21.11.2026)
- Jeder Erntevorgang gibt XP: Seltenheit × (Wachstum + 10 + 2 × Arbeitszeit) / 3, verteilt auf die Vorgänge (Werte in `harvestXp`). Busch, Bäume, Sträucher und wilde Pflanzen zählen mit pauschal 10 s Feldzeit.
- Tempo: grob alle 2-3 Tage ein Level, Level 2 schon an Tag 1. Ca. 90 % der XP aus Ernten, 10 % aus Aufträgen. Spielzeit grob 2/5 Feldarbeit, 2/5 Kämpfen, 1/5 abends Management.
- Start: Weizen-, Kohl- und Zwiebelfeld plus Blaubeerbusch, Brunnen heil. Jedes Feld hat eine feste Frucht, Säen wählt nichts mehr aus.
- Felder sind nicht kaufbar. Jedes Level-up gibt 1 Feld, das abends automatisch auf dem nächsten freien Feldplatz angelegt wird. Erstes Level-up: Wahl aus 3 zufälligen Commons, die man noch nicht hat; danach 1 zufälliges Common (auch schon vorhandene). Uncommon/Rare kommen später über Finden/Kaufen.
- Hofladen ab Level 2, kostet nur Gefallen: nach Tag 1 noch nicht, nach Tag 2 sicher bezahlbar (Preis knapp über dem Maximum von Tag 1, simuliert).
- Tiere: am Anfang 1-2 Hasen nahe den Feldern. Erste Annäherung: Flucht 15 m. Zweite: 1 Minute ganz weg. Sie stehlen nichts. Waschbären vorerst nicht (später per Level). Tiere schauen immer in Laufrichtung.

