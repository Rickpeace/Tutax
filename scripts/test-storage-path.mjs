// Speicherpfad-Prüfung (Sicherheitsprüfung 23.09.2026): Pfad-Spalten (themes.logo_path,
// steps.image_path, steps.audio_path) sind per REST beschreibbar; gelöscht/veröffentlicht wird
// mit dem Admin-Client. Nur Pfade im Ordner des Kontos der DB-Zeile dürfen durch.
// Rein, ohne Netz/DB. Nutzung: node scripts/test-storage-path.mjs
const { isAccountStoragePath } = await import("../src/lib/storage-path.ts");
const { isOwnAudioPath } = await import("../src/lib/tts-core.ts");

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const T = "33333333-3333-4333-8333-333333333333";

const cases = [
  // Konto-Ordner allgemein (Schritt-Bilder)
  ["eigenes Schritt-Bild", isAccountStoragePath(A, `${A}/${T}/step.webp`), true],
  ["fremdes Schritt-Bild", isAccountStoragePath(A, `${B}/${T}/step.webp`), false],
  ["Konto null (Vorlage)", isAccountStoragePath(null, `${A}/${T}/step.webp`), false],
  ["Pfad null", isAccountStoragePath(A, null), false],
  ["nur Präfix ohne Datei", isAccountStoragePath(A, `${A}/`), false],
  ["Präfix-Trick (Konto-ID als Anfang einer längeren ID)", isAccountStoragePath(A, `${A}x/${T}/s.webp`), false],
  ["../ aus dem Ordner heraus", isAccountStoragePath(A, `${A}/../${B}/${T}/s.webp`), false],
  ["Backslash", isAccountStoragePath(A, `${A}\\..\\${B}/s.webp`), false],
  ["doppelter Slash", isAccountStoragePath(A, `${A}//${B}/s.webp`), false],
  ["führender Slash", isAccountStoragePath(A, `/${A}/s.webp`), false],
  ["Steuerzeichen", isAccountStoragePath(A, `${A}/\n${B}/s.webp`), false],
  // Logos: nur Branding-Ordner
  ["eigenes Logo (branding/)", isAccountStoragePath(A, `${A}/branding/logo-1.webp`, ["branding", "brand"]), true],
  ["eigenes KI-Logo (brand/)", isAccountStoragePath(A, `${A}/brand/ai-logo.png`, ["branding", "brand"]), true],
  ["eigenes Schritt-Bild als „Logo“", isAccountStoragePath(A, `${A}/${T}/step.webp`, ["branding", "brand"]), false],
  ["fremdes Logo", isAccountStoragePath(A, `${B}/branding/logo-1.webp`, ["branding", "brand"]), false],
  // Vorlese-Audio: nur Audio-Ordner der eigenen Anleitung
  ["eigenes Audio", isOwnAudioPath(`${A}/${T}/audio/`, `${A}/${T}/audio/s1.mp3`), true],
  ["fremdes Audio", isOwnAudioPath(`${A}/${T}/audio/`, `${B}/${T}/audio/s1.mp3`), false],
  ["eigenes Bild statt Audio", isOwnAudioPath(`${A}/${T}/audio/`, `${A}/${T}/s1.webp`), false],
  ["Audio ohne ermittelbares Konto", isOwnAudioPath(null, `${A}/${T}/audio/s1.mp3`), false],
  ["Audio mit ../", isOwnAudioPath(`${A}/${T}/audio/`, `${A}/${T}/audio/../../../${B}/x.mp3`), false],
  // Sicherheitsprüfung Runde 4: Storage dekodiert %2e%2e beim Download → Prozent-Kodierung ablehnen
  ["Prozent-kodiertes ../ (%2e%2e)", isAccountStoragePath(A, `${A}/%2e%2e/${B}/${T}/s.webp`), false],
  ["Prozent-kodiertes ../ (%2E%2E%2F)", isAccountStoragePath(A, `${A}/%2E%2E%2F${B}/s.webp`), false],
  ["einzelner Punkt-Abschnitt", isAccountStoragePath(A, `${A}/./${T}/s.webp`), false],
  ["Leerzeichen/Sonderzeichen", isAccountStoragePath(A, `${A}/${T}/s 1.webp`), false],
  ["Zeitstempel + Bindestrich erlaubt", isAccountStoragePath(A, `${A}/${T}/s-1a2b3c4d.webp`), true],
  ["Audio mit %2e%2e", isOwnAudioPath(`${A}/${T}/audio/`, `${A}/${T}/audio/%2e%2e/%2e%2e/${B}/x.mp3`), false],
];

let bad = 0;
for (const [name, got, want] of cases) {
  const pass = got === want;
  console.log(`${pass ? "✓" : "✗"} ${name} → ${got ? "erlaubt" : "übersprungen"}`);
  if (!pass) bad++;
}
console.log(bad ? `\n✗ ${bad} falsch.` : `\n✓ Speicherpfad-Prüfung: alle ${cases.length} Fälle korrekt.`);
process.exit(bad ? 1 : 0);
