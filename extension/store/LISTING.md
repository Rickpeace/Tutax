# Chrome Web Store – Eintrag „Steply-Erweiterung"

> Vorbereitete Texte + Checkliste für die Einreichung im Chrome Web Store.
> Alles auf Deutsch, fertig zum Kopieren. Stand: Extension **v2.19.9** (27.09.2026).
> Noch nicht eingereicht — bis dahin gilt der ZIP-Weg über `/extension`.

---

## Titel

**Steply-Erweiterung**

(Der Store übernimmt den Titel aus `name` in `extension/manifest.json` — dort steht seit
v2.19.9 „Steply-Erweiterung". Bis v2.19.8 hieß sie „Steply Recorder". Ein anderer
Store-Titel ginge nur über eine Änderung am Manifest.)

---

## Kurzbeschreibung (≤ 132 Zeichen)

> Nehmen Sie Klick-Anleitungen oder Videos auf und laden Sie sie direkt zu Steply hoch – fertige Anleitungen in Sekunden.

(119 Zeichen – innerhalb des Limits. Die frühere Fassung hatte 133 Zeichen und war zu lang.)

Hinweis: Die `description` im Manifest (Text unter dem Namen in `chrome://extensions`) ist
länger und davon unabhängig.

---

## Ausführliche Beschreibung

**Aus einem Arbeitsablauf wird eine fertige Anleitung – ohne Aufwand.**

Die Steply-Erweiterung lebt in der Browser-Seitenleiste und hält Ihre Abläufe fest,
während Sie sie ganz normal durchklicken. Am Ende landet alles automatisch in Ihrer
Steply-Bibliothek – als bearbeitbarer Entwurf.

**Zwei Aufnahme-Modi:**

⚡ **Sofort-Anleitung (ohne Video)**
Bei jedem Klick entsteht sofort ein Screenshot, und das angeklickte Element wird
sauber markiert. Nach wenigen Sekunden liegt eine komplette Schritt-für-Schritt-
Anleitung bereit – ganz ohne Videoschnitt.

🎬 **Video mit Ton**
Führen Sie eine Aufgabe einmal am Bildschirm vor und sprechen Sie dazu. Steply
erzeugt daraus mit KI die passenden Texte und gliedert die Anleitung in Schritte.

**Und danach:**
- **Auf der Seite zeigen:** Die Erweiterung führt Sie oder Ihr Team Schritt für Schritt
  direkt auf der echten Website durch eine Anleitung.
- **Automationen:** Wiederkehrende Abläufe lassen sich auf Wunsch von der Erweiterung
  ausführen – sichtbar, mit Ihren lokal gespeicherten Angaben, auch zeitgesteuert.

**Warum die Steply-Erweiterung?**
- Läuft in der Seitenleiste – bleibt beim Tab-Wechsel und beim Navigieren offen.
- Ein-Klick-Verbinden: einmal mit dem Konto koppeln, dann lädt jede Aufnahme
  automatisch hoch.
- Datenschutzbewusst: Passwörter und sensible Werte (z. B. IBAN, Steuer-ID,
  Kartennummern) werden nie übernommen; solche Felder werden automatisch zum Verpixeln
  vorgeschlagen.
- Aufnahmen werden nur gestartet, wenn Sie es aktiv auslösen. Welche Anleitungen zur
  gerade offenen Seite passen, prüft die Erweiterung nur lokal – die besuchte Adresse
  verlässt Ihren Browser dafür nicht.

Steply ist ein einbettbares Anleitungs-SaaS für Organisationen: veröffentlichen Sie
Ihre Anleitungen auf einer gehosteten Hilfe-Seite im eigenen Look – mit Suche, KI-Chat
und Mehrsprachigkeit. Die Erweiterung ist der schnellste Weg, neue Anleitungen zu
erstellen.

Ein Steply-Konto wird benötigt (kostenloser Tarif verfügbar; „Video mit Ton" ab Pro).

---

## Begründung der Berechtigungen (für das Review-Team)

Diese Texte gehören in das Feld „Begründung" der jeweiligen Berechtigung im
Entwickler-Dashboard. Sie erklären, **warum** jede Berechtigung nötig ist. Abgleich mit
`extension/manifest.json` (v2.19.9): `activeTab`, `downloads`, `scripting`, `storage`,
`sidePanel`, `alarms`, `notifications` + Host-Recht `<all_urls>`.

| Berechtigung | Begründung |
|---|---|
| **`<all_urls>`** (Host-Berechtigung) | Der Nutzer nimmt einen Ablauf auf **der jeweils gerade besuchten Website** auf. Für die Sofort-Anleitung muss die Extension pro Klick einen Screenshot der aktiven Seite erfassen und die Bounding-Box des angeklickten Elements auslesen; für den Video-Modus die Klick-Zeitpunkte; für „Auf der Seite zeigen" und Automationen das aufgenommene Element auf der Seite wiederfinden. Da Anleitungen auf beliebigen Web-Anwendungen entstehen, ist der Zugriff nicht auf eine feste Domain eingrenzbar. Es werden **keine** Seiteninhalte im Hintergrund gesammelt – nur während einer vom Nutzer gestarteten Aufnahme, Führung oder Automation. |
| **`sidePanel`** | Die gesamte Bedienoberfläche (Aufnahmesteuerung, Schrittliste, Upload, Anleitungen, Automationen) läuft in der Chrome-Seitenleiste. Sie bleibt beim Tab-Wechsel offen und ersetzt ein separates Fenster. |
| **`storage`** | Speichert lokal den Verbindungs-Token und die Steply-App-URL (für den Direkt-Upload), den kurzlebigen Aufnahmezustand, Zwischenspeicher der Anleitungsliste sowie Angaben, die der Nutzer für seine Automationen hinterlegt (bleiben im Browser). Keine Nutzungs- oder Trackingdaten. |
| **`downloads`** | (1) Fallback ohne Verbindung: die Aufnahme (Video + Klickdatei) als Datei herunterladen, damit der Nutzer sie manuell in Steply hochladen kann. (2) Bei Aufnahmen und Automationen erkennen, dass ein Klick einen Download ausgelöst hat, damit der Schritt korrekt beschrieben bzw. die Datei im Ablauf weitergegeben werden kann. |
| **`activeTab`** | Erlaubt das Erfassen eines Screenshots des aktiven Tabs (`captureVisibleTab`) im Moment eines Klicks während einer laufenden Sofort-Anleitung. |
| **`scripting`** | Nach Installation/Update wird das Aufnahme-Script in bereits geöffnete Tabs nachgeladen (sonst funktioniert die Aufnahme dort erst nach einem Neuladen); außerdem eine kurze Prüfung, ob eine Seite fertig geladen ist, bevor eine Automation weiterklickt. |
| **`alarms`** | Startet vom Nutzer **selbst geplante** Automationen zur eingestellten Zeit; dafür wird alle 30 Minuten die Liste der geplanten Automationen mit dem Steply-Konto abgeglichen (keine besuchten Adressen, keine eingegebenen Werte). |
| **`notifications`** | Meldet das Ergebnis eines geplanten Automations-Laufs (z. B. „fertig" oder „Angaben fehlen"), da dieser ohne geöffnete Seitenleiste läuft. |

**Datenschutzerklärung (Pflichtfeld):**
`https://tutax-ivory.vercel.app/datenschutz`
(Muss vor der Einreichung die Erweiterung abdecken — laut `REVIEW.md` noch offen.)

**Single Purpose (falls gefragt):** Arbeitsabläufe im Browser als Schritt-für-Schritt-
Anleitungen aufnehmen, an das Steply-Konto des Nutzers übergeben und auf der Website
wieder abspielen (anzeigen bzw. auf Wunsch ausführen).

---

## Checkliste für die Einreichung (Richard)

1. **Entwicklerkonto anlegen** – einmalig **5 USD** Registrierungsgebühr im
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. **Upload-Zip bereitlegen** – das ist **dieselbe Datei** wie der Download auf
   `/extension`: `public/downloads/steply-recorder.zip` (per
   `npm run build:extension` = `node scripts/build-extension-zip.mjs` gebaut; `manifest.json`
   liegt im Wurzelverzeichnis des Zips, wie vom Store verlangt; `store/` ist nicht enthalten).
3. **Store-Assets vorbereiten:**
   - **Screenshots: 1280×800** (oder 640×400) – mindestens einer, empfohlen 3–5.
     Zeigen Sie die Seitenleiste in Aktion (Reiter „Aufnehmen", laufende Sofort-Anleitung
     mit Schrittliste, Reiter „Anleitungen", Avatar-Menü mit „Verbunden").
   - **Icon 128×128** (bereits in `icons/icon128.png` vorhanden).
   - Kleiner Werbekachel (440×280) optional.
4. **Formular ausfüllen** – Kurz-/Langbeschreibung (oben), Kategorie
   „Produktivität", Sprache Deutsch.
5. **Berechtigungen begründen** – die Texte aus der Tabelle oben eintragen.
6. **Datenschutz-URL** eintragen: `https://tutax-ivory.vercel.app/datenschutz`;
   Datennutzung wahrheitsgemäß angeben (Websiteinhalte/Screenshots und Klicks nur während
   einer vom Nutzer gestarteten Aufnahme, Übertragung nur an das eigene Steply-Konto;
   keine Weitergabe/kein Verkauf; kein Remote-Code).
7. **Zip hochladen und einreichen** – danach dauert das Review i. d. R. wenige Tage.
8. **Nach Freigabe:** Auf der `/extension`-Seite den Store-Link ergänzen; dann
   erhalten Nutzer automatische Updates statt des manuellen „Entpackt laden".
   Achtung: Store-Installationen erlauben kein Koppeln mit `http://localhost` (nur
   Entwickler-Installationen) — so vorgesehen.

> Hinweis: Bis zur Store-Freigabe bleibt der manuelle Weg über die Seite `/extension`
> (ZIP herunterladen → entpacken → „Entpackt laden") die offizielle Zwischenlösung.
