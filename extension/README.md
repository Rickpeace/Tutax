# Steply Recorder (Browser-Extension, v1)

Nordstern-Einstieg **„Klicks statt Zauberwort"**: Statt einen Ablauf in Worte zu
fassen, klicken Sie ihn einfach vor. Diese Chrome-Extension nimmt einen
Bildschirm-Screencast auf und zeichnet dabei Ihre Klicks (Zeit, Position,
Beschriftung) auf. Am Ende erhalten Sie **zwei Dateien**, die Sie in Steply
hochladen (Aus Video):

- `steply-aufnahme-<datum>.webm` — das Video
- `steply-clicks-<datum>.json` — die Klick-Telemetrie

Steply nutzt die Klicks als **exakte Schrittgrenzen** und für die
**Highlight-Positionen** im generierten Tutorial.

> **v1 bewusst ohne Server-Anbindung.** Die Extension lädt nur zwei Dateien
> herunter; den Upload machen Sie manuell in Steply. Kein Build-Step, reines
> Vanilla JS, Manifest V3.

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

1. Öffnen Sie den **Tab**, den Sie erklären möchten.
2. Klicken Sie auf das Steply-Symbol → **Aufnahme starten**.
   Es öffnet sich ein eigener **Aufnahme-Tab** (dieser überlebt das Schließen
   des Popups — im Popup selbst würde die Aufnahme sterben).
3. Optional: **Mikrofon mit aufnehmen** anhaken (Ihre Erklärung als Ton).
4. **Bildschirm wählen & aufnehmen** → im Chrome-Dialog den Tab bzw. das Fenster
   auswählen.
5. Führen Sie Ihre Schritte vor. Der Zähler zeigt Laufzeit und erfasste Klicks.
6. **Aufnahme beenden** → beide Dateien werden heruntergeladen.
7. Beide Dateien in Steply hochladen (**Aus Video**).

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
sich damit dieselbe Wanduhr (`Date.now()`). Beim Aufnahmestart sendet der
Aufnahme-Tab `steply-rec-start` mit `startEpoch = Date.now()` an das
Content-Script. Für jeden Klick gilt: `t = (Date.now() - startEpoch) / 1000`.
So ist kein fehleranfälliger Abgleich von `performance.now()`-Zeitursprüngen
über Kontextgrenzen nötig.

---

## Grenzen von v1 (Ehrlichkeit)

- **Klick-Erfassung nur im gestarteten Browser-Tab.** Wechseln Sie während der
  Aufnahme den Tab oder in ein anderes Programm, werden **dort keine Klicks**
  erfasst. Das **Video** wird trotzdem vollständig aufgenommen (Sie können
  beliebige Fenster/Tabs teilen).
- **Nur `http(s)`/`file`-Seiten** können Klicks liefern. Auf `chrome://`-Seiten,
  im Chrome Web Store o. ä. läuft die Aufnahme ohne Klick-Erfassung (die
  Extension weist darauf hin).
- Kein direkter Upload — die Dateien landen im Download-Ordner.
- Ausgabeformat ist WebM (VP9/VP8, je nach Browser-Unterstützung).

---

## Roadmap (v2+)

- **DOM-Selektoren** pro Klick (stabile CSS-/ARIA-Pfade) für robusteres
  Schritt-Matching statt nur Text-Labels.
- **Direkter Upload** in Steply (Server-Anbindung), kein manueller Datei-Umweg.
- Klick-Erfassung über **Tab-Wechsel** hinweg (Injektion beim aktivierten Tab).
- Scroll-/Tastatur-Ereignisse und Formular-Eingaben (datenschutzbewusst).

---

## Dateien

| Datei             | Zweck                                                         |
| ----------------- | ------------------------------------------------------------ |
| `manifest.json`   | MV3-Manifest (Berechtigungen, Action, Icons)                 |
| `popup.html/.js`  | Einstieg: Content-Script injizieren + Aufnahme-Tab öffnen    |
| `recorder.html/.js` | Aufnahme-Tab: getDisplayMedia + MediaRecorder + Downloads |
| `content.js`      | Läuft im aufgenommenen Tab: erfasst Klicks, sendet sie       |
| `styles.css`      | Gemeinsames Styling (Popup + Aufnahme-Tab)                   |
| `make-icons.mjs`  | Erzeugt die Platzhalter-Icons (ohne Abhängigkeiten)          |
| `icons/`          | `icon16/48/128.png`                                          |

### Warum keine `<all_urls>`-Berechtigung?

Das Content-Script wird per `chrome.scripting.executeScript` in den **aktiven
Tab** injiziert — das deckt die `activeTab`-Berechtigung ab, weil der Nutzer die
Extension aktiv anklickt (User-Geste). Damit vermeiden wir die abschreckende
Installations-Warnung „Ihre Daten auf allen Websites lesen und ändern" und
brauchen **kein** `host_permissions: ["<all_urls>"]`.
