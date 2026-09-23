// Open-Redirect-Schutz (src/lib/url.ts → safeNext) — Sicherheitsprüfung 23.09.2026.
// Browser entfernen TAB/CR/LF aus URLs: `/\t/evil.com` wurde zu `//evil.com` (belegt:
// `/logout?next=/%09/evil.com` leitete auf https://evil.com/). Rein, ohne Netz/DB.
// Zusätzlich: jedes erlaubte Ergebnis wird wie im Browser aufgelöst (WHATWG-URL-Parser, der
// ebenfalls TAB/CR/LF entfernt) und muss auf dem eigenen Ursprung bleiben.
// Nutzung: node scripts/test-safe-next.mjs   (Node ≥ 22.18: .ts-Import ohne Flag)
const { safeNext } = await import("../src/lib/url.ts");

const ORIGIN = "https://app.steply.test";
const cases = [
  // [Eingabe, erwartetes Ergebnis]  — "FB" = Fallback
  ["/app", "/app"],
  ["/app/settings/team?x=1#y", "/app/settings/team?x=1#y"],
  ["/login?error=kein-team", "/login?error=kein-team"],
  ["/invite/abc123", "/invite/abc123"],
  ["/reset", "/reset"],
  ["  /app  ", "/app"],
  [null, "FB"],
  [undefined, "FB"],
  ["", "FB"],
  ["app", "FB"],
  ["https://evil.com", "FB"],
  ["//evil.com", "FB"],
  ["/\\evil.com", "FB"],
  ["/\\/evil.com", "FB"],
  ["/%2fevil.com", "FB"],
  ["/%5Cevil.com", "FB"],
  ["/\t/evil.com", "FB"], // der belegte Angriff (TAB)
  ["/\n/evil.com", "FB"],
  ["/\r/evil.com", "FB"],
  ["/\r\n/evil.com", "FB"],
  ["/\t\t/evil.com", "FB"],
  ["/\x00/evil.com", "FB"],
  ["/\x7f/evil.com", "FB"],
  ["/app\\..\\evil", "FB"],
  ["\t//evil.com", "FB"],
  ["/　/evil.com", "/　/evil.com"], // kein Steuerzeichen: bleibt ein Pfad auf dem eigenen Host
];

let bad = 0;
for (const [input, want] of cases) {
  const got = safeNext(input, "FB");
  let sameOrigin = true;
  if (got !== "FB") sameOrigin = new URL(got, ORIGIN).origin === ORIGIN;
  const pass = got === want && sameOrigin;
  console.log(`${pass ? "✓" : "✗"} ${JSON.stringify(input)} → ${JSON.stringify(got)}${sameOrigin ? "" : " (VERLÄSST DEN URSPRUNG!)"}`);
  if (!pass) bad++;
}
console.log(bad ? `\n✗ ${bad} falsch.` : `\n✓ safeNext: alle ${cases.length} Fälle korrekt.`);
process.exit(bad ? 1 : 0);
