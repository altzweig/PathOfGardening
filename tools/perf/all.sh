#!/bin/bash
# Alle Szenen messen (Dev-Server muss laufen: npx vite --port 5173; Ladezeit: npm run build && npx vite preview --port 4173)
cd "$(dirname "$0")"
for s in menu day night buch abend editor; do SEC=6 node run.cjs pc $s 1; done
for s in menu day night buch abend editor; do SEC=6 node run.cjs handy $s 4; done
