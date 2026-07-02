# Steply Recorder (Browser-Extension, v2)

Nordstern-Einstieg **„Klicks statt Zauberwort"**: Statt einen Ablauf in Worte zu
fassen, klicken Sie ihn einfach vor. Diese Chrome-Extension nimmt einen
Bildschirm-Screencast auf und zeichnet dabei Ihre Klicks (Zeit, Position,
Beschriftung) auf.

Steply nutzt die Klicks als **exakte Schrittgrenzen** und für die
**Highlight-Positionen** im generierten Tutorial.

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

1. **Einmalig (für Direkt-Upload):** Popup öffnen → „Direkt-Upload zu Steply" →
   Verbindungs-Token aus Steply einfügen, **Speichern**. Die App-URL ist
   voreingestellt (`https://app.steply.de`); für lokale Tests hier z. B.
   `http://localhost:3013` eintragen.
2. Öffnen Sie den **Tab**, den Sie erklären möchten.
3. Klicken Sie auf das Steply-Symbol → **Aufnahme starten**.
   Es öffnet sich ein eigener **Aufnahme-Tab** (dieser überlebt das Schließen
   des Popups — im Popup selbst würde die Aufnahme sterben).
4. Optional: **Mikrofon mit aufnehmen** anhaken (Ihre Erklärung als Ton).
5. **Bildschirm wählen & aufnehmen** → im Chrome-Dialog den Tab bzw. das Fenster
   auswählen.
6. Führen Sie Ihre Schritte vor. Der Zähler zeigt Laufzeit und erfasste Klicks.
7. **Aufnahme beenden** →
   - **Mit Token:** „Zu Steply hochladen" mit Fortschritt, dann „In Steply öffnen".
   - **Ohne Token:** beide Dateien werden heruntergeladen → manuell in Steply
     hochladen (**Aus Video**).

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

Aufnahme-Tab und aufgenommener Tab laufen auf **derselben Maschine** und teilen
sich damit dieselbe Wanduhr (`Date.now()`). Beim Aufnahmestart schreibt der
Aufnahme-Tab `{ rec: { startedAt: Date.now() } }` nach `chrome.storage.local`.
Das Content-Script liest/beobachtet diesen Wert; für jeden Klick gilt:
`t = (Date.now() - startedAt) / 1000`. So ist kein fehleranfälliger Abgleich von
`performance.now()`-Zeitursprüngen über Kontextgrenzen nötig — und eine **frisch
geladene Folge-Seite** (nach Navigation) sieht den laufenden Zustand sofort.

---

## Grenzen (Ehrlichkeit)

- **Klick-Erfassung im aufgenommenen Browser-Tab — inkl. Seitenwechsel.** Das
  Content-Script ist deklarativ auf jeder `http(s)`-Seite registriert und wird
  auf jeder Folge-Seite neu geladen; es liest den Aufnahmezustand aus
  `chrome.storage.local`. Damit überleben Klicks **Navigationen innerhalb des
  Tabs**.
- **NICHT abgedeckt: Tab-Wechsel während der Aufnahme.** Wechseln Sie in einen
  **anderen Tab** oder in ein **anderes Programm**, werden dort **keine Klicks**
  erfasst (der Recorder zählt bewusst nur den einen Ablauf). Das **Video** wird
  trotzdem vollständig aufgenommen (Sie können beliebige Fenster/Tabs teilen).
- **Nur normale `http(s)`-Seiten** können Klicks liefern. Auf Browser-Systemseiten
  (`chrome://`, Chrome Web Store, PDF-Viewer, `about:` …) läuft die Aufnahme ohne
  Klick-Erfassung (die Extension weist darauf hin).
- Ausgabeformat ist WebM (VP9/VP8, je nach Browser-Unterstützung).

---

## Roadmap (v3+)

- **DOM-Selektoren** pro Klick (stabile CSS-/ARIA-Pfade) für robusteres
  Schritt-Matching statt nur Text-Labels.
- Klick-Erfassung über **Tab-Wechsel** hinweg (aktuell bewusst nur ein Tab).
- Scroll-/Tastatur-Ereignisse und Formular-Eingaben (datenschutzbewusst).

---

## Dateien

| Datei             | Zweck                                                         |
| ----------------- | ------------------------------------------------------------ |
| `manifest.json`   | MV3-Manifest (Berechtigungen, deklaratives Content-Script)   |
| `popup.html/.js`  | Einstieg: Token/App-URL verwalten + Aufnahme-Tab öffnen      |
| `recorder.html/.js` | Aufnahme-Tab: getDisplayMedia + MediaRecorder + Upload/DL  |
| `content.js`      | Läuft passiv auf jeder Seite; erfasst Klicks nur bei Aufnahme |
| `styles.css`      | Gemeinsames Styling (Popup + Aufnahme-Tab)                   |
| `make-icons.mjs`  | Erzeugt die Platzhalter-Icons (ohne Abhängigkeiten)          |
| `icons/`          | `icon16/48/128.png`                                          |

### Warum `host_permissions` für http/https jetzt nötig ist

v1 injizierte das Content-Script per `chrome.scripting.executeScript` nur in den
**aktiven Tab** (`activeTab`). Das scheiterte auf vielen Seiten und überlebte
**keine Navigation** — Klicks auf Folge-Seiten fehlten. v2 registriert das
Content-Script **deklarativ** (`content_scripts` mit `matches: http/https`,
`run_at: document_start`); dafür braucht die Extension
`host_permissions: ["http://*/*", "https://*/*"]`. Das Script ist standardmäßig
**passiv** (es liest den Aufnahmezustand aus `chrome.storage.local` und erfasst
Klicks nur während einer laufenden Aufnahme), sammelt also im Ruhezustand
nichts.

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
