# PathOfGardening – Design-Entscheidungen

Zahlen stehen ausschließlich in `balancing.yaml`. Hier stehen die Regeln und das „Warum“.

## Grundsätze
- **Keine Erklärtexte im Spiel.** Mechaniken, Steuerung, Upgrades werden nicht erklärt. Spieler entdecken selbst. Später kommt ein Tutorial für die zentralen Mechaniken.
- **Steuerung** steht nur auf der Seite *Optionen → Steuerung* (bzw. *Pause → Steuerung*): visuell, getrennt für PC und Mobil, groß genug für das jeweilige Gerät.
- **Level-up-Karten:** Bild + Titel + höchstens 2 Zeilen, Zahlen mit Icons statt Sätzen. Es darf spannend bleiben.
- Arbeitstitel: **PathOfGardening** (früher „Beerenwacht“).

## Steuerung
- **PC:** WASD laufen, Maus zielen, linke Maustaste = aktive Waffe (halten = Dauerfeuer), Leertaste = nächste verfügbare Waffe, Esc = Pause.
  - Reihenfolge Harke → Spargelgewehr → Schrotflinte → Kohlbombe. Leertaste springt nur auf Waffen, die gerade *bereit* sind.
  - Wird die aktive Waffe leer, wechselt das Spiel automatisch zur nächsten bereiten Nicht-Harke-Waffe, sonst zur Harke.
  - Die aktive Waffe ist unten rechts hervorgehoben.
- **Mobil:** linker Daumen irgendwo links = laufen. Rechts wischen = Harke zielen. Jede Waffe ist ein eigener Joystick: tippen = automatisch zielen, halten + ziehen = zielen und feuern.

## Optik
- Das Spiel ist insgesamt dunkel. Am Rand ist es komplett schwarz, nur Silhouetten von Büschen und Bäumen.
- Auf den Büschen am Rand sitzen kleine Augenpaare (2–3 pro Busch, alle gleich groß ±10 %, dunkelblau bis lila). Sie leuchten selbst, beleuchten aber nichts und haben keinen Bloom. Beim Blinzeln klappen Lider schnell runter und hoch. Kurz vor einem Stoß füllen sich die Büsche in dieser Richtung mit Augen (`waves.warnTime`).
- Früchte am Busch leuchten nicht, nur Früchte, die herumliegen. Geschosse leuchten deutlich stärker.
- Harken-Animation und Trefferkegel sind identisch (Reichweite + Winkel aus `rake`).
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
- Harke benutzen, wenn kein Gegner im Kegel ist und 1 m vor dem Spieler ein Feld liegt: statt eines Schlags macht der Spieler einen Vorwärtsstoß und beackert das Feld. Annahme: Gegner im Kegel haben Vorrang, damit Kämpfen am Feld nicht ins Leere geht.
- Ein beackertes Feld produziert doppelt so schnell, wackelt leicht und sein Rand leuchtet heller. Die Wirkung hält 1 s nach jedem Stoß (`fields.tillDuration`), man muss also dranbleiben. Jeder Spieler kann nur ein Feld gleichzeitig beackern (im Koop also mehrere Felder von verschiedenen Spielern).
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
