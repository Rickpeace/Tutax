# Sofort-Aufnahme — Lückenliste (Stand: 22.09.2026, Extension v2.19.0)

**Frage des Produktinhabers:** „Welche wichtigen Bedienvorgänge erfasst die Sofort-Aufnahme
NICHT?"

**Wie das hier belegt ist:** kein Ratespiel. `scripts/test-capture-gaps.mjs` lädt die **echte**
`extension/content.js` (+ `guide-resolve.js`) headless in Chromium, führt je Muster **echte
Maus-/Tastatur-Ereignisse** aus und liest **alle** Panel-Nachrichten mit
(`steply-guide-step` / `-patch` / `-retract`). Jede Nachricht trägt zusätzlich eine **Probe**:
den Seitenzustand genau in dem Moment, in dem der Schritt gemeldet wird — und das ist exakt der
Moment, in dem die Seitenleiste den Screenshot auslöst (`extension/panel.js:3342`). Damit ist
auch der *Screenshot-Zeitpunkt* belegbar, ohne echte Bilder zu vergleichen.

```
node scripts/test-capture-gaps.mjs            # Bericht (Lücken sind KEIN Fehler)
node scripts/test-capture-gaps.mjs --strict   # prüft nur die unterstützten Muster -> Regressionsschutz
node scripts/test-capture-gaps.mjs --only=3.  # einzelne Mustergruppe
```

Fixtures: `scripts/fixtures/capture-controls.html`, `-keyboard.html`, `-scroll-nav.html`,
`-widgets.html`. Ergebnis des Laufs vom 22.09.2026 **nach Welle 55** (v2.19.0):
**60 erfasst · 3 teilweise · 5 nicht erfasst (68 Muster)** — vorher 45 · 6 · 11 (62 Muster).

Das Abschluss-Bild (L2, Variante A) entsteht im Panel und wird darum in
`scripts/test-guide-flow-panel.mjs` bewiesen (dort läuft die echte `panel.js`).

---

## 1. Was in Welle 55 **behoben** wurde (v2.19.0)

Freigegeben vom Produktinhaber: L1, L3, L4, L5, L6, L7 — dazu nachträglich L2 als
„Variante A: Abschluss-Bild". Alle neuen Schritt-Arten reisen über das bestehende
`interaction`-Feld (abwärtskompatibel: alte Server/Panels ignorieren Unbekanntes).

| # | Vorher | Jetzt | Beleg im Test |
| - | - | - | - |
| **L1** | Zurück-Knopf, F5, Weiterleitung, Adressleiste: **0 Schritte** — die Anleitung sprang von Seite A auf Seite B. | Ein Schritt **ohne Selektor** (`interaction.variant:"nav"`, `nav: back\|reload\|goto`) mit Screenshot der **neuen** Seite: „Zur vorigen Seite zurückgehen", „Seite neu laden", „Weiter zu „X"". Erkennung ohne neue Berechtigung: `performance…navigation.type` beim Laden, `pageshow(persisted)` für den bfcache, `popstate`/Ansichts-Abgleich (600 ms) für SPA-Routen. | 6.2 `nav=back`, 6.3 `nav=reload`, 6.3b `nav=goto` |
| **L1 (Gegenprobe)** | — | Folgt der Wechsel binnen **1,5 s** auf einen erfassten Schritt, entsteht **kein** zweiter Schritt (Klick auf einen Link = EIN Schritt). Ebenso kein Schritt für die Seite, die beim Aufnahmestart schon offen war. | 6.3c, 6.4 |
| **L3** | Strg-/Shift-Klick sah aus wie ein gewöhnlicher Klick (`interaction=null`) — die Auswahl ging verloren, Automationen wählten falsch. | `interaction.modifiers: ["ctrl","shift"]` (feste Reihenfolge ctrl→meta→alt→shift). Titel „Mit gedrückter Strg-Taste auf „Beleg 3" klicken"; die Wiedergabe schickt eine vollständige Maus-Sequenz **mit** den Modifikatoren statt `el.click()`. | 11.1, 11.2, 11.3, Gegenprobe 11.4 |
| **L4** | Pfeiltasten waren komplett ausgeschlossen: Menü per Pfeil-runter öffnen = 0 Schritte, Listen-Auswahl = 0 Schritte. | Pfeiltasten erzeugen einen Schritt, **wenn** danach ein Menü offen ist (`aria-expanded` false→true) oder sich die Auswahl in listbox/menu/menubar/combobox ändert. Mehrere Drücke werden **entprellt zu EINEM** Schritt (250 ms); jede andere Taste/jeder Klick schließt die Serie vorher ab (Reihenfolge stimmt). Der Schritt ist ein normaler Klick-Schritt auf den Menü-Knopf bzw. den gewählten Eintrag — **mit** Selektor, also automatisierbar. | 3.5, 3.6, Gegenprobe 3.5b |
| **L5 / L6** | Klick auf `<canvas>` oder in ein **geschlossenes** Shadow DOM: **0 Schritte** — die Aufnahme wirkte auf Google-Docs-artigen Seiten kaputt. | Schritt **ohne Selektor** (`variant:"spot"`) mit Markierung am **Klickpunkt** (56 px), Titel „Auf die markierte Stelle klicken" bzw. „In „X" auf die markierte Stelle klicken". Zweiter Druck auf dieselbe Stelle binnen 600 ms erzeugt keinen zweiten Schritt. | 8.2, 8.3, Gegenprobe 8.3b (Leerfläche → weiterhin kein Schritt) |
| **L7** | Doppelklick auf eine gewöhnliche Tabellenzelle (Excel-Muster) fiel dem Dead-Click-Filter zum Opfer. | Ein `dblclick` **innerhalb** von `td` / `[role=gridcell]` / `[role=cell]` wird nachgereicht (`variant:"double"`). **Bewusst NICHT** über eine „hat sich das DOM geändert"-Probe: ein Doppelklick auf Fließtext markiert nur ein Wort (und ändert je nach Seite trotzdem das DOM) — die Zellen-Regel ist deterministisch, ohne Timing, und trifft genau das gemeinte Muster. | 9.2 (neu grün), 9.2b unverändert |
| **L2 (Variante A)** | Der Screenshot entsteht im Moment des Klicks — das **Ergebnis des letzten Klicks** war in keiner Anleitung zu sehen. | Beim „Fertig" fotografiert das Panel **einmal** den Endzustand des aufgenommenen Tabs (700 ms Ruhe, max. 2 s, bestehendes captureVisibleTab-Ratenlimit) und hängt ihn als letzten Schritt an: ohne Selektor, ohne Markierung, Titel „Ergebnis". Entfernbar mit ✕, standardmäßig dabei. Nie bei 0 Schritten, nie beim Verwerfen, nie doppelt (Stopp→Weiter→Stopp), nie bei aktivem Aufnahme-Anker, und bei Fehlern (Tab zu, Kontingent) einfach ohne Bild weiter. | `test-guide-flow-panel.mjs` („Abschluss-Bild: …", 7 Prüfungen) |

**Schritte ohne Selektor in Führung und Automation** (nav / spot / result): Die bestehende
Mechanik trägt sie bereits — `lib/automations.ts` nimmt nur Schritte **mit** Selektor in eine
Automation auf (einzige Ausnahme: Tastenkürzel), diese Schritte fallen also automatisch heraus.
In der Live-Führung meldet `content.js` `found:false, reason:"no-selector"`; das Panel zeigt
statt eines Overlays den Screenshot-Hinweis, der Badge nennt die Handlung („Seite neu laden",
„Markierte Stelle im Bild", „Ergebnis"). Der KI-Feinschliff kennt alle neuen Arten
(`describeInteractionForAi`) und verwirft jede Umformulierung, die sie verliert
(`keepsInteraction`); das Abschluss-Bild geht gar nicht erst an die KI.

---

## 1b. Was in der Runde davor behoben wurde (v2.18.7)

| # | Lücke vorher | Behebung | Datei |
| - | - | - | - |
| B1 | **Reine Tastatur-Bedienung wurde komplett verschluckt**: Tab auf einen Knopf/Link/Kästchen und dann Enter bzw. Leertaste löste die Aktion aus — die Aufnahme sah **nichts** (die Erfassung hängt an `pointerdown`). Für Tastatur-Nutzer war die Aufnahme praktisch unbrauchbar. | Neuer, bewusst enger Pfad `keyboardActivate()`: Enter/Leertaste auf einem **fokussierten Bedienelement** (Knopf, Link, Kästchen, Radio, Schalter, Menüeintrag, Tab, Option, `summary`) erzeugt jetzt denselben Klick-Schritt wie ein Mausklick — inkl. Hover-Menü-Erkennung. Kein Doppel-Schritt möglich, weil der vom Browser erzeugte `click` kein `pointerdown` hat. Gegenprobe im Test: Leertaste ohne Bedienelement im Fokus (Scrollen) erzeugt weiterhin nichts. | `extension/content.js:2148-2194` (keyboardActivate), `:2196-2226` (onKeyDown) |
| B2 | **Farbwähler** (`input type=color`): es entstand ein Klick-Schritt *vor* dem Öffnen des Betriebssystem-Fensters — der Screenshot zeigte die **alte** Farbe, die gewählte Farbe tauchte nirgends auf. | Behandlung wie beim Schieberegler: kein Schritt beim Anfassen, stattdessen ein Schritt beim `change` — der Screenshot zeigt die **gewählte** Farbe. | `extension/content.js:1711ff` (pointerdown), `:2256ff` (change) |
| B3 | **Kontrollkästchen ohne Label** bekam den Titel „Klicken Sie auf **input**" — für eine Anleitung wertlos. Die vorhandene Beschriftungs-Suche schaut nur auf **vorangehende** Geschwister, der Text steht bei Kästchen aber fast immer **dahinter**. | `followingCaptionText()` (Gegenstück, gleich konservativ) + sprechende Not-Fallbacks „Kontrollkästchen"/„Auswahl"/„Schalter" statt des Tag-Namens. Im Test jetzt: „Ohne Label (nur Text daneben)". | `extension/content.js:695-762` |
| B4 | **Klick auf eine Feldbeschriftung** (`<label for=…>`, sehr häufig — das Kästchen ist winzig, man trifft das Label) bekam einen reinen Positions-Selektor `body > section:nth-of-type(9) > label`. Der bricht beim kleinsten Seiten-Umbau → Live-Führung/Automation findet die Stelle später nicht mehr. | `label[for="…"]` als stabiler Anker in `cssPathFor` (nur bei stabiler Ziel-Id, gleiche Prüfung wie bei `id`). | `extension/content.js:832ff` |

Alle Bestands-Tests weiterhin grün: `test-guide-capture`, `-capture-plus`, `-enter`,
`-interaction`, `-typed-capture`, `-toggle-capture`, `test-exec-plan`,
`test-welle48-review-fixes`. `test-capture-gaps.mjs --strict` läuft sauber durch.

---

## 2. Technisch **unmöglich** (Browser-/Betriebssystem-Grenze) — nicht behebbar

Diese Vorgänge finden **außerhalb der Webseite** statt. Kein Erweiterungs-Code der Welt sieht
sie; sie ließen sich auch nie abspielen. Sie gehören in die Anleitung als *Text*, nicht als
erfasster Schritt.

| Muster | Was der Nutzer merkt | Schwere | Beleg |
| - | - | - | - |
| Aufgeklapptes `<select>`, Datums-/Zeit-/Farbwähler, `<datalist>`-Vorschlagsliste | Die aufgeklappte Liste selbst ist nie im Bild. **Das Ergebnis wird erfasst** (gewählte Option/Datum/Farbe) — praktisch unkritisch. | niedrig | Test 1.1/1.2/1.3/1.4/1.5/1.7 |
| Datei-Dialog des Betriebssystems | Der „Durchsuchen"-Dialog fehlt im Bild. **Die gewählte Datei wird als eigener Schritt erfasst** (nur Metadaten), der vorherige Klick wird hineingefaltet. | niedrig | Test 1.9 (`foldPrevClick=true`) |
| `window.alert` / `confirm` / `prompt` | Der ausgelöste Dialog gehört dem Browser; sein „OK" erzeugt kein Ereignis. **Nur der auslösende Klick** wird zum Schritt — die Bestätigung selbst fehlt in der Anleitung. | mittel | Test 10.3/10.4 |
| Browser-Kontextmenü (Rechtsklick ohne eigenes Menü) | Der Schritt wird **absichtlich wieder zurückgenommen** (er wäre nicht abspielbar) — korrekt. | niedrig | Test 4.6 (`retract`) |
| Zurück-/Vorwärts-Knopf, Adressleiste, F5, Tab-Leiste, Lesezeichen | Den **Klick** sieht die Seite nie — seit v2.19.0 wird aber die **Ankunft** erfasst (L1), die Anleitung hat also keinen Sprung mehr. | gelöst | Test 6.2/6.3/6.3b |
| Druck-Dialog, Download-Fenster, Passwortmanager-Vorschlag des Browsers | Nicht im Bild. Bei Drucken wird immerhin **Strg+P als Schritt** erfasst. | niedrig | Test 10.5/7.3 |
| `chrome://`-Seiten, Chrome Web Store, PDF-Viewer, andere Programme | Dort läuft gar kein Content-Script → keine Erfassung. Das Panel zeigt dafür bereits den Hinweis „hier kann nicht aufgenommen werden". | mittel | `extension/manifest.json` (`matches: http/https`), `extension/panel.js:1809ff` |
| **Geschlossenes** Shadow DOM | Der Knopf bleibt für *jedes* Script unsichtbar. Seit v2.19.0 entsteht wenigstens ein Schritt mit Klickpunkt-Markierung (L6) — als Anleitung brauchbar, für Automationen nicht. | gelöst, soweit möglich | Test 8.2 |

---

## 3. **Behebbare** Lücken — Abhak-Liste

Die Spalten „Ergebnis"/„Auswirkung"/„Ursache"/„Aufwand" beschreiben den Befund der
Bestandsaufnahme; bei den mit ✅ markierten Zeilen ist er **Geschichte** (was stattdessen
passiert, steht in Abschnitt 1). Offen sind nur die Zeilen ohne ✅/◐.

| # | Muster | Ergebnis **heute** | Auswirkung für den Nutzer (ohne Technik) | Schwere | Ursache im Code (Befund) | Aufwand / Umsetzung |
| - | - | - | - | - | - | - |
| **L1** ✅ | **ERLEDIGT (v2.19.0)** — Seitenwechsel ohne Klick: Zurück-Knopf, F5, Weiterleitung, SPA-Route | **erfasst** | Die Anleitung springt: Schritt 4 zeigt Seite A, Schritt 5 plötzlich Seite B — dazwischen fehlt „Sie landen jetzt auf …". Besonders bei Anmelde-Umleitungen und beim Zurück-Knopf. | **hoch** | `extension/content.js` hat **keinen** Navigations-Lauscher (kein `popstate`, `hashchange`, `beforeunload`, kein `webNavigation` im Panel). Belegt: Test 6.2/6.3 → 0 Schritte. | mittel: „Seitenwechsel"-Schritt aus `popstate`/`pageshow`/`history`-Patch + Panel-seitig `chrome.tabs.onUpdated`; **kein** eigener Screenshot nötig, wenn nur ein Zwischentext entsteht. 0,5–1 Tag. |
| **L2** ◐ | **TEILWEISE GELÖST (v2.19.0, Variante A: Abschluss-Bild)** — Klick, Ergebnis erscheint erst nach 3 s | **teilweise** | Der Screenshot zeigt immer den Moment **vor** dem Klick. Das *Ergebnis* („12 Buchungen gefunden") ist in der ganzen Anleitung nie zu sehen — Leser sehen nie, worauf sie warten sollen. | **hoch** | Gewollter Entwurf: `emitStep` feuert auf `pointerdown` (`content.js:1711`, `:1258`), damit Bild + Markierung vor der Navigation entstehen. Belegt: Test 12.1 (`slowout="noch kein Ergebnis"`). | **Variante A (umgesetzt):** EIN Abschluss-Bild beim „Fertig" — das Ergebnis des LETZTEN Klicks ist damit im Bild. Offen bleibt das Ergebnis der Klicks MITTENDRIN. **Variante C (weiter als Vorschlag):** zweiter, später Screenshot pro Schritt; braucht Panel-Queue, Speicher- und Ratenlimit-Konzept (`panel.js:1325ff`). |
| **L3** ✅ | **ERLEDIGT (v2.19.0)** — Mehrfachauswahl per **Strg+Klick / Shift+Klick** | **erfasst** | Der Schritt sagt „Klicken Sie auf Beleg 3" — die gedrückte Strg-/Shift-Taste fehlt. Wer der Anleitung folgt, verliert die vorherige Auswahl. Beim automatischen Abspielen wird die Auswahl falsch. | **hoch** | `emitClick` (`content.js:1684ff`) übernimmt keine Modifikatoren; der Vertrag `interaction` kennt keinen Schlüssel dafür (`src/lib/guide.ts:189-225` verwirft Unbekanntes). Belegt: Test 11.1/11.2 (`interaction=null`). | mittel: neuer `interaction.variant`-Wert bzw. `interaction.modifiers`; **drei** Stellen (content.js → guide.ts-Validierung + Textbausteine → exec-plan/exec-run). 0,5 Tag. |
| **L4** ✅ | **ERLEDIGT (v2.19.0)** — Menü per **Pfeiltasten** bedienen (öffnen, durchgehen) | **erfasst** | Die Auswahl (Enter) ist seit v2.18.7 drin, das **Öffnen** per Pfeiltaste fehlt — die Anleitung springt mitten ins Menü, das der Leser noch gar nicht offen hat. Ebenso: Auswahl in einer Listbox per Pfeiltaste = gar nichts. | mittel | `NO_STEP_KEYS` schließt Pfeiltasten aus (`content.js:2076`). Belegt: Test 3.5 (0 Schritte), 3.6 (nur 1 von 2). | mittel: Pfeiltasten nur dann als Schritt, wenn sich `aria-expanded`/`aria-activedescendant`/`aria-selected` danach ändert (sonst Schritt-Flut). Zusammenfassen mehrerer Pfeiltasten zu einem Schritt nötig. 0,5–1 Tag. |
| **L5** ✅ | **ERLEDIGT (v2.19.0)** — **Canvas-Oberflächen** (Google Docs, Figma, Diagramm-Editoren) | **erfasst** (ohne Selektor) | Auf solchen Seiten entsteht **kein einziger Schritt** — die Aufnahme wirkt kaputt. | mittel | Der Dead-Click-Filter verwirft `<canvas>` (nicht interaktiv, kein `pointer`-Cursor): `content.js:345` (`INTERACTIVE_SELECTOR`), `:367` (`interactiveFor`). Belegt: Test 8.3. | klein–mittel: `canvas` in den Filter aufnehmen und den Schritt mit **Klickpunkt** statt Element-Box markieren (Label: Überschrift/`aria-label` der Fläche). Abspielen bleibt unzuverlässig (kein Element) → als „nur Anleitung, nicht automatisierbar" kennzeichnen. 0,5 Tag. |
| **L6** ✅ | **ERLEDIGT (v2.19.0)** — **Geschlossenes** Shadow DOM (Web Components) | **erfasst** (ohne Selektor) | Auf solchen Seiten entsteht gar kein Schritt — wie bei Canvas. | mittel | `interactiveFor` bekommt nur den Host, der selbst nicht interaktiv ist → verworfen. Belegt: Test 8.2 (0 Schritte). | klein: Not-Schritt auf den **Host** mit Klickpunkt-Markierung, damit wenigstens „hier klicken" übrig bleibt (Selektor unbrauchbar → nicht automatisierbar). 0,25 Tag. |
| **L7** ✅ | **ERLEDIGT (v2.19.0)** — **Doppelklick auf eine gewöhnliche Tabellenzelle** (Excel-Muster, Inline-Bearbeitung) | **erfasst** | Der sehr verbreitete „Doppelklick zum Bearbeiten" fehlt komplett in der Anleitung. | mittel | Dead-Click-Filter verwirft schon den ersten Klick (`td` ohne Rolle/`tabindex`). Gegenprobe Test 9.2b: **mit** `tabindex` funktioniert alles (`variant: "double"`). | klein: auf `dblclick` prüfen, ob für dieses Element kein Schritt entstand, und dann einen Schritt mit `variant: "double"` nachreichen (eng begrenzt auf `td`/`role=gridcell`/`role=row`). 0,25 Tag. |
| **L8** | **Klickbare Grafik ohne Rolle/Beschriftung** (SVG-Icon mit JS-Handler, kein `cursor:pointer`) | **nicht** | Ein Icon-Knopf fehlt in der Anleitung. (Mit `role="button"`/`aria-label` funktioniert es einwandfrei — Test 8.4.) | niedrig | Gleicher Dead-Click-Filter; `addEventListener`-Handler sind von außen nicht erkennbar (Browser-Grenze). `content.js:367`. | klein, aber riskant: `svg`/`img` in kleinen Flächen (<64 px) als klickbar werten → mehr Fehlalarme. **Vorschlag: nur mit Messung.** |
| **L9** | **Reines Scrollen** („scrollen Sie nach unten") | **nicht** | Bei langen Formularen wirkt die Anleitung sprunghaft: Schritt 3 oben, Schritt 4 unten — ohne Hinweis. | niedrig | Kein Scroll-Lauscher für die Aufnahme (`content.js` nutzt `scroll` nur zum Nachführen der Live-Markierung, `:3080/3103`). | klein: kein eigener Schritt, sondern beim nächsten Schritt einen Hinweis-Satz ergänzen, wenn zwischen zwei Schritten > 1 Bildschirmhöhe gescrollt wurde. 0,25 Tag. |
| **L10** | **Text markieren**, „Strg+C" auf markiertem Text außerhalb eines Feldes | **teilweise** | Markieren erzeugt nichts. Strg+C erzeugt einen Schritt „Drücken Sie Strg+C" **ohne Markierung im Bild** (leeres Rechteck) — der Leser weiß nicht, *was* kopiert werden soll. | niedrig | Markieren: kein Lauscher. Strg+C: `onShortcut` nimmt `document.activeElement`, das bei markiertem Fließtext `body` ist → `el=null` → `rect 0/0/0/0` (`content.js:2145`). Belegt: Test 4.1/4.3. | klein: bei `variant:"key"` ohne Fokus-Element die **Auswahl-Box** (`getSelection().getRangeAt(0).getBoundingClientRect()`) als Markierung nehmen. 0,25 Tag. |
| **L11** | Hover-Tooltip ohne Klick | **nicht** | Erklärungen, die nur beim Darüberfahren erscheinen, kommen nicht in die Anleitung. | niedrig | Hovern wird nur als *Zusatz* zu einem Klick erfasst (`hoverFor`, `content.js:1592`). Belegt: Test 9.1. | mittel: bewusst **nicht** automatisch (sonst Schritt-Flut bei jeder Mausbewegung) — besser als manueller Knopf „Diesen Hinweis als Schritt aufnehmen" in der Seitenleiste. |
| **L12** | Selektor bei **nachgeladenen Listen** | **teilweise** | Der Schritt funktioniert in der Anleitung (Bild + Text stimmen), beim **automatischen Abspielen** kann er die falsche Zeile treffen, wenn die Liste inzwischen anders lang ist. | mittel | `cssPathFor` fällt auf `…:nth-of-type(n)` zurück, wenn es keine stabile Id/`data-testid`/`name`/`aria-label` gibt (`content.js:832ff`). Belegt: Test 5.5 (`css="#row8"` nur weil die Fixture Ids vergibt; ohne Ids Positionspfad). | vorhanden: `guide-resolve.js` gleicht zusätzlich über `text` ab — greift bereits. Weitere Härtung nur bei konkretem Kundenfall. |

### Nicht-Lücken (geprüft und in Ordnung)

Scrollen + Klick weit unten (Markierung sitzt korrekt im sichtbaren Ausschnitt, Test 5.1),
sticky Kopfzeilen und `position:fixed`-Leisten (5.2/5.3), Elemente in eigenen scrollbaren
Containern (5.4), unendliches Nachladen (5.5), SPA-Klick (6.1), neuer Tab / `window.open` /
Download-Klick (7.1–7.3), offenes Shadow DOM inkl. Selektor-Wiederfinden (8.1),
SVG-Knopf mit Rolle (8.4), `<dialog>` und Overlay-Dialoge (10.1/10.2), contenteditable (9.3),
Formular per Knopf und per Enter inkl. getipptem Wert (13.1/13.2), Kopieren/Einfügen/
Ausschneiden **im** Feld (4.2/4.4 — bewusst kein Kürzel-Schritt, der eingefügte Text erscheint
als normaler Eingabe-Schritt), Rechtsklick mit eigenem Menü (4.5), iframes gleicher und fremder
Herkunft (durch `test-guide-capture-plus.mjs` abgedeckt).

---

## 4. Stand und nächste Schritte

**Erledigt (v2.19.0):** L1, L3, L4, L5, L6, L7 und L2 in der Variante A (Abschluss-Bild).

**Noch offen — in dieser Reihenfolge sinnvoll:**

1. **L10 Auswahl-Markierung** (Strg+C außerhalb eines Feldes zeigt ein leeres Rechteck) — ein Viertel-Tag, klar abgegrenzt.
2. **L9 Scroll-Hinweis** — kein eigener Schritt, nur ein Zusatzsatz beim nächsten Schritt.
3. **L2 Variante C (Ergebnis-Bild je Schritt)** — größter Nutzen für die Lesequalität, aber echtes Projekt (Speicher, Ratenlimit, Panel-Queue). Vorher Konzept; das Abschluss-Bild deckt den häufigsten Fall (letzter Klick) bereits ab.
4. **L8 klickbare Grafik ohne Rolle** — nur mit Messung, sonst Fehlalarme.
5. **L11 Hover-Tooltip** — bewusst nur als manueller Knopf in der Seitenleiste, nie automatisch.
