# Steply Recorder (Browser-Extension, v2.0 — Side Panel)

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

## Installation (Entwicklermodus)

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
2. **Beim ersten Mal (für Direkt-Upload):** Ist noch kein Token hinterlegt, zeigt
   die Seitenleiste zuerst den **Verbinden**-Schritt. Verbindungs-Token aus Steply
   einfügen (Einstellungen → Einbetten → „Steply Recorder verbinden"), **Speichern**.
   Die App-URL ist voreingestellt (`https://app.steply.de`); für lokale Tests hier
   z. B. `http://localhost:3013` eintragen. Ohne Verbindung geht es per „Ohne
   Verbindung fortfahren (nur Video)" weiter.
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

- **DOM-Selektoren** pro Klick (stabile CSS-/ARIA-Pfade) für robusteres
  Schritt-Matching statt nur Text-Labels.
- Klick-Erfassung über **Fenster-Grenzen** hinweg (aktuell ein Fenster).
- Echtzeit-Aufbau des Tutorials **während** der Aufnahme.
- Scroll-/Tastatur-Ereignisse und Formular-Eingaben (datenschutzbewusst).

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
   zum Viewport — der Tango-Trick für pixelgenaue Markierungen), das **Label**
   (aria-label/Text/alt/value, ≤ 60), den **Aktionstyp** (`click` | `type` bei
   Eingabefeldern), `location.href` und `document.title`.
3. Pro Klick-Nachricht (aus **jedem** Tab des Fensters) macht das Panel **sofort**
   `chrome.tabs.captureVisibleTab(panelWindowId, {format:"png"})` — der im Moment des
   Klicks aktive/sichtbare Tab des Panel-Fensters. PNG → **WebP** (OffscreenCanvas,
   Qualität 0,85, spart ~70 % Upload). Schritte sammeln sich im Speicher; **Live-Zähler**
   + **scrollende Schrittliste mit Thumbnail je Schritt** und **✕** zum Entfernen
   einzelner Schritte vor dem Upload.
4. **„Anleitung fertigstellen"** → Upload (s. u.) → Abschluss-Screen mit
   „In Steply öffnen" (`{appUrl}/app/tutorials/{id}`).

**captureVisibleTab-Grenzen (bewusst behandelt):**

- **Ratenlimit ~2/s** (`MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND`): Captures werden
  **serialisiert** und auf ≥ 550 ms Abstand gedrosselt; schnelle Doppelklicks werden
  zusammengefasst (**letzter gewinnt**), statt eine Fehlerflut auszulösen.
- **Sofortige Navigation:** `pointerdown` feuert früh genug, dass der Screenshot die
  Ausgangsseite zeigt; scheitert ein Einzel-Screenshot doch (Tab schon weiter), wird der
  Schritt still übersprungen und ein Hinweis gezeigt.
- **Berechtigungen:** `captureVisibleTab` ist durch die vorhandenen
  `host_permissions` (`http/https`) gedeckt — **kein** zusätzliches `"tabs"`-Recht nötig.
- **Nur mit Token + auf normalen `http(s)`-Seiten.** Ohne Token ist die
  Sofort-Anleitung-Karte deaktiviert (Hinweis: „In Steply verbinden — Einstellungen
  → Einbetten").

**Direkt-Upload — Server-Routen (privat!):**

- `POST /api/recorder/guide-handshake` `{token, count}` → Token via `accountForRecorderToken`,
  `count` 1..40 → **count signierte Upload-URLs** für den **PRIVATEN** Bucket
  `tutorial-images` unter `{accountId}/guide-{uuid}/{i}.webp` (Entwurfs-Bilder sind
  privat — public entsteht erst beim Veröffentlichen). Extension lädt alle WebPs per `PUT`.
- `POST /api/recorder/guide-complete` `{token, title?, steps:[{path, label, action,
  rect:{x,y,w,h}, url, w, h}]}` → validiert (Pfad-Präfix aufs Konto, rect je 0..1
  geklemmt, Label ≤ 60, ≤ 40 Schritte, Maße plausibel), respektiert `FREE_TUTORIAL_LIMIT`
  und legt einen **Tutorial-Entwurf** an: Titel = übergeben oder „Anleitung vom {Datum}";
  je Schritt Vorlagen-Titel/-Text, ein **Highlight-Rechteck** (`#3d4ee6`, rounded) aus
  `rect`, `image_path/width/height`; **lineare** null-Label-Branch-Kette + `root_step_id`
  (Verkabelung wie `scripts/seed-steply-help.mjs`). Danach via `after()` **ein** billiger,
  ausfallsicherer KI-Feinschliff der Texte (kein Vision, keine Bilder) — Fehler ⇒ die
  Vorlagen bleiben. Antwort `{tutorialId}`.
- CORS-Begründung wie oben (kein Cookie/keine Session → `*` unkritisch).

> **Test:** `node --env-file=.env.local scripts/test-guide-live.mjs` (Server lokal :3016)
> deckt Auth, count-Grenzen, privaten Upload, Fremd-Pfad, Entwurf mit 3 Schritten
> (Highlight/Maße/Branch-Kette/Vorlagen-Titel), rect-Clamping und das Free-Limit ab.
> Die **Browser-Logik** (`captureVisibleTab` über Navigationen) ist nur im echten Chrome
> testbar — **manueller Chrome-Test durch Richard nötig**.
