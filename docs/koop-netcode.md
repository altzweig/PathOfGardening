# Koop-Netcode Classic (25.11.2026)

Ziel: Koop fühlt sich für jeden Gast so direkt an wie Solo, mit wenig Bandbreite und ohne Desyncs. Solo bleibt unverändert.

## Ausgangslage (PR #122)

- Host simuliert mit den Render-FPS, schickt 20-mal pro Sekunde einen **vollen JSON-Snapshot** über einen zuverlässigen Kanal.
- Gast schickt Eingaben ohne Nummer, zeigt Host-Snapshots mit weichem Nachziehen. Die eigene Figur bewegt sich erst, wenn der Host geantwortet hat: **Ping + bis 50 ms Verzögerung**.
- Gemessen: 4 Spieler 85 bis 147 KB/s pro Gast (über 30 Wellen im Mittel 147 KB/s), Host-Upload ca. 3,5 Mbit/s.
- Verbindungsabbruch = Gast fliegt raus. Speichern nur solo.

## Plan und Reihenfolge

| # | Schritt | Risiko | Gegenmaßnahme |
|---|---|---|---|
| 1 | Messskript mit Netzwerk-Simulator (`classic/tools/perf/netcode.ts`) | Messung weicht vom Browser ab | gleicher Sync-Code wie im Spiel, zusätzlich Browsertest |
| 2 | Bewegung als gemeinsame Funktion (`src/sim/move.ts`) für Sim und Vorhersage | Solo ändert sich | Bot-Lauf mit festem Zufall vorher/nachher identisch (`tools/perf/solo-gleich.ts`) |
| 3 | Binärprotokoll + Delta-Snapshots mit Baseline-ACK (`src/net/proto.ts`) | falsch zusammengesetzter Zustand | Prüfsumme (Hash) jede Sekunde, bei Abweichung sofort Vollsnapshot |
| 4 | Zwei Binärkanäle (unzuverlässig/zuverlässig) | Browser ohne verhandelte Kanäle | Rückfall auf den bestehenden JSON-Kanal (Base64) |
| 5 | Feste 30-Hz-Simulation beim Host, Senden mit 20 Hz | Host sieht bis 33 ms alt | Host zeichnet zwischen den Ticks interpoliert, eigene Figur sofort |
| 6 | Vorhersage + Abgleich der eigenen Figur, Interpolation der anderen | Ruckeln bei Korrektur | unter 0,5 m weich über 100 ms, darüber Sprung |
| 7 | Lag Compensation (Rückrechnen bis 200 ms) | Treffer "um die Ecke" | Begrenzung auf 200 ms, nur Angriffe im Tick des Schusses |
| 8 | Reconnect 30 s, Koop-Spielstand | doppelte Figuren | Token pro Gast, Figur wartet "geparkt" |

## Umsetzung

**Ticks.** Im Koop rechnet der Host feste 30 Schritte pro Sekunde (`net.simHz`), unabhängig von den FPS, und schickt 20 Snapshots pro Sekunde (`net.sendHz`). Zwischen zwei Ticks zeichnet er interpoliert, die eigene Figur mit der Bewegung seit dem letzten Tick. Solo läuft unverändert mit den Render-FPS.

**Binärprotokoll** (`src/net/proto.ts`). Positionen als int16 im 1-cm-Raster, Winkel als uint8, Anteile (HP, Fortschritt) als uint8, Ids als Varint. Alles andere (privater Teil, Händlerkarten) verlustfrei mit einem kleinen Tag-Format. Der Host rechnet den Snapshot zuerst in genau die Werte um, die der Gast dekodiert ("Q"); Deltas und Hash vergleichen diese Werte.

**Delta-Snapshots.** Jeder Snapshot geht als Differenz zum neuesten Snapshot, den der Gast bestätigt hat (die Bestätigung steckt in jedem Eingabepaket). Pro Zeile nur die geänderten Felder (Bitmaske). Spätestens alle 2 s (`net.fullEvery`) und auf Anfrage ein Vollsnapshot.

**Interest Management.** Zeiten, die jeden Tick wachsen, gehen als feste Zeitpunkte: Mehlwolken mit Entstehungszeit, liegende Kohlminen mit Verfallszeit. Eine liegende Mine oder treibende Wolke kostet nach ihrem ersten Auftauchen nichts mehr. Partikel und Sounds berechnet jeder Client selbst aus den Ereignissen.

**Kanäle** (`src/net/net.ts`). Auf derselben WebRTC-Verbindung: PeerJS-JSON für Lobby und Wahlen, `pog-u` (`ordered:false, maxRetransmits:0`) für Snapshots und Eingaben, `pog-r` (zuverlässig) für Ereignisse wie Schuss, Treffer, Ernte und Händlerkauf. Die Kanäle sind per Id verhandelt, ohne zusätzliches Signalling.

**Vorhersage** (`src/net/sync.ts`, `src/sim/move.ts`). Der Gast schickt 30 Eingaben pro Sekunde mit Sequenznummer (jedes Paket wiederholt die letzten 5). Er bewegt seine Figur sofort mit derselben Bewegungsfunktion wie die Sim. Jeder Snapshot enthält den exakten Bewegungszustand und die zuletzt benutzte Eingabe; der Gast setzt sich darauf und spielt die noch offenen Eingaben neu ab. Abweichungen unter 0,5 m werden über 100 ms weich angeglichen. Bei Stun, Rückstoß oder Tod führt der Host.

**Interpolation.** Andere Figuren, Tiere, Geschosse und Früchte zeigt der Gast 100 ms in der Vergangenheit, zwischen zwei Snapshots gemischt. Fehlt ein Paket, wird höchstens 250 ms weitergerechnet. Ereignisse kommen mit ihrem Tick und werden abgespielt, wenn das Bild den Tick erreicht.

**Lag Compensation.** Jedes Eingabepaket nennt den Tick, den der Gast gerade sieht. Der Host merkt sich die Tierpositionen der letzten Ticks und rechnet für die Angriffe dieses Gastes die Tiere bis zu 200 ms zurück (Rechenschlag, Flamme, Zielhilfe). Geschosse fliegen danach in der Gegenwart weiter.

**Robustheit.** Reißt die Verbindung ab, wartet die Figur 30 s (`net.reconnectWindow`); der Gast verbindet sich selbst neu und bekommt über sein Token dieselbe Figur und einen Vollsnapshot. Danach wird die Figur geparkt und kommt zurück, wenn der Gast später wieder beitritt. Der Host speichert Koop-Spiele wie Solo (Autosave, Pausemenü); in der Spielstände-Liste sind sie mit Figuren-Symbolen markiert. Beim Laden öffnet sich die Lobby, jeder Gast bekommt seine Figur zurück.

**Host-Migration (vorbereitet, nicht gebaut).** Was dafür schon da ist: der ganze Spielzustand ist als Spielstand serialisierbar (`save.ts`), jeder Spieler hat ein Token, die Tick-Zählung ist durchgehend. Was fehlt: der Host müsste den Spielstand alle paar Sekunden zuverlässig an einen Nachfolger (niedrigste Spieler-Id) schicken, der bei Verbindungsverlust einen neuen Raumcode öffnet und die anderen über einen vorher verteilten Code einsammelt.

## Messwerte

Messung: `classic/tools/perf/netcode.ts`, echter Host mit Balancing-Bot, Gäste laufen und schießen per Skript, Netz simuliert mit Ping 150 ms, Jitter 20 ms, 5 % Verlust (Werte in Klammern: Ziel).

| | vorher (PR #122) | nachher |
|---|---|---|
| Bandbreite pro Gast, 4 Spieler, 30 Wellen | 147 KB/s | **19,6 KB/s** Mittel (< 30), **48,2 KB/s** Spitze (< 60) |
| Bandbreite pro Gast, 2 Spieler | 60 bis 120 KB/s | 13,9 KB/s Mittel, 45,4 KB/s Spitze |
| Host-Upload bei 4 Spielern | ca. 3,5 Mbit/s | ca. 0,5 Mbit/s |
| Eigene Bewegung des Gastes | Ping + bis 50 ms | im selben Frame (99,7 % der Richtungswechsel) |
| Desyncs über 31 Wellen | nicht messbar | **0** von 6158 Hash-Prüfungen |
| Host-Logik pro Tick, 4 Spieler | < 1 ms | 1,0 ms Mittel (< 2) |
| Fehler der interpolierten Tiere | - | 0,4 cm im Mittel |

Browsertest (`classic/tools/perf/netcode-browser.cjs`, Host + Gast in zwei Chromium mit `?netsim=100,20,5`): Hash immer gleich, Reconnect nach 1,1 s mit derselben Figur, eigene Figur reagiert im gleichen Frame wie solo. Koop-Spielstand: `classic/tools/perf/netcode-save.cjs`. Solo unverändert: `classic/tools/perf/solo-gleich.ts` gibt auf main und nach dem Umbau exakt dasselbe aus.

Alle Netzwerkparameter: `balancing.yaml` unter `net`. Zum Testen im Browser: `?netsim=ping,jitter,verlust` (z. B. `?netsim=150,20,5`) an beiden Seiten.
