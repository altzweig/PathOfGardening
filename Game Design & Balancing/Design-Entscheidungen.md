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
- Hinter den Silhouetten blinzeln Augenpaare: **orange** = Roter Panda, **blau** = Waschbär, **grün** = Kröte. Kurz vor einem Stoß sammeln sich Augen in der Richtung, aus der er kommt (`waves.warnTime`).
- Früchte am Busch leuchten nicht, nur Früchte, die herumliegen. Geschosse leuchten deutlich stärker.
- Harken-Animation und Trefferkegel sind identisch (Reichweite + Winkel aus `rake`).
- Jeder Harkentreffer: Comic-Punch-Stern pro getroffenem Gegner + Punch-Sound pro Ziel (leicht versetzt), damit man hört und sieht, wie viele getroffen wurden.

## Gegner
- Kommen in **Stößen** mit kurzen zufälligen Abständen, pro Stoß aus mehreren Richtungen. Mit der Zeit mehr Gegner pro Stoß und mehr Richtungen.
- Stand der offenen Fragen aus dem Prototyp: Munition pro Schuss 1 Spargel / 6 Preiselbeeren / 1 Kohl, Verschmelzen 10 → 1 für alle Früchte, Kröte 10 HP, Panda flieht mit 5 Früchten, Mini-Kohl max. 5, Doppelernte max. 90 %.

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
