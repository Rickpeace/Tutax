// Baut das Download-/Upload-Zip der Steply-Recorder-Extension (Welle 25, Paket 2).
//
//   -> public/downloads/steply-recorder.zip   (manifest.json im Wurzelverzeichnis, damit
//      es sowohl fuer „Entpackt laden" als auch fuer den Chrome Web Store taugt)
//   -> public/downloads/steply-recorder.json   { "version": <aus manifest.json> }
//
// Es packt extension/** OHNE den Unterordner store/ (Web-Store-Doku aus Paket 4 gehoert
// nicht in die Extension). Nutzt das VORHANDENE jszip aus node_modules (package.json ist
// TABU). DETERMINISTISCH: feste Datei-Reihenfolge (sortiert) + festes Datum pro Eintrag
// -> Re-Runs erzeugen bit-identische Zips (keine Schein-Diffs im Git).
//
// Nutzung:  node scripts/build-extension-zip.mjs
import { createRequire } from "node:module";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const EXT_DIR = path.join(ROOT, "extension");
const OUT_DIR = path.join(ROOT, "public", "downloads");
const ZIP_PATH = path.join(OUT_DIR, "steply-recorder.zip");
const JSON_PATH = path.join(OUT_DIR, "steply-recorder.json");

// Festes Datum -> reproduzierbares Zip (JSZip schreibt es in die DOS-Zeitstempel).
const FIXED_DATE = new Date("2020-01-01T00:00:00Z");

// Alle Dateien unter extension/ rekursiv sammeln (relative Pfade, POSIX-Trenner), aber
// den Unterordner store/ auslassen.
function collect(dir, base = "") {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = base ? base + "/" + name : name;
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (rel === "store") continue; // Web-Store-Doku NICHT ins Extension-Zip
      out.push(...collect(abs, rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

async function build() {
  const manifest = JSON.parse(readFileSync(path.join(EXT_DIR, "manifest.json"), "utf8"));
  const version = manifest.version;
  if (typeof version !== "string" || !version) {
    throw new Error("manifest.json hat keine gueltige version.");
  }

  const files = collect(EXT_DIR).sort(); // stabile Reihenfolge

  const zip = new JSZip();
  for (const rel of files) {
    zip.file(rel, readFileSync(path.join(EXT_DIR, rel)));
  }
  // Datum ALLER Eintraege (inkl. implizit erzeugter Ordner) auf den Fixwert setzen.
  zip.forEach((_relPath, entry) => {
    entry.date = FIXED_DATE;
  });

  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(ZIP_PATH, buf);
  writeFileSync(JSON_PATH, JSON.stringify({ version }, null, 2) + "\n");

  return { version, files };
}

// Selbst-Check (Verifikationspflicht §3): Zip existiert, enthaelt die manifest.json der
// Extension, und deren Version == steply-recorder.json-Version. Zusaetzlich: Kern-Dateien da.
async function selfCheck(expectedVersion) {
  const buf = readFileSync(ZIP_PATH); // wirft, wenn das Zip fehlt
  const z = await JSZip.loadAsync(buf);

  const manifestEntry = z.file("manifest.json");
  if (!manifestEntry) throw new Error("Zip enthaelt keine manifest.json (Wurzel).");
  const zipManifest = JSON.parse(await manifestEntry.async("string"));

  const jsonVersion = JSON.parse(readFileSync(JSON_PATH, "utf8")).version;

  if (zipManifest.version !== expectedVersion) {
    throw new Error(
      `manifest.json im Zip hat Version ${zipManifest.version}, erwartet ${expectedVersion}.`,
    );
  }
  if (zipManifest.version !== jsonVersion) {
    throw new Error(
      `Zip-Version ${zipManifest.version} != steply-recorder.json-Version ${jsonVersion}.`,
    );
  }
  for (const f of ["content.js", "background.js", "panel.js", "panel.html", "styles.css"]) {
    if (!z.file(f)) throw new Error(`Zip enthaelt ${f} nicht.`);
  }
  // store/ darf NICHT enthalten sein.
  const hasStore = Object.keys(z.files).some((n) => n.startsWith("store/"));
  if (hasStore) throw new Error("Zip enthaelt faelschlich den store/-Ordner.");

  return { entries: Object.keys(z.files).length, version: jsonVersion };
}

try {
  const { version, files } = await build();
  const chk = await selfCheck(version);
  console.log(`✓ steply-recorder.zip gebaut (v${version}, ${files.length} Dateien).`);
  console.log(`✓ steply-recorder.json geschrieben (version ${chk.version}).`);
  console.log(`✓ Selbst-Check ok: manifest.json im Zip, Version stimmt ueberein.`);
} catch (e) {
  console.error("✗ Zip-Bau fehlgeschlagen:", e && e.message ? e.message : e);
  process.exit(1);
}
