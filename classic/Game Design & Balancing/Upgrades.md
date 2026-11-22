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
| Feld eines anderen Typs | Wird überbaut, neues gewöhnliches Feld |
| Feld desselben Typs | Fortschritt zur nächsten Seltenheit, Feld wird voll geheilt |

**Seltenheit:** Gewöhnlich → Ungewöhnlich → Selten → Episch → Legendär. Benötigte Felder pro Stufe: 1, 2, 3, 4 (`fields.rarityCost`).
- Produktion des Feldes × 1,5 je Stufe, multiplikativ (`fields.rarityProduction`): 1 / 1,5 / 2,25 / 3,4 / 5,1.
- Jedes angrenzende Feld bekommt +10 % Produktion je Seltenheitsstufe dieses Feldes, additiv (`fields.neighborBonus`).

Felder sind flach und 3 m groß (`arena.fieldSize`), liegen lückenlos im Hex-Raster, max. 20 Plätze (`arena.fieldSlots`). Start: 3 Blaubeerfelder. Wer mit dem Mittelpunkt auf einem Feld steht, heilt es um 1 HP/s (`fields.healPerSecond`).

## 2. Waffen freischalten (Vorrang-Karten)

| Karte | Effekt | Bedingung | Parameter |
|---|---|---|---|
| Spargel-Armbrust | Salve aus 3 durchbohrenden Spargel-Bolzen (0,1 s Abstand), dann Pause: 15 Schaden, 7,5 m, **0,75 s pro Salve** (Ø 4 Bolzen/s), 30 cm breit, 1 Spargel pro Bolzen | Spargelfeld + 15 Spargel gesammelt | `skills.asp.*`, `plants.asp.unlockAt` |
| Preiselbeer-Schrotflinte | **6 Beeren, zufällig gestreut (normalverteilt, max. 80°-Kegel, ca. 2/3 in den inneren 40°)**, je 5 Schaden + Blutung 1/s für 3 s, 7 m, **0,625 s**, 6 Beeren pro Schuss. Verfehlte Beeren bleiben 2 s liegen und platzen zu einem roten Fleck (25 % Schaden, 0,6 m Radius) | Preiselbeerfeld + 60 gesammelt | `skills.cran.*`, `plants.cran.unlockAt` |
| Citrateaser | Zauberstab: schießt einen langsamen Kugelblitz (ca. 18 cm, 3,5 m/s, 6 m, 1/s, 1 Zitrone) geradeaus. Im Flug trifft er alle 0,25 s den nächsten Gegner in 0,5 m Umkreis mit 25 % Schaden. Direkttreffer: 20 Schaden (100 %), dann Kettenziele (Upgrade) mit je 50 %. Das direkt getroffene Tier lässt seine Beute fallen | Zitronenbäumchen + 10 Zitronen | `skills.lemon.*` |
| Flammenwerfer | Chili-förmig. 30°-Flamme, 3,5 m, schwenkt 40° hin und her (links → rechts → zurück in 1,5 s). 8 Chilis/s. Jeder Treffer: 1 Sofortschaden + 1 Brand-Stapel (max. 6). Brennen: alle 0,5 s Stapel × 0,5 Schaden, erlischt 3 s nach dem letzten Treffer. Flächenbrand: stirbt ein brennender Gegner, springen die Hälfte seiner Stapel (mind. 1) auf Gegner im Umkreis von 1,5 m über | Chilifeld (wird beim nächsten Level-up garantiert angeboten) | `skills.chili.*` |
| Kohlbombe | Aufladewurf: Gedrückthalten 1 s lädt auf, Weite 1,5–8 m; Explosion beim Aufkommen: 5 Schaden, 1,9 m Radius, danach **vergiftet** (siehe unten), 1 Kohl pro Wurf | Kohlfeld + 8 gesammelt | `skills.cab.*`, `plants.cab.unlockAt` |

**Gift der Kohlbombe (seit 17.11.2026, statt Giftlache):** getroffene Gegner sind 2 s vergiftet, alle 0,4 s 10 % des Explosionsschadens (insgesamt 50 %), 40 % langsamer. Parameter: `skills.cab.poisonDuration`, `poisonTick`, `poisonTickDamage`, `poisonSlow`; Wurf: `chargeTime`, `throwMin`, `throwMax`.

Eine Waffe gilt als **bereit**, wenn Munition für 3 s Dauerfeuer da ist (`skills.readySeconds`).

## 3. Harke (Startwaffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Durchmesser | Trefferkreis +20 cm Durchmesser (Karte zeigt cm) | unbegrenzt | `upgrades.rakeDiameter` |
| Reichweite | +20 cm maximale Ausdehnung (Karte zeigt cm) | unbegrenzt | `upgrades.rakeRange` |
| Schaden | +20 % Grundschaden | unbegrenzt | `upgrades.rakeDamage` |
| Tempo | Abklingzeit × 0,9 je Stufe: schneller schlagen und mehr Ertrag beim Harken | unbegrenzt | `upgrades.rakeSpeed` |

## 3b. Waffen-Upgrades (für jede freigeschaltete Waffe)

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Schaden | +10 % Grundschaden (additiv) | – | `upgrades.damagePerLevel` |
| Reichweite / Radius | +10 % Reichweite (Kohlbombe: Explosionsradius) | – | `upgrades.rangePerLevel` |
| Abklingzeit | Abklingzeit × 0,9 (multiplikativ; Armbrust: ganze Salve inkl. Bolzen-Abstand) | – | `upgrades.cooldownPerLevel` |

### Spargel-Armbrust
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Durchbohren | +1, +1, +1 durchbohrtes Ziel, letzte Stufe: alle Ziele | 4 Stufen | `upgrades.aspPierce` |
| Piercing Damage | +10 Prozentpunkte Restschaden (Start 50 %, max. 100 %); Karte: „Piercing Damage“, alter Wert, goldenes +10 % | 5 Stufen | `upgrades.aspPierceBonus` |
| Geschossgröße | +100 % additiv (100 → 500 %); Karte: alter Wert, goldenes +100 % | 4 Stufen | `upgrades.aspSize`, `skills.asp.width` |
| Salve | 4 / 5 / 7 / 9 / 12 Bolzen statt 3, in derselben Salvenzeit wie 3 Bolzen | 5 Stufen | `upgrades.aspSalvo` |

### Preiselbeer-Schrotflinte
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Mehr Beeren | +2 Beeren pro Schuss: 6 → 8/10/12/14/16 (Streuung bleibt gleich); Karte: alter Wert, goldenes +2 | 5 Stufen | `upgrades.cranPellets` |
| Durchbohren | Chance pro Beere, einmal durchzubohren: 0 → 20/40/60/80/100 %; Karte: alter Wert, goldenes +20 % | 5 Stufen | `upgrades.cranPierce` |
| Platzschaden | Schaden liegender Beeren 25 → 40/55/70/85/100 %; Karte: alter Wert, goldenes +15 % | 5 Stufen | `upgrades.cranSplash` |

### Citrateaser
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Kettenziele | nach einem Direkttreffer springt der Blitz auf 1/2/3/4/5 weitere Gegner (je 50 %, mit Schadenseffizienz bis 100 %, immer zum nächsten in 2,5 m); Karte: alter Wert, goldenes +1 | 5 | `upgrades.lemonTargets` |
| Rückblitz | Chance je Kettenziel, dass der Blitz zurück aufs Hauptziel springt (Ketten-Schaden): 20/40/60/80/100 %; Karte: „Rückblitz“, alter Wert, goldenes +20 % | 5 | `upgrades.lemonTransfer` |
| Schadenseffizienz | Ketten- und Rückblitz-Schaden 50 → 60/70/80/90/100 %; Karte: „Schadenseffizienz“, alter Wert, goldenes +10 % | 5 | `upgrades.lemonEfficiency` |
| (Standard) Reichweite | beim Citrateaser: Kugel und Tick-Radius +20 % je Stufe statt Flugweite (Karte zeigt Kugeldurchmesser in cm) | wie andere | `upgrades.rangePerLevel` |

### Flammenwerfer
Keine Abklingzeit-Karte (fester Verbrauch 8 Chilis/s). Schaden-Karte: +20 % auf Sofort- und Brandschaden (1 → 1,2 und 0,5 → 0,6), Reichweite wie üblich.

| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| Zirkel | +30° Schwenk und +5° Flamme, ein Schwenk dauert weiter 1,5 s (also schneller). Ab 360° dreht die Flamme im Kreis, +50 % Tempo. Danach je Stufe +10° Flamme und +10 % Tempo (additiv) | bis die Flamme 360° breit ist (11 + 28 Stufen) | `upgrades.chiliSweep` |
| Brand-Tick | Brand-Tick × 0,8 (0,5 → 0,4 → 0,32 s …), also mehr Brandschaden pro Sekunde | bis 0,1 s (8 Stufen) | `upgrades.chiliTick` |

### Kohlbombe
| Karte | Effekt | Max. | Parameter |
|---|---|---|---|
| +1 Mini-Kohl | Nach der Explosion springt ein Mini-Kohl weg (Radius × 0,9, Schaden × 0,5), vergiftet auch | 5 | `upgrades.cabMini`, `skills.cab.miniRadiusFactor`, `miniDamageFactor` |
| Kohlgas | Kohl-Treffer legen den Debuff „Kohlgas“ (so lange wie das Gift). Stirbt der Gegner damit, platzt er mit 10/20/30/40/50 % Chance und vergiftet alle Gegner im Umkreis von 1 m; Karte: „Kohlgas“, alter Wert, goldenes +10 % | 5 Stufen | `upgrades.cabGas`, `skills.cab.gasRadius` |
| Poison Damage | Gift-Tickschaden des Kohls +50 % je Stufe (100 → 350 %), auch Mini-Kohl und Kohlgas; Karte: „Poison Damage“, alter Wert, goldenes +50 % | 5 Stufen | `upgrades.cabPoison` |

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
| Harke | 5 Schaden, Trefferkreis 0,7 m Durchmesser, vordere Kante 1,2 m vor dem Spieler, 0,5 s. Zug nach links hinten, dann Stoß nach vorne: beim Aufprall Schaden, 0,5 s Stun, 0,3 m Rückstoß, beackert alle Felder im Kreis anteilig zur Fläche | `rake.*`, `fields.till*` |
| Verschmelzen | 10 gleiche Früchte → 1 größere (Wert 1 → 10 → 100) | `fruit.mergeCount`, `fruit.tierValue` |
