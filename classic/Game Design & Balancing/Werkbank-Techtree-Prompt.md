# Umsetzungs-Prompt: Erbsenstart, Werkbank-Forschung und Techtree (Classic)

Stand 25.11.2026, Auftrag von Basti. Gilt für `classic/` (live unter /classic/). PC und Handy (hoch + quer) werden immer gemeinsam umgesetzt.

## Rolle

Du bist Senior Gameplay-Engineer und Game Designer für PathOfGardening Classic (TypeScript, Vite, Three.js, PeerJS-Koop für bis zu 4 Spieler). Du arbeitest in einem bestehenden, gewachsenen Code (`classic/src/sim/sim.ts` ist die deterministische Spiel-Simulation, `view/` die Darstellung, `ui/` das DOM-HUD, `net/` der Koop-Netcode, `save.ts` die Spielstände, `tools/balance` der Balancing-Bot). Du änderst nur, was der Auftrag braucht, hältst den Stil des Codes ein und dokumentierst Entscheidungen.

## Ziel

Der Fortschritt im Spiel läuft künftig nicht mehr über XP und Zufallskarten, sondern über **aktive Forschung an einer Werkbank** in einem **Techtree** (Civilization-6-Stil: lange Stränge mit Abzweigungen). Man startet schlicht mit **Erbsenfeld + Erbsenpistole**, Truhe und Werkbank.

## Feste Projektregeln

- Keine Erklärtexte im UI (Ausnahme: Tutorial). Infos zu einer Idee im Abhol-Popup sind Werte/Kurzbeschreibung, kein Tutorialtext.
- PC- und Handy-Steuerung parallel; jedes Panel muss auf kleinen Handys hochkant und quer vollständig passen (vgl. Handy-Hochformat-Regeln, PR #128).
- Alle Zahlen zentral in `classic/Game Design & Balancing/balancing.yaml`, Begründungen in `Design-Entscheidungen.md` (Datum 25.11.2026).
- Neue Waffen in `prewarm()` aufnehmen; Lichter nie per `visible` schalten (Shader-Ruckler).
- Waffe immer erst nach ihrem Feld (`weaponNeeds` bzw. Techtree-Abhängigkeit).
- Massenobjekte (Mauer bis 200 Stück) per Pool + InstancedMesh wie Kohlminen/Mehlwolken (PR #115).
- Gegner bleiben vorgebacken + instanziert (PR #127), Gegnerzahl nie senken.
- Koop-Netcode (Binär-Deltas, Vorhersage, PR #124) und Spielstände (PR #119) müssen mit allen neuen Zuständen funktionieren. Neue Snapshot-Felder hinten anhängen.
- Sounds aus Freesound CC0 oder prozedural (WebAudio); Credits in `classic/CREDITS.md` pflegen.
- `npm run build` in `classic/` muss fehlerfrei durchlaufen.

## Spezifikation

### 1. Startzustand
- Start: Truhe (Mitte), **Erbsenfeld** auf einem Nachbarfeld der Truhe, **Werkbank** auf einem weiteren Nachbarfeld der Truhe (feste Kachel, nicht überbaubar, wie die Truhe).
- Startbeeren-Wahl entfällt. Erbsenfeld hat exakt die Zeiten und Erträge der bisherigen Beerenfelder (Wachstum, Pflanzen, Ertrag, XP).
- Startwaffe: **Erbsenpistole**. Im Techtree sind Erbsenfeld und Erbsenpistole bereits erforscht.

### 2. Erbsenpistole (neue Waffe `pea`, Munition Erbsen)
- Ein einzelnes großes Projektil (eine dicke Erbse), sehr hoher Einzelschaden, kein Durchschlag, langsame Feuerrate (Desert-Eagle-Gefühl).
- Verbraucht **3 Erbsen pro Schuss**.
- Modell: Pistole aus Holz, oberer Teil (Schlitten) erbsengrün. Hängt wie andere Waffen auf dem Rücken/in der Hand.
- Sound: holzig bis metallisch, dumpf und schwer (prozedural oder CC0).

### 3. Werkbank und Forschung
- XP schalten **keine Ideen mehr frei**. Level-up-Karten, Ideen-Glühbirnen, Händler-Werkstatt (zufällige Upgrades) und Feld-Ausbau/Überbauen entfallen für den normalen Spielfluss (Code darf hinter Schaltern bleiben).
- Forschung nur durch **aktives Arbeiten an der Werkbank**: Spieler steht an der Werkbank und hält die Aktion (wie Harken/Ernten). Geht immer, auch während Wellen.
- Animation: Figur zieht einen **Hammer** und hämmert auf der Werkbank. Eine kleine **graue Staubwolke** (grauere Variante der Mehlwolke) vor ihr verdeckt die Stelle.
- Sound: Mischung aus Hammerschlägen, Schrauben und Handsäge.
- Die gewählte Idee ist **sichtbar an der Werkbank eingehängt** (Icon/Schild der Idee), darüber ein **Ladebalken in XP-Farbe**.
- Die **XP-Leiste unten rechts** (PC-Orb bzw. Handy-Leiste) zeigt vorerst den Forschungsfortschritt.
- Koop: ein gemeinsamer Techtree für das Team; mehrere Spieler an der Werkbank forschen schneller (Beiträge addieren sich).

### 4. Abholen und Auswahl
- Ist eine Idee fertig und ein Spieler läuft gegen die Werkbank, holt er sie ab: UI öffnet sich, **das restliche Spiel pausiert**, ein **Popup** zeigt die fertige Idee mit ihren Infos und einem Knopf **„Fertigstellen“**. Erst damit ist die Idee freigeschaltet.
- Unter dem Popup ist das **Techtree-Panel** für die nächste Forschung zu sehen; nach dem Fertigstellen wählt man dort direkt die nächste Idee.
- Ohne laufende Forschung öffnet das Anlaufen der Werkbank direkt das Panel (Auswahl). Wechsel der Forschung behält den Fortschritt pro Idee.
- Ist die Idee ein **Feld**, startet nach dem Fertigstellen direkt das Platzieren dieses Feldes (vorhandener Platzier-Modus inkl. Handy-Zoom).

### 5. Techtree
- Horizontal laufender Baum mit Knoten und Verbindungslinien, scrollbar (Maus/Wischen), Zustände: erforscht, verfügbar, gesperrt, in Arbeit (mit Fortschritt).
- **Oberste Reihe: Forschung selbst** – „Forschungstempo“ ist immer erforschbar (beliebig oft). Jede Stufe +25 % Tempo, jede erforschte Idee kostet +20 % mehr Forschung (Startwerte, zentral einstellbar).
- **Segment 1** (Start):
  - Erbsenfeld → Erbsenpistole (erforscht)
  - Zweig A: **Weizenfeld** → wahlweise **Schrotflinte** (Weizenkörner, Schrot) oder **Maschinenpistole** (Weizen, bisherige Körner-MP)
  - Zweig B: **Kohlfeld** → wahlweise **Kohlmine** oder **Steinkohle** (Mauer)
- Sobald so viele Ideen erforscht sind, dass eine Waffe dabei sein kann (also ein Feld + eine Waffe nach dem Start), öffnet sich **Segment 2**: wieder zwei Felder mit dahinterliegenden Waffen. Danach Segment 3 analog.
- Nur Felder und Waffen, **keine Waffen-Upgrades**. Mühle und andere Verarbeitungsgebäude bleiben vorerst draußen.
- Jedes Feld gibt es nur **einmal**; Aufeinanderplatzieren (Ausbau) ist deaktiviert.

### 6. Kohlmine (Änderung)
- Kohl darf überall gelegt werden, außer direkt in einem anderen Kohl; direkt daneben (Berührung, kein Abstand) ist erlaubt.

### 7. Steinkohle (neue Waffe/Fähigkeit `wall`)
- Asset: niedriger Pfosten aus zwei großen, aufeinanderstehenden Kohlköpfen.
- Wirkt als Box-Collider für Gegner: sie laufen drumherum oder greifen ihn an. **Frösche hüpfen darüber.** 30 HP.
- Nahe Stücke verbinden sich optisch zu einer durchgehenden Mauer. Knopf drücken = ein Stück, gedrückt halten = beim Laufen eine Mauer ziehen. Cooldown so, dass auch beim Sprinten eine lückenlose Mauer entsteht.
- Nur außerhalb von Feldern; wird ein Feld auf Mauer gebaut, verschwindet die Mauer dort.
- Max. 200 Stücke; hält für immer, bis Gegner sie zerstören oder sie überbaut wird.

## Arbeitspakete und Abhängigkeiten

| Paket | Inhalt | Dateien (Schwerpunkt) | hängt ab von |
|---|---|---|---|
| **P1 Kern-Simulation** | Datenmodell Techtree + Forschung in balancing.yaml/config.ts, Sim-Zustand und API (Auswahl, Arbeiten, Fertig, Abholen, Pause, Platzieren), Startzustand (Truhe, Werkbank-Kachel, Erbsenfeld), Erbse als Frucht, Erbsenpistole, Weizen-Schrotflinte, Kohlmine-Regel, Steinkohle-Mauer inkl. Gegner-Ausweichen/Angriff, jedes Feld 1x, kein Überbauen, XP-Ideen/Level-up/Händler aus, Snapshot-Felder | `sim/sim.ts`, `config.ts`, `balancing.yaml` | – |
| **P2 Assets & Sound** | Modelle Erbsenpistole, Werkbank, Hammer, Steinkohle-Pfosten + Verbindungsstück, graue Staubwolke, Sounds (Schuss, Werkbank-Arbeit, Abholen, Mauer setzen/zerbrechen) – eigenständige Module mit klarer Schnittstelle | neue Dateien in `view/`, `audio.ts`, `sounds.yaml`, CREDITS | – (parallel zu P1) |
| **P3 Techtree-UI** | Techtree-Panel, Abhol-Popup mit „Fertigstellen“, Forschungsanzeige in der XP-Leiste/Orb, Mauer-Knopf, Waffenleiste, Handy hoch/quer, PC | `ui/*`, `style.css`, `main.ts` | P1 |
| **P4 Welt-Integration** | Werkbank-Kachel in der Welt, eingehängte Idee + Ladebalken, Hammer-Animation + Staub, Mauer-Pool mit Verbindungen, Pistole in Hand/Rücken, Erbsen-Projektil/Erbsenfeld, prewarm | `view/*` | P1, P2 |
| **P5 Systeme** | Koop-Netcode (neue Snapshot-Felder, Forschung, Mauer), Spielstände (Version, Migration), Tutorial auf neuen Start, Cheats (Forschung freischalten), Balancing-Bot (forscht an der Werkbank), Doku, Credits | `net/*`, `save.ts`, `ui/tutorial.ts`, `tools/balance`, Doku | P1–P4 |
| **P6 Abnahme** | Build, Bot-Lauf, Screenshots PC + Handy hoch/quer, PR, main einmischen, mergen | – | alle |

## Abnahmekriterien

1. Neues Spiel: Truhe, Erbsenfeld, Werkbank stehen; einzige Waffe ist die Erbsenpistole (3 Erbsen/Schuss, ein großes Projektil, hoher Schaden).
2. XP-Level-ups bringen keine Ideen/Karten mehr; kein Händler-Upgrade-Shop.
3. An der Werkbank: Auswahlpanel öffnet sich; gewählte Idee hängt sichtbar an der Werkbank; Halten der Aktion lässt Hammer-Animation, Staubwolke, Werkbank-Sound und Ladebalken laufen; XP-Leiste/Orb zeigt den Fortschritt.
4. Fertige Idee: Anlaufen öffnet Popup, Spiel pausiert, „Fertigstellen“ schaltet frei; darunter das Panel; Felder gehen direkt in den Platzier-Modus.
5. Techtree zeigt Forschungstempo oben, Segment 1 wie spezifiziert, Segment 2 öffnet sich nach Feld + Waffe.
6. Jedes Feld nur einmal, kein Überbauen.
7. Kohlminen dürfen sich berühren, aber nicht ineinander liegen.
8. Steinkohle: halten zieht eine lückenlose, verbundene Mauer; Gegner laufen herum oder greifen an (30 HP), Frösche hüpfen drüber; max. 200; Feldbau entfernt Mauer an der Stelle; flüssig (Instancing).
9. Koop: zwei Browser sehen denselben Techtree, Fortschritt, Mauer; Popup/Pause funktionieren. Spielstand speichern/laden behält Forschung und Mauer.
10. `npm run build` grün, Balancing-Bot läuft durch, Screenshots PC + Handy hoch/quer.

## Getroffene Annahmen (wo die Spezifikation offen ist)

- **Segment 2/3**: Segment 2 = Chilifeld → Flammenwerfer | Zitronenfeld → Citrateaser; Segment 3 = Beerenfeld (Heidelbeere) → Beerengewehr | Spargelfeld → Spargel-Armbrust. Da es je Feld bisher nur eine passende Waffe gibt, hat jedes Feld in Segment 2/3 zunächst eine Waffe; zweite Waffen kann Basti nachliefern (Platz im Baum vorgesehen).
- **Händler, Werkstatt-Upgrades, Level-up-Karten**: per Schalter abgeschaltet, Code bleibt.
- **XP/Level**: werden weiter gezählt (Statistik, Wellen-Skalierung), haben aber keine Belohnung mehr. Die XP-Anzeige zeigt die Forschung.
- **Mauer**: Spieler laufen durch die eigene Mauer (Koop ohne Einsperren), kostet Kohl als Munition; bei 200 Stück verschwindet das älteste.
- **Pause beim Abholen** im Koop wie bisherige Pausen (Transitions).

## Umsetzungsstand (26.11.2026)

Umgesetzt in P1–P5 (Details und Begründungen: `Design-Entscheidungen.md`, Abschnitte vom 25. und 26.11.2026):

- **P1 Kern-Simulation:** `progression: research` (alter Ablauf weiter mit `progression: xp`), Start mit Truhe, Erbsenfeld, Werkbank und Erbsenpistole; Techtree-Daten in `balancing.yaml` (`research:`), Forschung durch Halten der Aktion an der Werkbank, Pause beim Abholen, Felder gehen direkt in den Platzier-Modus; Schrotflinte (Weizen), Kohlminen-Regel, Steinkohle-Mauer (Ausweichen, Angriff, Frösche hüpfen drüber, max. 200); jede Feldart einmal, kein Überbauen, Level-up-Karten/Ideen/Händler aus.
- **P2 Assets & Sound:** Erbsenpistole, Werkbank, Hammer, Steinkohl-Pfosten, graue Staubwolke (prozedural), Sounds per WebAudio (CREDITS ergänzt).
- **P3 Techtree-UI:** Panel (scrollbar, Zustände, Fortschritt), Abhol-Popup mit „Fertigstellen“, Forschung in XP-Orb/-Leiste, Techtree-Knopf (Glühbirne) bzw. F, PC und Handy hoch/quer.
- **P4 Welt:** Werkbank mit eingehängter Idee und Ladebalken, Hammer-Animation + Staub, Mauer-Pool (Instancing), Waffen in der Hand, Erbsenfeld, prewarm.
- **P5 Systeme:** Koop (alle neuen Snapshot-Felder in den Binär-Deltas, Mauer als Tabelle, Vorhersage kennt die Werkbank, Glühbirne + Name bei den anderen, wenn einer abholt), Spielstände Version 2 (alte Stände laufen als Forschungsspiel weiter), Feld beim Abbruch/Laden während des Platzierens bleibt erhalten (wartet an der Werkbank), Tutorial für den neuen Start (PC + Handy), Cheats (Forschung +1/alles/Tempo), Balancing-Bot forscht, erntet und kämpft abgewogen.

Getroffene Annahmen in P5:
- Alte Spielstände werden als Forschungsspiel geladen (alles Vorhandene gilt als erforscht), nicht im XP-Ablauf weitergeführt.
- Ein beim Platzieren verlorenes Feld (Verbindungsabbruch, Laden) wartet an der Werkbank auf den nächsten Spieler, der sie berührt; das Spiel wartet nicht auf den Abwesenden.
- Forschungstempo zählt als erforschte Idee (+20 % Bedarf, +25 % Tempo = netto +4,2 % je Stufe), wie von Basti beschrieben.
- Tutorial am Handy: nur die kurzen Hinweise oben, keine Erklärkarten.

Offen:
- **Balancing-Ziel (Welle 35–45) nicht erreicht:** mit Pistole, Startmunition, Forschungszeit und Bot erreicht der Bot Median Welle 16 (vorher 9); auch mit sofort allem erforscht oder doppeltem Schaden nur 16–18. Es fehlt eine wachsende Stellschraube (Upgrades/Feldstufen gibt es im Techtree nicht). Vorschlag siehe Design-Entscheidungen „Balancing Erbsenstart“. Entscheidung durch Basti.
- Gegner kollidieren nicht mit der Werkbank; Kohlminen dürfen auf Feldern liegen (`skills.cab.onFields`).
- Mauer kostet bei 260 Gegnern und 200 Pfosten ca. +0,8 ms je Sim-Tick.

Stand 26.11.2026 (Einzelbäume):
- Techtree in kleine Bäume pro Frucht mit Reitern umgebaut, Gebäude (Mühle, Bäckerei …) und Waffen-Upgrades als Knoten, Upgrade-Ketten aus `count`. Mehlsäcke als Barriere an Feldkanten ersetzen den Mehlstaub. Details in Design-Entscheidungen „Techtree in Einzelbäumen pro Frucht, Mehlsäcke“.
- Upgrades heben den Bot nicht über Welle 16; Balancing-Ziel weiter offen.

Stand 26.11.2026 (Truhe, Myzel):
- Feld-Upgrades „Zykluszeit“ (5 × −20 %), feste Forschungszeiten, Forschungstempo über die Stufe. Tiere greifen die Truhe an (0 = verloren), Arbeit an der Truhe heilt sie oder sucht Samen für neue Bäume. Myzel-XP aus Tieren, alle 3 Stufen eine Myzelle für die Autoernte. Details in Design-Entscheidungen „Feld-Upgrades, Truhe als Verlustbedingung, Myzel-XP und Myzellen“.
