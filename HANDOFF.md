# Steply — Übergabe (Stand 06.07.2026)

> Schneller Einstieg für eine neue Session. Details: **OVERVIEW.md** (was es gibt),
> **STATUS.md** (Stand), **REVIEW.md** (Wellen-Changelog), **TODO.md** (offene Punkte).
> Live-Tests: `scripts/test-*-live.mjs`.

## Was es ist
Embeddable Klick-Tutorial-SaaS (Next 16 App Router + cacheComponents/PPR, React 19,
Tailwind v4, Supabase, shadcn **auf Base UI** (nicht Radix!), OpenAI direkt + ElevenLabs).
Live: **https://tutax-ivory.vercel.app**. Repo: `c:\Users\Richa\Desktop\steuer tutorial\tutax`.

## Workflow (wichtig)
Fable schreibt Arbeitspakete → Opus-Agenten coden in Git-Worktrees auf `welle-XX-opus`
→ Fable reviewt, testet, merged, pusht. **Nur `main` wird gepusht** (Vercel überspringt
sonst Builds — Dedup-Falle). Nach jedem Merge: `git branch -f staging main`, Worktree +
Branch aufräumen. Agenten committen `Co-Authored-By: Claude Opus 4.8`, Fable `Claude Fable 5`.
Verifikationspflicht vor Abschluss (AGENTS.md): `npm run build` grün + relevante Live-Tests grün.

## Diese Session gebaut (alles live auf main)
- **Extension v1 → v2.4.1** — Seitenleiste statt Popup (Tango-Stil), Ein-Klick-Verbinden
  (Pairing über /api/recorder/me), Download-Seite `/extension` (ZIP + Auto-Update-Hinweis),
  „Aufnehmen"-Karte öffnet Panel direkt (sidePanel.open), Nachimpfung altoffener Tabs.
- **Aufnahme-Qualität** — saubere Labels (kein styled-components-CSS mehr), Eingabe-Schritte
  per blur (zeigt ausgefülltes Feld), Dead-Click-Filter, Checkbox/Schieberegler,
  Kachel-Überschriften statt Metadaten, zitat-sichere Titel, Selektor-Vorbau (steps.selector).
- **Aufnahme-Anker (W27)** — „Ab hier mit Extension aufnehmen" an jedem Builder-Einfügepunkt +
  Verzweigungs-Ast; guide-complete `target{tutorialId,anchor}`; Fallback „nie verloren".
- **Auto-Schwärzung (W28)** — Passwort-/Key-/IBAN-**Felder** werden automatisch als Blur
  vorgeschlagen (suggested:true) + Publish-Wächter. NUR Formularfelder — angezeigter Text
  (z. B. Secret in einer Tabelle) noch NICHT (= Stufe 2, offen).
- **Auth-Mails repariert** — Magic Link war echt kaputt: verifyOtp lief in einer Server-
  Component-Seite, Next verwarf das Session-Cookie → ausgeloggt. Fix: `/auth/confirm` ist
  jetzt ein **Route-Handler** (darf Cookies setzen), impliziter Flow → `/auth/hash`.
  E2E gegen Prod bewiesen. Deutsche Steply-Templates in `supabase/email-templates/`
  (token_hash-Direktlinks, type=email/recovery/email_change).
- **Mehrsprachigkeit komplett (W29)** — Hilfe-Seite zu 100 % übersetzt: Kategorienamen
  (categories.name_i18n, Migration 0028), Druckansicht (?lang), Beschreibung im Delta-Sync,
  Chat antwortet in Besuchersprache. Offen: globale Admin-Kategorien + Impressum/Datenschutz.
- **Sprachen von Anfang an (W30)** — Sprachfrage im Onboarding (Free = Business-Teaser) +
  Browser-Sprach-Vorschlag auf `/h` (dezente Leiste, nie Auto-Redirect).
- **Kleinfixes** — Team-Entfernen-Knopf, CapsLock-Warnung (alle 5 Passwortfelder),
  editierbare Kurzbeschreibung im Builder (war Geisterfeld), Auto-Refresh nach Upload (kein
  F5), Entf löscht Form im Bild-Editor, mobiler „Aufnehmen"-Tab (Base-UI-render-Props-Bug).

## Richard muss noch (nur er kann das)
1. **Supabase-SMTP auf Resend** stellen — sonst kommen bei KUNDEN keine Magic-Link-/
   Passwort-Mails an (Notfall-Versand nur an Projekt-Team). Werte in TODO.md.
2. **Vercel-Env** prüfen: RESEND_API_KEY + INVITE_FROM_EMAIL (`"Steply" <noreply@dentdoc.de>`).
3. **Auth-Mail-Templates** aus `supabase/email-templates/` ins Dashboard kleben (falls offen).
4. **Extension neu laden** → v2.4.1, real testen.
5. **Vercel-Tutorial schwärzen + Azure-Secret rotieren** (Key stand im Klartext im Screenshot).
6. **`deploy.sh` auf Hetzner** — schaltet Video-Export, Verzweigungs-Erkennung, Worker-
   Fortschritt, topic-context, Schutzgitter, speech-v2-Backfill frei (schlummert seit Tagen).
   Danach Server-Check: fonts-dejavu-core + NEXT_PUBLIC_APP_URL im Worker-Env.
7. **CRON_SECRET** in Vercel (sonst Aktualitäts-Autopilot aus). Impressum/Datenschutz-Angaben.
8. Optional: **Chrome-Web-Store-Konto** (5 $ einmalig) → dann `extension/store/LISTING.md`.

## Offene „Go?"-Entscheidungen (baubar, warten auf Freigabe)
- **Auto-Schwärzung Stufe 2** — angezeigten Text nach Secret-Mustern scannen
  (`sk-…`, `postgresql://…`, JWT, lange Zufallsketten) → Blur-Vorschläge wie bei Feldern.
- **Live-Führung auf der echten Website** (WalkMe/Tango-Stil) — Selektoren sammeln wir seit W24.
- **Anleitungs-TÜV per Agent** — Sandbox-Browser klickt Anleitung nach, meldet kaputten Schritt.
- **LemonSqueezy-Bezahlung** — Gating existiert schon, nur Checkout+Webhook fehlt.
- **KI-Beschreibungs-Vorschlag** — Feinschliff schreibt Tutorial-Kurzbeschreibung gleich mit.

## Fallen / Umgebung
- Windows/PowerShell 5.1 (kein `&&`); Bash-Tool separat. Typografische Quotes/Umlaute in
  Heredocs vermeiden → Write-Tool oder Python-Datei nutzen.
- Alter `next dev` hält `.next` und bricht Tests/Builds → vor Live-Tests stale node-Prozesse
  killen. Screenshots >2000px laden nicht im Chat.
- Migrationen inline via pg + SUPABASE_DB_URL angewendet (zuletzt 0028). ElevenLabs Creator-Plan
  aktiv (Voice „Helmut Clark" TUKJhQmz3RPYBNAgC5A1). Extension-Onboarding: Chrome ≥ 114/116.
