# PathOfGardening – Upgrades

Alle Zahlen kommen aus `balancing.yaml` (Spalte „Parameter“). Die Werte hier sind der Stand vom 15.11.2026; maßgeblich ist immer die YAML.

**Ziehung pro Stufe:** 3 Karten (`upgrades.offersPerLevel`). Freischalt-Karten haben Vorrang, der Rest wird gewichtet zufällig gezogen (Grundgewicht 1, Feld-Karten `upgrades.newFieldWeight`).
- **Wiederholung:** Jede Karte, die man schon genommen hat, kommt etwas häufiger: Gewicht × (1 + 0,25 × Anzahl genommen) (`upgrades.repeatWeight`).
- **Aufteilung:** pro Level-up 1 Feld-Karte (vorhandener Typ, Doppelernte oder Feldpflege) + höchstens 2 Waffen-Karten. Alle 5 Level stattdessen 2 neue Feldtypen zur Wahl (`upgrades.fieldCardsPerLevel`, `weaponCardsMax`, `newFieldTypeEvery`, `newFieldTypeChoices`).
- **Feste Start-Upgrades:** 1. Level-up = 2 neue Feldtypen zur Wahl, alternativ ein weiteres Blaubeerfeld. 2. Level-up = die Waffe zum neuen Feld (ohne Sammel-Bedingung) bzw. Harken-Verbesserungen (`upgrades.firstUpgradeNewField`, `secondUpgradeWeapon`).
- Wenn nichts mehr übrig ist, gibt es Kräutertee.
- Im Koop wählt jeder Spieler eigene Karten. Felder und Doppelernte gelten für alle.

## 1. Felder

| Karte | Effekt | Parameter |
|---|---|---|
| Blaubeerfeld | 1 Blaubeere (XP) alle 1 s | `plants.blue.interval` |
| Spargelfeld | 3 Spargel alle 4 s (an einer Feldecke). Schaltet die Spargel-Armbrust frei | `plants.asp.interval`, `plants.asp.amount` |
| Preiselbeerfeld | 3 Preiselbeeren alle 1 s. Schaltet die Schrotflinte frei | `plants.cran.interval`, `plants.cran.amount` |
| Kohlfeld | 1 Kohlkopf alle 3,2 s. Schaltet die Kohlbombe frei | `plants.cab.interval` |
| Zitronenbäumchen | 1 Zitrone alle 3 s, bei jeder Ernte zuckt ein Blitz zwischen den Früchten. **Erst ab Level 10** als neuer Feldtyp. Schaltet den Citrateaser frei | `plants.lemon.*` |
| Chilifeld | 1 Chili alle 0,5 s, die Chilis leuchten leicht rot, das Beet glüht bei jeder Ernte wie Lava auf (atmet). **Erst ab Level 10** als neuer Feldtyp, Alternative zum Zitronenbäumchen. Schaltet den Flammenwerfer frei | `plants.chili.*` |

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
| Spargel-Armbrust | Salve aus 3 durchbohrenden Spargel-Bolzen (0,1 s Abstand), dann Pause: 15 Schaden, 7,5 m, **0,75 s pro Salve** (Ø 4 Bolzen/s), 30 cm breit, 1 Spargel pro Bolzen | Spargelfeld + 15 Spargel gesammelt | `skills.asp.*`, `plants.asp.unlockAt` |
| Preiselbeer-Schrotflinte | **6 Beeren, zufällig gestreut (normalverteilt, max. 80°-Kegel, ca. 2/3 in den inneren 40°)**, je 5 Schaden + Blutung 1/s für 3 s, 7 m, **0,625 s**, 6 Beeren pro Schuss. Verfehlte Beeren bleiben 2 s liegen und platzen zu einem roten Fleck (50 % Schaden, 0,6 m Radius) | Preiselbeerfeld + 60 gesammelt | `skills.cran.*`, `plants.cran.unlockAt` |
| Citrateaser | Kettenblitz: trifft genau 1 Ziel (16 Schaden, 6 m, 1/s, 1 Zitrone), springt auf 2 Nachbarn (50 %), die je auf 2 weitere (25 %): max. 300 %. Das erste Ziel lässt seine Beute fallen | Zitronenbäumchen + 10 Zitronen | `skills.lemon.*` |
| Flammenwerfer | Chili-förmig. 30°-Flamme, 3,5 m, schwenkt 40° hin und her (links → rechts → zurück in 1,5 s). 8 Chilis/s. Jeder Treffer: 1 Sofortschaden + 1 Brand-Stapel (max. 6). Brennen: alle 0,5 s Stapel × 0,5 Schaden, erlischt 3 s nach dem letzten Treffer. Flächenbrand: stirbt ein brennender Gegner, springen die Hälfte seiner Stapel (mind. 1) auf Gegner im Umkreis von 1,5 m über | Chilifeld (wird beim nächsten Level-up garantiert angeboten) | `skills.chili.*` |
| Kohlbombe | Wurf 0,5 m, Explosion nach 0,8 s: 5 Schaden, 1,8 m Radius, danach **Giftlache** (siehe unten), 1 Kohl pro Wurf | Kohlfeld + 8 gesammelt | `skills.cab.*`, `plants.cab.unlockAt` |

**Giftlache der Kohlbombe:** bleibt 3 s liegen (Radius = Explosionsradius), tickt 2× pro Sekunde mit je 10 % des Kohlschadens, also insgesamt 60 %. Gegner darin sind 35 % langsamer. Parameter: `skills.cab.poolDuration`, `poolTicksPerSecond`, `poolTickDamage`, `poolSlow`. Keine Betäubung mehr.

Eine Waffe gilt als **bereit**, wenn Munition für 3 s Dauerfeuer da ist (`skills.readySeconds`).

## 3. Harke (Startwaffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Breite | +20 cm breitere Harke (Karte zeigt cm) | 10 | `upgrades.rakeWidth` |
| Reichweite | +20 cm weiter vor sich harken (Länge des Rechtecks, Karte zeigt cm) | 10 | `upgrades.rakeRange` |
| Schaden | +20 % Grundschaden | 10 | `upgrades.rakeDamage` |
| Tempo | Abklingzeit × 0,9 je Stufe: schneller schlagen und mehr Ertrag beim Harken | 5 | `upgrades.rakeSpeed` |

## 3b. Waffen-Upgrades (für jede freigeschaltete Waffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Schaden | +10 % Grundschaden (additiv) | – | `upgrades.damagePerLevel` |
| Reichweite / Radius | +10 % Reichweite (Kohlbombe: Explosions- und Lachenradius) | – | `upgrades.rangePerLevel` |
| Abklingzeit | Abklingzeit × 0,9 (multiplikativ; Armbrust: ganze Salve inkl. Bolzen-Abstand) | – | `upgrades.cooldownPerLevel` |

### Spargel-Armbrust
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Durchbohren | +1 durchbohrtes Ziel | 4 Ziele gesamt | `upgrades.aspPierce` |
| Durchbohr-Schaden | +10 Prozentpunkte Restschaden (Start 50 %, max. 100 %) | 5 Stufen | `upgrades.aspPierceBonus` |
| Geschossgröße | Geschoss +30 % breiter | 5 Stufen | `upgrades.aspSize`, `skills.asp.width` |

### Preiselbeer-Schrotflinte
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Projektil | 1 Beere mehr pro Schuss (Streuung bleibt gleich) | 3 Stufen | `upgrades.cranPellets` |
| Platzschaden | +10 Prozentpunkte Schaden liegender Beeren (50 → 100 %) | 5 Stufen | `upgrades.cranSplash` |

### Citrateaser
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Ziel | erst 3. Glied (je 3 statt 2), dann 2. Glied, dann 2 Hauptziele | 3 | `upgrades.lemonTargets` |
| Weiterleitung | +10 % (50 → 60 %, 2. Glied 25 → 36 %) | 4 | `upgrades.lemonTransfer` |

### Flammenwerfer
Keine Abklingzeit-Karte (fester Verbrauch 8 Chilis/s). Schaden-Karte: +20 % auf Sofort- und Brandschaden (1 → 1,2 und 0,5 → 0,6), Reichweite wie üblich.

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Zirkel | +30° Schwenk und +5° Flamme, ein Schwenk dauert weiter 1,5 s (also schneller). Ab 360° dreht die Flamme im Kreis, +50 % Tempo. Danach je Stufe +10° Flamme und +10 % Tempo (additiv) | bis die Flamme 360° breit ist (11 + 28 Stufen) | `upgrades.chiliSweep` |
| Brand-Tick | Brand-Tick × 0,8 (0,5 → 0,4 → 0,32 s …), also mehr Brandschaden pro Sekunde | bis 0,1 s (8 Stufen) | `upgrades.chiliTick` |

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
| Feldpflege | Beackern heilt Feld und Spieler: +1 HP/s je Stufe auf beide Werte (Grundwert je 1 HP/s). Ziehgewicht 1,2 (+20 %) | 5 | `upgrades.tillHeal`, `fields.tillHealField`, `fields.tillHealPlayer` |

## 5. Sonstiges

| Karte | Effekt | Wann | Parameter |
|---|---|---|---|
| Kräutertee | Heilt dich um 40, alle lebenden Felder um 25 | Nur wenn wirklich keine andere Karte mehr gezogen werden kann | `upgrades.herbalTea` |

## Ohne Karte (fest)

| Was | Wert | Parameter |
|---|---|---|
| Harke | 5 Schaden, Rechteck 1,2 m lang × 0,9 m breit vor dem Spieler, 0,5 s. Jeder Zug trifft Gegner und beackert alle Felder im Rechteck anteilig zur Fläche | `rake.*`, `fields.till*` |
| Verschmelzen | 10 gleiche Früchte → 1 größere (Wert 1 → 10 → 100) | `fruit.mergeCount`, `fruit.tierValue` |
