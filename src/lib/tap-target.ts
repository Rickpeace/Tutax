/**
 * Unsichtbare Touch-Trefferfläche (Handy-Audit 24.09.2026).
 *
 * Vergrößert kleine Knöpfe/Links NUR auf Touch-Geräten (`pointer: coarse`) auf mindestens
 * 40 × 40 px — per `::after`-Pseudo-Element, das mittig über dem Element liegt. Layout und
 * Desktop-Optik bleiben unverändert (Maus: gar keine Wirkung).
 *
 * Voraussetzungen am Element:
 *  - es braucht eine Positionierung (`relative`, oder schon `absolute`/`fixed`/`sticky`) —
 *    bewusst NICHT hier enthalten, damit es vorhandene Positionierungen nicht überschreibt;
 *  - kein `overflow-hidden` am Element selbst (sonst wird die Fläche abgeschnitten).
 */
export const TAP_AREA =
  "pointer-coarse:after:absolute pointer-coarse:after:left-1/2 pointer-coarse:after:top-1/2 pointer-coarse:after:h-[max(100%,2.5rem)] pointer-coarse:after:w-[max(100%,2.5rem)] pointer-coarse:after:-translate-x-1/2 pointer-coarse:after:-translate-y-1/2";
