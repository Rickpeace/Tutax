# Steply — Produkt- & Code-Review (Stand: 01.07.2026)

**Kontext:** MVP in aktiver Entwicklung. Vollständige Findings aus 4 parallelen
Deep-Reviews (Endkunden-Oberfläche, Funnel/Settings, Builder/Authoring,
Plattform/Next.js) + eigene Verifikation. Checkboxen zum Abhaken beim Fixen.
Severity: 🔴 kritisch · 🟠 hoch · 🟡 mittel · ⚪ niedrig.

> Dieses Dokument ist eine **Roadmap, kein Zeugnis** — die glücklichen Pfade sind
> durchweg gut gebaut; fast alles hier ist „letzter Meter" (Ränder, Fehlerfälle,
> Betrieb), nicht Architektur.

---

## Was gut ist (von 4 unabhängigen Reviews bestätigt)

- **Wizard** genau richtig reduziert für Nicht-Techniker: 1 Schritt/Karte, echter
  Zurück-Verlauf, klarer End-Screen.
- **Highlight-Editor überraschend komplett:** Rechteck, Ellipse, Pfeil, Blur, Lupe,
  4 Farben, 8 Resize-Handles mit großen Touch-Flächen. (Marketing-Versprechen gedeckt!)
- **Theming diszipliniert:** alles über CSS-Variablen mit Defaults; Skin-CSS strikt
  gekapselt und auf „malende" Properties beschränkt — Kunden-Design kann das Layout
  nicht zerbrechen.
- **Chat robust:** NDJSON-Streaming mit Fallback, localStorage mit try/catch
  (übersteht Safari/Third-Party-iFrame), Quellen-Links, Eskalations-Buttons.
- **Optimistic-UI-Architektur im Builder** sauber (Client-UUIDs, pending-Counter
  gegen Resync-Races, Fluss-Reihenfolge-Navigation); tree.ts deterministisch + kommentiert.
- **Auth-UX überdurchschnittlich:** übersetzte Fehler, Anti-Enumeration beim Reset,
  sichtbare Passwortregel, Loading-States, Magic-Link-Alternative.
- **DB-Schema solide:** FKs mit sinnvollem on delete, partieller Unique-Index
  (account_id, slug), unique Invite-Tokens, Position-Indizes, RLS überall.
- **KI-Routen kostenbewusst:** Token-Caps, Input-Kappung, Timeouts (Drift), Rate-Limit (Chat).
- **Funnel technisch dicht:** Signup ohne Bestätigungshürde → Onboarding mit Skip →
  Empty-State-CTA → Publish-Toggle → Einbetten-Anleitung. Erstes Erfolgserlebnis ~10 Min.

---

## 🚨 Top 5 (zuerst fixen)

- [ ] 🔴 **Blur ist Schein-Schwärzung** *(selbst verifiziert)* — Blur nur als
  SVG-Filter über dem Bild (`viewer-image.tsx:106`); `publishTutorial` kopiert das
  **unredigierte Original** in den public Bucket (`app/actions.ts:198-206`).
  Bild-URL öffnen = Steuernummern im Klartext, Marketing verspricht „DSGVO im Editor".
  → Blur beim Upload/Publish **in die Pixel brennen** (Canvas client- oder sharp serverseitig).
- [ ] 🔴 **Impressum + Datenschutz sind Platzhalter** (live verlinkt, Abmahnrisiko);
  Datenschutz behauptet fälschlich „keine Drittland-Übermittlung" trotz OpenAI.
  → echte Angaben; OpenAI als Auftragsverarbeiter inkl. Drittland/DPF aufnehmen.
- [ ] 🔴 **Kein Billing, keine Limit-Durchsetzung** — kein Stripe, Upgrade-Buttons
  disabled, „Preise sind Platzhalter" für Kunden sichtbar (`abo/page.tsx:64-79`);
  Free-Limits (5 Tutorials, Branding) nirgends enforced (`createTutorial` ohne Limit).
  → Stripe Checkout + Portal; Limits gaten; Preise auf die Landing.
- [ ] 🟠 **Kein error.tsx / not-found.tsx / global-error.tsx im ganzen Projekt** —
  Fehler/vertippter Link zeigt Endkunden die **englische** Next-Standardseite im
  Kanzlei-CI. → gebrandete Fehler-/404-Seiten (Root + /h), deutsch.
- [ ] 🟠 **Publish-Moment verpufft** — `toggleLive` wirft `{slug, accountSlug}` weg
  (`tutorial-card.tsx:69-79`), kein Erfolgs-Toast, kein Link. → „Live ansehen /
  Link kopieren"-Toast; beim ersten Publish Hinweis auf Einstellungen → Einbetten.

---

## A. Endkunden-Oberfläche (/h)

### UX
- [ ] 🟠 `wizard.tsx:34-51` Kein Fortschritt („Schritt 3 von 8") + kompletter
  Zustandsverlust bei Reload/Zurück → Position in sessionStorage oder `?step=`.
- [ ] 🟡 `hub-browser.tsx:55-60` Leere Suche = Sackgasse → CTA „Fragen Sie den
  Hilfe-Assistenten" (Chat öffnen) + Reset-Button.
- [ ] 🟡 `chat-widget.tsx:151` Fehlerblase ohne „Erneut versuchen"; Nutzer-Frage ist
  weg (Input vor fetch geleert) → Retry-Button, der die letzte Frage erneut sendet.
- [ ] ⚪ `hub-browser.tsx:27-32` Suche matcht nur Titel+Beschreibung, nicht
  Schritt-Inhalte → serverseitige Suche (FTS/pgvector existiert fürs RAG).

### Mobile + Accessibility
- [ ] 🟠 `chat-widget.tsx:159-169` Kein Fokus-Management: kein role="dialog"/
  aria-modal, kein Autofokus, kein Esc, kein aria-expanded → für Tastatur/Screenreader
  unbenutzbar.
- [ ] 🟠 `chat-widget.tsx:188` Kein aria-live → gestreamte Antworten für Screenreader
  stumm (polite-Wrapper, ggf. erst nach done announce).
- [ ] 🟠 `theme.ts:89` + `wizard.tsx:101-109` **Keine Kontrastprüfung** für
  Kundenfarben: brand-accent ungeprüft als Button-BG mit weißem Text UND als Text auf
  Weiß → helles Kanzlei-Gelb = unlesbar. → Luminanz prüfen, `--brand-accent-contrast`
  ableiten, zu helle Accents für Text abdunkeln.
- [ ] 🟠 `wizard.tsx:37-40` Schrittwechsel ohne Fokus-/Announce-Management, kein
  Scroll-to-top → Fokus auf Schritt-Überschrift setzen (tabIndex=-1 + focus()).
- [ ] 🟡 `viewer-image.tsx:36` Screenshot immer `alt=""`, obwohl Kerninhalt →
  mind. `alt={step.title}`, besser Alt-Feld im Editor.
- [ ] 🟡 `chat-widget.tsx:169` `h-[30rem]` fix + bottom-24 → auf iPhone SE Header
  abgeschnitten, iOS-Tastatur verdeckt Input → `h-[min(30rem,calc(100dvh-7rem))]`.
- [ ] 🟡 `hub-browser.tsx:47-52` Suchfeld ohne aria-label/type="search"; Trefferzahl
  nicht announced → aria-label + role="status"-Zeile.
- [ ] ⚪ `chat-widget.tsx:177-184` „Neu"-Button ~24px Touch-Ziel + löscht ohne
  Rückfrage → größer + Bestätigung.
- [ ] ⚪ `chat-widget.tsx:198-200` Enter ohne isComposing-Check (IME).

### Technik (SEO / iFrame / Performance)
- [ ] 🟠 `h/*/page.tsx` Metadata nur `title`: keine description, kein openGraph/
  og:image, kein metadataBase → keine Link-Preview beim Kern-Usecase „Link per
  WhatsApp/Mail teilen". Kanzlei-Logo existiert bereits → nutzen. Zudem
  robots-Strategie: /h indexierbar, /app noindex.
- [ ] 🟡 `einbetten/page.tsx:12` iFrame-Snippet mit fixer height=700 →
  Scrollbalken-im-Scrollbalken; kein loading="lazy" → postMessage-Auto-Höhe oder
  mind. Hinweis + lazy. (Positiv: Framing funktioniert, localStorage im iFrame ok.)
- [ ] 🟡 `viewer-image.tsx:36` + `wizard.tsx:67-69` `<img>` ohne width/height →
  Layout-Shift bei jedem Schritt; `image_width/height` liegen in der DB → durchreichen,
  aspect-ratio setzen.
- [ ] 🟡 `public-image.ts:4-6` Originale ungedrosselt aufs Handy → Supabase
  Image-Transform (`?width=800`) oder vorskalierte Varianten.
- [ ] ⚪ `h/*/page.tsx` Google-Fonts-<link> ohne preconnect zu fonts.gstatic.com und
  ohne precedence → FOUT. → preconnect ergänzen.

### Fehlende Features (Endkunde)
- [ ] 🟡 **„War das hilfreich? 👍/👎"** am Fertig-Screen — geringster Aufwand,
  zugleich erstes Nutzungssignal für die Kanzlei (Analytics-Grundstein).
- [ ] 🟡 Druck-/PDF-Ansicht (alle Schritte untereinander) — Zielgruppe druckt.
- [ ] ⚪ Schriftgrößen-Option; Video/GIF pro Schritt; i18n (alles hart deutsch).

---

## B. Funnel / Monetarisierung / Marketing / Settings

### Funnel
- [ ] 🟡 `onboarding-wizard.tsx:81-86` Wizard verspricht KI-CI „sobald aktiv",
  Feature ist aber live → im Onboarding direkt aus der eingegebenen Website anstoßen
  (Wow-Moment).
- [ ] ⚪ `onboarding/actions.ts:33` Onboarding unwiederholbar → „Einrichtung erneut
  zeigen"-Link in Settings.
- [ ] ⚪ `app/page.tsx:114-126` Empty-State ohne Fortschritts-Checkliste (die 7
  Schritte aus /anleitung existieren schon als Text).

### Monetarisierung
- [ ] 🟠 Free-Limits enforce'n: `createTutorial` ohne Limit, Chatbot/KI-CI/Logo für
  alle frei, „powered by Steply" für alle → ohne Gating kein Upgrade-Motiv.
- [ ] 🟠 `page.tsx` Landing ohne Preise (nur „0 €") → Pricing-Sektion mit den 3
  Tarifen aus abo/page.tsx.
- [ ] ⚪ Trial-Logik: bewusst entscheiden (free-forever bis Stripe vs. Trial) und
  dokumentieren.
- [ ] ⚪ Kurzfristig: „Preise sind Platzhalter"-Fußnote raus; „Pro vormerken"-CTA
  (Mailto) zur Nachfragemessung.

### Marketing
- [ ] 🟠 Zielgruppen-Sprache fehlt: „Steuerkanzlei/Mandant/DATEV" kommt in keiner
  UI-Zeile vor — alles „Organisationen". Entweder Kanzlei-Landing oder bewusst
  generisch (dokumentieren).
- [ ] 🟡 Kein echter Screenshot/keine Demo auf der Landing (nur Mocks) → öffentlichen
  `/h/demo`-Hub bauen und verlinken (stärkster Beweis).
- [ ] 🟡 Null Social Proof → solange Kunden fehlen: Gründer-Note + „EU-Hosting,
  DSGVO"-Trust-Block.
- [ ] ⚪ `page.tsx:113` „KI übernimmt Ihr CI" trägt „bald"-Badge, ist aber live →
  Badge weg, Feature verkaufen.

### Auth + Settings
- [ ] 🟡 `settings/konto/page.tsx:49-55` „Konto löschen → Support kontaktieren", aber
  nirgends eine Support-Adresse (Impressum Platzhalter) → Mailto ergänzen.
- [ ] 🟡 E-Mail-Adresse ändern fehlt komplett → updateUser({email}) + Bestätigung.
- [ ] ⚪ `konto/actions.ts:11` changePassword gibt englische Supabase-Fehler roh
  zurück → uebersetzeAuthFehler wiederverwenden.
- [ ] ⚪ `team-manager.tsx:137` Mitglied entfernen nutzt natives confirm(), Tutorial-
  Löschen hat schönen Dialog → vereinheitlichen.
- [ ] ⚪ `team/page.tsx:45` duzt („Du gehörst…"), Rest siezt → vereinheitlichen.

### Recht + Vertrauen
- [ ] 🟡 Chat-Widget ohne KI-/Datenschutz-Hinweis für Mandanten → „Antworten werden
  automatisiert per KI erstellt – bitte keine personenbezogenen Daten eingeben" + Link.
- [ ] 🟡 Gehostete /h-Seiten ohne Impressum-/Datenschutz-Link → beide in den Footer
  neben „powered by Steply".

---

## C. Builder / Authoring

### Fehlende Features
- [ ] 🟠 **Kein Schritt-Umordnen** (kein Drag&Drop, kein Hoch/Runter) — Reihenfolge
  ändern nur destruktiv → „Nach oben/unten"-Buttons im StepPanel (Branch-Verdrahtung
  umschreiben).
- [ ] 🟡 Schritt duplizieren fehlt (nur ganzes Tutorial); Copy zwischen Tutorials fehlt.
- [ ] 🟡 Kein Undo für strukturelle Aktionen; Schritt-Löschen unwiederbringlich →
  Soft-Delete mit „Rückgängig"-Toast (Sonner-Action).
- [ ] 🟡 Kein Text-Werkzeug im Highlight-Editor („1.", „Hier klicken") — Pfeil ohne
  Beschriftung oft nicht selbsterklärend.
- [ ] 🟡 `rich-text.tsx` + `rich-text-view.tsx:42-47` **Kein Link-Support**: Tiptap
  akzeptiert Links beim Einfügen, Viewer rendert sie nicht → **beim Kunden toter
  Text** (underline/strike ebenso). → Link-Button + Viewer-Rendering.
- [ ] ⚪ Keine Tastatur-Shortcuts (Entf für Highlight, Strg+S, Pfeiltasten-Nudge) —
  billig, große Wirkung.

### UX-Reibung
- [ ] 🟡 `flow.tsx` skaliert mäßig ab ~20 Schritten: kein Zoom, keine Suche, kein
  Collapse-All → Titel-Suchfeld mit Scroll-to + Collapse-Toggle.
- [ ] 🟡 `image-field.tsx:74-86` „Bild ersetzen" behält alte (falsch sitzende)
  Highlights → nachfragen „Markierungen behalten/löschen?".
- [ ] 🟡 `builder.tsx:246-270` Frage-Toggle AUS löscht kommentarlos alle Antworten
  außer der ersten + verwaist Teilbäume (unsichtbar, aber in Zählung/Nav) →
  Confirm-Dialog + „nicht verbundene Schritte"-Hinweis im Flow.
- [ ] 🟡 `article-editor.tsx:77-105` KB-Editor: kein Auto-Save, kein Verlassen-Guard
  (auch kein beforeunload im Builder) → Änderungen können stumm verloren gehen.
- [ ] ⚪ Drift-Check: nur manuell (kein Cron), Ergebnis-Toast ohne Link zu /app/alerts,
  **kein Cooldown** (teuerster Call: web_search) → 1×/Tutorial/Stunde + Link im Toast.
- [ ] ⚪ `upload.ts:45-51` Signierte URLs laufen nach 1 h ab → in langen Sessions
  brechen Bilder stumm (Re-Sign / onError-Retry).

### Code-Bugs
- [ ] 🟡 `step-panel.tsx:326` „Speichern & weiter" wartet save() nicht ab → Navigation
  vor Ergebnis, Fehler zeigt sich nur als Refresh. → await + nur bei Erfolg navigieren.
- [ ] 🟡 `builder.tsx:148-151` handleAddStep-Fallback ohne Blatt: hängt Branch mit
  position 0 an Schritt mit vorhandenem Ausgang → neuer Schritt **unsichtbar/verwaist**.
  → position max+1 bzw. nur echte Blätter verdrahten.
- [ ] ⚪ `step-panel.tsx:131-143` KI-Vorschlag persistiert Highlight sofort, Titel/Text
  nur dirty → „Verwerfen" entfernt das KI-Highlight nicht (halbe Transaktion).
- [ ] ⚪ `highlight-editor.tsx:74,117` Move/Resize nicht auf 0..1 geklemmt → Formen
  fast ganz aus dem Bild schiebbar, im Viewer unsichtbar. → clamp wie im Crop-Dialog.
- [ ] ⚪ `category-picker.tsx:33-42` Optimistische Auswahl ohne Rollback bei Fehler.
- [ ] ⚪ `preview/[id]/page.tsx:48-52` Signierte URLs sequenziell (Wasserfall) →
  Promise.all.
- [ ] ⚪ `alerts/actions.ts:50-64` Drift-Vorschlag→Schritt-Zuordnung per Titel-Fuzzy-
  Match fragil → Step-IDs schon im Check-Ergebnis speichern.
- [ ] ⚪ Video-KI erzeugt nur Rechteck-Highlights (Editor kann mehr) — ok, aber
  Potenzial.

---

## D. Plattform / Next.js / Betrieb

- [ ] 🟠 `next.config.ts` komplett leer: **keine Security-Header** — /app (Builder,
  Team) ist clickjackbar → headers(): X-Frame-Options DENY / CSP frame-ancestors
  'none' für alles **außer** `/h/:path*` (muss einbettbar bleiben); Basis-CSP mind.
  Report-Only.
- [ ] 🟠 **Kein Error-Tracking** (kein Sentry, kein instrumentation.ts) — Produktions-
  fehler beim Kunden unsichtbar → Sentry + onRequestError.
- [ ] 🟡 Kein CI (kein .github/): Vercel deployt ungeprüft → GitHub Action mit
  next build + eslint pro Push/PR (Live-Tests optional dazu).
- [ ] 🟡 Env-Vars überall per `!`-Assertion, keine Boot-Validierung → env-Check in
  instrumentation.ts (klarer Fehler statt kryptischem Request-Crash).
- [ ] 🟡 Kein robots.ts / sitemap.ts / manifest; kein metadataBase / OG-Default →
  ergänzen (robots: Disallow /app, /api; sitemap für /h-Hubs).
- [ ] ⚪ Durchgängig `<img>` statt next/image → mind. loading="lazy" + sizes;
  next/image mit remotePatterns abwägen.

## E. Backend / API / Datenbank

- [ ] 🟠 `lib/openai.ts:9` OpenAI-Client ohne timeout/maxRetries (Default 600 s!) bei
  maxDuration=30 → hängender embed killt Function ohne Antwort. →
  `new OpenAI({ timeout: 20_000, maxRetries: 1 })`.
- [ ] 🟡 `api/steps/suggest/route.ts:63-77` Einzige Route ohne Token-Cap; kein
  maxDuration (Vercel-Default ~15 s, Vision detail:high!); rohes e.message an Client →
  maxDuration 30 + Cap ~300 + generische Fehlermeldung.
- [ ] 🟡 `api/tutorials/[id]/check/route.ts` Drift ohne Rate-Limit/Cooldown (teuerster
  Call) + DB-Writes ungeprüft (Ergebnis kann lautlos verschwinden) → Cooldown +
  Error-Checks.
- [ ] 🟡 `lib/kb.ts:59-75,124-146` Delete-then-Insert nicht atomar, {error} ignoriert →
  Tutorial kann still aus dem RAG-Index verschwinden → Fehler prüfen, Insert-vor-Delete.
- [ ] 🟡 **HNSW-Index nie angelegt** (0004 auskommentiert) → match_kb macht Seq-Scan
  über ALLE Embeddings pro Chat-Nachricht; degradiert linear mit Kundenzahl. →
  `create index ... using hnsw (embedding vector_cosine_ops)` + Index
  (source_type, source_id) für Delete-Pfade.
- [ ] ⚪ `tutorials.updated_at` ohne Trigger; Step-Änderungen bumpen es nicht →
  Dashboard-Sortierung/„Geändert vor…" lügt → moddatetime-Trigger + Bump.
- [ ] ⚪ status/freshness/severity als freier text ohne CHECK-Constraints.
- [ ] ⚪ Chat-Rate-Limit ist pro Serverless-Instanz (20×N/min, Cold-Start-Reset) —
  als Best-Effort ok; für echten Schutz später Upstash Redis/Vercel KV.

## F. Bekannt & bewusst offen (aus früheren Audits)

- [ ] 🟡 **M7 updatePassword**: /reset ist von jeder eingeloggten Session nutzbar
  (Passwort-Übernahme bei entsperrtem Gerät). Sauberer Fix braucht Recovery-Nonce im
  Auth-Confirm-Fluss — bewusst zurückgestellt (Umbau-Risiko), Plan liegt vor.
- [ ] ⚪ Middleware getUser→getClaims (warmer /app-Pfad): nur nötig, falls Inhalt nach
  Skeleton weiter träge; vorher Supabase-SSR-Docs prüfen (Token-Refresh!).
- [ ] ⚪ cacheComponents-Pilot auf /h (statische Instant-Shell): gestufte Migration,
  cache-components-Skill + Bundled Docs nutzen.
- [ ] ⚪ Analytics/Events-Tabelle (Entwurf 0015 existierte, verworfen — bei Analytics-
  Feature neu aufsetzen; „War das hilfreich?" ist der Einstieg).
- [ ] ⚪ Video-Worker-Deploy prüfen: Batch-3-Fixes (reapStale, note, Rotation) wirken
  erst nach `deploy.sh` auf Hetzner.

---

## Muster (was wir strukturell besser machen)

1. **„Demo-fertig" ≠ „belastbar fertig":** Vor jedem Feature-Haken fragen: *Was
   passiert, wenn ein echter Kunde das benutzt?* (Blur, Abo, Datenschutz.)
2. **Blindflug beenden:** Analytics + Error-Tracking + Feedback-Widget — sonst ist
   unbeantwortbar, ob je ein Mandant eine Anleitung durchgeklickt hat.
3. **Letzter Meter:** Publish-Moment, 404/Fehler-Seiten, leere Suche, Chat-Retry —
   die Ränder entscheiden über den Eindruck beim Kunden.
4. **Zielgruppe scharf ziehen:** Kanzlei-Sprache in Landing + Beispielen, oder
   bewusst generisch dokumentieren.

## Roadmap

**Sofort (Risiko/Vertrauen):** Blur einbrennen → Impressum/Datenschutz echt + KI-
Hinweis → error/not-found gebrandet → Publish-Erfolgsmoment → Kontrast-Ableitung →
Security-Header → OpenAI-Timeout + suggest-Cap.

**Kurzfristig (Geschäft/Sichtbarkeit):** Stripe + Limit-Gating · OG/SEO-Paket ·
„War das hilfreich?" + Events · Schritt-Umordnen · RichText-Links · KB-Guard ·
HNSW-Index · Sentry · CI-Action.

**Mittelfristig:** Kanzlei-Landing + Demo-Hub · Druckansicht · Wizard-Resume ·
Bild-Transform · cacheComponents-Pilot · Redis-Rate-Limit · i18n.
