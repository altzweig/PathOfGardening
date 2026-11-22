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
- **Spielstände (20.11.2026, Basti):** lokal im Browser (localStorage), keine Cloud. Mehrere Spielstände mit Namen. Menü: *Weiterspielen* (neuester Spielstand), *Neues Spiel* (Name vergeben, startet ohne Tutorial mit dem ersten Morgen), *Laden* (Liste mit Name, Tag, Level, Taler, Zeit; Löschen mit Bestätigung), *Tutorial*, *Optionen*. Koop: siehe Koop-Besuche.
- **Koop-Besuche (22.11.2026, Basti):** Man lädt Gäste auf den eigenen Hof ein (bis 4 Spieler). Gäste kommen mit eigener Figur (vom eigenen Hof oder ohne Hof mit Level 1), dürfen tagsüber und nachts alles, aber im Buch nichts verwalten (nur ansehen). Ertrag geht an den Hof, XP an den, der arbeitet (Ernte-XP an den Erntenden, Tier-XP voll an jeden, der das Tier getroffen hat, Auftrags-XP voll an Host und jeden anwesenden Gast); der Host bekommt zusätzlich 25 % der Gast-XP (`coop.hostShare`). Ein Feld/Ziel bearbeitet immer nur ein Spieler. K.o. im Koop = 20 s liegen, dann am Haus aufstehen; schlimmster Fall + Cutscene nur, wenn alle gleichzeitig k.o. sind. Nachtwellen: Tierzahl × Spieler^0,5, HP gleich. Keine Pause im Koop. Host entscheidet allein, wann geschlafen wird. Gast ohne Hof = Wanderer-Profil (Figur, Level, XP); ein neuer Hof startet trotzdem bei Level 1. Details: `docs/koop-einschaetzung.md`.
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
- **Gießkanne** verbraucht pro Gießen eine Ladung, max. 6 (`can.capacity`). Am Brunnen gibt jedes Füllen (1 s) 2 Ladungen (`can.perFill`), dreimal füllen = voll, mehr geht nicht; Füllen läuft von selbst weiter, bis die Kanne voll ist (21.11.2026). Im Tutorial ist sie voll.
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
- Start: Weizen-, Kohl- und Zwiebelfeld plus Blaubeerbusch, Brunnen heil. (Seit 22.11.2026: Saatgut Weizen, Kohl, Zwiebel, Felder ohne feste Frucht, siehe „Freie Saatgutwahl“.)
- Felder sind nicht kaufbar. Jedes Level-up gibt 1 Feld, das abends automatisch auf dem nächsten freien Feldplatz angelegt wird. Erstes Level-up: Wahl aus 3 zufälligen Commons, die man noch nicht hat; danach 1 zufälliges Common (auch schon vorhandene). Uncommon/Rare kommen später über Finden/Kaufen.
- Hofladen ab Level 2, kostet nur Gefallen: nach Tag 1 noch nicht, nach Tag 2 sicher bezahlbar (Preis knapp über dem Maximum von Tag 1, simuliert).
- Tiere: am Anfang 1-2 Hasen nahe den Feldern. Erste Annäherung: Flucht 15 m. Zweite: 1 Minute ganz weg. Sie stehlen nichts. Waschbären vorerst nicht (später per Level). Tiere schauen immer in Laufrichtung.

## Feld-Timer, Ernte-Sounds, Kollision und Pathfinding (Basti, 21.11.2026)
- Über jedem wachsenden Feld (gesät, gegossen, gekeimt) ein kleiner Ladebalken, dahinter die Restzeit im Format „0:00“ (Unkraut-Bremse eingerechnet). Ohne Wasser bleibt der Tropfen, reife Felder zeigen nichts. Hochkant am Handy etwas größer.
- Sounds: Feld oder Busch erntebereit = helles Glöckchen + goldenes Funkeln (nicht ortsabhängig, man hört es auch außerhalb des Bilds). Jeder erfolgreiche Erntedurchgang (Feld, Busch, Brombeeren, Obstbaum, Wildpflanzen) = Ernte-Plopp, dazu der Frucht-Sound; letzter Durchgang (Feld/Busch leer) zusätzlich ein Glas-Ding. Clips aus Bastis Sound-Sammlung (`sfx/`), Einträge in `sounds.yaml` unter `harvest` und `plants.ripe`.
- Kollision: Felsen haben ihren echten Grundriss (die Modelle sind nicht mittig, deshalb lief man vorher in die halbe Felsfläche), Büsche und große Stauden sind jetzt fest. Mit Welt-Editor-Karte blockiert alles Feste auf der ganzen Karte, die Spielfigur bleibt auf der Karte.
- Pathfinding der Tiere: beim Laden wird die Karte einmal in ein 0,5-m-Raster gebacken (alles Feste plus Tierradius ist gesperrt). Freie Sicht = gerade Linie ohne Suche, sonst A* mit gestraffter Route, neu geplant nur bei Zielwechsel, Hängenbleiben oder alle 6 s, höchstens 3 Suchen pro Frame. Tiere kommen so nur durch die Lücken zwischen Zäunen, Felsen, Büschen und Bäumen. Ohne jeden Weg (eingemauerter Spawn) schlüpfen sie wie früher durch.

## Nachtangriffe und Ohnmacht-Cutscene (Basti, 21.11.2026)
- Tagesanzeige: Die Sonne steigt links aus dem Horizont, läuft über den Bogen (Farbe morgens warm, mittags hellgelb, abends orange-rot, am Horizont größerer Schein) und sinkt rechts hinter den Horizont. Darunter der Countdown bis zur Nacht (Mond + „m:ss“), die letzten 30 s glüht er orange, die letzten 10 s tickt eine Uhr.
- Nach Ablauf des Tages geht es nicht ins Haus: Warnung „Die Nacht bricht herein! Wilde Tiere nähern sich und wollen eure Vorräte stehlen.“ mit Soundeffekt (Trommel, dunkles Horn, ferner Heuler). Dann 2 Minuten Nacht (`night.length`), im Countdown Mond, Restzeit und ein Punkt pro Welle (rot = gekommen). Danach Abend-UI im Haus wie bisher.
- Licht: in 8 s vom Sonnenuntergang in kühles, bläuliches Mondlicht. Aus allen Fenstern quillt warmes Licht (Schein um die Scheibe mit Bloom, schwacher Lichtkegel, warmer Fleck am Boden); ohne echte Lichtquellen, damit es am Handy flüssig bleibt.
- Wellen: Nacht 1 = drei Wellen (1 Hase + 1 Waschbär, 1 Hase + 2 Waschbären, 2 Hasen + 3 Waschbären). Jede weitere Nacht pro Welle 1 Tier mehr (abwechselnd Waschbär, Hase). Maximum pro Nacht = 10 + 4 × (Level − 1); darüber werden Tiere aus der größten Welle gestrichen. Werte in `night`.
- Nachttiere sind aggressiv und hauen erst ab, wenn ihr Leben weg ist (Hase 2, Waschbär 4 Treffer mit der Handharke, plus Level-Skalierung). Angriff zunächst nur Rechtsklick bzw. Angriffsknopf. Tagsüber-Hasen verschwinden bei Einbruch der Nacht ohne XP.
- Hasen (rote Augen) fressen Felder an: jedes Feld hat nachts 12 Lebenspunkte, ein roter Balken zeigt sie. Bei 0 ist das Feld zertrampelt (Pfotenabdrücke, Erdklumpen, umgeknickte Halme), die Pflanzen sind kaputt und der Balken bleibt minimal rot gefüllt. Reparieren = 10 s kniend mit der Handharke (Linksklick/Aktionsknopf), danach muss neu gesät werden. Angefressene, aber nicht zertrampelte Felder erholen sich über Nacht.
- Waschbären (funkelnde blaue Augen) jagen den Spieler. Jeder Biss: 8 Schaden und 12 % der heutigen Ernte aus der Tasche (nur Waren, die heute geerntet wurden und noch im Lager sind). Nach 3 Bissen hauen sie mit der Beute ab. Ein Treffer auf einen Waschbären lässt die Beute fallen (als ein paar Haufen), man sammelt sie wieder ein.
- Pflanzen wachsen nur tagsüber; nachts laufen Felder, Busch und Wildwuchs nicht weiter, Ernten und Arbeiten geht aber.
- Ohnmacht (0 Leben, Tag oder Nacht) = schlimmster Fall: die gesamte Tagesernte ist weg (auch was Tiere tragen oder am Boden liegt) und alle Felder sind zertrampelt. Danach immer die Cutscene „Ohnmacht“, dann Abend-UI. Die Abendübersicht zeigt zertrampelte Felder mit an.
- Cutscene „Ohnmacht“ (`src/farm/cutscene/faint.ts`, ca. 11,5 s): Ich-Perspektive am Boden, Augenlider flattern auf, alles verschwommen, nur die warmen Lichter des Hauses leuchten; die Sicht wird scharf, der Kopf hebt sich und dreht sich zu einem zertrampelten Feld, dann sackt die Kamera seitlich zu Boden, 1 s Blende ins Schwarz. Dazu Herzschlag, Atmen, fernes Waschbär-Lachen. Die Cutscene-Technik (`cutscene.ts`: Keyframes für Kamera, Augenlider, Unschärfe, Schwarz, Sound-Cues) ist wiederverwendbar.

### Annahmen (bitte prüfen)
- „Ernte aus der Tasche“ = Waren, die heute geerntet wurden; das Lager von gestern bleibt sicher.
- Die Nacht-Nummer ist der Spieltag (Tag 1 = Nacht 1). Im Tutorial gibt es keine Nacht.
- Eine Ohnmacht am Tag (selten, nachts sind die Gegner) überspringt die Nacht und löst ebenfalls den schlimmsten Fall aus.
- Ein Spielstand, der nachts gespeichert wird, macht in der Nacht weiter; Tiere, die gerade auf dem Hof waren, kommen nicht wieder, ausstehende Wellen schon.

## Welt-Editor: Wildpflanzen-Punkte, Gebäude, Entwürfe (Basti, 21.11.2026)
- Wildpflanzen-Spawnpunkte (Logik-Reiter „Wildpflanzen“: Einzeln, Sprühen mit Dichte, Entfernen): legen nur fest, WO Wildpflanzen (alle Einträge unter `wild.forage.plants`) wachsen dürfen. Wie oft bleibt in balancing.yaml. Sind Punkte gesetzt, wachsen Wildpflanzen und das Hof-Unkraut (Wildkräuter) nur dort (±0,3 m), sonst wie bisher am Waldrand / Grasrand. Brennholz und Steine bleiben am Waldrand.
- Alle Gebäude (außer Haupthaus und Brunnen, die eigene Werkzeuge haben) frei platzierbar (Logik-Reiter „Gebäude“, Q/E drehen). Im Editor umschaltbar (Taste G, „Ansicht“ oder Logik-Panel): ausgegraut = nur ganz leichte graue Form, darunter kann gemalt und bepflanzt werden (Standard); normal = wie gebaut. Grundriss und Freischalt-Level kommen aus balancing.yaml. Nicht platzierte Gebäude gibt es in dieser Welt nicht (Baumenü, Freischaltungen).
- Im Spiel ist ein ungebautes Gebäude unsichtbar: keine Baustelle, keine Ruine, kein Hindernis; dort ist, was im Editor gemalt/platziert wurde. Wird es gebaut, verschwinden Objekte, Gras und Wildpflanzen unter seinem Grundriss.
- Ältere Welten ohne Gebäudeliste: der Hofladen steht wie bisher automatisch neben dem Haupthaus; der Editor übernimmt diesen Platz beim Öffnen.
- Entwürfe: „Speichern → Als Entwurf speichern“ legt `public/world/entwuerfe/NAME.json` im Repo an (auch auf main). Das Spiel lädt Entwürfe nie von selbst; Testen über `index.html?welt=entwurf:NAME`. „Entwurf öffnen“ listet die Entwürfe im Repo.

## Haus-UI als aufgeschlagenes Buch (Basti, 21.11.2026)
- Abends im Haus: Hintergrund ist eine gemütliche Stube (warmes Holz, lodernder Kamin, Tisch mit Gemüsekisten, Garderobe mit Werkzeug, Fenster in die Nacht), prozedural gemalt (`src/farm/ui/houseBg.ts`, keine fremden Bilder), verschwommen; nur das Feuer bewegt sich.
- Darauf ein aufgeschlagenes altes Buch (vergilbtes Papier mit Textur, an den Rändern dunkler, leicht eingerissen). Lesezeichen oben in verschiedenen Farben: *Lager*, *Aufträge* (links), *Bauen*, *Produktion* (rechts). Seitenwechsel = kurze Umblätter-Animation (Blatt dreht über den Buchrücken, Papiergeräusch). Handy hochkant: die Seiten liegen untereinander, statt Umblättern ein kurzes Einblenden.
- Abends öffnet das Buch auf *Lager*. Abgeschlossene Aufträge abholen und die Frucht eines neuen Felds wählen liegen vorher auf dem offenen Buch (Lesezeichen ausgeblendet).
- **Lager:** links alle Waren des Spiels in Bereichen (Feldfrüchte, Wilde Pflanzen, Erzeugnisse; `storage.sections` in balancing.yaml), Raster fast unsichtbar, so viele Zellen wie Waren. Jede Ware: Icon, darunter Menge in Dunkelbraun und „+Ertrag des letzten Tages“ in Grün (nur > 0). Leuchtender Hintergrund nach Seltenheit (Common weiß, Uncommon grün, Rare blau). Nie besessene Waren: ausgegraut, Schloss, X. Sortierung pro Bereich: Seltenheit, dann Erntedauer kurz → lang (Erzeugnisse in der Reihenfolge der yaml).
- Rechts: Graph mit Umschalter *Lagerbestand* / *Ertrag pro Tag* (letzte `storage.history` Tage, Tag unter dem Finger/Maus wird angezeigt), darunter Daten der gewählten Ware: Icon, Name, Seltenheit, Bestand; je nach Art Wachstum/Reifezeit, Ernten, pro Ernte, pro Feld und Tag, Felder, XP; Herstellung und Verwendung (Rezepte, Ställe, Baukosten); Boni (Dünger, Stroh, Unkraut als Malus). Upgrades kommen später dazu.
- *Aufträge:* links die Aufträge des Tages, rechts die Tagesbilanz und Level-ups. *Bauen:* links die Gebäude, rechts was die nächsten Level freischalten. *Produktion:* wie bisher.
- Brennholz und Steine stehen unter „Wilde Pflanzen“ (Fundstücke vom Waldrand), Grünschnitt, Stroh und Gülle unter „Erzeugnisse“. Preiselbeeren, Stachelbeeren, Zitronen sind schon als gesperrte Feldfrüchte da.
- **Buch jederzeit (Basti, 21.11.2026):** Tagsüber öffnet **B** (PC) bzw. der Buch-Knopf oben rechts (Mobile) das Buch, B/Esc/„Zuklappen“ schließt es. Das Spiel pausiert solange. Statt der Stube liegt der verschwommene Hof dahinter. Lesbar: Lager, Aufträge (offene mit Auftrags-Icon, Bilanz des laufenden Tages), Bauen (nur ansehen, Bauen erst abends), Produktion. Schlafen, Belohnungen abholen und Feldwahl gibt es nur abends. Nicht im Tutorial, in Zwischensequenzen oder beim Tagesende.

## Hofladen + Aufträge im Haus-Buch (Basti 22.11.2026)
- Abends öffnet das Buch auf dem Lesezeichen *Hofladen*: links der Hofladen, rechts die Aufträge (Skizze von Basti). Die Seite mit der Tagesbilanz entfällt, das Abholen ist kein eigener Bildschirm mehr.
- **Aufträge:** Karten im 3×3-Raster mit Titel, Zielen (Menge, Icon, Name) und Belohnung (XP, Gefallen), oben rechts der Gefallen-Stand. Erledigte stehen oben (grün) und werden per Klick abgeholt, oder alle mit *Alle abschließen*: Münzen fliegen zum Gefallen-Stand, Münz-Sound. Abgeholte bleiben mit Haken stehen, offene/verfallene darunter. Was beim Schlafengehen noch nicht abgeholt ist, wird automatisch gutgeschrieben.
- **Auftrags-Slots:** 2 am Anfang, +1 auf Level 5, 10, 15, … 35 (höchstens 9; `quests.daily.slots`). Gesperrte Slots zeigen das Level. Die Arbeitsmenge aller Aufträge zusammen bleibt `load` (mehr Slots = mehr, aber kleinere Aufträge).
- **Archiv:** Knopf unten auf der Auftragsseite, zeigt alle abgeholten Aufträge (neueste zuerst, nach Tagen), lädt beim Scrollen je 40 nach. Gespeichert werden höchstens 5000.
- **Hofladen:** ab Level 7 baubar (vorher Level 2), Kosten weiter 90 Gefallen. Oben eine Kurzübersicht des Lagers (Anzahl, Icon, Name; bei mehr als 15 Waren Reiter pro Bereich), darunter 9 Verkaufs-Slots: 2 ab Level 7, +1 auf Level 12, 17, 22, … (`shop.slots`).
- Ware per Drag & Drop (Maus und Finger) in einen Slot ziehen, alternativ Ware antippen und dann Slot antippen. Slot zeigt oben Menge + Name („Alle“ = alles im Lager), groß das Icon, unten mittig den Preis pro Stück. Slot auf einen anderen ziehen tauscht, aus dem Raster ziehen leert ihn.
- Klick auf einen Slot = Bearbeiten: *Sale* (−30 %, rot mit Schildchen) und *Premium* (+30 %, golden glänzend mit Schildchen) neben dem Preis, Schieberegler + Eingabefeld für die Höchstmenge (ganz rechts = Alle). Grün/Enter/Klick daneben bestätigt, Rot/Esc verwirft, Mülleimer leert den Slot.
- **Verkauf:** über den Tag, abgerechnet abends. Pro Slot Nachfrage im Wert von `shop.demand` Gefallen (±30 %), Sale verkauft 1,6×, Premium 0,5× so viel. Normalpreis = Feld-Sekunden pro Stück × `shop.rate` (Aufträge zahlen 0,12, der Laden 0,08), Erzeugnisse = Zutaten × 1,25, Wildes/Gesammeltes aus `shop.prices`. Bruchteile werden mitgezählt. Verkaufte Menge steht abends rot im Slot, der Erlös neben „Hofladen“.
- **Nächster Tag:** großer Knopf rechts mittig neben dem Buch („Nächster Tag – Tag X“) statt *Schlafen* unten. 0,6 s gedrückt halten, ein Balken läuft von links nach rechts; früher loslassen bricht ab. Handy hochkant: breiter Knopf unter dem Buch.

## Wildkräuter statt Unkraut, Bärlauch, Löwenzahn, Sauerampfer (Basti, 21.11.2026)
- Unkraut auf dem Hof (außerhalb der Felder), Bärlauch, Löwenzahn und Sauerampfer sind jetzt **eine** Pflanze: ein kleines gemischtes Büschel (Unkrauthalme, Bärlauchblätter mit weißen Blüten, Sauerampfer-Stängel, Löwenzahn-Rosette mit gelber Blüte). Unkraut auf den Feldern bleibt wie es ist.
- Häufigkeit wie bisher das Hof-Unkraut (`wild.weeds`: Start 40, höchstens 100, alle 6-12 s eins nach). Bärlauch, Löwenzahn und Sauerampfer wachsen nicht mehr einzeln, nur Pilze, Brennholz und Steine bleiben Sammelgut.
- Jäten (Handharke, 1 s) würfelt die Ausbeute (`wild.herbs`): Roll 1 gibt zu 90 % 1 Unkraut (= 1 Grünschnitt), zu 10 % 2 gleiche zufällige Kräuter. Dann 2 weitere Rolls, jeder mit je 10 % für Bärlauch, Löwenzahn oder Sauerampfer (70 % nichts). Ergebnis: 44 % keine Kräuter, 38 % eins, 13 % zwei, 4 % drei, 1 % vier. Im Schnitt 0,8 Kräuter pro Büschel.
- **XP:** Unkraut gibt weiterhin keine XP. Jedes gefundene Kraut gibt so viel wie früher ein Sammelvorgang (`xpPicks: 3`: Bärlauch 2, Löwenzahn/Sauerampfer 3). Pro Büschel im Schnitt etwa 2 XP.
- Alte Spielstände: Hof-Unkraut und Sammelgut wachsen einmal neu (Platzierungsversion 3).

## Arbeitsrhythmus, Feldanzeige, Third-Person-Steuerung (Basti, 21.11.2026)
- **Pause zwischen Arbeitsschritten:** Nach jedem fertigen Schritt (Jäten, Kanne füllen, Sammeln, Ernten …) gibt es immer 0,5 s Pause (`player.actionGap`), erst dann startet automatisch der nächste Schritt. Man bleibt dabei in der Hocke.
- **Nur am selben Feld (geändert 22.11.2026):** Gehalten folgt nur die nächste Aktion am selben Feld/Ziel. Zwischen den Schritten steht die Figur auf (Idle-Pose), wartet 0,5 s und macht dann weiter. Ist am Feld nichts mehr zu tun, bleibt sie stehen; kein automatischer Wechsel zum nächsten Feld mehr.
- **Feldanzeige nur in der Nähe:** Wachstumsbalken, Restzeit und darüber der Name der Pflanze (`crops.<id>.name`, z. B. „Weizen“, „Kartoffel“) werden nur eingeblendet, wenn man nah dran ist (`plots.info`: bis 2,6 m voll, ab 3,6 m weg, weich überblendet). Gilt auch für den Blaubeerbusch.
- **Erntebereit:** Ein reifes Feld zeigt in der Nähe den Namen, einen goldenen Balken (= verbleibende Erntevorgänge) und ein Häkchen.
- **Schlafen (aufsteigende „Z“):** Felder, deren Restwachstum länger ist als der Rest des Tages, wachsen über Nacht fertig und sind am nächsten Morgen erntereif; statt der Restzeit steigen kleine „Z“ auf. Ebenso beim leer gepflückten Blaubeerbusch, bei leer geschüttelten Obst-/Nussbäumen und leeren Brombeeren (nur in der Nähe). Ein gegossener, noch wachsender Blaubeerbusch ist am nächsten Morgen reif.
- **Steuerung PC (Third Person):** Maus wird beim ersten Klick gefangen und dreht die Kamera, WASD laufen relativ zur Kamera (W = Blickrichtung). Linke Maustaste oder **E** = Aktion am nächsten Ziel vor der Figur (halten = weiter), rechte Maustaste oder **Leertaste** = Kämpfen (zielt automatisch auf das nächste Tier). Mausrad = Zoom, mittlere Maustaste ist frei. Esc gibt die Maus frei und pausiert. Die Kamera kann tiefer geneigt werden (`camera.pitch` ab 0,35).
- **Freie Sicht auf die Figur:** Alles zwischen Kamera und Figur (Bäume, Büsche, Gebäude, Zäune) wird rund um die Figur sanft ausgeblendet (feines Dithering, ein leichter Schatten des Objekts bleibt sichtbar). Gras und Beete bleiben.

- **Nachtrag 22.11.2026:** Ausblendung vor der Kamera doppelt so groß. Ein schlafendes Feld zeigt nur die „Z“, keinen Balken/Namen. Ernte-Popups: „Anzahl Icon Name“, Schrift in der Farbe der Seltenheit (Common weiß, Uncommon grün, Rare blau), enger untereinander, steigen von unten auf; ein Glückswurf (Kräuter beim Jäten) etwas größer.

- **Kamera (22.11.2026, überarbeitet):** Third Person 3 m hinter der Figur (Start), per Mausrad bis 10 m. Über 10 m hinaus gegen den Widerstand (ca. 3 Rasterschritte): Top-Down aus 10 m Höhe, oben = Blickrichtung; dort weiter rauszoomen bis 15 m. Zurück in die normale Ansicht: bei 10 m Höhe ca. 1 Rasterschritt hineinscrollen. First Person wurde wieder entfernt (zu hakelig). Handy: Pinch mit zwei Fingern rechts. Werte in `camera.zoom`.
- **Aktives Ziel:** Das zuletzt bearbeitete Feld/Ziel bleibt bevorzugt, solange dort noch etwas geht (gesät + nochmal klicken = dieses Feld gießen, nicht das Nachbarfeld). Erst dann wird das nächste Ziel aktiv. Sprießen nach dem Säen und Abräumen nach der Ernte dauern nur noch 0,5 s (= Pause zwischen Schritten), das Feld ist bereit, sobald die Figur wieder steht.
- **Figur dreht mit der Kamera:** Steht die Figur, dreht sie sich leicht verzögert in die Blickrichtung (kritisch gedämpfte Feder, immer der kürzeste Weg, max. 12 rad/s, `player.turnWithCam`), auch bei schnellem Drehen keine Extra-Umdrehungen.
- **Esc:** öffnet und schließt die Pause; verweigert der Browser direkt nach Esc das erneute Fangen der Maus, wird es kurz danach automatisch wiederholt.

- **Ernten im Vorbeilaufen (22.11.2026):** Ernten (Feld, Busch, Brombeeren, Sammeln, Bäume schütteln) startet schon in Reichweite, ohne erst hinzulaufen. Währenddessen ist das Laufen pausiert, Bewegungseingaben brechen nicht ab; sobald die Ernte fertig ist oder die Taste losgelassen wird, läuft die Figur weiter. Andere Arbeiten (Säen, Gießen, Jäten …) bleiben wie bisher.

### Annahmen (bitte prüfen)
- Die Kampf-Zielhilfe zielt am PC jetzt wie am Handy auf das nächste Tier, weil die Maus nicht mehr auf den Boden zeigt.
- Handy bleibt wie es ist (Stick links, Wischen rechts dreht die Kamera), es passte schon zur Third-Person-Logik.
- Name, Balken und „Z“ erscheinen nur in der Nähe, auch bei Bäumen und Brombeeren.

## Erntereif-Meldung (Basti, 22.11.2026)
- Oben links unter HP/XP: Sobald ein Feld erntereif ist, blendet von unten eine Meldung „[Frucht] erntereif“ ein.
- Jedes weitere reife Feld schiebt sich von unten in die vorhandene Meldung und lässt sie kurz aufploppen: „2 Felder erntereif“ usw.
- Wird geerntet, zählt die Zahl herunter; ist nichts mehr reif, blendet die Meldung aus. Gezählt werden nur Felder (keine Büsche/Bäume).

## Nachtlaternen statt grellem Bloom (Basti, 22.11.2026)
- Nachts deutlich weniger Bloom (Stärke 0,5 statt 1,15, Schwelle 0,86), Fensterlicht auf gut die Hälfte gedämpft. Die Hauswand blendet nicht mehr.
- Eigene altmodische Laterne (Eisenrahmen, warmes Glas mit Sprossen, Pyramidendach, Ring). Nachts glüht das Glas, dazu ein weicher Schein und ein warmer Lichtfleck am Boden (gefaked, kein echtes Licht).
- **Hofbaum:** drei Laternen je 120° um den Stamm, die erste zeigt zur Hofmitte. Jede hängt an einer Kette von einem echten Ast (aus der Baumgeometrie gesucht), leicht unterschiedliche Höhen (2,0 / 2,25 / 1,8 m) und schaukelt leicht. Der Baum ist der, der der Hofmitte (Felder + Haustür) am nächsten steht, oder `laternen.baum.punkt`. Unter dem Baum gibt es das einzige zusätzliche echte Licht.
- **Hofeingänge:** je links und rechts eine Laterne. Steht dort ein Zaun, sitzt sie auf dem Zaunpfosten, sonst auf einer ebenen Stelle des Felsens bzw. auf dem Boden (wird beim Start automatisch gesucht). Gesetzt an den drei Zauntoren (Südwest, Mühle, Hauptweg zum Hofladen) und am Felsdurchgang im Westen. Im Welt-Editor unter „Hof → Laterne“ verschieb- und ergänzbar.
- **Haustür:** die alte Türlampe ist jetzt dieselbe Laterne unter dem Vordach neben der Tür, ihr Licht ist schwächer (6 statt 22).
- Werte in `balancing.yaml` unter `nachtlicht` und `laternen`.

## Handy-Kamera und Interaktionsbereiche (Basti, 22.11.2026)
- Handy: Die Kamera schaut immer in Laufrichtung und schwenkt beim Laufen hinter die Figur (camera.follow), auch im Top-Down. Kein Drehen per Wischen mehr. Läuft man auf die Kamera zu, dreht sie sich nicht um.
- Handy: Zwei Finger = Pinch-Zoom (Third Person 3–10 m, weiter raus = Top-Down 10–15 m), überall auf dem Bildschirm, auch wenn ein Finger auf einem HUD-Feld landet.
- Interaktion: Jedes Ziel hat einen Interaktionsbereich (player.zone vom Rand, Sammelkram/Unkraut player.zoneSmall, Felder plots.zone von der Mitte, Felder überlappen etwas). Nur im Bereich passiert etwas.
- Immer das nächste Ziel, auch wenn dort gerade nichts zu tun ist; kein automatisches Wechseln. Im Überlapp: erst das aktuelle Feld, wenn es für den nächsten Schritt bereit ist, sonst das andere; ohne aktuelles Feld das mit der näheren Mitte.
- Im Bereich startet die Aktion sofort (leiser Klick, Ring ploppt, Balken läuft), die Figur läuft dabei selbst an die Arbeitsstelle und kniet sich erst dort hin. Der Schritt wird erst fertig, wenn sie angekommen ist.
- Handy (Basti, 22.11.2026 nachmittags): Das Info-Label über dem Ziel („[Gießen]“, „[Ernten]“) ist antippbar, ein Tippen = ein Arbeitsschritt (wie Aktionsknopf, Ring oder Antippen des Ziels).
- Durchsicht durch Bäume, Dächer und Zäune: am PC 50 % größer, am Handy doppelt so groß wie vorher (camera.occlusion).
- Steuerungs-Empfindlichkeit (Basti, 22.11.2026): Regler unter dem Steuerungsbild in den Optionen. PC: Maus. Handy: Joystick (wie weit der Daumen für volles Tempo muss), Zoom (Pinch), Kamera (wie schnell sie hinter die Figur schwenkt). 0,25× bis 3×, Mitte = 1× rastet ein, pro Gerät lokal gespeichert.

## Freie Saatgutwahl (Basti, 22.11.2026, ersetzt „feste Frucht pro Feld“)
- Felder haben keine feste Frucht mehr. Jedes Level-up schaltet ein Feld allgemein frei (öffnet sich sofort auf dem nächsten freien Platz). Gesät wird das **aktive Saatgut**.
- Start: Saatgut Weizen, Kohl, Zwiebel (`seeds.start`), 3 offene Felder (`start.plots`). Saatgut ist unendlich, kein limitierender Faktor.
- Neues Saatgut: jedes Level-up legt abends im Buch „Neues Saatgut“ auf: Wahl aus `seeds.offer` (3) Sorten, die man noch nicht hat. Erst alle Commons, dann Uncommons, dann Rares (Fruchttabelle). Mehrere offene Wahlen bieten nie dieselbe Sorte doppelt an.
- Aktives Saatgut wechseln: **PC** Tab (Shift+Tab zurück), Anzeige unten rechts mit Taste, Icon und Name. **Handy** Saatgut-Knopf neben dem Arbeitsknopf mit Icon und Name: Tippen = nächstes Saatgut, Gedrückthalten = Liste aller Sorten; Antippen einer Sorte wählt sie und schließt, Tippen daneben schließt ohne Änderung.
- Im Koop hat jeder Spieler sein eigenes aktives Saatgut (aus dem Saatgut des Hofs).
- **Handy: ein Knopf für Arbeiten und Kämpfen** (Test): Antippen/Halten = Arbeiten (wie vorher), nach unten ziehen = Arbeiten, nach oben ziehen = Kämpfen (solange oben gehalten). Oben ein rotes Waffensymbol, unten das Werkzeug.
- Aufträge nehmen alle Waren des vorhandenen Saatguts (nicht mehr nur die Früchte der Felder); der Tagesumfang bleibt über die Feldzahl begrenzt.
- **Wildauftrag** ab Level 2 (`quests.daily.wild`): mit 50 % Chance ist einer der Tagesaufträge ein Kräuterauftrag (1–2 Sorten aus Bärlauch, Löwenzahn, Sauerampfer, je 2–3 Stück) aus den Wildkräuter-Büscheln. Belohnung nach `sec` Arbeit pro Kraut wie bei den anderen Aufträgen.
- Alte Spielstände: die Früchte der bisherigen Felder werden zu Saatgut, noch nicht platzierte Level-up-Felder öffnen sich und bringen je eine Saatgut-Wahl.
