# PathOfGardening – Upgrades

Alle Zahlen kommen aus `balancing.yaml` (Spalte „Parameter“). Die Werte hier sind der Stand vom 15.11.2026; maßgeblich ist immer die YAML.

**Ziehung pro Stufe:** 3 Karten (`upgrades.offersPerLevel`). Freischalt-Karten haben Vorrang, der Rest wird gewichtet zufällig gezogen (Grundgewicht 1, Feld-Karten `upgrades.newFieldWeight`).
- **Wiederholung:** Jede Karte, die man schon genommen hat, kommt etwas häufiger: Gewicht × (1 + 0,25 × Anzahl genommen) (`upgrades.repeatWeight`).
- **Feld-Pause:** Nach einer Feld-Karte kommen für 5 Level-ups keine Feld-Karten (`upgrades.fieldCardPause`).
- Wenn nichts mehr übrig ist, gibt es Kräutertee.
- Im Koop wählt jeder Spieler eigene Karten. Felder und Doppelernte gelten für alle.

## 1. Felder

| Karte | Effekt | Parameter |
|---|---|---|
| Blaubeerfeld | 1 Blaubeere (XP) alle 1 s | `plants.blue.interval` |
| Spargelfeld | 3 Spargel alle 4 s (an einer Feldecke). Schaltet das Spargelgewehr frei | `plants.asp.interval`, `plants.asp.amount` |
| Preiselbeerfeld | 3 Preiselbeeren alle 1 s. Schaltet die Schrotflinte frei | `plants.cran.interval`, `plants.cran.amount` |
| Kohlfeld | 1 Kohlkopf alle 8 s. Schaltet die Kohlbombe frei | `plants.cab.interval` |

Feld-Karten gibt es für alle Typen, beliebig oft. Nach der Wahl öffnet sich die **Bauansicht von oben**, dort setzt man das Feld:

| Ziel | Ergebnis |
|---|---|
| Freier Platz | Neues Feld, Seltenheit Gewöhnlich |
| Feld eines anderen Typs (oder zerstörtes Feld) | Wird überbaut, neues gewöhnliches Feld |
| Feld desselben Typs | Fortschritt zur nächsten Seltenheit, Feld wird voll geheilt |

**Seltenheit:** Gewöhnlich → Ungewöhnlich → Selten → Episch → Legendär. Benötigte Felder pro Stufe: 1, 2, 3, 4 (`fields.rarityCost`).
- Produktion des Feldes × 1,5 je Stufe, multiplikativ (`fields.rarityProduction`): 1 / 1,5 / 2,25 / 3,4 / 5,1.
- Jedes angrenzende Feld bekommt +10 % Produktion je Seltenheitsstufe dieses Feldes, additiv (`fields.neighborBonus`).

Felder sind flach und 3 m groß (`arena.fieldSize`), liegen lückenlos im Hex-Raster, max. 20 Plätze (`arena.fieldSlots`). Start: 3 Blaubeerfelder. Wer mit dem Mittelpunkt auf einem Feld steht, heilt es um 1 HP/s (`fields.healPerSecond`).

## 2. Waffen freischalten (Vorrang-Karten)

| Karte | Effekt | Bedingung | Parameter |
|---|---|---|---|
| Spargelgewehr | Durchbohrender Schuss: 15 Schaden, 7,5 m, **0,25 s**, 30 cm breit, 1 Spargel pro Schuss | Spargelfeld + 15 Spargel gesammelt | `skills.asp.*`, `plants.asp.unlockAt` |
| Preiselbeer-Schrotflinte | **50°-Fächer, alle 10° eine Beere (6 Beeren)**, je 5 Schaden + Blutung 1/s für 3 s, 4,5 m, **0,75 s**, 6 Beeren pro Schuss | Preiselbeerfeld + 60 gesammelt | `skills.cran.*`, `plants.cran.unlockAt` |
| Kohlbombe | Wurf 0,5 m, Explosion nach 0,8 s: 5 Schaden, 1,8 m Radius, danach **Giftlache** (siehe unten), 1 Kohl pro Wurf | Kohlfeld + 8 gesammelt | `skills.cab.*`, `plants.cab.unlockAt` |

**Giftlache der Kohlbombe:** bleibt 3 s liegen (Radius = Explosionsradius), tickt 2× pro Sekunde mit je 10 % des Kohlschadens, also insgesamt 60 %. Gegner darin sind 35 % langsamer. Parameter: `skills.cab.poolDuration`, `poolTicksPerSecond`, `poolTickDamage`, `poolSlow`. Keine Betäubung mehr.

Eine Waffe gilt als **bereit**, wenn Munition für 3 s Dauerfeuer da ist (`skills.readySeconds`).

## 3. Harke (Startwaffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Reichweite | +8 % Reichweite (Karte zeigt cm) | 10 | `upgrades.rakeRange` |
| Schaden | +10 % Schaden | 10 | `upgrades.rakeDamage` |
| Rückstoß | +10 cm Rückstoß je Treffer | 10 | `upgrades.rakeKnockback`, `rake.knockback` |

## 3b. Waffen-Upgrades (für jede freigeschaltete Waffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Schaden | +10 % Grundschaden (additiv) | – | `upgrades.damagePerLevel` |
| Reichweite / Radius | +10 % Reichweite (Kohlbombe: Explosions- und Lachenradius) | – | `upgrades.rangePerLevel` |
| Abklingzeit | Abklingzeit × 0,9 (multiplikativ) | – | `upgrades.cooldownPerLevel` |

### Spargelgewehr
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Durchbohren | +1 durchbohrtes Ziel | 4 Ziele gesamt | `upgrades.aspPierce` |
| Durchbohr-Schaden | +10 Prozentpunkte Restschaden (Start 50 %, max. 100 %) | 5 Stufen | `upgrades.aspPierceBonus` |
| Geschossgröße | Geschoss +30 % breiter | 5 Stufen | `upgrades.aspSize`, `skills.asp.width` |

### Preiselbeer-Schrotflinte
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Projektil | 1 Beere mehr pro Schuss, Fächer 10° breiter | 3 Stufen | `upgrades.cranPellets` |
| Beeren-Minen | +20 % Chance, dass eine Beere als Mine liegen bleibt (15 s) | 5 Stufen | `upgrades.cranMine` |

### Kohlbombe
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Mini-Kohl | Nach der Explosion springt ein Mini-Kohl weg (Radius × 0,9, Schaden × 0,5), hinterlässt auch eine Giftlache | 5 | `upgrades.cabMini`, `skills.cab.miniRadiusFactor`, `miniDamageFactor` |

## 4. Pflanzen

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Doppelernte (je Pflanzentyp) | +25 % Chance auf doppelte Ernte | 4 Stufen (100 %) | `upgrades.doubleHarvest` |

### Feldpflege
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Feldpflege | Beackern heilt das beackerte Feld um +1 HP/s je Stufe. Ziehgewicht 1,2 (+20 %) | 5 | `upgrades.tillHeal` |

## 5. Sonstiges

| Karte | Effekt | Wann | Parameter |
|---|---|---|---|
| Kräutertee | Heilt dich um 40, alle lebenden Felder um 25 | Nur wenn wirklich keine andere Karte mehr gezogen werden kann | `upgrades.herbalTea` |

## Ohne Karte (fest)

| Was | Wert | Parameter |
|---|---|---|
| Harke | 10 Schaden, 90° Kegel, 1,8 m, 0,5 s. Auf ein Feld 1 m voraus: beackern statt schlagen | `rake.*`, `fields.till*` |
| Verschmelzen | 10 gleiche Früchte → 1 größere (Wert 1 → 10 → 100) | `fruit.mergeCount`, `fruit.tierValue` |
