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

Alle Stellschrauben stehen in **`Game Design & Balancing/balancing.yaml`**. Die Datei wird bei jedem Spielstart geladen; im Dev-Modus lädt das Spiel beim Speichern automatisch neu. Übersicht der Upgrades: `Game Design & Balancing/Upgrades.md`, Regeln und Begründungen: `Design-Entscheidungen.md`.

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
