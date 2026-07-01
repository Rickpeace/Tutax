// Smoke-Test: Blur wird wirklich IN DIE PIXEL gebrannt (REVIEW Top-1).
// Importiert die ECHTE Implementierung (src/lib/redact.ts) via Type-Stripping.
// Aufruf:  node --experimental-strip-types scripts/test-blur-live.mjs
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { burnBlur, hasBlur } from "../src/lib/redact.ts";

const W = 400, H = 200, CH = 3;
let fails = 0;
const check = (ok, label) => { console.log(ok ? "✓" : "✗", label); if (!ok) fails++; };

// Rausch-Bild (PNG = verlustfrei): hohe Varianz -> Pixelierung muss sie zerstören.
const noise = randomBytes(W * H * CH);
const png = await sharp(noise, { raw: { width: W, height: H, channels: CH } }).png().toBuffer();

const blurHl = [{ id: "t", type: "blur", x: 0, y: 0, w: 0.5, h: 1 }];

// 1) hasBlur
check(hasBlur(blurHl) === true, "hasBlur erkennt Blur-Highlight");
check(hasBlur([{ type: "rect" }]) === false, "hasBlur ignoriert rect");
check(hasBlur(null) === false, "hasBlur robust bei null");

// 2) Einbrennen: linke Hälfte pixeliert, rechte Hälfte unangetastet
const out = await burnBlur(png, blurHl);
check(Buffer.isBuffer(out) && out.length > 0, "burnBlur liefert Buffer");

// removeAlpha: composite kann einen Alpha-Kanal ergänzen -> für den Pixelvergleich normalisieren.
const region = (buf, left, width) =>
  sharp(buf).extract({ left, top: 0, width, height: H }).removeAlpha().raw().toBuffer();

const [origL, outL, origR, outR] = await Promise.all([
  region(png, 0, W / 2), region(out, 0, W / 2),
  region(png, W / 2, W / 2), region(out, W / 2, W / 2),
]);

const stddev = async (raw) => {
  const s = await sharp(raw, { raw: { width: W / 2, height: H, channels: CH } }).stats();
  return s.channels.reduce((m, c) => m + c.stdev, 0) / s.channels.length;
};
const sdOrig = await stddev(origL);
const sdOut = await stddev(outL);
check(sdOut < sdOrig * 0.5, `Blur-Region: Varianz kollabiert (${sdOrig.toFixed(1)} -> ${sdOut.toFixed(1)})`);
check(!origL.equals(outL), "Blur-Region: Pixel wirklich verändert");
check(origR.equals(outR), "Nicht markierte Hälfte: Pixel IDENTISCH (kein Kollateralschaden)");

// 3) Ohne Blur-Highlights: Bild unverändert durchreichen
const same = await burnBlur(png, [{ id: "r", type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.2 }]);
check(same.equals(png), "Ohne Blur: Original-Buffer unverändert");

// 4) Rand-Fälle: Highlight (teils) außerhalb 0..1 -> kein Crash
const edge = await burnBlur(png, [{ id: "e", type: "blur", x: 0.9, y: 0.9, w: 0.5, h: 0.5 }]);
check(Buffer.isBuffer(edge), "Rand-Highlight (überstehend): kein Crash");

console.log(fails === 0 ? "\n✓ Blur-Einbrennen live verifiziert." : `\n✗ ${fails} Checks FEHLGESCHLAGEN`);
process.exit(fails === 0 ? 0 : 1);
