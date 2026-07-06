"use strict";

// Steply Recorder — reine Banner-Entscheidung für den Aufnahme-Anker (Welle 33, Fix 4).
//
// targetBannerState(pendingTarget) entscheidet OHNE DOM, ob das „Aufnahme für: …"-Banner
// sichtbar ist und welcher Label-Text darin steht. So ist die Logik in Node testbar
// (test-target-banner.mjs), unabhängig von panel.js/chrome/document.
//
// Regeln (Härtung nach Richards Befund „leeres Banner klebt, Verwerfen tot"):
//   • Sichtbar NUR, wenn ein echtes Ziel vorliegt: pendingTarget && pendingTarget.target.
//   • Ein pendingTarget-Objekt OHNE `target` (Altbestand kaputter Versionen) gilt als
//     „kein Ziel" -> nicht sichtbar UND broken:true (der Aufrufer räumt es aus dem Storage).
//   • Leeres/whitespace-Label -> neutraler Fallback-Text (nie ein sichtbar leeres Banner).

(function (root) {
  var FALLBACK_LABEL = "die gewählte Stelle im Tutorial";

  function targetBannerState(pendingTarget) {
    if (!pendingTarget || !pendingTarget.target) {
      // broken = ein Objekt liegt vor, aber ohne target -> Selbstheilung (räumen) signalisieren.
      return { show: false, label: "", broken: !!pendingTarget };
    }
    var label = String(pendingTarget.label == null ? "" : pendingTarget.label).trim();
    return { show: true, label: label || FALLBACK_LABEL, broken: false };
  }

  var api = { targetBannerState: targetBannerState, FALLBACK_LABEL: FALLBACK_LABEL };

  // UMD-artig: Node (CommonJS, für den Test) ODER classic panel-script (globaler Namespace).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SteplyTargetBanner = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
