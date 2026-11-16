# PathOfGardening – Design-Entscheidungen

Zahlen stehen ausschließlich in `balancing.yaml`. Hier stehen die Regeln und das „Warum“.

## Grundsätze
- **Keine Erklärtexte im Spiel.** Mechaniken, Steuerung, Upgrades werden nicht erklärt. Spieler entdecken selbst. Später kommt ein Tutorial für die zentralen Mechaniken.
- **Steuerung** steht nur auf der Seite *Optionen → Steuerung* (bzw. *Pause → Steuerung*): visuell, getrennt für PC und Mobil, groß genug für das jeweilige Gerät.
- **Level-up-Karten:** Bild + Titel + höchstens 2 Zeilen, Zahlen mit Icons statt Sätzen. Es darf spannend bleiben. Ausnahme (16.11.2026): Upgrade-Karten bekommen darunter eine knappe Erklärzeile, meist ein Wort (`names.hints`).
- Arbeitstitel: **PathOfGardening** (früher „Beerenwacht“).

## Steuerung
- **PC:** WASD laufen, Maus zielen, linke Maustaste = aktive Waffe (halten = Dauerfeuer), Leertaste = nächste verfügbare Waffe, Esc = Pause.
  - Reihenfolge Harke → Spargel-Armbrust → Schrotflinte → Kohlbombe. Leertaste springt nur auf Waffen, die gerade *bereit* sind.
  - Wird die aktive Waffe leer, wechselt das Spiel automatisch zur nächsten bereiten Nicht-Harke-Waffe, sonst zur Harke.
  - Die aktive Waffe ist unten rechts hervorgehoben.
- **Mobil:** linker Daumen irgendwo links = laufen. Rechts wischen = Harke zielen. Jede Waffe ist ein eigener Joystick: tippen = automatisch zielen, halten + ziehen = zielen und feuern.

## Optik
- Das Spiel ist insgesamt dunkel. Am Rand ist es komplett schwarz, nur Silhouetten von Büschen und Bäumen.
- Auf den Büschen am Rand sitzen kleine Augenpaare (2–3 pro Busch, alle gleich groß ±10 %, dunkelblau bis lila). Sie leuchten selbst, beleuchten aber nichts und haben keinen Bloom. Beim Blinzeln klappen Lider schnell runter und hoch. Kurz vor einem Stoß füllen sich die Büsche in dieser Richtung mit Augen (`waves.warnTime`).
- Früchte am Busch leuchten nicht, nur Früchte, die herumliegen. Geschosse leuchten deutlich stärker.
- Harken-Animation und Trefferfläche sind identisch: ein Rechteck vor dem Spieler (Länge `rake.range`, Breite `rake.width`). Kein Marker: Nur die Kratzspuren der Zinken zeigen, wo geharkt wurde. Der Harkenkopf ist genau so breit wie die Spur, mit einer Zinke pro Kratzer im festen Abstand (7,5 cm). Beim Breite-Upgrade kommen Zinken und Kratzer dazu, nichts wird verzerrt. Die Kratzer sind leicht wellig und an Anfang und Ende ausgefranst. Die Züge kommen abwechselnd von links und rechts, das Rechteck ist dabei um `rake.tilt` (15°) um den Spieler gedreht.
- Jeder Harkentreffer: Comic-Punch-Stern pro getroffenem Gegner + Punch-Sound pro Ziel (leicht versetzt), damit man hört und sieht, wie viele getroffen wurden.

## Gegner
- Kommen in **Stößen** mit kurzen zufälligen Abständen, pro Stoß aus mehreren Richtungen. Mit der Zeit mehr Gegner pro Stoß und mehr Richtungen.
- Stand der offenen Fragen aus dem Prototyp: Munition pro Schuss 1 Spargel / 6 Preiselbeeren / 1 Kohl, Verschmelzen 10 → 1 für alle Früchte, Kröte 10 HP, Panda flieht mit 5 Früchten, Mini-Kohl max. 5.

## Felder und Bauen (15.11.2026)
- Felder sind flach, 3 m groß (Ecke zu Ecke) und liegen lückenlos im Hex-Raster. Kein Collider: Spieler und Gegner laufen drüber, Früchte sammelt man im Vorbeilaufen. Gegner greifen ein Feld an, indem sie draufgehen.
- Wer mit seinem Mittelpunkt auf einem Feld steht, heilt es (1 HP/s).
- Feld-Karten gibt es für alle Typen und beliebig oft. Nach der Wahl öffnet sich eine Bauansicht von oben, in der man das Feld auf einen Platz setzt: freier Platz = neues Feld, anderer Typ = überbauen, gleicher Typ = Seltenheit hochleveln (1, 2, 3, 4 Felder bis Ungewöhnlich, Selten, Episch, Legendär).
- Seltenheit: Produktion x1,5 je Stufe (multiplikativ) und +10 % für jedes angrenzende Feld je Stufe (additiv). Annahme: Der Nachbarbonus wächst mit jeder Seltenheitsstufe des Feldes, nicht nur einmal.
- Bauansicht: Farbe des Platzes zeigt das Ergebnis (weiß frei, gold hochleveln, rot überbauen), Punkte zeigen den Fortschritt zur nächsten Seltenheit. Rand eines Feldes = Seltenheitsfarbe (grau, grün, blau, lila, orange).
- Nach einer Feld-Karte gibt es 5 Level-ups lang keine Feld-Karten. Schon genommene Karten kommen etwas häufiger (+25 % Gewicht je Mal).

## Kohlbombe (15.11.2026)
- Keine Betäubung mehr. Nach der Explosion bleibt eine Giftlache: 3 s, 2 Ticks/s, je Tick 10 % des Kohlschadens (gesamt 60 %), Gegner darin 35 % langsamer.
- Annahme: Die Wunschangabe „10 % pro Sekunde, insgesamt 60 %“ passt nur mit 10 % pro Tick zusammen, deshalb pro Tick.

## Koop (bis 4 Spieler)
- Technik: WebRTC über **PeerJS**. Funktioniert von GitHub Pages aus, weil der öffentliche PeerJS-Server nur den Verbindungsaufbau vermittelt. Der Host rechnet das Spiel, die anderen schicken nur Eingaben und bekommen Zustände zurück.
- Ablauf: *Koop → Spiel erstellen* zeigt einen 5-stelligen Code. Die anderen geben ihn bei *Beitreten* ein.
- Gemeinsam: Stufe/XP, Felder, Doppelernte. Pro Spieler: Waffen, Upgrades, Munition (wer einsammelt, bekommt sie).
- Level-up pausiert für alle; es geht weiter, wenn alle gewählt haben.
- **Skalierung** (Faktor = Spielerzahl ^ Exponent, alles in `coop`):
  - benötigte XP × n
  - Gegner pro Stoß × √n, Gegner-HP × √n → Gesamt-HP der Gegner × n
  - Blaubeer-Menge × √n, XP pro Blaubeere × √n → XP-Einkommen × n, also gleiches Level-Tempo wie solo
  - Gegnerschaden bleibt gleich (Exponent 0)

## Sounds (15.11.2026)
- Zuordnung Ereignis → Clip, Lautstärke, Tonhöhen-Streuung und Mindestabstand in `sounds.yaml` (wird wie `balancing.yaml` beim Start gelesen).
- Rohdateien liegen in `sfx/` nach Zweck sortiert (`animals`, `plants`, `ambient`, `ui`, `collect`, `effects`), Ungenutztes in `sfx/unused/`. Geschnittene Clips (mono, 16 bit) liegen in `public/audio/`. Geschnitten wird mit `tools/sfx-tool.js` im Dev-Server.
- Pro Tier und Aktion bis zu 3 Varianten, nie zweimal derselbe Clip hintereinander, dazu zufällige Tonhöhe. Aktionen: neue Welle, Nahrung nehmen, weglaufen, angreifen, Pflanze angreifen, Anlauf (Schaf), sterben.
- Tierlaute sind kurze Einzel-Laute (ein Peak, 0,2–0,3 s), weich gefiltert und eher leise. Der Panda nutzt die Waschbär-Laute etwas höher. Das Waschbär-Fauchen ist kurz und gedämpft.
- Sounds sind räumlich: leiser mit Abstand zum eigenen Spieler, links/rechts verteilt. Wellen-Rufe kommen vom Rand, an dem die Welle startet.
- Pflanzen klingen je Art verschieden: Blaubeere/Preiselbeere = Pflück-Knipsen (Preiselbeere höher), Spargel = dumpf-holziges Klopfen, Kohl = knackiges Blätter-Rupfen.
- Ambiente: Grillen-Teppich, leises Fackelknistern, ab und zu Krähe/Eule aus dem Wald.
- UI: Klick (Menü-Knöpfe), Blubb beim Überfahren einer Karte, Glas-Bestätigung beim Wählen/Setzen, eigener Level-up- und Seltenheits-Sound, kurzer Ton bei „Waffe bereit“ und beim Waffenwechsel, Glocke bei Spielende.
- Einsammeln: Blaubeeren = kleines Bloop, das bei schnellem Einsammeln jeweils einen Halbton höher klingt; Munition = Mund-Plopp; große Früchte = Pop; Verschmelzen = Korken. Die Kohl-Giftlache blubbert.
- Das Kröten-Quaken aus dem Hintergrund ist leise und kommt nur etwa 2–3× pro Minute, zufällig verzögert. Einsammel-Geräusche sind leise, tiefer gestimmt und dumpf gefiltert. Grillen sind leiser.
- Nicht verwendet (`sfx/unused/`): Tag-Vögel (passen nicht zur Nacht), Panda-Rufe (Panda nutzt Waschbär-Laute), Brumm-Drone, einzelner Mund-Plopp, zweiter UI-Klick mit langem Nachhall, langer Skill-Upgrade-Jingle (zu lang neben dem Level-up-Sound).
- Selbst erzeugt (keine passenden Aufnahmen): Spieler getroffen, Spieler stirbt, Wiederbelebung, Feld welkt, Rammstoß-Anteil, Zungen-Schnalzen.

## Licht und Atmosphäre (15.11.2026)
- Mehr Bloom, leicht kühles Mondlicht, der Garten etwas heller als der Rest.
- An jeder Ecke eines Feldes steht eine kleine Fackel (geteilte Ecken bekommen eine), die nur wenig Licht auf den Boden wirft.
- Hinter den Büschen ziehen Nebelschwaden.
- Augenpaare: siehe Optik oben (kleine dunkelblaue bis lila Paare auf den Büschen, Lider blinzeln).
- Herumliegende Blaubeeren glühen stärker und pulsieren schneller, je näher das Team am nächsten Level-up ist.
- Mausrad: zoomen (PC).

## Beackern und Feldrand (15.11.2026)
- Harken wie ein Mensch (16.11.2026, ersetzt Kegel und „Feld unter sich“): Der Spieler legt die Harke `rake.range` m vor sich ab und zieht sie bis zu sich zurück. Die Fläche ist ein Rechteck (Länge `rake.range`, Breite `rake.width`). Jeder Zug trifft alle Gegner im Rechteck (Schaden wie bisher) und beackert gleichzeitig alle Felder, die das Rechteck überdeckt. Upgrades: Breite (`upgrades.rakeWidth`, +20 cm, ersetzt Kegel) und Reichweite (`upgrades.rakeRange`, +20 cm Länge).
- Droprate 16.11.2026: alle Erntezeiten verdoppelt (halbe normale Produktion), `fields.tillStroke` von 1 auf 6 (Harken-Ertrag ×3).
- Ertrag durch Harken: Jedes Feld unter dem Rechteck schiebt seine Ernte um `fields.tillStroke` s × (überdeckte Fläche / Fläche der Grundharke) vor. Grundharke ganz auf einem Feld → Ernte alle (Erntezeit × Harken-Abklingzeit) s. Breitere/längere Harke und mehr Tempo = mehr Ertrag; ein Zug über zwei Felder teilt sich anteilig auf. Jedes Feld ist intern in 6 Dreiecke geteilt (Mitte + 2 Ecken, nicht sichtbar), in jedem steht eine Pflanze. Die Fläche wird pro Dreieck exakt berechnet (Dreieck am Rechteck abgeschnitten, wenige µs pro Zug für alle Felder). Nur die Pflanzen der geharkten Dreiecke wackeln, verlieren Blätter und lassen den Ertrag fallen (anteilig zur Fläche). Ertrag fällt aus den Büschen, die normale Produktion am Rand läuft parallel.
- Feedback pro Harkenzug: Feld leuchtet kurz hell auf, die Büsche werden durchgekämmt (rütteln, wippen), Blätter wirbeln hoch. Dazu prozedurales Gebüsch-Rascheln.
- Ein beackertes Feld wackelt leicht und sein Rand leuchtet heller, 1 s nach jedem Zug (`fields.tillDuration`). Die Spieler-Heilung beim Beackern läuft nur über das Feld, das der Zug am meisten überdeckt hat.
- Der Feldrand ist ein Ladebalken: Ein dezent leuchtender Impuls läuft im Uhrzeigersinn um das Feld, jede der 6 Kanten ist eine Ernte. Kommt der Impuls an einer Ecke an, fällt dort der Ertrag (`fruit.cornerScatter`). Die Geschwindigkeit folgt der Produktionszeit inklusive Seltenheit, Nachbarbonus und Beackern.

## Waffen und Gegner (15.11.2026, Runde 2)
- Schrotflinte: Beeren gleichmäßig im 50°-Fächer, alle 10° eine (6 Beeren), doppelt so schnell. Offen: was „12 Schuss“ meint.
- Spargelgewehr: Geschoss 3× breiter (30 cm Trefferbreite), doppelte Feuerrate. Spargel- und Preiselbeerfelder werfen pro Ernte 3 Früchte (3× Ertrag).
- Eine Waffe feuert, solange Munition für einen Schuss da ist. Bei 0 wechselt das Spiel sofort zur nächsten bereiten Waffe (sonst Harke). Geschosse, die schon fliegen, treffen weiterhin.
- Neue Upgrades für die Harke (Reichweite, Schaden, Rückstoß, je 10×), Spargel-Geschossgröße (5×), Durchbohr-Schaden +10 % (5×, bis 100 %), Feldpflege (Beackern heilt).
- Annahme Feldpflege: „heilen beim Beackern um 1/s mit Chance von +20 %“ ist umgesetzt als +1 HP/s je Stufe mit 20 % höherem Ziehgewicht der Karte. Bitte bestätigen.
- Doppelte Gegnermenge (Stoßgröße Start/Zuwachs/Max, Obergrenze gleichzeitig). HP dafür auf etwa 60 % gesenkt (Waschbär 7, Panda 11, Kröte 6, Schaf 3 + Schild 6). Gesamt-HP pro Stoß also etwa 1,2×.
- Büsche stehen näher an den Feldern (13–15 m), Gegner kommen bei 15,5 m aus ihnen heraus (`waves.spawnRadius`).
- Sounds: Beackern = echter Harken-Sound. Ein Waschbär, der mit Beute flieht, lacht keckernd (doppelt so schnell und höher), alle 2,5–4 s. Der Panda tut das etwas höher.

## Leben und Munition anzeigen (15.11.2026)
- Leben zeigen nur der Lebensbalken im HUD und die Balken über den Mitspielern (der Hut ist seit dem Charakter-Editor reine Deko, Basti 16.11.2026).
- Unter 5 % Leben glühen die Bildschirmränder dauerhaft rot, bis wieder Leben da ist oder man nach dem Tod voll geheilt wird. Die Mitte bleibt frei, damit es beim Spielen nicht stört. Schwelle und Stärke unter `hud.hat` (`vignetteBelow`, `vignetteStrength`).
- Munition der aktiven Waffe schwebt über dem Kopf: nach einem Waffenwechsel 1,5 s sichtbar, dann sanft weg. Sobald nur noch etwa 3 s Dauerfeuer übrig sind (Munition ÷ Kosten × Abklingzeit), erscheint sie 1 s lang (rötlich). Lädt man nach über die Schwelle, warnt sie beim nächsten Mal wieder. Werte unter `hud.ammo`.

## Kartenregeln und Balancing (15.11.2026, Runde 3)
- Pro Level-up 3 Karten: immer 1 Feld-Karte (Feld eines Typs, den es schon gibt – bauen oder Seltenheit hochleveln –, Doppelernte oder Feldpflege) und höchstens 2 Waffen-Karten (Freischalten + Upgrades inkl. Harke).
- Neue Feldtypen gibt es nur alle 5 Level (Level 5, 10, 15 …): dann 2 verschiedene neue Typen zur Wahl, solange noch welche fehlen. Die frühere „5 Level keine Feld-Karte“-Sperre ist entfallen.
- Jeder Seltenheitsaufstieg verdoppelt die max. HP des Feldes (`fields.rarityHp`), das Feld wird dabei voll geheilt. Annahme: gemeint ist der Aufstieg, nicht jedes einzelne Draufbauen.
- XP-Kurve flacher: Faktor 1,05.
- Schafe: halb so häufig, höchstens 5 gleichzeitig (überzählige werden zu Waschbären), Wolle und Schild deutlich dunkler, damit nichts mehr überstrahlt.
- Schrotflinte nochmal stärker: Abklingzeit 0,5 s (+50 % Feuerrate), Reichweite 6,75 m (+50 %).

## Startfelder, Heilen, Zitronenbäumchen (16.11.2026)
- Die 3 Startfelder sind unzerstörbar, solange noch irgendein anderes Feld lebt. Erst wenn alle anderen kaputt sind, kann man sie zerstören (und damit verlieren).
- Beackern heilt: das beackerte Feld, den beackernden Spieler und im Koop alle Mitspieler, die mit dem Mittelpunkt auf diesem Feld stehen (je 1 HP/s). Die Feldpflege-Karte erhöht beide Werte.
- Zitronenbäumchen ab Level 10 als neuer Feldtyp: kleiner Baum, bei jeder Ernte zuckt ein Blitz zwischen den Zitronen und sie leuchten kurz auf.
- Citrateaser (Munition Zitronen): trifft genau 1 Ziel direkt (16 Schaden, 1 Angriff/s), springt auf bis zu 2 Nachbarn (50 %), die je auf 2 weitere (25 %). Max. 100 % + 2×50 % + 4×25 % = 300 %. Das erste Ziel lässt seine Beute fallen. Spezial-Upgrades: +1 Ziel (3. Glied → 2. Glied → Hauptziel) und +10 % Weiterleitung (4×).
- Treffer-Aufblitzen der Gegner halbiert, damit Bloom nicht mehr überstrahlt.

## Wellen (16.11.2026)
- Gegner kommen in 48 Wellen (`waves.total`, = 2 Tag-Nacht-Zyklen), nach Welle 48 ist die Ernte gerettet (Sieg). (Bis 16.11.2026: 50 Wellen.)
- Eine Welle besteht aus Gruppen (Stößen) aus mehreren Richtungen. Innerhalb der Welle werden die Gruppen größer (50 % → 150 % der Grundgröße), am Ende kommt eine große Schlussgruppe (250 %).
- Die Welle ist vorbei, sobald ihre letzte Gruppe gestartet ist. Die Pause beginnt sofort, auch wenn noch Gegner leben.
- Welle 1: genau 5 Waschbären. Danach wächst jede Welle: länger (+2,5 s), Gruppen größer (+0,8 je Welle), Gruppen dichter; die Pause wird nur minimal länger (+0,1 s).
- Tiere kommen ab Welle: Waschbär 1, Panda 4 (früher, sobald Spargel/Preiselbeere steht), Kröte 7, Igel 11, Schaf 21 (seit 16.11.2026, vorher Schaf 11).
- HUD zeigt dezent „Welle / Gesamt“ (grau während der Pause).
- Testmodus: Im Cheat-Menü (E) kann man jede Welle 1–100 direkt starten.

## Elite-Gegner und XP-Drops (16.11.2026)
- Elite sind selten: ab Welle 4 (1 %, +0,2 % je Welle, max. 5 %), 1,5× so groß, 3× Leben, 2× Angriffsstärke (Kröten-Gift doppelt).
- Elite-Optik: statt rotem Leuchtrand eine leuchtende Outline in der Farbe des Tiers (Augenfarbe: Waschbär blau, Panda orange, Kröte grün, Igel gelb, Schaf gold) mit leichtem Bloom. Tagsüber etwas breiter und heller, damit sie im Hellen lesbar bleibt.
- Jeder besiegte Gegner lässt 1 Blaubeere (XP) fallen, Elite 5. Werte unter `enemies.xpDrop` und `enemies.elite`.

## Waschbär-Boss (16.11.2026)
- Vorerst der einzige Boss. Kommt nur in der letzten Nachtwelle (Welle 24, 48) zu Beginn der Welle; danach wird es Tag. (Bis 16.11.2026: alle 5 Wellen.)
- Ursprünglich: alle 5 Wellen zu Beginn der Welle (zusätzlich zu den normalen Gruppen). 2,4× so groß, violetter Leuchtrand, eigene Lebensleiste oben in der Mitte.
- Leben ≈ 20 normale Waschbären × Wellen-Skalierung (`enemies.scaling`, und Koop-Faktor); seit 16.11.2026 kein extra +6 % je Welle mehr.
- Ablauf in Schleife: 5 s herumliegende Blaubeeren einsammeln (er klaut damit XP) → 2 s aufladen (zittert, leuchtet violett) → Spezialattacke. Jede gesammelte Blaubeere = +3 % mehr Bomben.
- Attacke 1 „Spur“: ein Spur-Kopf verfolgt den nächsten Spieler, schnell wenn der weit weg ist, aber träge bei Richtungswechseln; hinter ihm landen Blaubeer-Bomben (14 Grundzahl).
- Attacke 2 „Karussell“: er dreht sich und spuckt 6 s lang jede Sekunde 3 Spuren in zufällige Richtungen.
- Attacke 3 „Regen“: 30 große Blaubeeren im 0,1-s-Takt, die Hälfte nahe beim Spieler; 0,5 s Zeit zum Ausweichen.
- Bomben landen, leuchten als violett-blauer Kreis und explodieren (8 Schaden an Spielern, halb an Feldern). Besiegt lässt er 30 Blaubeeren fallen. Alle Werte unter `enemies.boss`.
- Annahme: „Erstmal nur diesen“ = nur der Waschbär-Boss; die anderen Bosse kommen später.

## Waffen-Limit (16.11.2026, ersetzt Waffenslots/Tausch)
- Neben der Harke höchstens 3 Waffen (`weaponSlots.max`), also 4 inklusive Harke. Es gibt keinen Tausch und keine inaktiven Waffen.
- Sobald 3 Waffen gewählt sind, bietet das Level-up keine weiteren Waffen mehr an, keine Felder dieser Waffen und auch keine Upgrades dazu (Doppelernte). Blaubeerfelder bleiben immer möglich.

## Pause-Übergänge (16.11.2026)
- Jede Pause (Level-up, Pausemenü, Testmenü) und jedes Weiterspielen läuft weich: 0,5 s wird das Spiel langsamer bis zum Stillstand bzw. wieder schneller (`transitions.slow`), die Oberfläche blendet in 0,25 s ein/aus (`transitions.uiFade`).
- Dazu dezente Sounds: absteigendes Rauschen beim Pausieren, aufsteigendes beim Weiterspielen (`ui.pauseIn` / `ui.pauseOut` in sounds.yaml).

## Chilifeld und Flammenwerfer (16.11.2026)
- Chilifeld ab Level 10 als neuer Feldtyp, parallel zum Zitronenbäumchen (beide kommen bei den Neue-Feldtypen-Karten in den Topf). 1 Chili alle 0,5 s. Buschige Pflanze mit vielen roten, leicht leuchtenden Chilis; das Beet hat Lava-Risse, die bei jeder Ernte aufglühen und langsam wieder absinken (Atmen), dabei steigen ein paar Funken auf.
- Flammenwerfer (Munition Chilis): chili-förmige Düse an der Hand, 30°-Flammenkegel, 3,5 m, schwenkt 40° um die Zielrichtung (links → rechts → zurück in 1,5 s). 8 Chilis pro Sekunde (8 Flammenstöße à 1 Chili). Wird wie der Citrateaser beim nächsten Level-up nach dem Bauen garantiert angeboten.
- Annahme Brand: Jeder Flammenstoß, der einen Gegner erwischt, gibt 1 Stapel (max. 6). Pro Tick (0,5 s) Schaden = Stapel × 1 % der max. HP (Elite 0,6 %, Boss 0,2 %), danach 1 Stapel weniger. Brennende Gegner glühen orange und qualmen Funken. Brand-Schaden wird als eine orange Zahl pro Sekunde zusammengefasst, damit es nicht flimmert. Brand trifft auch springende Kröten, die Flamme selbst nicht.
- Annahme Reichweite 3,5 m (war offen). Die Schaden-Karte erhöht die Brand-Prozente um 20 % je Stufe.
- Zirkel-Upgrade: +30° Schwenk, +5° Flamme, Dauer pro Schwenk bleibt 1,5 s. Ab 360° (11. Stufe) dreht die Flamme im Kreis mit +50 % Tempo (2 Umdrehungen/s), danach +10° Flamme und +10 % Tempo pro Stufe, Schluss bei 360° Flamme. Die Karte zeigt Grad bzw. Umdrehungen pro Sekunde (U/s).
- Brand-Tick-Upgrade: Tick × 0,8 bis minimal 0,1 s (8 Stufen). Da jeder Tick einen Stapel verbraucht, brennt der Stapel schneller ab: mehr Schaden pro Sekunde, gleicher Gesamtschaden je Stapel.
- Alle Werte unter `skills.chili`, `upgrades.chiliSweep`, `upgrades.chiliTick`, Feld unter `plants.chili`.

## Gegnertypen überarbeitet (16.11.2026)
- **Betäubt (Stun), neue Definition für Spieler und Gegner:** Tempo für Bewegung und Angriffe startet bei 0 und steigt über die Stun-Dauer linear wieder auf normal. Beim Spieler laufen auch alle Abklingzeiten im Stun-Tempo, und jede Waffe muss erst einmal abklingen, bevor sie wieder feuert. Kein Rückstoß mehr durch Gegner.
- **Waschbär:** greift nie an (weder Spieler noch Felder), streunt zwischen den Feldern umher, sammelt 5 XP-Blaubeeren und haut damit ab. Fällt sein Leben unter 50 %, haut er sofort ab, mit allem, was er schon trägt (`fleeBelow`). Der Boss-Waschbär ist davon ausgenommen.
- **Roter Panda:** greift Spieler in Aggro-Reichweite an, sammelt bevorzugt Preiselbeeren und Chilis, sonst jede andere Frucht (auch XP), bei 5 haut er ab. Ohne Früchte greift er Felder an.
- **Frosch:** leuchtet und schimmert, solange er sitzt, das Leuchten geht beim Absprung aus. Die Zunge (dicker, mit Spitze, Treffer-Spritzer) schlägt sichtbar zu, bevorzugt auf Kohl- und Zitronenfelder, in Aggro-Reichweite auf Spieler.
- **Schaf:** Anlauf-Richtung wird beim Start des Anlaufs einmal festgelegt und nicht mehr nachgeführt, Anlauf 1 s statt 2 s. Trifft es den Spieler: comicartige Staubwolke um ihn, 1 s Stun, kein Rückstoß.
- **Igel (neu):** kommen statt der Schafe ab Welle 11, immer als Gruppe aus 3–4 Tieren aus einer Richtung. Stachelig, langsamer (1,8 m/s). Alle 2 s plustern sie sich ruckartig um 30 % auf (Stacheln funkeln einmal, Ring zeigt die Reichweite) und ziehen sich in 1,8 s wieder zusammen. Nur beim Aufplustern machen sie Schaden: Spieler in Stachel-Reichweite und das Feld, auf dem sie stehen. Sie fressen bevorzugt alle Beeren (Blaubeeren und Preiselbeeren), gefressene Beeren sind weg.
- **Resistenzen:** 30 % weniger Schaden (`enemies.resistance`): Panda durch Chilis und Preiselbeeren (auch Blutung), Schaf durch Spargel, Frosch durch Kohl (Bombe und Lache) und Zitronen, Igel durch Blaubeeren und Preiselbeeren. Waschbär ohne Resistenz. Annahme: „Blaubeeren“ zählt erst, sobald es eine Blaubeer-Waffe gibt; die Harke zählt zu keiner Frucht.
- Annahmen: „10 Level später“ = 10 Wellen später (Schaf ab Welle 21). Igel-Schaden 2 je Aufplustern, Igel-Leben 6.

## Spargel-Armbrust und Beerenshotgun (16.11.2026)
- **Spargel-Armbrust** statt Spargelgewehr: Der Spieler hält beim Schießen eine Armbrust (Holzschaft, Bogen aus zwei Spargelstangen, Sehne, aufgelegter Spargel-Bolzen), die Spargel als Bolzen verschießt. Neuer Sehnen-Sound.
- Sie feuert nicht mehr gleichmäßig, sondern in **Salven aus 3 Bolzen** (0,1 s Abstand), dann Pause. Salve alle 0,75 s, also Ø 4 Bolzen/s wie vorher: gleicher Durchschnitts-DPS. Jeder Bolzen kostet 1 Spargel und zielt neu. Eine angefangene Salve läuft zu Ende, solange Spargel da ist. Das Abklingzeit-Upgrade verkürzt Salve und Pause gleichermaßen. „Bereit“ zählt mit 3 Spargel pro Salve. Werte `skills.asp.cooldown/burstShots/burstGap`.
- **Beerenshotgun:** Streuung zufällig statt gleichmäßigem Fächer, normalverteilt um die Zielrichtung (σ 20°), hart begrenzt auf 80° (±40°). Dadurch landen grob 2/3 (gemessen etwa 70 %) der Beeren in den inneren 40°. Feuerrate −20 % (0,5 → 0,625 s). Das +1-Projektil-Upgrade macht den Kegel nicht mehr breiter. Werte `skills.cran.pellets/cone/spreadSigma`.
- **Liegende Beeren:** Jede Beere, die nichts trifft, bleibt 2 s liegen (schwillt an, pulsiert schneller) und platzt dann zu einem roten Fleck: 50 % des Beerenschadens an allen Gegnern im Radius 0,6 m (ohne Blutung, keine fliegenden Kröten). Ersetzt die alten Beeren-Minen. Werte `skills.cran.splashDelay/splashDamage/splashRadius`.
- Annahme: Die bisherige Minen-Karte wird zur Karte **Platzschaden** (+10 Prozentpunkte je Stufe, 50 → 100 %, `upgrades.cranSplash`), weil jetzt ohnehin alle verfehlten Beeren liegen bleiben.

## Level-up-Karten (16.11.2026)
- Upgrade-Karten: unter den Werten eine Erklärzeile, meist ein Wort (Reichweite, Kegelbreite, Abklingzeit …). Texte in `names.hints` (Suche: ganzer Karten-Key, dann Teil nach „_“, dann Teil davor).
- Waffen-Freischaltkarten sind größer, in der Waffenfarbe leuchtend umrandet, mit wanderndem Glanz. Alle Werte stehen als Icon-Chips da (Schaden, Reichweite/Radius, Abklingzeit, Munition pro Angriff, ggf. Durchbohren/Kettenradius/Schwenk), der Spezialeffekt knapp darunter (`names.effects`).
- Alle drei Karten kippen wie echte Karten zur Stelle unter Maus bzw. Finger (die gedrückte Seite geht nach hinten) und schimmern dabei (Lichtfleck + Holo-Streifen). Mobile: Finger auf der Karte ziehen. Im Hochformat bleibt senkrechtes Wischen zum Scrollen frei. Bei „Bewegung reduzieren“ aus.
- Das Rückstoß-Upgrade der Harke ist entfernt (16.11.2026), die Harke braucht es nicht. `rake.knockback` bleibt als Grundwert (0).

## Feuer-Mechanik, Flammen-Shader, Fauch-Sounds (16.11.2026)
- Brand nicht mehr an Gegner-HP gekoppelt, sondern an die Waffe (Ersatz für die Prozent-Regel oben): Jeder Flammenstoß, der trifft, macht 1 Sofortschaden und gibt 1 Brand-Stapel (max. 6). Brennen tickt alle 0,5 s mit Stapel × 0,5 Schaden und erlischt 3 s nach dem letzten Treffer (jeder Treffer frischt auf). Wer in der Flamme bleibt, brennt also immer heißer.
- Flächenbrand: Stirbt ein brennender Gegner, springt die Hälfte seiner Stapel (mind. 1) auf alle Gegner im Umkreis von 1,5 m über, mit Feuerring. Gegnerhaufen brennen dadurch in Ketten ab.
- Schaden-Karte: +20 % auf Sofort- und Brandschaden. Brand-Tick-Karte bleibt (× 0,8 bis 0,1 s).
- Werte: `skills.chili.damage`, `burnDamage`, `burnStacks`, `burnDuration`, `burnTick`, `spreadRadius`, `spreadShare`.
- Flamme als Shader: Rausch-Turbulenz, die nach vorn züngelt, Farbverlauf von Blau-Weiß an der Düse über Gelb und Orange zu Dunkelrot, Zungen reißen zur Spitze hin ab. Drei Schichten übereinander für Tiefe, dazu ein flackerndes orangefarbenes Licht auf Boden und Gegnern und aufsteigende Funken. Beim Zünden schießt die Flamme heraus, beim Loslassen zieht sie sich zurück.
- Sounds aus Freesound (zugeschnitten): Zünd-Stoß beim Losfeuern (4 Varianten), durchgehendes Fauchen als Schleife, Ausklingen beim Loslassen (2 Varianten). Quellen in `CREDITS.md`, Lautstärken in sounds.yaml unter `weapons.chiliStart`, `chiliLoop`, `chiliEnd`.

## Bau-Ansicht und abgestorbene Felder (16.11.2026)
- **Bau-Ansicht (Draufsicht):** Auf jedem bepflanzten Feld steht mittig ein großes Frucht-Icon (dunkle Plakette, goldener Rand), damit sofort erkennbar ist, was dort wächst. Die Seltenheits-Punkte rutschen unter das Icon. Beim Zeigen auf ein fremdes Feld wird das Icon größer und rötlich pulsierend.
- **Überbauen** eines Feldes mit anderer Frucht braucht eine Bestätigung: Dialog unten mittig, altes Feld (rot durchgestrichen) → neues Feld, darunter ✗ und ✓. Ohne Text. PC: Maus, Enter = ✓, Esc = ✗. Gleiche Frucht (Seltenheit steigern) und freie Plätze bauen ohne Nachfrage.
- **Abgestorbenes Feld:** Es fällt sofort ein XP-Geschenk von 1/3 der XP, die insgesamt zum nächsten Level nötig sind, als Blaubeeren auf das Beet (größte Stufen zuerst, verschmelzen nicht). Die tote Pflanze sinkt nach 1,2 s in den Boden und verschwindet, der Platz ist danach frei (kein Überbauen nötig). Werte `fields.deathXpShare/deathRemoveDelay`.
- Annahme: Der Fruchttyp eines verschwundenen Feldes gilt für Kartenangebote weiter als „vorhanden“ (wie vorher mit dem toten Feld), z. B. für Waffen-Freischaltung und Doppelernte. Stirbt das letzte Feld, ist das Spiel vorbei (kein Geschenk).

## Flammenwerfer: Sprite-Feuer und glühender Boden (16.11.2026)
- Die Flamme besteht jetzt aus Sprite-Partikeln aus Kenneys Particle Pack (CC0): Flammenzungen wachsen, drehen sich und zerfallen; Farbe über die Lebenszeit von Weißgelb über Orange zu einem Magenta-Roten Rand; dunkler Rauch steigt am Ende der Flamme auf. Darunter bleibt eine schwache Shader-Flamme als Grundglühen. Brennende Gegner tragen kleine Flammen.
- Boden: Wo die Flamme hinfasst, glüht der Boden mit Lava-Rissen auf (Weißgelb), kühlt über Orange und Rot in ein paar Sekunden ab (`uCool` 1,8 s Halbwertszeit) und hinterlässt einen dunklen Brandfleck, der nach etwa 12 s verschwindet. Die Risse liegen im Weltmaßstab, überlappende Flecken bilden ein durchgehendes Rissmuster.


## Tag-Nacht-Zyklus (16.11.2026)
- Jede Welle (Kampf + Pause danach) ist eine Stunde. 16 Tag-Wellen, dann 8 Nacht-Wellen (16 h / 8 h), danach wieder Tag. Werte unter `dayNight`.
- Die Sonne wandert über die Tag-Wellen von Ost nach West (tief → hoch → tief, Schatten drehen mit), nachts der Mond auf derselben Bahn. Übergänge: Abenddämmerung am Ende von Welle 16, Morgendämmerung während der letzten Nachtwelle (Boss) und der Pause danach. Die Zeit läuft weich nach, springt nie.
- Nachtwellen sind größer und stärker: 1,4× Gegner pro Gruppe, 1,3× Leben, 1,25× Angriff (`dayNight.night`).
- Das ganze Spiel ist heller. Tag: warmes Sonnenlicht, hellerer Boden, Bäume grün im Dunst, schwache Vignette, sanfter Bloom. Nacht: düsterer als der Tag (kühler, leicht entsättigt, stärkere Vignette, Gartenlicht, Laterne und Fackeln), aber heller als die alte Dauernacht.
- Nebel (seit 16.11.2026 abends): kein gleichmäßiger Nebel mehr, nur leichter Distanz-Nebel, der hinter dem Spieler beginnt und sich am Kameraabstand orientiert (Rauszoomen trübt nicht ein). Dazu fein animierte, flache Nebelschwaden, die zwischen den Bäumen entstehen, langsam Richtung Garten kriechen und sich vor den Beeten auflösen. Nachts dichter und bläulich, bei Sonnenaufgang Morgennebel, tagsüber kaum. Glühwürmchen nur nachts, tagsüber treibende Pollen. Augen in den Büschen hauptsächlich nachts (Warn-Augen vor einer Gruppe immer).
- Geräusche: tagsüber Vogelgezwitscher und ab und zu Krähen, nachts Grillen, Fackelknistern und Eule; überblendet mit der Tageszeit (`sounds.yaml`: `ambient`, `calls`).
- Testen: `?h=20` an die URL hängen zeigt fest diese Stunde (0–24).

## Gegner-Skalierung über die Wellen (16.11.2026)
- Leben und Angriff aller Gegner (auch Elite, Boss und Boss-Bomben) wachsen über die Wellen mit derselben Kurvenform wie der XP-Bedarf: Faktor = growth^(w−1) + linear·(w−1), Welle 1 = 1.
- Leben: Welle 10 ≈ 1,6×, Welle 24 ≈ 2,7×, Welle 48 ≈ 5,4×. Angriff: Welle 10 ≈ 1,3×, Welle 24 ≈ 1,9×, Welle 48 ≈ 3,3×. Nachts kommt der Nachtfaktor obendrauf. Werte unter `enemies.scaling`.

## Feld-Stufen im Baumodus (16.11.2026)
- Über jedem Feld eine Reihe aus 5 Rauten = Seltenheitsstufen; erreichte Stufen leuchten in ihrer Farbe (grau, grün, blau, lila, orange). Der Rand des Frucht-Icons hat die Farbe der aktuellen Stufe.
- Unter dem Icon die Produktion als Chip: Frucht-Icon + Früchte pro Sekunde (Durchschnitt inkl. Seltenheit, Nachbarbonus, Doppelernte, Koop-Blaubeeren; ohne Beackern).
- Nur auf Feldern der Frucht, die gerade gebaut wird: Stufen-Leiste zur nächsten Seltenheit, ein Segment pro nötigem Feld, gefüllte Segmente in der Farbe der nächsten Stufe, am Ende eine Raute dieser Farbe. Keine Zahlen. Beim Zeigen blinkt das Segment, das der Bau füllen würde, und, wenn er die Stufe abschließt, auch die nächste Raute.

## Mystische Umgebung mit dem Stylized Nature MegaKit (16.11.2026)

- Alle Umgebungsmodelle stammen jetzt aus Quaternius' Stylized Nature MegaKit (CC0). Die alten Kegel-Bäume, Kugel-Büsche, Felsbrocken, Pilze und Grasbüschel sind ersetzt. Felder, Pflanzen, Tiere, Waffen, Fackeln und Laterne bleiben wie sie sind.
- Aufbau von innen nach außen: Garten (Erde) → Rasenring mit Gras, Klee, Blumen, Kieseln und zwei leuchtenden Hexenringen aus Pilzen → Buschring (hier sitzen die Augen) mit Farnen und Felsen → dichter Wald aus knorrigen Riesenbäumen, toten Bäumen, dunklen Kiefern und ein paar Laubbäumen. Auf den ausgetretenen Pfaden liegen Trittsteine.
- Farben: Laub in Petrol/Blaugrün mit einzelnen violetten Kronen, dunkle Kiefern, graublaue Felsen. Tagsüber leicht türkiser Dunst.
- Nacht: alles ab dem Buschring versinkt im Dunkeln mit kühlem Randlicht (wie vorher die Silhouetten), Pilze und Blumen leuchten, Irrlichter (türkis/violett) schweben zwischen Garten und Wald. Tagsüber leuchten sie nur schwach.
- Im Garten liegt Deko (Kiesel, Gras, einzelne Blüten und Pilze) nur außerhalb der 20 Feldplätze, damit Beete nie Deko durchstoßen.
- Leistung: jedes Modell wird instanziert (eine Zeichnung pro Modell und Material), Dichte je Grafikstufe (hoch 100 %, mittel 70 %, niedrig 45 %). Laubkarten bekommen keine Eigenschatten (sonst flimmern sie).


## Nussbaum und Eichhörnchen (16.11.2026, überarbeitet)
- Begehbarer Bereich vergrößert: Radius 15 → 18 m, man läuft durch den Buschring bis in den Waldrand. Gegner starten dafür bei 18,5 m im Wald.
- Neue Ressource Nuss. Der Nussbaum ist ein neuer Feldtyp (ab Level 5 unter den neuen Feldtypen) und wächst nur auf 6 Lichtungen im Wald direkt hinter dem Buschring, 15,6 m von der Mitte (`forest`); dort stehen keine Bäume, Büsche, Steine oder Farne. Im Baumodus werden für den Nussbaum nur die Waldplätze angezeigt, für alle anderen Felder nur die Gartenplätze.
- Modell: Laubbaum aus dem Stylized Nature MegaKit (CommonTree_1 oder _5, ca. 3,5 m hoch), grün getönt, mit Nüssen in der Krone.
- Nüsse fallen aus der Krone und rollen 1,2–3,5 m vom Stamm weg (nie aus dem begehbaren Bereich). Sie rollen nicht zum Spieler (kein Magnet): man muss hinlaufen und sie aufheben. Harken am Baum schüttelt Nüsse heraus.
- Gegner greifen Nussbäume nicht gezielt an. Nussbäume zählen nicht fürs Spielende und halten die Startfelder nicht unverwundbar.
- Nüsse werden pro Spieler gezählt und oben bei den Ressourcen angezeigt. Wofür sie verwendet werden, ist noch offen (Vorschlag: Munition einer Nuss-Schleuder als neue Waffe).
- Eichhörnchen (ab Welle 3, nur wenn ein Nussbaum steht): startet an einem zufälligen Punkt im 90°-Bereich auf der gegenüberliegenden Seite des Gartens (vom Nussbaum aus) und hüpft im Zickzack zu seinem Baum (jeder Hüpfer schwenkt 40° zur anderen Seite). Kommt ein Spieler näher als 2,5 m, greift es ihn an (normaler Nahkampfschaden). Sonst sammelt es liegende Nüsse (bis 3) und verschwindet damit den Stamm hinauf in der Krone (0,8 s, bis dahin treffbar; die Nüsse sind dann weg). Liegt keine Nuss, flitzt es bis zu 10 s um den Baum und verschwindet dann im Baum. Unter 50 % Leben flüchtet es in den Baum. Ist sein Baum weg, nimmt es den nächsten Nussbaum, sonst flieht es in den Wald.
- Werte: 4 Leben, flink (4,2 m/s, mit Beute 5,5 m/s), Resistenz gegen Kohl und Chili. Laute: hohe, schnelle Waschbär-Laute.

## Feldoptik (16.11.2026, abends)
- Beete gehen weich in die Landschaft über: Umriss nur angedeutet sechseckig (zur Rundung hin, leicht ausgefranst), der Rand blendet in den Boden aus. Keine farbige Randlinie mehr. Seltenheit sieht man im Baumodus (Rauten) und an der Pflanzengröße. Der dezente Ernte-Impuls am Rand bleibt.
- Kein Aufleuchten des Feldes beim Harken. Stattdessen leuchten die Früchte der geharkten Pflanzen auf, je stärker, desto mehr Fläche ihres Dreiecks der Zug überdeckt hat.
- Alle Erd-Decals sind gleich groß (1,8 m) und unverzerrt, die Furchen haben überall den Zinkenabstand der Harke (7,5 cm). Nach außen werden die Decals transparenter.
- Keine Fackeln mehr an den Beeten. Beet-Erde besteht aus mehreren überlagerten Harken-Decals (Furchen in zufälligen Richtungen, ausgefranster, nicht runder Umriss), die grob das Sechseck füllen und organisch darüber hinausgehen. Um jede Pflanze liegt dunkle nasse Erde als eigenes Decal mit unruhigem Übergang zur trockenen Erde. Das Chilibeet bleibt Lavagestein.
- Beeren (Blaubeere, Preiselbeere) sind echte Beeren statt Kugeln: leicht abgeflacht, mit dunkler, eingesunkener Sternkrone, glänzend. Königsblau bzw. himbeerrot, kein milchiges Leuchten. Herumliegende Blaubeeren leuchten nur noch sanft anschwellend, je näher das nächste Level-up ist (max. ca. 1/10 von vorher). Das Leuchten der Beeren am Busch beim Harken ist ebenfalls deutlich schwächer.

## VFX-Labor für Skill-Effekte (16.11.2026)
- Entwickler-Werkzeug unter `vfx.html` (nicht im Spiel verlinkt): Effekte werden dort gestaltet und als JSON exportiert. Erklärtexte sind dort erlaubt, es ist kein Spieler-UI.
- Effekte sind reine Daten aus Ebenen (Partikel, Bodeneffekt, Blitz, Schockwelle, Kristalle, Licht), System in `src/fx/` (siehe `src/fx/README.md`). Später wandern die Spiel-Effekte auf dieses System.
- Startpresets: Feuer (Flammenwerfer), Zitronenblitz, Frostnova, Giftwolke, Kohl-Explosion, Heilung, Betäubung, Blätterwirbel.
- Sprites: Kenney Particle Pack (CC0, schon im Spiel) plus selbst gezeichnete Formen (Leuchten, Funke, Stern, Schneeflocke, Blase, Plus, Blatt, Splitter).

## Spielfigur und Charakter-Editor

- Detaillierte Bäuerin/Bauer statt Low-Poly-Figur, kein Geschlecht wählbar. Immer Latzhose (mit Trägern, Messingknöpfen, Brusttasche), Gummistiefel und kariertes Hemd mit hochgekrempelten Ärmeln.
- Vor „Spielen“ und „Koop“ öffnet sich der Editor: 3D-Vorschau (ziehen = drehen, Doppelklick = Gesicht/ganze Figur), Name (max. 16 Zeichen) mit Würfel, ein Würfel für alles inklusive Name. Nur Icons und Farbfelder, kein Text. Testmodus startet ohne Editor.
- Je 5 Optionen: Gesicht (rund, oval, kantig, lang, Herz), Körper (schlank, normal, kräftig, rundlich, klein & stämmig), Frisur (kurz, Dutt, Zopf, Locken, Haarkranz), Haarfarbe (schwarz, braun, rot, blond, grau), Hautfarbe, Augenfarbe (braun, blau, grün, grau, bernstein), Hemd (5 Karomuster), Hosenfarbe.
- Accessoires frei kombinierbar: dicker Schnauzer, großer Nasenring, Gesichtstattoo (Ranke auf der Wange), Haarreif mit Gänseblümchen. Hüte: genau einer oder keiner (Sonnenhut mit Schleife, Strohhut, Zylinder, Schiebermütze). Haarreif und Hut schließen sich gegenseitig aus (der Reif säße unter dem Hut).
- Mit Hut verschwinden Haarteile, die durch den Hut stechen würden (Locken oben, Strähnen); der Dutt rutscht in den Nacken.
- Aussehen wird im Browser gespeichert (localStorage) und im Koop an alle geschickt; über Mitspielern steht ihr Name in ihrer Spielerfarbe. Der farbige Ring am Boden bleibt die Spielerfarbe.
- Hände greifen per IK, was gerade benutzt wird: Harke beidhändig am Stiel, Zitronenstab links, Armbrust und Chili-Flammenwerfer beidhändig. Beine laufen mit der Laufphase, Arme schwingen beim Gehen.

## Nachbarboni und Bau-Vorschau (16.11.2026)
- Regel (unverändert): Jedes Feld bekommt +10 % Produktion je Seltenheitsstufe jedes angrenzenden lebenden Feldes, egal welche Frucht (`fields.neighborBonus`, additiv). Gewöhnliche Felder (Stufe 0) geben nichts, ein grünes +10 %, ein blaues +20 % usw. Die eigene Seltenheit zählt zusätzlich ×1,5 je Stufe.
- Im Baumodus zeigt jeder Produktions-Chip den aktuellen Nachbarbonus (Doppel-Hex-Icon + %).
- Vorschau beim Zeigen auf ein Feld: Auf freiem Platz erscheint das neue Feld halbtransparent mit seiner Produktion. Alle Felder, deren Produktion sich durch den Bau ändert, zeigen „alt → neu /s“ (grün mehr, rot weniger). Pfeile auf den gemeinsamen Kanten: grün = Nachbar gibt dem neuen Feld Bonus, gold = das Feld gibt dem Nachbarn Bonus, rot = Nachbar verliert Bonus (Überbauen eines höherstufigen Feldes).
- Handy: erstes Tippen zeigt die Vorschau, zweites Tippen auf dasselbe Feld baut (beim Überbauen danach noch die Bestätigung). Maus baut weiter mit einem Klick.
