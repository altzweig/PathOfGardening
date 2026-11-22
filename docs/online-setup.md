# Freunde online: Supabase einrichten (22.11.2026)

Das Spiel läuft ohne Supabase wie bisher (Besuch per Code/Link). Mit Supabase kommt im Hauptmenü **Freunde** dazu:
eigener Freundescode, Freunde per Code hinzufügen, wer online ist und wessen Hof offen ist, Besuchsanfrage mit einem Tipp.
Spielstände bleiben lokal im Browser. Supabase kennt nur Name, Level, Freundescode, Freundschaften und Besuchsanfragen.

## Einmalig (ca. 10 Minuten)
1. Auf https://supabase.com ein kostenloses Projekt anlegen (Region Frankfurt).
2. **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → *Run*.
3. **Authentication → Sign In / Providers** → *Allow anonymous sign-ins* einschalten.
4. **Project Settings → API**: *Project URL* und den *anon public* Key kopieren und an Claude schicken
   (oder selbst `public/online.json` anlegen):
   ```json
   { "url": "https://xxxx.supabase.co", "anonKey": "eyJ..." }
   ```
   Der anon Key ist öffentlich gedacht, die Daten schützt Row Level Security aus `schema.sql`.
5. Optional: **Database → Extensions** `pg_cron` einschalten und die letzte Zeile in `schema.sql` ausführen (räumt alte Anfragen nachts auf).

## Wie es läuft
- Jeder Browser bekommt ein anonymes Konto (Schlüssel `pog-online-auth` im localStorage). Anderes Gerät = anderes Konto
  mit eigenem Freundescode. Später lässt sich E-Mail/Google an das Konto hängen.
- Online-Status über Supabase Presence. Ein Hof ist **offen**, solange der Besitzer im Pausemenü unter *Besuch* den Hof geöffnet hat.
- Besuchen: Freund tippt bei dir auf das Haus → du bekommst oben die Anfrage → ✓ schickt Raumcode + Einmal-Ticket zurück →
  der Freund verbindet sich direkt (WebRTC/PeerJS) und kommt ohne zweite Nachfrage rein.
- Anfragen sind laut RLS nur unter Freunden möglich, nur der Gastgeber kann sie annehmen.

## Noch offen
- TURN-Server für strenge Mobilnetze: `VITE_TURN_URL`, `VITE_TURN_USER`, `VITE_TURN_PASS` beim Build (z. B. Cloudflare Calls TURN, Metered).
- Keine Bestenliste und keine Cloud-Spielstände (Entscheidung 22.11.2026).
