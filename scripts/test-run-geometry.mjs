// Geometrie-Beleg für Welle 33, Fix 1 (Panel-Screenshot-Markierungen).
//
// KEIN Browser: reine Arithmetik, die das ALTE vs. NEUE Layout modelliert und zeigt, warum
// die Markierungen früher versetzt saßen und jetzt pixelgenau sitzen.
//
// ALT: <img width:100%; max-height:H; object-fit:contain> im Rahmen (W×H). Bei Seiten-
//   verhältnis-Mismatch entsteht ein Letterbox-Rand; die Highlights (in % des RAHMENS)
//   ignorieren diesen Rand -> Versatz.
// NEU: innerer .run-image-frame hat GENAU das Bild-Verhältnis (aspect-ratio aus imageW/H)
//   und ist auf max-width = ar*H gedeckelt -> KEIN Letterbox; Highlights (in % des FRAMES)
//   fallen exakt aufs Bild.
//
// Nutzung:  node scripts/test-run-geometry.mjs

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// object-fit:contain: Bild (iw×ih) in eine Box (bw×bh) einpassen -> gerendertes Rechteck.
function containFit(iw, ih, bw, bh) {
  const scale = Math.min(bw / iw, bh / ih);
  const w = iw * scale;
  const h = ih * scale;
  return { w, h, offX: (bw - w) / 2, offY: (bh - h) / 2 };
}

// Pixel-Y der Bildmitte (Highlight bei norm-y=0.5) in beiden Layouts.
// ALT: 0.5 * boxHeight (Highlight ist % des Rahmens, ignoriert offY).
// NEU: offY + 0.5 * renderedHeight (Highlight ist % des tatsächlichen Bildes; im Frame
//      ist offY=0, weil Frame == Bildgröße).
function offsetAtTop(iw, ih, boxW, boxH) {
  const fit = containFit(iw, ih, boxW, boxH);
  // Highlight bei norm-y = 0 (Bild-Oberkante).
  const oldTopPx = 0; // ALT: 0% des Rahmens
  const newTopPx = fit.offY; // Bild-Oberkante liegt real bei offY
  return { letterboxTop: fit.offY, oldTopPx, newTopPx, drift: Math.abs(newTopPx - oldTopPx) };
}

// ── Beleg 1: 1600×900 in fixem 320×190-Rahmen (das Zahlenbeispiel aus dem Auftrag) ────────
{
  const fit = containFit(1600, 900, 320, 190);
  // Bild füllt die Breite (320), Höhe 180 -> 5px Letterbox oben + unten.
  ok(approx(fit.w, 320) && approx(fit.h, 180), "1600×900 in 320×190: gerendert 320×180");
  ok(approx(fit.offY, 5), "1600×900 in 320×190: Letterbox 5px oben/unten");
  const d = offsetAtTop(1600, 900, 320, 190);
  ok(approx(d.drift, 5), "ALT: Highlight an Bild-Oberkante sitzt 5px zu hoch (Versatz)");

  // NEU: Frame bekommt Bild-Verhältnis (1600/900) und max-width = ar*190 = 337.78 -> deckelt
  // die Breite so, dass die Höhe genau 190 bleibt; Frame == Bild -> KEIN Letterbox.
  const ar = 1600 / 900;
  const frameW = Math.min(9999, ar * 190); // in breitem Rahmen greift der Deckel
  const frameH = frameW / ar;
  ok(approx(frameH, 190), "NEU: Frame-Höhe == Rahmen (kein Letterbox)");
  const fitNew = containFit(1600, 900, frameW, frameH);
  ok(approx(fitNew.offY, 0) && approx(fitNew.offX, 0), "NEU: Frame==Bild -> Versatz 0");
}

// ── Beleg 2: 1600×1200 (4:3) in ~300px-Panel — der sichtbare Fall aus Richards Screenshot ──
{
  // ALT: img width:100%=300, max-height:190 greift -> Box 300×190, Bild contain -> horizontaler
  // Letterbox von je ~23.3px; Highlights (% des Rahmens) sitzen bis zu 23px daneben.
  const fit = containFit(1600, 1200, 300, 190);
  ok(approx(fit.h, 190) && approx(fit.w, 253.333, 1e-2), "1600×1200 in 300×190: gerendert ~253×190");
  ok(approx(fit.offX, 23.333, 1e-2), "ALT: ~23.3px horizontaler Letterbox -> Markierungen versetzt");

  // NEU: Frame ar=4/3, max-width = ar*190 = 253.33 -> Frame 253.33×190 == Bild -> Versatz 0.
  const ar = 1600 / 1200;
  const frameW = ar * 190;
  const fitNew = containFit(1600, 1200, frameW, frameW / ar);
  ok(approx(fitNew.offX, 0) && approx(fitNew.offY, 0), "NEU: Frame==Bild -> 0px Versatz (pixelgenau)");
}

console.log(
  failed
    ? "\n✗ run-geometry: Formel widerlegt (unerwartet)."
    : "\n✓ run-geometry: ALT versetzt (Letterbox), NEU pixelgenau (aspect-ratio-Frame)."
);
process.exitCode = failed ? 1 : 0;
