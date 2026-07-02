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
- [ ] **Steply-Recorder-Extension testen**: `chrome://extensions` → Entwicklermodus →
  „Entpackt laden" → Ordner `extension/`. Ergebnis: aufnahme.webm + clicks.json.
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
- [ ] **Interne Tutorials + Schulungsnachweis** (Zugriffsschutz + „Mitarbeiter X hat Y
  absolviert ✓" — neuer Markt, braucht ein kurzes gemeinsames Konzept)
- [ ] **Landing-Hero: echter Produkt-Screenshot** (Material: /h/demo + /h/steply)
- [ ] Recorder-Extension v2: clicks.json direkt im „Aus Video"-Dialog mit hochladen
  (Feld existiert noch nicht; Worker versteht clicks bereits)
- [ ] i18n der Endkunden-Seiten (alles hart deutsch)

## 🧰 Klein / Technik (jederzeit nachziehbar)

- [ ] M7: /reset nur mit frischem Recovery-Link nutzbar machen (Plan in REVIEW §F)
- [ ] getClaims-Middleware (nur falls warme /app-Navigation zu träge wirkt)
- [ ] Admin-Template-Publish invalidiert Kunden-Hub-Caches nicht (1h-Deckel greift)
- [ ] Supabase Image-Transform für Endkunden-Bilder (braucht passenden Supabase-Plan)
- [ ] Sentry/Error-Tracking (braucht DSN → Konto)
