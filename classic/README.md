# PathOfGardening

Garten-Survival im Browser (Three.js, TypeScript, Vite). Solo oder Koop für bis zu 4 Spieler (WebRTC über PeerJS).

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
npm run dev
```

Dann die angezeigte Adresse öffnen (auch im WLAN vom Handy aus, `--host` ist aktiv).

## Balancing

Alle Stellschrauben stehen in **`Game Design & Balancing/balancing.yaml`**. Die Datei wird bei jedem Spielstart geladen; im Dev-Modus lädt das Spiel beim Speichern automatisch neu. Übersicht der Upgrades: `Game Design & Balancing/Upgrades.md`, Regeln und Begründungen: `Design-Entscheidungen.md`. Fortschritt über Werkbank und Techtree (`progression: research`, Auftrag und Umsetzungsstand: `Werkbank-Techtree-Prompt.md`); der alte XP-Ablauf bleibt mit `progression: xp`.

Balancing-Bot: `tools/balance` (README dort). Weitere Prüfwerkzeuge (in `classic/` mit `npx esbuild <datei> --bundle --platform=node --format=cjs --outfile=<datei>.cjs` bauen, dann mit `node` starten):
- `tools/coop/research-net.ts` – Koop-Netcode für Werkbank, Techtree und Mauer (Host + Gast über simuliertes Netz)
- `tools/coop/browser-research.cjs` – dasselbe in zwei echten Browsern (Vite auf :5174, lokaler PeerJS-Server)
- `tools/save/save-test.ts` – Spielstände (speichern/laden, Laden beim Platzieren, alter XP-Spielstand)
- `tools/balance/trace.ts` – ein Bot-Lauf mit einer Zeile je 10 s Spielzeit

## Auf GitHub Pages veröffentlichen

1. Repository auf GitHub anlegen und diesen Ordner pushen (Branch `main`).
2. Auf GitHub: *Settings → Pages → Source: GitHub Actions*.
3. Jeder Push auf `main` baut und veröffentlicht automatisch (`.github/workflows/deploy.yml`).

## Projektstruktur

- `src/sim` – Spiellogik (läuft beim Host bzw. solo), erzeugt Snapshots
- `src/view` – Three.js-Darstellung der Snapshots
- `src/input` – PC- und Touch-Eingabe
- `src/net` – Koop (PeerJS)
- `src/ui` – HUD, Karten, Steuerungsseite
- `prototype_original.html` – der ursprüngliche Prototyp als Referenz

## Sounds

- Rohaufnahmen: `sfx/<zweck>/`, ungenutzte in `sfx/unused/` (werden nicht ausgeliefert)
- Geschnittene Clips: `public/audio/` (werden ausgeliefert)
- Zuordnung zu Spielereignissen: `Game Design & Balancing/sounds.yaml`
- Neu schneiden: `npm run dev`, dann in der Browser-Konsole
  `const T = await import('/tools/sfx-tool.js'); await T.load(); await T.cut('name', 'datei.wav', start, ende)`

## Credits

Fremde Assets (Autor, Links, Lizenz) stehen in [`CREDITS.md`](CREDITS.md) und im Spiel unter *Optionen → Credits*.
