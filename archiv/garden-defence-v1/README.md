# Archiv: Garden Defence v1 (Wellen-Survival, Stand 19.11.2026)

Am 19.11.2026 wurde das Spiel zum Farming-Gameloop umgebaut (siehe `Game Design & Balancing/Farming-Gameloop.md`).
Hier liegt die alte Fassung nur zum Nachschlagen und Zurückholen, sie wird nicht gebaut (`tsconfig` schließt `archiv/` aus).

- `src/main.ts`: alter Spielablauf (Solo, Koop, Testmodus, Waffentest, Level-up-Karten, Bau-Ansicht)
- `src/sim/`: komplette alte Simulation (Wellen, Stöße, Countdown, Hex-Felder, alle Waffen inkl. Kombiwaffen,
  Flammenwerfer, Citrateaser, Kohlbombe, Schrotflinten, Armbrüste, Gießkanne als Waffe, Nässe, Jahreszeiten, Lager-Hütte,
  Nussbäume, alle Tiere inkl. Panda, Kröte, Schaf, Igel, Eichhörnchen und Boss, Upgrades)
- `src/view/`: alte Darstellung (view.ts), Kombiwaffen-Effekte, Flammen, Lager-Hütte, Beete, alte Lichtung (world.ts)
- `src/net/`: Koop über PeerJS
- `src/input/`, `src/ui/`: alte Eingabe, HUD, Steuerungsseite
- `design/`: alte `balancing.yaml`, `Design-Entscheidungen.md`, `Upgrades.md`, `Kombiwaffen-Prompt.md`
- `index.html`, `src/style.css`: alte Oberfläche

Weiterhin im Spielcode (wird später wieder gebraucht): Tiermodelle (`src/view/animals.ts`), Pflanzenmodelle
(`src/view/crops.ts`, `src/view/models.ts`), Waffenmodelle (`src/view/arsenal.ts`), Effekt-Labor (`vfx.html`),
Vorschauseiten `tiere.html`, `pflanzen.html`, `arsenal-preview.html`.

Zum Zurückholen einzelner Teile: Code aus `src/` hier in den neuen Aufbau (`src/farm/`) übernehmen und die Werte aus
`design/balancing.yaml` in die neue `balancing.yaml` eintragen.
