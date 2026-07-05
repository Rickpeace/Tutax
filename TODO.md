# TODO — offene Punkte (Stand: 02.07.2026)

> Kompakte Liste. Vollständiges Protokoll aller erledigten Punkte: [REVIEW.md](REVIEW.md).

## 🙋 Braucht RICHARD (niemand sonst kann das)

- [ ] **`deploy.sh` ausführen + Test-Video** — schaltet auf Hetzner frei: Live-Aufbau,
  Klick-Modus, Szenen-Erkennung, Fortschritt, Frame-Picker-Timestamps, alle Fixes.
  ```
  ssh root@23.88.98.172 "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"
  ```
- [ ] **`CRON_SECRET` in Vercel setzen** (Settings → Environment Variables, langer
  Zufallswert) — sonst bleibt der Aktualitäts-Autopilot bewusst aus (503, fail-closed).
- [ ] **Extension v2.0 (Seitenleiste) in Chrome testen**: `chrome://extensions` →
  Steply Recorder NEU LADEN → Icon-Klick öffnet die Seitenleiste. Checkliste:
  bleibt bei Tab-Wechsel offen · Sofort-Anleitung über MEHRERE Tabs (jeder Klick
  = Schritt mit Thumbnail + blauer Puls) · Abbruch → nächstes Öffnen sauber
  („unterbrochene Aufnahme verworfen") · Video-Modus zeigt Mikro-Status VOR dem
  Start · Upload → „In Steply öffnen". Braucht Chrome ≥ 114.
- [ ] **Impressum + Datenschutz: echte Betreiber-Angaben** eintragen
  (`[ANGABE FOLGT — Betreiber]`-Platzhalter in impressum/datenschutz-Seiten).
- [ ] **LemonSqueezy-Konto** anlegen (Merchant of Record) — dann baue ich die
  Anbindung (Webhook setzt nur noch `accounts.plan`).
- [ ] **Akzent-Verdikt**: neue dezente Hub-Karten behalten? (Revert: `git revert 61c371c`)
  Optional: `ink`-Token bei RichardTax dunkler stellen (Kartentitel sind CI-rot).
- [ ] **Prod-Check nach Vercel-Deploy**: einmal ein Tutorial veröffentlichen und prüfen,
  dass es SOFORT auf der Hilfe-Seite erscheint (Cache-Tag-Invalidierung im echten CDN).
- [ ] Optional Hetzner-`.env` ergänzen: `RESEND_API_KEY` + `INVITE_FROM_EMAIL` +
  `NEXT_PUBLIC_APP_URL` → „Tutorial fertig"-Mails vom Worker.

## 🧭 Geparkte Features (Entscheidung/Konzept nötig, dann baubar)

- [ ] **LemonSqueezy-Anbindung** (Checkout + Webhook → plan; Gating existiert schon)
- [ ] **Custom Domain** `hilfe.firma.de` (Vercel-Domains-Setup zusammen durchgehen)
- [x] ~~Interne Tutorials + Schulungsnachweis~~ **GEBAUT (02.07., Welle 10b):**
  Builder-Schalter „Öffentlich | Intern", Tab „Lernen", Absolviert-Haken,
  Owner-Nachweis-Tabelle. → Einmal selbst durchklicken.
- [x] ~~Landing-Hero: echter Produkt-Screenshot~~ **NEU GEBAUT (02.07.):** komplette
  Landing überarbeitet — echte Screenshots (Hub im Browser-Rahmen + Wizard im
  Handy-Rahmen), Video→Tutorial als Herzstück-Sektion, KI-Assistent+Insights-Sektion.
- [x] ~~Recorder v2: clicks.json im „Aus Video"-Dialog~~ **GEBAUT (02.07., Welle 10a).**
  → Zusammen mit Extension-Test einmal Ende-zu-Ende probieren (Aufnahme → beide
  Dateien hochladen → exakte Schrittgrenzen; wirkt erst nach `deploy.sh`).
- [x] ~~Mehrsprachige Hilfe-Seite~~ **GEBAUT (02.07., Welle 13):** EN/PL/TR mit
  Auto-Sync (Publish=Vollübersetzung, Edits=Delta). → Unter Branding Sprachen
  anhaken und einmal live ansehen. Offen v1: Kategorienamen + Druckansicht deutsch.
- [ ] **Ton/Vorlesen** (Welle 14 LÄUFT): OpenAI-TTS beim Publish, ▶ im Wizard.
  Offen danach: Stimme wählbar, Audio auch für Übersetzungen.
- [ ] **Mitarbeiter-Zugang light** (vorgeschlagen): Lern-Rolle (sieht nur „Lernen")
  + Team-Beitrittslink/QR statt Einzel-Einladungen, optional Domain-Filter.
- [x] ~~Video-Export~~ **GEBAUT (02.07., Welle 18):** „Als Video exportieren" in ZWEI
  Stilen (Klassisch/Screencast, vergleichbar), Brand-Intro + QR-Outro, Untertitel,
  Kapitelmarken, Verzweigungen vollständig. ⚠️ Wirkt erst nach deploy.sh; auf dem
  Server einmal prüfen: DejaVu-Fonts (fonts-dejavu-core) + NEXT_PUBLIC_APP_URL im
  Worker-Env (QR-/Outro-Link). → Folgewelle: 9:16-Hochformat + Musikbett (Format-
  Parameter existiert schon).
- [x] ~~Verzweigungen aus Video/Sprache~~ **GEBAUT (02.07., Welle 17):** Struktur-Pass
  im Worker erkennt gesprochene Fallunterscheidungen → Frage + Äste + Rejoin
  (konservativ, Fallback linear). ⚠️ Wirkt erst nach deploy.sh.
  → Offen als Idee: Builder-Aktion „Schritt in Frage umwandeln (KI schlägt Äste vor)".
- [ ] **TTS v2**: Audio auch für Übersetzungen (EN/PL/TR-Stimmen) + Stimme/Tempo pro
  Konto (Basis-Stimme ist seit 02.07. onyx auf gpt-4o-mini-tts; /stimmen.html wieder
  entfernen, wenn nicht mehr gebraucht).
- [x] ~~Echtzeit-/Sofort-Aufbau~~ **GEBAUT (05.07., Welle 22, Tango-Stil):**
  Extension-Modus „Sofort-Anleitung" — Screenshot + Element-Box je Klick,
  fertiger Entwurf ohne Video. → Richard: Extension in Chrome neu laden
  („Entpackt laden") und einmal real durchklicken (captureVisibleTab/Timing
  ist headless nicht testbar). Denkbare Stufe 2: Schritte schon WÄHREND der
  Aufnahme einzeln hochladen (Live-Aufbau im Builder).
- [x] ~~Tier-Gates~~ **GEBAUT (02.07., Fable):** plan 'business' (Migration 0024),
  Gates: Sprachen/KI-CI/Intern/TTS = Business (serverseitig), Admin-Schalter 3-stufig,
  neue Preistabelle 0/29/79 + FAQ. RichardTax + Muster GmbH = Business gesetzt.
  → OFFEN: Video-Limit Free=3 serverseitig (video_jobs-Insert läuft klientseitig via
  RLS — braucht Policy/Trigger, kommt mit der LemonSqueezy-Welle); Team-bis-5 ebenso.
- [ ] **Live-Führung auf der echten Website** (Richard/Tango, 05.07.): Tutorial öffnen
  → die Extension (oder das Embed-Script) hebt die Buttons DIREKT auf der echten
  Website hervor und blättert beim Klicken weiter (WalkMe/Tango-Guidance-Prinzip).
  Technische Brücke: Der Sofort-Modus muss pro Schritt zusätzlich einen robusten
  ELEMENT-SELEKTOR speichern (CSS-Pfad + Text + Rolle — Rechteck allein reicht
  nicht, um das Element später wiederzufinden). Selektor-Erfassung als kleiner
  Vorab-Schritt lohnt früh: dann können heute aufgenommene Anleitungen später
  geführt abgespielt werden.
- [ ] **Autopilot v2: Anleitungs-TÜV per Agent** (05.07., aus Tango-Beobachtung
  abgeleitet): Statt nur KI-Recherche klickt ein Sandbox-Browser-Agent die
  Anleitung bei öffentlich erreichbaren Abläufen real nach und meldet den
  konkreten kaputten Schritt. (Ausführen FÜR den Endkunden — Tango-Stil —
  bewusst verworfen: Haftung/Vertrauen/Zugangsdaten passen nicht zu unserem
  Endkunden-Markt.)
- [ ] **Auto-Schwärzung bei der Aufnahme** (Tango „Automatic blurring", 05.07.):
  Sofort-Modus erkennt sensible Felder (input type=password, E-Mail-/IBAN-Muster
  im Screenshot-Bereich) und setzt Blur-Vorschläge automatisch; Nutzer bestätigt.
- [ ] i18n der Marketing-/Endkunden-Seiten (alles hart deutsch)

## 🧰 Klein / Technik (jederzeit nachziehbar)

- [ ] M7: /reset nur mit frischem Recovery-Link nutzbar machen (Plan in REVIEW §F)
- [ ] getClaims-Middleware (nur falls warme /app-Navigation zu träge wirkt)
- [ ] Admin-Template-Publish invalidiert Kunden-Hub-Caches nicht (1h-Deckel greift)
- [ ] Supabase Image-Transform für Endkunden-Bilder (braucht passenden Supabase-Plan)
- [ ] Sentry/Error-Tracking (braucht DSN → Konto)
