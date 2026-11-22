# Ladebilder (22.11.2026)

5 Hof-Renders für den Ladescreen (`public/loading/hof1..5_quer.jpg` / `_hoch.jpg`): Morgendunst, Mittag, Abendgold, 2× Nacht mit Laternen.

1. `npx vite --port 5173` laufen lassen (index.html während des Renderns nicht ändern, sonst lädt die Seite neu).
2. `node tools/loading-shots/shoot.cjs tools/loading-shots/shots.json pc 1.5` und `... handy 1.25` (nacheinander, Software-Rendering ~5 min pro Bild) -> `tools/loading-shots/out/`.
3. Postprocessing (weich, Glow, Tiefenunschärfe, Stimmung): `python3 tools/loading-shots/post.py out/1_morgen_pc.png public/loading/hof1_quer.jpg 1920 1080 morgen` (Stimmungen: morgen, mittag, abend, nacht; Handy 1080 1920).

Kameras + Felder (welche Früchte, reif/wachsend) stehen in `shots.json`.
