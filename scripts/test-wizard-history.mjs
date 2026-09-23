// Wizard-„Zurück“ (Audit 23.09.2026) — reine Verlaufs-Logik aus src/lib/wizard-history.ts
// gegen einen nachgebauten Browser-Verlauf (push/replace/back). OHNE Browser/Server.
// Prüft:
//   A) Position aus dem Tab-Speicher (Sprachwechsel/erneutes Öffnen, depth 0): „Zurück“
//      geht 3 → 2 → 1 und springt NICHT wieder auf 3.
//   B) Sprung über die Schrittliste 5 → 2: „Zurück“ geht zu 1, nicht zu 5.
//   C) Normale Vorwärts-Schritte: Knopf-Zurück nutzt history.back(); Browser-Zurück geht
//      genau einen Schritt zurück (Verhalten aus Commit 40e2e71 bleibt).
//   D) Neuladen auf einem Vorwärts-Eintrag behält fwd; gleicher Schritt legt keinen Eintrag an.
//
// Nutzung:  node scripts/test-wizard-history.mjs
const { nextSnapshot, backAction } = await import("../src/lib/wizard-history.ts");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)}${JSON.stringify(a) === JSON.stringify(b) ? "" : ` (erwartet ${JSON.stringify(b)})`}`);

/** Nachbau: Browser-Verlauf + Wizard (wie viewer/wizard.tsx). */
function makeWizard(initialEntryState = null) {
  const entries = [initialEntryState]; // state je Eintrag (null = fremder/Seiten-Eintrag)
  let idx = 0;
  const w = { cur: "1", history: [], depth: 0, fwd: false, leftPage: false };

  const write = (prevCur, nextCur, nextHistory, move) => {
    const { snap, push } = nextSnapshot({ cur: prevCur, depth: w.depth, fwd: w.fwd }, nextCur, nextHistory, move);
    w.depth = snap.depth;
    w.fwd = snap.fwd === true;
    if (push) {
      entries.splice(idx + 1);
      entries.push(snap);
      idx++;
    } else entries[idx] = snap;
  };
  const navigate = (nextCur, nextHistory, move) => {
    const prevCur = w.cur;
    w.cur = nextCur;
    w.history = nextHistory;
    write(prevCur, nextCur, nextHistory, move);
  };
  const pop = () => {
    const s = entries[idx];
    if (!s) {
      w.leftPage = true;
      return;
    }
    w.cur = s.cur;
    w.history = s.history;
    w.depth = s.depth;
    w.fwd = s.fwd === true;
  };
  return {
    w,
    entries: () => entries.length,
    /** Mount: Stand aus Verlaufseintrag ODER aus dem Tab-Speicher. */
    init(stored) {
      const snap = entries[idx];
      if (snap) {
        w.cur = snap.cur;
        w.history = snap.history;
        w.depth = snap.depth;
        w.fwd = snap.fwd === true;
      } else if (stored) {
        w.cur = stored.cur;
        w.history = stored.history;
      }
      write(w.cur, w.cur, w.history, "init");
    },
    go(target) {
      navigate(target, w.cur != null ? [...w.history, w.cur] : w.history, "forward");
    },
    jumpTo(path, i) {
      navigate(path[i], path.slice(0, i), "jump");
    },
    restart() {
      navigate("1", [], "jump");
    },
    backButton() {
      const a = backAction({ history: w.history, depth: w.depth, fwd: w.fwd });
      if (a.kind === "browser") this.browserBack();
      else if (a.kind === "replace") navigate(a.cur, a.history, "back");
    },
    browserBack() {
      if (idx === 0) {
        w.leftPage = true;
        return;
      }
      idx--;
      pop();
    },
    browserForward() {
      if (idx < entries.length - 1) {
        idx++;
        pop();
      }
    },
  };
}

// ── A) Wiederhergestellt aus dem Tab-Speicher ─────────────────────────────────────────
{
  const b = makeWizard();
  b.init({ cur: "3", history: ["1", "2"] });
  eq(b.w.cur, "3", "A: wiederhergestellt auf Schritt 3");
  b.backButton();
  eq(b.w.cur, "2", "A: Zurück → 2");
  b.backButton();
  eq(b.w.cur, "1", "A: Zurück → 1 (vorher: wieder 3)");
  b.backButton();
  eq(b.w.cur, "1", "A: am Start bleibt Zurück auf 1");
  eq(b.entries(), 1, "A: kein zusätzlicher Verlaufseintrag");
  b.browserBack();
  ok(b.w.leftPage, "A: Browser-Zurück verlässt dann die Seite");
}

// ── B) Sprung über die Schrittliste ────────────────────────────────────────────────────
{
  const path = ["1", "2", "3", "4", "5"];
  const b = makeWizard();
  b.init(null);
  b.go("2");
  b.go("3");
  b.go("4");
  b.go("5");
  b.jumpTo(path, 1); // 5 → 2
  eq(b.w.cur, "2", "B: Sprung 5 → 2");
  b.backButton();
  eq(b.w.cur, "1", "B: Zurück → 1 (vorher: 5)");
  b.browserBack();
  eq(b.w.cur, "5", "B: Browser-Zurück macht den Sprung rückgängig (→ 5)");
  b.backButton();
  eq(b.w.cur, "4", "B: danach Zurück → 4");

  const c = makeWizard();
  c.init(null);
  c.jumpTo(path, 4); // 1 → 5
  c.backButton();
  eq(c.w.cur, "4", "B: Sprung 1 → 5, Zurück → 4");
  c.backButton();
  eq(c.w.cur, "3", "B: Zurück → 3");
}

// ── C) Normale Vorwärts-Schritte (Commit 40e2e71) ──────────────────────────────────────
{
  const b = makeWizard();
  b.init(null);
  b.go("2");
  b.go("3");
  eq(b.entries(), 3, "C: jeder Vorwärts-Schritt = ein Verlaufseintrag");
  b.browserBack();
  eq(b.w.cur, "2", "C: Browser-Zurück → 2");
  b.browserForward();
  eq(b.w.cur, "3", "C: Browser-Vor → 3");
  b.backButton();
  eq(b.w.cur, "2", "C: Knopf-Zurück → 2 (über history.back)");
  b.backButton();
  eq(b.w.cur, "1", "C: Knopf-Zurück → 1");
  b.browserBack();
  ok(b.w.leftPage, "C: am ersten Schritt verlässt Browser-Zurück die Seite");

  // Ende der Anleitung (cur = null) und zurück
  const e = makeWizard();
  e.init(null);
  e.go("2");
  e.go(null);
  eq(e.w.cur, null, "C: Ende erreicht");
  e.backButton();
  eq(e.w.cur, "2", "C: Zurück vom Ende → 2");

  // Neustart legt einen Eintrag an; danach Zurück am Start bleibt stehen
  const r = makeWizard();
  r.init(null);
  r.go("2");
  r.go("3");
  r.restart();
  eq(r.w.cur, "1", "C: Neustart → 1");
  r.backButton();
  eq(r.w.cur, "1", "C: Zurück nach Neustart bleibt auf 1 (kein Sprung auf 3)");
  r.browserBack();
  eq(r.w.cur, "3", "C: Browser-Zurück macht den Neustart rückgängig");
}

// ── D) Neuladen + gleicher Schritt ────────────────────────────────────────────────────
{
  const { snap } = nextSnapshot({ cur: "2", depth: 1, fwd: true }, "2", ["1"], "init");
  eq(snap.fwd, true, "D: Neuladen auf Vorwärts-Eintrag behält fwd");
  const same = nextSnapshot({ cur: "2", depth: 1, fwd: true }, "2", ["1", "2"], "forward");
  eq([same.push, same.snap.fwd, same.snap.depth], [false, false, 1], "D: gleicher Schritt ersetzt statt anzuhängen");
  eq(backAction({ history: [], depth: 0, fwd: false }), { kind: "none" }, "D: ohne Weg kein Zurück");
  eq(backAction({ history: ["1"], depth: 0, fwd: true }).kind, "replace", "D: depth 0 nie history.back()");
}

if (failed) {
  console.log("\n✗ Wizard-Verlauf: Fehler");
  process.exit(1);
}
console.log("\n✓ Wizard-Verlauf: alle Prüfungen grün");
