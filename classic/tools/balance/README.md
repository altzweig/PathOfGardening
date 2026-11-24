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
