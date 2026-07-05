# Chrome Web Store – Eintrag „Steply Recorder"

> Vorbereitete Texte + Checkliste für die Einreichung im Chrome Web Store.
> Alles auf Deutsch, fertig zum Kopieren. Stand: Extension v2.2.0.

---

## Titel

**Steply Recorder**

(Alternativ mit Zusatz, falls ein längerer Titel gewünscht ist:
„Steply Recorder – Klick-Anleitungen aufnehmen")

---

## Kurzbeschreibung (≤ 132 Zeichen)

> Nehmen Sie Klick-Anleitungen oder Videos auf und laden Sie sie mit einem Klick direkt zu Steply hoch – fertige Tutorials in Sekunden.

(129 Zeichen – innerhalb des Limits.)

---

## Ausführliche Beschreibung

**Aus einem Arbeitsablauf wird eine fertige Anleitung – ohne Aufwand.**

Der Steply Recorder lebt in der Browser-Seitenleiste und hält Ihre Abläufe fest,
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

**Warum Steply Recorder?**
- Läuft in der Seitenleiste – bleibt beim Tab-Wechsel und beim Navigieren offen.
- Ein-Klick-Verbinden: einmal mit dem Konto koppeln, dann lädt jede Aufnahme
  automatisch hoch.
- Datenschutzbewusst: getippte Werte und Passwörter landen nie in den Schritt-Texten.
- Aufnahmen werden nur gestartet, wenn Sie es aktiv auslösen.

Steply ist ein einbettbares Anleitungs-SaaS für Organisationen: veröffentlichen Sie
Ihre Tutorials auf einer gehosteten Hilfeseite im eigenen Look – mit Suche, KI-Chat
und Mehrsprachigkeit. Der Recorder ist der schnellste Weg, neue Anleitungen zu
erstellen.

Ein Steply-Konto wird benötigt (kostenloser Tarif verfügbar).

---

## Begründung der Berechtigungen (für das Review-Team)

Diese Texte gehören in das Feld „Begründung" der jeweiligen Berechtigung im
Entwickler-Dashboard. Sie erklären, **warum** jede Berechtigung nötig ist.

| Berechtigung | Begründung |
|---|---|
| **`<all_urls>`** (Host-Berechtigung) | Der Nutzer nimmt einen Ablauf auf **der jeweils gerade besuchten Website** auf. Für die Sofort-Anleitung muss die Extension pro Klick einen Screenshot der aktiven Seite erfassen und die Bounding-Box des angeklickten Elements auslesen; für den Video-Modus die Klick-Zeitpunkte. Da Anleitungen auf beliebigen Web-Anwendungen entstehen, ist der Zugriff nicht auf eine feste Domain eingrenzbar. Es werden **keine** Seiteninhalte im Hintergrund gesammelt – nur während einer vom Nutzer gestarteten Aufnahme. |
| **`sidePanel`** | Die gesamte Bedienoberfläche (Modus-Wahl, Aufnahmesteuerung, Schrittliste, Upload) läuft in der Chrome-Seitenleiste. Sie bleibt beim Tab-Wechsel offen und ersetzt ein separates Fenster. |
| **`storage`** | Speichert lokal den Verbindungs-Token und die Steply-App-URL (für den Direkt-Upload) sowie den kurzlebigen Aufnahmezustand. Keine Nutzungs- oder Trackingdaten. |
| **`downloads`** | Fallback ohne Verbindung: Ist kein Konto gekoppelt, lädt die Extension die Aufnahme (Video + `clicks.json`) als Datei herunter, damit der Nutzer sie manuell in Steply hochladen kann. |
| **`activeTab`** | Erlaubt das Erfassen eines Screenshots des aktiven Tabs (`captureVisibleTab`) im Moment eines Klicks während einer laufenden Sofort-Anleitung. |

**Datenschutzerklärung (Pflichtfeld):**
`https://tutax-ivory.vercel.app/datenschutz`

**Single Purpose (falls gefragt):** Arbeitsabläufe im Browser aufnehmen und als
Schritt-für-Schritt-Anleitung an das Steply-Konto des Nutzers übergeben.

---

## Checkliste für die Einreichung (Richard)

1. **Entwicklerkonto anlegen** – einmalig **5 USD** Registrierungsgebühr im
   [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. **Upload-Zip bereitlegen** – das ist **dieselbe Datei** wie der Download auf
   `/extension`: `public/downloads/steply-recorder.zip` (per
   `node scripts/build-extension-zip.mjs` gebaut; `manifest.json` liegt im Wurzel-
   verzeichnis des Zips, wie vom Store verlangt).
3. **Store-Assets vorbereiten:**
   - **Screenshots: 1280×800** (oder 640×400) – mindestens einer, empfohlen 3–5.
     Zeigen Sie die Seitenleiste in Aktion (Modus-Wahl, laufende Sofort-Anleitung
     mit Schrittliste, „Verbunden mit …").
   - **Icon 128×128** (bereits in `icons/icon128.png` vorhanden).
   - Kleiner Werbekachel (440×280) optional.
4. **Formular ausfüllen** – Titel, Kurz-/Langbeschreibung (oben), Kategorie
   „Produktivität", Sprache Deutsch.
5. **Berechtigungen begründen** – die Texte aus der Tabelle oben eintragen.
6. **Datenschutz-URL** eintragen: `https://tutax-ivory.vercel.app/datenschutz`;
   Datennutzung wahrheitsgemäß angeben (keine Weitergabe/kein Verkauf).
7. **Zip hochladen und einreichen** – danach dauert das Review i. d. R. wenige Tage.
8. **Nach Freigabe:** Auf der `/extension`-Seite den Store-Link ergänzen; dann
   erhalten Nutzer automatische Updates statt des manuellen „Entpackt laden".

> Hinweis: Bis zur Store-Freigabe bleibt der manuelle Weg über die Seite `/extension`
> (ZIP herunterladen → entpacken → „Entpackt laden") die offizielle Zwischenlösung.
