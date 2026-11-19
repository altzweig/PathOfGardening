# Farming-Gameloop (Umbau ab 19.11.2026)

Auftrag (Basti, 19.11.2026): Aus dem Wellen-Survival wird ein **dauerhaftes Farming-Spiel**. Man spielt immer einen Tag
(eine Welle = ein Tag, ca. 5 Minuten), erledigt Aufgaben auf dem Hof und verteidigt die Ernte gegen wenige Tiere.
Abends im Haus: Aufträge, Bauen, Verarbeitung. Man kann nicht verlieren. Zahlen stehen in `balancing.yaml`,
Regeln und Begründungen in `Design-Entscheidungen.md`.

## Ablauf

```
Morgen (UI)          Tag (ca. 5 min, spielbar)                          Abend (UI im Haus)
Waffe + Munition --> Aufgaben auf dem Hof (Linksklick)       --> Ertraege abholen, Produktion starten,
waehlen              Kaempfen gegen Tiere (Rechtsklick)          Auftraege abschliessen/annehmen, bauen
                     Zeit um / ohnmaechtig -> ins Haus           Schlafen -> naechster Morgen
```

## Phasen der Umsetzung

1. **Aufräumen:** alles, was nicht mehr passt, nach `archiv/garden-defence-v1/` (Code + alte Werte), nicht löschen.
2. **Hof:** Layout nach Bastis Skizze (Haupthaus mit Lager, Hofladen, Mühle, Bäckerei, Brunnen, Schreinerei, Werkstatt,
   Molkerei, Saftpresse, Silo, Hühner, Kühe, Feldflächen, Bäume, Wald mit 5 Lücken). Alle Gebäude außer dem Haupthaus
   sind Baustellen, der Brunnen ist kaputt.
3. **Tag/Abend-Zyklus:** Tag läuft `day.length` s, Licht von Morgen bis Abenddämmerung, dann Schwarzblende und Haus.
   Nur Sommer, keine Jahreszeiten.
4. **Steuerung:** Linksklick = kontextabhängige Aktion am Ziel (dauert wenige Sekunden, Werkzeug + Animation automatisch),
   Rechtsklick = Kampf mit der aktiven Waffe, ohne Waffe/Munition schwertartiger Schlag mit der Harke.
   Nicht beides gleichzeitig. Handy: Aktionsknopf + Angriffsknopf.
5. **Landwirtschaft:** Blaubeerbusch (gießen, 1 min reifen, ernten), Felder (harken, säen, 3 Tage je 1x gießen, ernten),
   Gießkanne mit Wasser, Auffüllen am Brunnen.
6. **Kampf + Tiere:** Waschbär (klaut, greift an) und Hase (scheu, frisst Felder), wenige Tiere in kleinen Schüben.
   Waffenwahl am Morgen (eine Waffe, eine Munition), Schießen verbraucht die Munition. Ohnmacht bei 0 Leben.
7. **XP + Level:** XP nur aus Aufträgen und vertriebenen Tieren. Level schalten Felder und Gebäude frei,
   Schwierigkeit steigt mit dem Level.
8. **Abend-UI:** Lager, Aufträge, Bauen, Produktion, Schlafen. System für Verarbeitung vorbereitet.
9. **Tutorial-Tag:** Bastis Ablauf mit Hinweisen, Pfeil, Ladebalken, Waschbär-Cutscene und Kampf-Erklärung.
10. **Speichern:** Spielstand im Browser (localStorage), "Spielen" setzt fort.

## Was rausfliegt (Archiv)

Wellen-System (Countdown, Ansage, Stöße), Level-up-Karten und Upgrades, Kombiwaffen, Flammenwerfer, Zitronenblitz,
Kohlbombe, Armbrust-/Schrotflinten-Varianten, Gießkanne als Waffe, Waffentest, Testmodus, Lager-Hütte (geht ins
Haupthaus), Jahreszeiten, Hex-Felder und Bau-Ansicht, Pflanzen-Startpool, Nussbäume/Eichhörnchen, Panda, Kröte,
Schaf, Igel, Boss, Koop (Netzcode). Die Tiermodelle (`src/view/animals.ts`), Pflanzenmodelle, Waffenmodelle und
die Vorschauseiten (tiere.html, pflanzen.html, arsenal-preview.html, vfx.html) bleiben im Code.

## Bleibt

Charakter-Editor + Startmenü, Spielfigur (Rig + IK), Tiermodelle + Animation, Gewitter-Regen (seltener Sommerschauer,
gießt alle Felder), Nässe als "heute gegossen", Texturen/Umgebung (Quaternius-Wald, juliovii-Böden, Credits), Sounds.

## Annahmen (Basti wollte keine Rückfragen)

- **Koop** ist vorerst aus. Der Hof ist ein Einzelspieler-Spielstand. Die Simulation ist so gebaut, dass Koop später
  wieder rein kann (Netzcode liegt im Archiv).
- **Ernten am Busch** läuft durchgehend (Beere für Beere, zusammen ca. 1 min), solange man nicht wegläuft oder kämpft.
  Ein erneuter Linksklick setzt fort. Die Beeren landen sofort im Korb am Lager (neben dem Haus).
- **Weizen** ist zugleich Saatgut: Säen verbraucht 1 Weizen, die Ernte gibt Weizen + Stroh.
- **Felder** wachsen über Nacht um einen Tag, wenn sie an dem Tag gegossen wurden. Nach 3 gegossenen Tagen reif.
- **Ohnmacht:** Schwarzblende, man wacht abends auf. Alle heute gegossenen Felder gelten als nicht gegossen (trocken),
  sonst kein Schaden.
- **Tiere werden nicht getötet**, sondern vertrieben: bei 0 Leben fliehen sie in den Wald (XP). Getroffene Waschbären
  lassen ihre Beute fallen, sie rollt zum Spieler und kommt zurück ins Lager.
- **Rechtsklick während einer Aktion** bricht die Aktion ab und schlägt zu (nie beides gleichzeitig).
- **Klick auf ein entferntes Ziel** lässt die Figur hinlaufen und dann die Aktion ausführen (WASD bricht ab).
- **Geld** heißt Taler. Startgeld + Startauftrag reichen genau für den Brunnen.
- **Lagerplatz** ist vorerst unbegrenzt (Wert in der yaml vorbereitet), das Lager-Upgrade kommt später.
- **Gebäude-Positionen**, die nicht in der Skizze stehen (Brunnen, Molkerei, Saftpresse, Kühe, Schreinerei,
  Werkstatt), sind sinnvoll verteilt und in `balancing.yaml` unter `hof` frei verschiebbar.

## Stand 19.11.2026 (erster PR)
Umgesetzt: Phasen Tag / Abend / Morgen, Tutorial-Tag mit Cutscene, Hof nach Skizze mit Baustellen, Brunnen (kaputt → reparierbar), Blaubeerbusch, Weizenfelder, Gießkanne mit Füllungen, Schrotflinte + Harke, Waschbär + Hase, Aufträge, Bauen, Felder anlegen, Produktion (Mühle, Saftpresse, Bäckerei, Molkerei), Ohnmacht, Speichern. PC und Handy (Querformat) durchgespielt.
Offen / nächste Schritte: weitere Pflanzen für Felder (Saatgut-Auswahl), Armbrust/Schleuder/Streitkolben/Kanone spielbar machen, Gebäude-Upgrades, Hofladen-Verkauf, Nachtmodus, Balancing (Waschbären klauen am Korb noch recht viel).
