# Koop-Besuche auf dem Hof: Einschätzung (22.11.2026)

Bastis Wunsch: Man lädt jemanden auf seinen Hof ein. Der Gast kommt mit eigener Figur (vom eigenen Hof oder ohne Hof mit Level 1), macht tagsüber und nachts alles mit, bekommt XP für seine Arbeit, aber die Erträge gehen an den Hofbesitzer. Im Buch darf der Gast alles ansehen, aber nichts verwalten.

**Kurzfazit:** Mittel bis hoch komplex, aber gut machbar. Das Netz-Fundament gibt es schon (Archiv), die eigentliche Arbeit ist, die aktuelle Hof-Simulation von "ein Spieler" auf "mehrere Spieler" umzubauen. Grob vier Etappen, jede als eigener PR spielbar/testbar.

## Was schon da ist

- `archiv/garden-defence-v1/src/net/net.ts`: Koop über WebRTC mit PeerJS. Läuft auf GitHub Pages ohne eigenen Server (der öffentliche PeerJS-Broker macht nur den Handshake, Spieldaten gehen direkt von Browser zu Browser). Host-Autorität: Host simuliert, Gäste schicken Eingaben und zeigen Host-Snapshots an. Raumcode aus 5 Zeichen, max. Spielerzahl, Lobby mit Figur-Look.
- `peerjs` ist noch in `package.json`.
- `src/look.ts`: Figur-Look ist schon netzwerktauglich (`cleanLook` säubert fremde Daten).
- Archiv-`balancing.yaml` hatte `coop:` mit Skalierungs-Exponenten (Gegnerzahl, HP, XP-Bedarf).
- Buch hat schon einen Nur-Lesen-Modus (tagsüber per Taste B: kein Schlafen, Abholen, Bauen, Feldwahl). Den kann der Gast fast 1:1 nutzen.

## Was gebaut werden muss

### 1. Simulation für mehrere Spieler (größter Brocken)
`DaySim` (`src/farm/sim.ts`) kennt genau einen `player`. Das zieht sich durch Sim, Eingabe, Ansicht, Kamera, Tutorial und Tier-KI.
- `player` → `players[]` mit eigener Aktion, Kampf, HP, Stun, Arbeitspause.
- Tiere wählen ihr Ziel unter allen Spielern (nächster/schwächster), Hasen fliehen vor allen, `visible()` gilt für alle.
- Zwei Spieler am selben Feld/Busch: Ziel wird reserviert, der zweite bekommt "belegt" oder hilft beim gleichen Schritt mit (Entscheidung, s. u.).
- Ereignisse (`ev`) bekommen einen Spieler-Bezug, damit Sounds/Popups beim Richtigen landen.
- XP-Buchung pro Spieler statt direkt in `FarmState.xp`.
- Ohnmacht pro Spieler statt "Tag vorbei".
- Pause: Im Koop darf weder Esc-Pause noch Buch die Zeit anhalten.

### 2. Netzwerk
- PeerJS-Klassen aus dem Archiv zurückholen und auf das neue Protokoll anpassen.
- **Einladung:** Host klickt "Hof öffnen" → Code + Link `…/PathOfGardening/?hof=ABCDE` (teilbar per WhatsApp). Gast öffnet Link → wählt eigenen Hof (bringt Figur + Level/XP mit) oder "ohne Hof" (Level 1, aktuelle Figur).
- **Beitrittsanfrage:** Host bestätigt jeden Gast ("Mia möchte deinen Hof besuchen"), weil Codes erratbar sind.
- **Protokoll:** Gast → Host: Eingaben (Bewegung, Kontextaktion, Angriff, Blickrichtung). Host → Gast: schnelle Snapshots (Spieler, Tiere, Schüsse, Beute, Feldfortschritt, ca. 15–20/s) + langsame Zustandsupdates nur bei Änderung (Lager, Felder, Gebäude, Aufträge, Level, Tag/Nacht-Phase).
- **Gefühl beim Gast:** Eigene Bewegung lokal vorhersagen (sonst fühlt sich Laufen mit 50–150 ms Verzögerung schwammig an), alles andere interpolieren. Das hatte das Archiv noch nicht.
- Beitritt mitten am Tag (Gast bekommt vollen Zustand), Verbindungsabbruch, Wiederbeitritt.
- Host geht → Besuch endet für alle (kein Host-Wechsel, denn der Hof gehört dem Host).

### 3. Spielstände und Rechte
- Nur der Host speichert den Hof. Gäste schreiben nie in den Hof.
- Gast-XP: Host meldet dem Gast laufend "+X XP", der Gast bucht sie in seinen eigenen Spielstand (beim Tagesende und beim Verlassen speichern).
- Buch beim Gast: alle Seiten sichtbar, live mit dem Host-Zustand, alle Knöpfe aus (Nur-Lesen-Modus wiederverwenden).
- Abend: Host verwaltet, Gast blättert mit. Der Gast sieht, was der Host baut/abholt, sobald es passiert.

### 4. Darstellung/UI
- Mehrere Figuren mit Namensschild, eigene Kamera pro Client.
- HUD des Gastes: eigene HP/XP/Level, Hof-Lager vom Host.
- Lobby/Einladungs-Screens (PC + Mobile), Hinweis "Verbindung verloren".

## Implikationen

### Performance
- **Host-CPU:** Die Hof-Sim ist billig (ein ganzer Tag läuft mit `fast()` in Sekundenbruchteilen). 4 Spieler fallen in der Sim kaum ins Gewicht.
- **Rendering:** Teurer sind die zusätzlichen Figuren (Skinned Mesh + IK in `farmer.ts`). Bei 4 Spielern + Nachtwelle merkt man das auf schwachen Handys. Gegenmittel: IK für fremde Figuren vereinfachen, `?q=niedrig`-Pfad.
- **Bandbreite:** Mit kompakten Snapshots (Arrays wie im Archiv) grob 2–4 KB pro Snapshot → 30–80 KB/s pro Gast vom Host. Bei 3 Gästen muss der Host das dreifach hochladen. WLAN und LTE ok, schwaches Mobilnetz grenzwertig. Deshalb die Trennung schnelle Snapshots / seltene Zustandsupdates.
- **Verbindbarkeit:** WebRTC ohne TURN-Server scheitert bei manchen Netzen (ca. 10–15 %, oft strenge Firmen- oder Mobilfunk-NAT). Lösung später: kostenloser TURN-Dienst (z. B. Cloudflare/Metered Free Tier).
- **Mobile im Hintergrund:** Wenn der Host am Handy die App wechselt, drosselt der Browser den Tab und der Besuch hängt. Am PC hosten ist zuverlässiger.

### Gameplay
- Keine Pause mehr, sobald Gäste da sind (Buch und Esc laufen weiter).
- Ohnmacht: Heute beendet eine Ohnmacht den Tag mit Worst-Case + Cutscene. Im Koop wäre das bei einem einzelnen umgekippten Gast zu hart für alle.
- Tutorial bleibt Einzelspieler.
- Werkzeug/Waffe: Gast braucht Schrotflinte + Munition. Wenn die aus dem Host-Lager kämen, kostet Helfen den Host etwas.
- Gast-Level spielt auf fremdem Hof kaum eine Rolle (Freischaltungen hängen am Hof-Level). Das ist gut: kein Balancing-Problem durch Level-10-Gäste auf Level-2-Höfen.

### Balancing
- **Ertrag:** Zwei Spieler ernten fast doppelt so schnell. Die Feldzahl begrenzt das aber (3 Felder + Busch zu zweit ist schnell "leergearbeitet"). Der Host kommt mit Hilfe deutlich schneller voran, das ist gewollt.
- **Host-XP:** Ernte-XP gehen an den, der erntet. Der Host levelt mit Gästen also eher langsamer, obwohl der Hof mehr Ertrag hat. Ein Teil der Gast-XP könnte zusätzlich an den Host gehen.
- **Aufträge:** Die Belohnung wird abends vom Host abgeholt. Unklar, ob Gäste dafür XP bekommen.
- **Nachtwellen:** Mehr Spieler machen die Nacht trivial. Wellengröße sollte mit Spielerzahl skalieren (Archiv-Ansatz: Anzahl × Spieler^0,5).
- **XP-Farming:** Ein Gast könnte auf einem großen Hof schnell XP sammeln und zu Hause dann höher leveln als sein Hof "verdient" hat (mehr Felder pro Level). Fair genug für ein Freundesspiel, aber eine Entscheidung.

### Sicherheit/Cheating
- Host-Autorität schützt den Hof: Gäste schicken nur Eingaben, der Host prüft Reichweite, Cooldowns und Rechte (das macht die Sim ohnehin).
- Ein Gast kann seine eigene XP lokal manipulieren. Das geht heute im Einzelspieler auch (localStorage) und ist egal.
- Codes sind erratbar → Host bestätigt jeden Beitritt.
- WebRTC verrät den Mitspielern die IP-Adresse. Normal bei P2P, für Freunde ok.
- Fremde Texte (Name, Look) werden gesäubert (`cleanLook`, Namenslänge).

## Etappen (grob)

1. **Mehrspieler-Sim lokal:** `players[]`, Tier-Ziele, Feld-Reservierung, Ohnmacht pro Spieler, XP pro Spieler. Testbar mit einem Bot-Spieler ohne Netz. *Größte Etappe, ca. 2 Sitzungen.*
2. **Netz + Einladung:** PeerJS zurück, Link/Code, Beitrittsanfrage, Snapshots, Interpolation, Bewegungsvorhersage. Ergebnis: zu zweit tagsüber spielbar. *Ca. 2 Sitzungen.*
3. **Nacht, Abend, Rechte, Spielstände:** Nachtwellen im Koop, Buch nur lesen, Abend gemeinsam, Gast-XP im eigenen Stand speichern, Abbruch/Wiederbeitritt. *Ca. 1–2 Sitzungen.*
4. **Balancing + Polish:** Skalierung in `balancing.yaml` (`coop:`), Handy-Test mit 3–4 Spielern, TURN falls nötig. *Ca. 1 Sitzung.*

## Entscheidungen für Basti (mit Empfehlung)

| # | Frage | Empfehlung |
|---|---|---|
| 1 | Wie viele Spieler? | Bis 4 erlauben, Balancing zuerst für 2 |
| 2 | Einladung | Link + 5-stelliger Code, Host bestätigt jeden Beitritt |
| 3 | Ohnmacht eines Spielers | Nur er ist 20 s k.o. und wacht am Haus auf. Worst-Case + Cutscene nur, wenn alle gleichzeitig k.o. sind |
| 4 | Zwei Spieler am selben Feld | Feld ist belegt, der zweite sucht sich ein anderes (einfach und klar) |
| 5 | Ernte-XP | An den, der erntet. Host bekommt zusätzlich 25 % der Gast-XP als "Hofbonus" |
| 6 | Tier-XP nachts | Volle XP an jeden, der das Tier getroffen hat |
| 7 | Auftrags-XP | Host voll, jeder anwesende Gast bekommt die gleichen XP (Kopie, nichts geht dem Host verloren) |
| 8 | Waffe/Munition des Gastes | Gast bekommt morgens dieselbe Tagesausrüstung, kostenlos, nicht aus dem Host-Lager |
| 9 | Nachtwellen | Tierzahl × Spieler^0,5, Tier-HP gleich |
| 10 | Gast ohne Hof | Ein "Wanderer"-Profil merkt sich Figur, Level und XP für weitere Besuche. Ein neuer Hof startet trotzdem bei Level 1 |
| 11 | Pause im Koop | Keine Pause, Buch und Esc laufen weiter |
| 12 | Hosten am Handy | Erlaubt, mit Warnsymbol, wenn der Host-Tab im Hintergrund war |
| 13 | Abend | Host entscheidet allein, wann geschlafen wird. Gäste sehen das Buch live mit |
