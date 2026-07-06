// Pure Node-Tests für extension/target-banner.js (Welle 33, Fix 4).
// Prüft die Banner-Entscheidung OHNE DOM: kein echtes Ziel -> versteckt (+ ggf. broken zum
// Aufräumen), echtes Ziel mit leerem Label -> Fallback-Text.
//
// Nutzung:  node scripts/test-target-banner.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { targetBannerState, FALLBACK_LABEL } = require("../extension/target-banner.js");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// Kein Ziel -> nie sichtbar.
ok(targetBannerState(null).show === false, "null -> versteckt");
ok(targetBannerState(undefined).show === false, "undefined -> versteckt");
ok(targetBannerState(undefined).broken === false, "undefined -> nicht broken (nichts zu räumen)");

// Kaputtes Objekt (ohne target) -> versteckt + broken (Aufrufer räumt Storage).
ok(targetBannerState({ label: "", origin: "", ts: Date.now() }).show === false, "{ohne target} -> versteckt");
ok(targetBannerState({ label: "x" }).broken === true, "{ohne target} vorhanden -> broken (räumen)");
ok(targetBannerState({ target: null, label: "x" }).show === false, "{target:null} -> versteckt");

// Echtes Ziel mit leerem/whitespace Label -> Fallback-Text (nie ein sichtbar leeres Banner).
let s = targetBannerState({ target: { tutorialId: "t1", anchor: {} }, label: "" });
ok(s.show === true && s.label === FALLBACK_LABEL, "{target,label:''} -> Fallback-Text");
s = targetBannerState({ target: { tutorialId: "t1" }, label: "   " });
ok(s.show === true && s.label === FALLBACK_LABEL, "{target,label:'   '} -> Fallback-Text");
ok(targetBannerState({ target: { tutorialId: "t1" }, label: "" }).broken === false, "echtes Ziel -> nicht broken");

// Echtes Ziel mit Label -> getrimmter Label-Text.
s = targetBannerState({ target: { tutorialId: "t1" }, label: "  Rechnung hochladen  " });
ok(s.show === true && s.label === "Rechnung hochladen", "Label wird getrimmt");

console.log(failed ? "\n✗ target-banner Tests fehlgeschlagen." : "\n✓ target-banner: alle Fälle verifiziert.");
process.exitCode = failed ? 1 : 0;
