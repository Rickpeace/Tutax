/**
 * Reine Verlaufs-Logik des Anleitungs-Wizards (viewer/wizard.tsx) — ohne React/DOM, damit
 * sie per scripts/test-wizard-history.mjs geprüft werden kann.
 *
 * Jeder Schrittwechsel schreibt einen Stand (aktueller Schritt + Weg dorthin) in den
 * Browser-Verlauf. `fwd` merkt sich, ob der aktuelle Eintrag durch einen VORWÄRTS-Schritt
 * (Weiter/Antwort/Automatik) entstanden ist: nur dann liegt direkt davor im Browser-Verlauf
 * genau der Stand, zu dem „Zurück“ führen soll, und der Knopf darf history.back() nutzen
 * (Knopf und Browser-Zurück nehmen denselben Weg). In allen anderen Fällen — Position aus
 * dem Tab-Speicher wiederhergestellt (Sprachwechsel, erneutes Öffnen), Sprung über die
 * Schrittliste, Neustart — stünde davor etwas anderes; dann ersetzt „Zurück“ den aktuellen
 * Eintrag durch den vorherigen Schritt des Wegs (kein neuer Eintrag, kein Hin-und-her).
 */

export type WizSnapshot = {
  cur: string | null;
  history: string[];
  depth: number;
  /** Eintrag entstand durch einen Vorwärts-Schritt (siehe oben). Fehlt bei Altständen. */
  fwd?: boolean;
};

/** Art eines Schrittwechsels. */
export type WizMove = "forward" | "jump" | "back" | "init";

/**
 * Nächster Verlaufs-Stand + ob er einen NEUEN Eintrag anlegt (push) oder den aktuellen
 * ersetzt (replace).
 *  - forward: neuer Eintrag, fwd = true
 *  - jump:    neuer Eintrag (Browser-Zurück macht den Sprung rückgängig), fwd = false
 *  - back:    ersetzt den aktuellen Eintrag, fwd = false
 *  - init:    ersetzt den aktuellen Eintrag und behält dessen fwd (Neuladen einer Seite,
 *             deren Eintrag durch einen Vorwärts-Schritt entstand, bleibt „echt“)
 * Bleibt der Schritt gleich (Doppelklick, Neustart auf dem Startschritt), wird immer
 * ersetzt (fwd = false) — sonst wächst der Verlauf endlos.
 */
export function nextSnapshot(
  prev: { cur: string | null; depth: number; fwd?: boolean },
  nextCur: string | null,
  nextHistory: string[],
  move: WizMove,
): { snap: WizSnapshot; push: boolean } {
  const push = (move === "forward" || move === "jump") && nextCur !== prev.cur;
  const fwd = move === "init" ? prev.fwd === true : push && move === "forward";
  return {
    snap: { cur: nextCur, history: nextHistory, depth: push ? prev.depth + 1 : prev.depth, fwd },
    push,
  };
}

/** Was „Zurück“ (Knopf) im aktuellen Stand tun soll. */
export type BackAction =
  | { kind: "browser" }
  | { kind: "replace"; cur: string; history: string[] }
  | { kind: "none" };

export function backAction(state: { history: string[]; depth: number; fwd: boolean }): BackAction {
  if (state.fwd && state.depth > 0) return { kind: "browser" };
  const h = state.history;
  if (!h.length) return { kind: "none" };
  return { kind: "replace", cur: h[h.length - 1], history: h.slice(0, -1) };
}
