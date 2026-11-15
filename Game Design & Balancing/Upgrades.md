# PathOfGardening – Upgrades (Stand Prototyp-Port)

Alle Zahlen kommen aus `balancing.yaml` (Spalte „Parameter“). Was hier steht, ist nur die Übersicht; geändert wird in der YAML.

**Ziehung pro Stufe:** 3 Karten (`upgrades.offersPerLevel`). Freischalt-Karten haben Vorrang, der Rest wird gewichtet zufällig gezogen (Gewicht 1, „Neues Feld“ 1,6). Wenn nichts mehr übrig ist, gibt es Kräutertee. Im Koop wählt jeder Spieler eigene Karten; Felder und Doppelernte gelten für alle.

## 1. Felder

| Karte | Effekt | Bedingung | Parameter |
|---|---|---|---|
| Spargelfeld | Neues Beet, 1 Spargel alle 4 s. Schaltet das Spargelgewehr frei | Freier Slot, noch kein Spargelfeld | `plants.asp.interval`, `upgrades.newFieldWeight` |
| Preiselbeerfeld | Neues Beet, 1 Preiselbeere alle 1 s. Schaltet die Schrotflinte frei | Freier Slot, noch kein Preiselbeerfeld | `plants.cran.interval` |
| Kohlfeld | Neues Beet, 1 Kohlkopf alle 8 s. Schaltet die Kohlbombe frei | Freier Slot, noch kein Kohlfeld | `plants.cab.interval` |

Start: 3 Blaubeerfelder (`arena.startFields`), max. 6 Felder (`arena.fieldSlots`).

## 2. Waffen freischalten (Vorrang-Karten)

| Karte | Effekt | Bedingung | Parameter |
|---|---|---|---|
| Spargelgewehr | Durchbohrender Schuss: 15 Schaden, 5 m, 1 s, 1 Spargel pro Schuss | Feld vorhanden + 15 Spargel gesammelt | `skills.asp.*`, `plants.asp.unlockAt` |
| Preiselbeer-Schrotflinte | 6 Beeren im 60°-Fächer, je 3 Schaden + Blutung 1/s für 3 s, 3 m, 1,5 s, 6 Beeren pro Schuss | Feld + 60 Preiselbeeren | `skills.cran.*`, `plants.cran.unlockAt` |
| Kohlbombe | Wurf 3 m, Explosion nach 1 s: 5 Schaden, 1 m Radius, 1 s Betäubung, 1 Kohl pro Wurf | Feld + 8 Kohlköpfe | `skills.cab.*`, `plants.cab.unlockAt` |

Eine Waffe gilt als **bereit**, wenn Munition für 5 s Dauerfeuer da ist (`skills.readySeconds`). Unter dieser Schwelle feuert sie nur weiter, solange man sie hält.

## 3. Waffen-Upgrades (für jede freigeschaltete Waffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Schaden | +10 % Grundschaden (additiv) | – | `upgrades.damagePerLevel` |
| Reichweite / Radius | +10 % Reichweite (Kohlbombe: Explosionsradius) | – | `upgrades.rangePerLevel` |
| Abklingzeit | Abklingzeit × 0,9 (multiplikativ). Senkt auch die „bereit“-Schwelle | – | `upgrades.cooldownPerLevel` |

### Spargelgewehr

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Durchbohren | +1 durchbohrtes Ziel | 4 Ziele gesamt | `upgrades.aspPierce` |
| Durchbohr-Schaden | +5 Prozentpunkte Restschaden nach dem Durchbohren (Start 50 %) | 5 Stufen (75 %) | `upgrades.aspPierceBonus`, `skills.asp.pierceFactor` |

### Preiselbeer-Schrotflinte

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Projektil | 1 Beere mehr pro Schuss | 3 Stufen (9 Beeren) | `upgrades.cranPellets` |
| Beeren-Minen | +20 % Chance, dass eine Beere am Ende liegen bleibt und als Mine explodiert (15 s) | 5 Stufen (100 %) | `upgrades.cranMine`, `skills.cran.mineLifetime` |

### Kohlbombe

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Mini-Kohl | Nach der Explosion springt ein Mini-Kohl weg (halber Radius, halber Schaden) | 5 | `upgrades.cabMini`, `skills.cab.miniRadiusFactor`, `skills.cab.miniDamageFactor` |

## 4. Pflanzen

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Doppelernte (je Pflanze) | +15 % Chance, dass eine Ernte doppelt fällt | 6 Stufen (90 %) | `upgrades.doubleHarvest` |

## 5. Sonstiges

| Karte | Effekt | Wann | Parameter |
|---|---|---|---|
| Kräutertee | Heilt dich um 40, alle lebenden Felder um 25 | Nur wenn keine andere Karte mehr verfügbar ist | `upgrades.herbalTea` |

## Ohne Karte (fest)

| Was | Wert | Parameter |
|---|---|---|
| Harke | 10 Schaden, 60° Kegel, **150 cm** (vorher 100 cm), 0,5 s | `rake.*` |
| Verschmelzen | 10 gleiche Früchte → 1 größere (Wert 1 → 10 → 100) | `fruit.mergeCount`, `fruit.tierValue` |
