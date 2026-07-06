# Steply Recorder (Browser-Extension, v2.4 — Side Panel)

> **v2.4 — Auto-Schwärzung sensibler Felder.** Bei der Sofort-Anleitung sammelt das
> Content-Script pro Schritt zusätzlich die **Rechtecke sichtbarer sensibler Felder** ein
> (`input[type=password]` immer; Text-Felder, deren Label/`aria-label`/`placeholder`/`name`/
> `id` auf API-Key, secret, token, Passwort, IBAN, Kontonummer, Kreditkarte, CVV oder BIC
> passt; sowie jedes Element mit dem Opt-in-Attribut **`data-steply-sensitive`**). Erfasst
> wird **nur Geometrie** (normalisiert `0..1`, wie das Klick-Rechteck) — **niemals**
> Feldinhalte. Der Server macht daraus je Feld einen **vorgeschlagenen „blur“-Highlight**
> (`suggested:true`); der Autor sieht im Builder den Hinweis „Automatisch geschwärzt — bitte
> prüfen" und wird vor dem Veröffentlichen gewarnt, falls noch ungeprüfte Schwärzungen offen
> sind. Beim Veröffentlichen werden die Blurs (wie bisher) **in die Pixel gebrannt**. Details
> unten unter „Auto-Schwärzung sensibler Felder (v2.4)".

> **v2.3 — Aufnahme-Anker: in bestehende Anleitungen aufnehmen.** Bisher legte jede
> Sofort-Anleitung immer ein **neues** Tutorial an. Jetzt kann die Aufnahme **gezielt in
> ein bestehendes Entwurfs-Tutorial an genau einer Stelle** eingehängt werden — an jedem
> Einfügepunkt im Builder (+ zwischen Schritten, am Ende einer Kette, an jedem Ast einer
> Verzweigung, auch einem leeren). Ablauf: im Builder auf „**Ab hier mit Extension
> aufnehmen**" klicken → die Seitenleiste öffnet sich **und** merkt sich das Ziel
> (`pendingTarget` in `chrome.storage.local`, origin-gebunden über den Sender, Verfall nach
> 30 min). Ein Banner „🎯 Aufnahme für: …" zeigt das Ziel; „Ziel verwerfen" räumt es weg.
> Beim Fertigstellen reist das Ziel im `guide-complete`-Payload mit — **nur**, wenn die
> Herkunft der konfigurierten App-URL entspricht. Die Verkettung macht der Server (Kette
> bleibt geschlossen; Rejoin bleibt erhalten). Ist das Ziel nicht nutzbar (kein Entwurf,
> fremdes Konto, kaputter Anker, >40 Schritte), legt der Server **stattdessen ein neues
> Tutorial** an (`fallback: true` + Grund) — **eine Aufnahme geht nie verloren**. So füllt
> man **Verzweigungen** bequem: Weiche im Builder anlegen, dann jeden Ast einzeln per
> Extension aufnehmen.

> **v2.2 — Ein-Klick-Verbinden & Download-Seite.** Kein Token mehr von Hand kopieren:
> Auf der öffentlichen **Download-Seite `/extension`** laden Sie die Extension als ZIP
> herunter (mit bebilderter 3-Schritt-Anleitung). Danach verbinden Sie sie **mit einem
> Klick** — in Steply unter **Einstellungen → Einbetten → „Extension verbinden"**. Die
> Seite überträgt den Token per `postMessage` (origin-gebunden) an die Extension; diese
> **validiert ihn gegen `/api/recorder/me`, bevor sie ihn speichert**, und meldet den
> Kontonamen zurück. Panel und Seite zeigen „Verbunden mit X" — eine Fehlbindung fällt
> sofort auf. Zusätzlich: **dezenter Update-Hinweis** im Panel (vergleicht die installierte
> Version mit `/downloads/steply-recorder.json`). Details unten unter „Verbinden".

> **v2.1 — Saubere Eingaben & Selektor-Vorbau (Sofort-Anleitung).** Eingaben werden
> jetzt wie bei Tango als **eigener Schritt beim Verlassen des Feldes** (blur) erfasst —
> der Screenshot zeigt das **ausgefüllte** Feld. Klicks _in_ ein Feld erzeugen kein
> Rausch-„Klicken Sie auf Feld" mehr. Labels sind **hygienischer** (kein CSS-Text aus
> styled-components mehr) und **datenschutzbewusst** (getippte Werte / Passwörter landen
> **nie** im Label). Zusätzlich wird pro Schritt ein robuster **Element-Selektor**
> (`css`/`text`/`role`) miterfasst und gespeichert — reiner Vorbau (noch nicht genutzt).
> Details unten unter „Eingaben & Selektoren (v2.1)".

Nordstern-Einstieg **„Klicks statt Zauberwort"**: Statt einen Ablauf in Worte zu
fassen, klicken Sie ihn einfach vor.

> **v2.0 — Seitenleiste statt Fenster (Tango-Architektur).** Alles passiert in
> **einer Browser-Seitenleiste** (rechts im Fenster) — kein separates
> Aufnahme-Fenster mehr, das aufgeht, minimiert und vergessen wird. Die
> Seitenleiste bleibt beim Navigieren **und beim Tab-Wechsel offen** (das erledigt
> Chrome). Klick aufs Symbol öffnet sie. Robuster geworden:
> **Multi-Tab-Klicks** (Klicks aus **jedem** Tab des Fensters zählen — Tab-Wechsel
> mitten in der Anleitung ist normal), **Mikro-Preflight** (kein stilles Ohne-Ton-
> Video mehr) und **Zustands-Versöhnung** (eine abgebrochene Aufnahme klemmt nie
> wieder — sie wird beim Öffnen sauber verworfen).

Die Extension bietet **zwei Modi** (Wahl in der Seitenleiste):

- **Sofort-Anleitung (Screenshots je Klick)** — Tango-Stil: Bei jedem Klick
  entsteht sofort ein Screenshot + das geklickte Element wird ausgelesen
  (Bounding-Box, Beschriftung, Aktion). Daraus baut Steply in Sekunden einen
  **fertigen Tutorial-Entwurf** — **ohne Video**, ohne Server-KI-Pipeline. Braucht
  einen Verbindungs-Token (Direkt-Upload). Details unten unter „Sofort-Anleitung".
- **Video (mit KI-Texten & Ton)** — der Bestand: nimmt einen
  Bildschirm-Screencast auf und zeichnet dabei Ihre Klicks (Zeit, Position,
  Beschriftung) auf. Steply nutzt die Klicks als **exakte Schrittgrenzen** und für
  die **Highlight-Positionen** im generierten Tutorial (Whisper + Vision im Worker).

**Zwei Wege am Ende der Aufnahme:**

- **Mit Verbindungs-Token → Direkt-Upload.** Ist in der Extension ein
  Verbindungs-Token hinterlegt (aus Steply: Einstellungen → Einbetten → „Steply
  Recorder verbinden"), lädt die Extension Video + Klicks **direkt** zu Steply
  hoch. Das Tutorial wird sofort erstellt — kein Datei-Umweg.
- **Ohne Token → zwei Dateien.** Wie bisher: `steply-aufnahme-<datum>.webm` +
  `steply-clicks-<datum>.json`, die Sie manuell in Steply hochladen (Aus Video).

> **Reines Vanilla JS, Manifest V3, kein Build-Step.** Das Video geht beim
> Direkt-Upload über eine **signierte Storage-URL** direkt an Supabase — **nie**
> durch eine Server-Route (Vercel-Body-Limit ~4,5 MB).

---

## Installation

### Für Nutzer: Download-Seite `/extension` (empfohlen, ohne Repo)

Solange der Chrome Web Store noch in Vorbereitung ist, ist die öffentliche Seite
**`/extension`** der offizielle Weg (z. B. `https://tutax-ivory.vercel.app/extension`):

1. **ZIP herunterladen** (Button „Extension herunterladen") und in einen festen Ordner
   **entpacken** (nicht löschen — Chrome lädt die Extension von dort).
2. `chrome://extensions` öffnen und oben rechts **Entwicklermodus** einschalten.
3. **Entpackt laden** klicken und den entpackten Ordner wählen.

Das ZIP wird per `node scripts/build-extension-zip.mjs` erzeugt (nach
`public/downloads/steply-recorder.zip`, `manifest.json` im Wurzelverzeichnis) und ist
zugleich das Upload-ZIP für den Chrome Web Store (siehe `store/LISTING.md`). Chrome ab
Version 114 (Seitenleiste).

### Für Entwickler (aus dem Repo)

1. Chrome öffnen und `chrome://extensions` aufrufen.
2. Oben rechts **Entwicklermodus** einschalten.
3. Auf **Entpackt laden** klicken.
4. Den Ordner `extension/` aus diesem Repo auswählen.
5. Das Steply-Symbol erscheint in der Symbolleiste (ggf. anpinnen).

Die mitgelieferten Icons (`icons/icon16.png`, `48`, `128`) sind einfarbige
Platzhalter. Neu erzeugen: `node extension/make-icons.mjs` (ohne Abhängigkeiten).

---

## Nutzung

1. Klicken Sie auf das **Steply-Symbol** → die **Seitenleiste** öffnet sich rechts
   im Browserfenster und bleibt dort offen.
2. **Beim ersten Mal (für Direkt-Upload) — am einfachsten per Ein-Klick-Verbinden:**
   In Steply **Einstellungen → Einbetten → „Extension verbinden"** klicken. Die Seite
   überträgt den Token automatisch an die installierte Extension; das Panel zeigt danach
   „Verbunden mit X" (auch wenn es gerade offen ist — es aktualisiert sich sofort).
   **Fallback:** Ist noch kein Token hinterlegt, zeigt die Seitenleiste den
   **Verbinden**-Schritt, in dem man den Token von Hand einfügt (Einstellungen →
   Einbetten → „Token manuell kopieren"), **Speichern**. Die App-URL ist voreingestellt
   (`https://app.steply.de`); für lokale Tests hier z. B. `http://localhost:3013`
   eintragen. Ohne Verbindung geht es per „Ohne Verbindung fortfahren (nur Video)" weiter.
3. **Modus wählen:** Zwei große Karten — **Sofort-Anleitung** (Screenshot je Klick,
   ohne Video; braucht Verbindung) oder **Video mit Ton**.
4. **Video mit Ton:** Zuerst der **Mikro-Preflight** — die Seitenleiste zeigt
   „🎙 Mikrofon bereit" (grün) oder einen roten Hinweis mit „erneut prüfen". Der
   Start-Knopf ist erst aktiv, wenn das Mikro bereit ist **oder** Sie bewusst
   „Ohne Ton aufnehmen" ankreuzen. Dann **Bildschirm wählen & aufnehmen** → im
   Chrome-Dialog den Tab bzw. das Fenster auswählen.
5. Führen Sie Ihre Schritte vor. Sie dürfen dabei **zwischen Tabs wechseln** — die
   Seitenleiste bleibt offen und zählt Klicks aus jedem Tab des Fensters. Der Zähler
   zeigt Laufzeit und erfasste Klicks (bzw. bei der Sofort-Anleitung die Schrittliste
   mit **Thumbnail je Schritt** und **✕** zum Entfernen).
6. **Beenden** (Video: „Aufnahme beenden"; Sofort-Anleitung: „Anleitung
   fertigstellen") →
   - **Mit Token:** Upload mit Fortschritt, dann „In Steply öffnen".
   - **Ohne Token (nur Video):** beide Dateien werden heruntergeladen → manuell in
     Steply hochladen (**Aus Video**).

> Schließen Sie die Seitenleiste während einer laufenden Aufnahme, werden die
> Streams sauber gestoppt und der Zustand geräumt. Die **nächste** Öffnung startet
> garantiert sauber im Start-Screen (mit dezentem Hinweis „Eine unterbrochene
> Aufnahme wurde verworfen.").

---

## clicks.json — Vertrag mit dem Worker

Format (siehe DB-Migration `0020_video_clicks.sql` → Spalte `video_jobs.clicks`):

```json
[
  { "t": 3.21, "x": 0.4812, "y": 0.1337, "label": "Rechnung hochladen" },
  { "t": 8.05, "x": 0.9002, "y": 0.0421, "label": "Speichern" }
]
```

| Feld    | Bedeutung                                                        |
| ------- | --------------------------------------------------------------- |
| `t`     | Sekunden seit Aufnahmestart (Float, ≥ 0)                        |
| `x`     | Horizontale Position, `0..1` relativ zur Fensterbreite          |
| `y`     | Vertikale Position, `0..1` relativ zur Fensterhöhe              |
| `label` | Text des geklickten Elements, max. 60 Zeichen                   |

Relative Koordinaten (`0..1`) statt Pixel, damit sie unabhängig von der
Auflösung des aufgenommenen Videos auf die Video-Dimensionen abgebildet werden
können (der Worker rechnet gegen `image_width`/`image_height`).

### Uhr-Synchronisation (wie `t` entsteht)

Seitenleiste und aufgenommener Tab laufen auf **derselben Maschine** und teilen
sich damit dieselbe Wanduhr (`Date.now()`). Beim Aufnahmestart schreibt die
Seitenleiste `{ rec: { startedAt: Date.now() } }` nach `chrome.storage.local`.
Das Content-Script liest/beobachtet diesen Wert; für jeden Klick gilt:
`t = (Date.now() - startedAt) / 1000`. So ist kein fehleranfälliger Abgleich von
`performance.now()`-Zeitursprüngen über Kontextgrenzen nötig — und eine **frisch
geladene Folge-Seite** (nach Navigation) sieht den laufenden Zustand sofort.

---

## Grenzen (Ehrlichkeit)

- **Klick-Erfassung inkl. Seitenwechsel UND Tab-Wechsel (v2.0).** Das
  Content-Script ist deklarativ auf jeder `http(s)`-Seite registriert und wird
  auf jeder Folge-Seite neu geladen; es liest den Aufnahmezustand aus
  `chrome.storage.local`. Die Seitenleiste akzeptiert Klick-/Schritt-Nachrichten
  aus **jedem `http(s)`-Tab desselben Fensters** (`sender.tab.windowId ===`
  Panel-Fenster). Damit überleben Klicks **Navigationen** und **Tab-Wechsel**
  innerhalb des Fensters — ein häufiger Stolperstein in v1.
- **`captureVisibleTab` erfasst immer den aktiven Tab des Panel-Fensters.** In der
  Sofort-Anleitung wird pro Klick der gerade sichtbare Tab aufgenommen — passt zum
  Multi-Tab-Ablauf. Klicks in **anderen Fenstern** oder **anderen Programmen**
  zählen nicht.
- **Nur normale `http(s)`-Seiten** können Klicks liefern. Auf Browser-Systemseiten
  (`chrome://`, Chrome Web Store, PDF-Viewer, `about:` …) läuft die Aufnahme ohne
  Klick-Erfassung. Beim Video wird der Bildschirm trotzdem vollständig aufgenommen.
- Ausgabeformat ist WebM (VP9/VP8, je nach Browser-Unterstützung).

---

## Roadmap (v3+)

- **DOM-Selektoren nutzen:** seit v2.1 werden `{css,text,role}` pro Schritt **erfasst +
  gespeichert** (`steps.selector`). Offen: sie zum robusten Schritt-Matching / für die
  Live-Führung **auslesen** (aktuell reiner Vorbau).
- Klick-Erfassung über **Fenster-Grenzen** hinweg (aktuell ein Fenster).
- Echtzeit-Aufbau des Tutorials **während** der Aufnahme.
- Formular-Eingaben sind seit v2.1 als `type`-Schritt (blur) abgedeckt; offen:
  **Scroll-/Tastatur-Ereignisse** (datenschutzbewusst).

---

## Dateien

| Datei             | Zweck                                                         |
| ----------------- | ------------------------------------------------------------ |
| `manifest.json`   | MV3-Manifest (Berechtigungen inkl. `sidePanel`, `side_panel`, `background`, deklaratives Content-Script) |
| `background.js`   | Service-Worker: öffnet die Seitenleiste beim Symbol-Klick (`setPanelBehavior`) + schluckt verwaiste Nachrichten |
| `panel.html/.js`  | **Die Seitenleiste**: Verbinden, Modus-Wahl, Aufnahme (Video/Sofort), Upload/Download — alle Zustände in einem Dokument |
| `content.js`      | Läuft passiv auf jeder Seite; erfasst Klicks nur bei Aufnahme |
| `styles.css`      | Styling der Seitenleiste                                      |
| `make-icons.mjs`  | Erzeugt die Platzhalter-Icons (ohne Abhängigkeiten)          |
| `icons/`          | `icon16/48/128.png`                                          |

### Architektur v2.0 (Side Panel / Tango)

- **Kein Popup, kein separater Aufnahme-Tab** mehr. `manifest.json` hat
  `"side_panel": { "default_path": "panel.html" }` und die `sidePanel`-Berechtigung;
  `background.js` ruft einmal
  `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, damit der
  **Klick aufs Symbol** die Seitenleiste öffnet.
- **Panel-Zustände** (genau einer sichtbar): `connect` (a, Token) · `start`
  (b, zwei Karten) · `videoSetup` (Mikro-Preflight) · `videoLive` (d) · `videoDone`
  (e) · `guideLive` (c, Schrittliste mit Thumbnails) · `guideDone` (e).
- **Message-Fluss:** `content.js` sendet per `chrome.runtime.sendMessage`
  (`steply-click` im Video-Modus, `steply-guide-step` im Sofort-Modus); das offene
  Panel empfängt via `chrome.runtime.onMessage` und akzeptiert nur Nachrichten aus
  einem Tab **desselben Fensters** (`sender.tab.windowId === panelWindowId`, via
  `chrome.windows.getCurrent()`). Der Klick-Puls (`steply-guide-captured`) geht
  gezielt zurück an `sender.tab.id` des jeweiligen Schritts — auch bei Multi-Tab.
- **Zustands-Versöhnung:** Das Panel-Dokument wird beim Schließen der Seitenleiste
  zerstört; eine frisch geladene Instanz hat also nie eine laufende Session. Findet
  sie beim Öffnen trotzdem ein `rec`-Flag im `storage`, wird es verworfen (kein
  Aufwachen im „recording"-Modus). `pagehide` stoppt beim Schließen zusätzlich die
  Streams und räumt `rec`.

### Warum `host_permissions` für http/https nötig ist

Das Content-Script ist **deklarativ** registriert (`content_scripts` mit
`matches: http/https`, `run_at: document_start`); dafür braucht die Extension
`host_permissions: ["http://*/*", "https://*/*"]`. Dasselbe Recht deckt
`captureVisibleTab` mit ab (kein zusätzliches `"tabs"`-Recht nötig). Das Script ist
standardmäßig **passiv** (es liest den Aufnahmezustand aus `chrome.storage.local`
und erfasst Klicks nur während einer laufenden Aufnahme), sammelt also im
Ruhezustand nichts.

### Direkt-Upload — Server-Routen & Sicherheit

- `POST /api/recorder/handshake` `{token}` → validiert den Token (Admin-Client,
  keine Session) und gibt eine **signierte Upload-URL** + `path` zurück.
- Extension lädt das Video **direkt** per `PUT` an die signierte URL (nie durch
  die API — Vercel-Body-Limit).
- `POST /api/recorder/complete` `{token, path, title?, clicks?}` → prüft Token +
  dass `path` im Konto-Ordner liegt, validiert `clicks` und reiht einen
  `video_job` ein.
- **CORS `*` ist unkritisch**, weil kein Cookie/keine Session mitgeht: es gibt
  keine ambient authority. Nur wer den (widerrufbaren) Token hat, darf hochladen.
  Token in Steply erneuern = alter sofort ungültig.

### Verbinden (Ein-Klick-Pairing, v2.2) — Ablauf & Sicherheit

Neue, **einzige zusätzliche** Route: `GET /api/recorder/me` mit
`Authorization: Bearer <recorder_token>` → `200 { account, slug }` | `401`. Sie sagt nur,
zu welchem Konto ein Token gehört (dieselbe Token-Prüfung wie die Upload-Routen). Der
Ein-Klick-Ablauf:

1. **Seite** (Einstellungen → Einbetten → „Extension verbinden") erzeugt einen frischen
   Token und sendet `window.postMessage({ __steply:true, type:"steply-pair", token,
   appUrl:location.origin }, location.origin)` — **nur** an den eigenen Origin.
2. **`content.js`** nimmt die Nachricht **nur** an, wenn `event.source === window` **und**
   `event.origin === location.origin` **und** `data.__steply === true` **und**
   `type === "steply-pair"` **und** der Token ein plausibler String ist. Dann reicht es
   `{type:"steply-pair", token, appUrl: event.origin}` (die **verifizierte** Herkunft, nicht
   der behauptete Wert) an `background.js`.
3. **`background.js`** ruft **zuerst** `GET {appUrl}/api/recorder/me` mit dem Token auf
   (Timeout ~8 s). **Nur bei 200** speichert es `steplyToken`/`steplyAppUrl` in
   `chrome.storage.local` und meldet den **Kontonamen** an den Tab zurück. Bei jedem
   Fehler: **nichts** speichern, Ablehnung zurück.
4. **`content.js`** postet das Ergebnis (`steply-pair-result`, inkl. Kontoname) an die
   Seite zurück → sie zeigt „Verbunden mit X".

**Sicherheitsprinzipien:** Pairing startet nur auf **Nutzer-Klick** der Seite;
**Origin-Bindung** in Seite und Content-Script; der Token wird **vor dem Speichern gegen
die Ziel-App validiert**; Panel **und** Seite zeigen den **Kontonamen** (Fehlbindung fällt
sofort auf); der Token steht **nie in einer URL** (nur im `Authorization`-Header).

### Update-Hinweis (v2.2)

Das Panel lädt beim Öffnen `{appUrl}/downloads/steply-recorder.json` (fail-silent,
Timeout ~4 s). Ist die dort hinterlegte Version **neuer** als
`chrome.runtime.getManifest().version` (numerischer Segment-Vergleich), erscheint eine
**dezente, nie blockierende** Statuszeile „Neue Version verfügbar" mit Link auf
`{appUrl}/extension`.

---

## Sofort-Anleitung (Tango-Stil) — Screenshots je Klick, ohne Video

Zweiter Modus, gedacht für „in Sekunden zur Anleitung": statt einem Video macht die
Extension bei **jedem Klick sofort einen Screenshot** und liest das geklickte Element
aus. Daraus entsteht direkt ein **Tutorial-Entwurf** — kein Worker, keine Whisper/
Vision-Pipeline.

**Ablauf (nur mit Verbindungs-Token):**

1. Seitenleiste → Karte **„Sofort-Anleitung"** (ohne Verbindung ist die Karte
   deaktiviert, mit Hinweis „Zuerst mit Steply verbinden").
2. Das Panel setzt `chrome.storage.local` `{ rec: { startedAt, mode: "guide" } }`.
   Das Content-Script erfasst dann bei jedem `pointerdown` (Capture-Phase, **vor** der
   Klick-Wirkung/Navigation) die **BoundingClientRect des Elements** (normalisiert 0..1
   zum Viewport — der Tango-Trick für pixelgenaue Markierungen), ein **hygienisches Label**
   (aria-label/zugehöriges `<label>`/sichtbarer Text/alt, ≤ 60 — **kein** getippter Wert,
   kein CSS-Text), den **Aktionstyp** (`click` | `type`), einen **Element-Selektor**
   (`css`/`text`/`role`, s. u.), `location.href` und `document.title`. **Eingaben** laufen
   separat über `blur` (s. „Eingaben & Selektoren").
3. Pro Klick-Nachricht (aus **jedem** Tab des Fensters) macht das Panel **sofort**
   `chrome.tabs.captureVisibleTab(panelWindowId, {format:"png"})` — der im Moment des
   Klicks aktive/sichtbare Tab des Panel-Fensters. PNG → **WebP** (OffscreenCanvas,
   Qualität 0,85, spart ~70 % Upload). Schritte sammeln sich im Speicher; **Live-Zähler**
   + **scrollende Schrittliste mit Thumbnail je Schritt** und **✕** zum Entfernen
   einzelner Schritte vor dem Upload.
4. **„Anleitung fertigstellen"** → Upload (s. u.) → Abschluss-Screen mit
   „In Steply öffnen" (`{appUrl}/app/tutorials/{id}`).

**captureVisibleTab-Grenzen (bewusst behandelt):**

- **Ratenlimit ~2/s** (`captureVisibleTab`): Captures werden über eine kleine **FIFO-
  Warteschlange** (Kappe 4) **serialisiert** und auf ≥ 550 ms Abstand gedrosselt. So
  gehen kurz aufeinanderfolgende Schritte (Eingabe + Klick) **nicht verloren**; bei
  Überlauf fällt der älteste _wartende_ Schritt heraus (mit Hinweis). Treffen zwei
  Schritte im ~300-ms-Fenster ein (Eingabe + direkt folgender Klick), **teilen sie sich
  einen Screenshot** — der Klick-Schritt zeigt dann nicht schon die Folgeseite.
- **Sofortige Navigation:** `pointerdown` feuert früh genug, dass der Screenshot die
  Ausgangsseite zeigt; scheitert ein Einzel-Screenshot doch (Tab schon weiter), wird der
  Schritt still übersprungen und ein Hinweis gezeigt.
- **Berechtigungen:** `captureVisibleTab` ist durch die vorhandenen
  `host_permissions` (`http/https`) gedeckt — **kein** zusätzliches `"tabs"`-Recht nötig.
- **Nur mit Token + auf normalen `http(s)`-Seiten.** Ohne Token ist die
  Sofort-Anleitung-Karte deaktiviert (Hinweis: „In Steply verbinden — Einstellungen
  → Einbetten").

### Eingaben & Selektoren (v2.1)

**Eingaben als eigener Schritt (Tango-Verhalten).** Ein Klick _in_ ein editierbares Feld
(Textfeld/`<textarea>`, `contenteditable`, `role=textbox/searchbox/combobox`) erzeugt
**keinen** Schritt mehr. Stattdessen:

- Beim **Fokussieren** (`focusin`) merkt sich das Content-Script den Startwert **nur
  lokal** (bei `contenteditable` nur die Textlänge) — er wird **nie** ans Panel gesendet.
- Beim **Verlassen** (`blur`/`focusout`) mit **geändertem** Wert wird ein `type`-Schritt
  gemeldet. Der Screenshot entsteht damit **nach** der Eingabe und zeigt das **ausgefüllte
  Feld** (wie „Enter Product Package" bei Tango).
- **Reihenfolge:** Klickt man nach dem Tippen direkt auf einen Button, feuert
  `pointerdown` (Button) **vor** `blur` (Feld). Das Content-Script sendet deshalb zuerst
  den **Eingabe-Schritt**, dann den **Klick-Schritt** (und rechnet das Feld ab, damit kein
  Doppel-Schritt entsteht).
- Native `<select>`: ein `change` erzeugt einen `type`-Schritt (Label = gewählte Option).

**Label-Hygiene & Datenschutz.** Das Label kommt aus sichtbarem Text (`innerText`, ohne
`<style>`/`<script>`), aria-label/`aria-labelledby`, zugehörigem `<label>`, `placeholder`,
`name` oder `title`. Ein Rettungsnetz verwirft Kandidaten, die nach **Code/CSS** aussehen
(styled-components hängt CSS in `<style>`-Kinder — früher lief das ins Label). Für
**Eingabefelder** gilt: **niemals** der getippte Wert (`el.value`), bei `type=password`
erst recht nichts Feldinhaltliches.

**Element-Selektor (`{ css, text, role }`) — Vorbau.** Pro Schritt wird ein robuster
Selektor miterfasst und in `steps.selector` (jsonb) gespeichert. Er wird **noch nirgends
gelesen** (Vorbau für Live-Führung / Anleitungs-TÜV), ist **optional** (alte Extensions
bleiben gültig) und wird serverseitig **streng** validiert (Typen, Längen `css≤400`,
`text≤80`, `role≤40`; unbekannte Keys verworfen; kaputt ⇒ gesäubert, **kein** Fehler):

- `css`: kürzester eindeutiger Pfad. Priorität `#id` (nur „stabil" aussehend — nicht rein
  numerisch, nicht UUID-/`:r5:`-/`radix-…`-artig) → `[data-testid]` → `tag[name]` /
  `[aria-label]` → Pfad aus `tag:nth-of-type` (max. 5 Ebenen). **Keine** generierten
  Klassennamen (`sc-…`, `css-…`, Hashes).
- `text`: sichtbarer Kurztext (≤ 80). `role`: implizite/explizite ARIA-Rolle (≤ 40).

### Auto-Schwärzung sensibler Felder (v2.4)

Damit Screenshots keine **API-Keys/Passwörter/IBANs** leaken, sammelt das Content-Script pro
Schritt zusätzlich zu Klick-Rechteck und Selektor die **Rechtecke sichtbarer sensibler
Felder** ein und schickt sie als optionales Feld `sensitive: [{x,y,w,h}, …]` (normalisiert
`0..1`, wie `rect`) mit. **Nur Geometrie — niemals Feldinhalte.** Erfasst werden:

- **`input[type=password]`** — immer.
- **`input`/`textarea`**, deren zugehöriges `<label>`/`aria-label`/`placeholder`/`name`/`id`
  auf `(api[-_ ]?key|secret|token|geheim|passw|iban|kontonummer|kreditkarte|
  credit[-_ ]?card|cvv|bic)` matcht (case-insensitive).
- Beliebige Elemente mit dem **Opt-in-Attribut `data-steply-sensitive`**.

**Sichtbar** = im Viewport, Fläche > 0, nicht `display:none`/`visibility:hidden`. Es werden
höchstens **10** Rechtecke gesendet (die **größten zuerst**), Werte `0..1` geklemmt.

Serverseitig wird `sensitive` **streng** validiert (Muster wie `selector`: Array ≤ 10,
`{x,y,w,h}` endlich + `0..1` geklemmt, Mini-Flächen `< 0.0004` verworfen, unbekannte Keys
entfernt; kaputt ⇒ ignoriert, **kein** Fehler). Aus jedem gültigen Eintrag entsteht ein
zusätzlicher **`blur`-Highlight** mit `suggested:true`. Im Builder erscheinen sie als normale
Blur-Formen samt Hinweis „Automatisch geschwärzt — bitte prüfen"; sobald der Autor die
Markierungen eines Schritts speichert, fällt `suggested` weg (= geprüft). Vor dem
Veröffentlichen warnt ein Dialog, falls noch ungeprüfte Schwärzungen offen sind (reines
UI-Gate). Beim Veröffentlichen werden **alle** Blurs — inkl. `suggested` — wie bisher **in
die Pixel gebrannt** (`lib/redact.ts`). Ohne `sensitive` ist das Verhalten exakt wie zuvor.

**Direkt-Upload — Server-Routen (privat!):**

- `POST /api/recorder/guide-handshake` `{token, count}` → Token via `accountForRecorderToken`,
  `count` 1..40 → **count signierte Upload-URLs** für den **PRIVATEN** Bucket
  `tutorial-images` unter `{accountId}/guide-{uuid}/{i}.webp` (Entwurfs-Bilder sind
  privat — public entsteht erst beim Veröffentlichen). Extension lädt alle WebPs per `PUT`.
- `POST /api/recorder/guide-complete` `{token, title?, steps:[{path, label, action,
  rect:{x,y,w,h}, url, w, h, selector?, sensitive?}]}` → validiert (Pfad-Präfix aufs Konto,
  rect je 0..1 geklemmt, Label ≤ 60, ≤ 40 Schritte, Maße plausibel; `selector` optional +
  streng gesäubert → `steps.selector`; `sensitive` optional + streng validiert → je Feld ein
  „blur“-Highlight mit `suggested:true`, s. u.), respektiert `FREE_TUTORIAL_LIMIT`
  und legt einen **Tutorial-Entwurf** an: Titel = übergeben oder „Anleitung vom {Datum}";
  je Schritt Vorlagen-Titel/-Text, ein **Highlight-Rechteck** (`#3d4ee6`, rounded) aus
  `rect`, `image_path/width/height`; **lineare** null-Label-Branch-Kette + `root_step_id`
  (Verkabelung wie `scripts/seed-steply-help.mjs`). Danach via `after()` **ein** billiger,
  ausfallsicherer KI-Feinschliff der Texte (kein Vision, keine Bilder) — Fehler ⇒ die
  Vorlagen bleiben. Antwort `{tutorialId}`.
- CORS-Begründung wie oben (kein Cookie/keine Session → `*` unkritisch).

> **Tests:** `node --env-file=.env.local scripts/test-guide-live.mjs` (Server lokal :3016)
> deckt Auth, count-Grenzen, privaten Upload, Fremd-Pfad, Entwurf mit 3 Schritten
> (Highlight/Maße/Branch-Kette/Vorlagen-Titel), rect-Clamping, das **Selektor-Feld**
> (exakt gespeichert / kaputt gesäubert / fehlt ⇒ null) und das Free-Limit ab.
> `node scripts/test-guide-capture.mjs` (headless Chromium via Playwright, kein Netz)
> beweist die **Content-Script-Logik**: Label-Hygiene, `<label>`-Auflösung, blur-
> Reihenfolge, Passwort-/Wert-Datenschutz und die Selektor-Wahl. Der **Screenshot-Fluss**
> (`captureVisibleTab` über Navigationen) bleibt nur im echten Chrome testbar —
> **manueller Chrome-Test durch Richard nötig**.
