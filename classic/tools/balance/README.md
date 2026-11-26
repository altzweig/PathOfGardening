# Balancing-Simulation (Classic)

Ein Bot spielt die echte Sim ohne Grafik durch (sammeln, schießen, Felder beackern, Level-up-Karten wählen, Kacheln setzen).
Er nimmt nur Karten, die gerade einen echten Vorteil bringen (Waffen-Upgrades der eigenen Waffen, Munitionsfelder, neue Felder solange wenige stehen,
Gebäude nur mit passendem Nachbarn) und spielt mit 1 Waffe (Blaubeer-Schrotflinte) oder 2 Waffen (+ eine zufällige zweite).

```bash
cd classic
npx esbuild tools/balance/worker.ts --bundle --platform=node --format=cjs --outfile=tools/balance/worker.cjs
# 40 Läufe mit 2 Waffen, Werte aus balancing.yaml, optional überschreiben:
node tools/balance/run.mjs '{"runs":40,"weapons":2,"bySecond":1,"picks":1,"overrides":{"waves.countMultiplier":0.8}}'
```

Mit `"seed":1` spielen alle Varianten dieselben Zufallsfolgen (gepaarter Vergleich, viel weniger Rauschen). Mit `"start":"blue"` die Startbeere festlegen, mit `"stopWave":20` nach Welle 20 aufhören.

Ausgabe: Siegquote, erreichte Welle (Median, Quantile 10/25/75/90 %), Level bei Welle 8/16/24/32/40/48, Tode, Anteil Kampfzeit ohne Munition, Boss, verlorene Spieler-Leben (hurt), verlorene Feld-Leben (fieldLoss), Kills.
`dbg.ts` zeigt für einen Lauf je Welle Gegnerzahl, Kills und Feldschaden nach Tierart.

**Werkbank-Techtree (26.11.2026, `progression: research`):** der Bot erntet reife Munitionsfelder, schießt Tiere am Garten zuerst, forscht zwischen den Kämpfen an der Werkbank (Aktion halten), holt fertige Ideen ab und platziert Felder. Zusätzliche Ausgabe: `act` (Zeitanteile: shoot, harvest, harvestLow = Munition knapp, bench, collect, melee, dead …), mit `"rsAt":1` die Welle, in der jede Idee fertig war (Median, in Klammern wie viele Läufe sie erreicht haben). Schalter: `"rsSpeed":false` (nie Forschungstempo), `"dmgMul":2` (Was-wäre-wenn: Schaden aller Waffen ×2). Umgebungsvariablen `BOT_CAP` (Munition, bis zu der zwischen den Kämpfen geerntet wird, Standard 30) und `BOT_FETCH` (Fallobst so weit holen, solange geforscht wird, Standard 2,5 m). **Truhe + Myzel (26.11.2026):** der Bot schießt zuerst Tiere an der Truhe, repariert sie unter 70 % (`BOT_HEAL`), sucht Samen, sobald er weniger Bäume hat als Welle/4 (`BOT_SEED`), nimmt Feld-Upgrades für seine Munitionsfelder und setzt Myzellen ins Munitionsfeld mit den wenigsten. Headless-Test der neuen Regeln: `tools/save/myzel-test.ts`. Einzelner Lauf mit Verlauf: `tools/balance/trace.ts` (`FROM=<Welle>`: ab da alle 2 s eine Zeile).

**Mehlsäcke (26.11.2026):** `tools/balance/sack-test.ts` prüft ohne Grafik Säcke an allen freien Kanten, Spielstand, Upgrades (Leben, Kosten, Reparatur), Verschwinden beim Anbauen und eine Welle gegen die Säcke (`npx esbuild tools/balance/sack-test.ts --bundle --platform=node --format=cjs --outfile=/tmp/sack-test.cjs && node /tmp/sack-test.cjs`). Der Bot wählt Upgrades nach `BOT_UP` (Standard 1,2), Gebäude und Säcke nie.
