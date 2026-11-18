# Archiv: alte Harke (bis 18.11.2026)

Die Harke wurde am 18.11.2026 durch die **Hacke** ersetzt (Linksklick hacken = ernten/beackern, Rechtsklick Schwung = kämpfen).
Hier liegt der alte Code nur zum Nachschlagen, er wird nicht gebaut.

- `harke-sim.ts`: Logik (Zug + Stoß, Trefferkreis, Beackern anteilig zur Fläche je Hex-Dreieck)
- `harke-view.ts`: Modell (Stiel, Rechenkopf mit Zinken), Kratzspuren im Boden, Zug-/Stoß-Animation
- `harke-balancing.yaml`: die alten Werte

Zum Zurückholen: Funktionen wieder in `src/sim/sim.ts` bzw. `src/view/*` einsetzen und den Abschnitt `rake:` in `balancing.yaml` wiederherstellen.
