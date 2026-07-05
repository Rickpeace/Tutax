# Handoff: Steply — Klick-Anleitungen aus Screencasts

## Overview
Steply ist eine Plattform, die aus Screencast-Videos (oder manuell aus Screenshots) Schritt-für-Schritt-Klick-Anleitungen erzeugt. Es gibt zwei Zielgruppen: **Kunden** (öffentliches Hilfe-Center ohne Login, im Branding des jeweiligen Kunden) und **Mitarbeiter/intern** (Bibliothek mit Kategorien, Status und Rechten). Dieses Paket enthält die finalen Design-Referenzen für App-UI, Viewer, öffentliches Hilfe-Center, Mobile und Marketing-Landing-Page.

## About the Design Files
Die Dateien in diesem Bundle sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und Verhalten zeigen, kein Produktionscode. Aufgabe ist es, diese Designs **in der Zielumgebung des Codebases nachzubauen** (React, Vue, etc.) mit den dort etablierten Patterns und Libraries. Falls noch keine Umgebung existiert: passendes Framework wählen (z. B. Next.js/React) und dort implementieren.

`Steply Explorations.dc.html` ist ein Explorations-Canvas mit mehreren Iterationen (Turn 1 unten = älteste, Turn 5 oben = neueste). **Maßgeblich ist alles ab Turn 2:**
- Bibliothek (intern, Desktop): Option **2a**
- Interne Bibliothek mobil: Option **2b** links (heller Screen)
- Viewer (hell, warm): Option **3a** (Desktop) und **4a** rechts (Mobil)
- Öffentliches Hilfe-Center: Option **3b** (Desktop) und **4a** links (Mobil)
- Marketing-Landing-Page: Option **4b** (Desktop) und **5a** (Mobil, 2 Screens)

**Verworfen:** kompletter Turn 1 (1a/1b/1c) sowie der dunkle mobile Viewer in 2b rechts — nur Kontext, nicht umsetzen. Die Design-Sprache aus 1b (warm, freundlich) lebt in allen Screens ab Turn 2 weiter.

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände, Radien und Copy sind final gemeint. Screenshot-/Logo-Flächen sind bewusst gestreifte Platzhalter (mit Monospace-Beschriftung) — dort kommen echte Inhalte (Tutorial-Screenshots, Kundenlogos) hin.

## Screens / Views

### 1. Bibliothek (intern, Desktop) — Option 2a
- **Zweck:** Mitarbeiter finden, filtern und verwalten alle Anleitungen.
- **Layout:** Topnav (64px, weiß, 2px Border unten) → darunter zweispaltig: Kategorien-Sidebar 230px fix + Main (Kartenraster 3 Spalten, `gap:14px`).
- **Topnav:** Logo (Kreis 32px, #EF6A4E, weißes „S", 900) + Wortmarke 19px/900; Pill-Navigation (aktiv: #33291F Hintergrund, Text #FDF9F3; inaktiv: #8A7A63); Suche als Pill (weiß, 2px Border #F0E7D9, radius 999); Primär-Button „＋ Neue Anleitung" (#EF6A4E, radius 999, `box-shadow: 0 4px 0 #D3543A` — der „harte Schatten" ist ein Markenzeichen); Avatar 34px rund.
- **Sidebar-Gruppen:** BEREICH (Alle/Für Kunden/Intern mit Zähler-Badges), KATEGORIEN (Farb-Quadrat 10px + Name + Zähler; aktive Zeile im Kategorie-Pastell, z. B. #FFE8E2 mit Text #A8452E), KUNDEN (20px-Monogramm-Quadrate). Gruppenlabels: 11px/800, letter-spacing 0.08em, #B3A48C.
- **Tutorial-Karte:** weiß, 2px Border #F0E7D9, radius 18px; Thumbnail 110px (Platzhalter: `repeating-linear-gradient(-45deg, …)` im Kategorie-Pastell); Chips oben: links Kategorie (weiß, farbiger Punkt), rechts Bereich („Kunde" = #33291F invers, „Intern" = weiß mit Border); Body: Titel 14px/800, Meta-Zeile 12px/600 #B3A48C (Kunde/Kategorie · X Schritte · Y Min.), Fußzeile: Status-Chip (Veröffentlicht: bg #DCF3EF text #118576; Entwurf: bg #FDEECD text #C07D16) + Aufrufe + Autor-Avatar 22px.
- **Filterleiste:** H1 22px/900 + Zähler; rechts Dropdown-Pills „Status: Alle ▾", „Sprache: DE ▾", „Neueste zuerst ▾".
- **Leere Karte:** gestrichelte Border #E3D7C2, „＋ Neue Anleitung / Screencast oder Screenshots".

### 2. Viewer (Desktop, hell) — Option 3a
- **Zweck:** Eine Anleitung Schritt für Schritt durchklicken.
- **Layout:** Schrittliste 290px fix (weiß, 2px Border rechts) + Bühne (flex:1).
- **Schrittliste:** Header mit „← Bibliothek", Titel 17px/900, Chips (Bereich + „8 Schritte · 3 Min."); Schritte als Zeilen: erledigt = ✓-Kreis #F7F1E6 + durchgestrichener Text #8A7A63; aktiv = Zeile bg #FFE8E2, Nummern-Kreis #EF6A4E weiß; offen = weißer Kreis mit Border. Footer: grüner Punkt #18A999 + „Öffentlicher Link aktiv" + „Teilen"-Pill.
- **Bühne:** Fortschrittszeile („SCHRITT 3 VON 8" 12px/800 #B3A48C + Balken 6px, Track #F0E7D9, Fill #EF6A4E + „Bearbeiten"-Pill); Screenshot-Fläche radius 18px, 2px Border, `box-shadow: 0 6px 0 #F0E7D9`; **Klick-Marker:** Kreis 56px, 3.5px Border #EF6A4E, Füllung rgba(239,106,78,.1), Außenring `0 0 0 8px rgba(239,106,78,.08)`, daneben Tooltip „Hier klicken" (#33291F, weißer Text, radius 11px); unten Schritt-Beschreibung (15px/600 #5C503E, Hervorhebungen bold #33291F) + „← Zurück" (Sekundär-Pill) / „Weiter →" (Primär mit hartem Schatten).

### 3. Öffentliches Hilfe-Center (Desktop) — Option 3b
- **Zweck:** Kunden öffnen Anleitungen **ohne Login**; Seite läuft im Branding des jeweiligen Endkunden (Logo austauschbar).
- **Layout:** Branding-Header (Kundenlogo 34px + „Müller GmbH / Hilfe-Center", rechts Nav + CTA „Zum Kundenportal →" dunkel) → Hero zentriert (H1 34px/900 „Wie können wir helfen?", Subline, große Such-Pill max 520px mit hartem Schatten, Hero-Hintergrund `linear-gradient(180deg,#FDF3EC,#FDF9F3)`) → 2-spaltiges Kategorien-Grid (`gap:26px`) → Footer „Erstellt mit Steply" (S-Badge 18px).
- **Kategorie-Block:** Icon-Kachel 30px im Pastell + Titel 17px/900 + „X Anleitungen"; darunter Zeilen-Karten (weiß, 2px Border, radius 14px): Titel 14px/800, Meta 11.5px/700, rechts Pfeil „→" in Kategoriefarbe.
- Kategoriefarben-Zuordnung: Erste Schritte = Koralle, Rechnungen & Dokumente = Teal, Konto & Sicherheit = Violett, Aufträge & Anfragen = Amber.

### 4. Mobile App — Option 4a (+ 2b links für die interne Bibliothek mobil)
- **Hilfe-Center mobil:** Branding-Header kompakt, H1 22px, Such-Pill, horizontale Kategorie-Chips (aktiv im Pastell mit Farbpunkt), Abschnittsliste mit Zeilen-Karten, Footer „Erstellt mit Steply". Safe-Area: Inhalt beginnt ~58px unter der Statusleiste.
- **Viewer mobil (warm):** Header (←-Kreis-Button 32px, Titel + Meta, ⋯-Button), Fortschrittszeile, Screenshot-Fläche füllt die Mitte (Klick-Marker 46px + Tooltip „Hier tippen"), Beschreibung, Button-Zeile: „← Zurück" (flex:1) + „Weiter →" (flex:1.6, Primär). Alle Tap-Targets ≥ 44px.
- **Interne Bibliothek mobil (Option 2b, links):** Suche, Filter-Chips, horizontale Sammlungs-Karten, „Zuletzt bearbeitet"-Liste, Tab-Bar (Bibliothek/Aufnehmen/Team).

### 5. Marketing-Landing-Page — Option 4b
Sektionen in Reihenfolge:
1. **Nav:** Logo + Funktionen/Preise/Anmelden + Primär-CTA.
2. **Hero:** Announcement-Pill („Neu: Schritte automatisch aus Screencasts", grüner Punkt), H1 54px/900 letter-spacing −0.02em, „Klick-Anleitung" in #EF6A4E; Subline 17px/700 #8A7A63; CTAs „Kostenlos starten" (primär) + „Demo ansehen ▶" (sekundär); Trust-Zeile 12px („Keine Kreditkarte nötig · DSGVO-konform · Made in Germany"); Browser-Mockup (radius 22px oben, drei Punkt-Kreise) mit Produkt-Screenshot-Platzhalter + zwei schwebenden, leicht rotierten Badges („Aus Video erkannt ✓", „Öffentlich geteilt").
3. **So funktioniert's:** dunkle Sektion #33291F, Eyebrow 13px/800 #B3A48C, H2 32px/900, 3 Karten bg #3F3428 radius 20px mit nummerierten Quadraten (Koralle/Teal/Amber).
4. **Eine Bibliothek — zwei Welten:** 2 Pastell-Karten (Koralle = FÜR KUNDEN, Violett = FÜR MITARBEITER) mit dekorativem Kreis rechts unten (überlaufend, `overflow:hidden`).
5. **CTA-Karte:** weiß, harter Schatten, H2 30px + 2 Buttons; Mini-Footer (Impressum/Datenschutz/Kontakt).

### 6. Marketing-Landing-Page mobil — Option 5a
Zwei Screens zeigen dieselbe Seite (oben / weiter gescrollt): Nav kompakt (Logo + Primär-CTA + Burger-Icon), Hero H1 33px, CTAs untereinander (volle Breite), Produkt-Shot angeschnitten; „So funktioniert's" als horizontale Zeilen-Karten statt 3-Spalten-Grid; „Zwei Welten"-Karten gestapelt; CTA-Karte + Footer. Alle Sektionen gleiche Reihenfolge wie Desktop.

## Interactions & Behavior
- **Segment-/Chip-Filter** (Alle/Kunden/Intern, Kategorien): sofortiges Filtern der Liste, aktiver Zustand wie oben beschrieben.
- **Viewer-Navigation:** Weiter/Zurück wechselt Schritt; Schrittliste ist klickbar (springt zu Schritt); erledigte Schritte werden abgehakt + durchgestrichen; Fortschrittsbalken animiert (~250ms ease-out). Klick-Marker pulsiert dezent (Außenring skalieren/faden, ~1.5s loop).
- **Hover:** Karten/Zeilen heben Border auf #E3D7C2 an bzw. bekommen leichten Schatten; Buttons mit hartem Schatten drücken sich beim Klick ein (translateY(2px) + Schattenhöhe reduzieren).
- **Teilen:** erzeugt/zeigt den öffentlichen Link (Status „Öffentlicher Link aktiv" mit grünem Punkt).
- **Öffentliches Hilfe-Center:** keine Auth; Suche filtert live über Titel; Zeile → öffnet Viewer im Kunden-Kontext.
- **Erstell-Flows:** „Aus Screencast erstellen" (Upload → automatische Schritterkennung) und „Manuell mit Screenshots" — beide Einstiege siehe Option 1a (Karten-Duo), Konzept gilt weiter.

## State Management
- Bibliothek: `bereichFilter` (alle|kunden|intern), `kategorieFilter`, `kundeFilter`, `statusFilter`, `sortierung`, `suchbegriff`.
- Viewer: `aktuellerSchritt`, `erledigteSchritte[]`, `istOeffentlich`.
- Tutorial-Datenmodell (abgeleitet): id, titel, bereich (kunde|intern), kategorie, kunde?, schritte[] (screenshot, markerPosition {x%, y%}, beschreibung), status (entwurf|veroeffentlicht), dauerMin, aufrufe, autor, aktualisiertAm, sprache.
- Hilfe-Center: per Kunde gescoped (Subdomain/Slug), nur `status=veroeffentlicht` + `bereich=kunde`.

## Design Tokens
**Farben**
- Hintergrund App/Seiten: `#FDF9F3` (warmes Off-White); Flächen: `#FFFFFF`
- Ink (Text/dunkle Flächen): `#33291F`; Sekundärtext: `#6B5E4B` / `#8A7A63`; Muted: `#B3A48C`
- Border/Divider: `#F0E7D9` (immer 2px); Hintergrund-Beige: `#F7F1E6`
- Primär Koralle: `#EF6A4E`, gedrückt/Schatten: `#D3543A`, Pastell: `#FFE8E2`, Text auf Pastell: `#A8452E`/`#D3543A`
- Teal: `#18A999`, Pastell `#DCF3EF`, Text `#118576`
- Violett: `#8B7CF6`, Pastell `#ECE7FD`, Text `#6D59D8`
- Amber: `#F2A93B`, Pastell `#FDEECD`, Text `#C07D16`
- Blau (nur Kategorie IT): `#5AA9E6`, Pastell `#E3F0FB`
- Dunkle Marketing-Sektion: `#33291F`, Karten darin `#3F3428`, Text gedämpft `#CBBFA8`

**Typografie**
- Font: **Nunito** (Google Fonts), Gewichte 600/700/800/900. Headlines 900, Buttons/Labels 800, Fließtext 600–700.
- Skala: H1 Landing 54, H1 App 22–34, H2 30–32, Kartentitel 14–17, Meta 11–12.5, Eyebrows 11–13 mit letter-spacing 0.06–0.1em.

**Radii:** Pills/Buttons 999px · Karten 14–22px · Thumbnails 9–10px · Nummern-Kreise 50%.
**Schatten:** Markenzeichen „harter Schatten" `0 4–6px 0 <dunklere Stufe>` (Buttons: #D3543A auf Koralle, Karten: #F0E7D9). Keine weichen Blur-Schatten außer dezent im Hero-Mockup.
**Abstände:** Basis 4er-Raster; Seitenpadding Desktop 48–56px, Karten-Padding 12–28px, Grid-Gaps 14–26px.

## Assets
- Keine externen Assets. Logo „S" ist ein Kreis mit Buchstabe (Platzhalter — echtes Logo ausstehend).
- Alle Screenshot-/Logo-Flächen sind gestreifte Platzhalter (`repeating-linear-gradient`) mit Monospace-Label — durch echte Inhalte ersetzen.
- Font via Google Fonts: Nunito (600–900). (Space Grotesk erscheint nur in verworfenen Optionen.)

## Files
- `Steply Explorations.dc.html` — alle Screens/Iterationen (Turn 5 oben = neueste). Die Designs stehen als inline-gestyltes HTML in `<section id="t5">` … `<section id="t1">`; jede Option hat eine id (`2a`–`5a`) und `data-screen-label`. Turn 1 ignorieren.
- `ios-frame.jsx` — iPhone-Rahmen, nur Präsentations-Hilfe für die Mobile-Mockups (nicht implementieren).
