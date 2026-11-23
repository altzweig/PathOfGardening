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
- Harken-Animation und Trefferfläche sind identisch: ein Rechteck vor dem Spieler (Länge `rake.range`, Breite `rake.width`). Kein Marker: Nur die Kratzspuren der Zinken zeigen, wo geharkt wurde. Der Harkenkopf ist genau so breit wie die Spur, mit einer Zinke pro Kratzer im festen Abstand (7,5 cm). Beim Breite-Upgrade kommen Zinken und Kratzer dazu, nichts wird verzerrt. Die Kratzer sind leicht wellig und an Anfang und Ende ausgefranst. Jeder Zug läuft gleich ab (siehe „Harkenzug: Zug und Stoß“, 17.11.2026).
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

## Kohlbombe als Aufladewurf (17.11.2026, ersetzt die Giftlache)
- Gedrückthalten lädt eine Leiste über dem Spieler auf, beim Loslassen fliegt der Kohl. Wurfweite linear von 1,5 m (nur Antippen) bis 8 m (volle Ladung nach 1 s). Der Zielkreis wandert beim Aufladen mit nach außen. PC: Maustaste halten. Handy: Kohl-Knopf halten und mit dem Daumen zielen, Antippen wirft sofort die kürzeste Weite.
- Explosion sofort beim Aufkommen (kein Zünder mehr). Radius 1,5 → 1,9 m (Fläche ×1,6, gelesen als Fläche, nicht als Radius).
- Keine Lache mehr. Getroffene Gegner sind 2 s **vergiftet**: alle 0,4 s 10 % des Explosionsschadens (5 Ticks = 50 %), 40 % langsamer. Ein neuer Treffer setzt die Dauer zurück, es gilt der stärkere Tick. Vergiftete Gegner schimmern grün mit aufsteigenden Bläschen.
- Abklingzeit startet beim Wurf, Aufladen beginnt erst, wenn sie abgelaufen ist. Waffenwechsel während des Aufladens wirft sofort, beim Tod geht der Wurf verloren.
- Mini-Kohl explodiert ebenfalls beim Aufkommen und vergiftet auch.
- Kombiwaffen mit Kohl als Hauptwaffe (Coleateral Bomb, Cabboomberry, Kimchi) werfen genauso mit Aufladen, `throwDistance` ist jetzt die Weite bei voller Ladung (8 m statt fest 3 / 1,5 / 3 m). Ihre Zünder laufen weiter wie bisher nach dem Aufkommen.
- Cabboomberry: statt Giftlache vergiftet die Explosion (wie Kohl), Radius 1,9 m. Mini-Kohl aus dem Rocabblauncher vergiften auch. Kimchis brennende Lache bleibt (Chili, kein Gift). Coleateral Bomb vergiftet nicht (hatte auch keine Lache).
- Werte: `skills.cab.chargeTime`, `throwMin`, `throwMax`, `poisonDuration`, `poisonTick`, `poisonTickDamage`, `poisonSlow`.

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
- Droprate 17.11.2026: Ertrag aller Felder außer Blaubeeren −60 % (Erntezeiten ×2,5, Menge pro Ernte bleibt). Weil Harken die Erntezeit vorschiebt, sinkt auch der Harken-Ertrag dieser Felder um 60 %.
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
- Das Spiel startet mit einem Blaubeerfeld in der Gartenmitte (17.11.2026, vorher drei). Startfelder nehmen keinen Schaden, solange noch irgendein anderes Gartenfeld HP hat. Erst wenn alle anderen auf 0 HP sind, werden sie verwundbar (Stand 17.11.2026, siehe „Felder gehen nicht kaputt“).
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
- Das Rückstoß-Upgrade der Harke ist entfernt (16.11.2026), die Harke braucht es nicht. `rake.knockback` ist ein fester Grundwert (seit 17.11.2026 0,3 m).

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
- ~~**Abgestorbenes Feld:** Es fällt sofort ein XP-Geschenk von 1/3 der XP, die insgesamt zum nächsten Level nötig sind, als Blaubeeren auf das Beet (größte Stufen zuerst, verschmelzen nicht). Die tote Pflanze sinkt nach 1,2 s in den Boden und verschwindet, der Platz ist danach frei (kein Überbauen nötig). Werte `fields.deathXpShare/deathRemoveDelay`.~~ Ersetzt am 17.11.2026, siehe „Felder gehen nicht kaputt“.
- ~~Annahme: Der Fruchttyp eines verschwundenen Feldes gilt für Kartenangebote weiter als „vorhanden“ (wie vorher mit dem toten Feld), z. B. für Waffen-Freischaltung und Doppelernte. Stirbt das letzte Feld, ist das Spiel vorbei (kein Geschenk).~~

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

## Spielfigur und Startmenü (überarbeitet 17.11.2026)

- Detaillierte Bäuerin/Bauer, kein Geschlecht wählbar. Immer Latzhose (Träger, Messingknöpfe, Brusttasche), Gummistiefel, Karohemd mit hochgekrempelten Ärmeln. Gesicht und Körperform fest, Augen immer braun. Keine Accessoires, keine Hüte.
- Auswahl direkt im Startmenü, kein eigener Editor-Bildschirm: links kleine Figur auf einem Moos-Podest (ziehen = drehen), darüber der frei wählbare Name, darunter vier kompakte Reihen:
  - Frisur: Pippi-Langstrumpf-Zöpfe, Bubikopf, Tonsur, Afro
  - Haarfarbe: rot, schwarz, hellblond
  - Hautfarbe: dunkelbraun, leicht braun, fast weiß
  - Outfit: blaue Latzhose + pinkes Hemd, schwarze Latzhose + weiß-rotes Hemd, grüne Latzhose + hellgrün-gelbes Hemd
- Würfel rollt Name und Aussehen. Alles wird sofort im Browser gespeichert und im Koop an alle geschickt (Name über den Mitspielern).
- Menü rechts: Logo mit Goldverlauf und Glanz, Einträge Spielen (groß), Koop, Waffentest, Testmodus, Optionen als Serifen-Wörter ohne Kästen; Hover/Fokus mit Goldlinie und Blatt-Marker, Pfeiltasten + Enter. Hintergrund: der Garten mit langsam kreisender, flacher Kamera, aufsteigende Pollen, gestaffeltes Einblenden. Unterseiten im selben Stil (Überschriften mit Goldlinien, Glas-Knöpfe).
- Handy quer wie PC, nur kompakter; Handy hoch: Logo oben, Figur in der Mitte, Menü unten.
- Umsetzungs-Prompt: Projektordner `startmenue/prompt.md`.

## Nachbarboni und Bau-Vorschau (16.11.2026)
- Regel (unverändert): Jedes Feld bekommt +10 % Produktion je Seltenheitsstufe jedes angrenzenden lebenden Feldes, egal welche Frucht (`fields.neighborBonus`, additiv). Gewöhnliche Felder (Stufe 0) geben nichts, ein grünes +10 %, ein blaues +20 % usw. Die eigene Seltenheit zählt zusätzlich ×1,5 je Stufe.
- Im Baumodus zeigt jeder Produktions-Chip den aktuellen Nachbarbonus (Doppel-Hex-Icon + %).
- Vorschau beim Zeigen auf ein Feld: Auf freiem Platz erscheint das neue Feld halbtransparent mit seiner Produktion. Alle Felder, deren Produktion sich durch den Bau ändert, zeigen „alt → neu /s“ (grün mehr, rot weniger). Pfeile auf den gemeinsamen Kanten: grün = Nachbar gibt dem neuen Feld Bonus, gold = das Feld gibt dem Nachbarn Bonus, rot = Nachbar verliert Bonus (Überbauen eines höherstufigen Feldes).
- Handy: erstes Tippen zeigt die Vorschau, zweites Tippen auf dasselbe Feld baut (beim Überbauen danach noch die Bestätigung). Maus baut weiter mit einem Klick.
- 17.11.2026: Die weißen Marker, die am Feldrand wanderten (Ernte-Impuls), sind entfernt. Herumliegende Blaubeeren leuchten wieder dezent von Anfang an (am Tag besser zu sehen) und schwellen zum Level-up hin etwas an.

## Gegner und Boss schwerer (17.11.2026)
- Leben: Waschbär ×1,8 (7 → 12,6), alle anderen Tiere +20 % (Panda 13,2, Kröte 7,2, Igel 7,2, Schaf 3,6 + Schild 7,2, Eichhörnchen 4,8).
- Schaden aller Tiere ×2: Nahkampf 1 → 2, Kröten-Gift 1 → 2, Igel-Stacheln 2 → 4, Schaf-Rammen 4 → 8, Boss-Nahkampf 3 → 6, Boss-Bomben 8 → 16.
- Gegneranzahl +30 % in allen Wellen (`waves.countMultiplier`, wirkt nach `sizeMax`, auch auf Welle 1); Obergrenze gleichzeitig 60 → 78.
- Boss kommt nicht mehr nach Wellen, sondern nach Spieler-Level (`enemies.boss.levels`): zu Beginn der ersten Welle, nachdem Level 20 erreicht ist, dann ab Level 30, 40, 50 usw. Immer nur ein Boss gleichzeitig. Annahme: „Level“ = Spieler-Level (oben links), nicht die Welle. Das Spielende bleibt vorerst bei Welle 48.
- Boss hält 3× so viel aus wie vorher (≈ 33,3 Waschbären à 12,6 statt 20 à 7). Sein Leben ist in 3 Stufen geteilt (zwei Striche im Boss-Balken). Nach jeder verlorenen Stufe lacht er und greift 20 % schneller an (×1,2, dann ×1,44): Sammeln, Aufladen, Bomben-Takt und Nahkampf laufen schneller; die Ausweichzeit der Bomben bleibt gleich.
- Nussbaum vorerst ausgebaut (`plants.nut.disabled: true`): wird im Level-up nicht mehr angeboten, keine Waldlichtungen; damit kommen auch keine Eichhörnchen. Code bleibt, kommt mit einer Nuss-Waffe wieder.
- Preiselbeer-Schrotflinte streut weniger: Kegel 80° → 45°, Standardabweichung 20° → 11°.

## Harkenzug: Zug und Stoß (17.11.2026)
- Jeder Harkenzug ist gleich, nicht mehr abwechselnd links/rechts (`rake.tilt` entfällt). Zuerst wird die Harke in einer flüssigen Bewegung mit Schwung von vorne nach links hinten gezogen (`rake.pullTime`), dann zügig nach vorne geschoben (`rake.pushTime`).
- Schaden gibt es beim Aufprall am Ende des Stoßes. Getroffen wird ~~das Rechteck vor dem Spieler~~ seit dem Abend der Trefferkreis (siehe „Harke: Trefferkreis“), im selben Moment werden die Felder darin beackert und die Kratzspuren erscheinen.
- Getroffene Gegner werden 0,5 s gestunnt (`rake.stun`, Stun-Definition wie überall) und 0,3 m vom Spieler weggestoßen (`rake.knockback`). Bosse bekommen nur Schaden, sonst wären sie bei jedem Zug dauerhaft festgesetzt.
- Richtungswechsel greifen sofort, auch mitten im Zug: Figur und Harke drehen sich mit, der Aufprall geht in die Richtung, in die der Spieler in diesem Moment schaut. Richtung: Zielen (Maus bzw. Zielstick) > nächster Gegner in Reichweite > Laufrichtung > letzte Richtung.
- Mit dem Tempo-Upgrade wird der Zug entsprechend schneller, damit er immer vor dem nächsten fertig ist (höchstens 90 % der Abklingzeit).


## Harke: Trefferkreis (17.11.2026, abends, ersetzt Rechteck und Breite)
- Die Harke ist nur Animation. Schaden kommt aus einem Hit-Collider: Immer wenn die Harke voll ausgefahren ist (Ende des Stoßes), gibt es einen Sphere-Overlap. Alle Gegner, deren Kreis ihn berührt, bekommen Schaden, Stun und Rückstoß.
- Der Kreis liegt zwischen dem Punkt, an dem der Zug vorne endet, und der maximalen Ausdehnung. Sein Durchmesser ist diese Distanz: `rake.diameter` 0,7 m, vordere Kante bei `rake.range` 1,2 m, Mitte also 0,85 m vor dem Spieler. Die Animation zieht immer genau bis zur hinteren Kante des Kreises zurück (mindestens 25 cm vor dem Spieler).
- Die Breite entfällt. Das Upgrade heißt jetzt Durchmesser (`upgrades.rakeDiameter`, +20 cm); der Harkenkopf bekommt entsprechend mehr Zinken. Wird der Kreis größer als die Reichweite, reicht er auch hinter den Spieler.
- Beackern nutzt denselben Kreis: Jedes Feld bekommt Ertrag anteilig zur überdeckten Fläche, Bezug ist die Fläche des Grund-Kreises (Grund-Ertrag pro Zug bleibt damit gleich). Die Kratzspuren füllen den Kreis.
- Alle Harken-Upgrades (Durchmesser, Reichweite, Schaden, Tempo) haben keine Obergrenze mehr.
- Hinweis Balancing: Der Grund-Kreis (0,38 m²) ist kleiner als das alte Rechteck (1,08 m²), die Harke trifft also anfangs weniger Gegner auf einmal.

## Spargel-Spezial-Upgrades (17.11.2026, abends)
- Durchbohren: +1, +1, +1 Ziel, als letzte Stufe „alle Ziele“ (Karte: „4 → alle“). Bei der Coleateral Bomb wirkt „alle“ auch auf die Stacheln.
- Piercing Damage: +10 Prozentpunkte (50 → 100 %). Die Karte zeigt „Piercing Damage“, den bisherigen Wert und dahinter golden „+10 %“.
- Geschossgröße: +100 % additiv je Stufe bis 500 % (4 Stufen). Die Karte zeigt den bisherigen Wert und dahinter golden „+100 %“. Kombiwaffen, die die Geschossgröße behalten, wachsen genauso mit.
- Salve (neu, 5 Stufen): statt 3 Bolzen 4 / 5 / 7 / 9 / 12, als Kette hintereinander in derselben Zeit wie die 3er-Salve (Abstand wird kürzer). Jeder Bolzen kostet weiterhin 1 Spargel (12er-Salve = 12 Spargel). Zählt bei Kombiwaffen wie andere nicht übernommene Spezial-Upgrades als Schadensbonus.
- Goldene Hervorhebung auf Karten: Text in `[[...]]` wird golden dargestellt.

## Beeren-Schrotflinte: Spezial-Upgrades (17.11.2026, abends)
- Mehr Beeren pro Schuss: 6 → 8/10/12/14/16 (`upgrades.cranPellets`, +2, 5 Stufen). Munition pro Schuss bleibt 6.
- Durchbohren (neu): Chance pro Beere, einmal durch einen Gegner durchzufliegen, 0 → 20/40/60/80/100 % (`upgrades.cranPierce`). Gewürfelt wird beim Abschuss je Beere; die durchbohrende Beere macht beim zweiten Gegner vollen Schaden und Blutung.
- Platzschaden liegender Beeren startet bei 25 % statt 50 % und steigt auf 40/55/70/85/100 % (`skills.cran.splashDamage`, `upgrades.cranSplash` +15 Prozentpunkte). Die Hotgun nutzt denselben Grundwert.
- Alle drei Karten zeigen den bisherigen Wert und dahinter golden das Plus, wie beim Spargel.
- Kombiwaffen: Wo „mehr Beeren“ übernommen wird, zählt jede Stufe wie bisher (Hotgun bekommt dadurch +2 statt +1 Beere vor dem Faktor). Durchbohren wird in Kombiwaffen nicht übernommen und zählt als Schadensbonus.

## Kohl: Kohlgas (17.11.2026, abends)
- Mini-Kohl bleibt wie er ist.
- Neues Spezial-Upgrade „Kohlgas“ (5 Stufen, `upgrades.cabGas`): Jeder Kohl-Treffer (auch Mini-Kohl) legt zusätzlich zum Gift den Debuff „Kohlgas“, er hält so lange wie das Gift (`skills.cab.poisonDuration`, ein neuer Treffer frischt ihn auf).
- Stirbt ein Gegner mit Kohlgas, platzt er mit 10/20/30/40/50 % Chance. Alle Gegner im Umkreis von 1 m (`skills.cab.gasRadius`) bekommen den normalen Gift-Debuff des Kohls (Tick-Schaden aus dem Explosionsschaden des Kohls, der das Gas gelegt hat). Kein Kettenausbruch: Die Nachbarn bekommen Gift, aber kein Gas. Auch ein Tod direkt durch die Explosion zählt.
- Karte: „Kohlgas“, bisherige Chance und dahinter golden „+10 %“. In Kombiwaffen wird Kohlgas nicht übernommen und zählt als Schadensbonus.
- Neues Spezial-Upgrade „Poison Damage“ (5 Stufen, `upgrades.cabPoison`): Gift-Tickschaden des Kohls +50 % je Stufe, additiv (100 → 150 … 350 %). Gilt für Kohl, Mini-Kohl und das Gift, das Kohlgas verteilt. Karte: „Poison Damage“, bisheriger Wert, golden „+50 %“. In Kombiwaffen nicht übernommen (zählt als Schadensbonus).

## Citrateaser als Kugelblitz (17.11.2026, abends, ersetzt den Sofort-Kettenblitz)
- Die Zitrone ist ein Zauberstab. Sie schießt einen leuchtenden Kugelblitz geradeaus (Zielrichtung), langsam (`skills.lemon.speed` 3,5 m/s), sichtbar ca. 18 cm groß (`ballRadius` 0,09 m), Flugweite `range` 6 m. Kein Zielsuchen mehr.
- Im Flug trifft der Kugelblitz alle 0,25 s (`tickInterval`) den nächsten Gegner in 0,5 m Umkreis (`tickRadius`) mit 25 % Schaden (`tickDamage`), sichtbar als kurzer Blitz von der Kugel zum Gegner.
- Trifft die Kugel einen Gegner direkt, bekommt er 100 % Schaden und die Kugel vergeht. Danach springt der Blitz auf x weitere Gegner (Upgrade „Kettenziele“ 1/2/3/4/5, je `chainDamage`), immer zum nächsten noch nicht getroffenen Gegner in 2,5 m (`chainRadius`) um den zuletzt getroffenen.
- Upgrade „Rückblitz“ (20/40/60/80/100 %): Für jedes Kettenziel wird einzeln gewürfelt, ob der Blitz zusätzlich zurück aufs Hauptziel springt (Ketten-Schaden). Ausgelevelt bekommt das Hauptziel also 100 % + 5 × Ketten-Schaden.
- Das direkt getroffene Tier lässt seine Beute fallen (wie bisher das erste Ziel).
- Alte Werte `transfer`, `branch` und `upgrades.lemonTargets.order` entfallen.
- Nachtrag (17.11.2026): Ketten- und Rückblitz-Schaden starten bei 50 % (`chainDamage`) statt 60 %. Neues Spezial-Upgrade „Schadenseffizienz“ (`upgrades.lemonEfficiency`): +10 Prozentpunkte je Stufe bis 100 %. Karte: „Schadenseffizienz“, alter Wert, golden „+10 %“.
- Standard-Upgrades der Zitrone: Schaden, Radius, Abklingzeit. Das Reichweite-Upgrade vergrößert beim Citrateaser die Kugel und ihren Tick-Radius (+20 % je Stufe, Karte zeigt den Kugeldurchmesser in cm); die Flugweite bleibt 6 m.
- Kombiwaffen mit Zitrone (Sourbow, Shockgun, Chillightning) bleiben in ihrer Wirkung gleich; sie lesen weiterhin die Stufen der beiden Zitronen-Upgrades (+1 Pfeil / +1 Blitz je Beere / größerer Stromradius bzw. mehr Strom). Nur die Obergrenzen der übernommenen Stufen sind jetzt 5 statt 3+2 bzw. 4.

## Kombiwaffen (17.11.2026)
- Quelle: Bastis Tabelle „PathOfGardening – Waffenkombinationen“ (Claude Doc). Umsetzungs-Prompt: `Kombiwaffen-Prompt.md`. Zahlen in `balancing.yaml` unter `combos`.
- Zehn Kombiwaffen aus je zwei Fruchtwaffen, die Harke ist nicht kombinierbar.
- **Freischaltung:** Haben beide Waffen eines Paares je 5 Upgrades (alle Arten zählen), bietet das nächste Level-up die Kombiwaffe als große Waffenkarte an (vor allen anderen Waffenkarten). Können mehrere Kombis entstehen, kommen mehrere Karten.
- **Verschmelzen:** Die Kombiwaffe sitzt auf dem Platz der Hauptwaffe (gleicher Knopf, gleiche Taste), der Platz der Nebenwaffe wird frei, dort kann später eine neue Waffe gelernt werden. Die Nebenwaffe wird nicht mehr angeboten, ihre Felder schon.
- **Munition:** Frucht der Hauptwaffe. Früchte der Nebenwaffe zählen beim Einsammeln × `subAmmo`, übrige Munition der Nebenwaffe wird beim Verschmelzen genauso umgerechnet.
- **Upgrades:** Schaden, Reichweite und Abklingzeit beider Waffen zählen zusammen. Spezial-Upgrades wirken weiter, wenn sie zur Kombiwaffe passen (`keep`), sonst wird jede Stufe zu +10 % Schaden. Danach bietet das Level-up für die Kombiwaffe Schaden, Reichweite, Abklingzeit und die passenden Spezial-Upgrades an.
- **„Unter Strom“** (Sourbow, Chillightning): Gegner knistert 2 s, alle 0,5 s Schaden an sich und an Nachbarn in 0,5 m, mit kleinen Blitzbögen.
- Annahmen, wo die Tabelle offen war: Kimchi hat Kohl als Hauptwaffe, Chillightning Chili. Die Coleateral Bomb hinterlässt keine Giftlache (nicht erwähnt), die Cabboomberry schon (seit 17.11.2026 abends Gift-Debuff statt Lache, siehe „Kohlbombe als Aufladewurf“). Die Rakete explodiert beim ersten Gegner oder am Ende ihrer 20 m, am Rand der Explosion 50 % Schaden. Shockgun-Blitze verbinden auch Beeren aus verschiedenen Schüssen.
- Test-Menü: Gruppe „Kombiwaffen“ schaltet jede Kombi direkt frei (inkl. 60 Munition).

## Waffentest-Modus (17.11.2026)
- Eigener Menüpunkt „Waffentest“ (der bisherige Testmodus mit Cheat-Menü bleibt).
- Karger Raum ohne Landschaft: nur Erdboden, kein Wald, keine Deko, keine Laterne, kein Nebel. Keine Felder, keine Wellen, keine Level-ups, keine Blaubeeren.
- Spieler startet links (Kamera schaut rechts an ihm vorbei), Gegner kommen am rechten Raumrand und greifen ihn sofort an. Spieler kann nicht sterben, Treffer werden aber angezeigt.
- Waffenleiste oben: alle Waffen (Harke, 5 Fruchtwaffen, 10 Kombiwaffen), Munition unendlich. Wechsel per Klick/Tippen oder Mausrad.
- Gegner pro Minute mit Plus/Minus (Tasten + und − oder Knöpfe), Stufen 0 bis 240.
- Escape (Handy: Pause-Knopf) öffnet die Einstellungen als Seitenleiste (Handy: unten). Dahinter läuft eine Live-Vorschau: der Spieler zielt automatisch auf den nächsten Gegner und feuert dauernd; die Gegner stehen still, es kommen keine neuen, nur Schaden über Zeit (Brand, Gift, Schock) tickt weiter (18.11.2026).
- Einstellungen: Waffe, Upgrades der gewählten Waffe mit − / + und aktueller Stufe (18.11.2026, statt Slidern für balancing.yaml-Werte), Zurücksetzen, Gegnerart (Zufall oder eine Art; Eichhörnchen fehlt, es braucht seinen Nussbaum), Gegner pro Minute, Tageszeit.
- Upgrades: alle Upgrades wie auf den Level-up-Karten (Schaden, Reichweite, Abklingzeit + Spezial-Upgrades). Hinter der Stufe steht das reguläre Maximum („3/5“); darüber ist die Zahl rot. Wo mehr Stufen nichts mehr ändern (z. B. Durchbohren „alle“, Salve, 100 %-Chancen, Flammen-Zirkel, Brand-Tick), endet + am Maximum. Harke und Grund-Upgrades haben kein Maximum. Kombiwaffen zeigen die Upgrades beider Waffen (mit Waffensymbol), weil die Kombi sie zusammenrechnet. Der Flammenwerfer hat kein Abklingzeit-Upgrade.
- Upgrade-Stufen gelten nur im Waffentest und sind beim Neustart/Verlassen weg.

## Felder gehen nicht kaputt, Ertrag nach HP (17.11.2026)
- Felder werden nie zerstört. Bei 0 HP welkt die Pflanze (braun, gestaucht, keine Früchte) und produziert nichts. Der Platz bleibt belegt.
- Ertrag skaliert linear mit den HP: 100 % HP = 100 % Ertrag, 50 % HP = 50 %. Gilt für das normale Wachstum und für den Harken-Ertrag. Die Produktionsrate im Feld-Info zeigt den aktuellen Wert.
- Beackern heilt beschädigte Felder wie bisher, auch Felder mit 0 HP. Sobald ein Feld wieder über 0 HP ist, wächst die Pflanze frisch nach. Draufstehen heilt weiterhin ebenfalls (auch bei 0 HP).
- Beim Fall auf 0 HP gibt es kein XP mehr (das Blaubeer-Geschenk und `fields.deathXpShare/deathRemoveDelay` sind entfernt).
- Gegner suchen sich nur Felder mit HP als Ziel. Startfelder nehmen erst Schaden, wenn alle anderen Gartenfelder auf 0 HP sind. Spielende: alle Gartenfelder auf 0 HP.


## Waffenmodelle (17.11.2026)
- Alle 16 Waffen haben neue, handgebaut wirkende 3D-Modelle (`src/view/arsenal.ts`, Arbeitsanweisung `Waffenmodelle-Prompt.md`): weiche Schattierung statt Flat Shading, gedrehte Profile, gebogene und sich verjüngende Formen, abgerundete Kanten.
- Jede Oberfläche hat eine eigene gemalte Textur mit Relief (Holzmaserung, gebürstetes und abgenutztes Metall, Leder- und Schnurwicklung, Spargelfasern mit Schuppen, Kohlblattadern, Zitronenporen, lackierte Chilihaut). Metall, Lack und glänzende Früchte spiegeln leicht, nachts schwächer.
- Je Waffe eine gedeckte Palette aus 4 bis 6 Tönen (Tabelle im Prompt), Leuchten nur an Ladung, Sprengkopf und Glut.
- Neu in der Hand: Beeren-Schrotflinte (Donnerbüchse aus Kirschholz und Kupfer mit Beeren-Glaskugel) und die geschnürte Kohlbombe. Vorher hatten diese beiden Waffen kein Haltemodell.
- Nahansicht aller Modelle beim lokalen Entwickeln: `arsenal-preview.html` (nicht Teil des Spiels).

## Wellen-Ansage und Countdown (17.11.2026)
- Kurz vor jeder Welle wird „Welle N“ groß mittig eingeblendet (2,5 s, mit Trommel-Horn-Klang), Nachtwellen in Mondblau. Danach laufen die Gegner los.
- Jede Welle hat einen festen Countdown oben mittig: Gruppen-Zeitplan der Welle + 20 s nach der letzten großen Gruppe (Welle 1 ≈ 40 s, Welle 20 ≈ 88 s, Welle 48 ≈ 158 s). Ab 60 s als m:ss, darunter in Sekunden.
- Ab 10 s tickt er hörbar (jede Sekunde ein Holz-Tick, die Zahl pulsiert), ab 3 s sind die Zahlen rot und der Tick höher. Bei 0 ein tiefer Gong.
- Läuft der Countdown ab, ist die Welle vorbei, egal wie viele Gegner noch leben: Alle drehen um, laufen 30 % schneller Richtung Wald (greifen nicht mehr an, sind aber noch treffbar), schrumpfen und verschwinden nach 3 s in einem kleinen Wölkchen. Geklautes Obst lassen sie beim Umdrehen fallen. Noch nicht gestartete Gruppen der Welle entfallen.
- Ersetzt die alte Regel „Welle endet, wenn 90 % der Gegner weg sind“ (`endKilled` entfernt).
- Der Boss dreht nicht ab: Er bleibt, bis er besiegt ist, auch über die Pause und die nächste Welle hinweg. Grund: Ein Bosskampf soll nicht durch Aussitzen enden, und der Boss ist selten genug (nach Spieler-Level).
- Danach Pause mit dezentem Countdown (klein, grau) bis zur nächsten Welle, ohne Ticken.
- Werte unter `waves`: `countdownAfter`, `leaveTime`, `leaveSpeed`, `announce`, `tickFrom`, `redFrom`.

## Tiere: Modelle und Animationen (18.11.2026)
- Alle Tiere (Waschbär, Waschbär-Boss, Roter Panda, Kröte, Schaf, Igel, Eichhörnchen) sind neu modelliert: weiche, prozedurale Formen mit mehrtonigen Fellfarben, Masken, Ringelschwänzen, Hörnern, Warzen. Spezifikation: `Tiere-Prompt.md`. Code: `src/view/animals.ts`.
- Jedes Tier ist ein geriggtes Mesh (Knochen für Rumpf, Hals, Kopf, Kiefer, Ohren, Schwanz, Beine) plus Augen. Geometrie wird pro Art einmal gebaut; 2–3 Draw-Calls pro Tier statt bisher bis zu 80 (wichtig für Mobile mit vielen Gegnern).
- Rennen (18.11.2026, Basti): kein schnelleres Beinwirbeln, sondern Sprunggalopp mit langer Flugphase. Die Schrittfrequenz steigt höchstens um 25 %, der Rest kommt über längere Sprünge: Hinterbeine drücken gestreckt ab, in der Luft greifen die Vorderbeine weit nach vorn, der Körper streckt sich.
- Waschbär-Gesicht: eingedrückte Augenhöhlen mit Brauenwulst, schwarze Maske um die Augen bis auf die Wangen, über den Nasenrücken verbunden, schmale weiße Brauen, weiße Schnauze und weißes Fell unter der Maske, dunkler Strich auf der Stirn.
- Animationen kommen aus den Simulationsdaten: Idle (Atmen, Umschauen, Blinzeln, Ohrzucken), Gangart je Tier an echte Geschwindigkeit gekoppelt, Angriff (Biss + Pfotenhieb, Zunge, Hufscharren, Einrollen, Boss richtet sich auf), Treffer-Rückstoß, Betäubt (Kopf hängt, Wanken), Flucht (Ohren angelegt, Schwanz hoch).
- Tod: Tiere kippen auf die Seite (Kröte auf den Rücken), zucken kurz und sinken nach 1,6 s in den Boden. Höchstens 24 gleichzeitig, sonst verschwinden sie sofort.
- Der Boss hat ein eingerissenes Ohr, eine Narbe und ein rotes Halstuch.
- Vorschauseite für alle Tiere und Animationen: `tiere.html` (nicht im Spiel verlinkt).

## Kacheln und Gebäude (22.11.2026, Classic weitergebaut)
- Alles läuft über Hex-Kacheln: 1 Startfeld in der Mitte plus 4 Ringe drumherum (61 Plätze, `tiles.rings`).
- Jedes Level-up bietet genau 3 Karten: +1 Feldbonus (Ausbau einer Kachelsorte), +1 neues Feld/Gebäude, +1 Waffe (neu oder Upgrade).
- Kacheltypen: Beete (Blaubeere, Spargel, Preiselbeere, Kohl, Zitrone, Chili, Getreide) und Gebäude: Brunnen, Mühle, Saftpresse, Bäckerei, Hühnergehege, Kuh am Pfahl, Käserei, Küche.
- Gebäude verarbeiten automatisch passende Erträge der Nachbarkacheln: Mühle 3 Getreide → Mehl, Hühner 2 Getreide → Ei, Saftpresse 4 Beeren/Zitronen → Saft, Bäckerei Mehl + Wasser (Brunnen) → Brot, Käserei 3 Milch (Kuh) → Käse, Küche 3 beliebige aus Ei/Milch/Saft/Brot/Käse → Mahlzeit. Brunnen und Kuh produzieren von selbst. Werte in `buildings`.
- Kombinationsbonus bewusst klein, nur für gleiche Kacheln. Jede Kachel zählt sich selbst und jeden gleichen Nachbarn mit je 2 % + Ausbauwert. Drei Felder im Dreieck ohne Ausbau: jedes 3 × 2 % = 6 %. Ist eins auf Stufe 1 (+5 %), erhalten seine Nachbarn 2 + 7 + 2 = 11 %. Ausbauwerte: +5, +8, +12, +17, +23, +30 % … (Zuwachs +3, +4, +5, +6 …, unendlich).
- Ausbaukosten: Stufe 1 braucht 1+1 Felder, Stufe 2 2+2, Stufe 3 4+3, Stufe 4 7+4 … gelesen als „gleichartige Kacheln, die man dafür setzt“: Feld auf ein gleiches Feld stapeln (Bau-Vorschau zeigt Kostenbalken).
- Bau-Vorschau beim Hovern: sattgrüner Pfeil zu gleichen Nachbarn (Bonus), gelb-grüner Pfeil zu Gebäuden, die den Ertrag verarbeiten würden, und ein Hinweis „im Einflussradius von x Mühlen“.
- Früchte sammelt man weiter von Hand ein. Waren und Gebäudeprodukte landen vor dem Gebäude und müssen abgeholt werden; Tiere klauen sie auch.
- Mit dem Gebäude interagieren (Harke/Aktion): legt passende Waren aus dem eigenen Beutel nach und beschleunigt die Produktion deutlich, solange man arbeitet (`tiles.feedPerStroke`, `workPerStroke`).
- Tiere greifen Gebäude an. Bei 0 HP ist das Gebäude lahmgelegt (qualmt, hängt durch) und muss mit der Harke repariert werden (`repairPerStroke`).
- Jedes Gebäude hat eigene Sounds (Mühle rattert mit Mahlsteinen und Mehlrieseln, Saftpresse quetscht mit Rattern, usw.).

## XP, Blaubeer-Schrotflinte, Kohlminen (22.11.2026)
- Jede Frucht gibt XP so, dass ein Feld jeder Sorte gleich viel XP pro Sekunde bringt: XP je Frucht = `xp.fieldPerSecond` × Erntezeit / Menge (Blaubeere 1, Preiselbeere 0,625, Spargel 2,5, Getreide 1,5, Kohl 7,5). Waffenfrüchte geben zusätzlich Munition.
- Blaubeer-Schrotflinte ist die Startwaffe (man hat Blaubeeren von Anfang an). Wie die Preiselbeer-Schrotflinte, aber ein Treffer friert das Tier 1 s ein (nicht Bosse), keine Blutung, keine platzenden Beeren. Sie belegt einen Waffenplatz, deshalb `weaponSlots.max` 3 → 4.
- Kohl wird nicht mehr geworfen, sondern ist eine Kontaktmine: wird beim Laufen an die eigene Position gelegt, Gedrückthalten legt je Abklingzeit eine. Explodiert, sobald ein Tier sie berührt (Flächenschaden + Gift wie bisher).
- Minen dürfen leicht überlappen, aber nicht ineinander liegen (Mindestabstand Explosionsradius × `mineSpacing`), nie auf Kacheln. Wird später eine Kachel darauf gebaut, verschwindet die Mine. Höchstens `maxMines` gleichzeitig.

## Balancing per Simulation (23.11.2026)
- Ein Bot spielt die echte Sim ohne Grafik (tools/balance, siehe README dort), Hunderte Läufe je Einstellung, mit 1 Waffe (Blaubeer-Schrotflinte) und mit 2 Waffen. Er nimmt nur Level-ups, die gerade einen echten Vorteil bringen.
- Vorher: jeder Lauf endete bei Welle 8 bis 10. Man war 85 % der Kampfzeit ohne Munition, die Gegnerzahl wuchs von 7 (Welle 1) auf 140 (Welle 10), Kröten-Gift fraß das einzige Feld, und die Freischalt-Karte einer ungewollten Waffe belegte jedes Mal den Waffenplatz.
- Geändert: Blaubeer-Schrotflinte 1 Beere pro Schuss; Gegnerzahl (countMultiplier 0,7, sizePerWave 0,15, durationPerWave 1,0); Gegnerleben wachsen linear (+4 % je Welle); erste Nacht milder (Größe x1,15); XP-Kurve flacher (1,02 / 4,5), damit auch spät noch Level-ups kommen; Boss ab Level 25; Upgrades stärker (+30 % Schaden, Abklingzeit x0,88 je Stufe); Freischalt-Karte gewichtet statt erzwungen, Harken-Karten selten sobald man eine Schusswaffe hat, Waffenfrucht-Felder häufiger auf der Neues-Feld-Karte.
- Ergebnis (48 Läufe je): 1 Waffe Median Welle 42, 23 % Siege; 2 Waffen Median Welle 41, 19 % Siege; 10 % der Läufe enden vor Welle 21 bis 24. Ein Mensch spielt besser als der Bot, die Siegquote sollte also höher liegen.

## Mehlsack und Mehlwolke (23.11.2026)
- Neue Waffe Mehlsack. Die Freischalt-Karte erscheint, sobald eine Mühle steht. Munition ist Mehl: Ab dem Freischalten landet aufgesammeltes Mehl als Munition statt im Beutel. Werte stehen unter `skills.flour`.
- Angriff: Die Figur dreht sich einmal im Kreis (0,45 s) und schleudert Mehl in alle Richtungen. Um sie herum entsteht eine Mehlwolke (Radius 2,6 m, wächst mit dem Reichweite-Upgrade). Sie hält 6 s, die letzten 2 s verpufft sie langsam und ist in dieser Zeit noch entzündbar. Es gibt höchstens 4 unentzündete Wolken gleichzeitig.
- Entzünden: Feuer macht aus der Wolke einen Flammenteppich, also der Flammenwerfer oder ein brennendes Tier, das hineinläuft. Die Flammenwelle frisst sich konzentrisch von der Zündstelle aus durch die Wolke (4 m/s), einmal, und erlischt dahinter wieder. Berührt sie eine andere Wolke, springt sie über (Kettenreaktion).
- Jedes Tier, das die Welle erreicht, bekommt sofort 30 Feuerschaden und brennt danach 3 s (4 Schaden/s).
- Optik: eigener Shader (src/view/flourfx.ts). Die Wolke ist ein geschichtetes Volumen mit Rauschen, Wirbeln und harten weißen Pixeln. Beim Brennen bräunt sie zuerst, darüber läuft eine glühende Dissolve-Kante, dann entsteht der Flammenteppich mit Flammenzungen, Funken, einem flackernden Licht und Hitzeflirren als Bildverzerrung. Alle Grafik-Parameter stehen unter `fx` in balancing.yaml. Bei Grafik „niedrig“ gibt es weniger Schichten, weniger Funken und kein Flirren.

## Hühner, Spiegeleierei, Spiegeleischleuder, Kamera (23.11.2026)
- Hühnergehege: Eier werden als Pyramide gestapelt (4 Schichten: 16 + 9 + 4 + 1 = 30) auf einem Strohbett neben dem Stall (`buildings.hens.stack`). Einsammeln nimmt die ganze Pyramide (von oben nach unten), Diebe nehmen nur das oberste Ei.
- Küche ersetzt durch **Spiegeleierei**: alter gusseiserner Ofen auf Beinen mit riesiger Paellapfanne voller Spiegeleier. Die Pfanne wackelt ab und zu von selbst, die Eier rutschen herum, es dampft, unter dem Herd lodern kleine Flammen, die Ofenklappe hat glühende Schlitze (flackernd, mit Bloom). 1 Ei → 3 Spiegeleier.
- **Spiegeleischleuder** (Bratpfanne, neue Waffe, Freischalt-Karte sobald eine Spiegeleierei steht): Figur dreht sich einmal mit der Pfanne und stoppt fast abrupt; 3 Spiegeleier fliegen brutzelnd mit Dampfschwaden ca. 5 m weit (je 0,2-0,3 m um einen Mittelpunkt, 120° ± 10° auseinander). Kein Schaden. Jedes Ei lockt alle Tiere im Umkreis von 5 m an; insgesamt kann 3 s an einem Ei gegessen werden (3 Tiere je Ei: 1 s). Tiere verteilen sich auf die Eier. Bosse lassen sich nicht ablenken (`skills.pan.boss`).
  - Upgrades: Abklingzeit -10 % (Start 5 s), Anziehradius +1 m, Nährwert +1 s pro Ei.
  - Duft: dünne, flauschige Schwaden ziehen von jedem Ei nach außen (weg vom Mittelpunkt), wabern wellenförmig, drehen gelegentlich um 15-25°, manchmal ein Kringel.
- Kamera: Standard 30 % näher (neue Normalansicht). Pinch-Zoom auf dem Handy (maximal alte Entfernung, minimal nochmal 30 % näher), Mausrad am PC mit denselben Grenzen. Der zweite Steuerknopf auf der rechten Bildschirmseite ist entfernt.

## Erntezyklus der Felder (23.11.2026)
- Neue Feldlogik (Basti, 23.11.2026, ersetzt 5 s Ernte / 10 s Pause): Ein Feld wächst 8 s und ist dann erntereif. Es gibt keine passive Ernte, Ertrag gibt es nur durch Harken. Die Erntezeit läuft nur, solange aktiv geharkt wird (Pausen erlaubt), insgesamt bis zu 8 s, danach wächst das Feld wieder. Harken während des Wachstums beschleunigt es auf bis zu 4 s (`fields.cycle`: grow 8, harvest 8, rakeGrow 2). Der Nussbaum ist ausgenommen.
- Wo die Harke das Feld trifft, ist egal: Es zählt nur getroffen oder nicht (jeder Treffer = `tillStroke`). Die Früchte fallen zufällig von irgendwelchen Büschen des Feldes, ohne Zuordnung zu einzelnen Pflanzen.
- Beim Abernten werden die 6 Pflanzen nacheinander gepflückt: Weizen und Spargel werden zu Stoppeln, Kohl zu Strünken. Beeren, Chili und Zitronen verlieren die Früchte, und der Busch wird dörr und leicht sepiastichig.
  - Beim letzten Ernten verschwinden die Stoppeln.
  - Sound beim letzten Ernten: Weizen Sensen-Rascheln, Spargel/Kohl Knacken, Büsche trockenes Rascheln.
- In der Pause wachsen junge grüne Sprossen (Weizen, Spargel) bzw. die Köpfe (Kohl) nach, und die Büsche werden wieder grün. Kleine grüne Früchte sind zu sehen.
- Kurz vor der Erntereife beginnt ein goldener Schimmer. Bei Erntereife schnappen die Früchte schlagartig in ihre Farbe um, mit einem Erntereif-Glockenspiel (für alle Pflanzen gleich). Sounds nur in der Nähe des Spielers.

## Mehr Übersicht (23.11.2026)
- Gebäude leuchten nicht mehr (Ofenklappen, Glut, Fenster, Wasser/Saft nur noch schwach). Liegende Waren glühen nur noch leicht (40 %).
- Bloom nachts nur noch für wirklich Helles (Schwelle 0,97, Stärke 0,8): Laternen, Schüsse und erntereife Früchte, die nachts dezent und langsam pulsieren. Glühwürmchen seltener. Spiegeleier matt, damit die Pfanne unter dem Gartenlicht nicht blendet.
- Alle Tiere und die Spielfigur haben eine dunkle Outline (Tinte). Elite-Gegner leuchten nicht mehr, sind nur größer, halten 5x aus (vorher 3x) und haben einen größeren Lebensbalken. Der Boss behält seine violette Outline.
- Frösche sind blau mit goldenen Augen. Sie sitzen länger (Sprung 1,2 s, davon 35 % in der Luft, Flugtempo = speed / airShare, Durchschnittstempo gleich), springen 2,5x so hoch und machen sich vorher kurz flach.
- HUD nach Bastis Skizze: Level-Kreis mit blauer XP- und roter HP-Leiste oben links, Pause oben rechts, Rohstoffliste rechts als „Zahl, Symbol, Name“.

## Lager-Truhe, Startwahl und Beeren-Schrotflinte (23.11.2026)
- In der Mitte steht eine große Holztruhe auf einem Erd-Hexfeld (`chest`). Alle Ressourcen der Spieler (Munition und Beutel) gelten als dort gelagert, auch wenn man sie bei sich aufsammelt.
- Waschbären stehlen aus der Truhe statt von Feldern. Höchstens 10 gleichzeitig (`chest.maxThieves`), gleichmäßig im Kreis um die Truhe verteilt. Jeder Dieb trägt zu Beginn 5 Früchte, +0,5 pro Welle (`carryStart`, `carryPerWave`). Ist er voll, rennt er schnell weg (`fleeSpeed`). Alle anderen Waschbären greifen den Spieler an. Gestohlenes, das man zurückholt, gibt keine XP.
- Spielstart: Wahl aus drei Startfeldern, Brombeere, Heidelbeere oder Preiselbeere (`arena.startChoice`). Startwaffe ist immer die Schrotflinte. Sie verschießt die gewählte Beere; Wechsel mit Q bzw. Tippen auf das Beeren-Symbol am Knopf, bei leerer Beere wird automatisch gewechselt. Getötete Tiere lassen die Beere fallen, die die Schrotflinte gerade lädt.
- Debuffs der Beeren:
  - Heidelbeere (blau): Freeze 1 s, keine Bewegung und kein Angriff. Physischer Schaden gegen Gefrorene +50 % (`blue.frozenBonus`).
  - Brombeere (dunkelviolett): Dornenfessel 3 s. Dornen wickeln sich zweimal um das Ziel und einen direkten Nachbarn (einmaliger Versuch beim Auftragen, Umkreis 0,5 m). Beide sind 20 % langsamer und bekommen 1 physischen Schaden/s.
  - Preiselbeere (blutrot): Bleeding 5 s, Tick alle 0,5 s, 2 Schaden/s (doppelt so viel wie Dornen), nur wenn sich das Tier bewegt (nicht bei Freeze oder Stun).
- Preiselbeere und Brombeere sind keine eigenen Waffen mehr; Kombis mit der alten Preiselbeer-Waffe sind im normalen Spiel vorerst nicht erreichbar (Testraum weiterhin).
- Büsche: Brombeere dunkel mit kühl-dunkelgrünen, teils rötlichen Blättern, Dornenranken und einzelnen größeren Beeren aus Steinfrüchtchen. Preiselbeere kompakt mit kleinen, satt grünen Blättern und Trauben aus 3-4 kleinen Beeren. Heidelbeere mit gemischt satt- und dunkelgrünen Blättern und Trauben aus 2-3 etwas größeren Beeren. Alle drei Beerenfelder bringen 1 Beere pro 2 s.

## Werkstatt, Ideen und Feldregeln (23.11.2026, Thread „Werkstatt-Shop mit Ideen und Feldregeln“)
Ersetzt das bisherige Level-up-Kartensystem (Feldbonus / neues Feld / Waffe).
- **Ideen:** Jedes Level-up gibt jedem Spieler eine Idee. Sie erscheint als Glühbirne (2D, schwarze Outline, gelbes Licht) rechts neben der XP-Leiste, ab 10 Stück mit Zahl (`werkstatt.maxBulbs`). Beim Level-up-Bildschirm leuchtet neben der Levelzahl eine Glühbirne auf.
- **Level-up im Kampf:** Statt Karten erscheinen 3 Hexfelder (`fieldPool.offers`). Darauf groß das Feld oder Gebäude, darüber schwebend das Produkt, darunter links Ausgangsprodukt und rechts Endprodukt mit Symbol, Name und Pfeil. Ein Hexfeld setzt man entweder als neues Feld (Level 1) auf einen freien Platz oder als Ausbau auf ein Feld desselben Typs. Fremde Felder werden nicht mehr überbaut.
- **Feldregeln:** Start auf Level 1, höchstens Level 3 (`tiles.maxLevel`). Level 2 = Level-1-Feld + 1 weiteres Feld, Level 3 = Level-2-Feld + 2 weitere (4 Felder in Summe). Die Ertragssteigerungen je Level und für gleiche Nachbarn bleiben wie festgelegt (`tiles.bonusBase`, `upgradeFirst` …).
- **Pool:** Die gewählte Startbeere schließt die anderen beiden aus. Danach tauchen nur noch das Startfeld, Weizen, Mühle, Bäckerei und (nach Freischaltung) der Brunnen auf (`fieldPool.types`). Es erscheint nur, was gerade irgendwo gebaut werden kann. Reicht der Pool nicht für 3 Hexfelder, füllt Kräutertee auf.
- **Verarbeitung (`chains`):** Stufe 1 (Mühle) braucht pro Mühlen-Kachel ein Weizenfeld auf Level 3, also 4 Weizenfelder auf Level 3 für eine Mühle auf Level 3. Stufe 2 (Bäckerei) braucht pro Bäckerei-Kachel eine Mühle auf Level 3, eine neue Bäckerei nur direkt neben einem Brunnen. (Lesart von Claude: Die Bäckerei steigt nach derselben Regel wie die Mühle auf.) Weitere Ketten (Saftpresse, Darre, Fermentierer …) lassen sich dort eintragen.
- **Brunnen:** Alle Anbaufelder (keine Gebäude, keine Waldbäume) bekommen +10 % Ertrag, mit Level 2 18 %, mit Level 3 24 % (`buildings.well.cropBonus`). Mehrere Brunnen addieren sich nicht, der beste zählt. Er liefert weiter Wasser für die Bäckerei. Er muss erst in der Werkstatt freigeschaltet werden (goldene Idee).
- **Werkstatt:** Nach jeder Welle wird an der Truhe in der Mitte eine Werkbank gedeckt (über der Truhe schwebt eine Glühbirne mit der Zahl der Ideen). Wer in den Kreis um die Truhe läuft (`werkstatt.radius`), öffnet sie; wer schon dort steht, nach `openDelay` s. Schließen mit „Weiter“ oder Esc, erneutes Öffnen durch Hinaus- und wieder Hineinlaufen. Solange alle Spieler in der Werkstatt sind, steht die Welt still (auch der Pausen-Countdown).
  - Auf dem Tisch: 6 normale Ideen für je 1 Glühbirne (Waffen-Upgrades: Schaden, Tempo, Reichweite, Schrot, Durchschlag, Harke …) und 1 größere goldene für 2 (Brunnen freischalten, neue Waffe wie der Mehlsack sobald eine Mühle steht; sonst ein doppeltes Upgrade „Meisterstück“). Gekaufte Ideen bleiben als abgehakter Zettel liegen. Rechts eine Liste aller Früchte und Waren im Besitz. Jede Pause wird neu gedeckt.
  - Gestaltung nach Bastis Skizze: Holz-Werkbank in leichter Perspektive (linke Kante gerade, rechte schräg), Pergamentzettel mit Nadel, goldene Idee unten rechts, Werkzeug in der freien Ecke. Handy hoch: Liste oben als Leiste, goldene Idee in eigener Zeile.

## Gebäude nur mit Handarbeit, Saftpresse und XP-Quellen (23.11.2026)
- Mühle, Saftpresse, Bäckerei usw. heißen hier „Gebäude“. Verarbeitende Gebäude arbeiten nur, solange jemand dort harkt (tillDuration nach jedem Schlag) und die Zutaten drin sind. Quellen (Brunnen, Kuh) laufen weiter von selbst. Der frühere Extra-Schub pro Harkenschlag entfällt: das Gebäude läuft in Echtzeit × Feldstufe.
- Saftpresse (Hexfeld im Level-up, Stufe 1 wie die Mühle: jedes Beerenfeld auf Level 3 schaltet 1 Kachel frei): presst immer die Beere, von der der harkende Spieler am meisten hat, bis sie leer ist, dann die nächste. Der Saft wird sofort getrunken = XP, doppelt so viel pro Sekunde wie ein Anbaufeld (juice.xpFactor 2). Ein Ausbau der Presse presst schneller und gibt damit mehr XP.
- Über der Presse ein dünner Balken je gepresster Beere mit Effekt-Icon (Bleeding, Freeze, Thorns). 60 s aktives Pressen einer Beere füllen ihn; jedes Mal +1 % Wirkungsdauer des Effekts (Preiselbeere Bleeding, Blaubeere Freeze, Brombeere Dornenfessel), mit kleinem Farbspritzer und aufsteigendem „+1 % …-Effizienz“. Der Fortschritt gilt für alle Spieler.
- XP kommt aus Ernte (inkl. Gebäude und Saft) und Gegnern. Ziel: Gegner im Schnitt ca. 1/3 mehr als Ernte pro Runde. Bot-Simulation (60 Läufe): mit festem XP pro Tier lag die Ernte bei 3-7× den Gegnern in frühen Wellen, weil die Ernte pro Runde fast gleich bleibt und die Tierzahl wächst. Deshalb sinkt der XP-Faktor pro Tier leicht (enemies.xpScale: 6,5 × 0,953^(Welle-1): Welle 10 ×4,3, 20 ×2,6, 30 ×1,6, 40 ×1,0) und die Ernte-XP ist 40 % niedriger (xp.fieldPerSecond 0,3). Ergebnis: Gegner/Ernte ab Welle 4 etwa 1,1-1,5, Schnitt 1,3; Levelkurve wie vorher.
- Kuh, Milch, Käserei und Käse sind vorerst ausgebaut (Basti, 23.11.2026). Modelle und Sounds bleiben im Code, die Werte in balancing.yaml sind auskommentiert.
- Saftpresse-Look (Basti, 23.11.2026): Saftflecken in den drei Beerenfarben rund um die Presse, keine losen Beeren daneben. In der Presse liegen Beeren der aktuellen Sorte und werden bei jedem Pressen zerquetscht (Zermatschgeräusch, Saft quillt in der Beerenfarbe über den Rand). Unten läuft der Saft in eine kleine Flasche; volle Flaschen hüpfen in eine Reihe auf dem Hexfeld (max. 8) und geben beim Einsammeln die XP. Ist die Reihe voll, gibt es die XP direkt.

## Erntezeiten je Feld, Beerenmenge, Kohl und Mehl (23.11.2026)
- Erntezyklus je Pflanze (`plants.x.grow` / `harvest`, sonst `fields.cycle`): Standard 8 s wachsen, 4 s ernten. Weizen 6 s / 3 s. Kohl 12 s / 2 s, dafür mehr pro Ernte (ca. 7-8 statt 6). Chili 16 s / 4 s, Menge so angepasst, dass pro Zeit etwa gleich viel herauskommt. Harken während des Wachstums halbiert die Wachstumszeit höchstens.
- Beerenmenge halbiert (Intervall 2 -> 4 s), XP je Beere dadurch verdoppelt.
- Kohlminen: 2 pro Sekunde (Abklingzeit 0,5 s, Mindestabstand = Explosionsradius).
- Mehlsack: gedrückt halten, im Laufen entsteht alle 0,4 s eine kleine Mehlwolke (2/5 des alten Radius, 1 Mehl je Wolke, keine Drehung mehr, bis zu 16 Wolken).

## Eindeutige Feldzustände, freilaufende Hühner, Gegner leichter (23.11.2026)
- Alle Zustandswechsel der Felder sind schlagartig, ohne sanftes Überblenden:
  - Reif und während der Ernte: volle Pflanzen, große farbige Früchte, Weizen golden-gelb. Was die Harke abschüttelt, wächst sofort sichtbar nach.
  - Ernte vorbei: der Strauch vertrocknet sofort, die Beeren werden braun. Weizen- und Spargelhalme welken und knicken ab. Kohl verdorrt, schrumpft und verweht als Staub.
  - Nach gut einem Drittel der Wachstumszeit: klein und grün (kleine grüne Früchte, grüne Halme). Bei Reife sofort groß und farbig.
- Hühner ohne Stall und Zaun: 5 Hühner laufen frei auf dem Feld herum und picken. Wenn nicht gearbeitet wird, setzen sie sich hin und schlafen.
- Gegner etwas leichter: `waves.countMultiplier` 0,7 -> 0,6 (Beerenmenge und Beeren-XP bleiben).

## Shop alle 5 Level, Boden aus dem Hof-Spiel, Nebel statt Wald (23.11.2026)

- Die Werkstatt (Shop) öffnet sich alle `werkstatt.everyLevels` Level (5, 10, 15 ...) von selbst für alle Spieler, direkt nach der Level-up-Karte. Kein Hinlaufen zur Truhe mehr, kein Marker über der Truhe. Die Welt steht still, solange alle im Shop sind; die Glühbirnen sammeln sich bis dahin an (1 je Level).
- Während der Shop offen ist, wird die 3D-Welt nicht gerendert; der Shop hat einen eigenen dunklen Hintergrund.
- Leistung (Messung 23.11.): Wald, Büsche, Gras und Deko waren rund 78 % aller Dreiecke und wurden zusätzlich im Schattenpass gezeichnet. Darum gibt es keine Umgebung mehr außer dem Boden: rundherum Nebel (Boden geht ab ~12,5 m in die Nebelfarbe über, dazu treibende Nebelbänke), Augen leuchten im Nebel, Irrlichter bleiben. Laternenpfahl und sein Licht sind weg.
- Boden = FreeStylized-Texturen wie im Hof-Spiel (KTX2-Array, ein Draw Call, Handy 512 px ohne Normalen). Überall Wiese (Grass 01 mit Grass 04-Flecken), nasse dunkle Erde (Ground 02/06, glänzender) nur um und zwischen Feldern, Gebäuden und der Truhe. Neue Felder: die Wiese dort und drumherum wird in ~1,5 s zu nasser Erde.
- Jedes Feld ist ein klar sichtbares Hexagon (spitze Seite oben, genau der Hex-Platz), Nachbarfelder greifen wie ein Hexgrid ineinander, mit weicher Fuge dazwischen. Die nasse Erde drumherum ist ebenfalls ein etwas größeres Hexagon je Feld (Basti, 23.11.2026: "nicht wie Schachbrett").
