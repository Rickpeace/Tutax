// Live-Test des Video-Exports (Welle 18): Tutorial -> MP4 in zwei Stilen.
// Deckt (Auftrag §Verifikation 2) ab:
//   (a) Segmentplan: lineares 3-Schritt-Tutorial -> korrekte Reihenfolge/Zeiten/Kapiteltext;
//       verzweigtes Tutorial (Frage + 2 Äste + Rejoin) -> DFS-Plan mit Kapitel-Karte je Ast,
//       Rejoin genau einmal.
//   (b) ffmpeg-Kommandobau: zoompan Richtung Highlight-Zentrum, xfade-Kette, drawtext mit
//       maskierten Sonderzeichen (deutsche Umlaute + Doppelpunkte in Titeln).
//   (c) QR-PNG + Intro/Outro/Kapitel-Karten via sharp (Datei entsteht, Maße stimmen).
//   (d) createRenderJob-Gates (DB-Ebene wie die Server-Action): nicht-Business -> Fehler,
//       Entwurf -> Fehler, gültig -> Row mit kind/render_style, Doppel-Job -> Fehler.
//   (e) FALLS ffmpeg lokal vorhanden: echtes Mini-Rendering (2 Schritte, classic) -> MP4 mit
//       plausibler Dauer + 1080p H.264/AAC (der wertvollste Beweis).
// Alle Testdaten werden am Ende gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-render-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildSegmentPlan,
  fullPlan,
  computeChapters,
  stepDurationFn,
  kenBurnsFilter,
  lowerThirdFilters,
  escapeDrawtext,
  wrapCaption,
  resolveBrand,
  introCardSvg,
  outroCardSvg,
  chapterCardSvg,
  highlightOverlaySvg,
  renderVideo,
  firstHighlight,
} from "../video-worker/render.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const uuid = () => crypto.randomUUID();

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };

// sharp/qrcode wie der Worker laden (aus dem Worker-Modul-Kontext -> App-node_modules).
const require = createRequire(new URL("../video-worker/render.mjs", import.meta.url));
let sharp = null, qrcode = null;
try { sharp = require("sharp"); qrcode = require("qrcode"); } catch (e) { console.log("  (sharp/qrcode nicht ladbar: " + e.message + ")"); }

// ffmpeg-Verfügbarkeit prüfen (für das echte Mini-Rendering).
const hasFfmpeg = (() => { try { return spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0; } catch { return false; } })();

// ---- BUSINESS_REQUIRED-Meldung (aus lib/plan.ts, hier gespiegelt für den Gate-Text) ----
const BUSINESS_REQUIRED = "Dieses Feature ist im Business-Tarif enthalten. Upgrade unter Einstellungen → Abo.";

const createdTuts = [];
let accountId, userId, jobIds = [];
const storagePaths = [];

try {
  // ========== (a) SEGMENTPLAN ==========
  {
    // Lineares 3-Schritt-Tutorial.
    const steps = [
      { id: "a", title: "Startseite öffnen", is_decision: false, position: 1, highlights: [{ type: "rect", x: 0.2, y: 0.3, w: 0.1, h: 0.1 }] },
      { id: "b", title: "Anmelden", is_decision: false, position: 2, highlights: [] },
      { id: "c", title: "Fertig: Dashboard", is_decision: false, position: 3, highlights: [] },
    ];
    const branches = [
      { step_id: "a", label: null, color: null, target_step_id: "b", position: 0 },
      { step_id: "b", label: null, color: null, target_step_id: "c", position: 0 },
    ];
    const durs = { a: 3, b: 2, c: 2 };
    const plan = buildSegmentPlan({ steps, branches, rootStepId: "a" }, (s) => durs[s.id]);
    ok(plan.length === 3 && plan.every((p) => p.type === "step"), "(a) linear: 3 Schritt-Segmente");
    ok(plan[0].title === "Startseite öffnen" && plan[2].title === "Fertig: Dashboard", "(a) linear: Reihenfolge korrekt");
    ok(plan[0].duration === 3 && plan[1].duration === 2, "(a) linear: Schritt-Dauern aus stepDuration übernommen");

    // Kapiteltext (mit Intro/Outro + xfade-Überlappung).
    const full = fullPlan({ tutorial: { title: "Linear Test" }, steps, branches, rootStepId: "a" }, { a: 2.2, b: 1.2, c: 1.2 });
    const { chaptersText, total } = computeChapters(full);
    ok(/^0:00 Intro/.test(chaptersText), "(a) Kapiteltext beginnt mit '0:00 Intro'");
    ok(chaptersText.includes("Startseite öffnen") && chaptersText.includes("Abschluss"), "(a) Kapiteltext enthält Schritt-Titel + Abschluss");
    ok(total > 0 && isFinite(total), "(a) Gesamtdauer plausibel: " + total.toFixed(1) + "s");
  }

  {
    // Verzweigtes Tutorial: Frage q -> [Ja->b1, Nein->b2] -> Rejoin d.
    const steps = [
      { id: "q", title: "Haben Sie ein Konto?", is_decision: true, position: 1, highlights: [] },
      { id: "b1", title: "Anmelden", is_decision: false, position: 2, highlights: [] },
      { id: "b2", title: "Registrieren", is_decision: false, position: 3, highlights: [] },
      { id: "d", title: "Dashboard", is_decision: false, position: 4, highlights: [] },
    ];
    const branches = [
      { step_id: "q", label: "Ja", color: "#0f9d72", target_step_id: "b1", position: 0 },
      { step_id: "q", label: "Nein", color: "#d6455d", target_step_id: "b2", position: 1 },
      { step_id: "b1", label: null, color: null, target_step_id: "d", position: 0 },
      { step_id: "b2", label: null, color: null, target_step_id: "d", position: 0 },
    ];
    const plan = buildSegmentPlan({ steps, branches, rootStepId: "q" }, () => 2);
    const titles = plan.map((p) => `${p.type}:${p.title}`);
    ok(plan[0].type === "step" && plan[0].title === "Haben Sie ein Konto?", "(a) verzweigt: Frage-Schritt zuerst");
    const chapterCards = plan.filter((p) => p.type === "chapter");
    ok(chapterCards.length === 2, "(a) verzweigt: genau 2 Kapitel-Karten (je Ast)");
    ok(chapterCards.some((c) => c.title === "Fall: Ja") && chapterCards.some((c) => c.title === "Fall: Nein"), "(a) verzweigt: Kapitel-Karten 'Fall: Ja'/'Fall: Nein'");
    ok(chapterCards[0].color === "#0f9d72", "(a) verzweigt: Ja-Karte trägt Ast-Farbe (grün)");
    const rejoinCount = plan.filter((p) => p.type === "step" && p.title === "Dashboard").length;
    ok(rejoinCount === 1, "(a) verzweigt: Rejoin-Schritt (Dashboard) erscheint GENAU einmal");
    // Ast-Schritte liegen zwischen ihrer Karte und dem Rejoin.
    ok(titles.join("|") === "step:Haben Sie ein Konto?|chapter:Fall: Ja|step:Anmelden|chapter:Fall: Nein|step:Registrieren|step:Dashboard",
      "(a) verzweigt: DFS-Reihenfolge korrekt (Frage, Ja-Ast, Nein-Ast, Rejoin)");
  }

  // ========== (b) FFMPEG-KOMMANDOBAU ==========
  {
    const size = { w: 1920, h: 1080 };
    // zoompan Richtung Highlight-Zentrum: Box x0.2 y0.3 w0.2 h0.1 -> Zentrum (0.30, 0.35).
    const kb = kenBurnsFilter({ x: 0.2, y: 0.3, w: 0.2, h: 0.1 }, size, 90, 30);
    ok(kb.startsWith("zoompan="), "(b) Ken-Burns ist ein zoompan-Filter");
    ok(kb.includes("iw*0.3000") && kb.includes("ih*0.3500"), "(b) zoompan zielt auf Highlight-Zentrum (0.30/0.35)");
    ok(kb.includes("s=1920x1080") && kb.includes("fps=30"), "(b) zoompan setzt Zielgröße + fps");

    // drawtext: Titel mit Doppelpunkt + Umlaute maskiert.
    const esc = escapeDrawtext("Öffnen: Menü über „Datei“ 50%");
    ok(esc.includes("\\:") && esc.includes("\\%"), "(b) drawtext maskiert Doppelpunkt + Prozent");
    ok(esc.includes("Ö") && esc.includes("Menü"), "(b) drawtext lässt deutsche Umlaute unangetastet");
    ok(!esc.includes("'"), "(b) drawtext ersetzt gerade Apostrophe (kein Quote-Bruch)");

    const brand = resolveBrand(null);
    const lts = lowerThirdFilters({ title: "Schritt: klicken", caption: wrapCaption("Ein langer gesprochener Satz der umbrechen sollte weil er sehr lang ist und mehr als eine Zeile braucht", 40, 2), fontFile: "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", fontBold: "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", brand, size });
    ok(lts.some((f) => f.startsWith("drawbox=")), "(b) Lower-Third: Brand-Bauchbinde (drawbox)");
    ok(lts.filter((f) => f.startsWith("drawtext=")).length === 2, "(b) Lower-Third: Titel + Untertitel (2 drawtext)");
    ok(lts.join(",").includes("Schritt\\:"), "(b) Lower-Third: Doppelpunkt im Titel maskiert");

    // wrapCaption kürzt sehr langen Text mit … auf max. 2 Zeilen.
    const wrapped = wrapCaption("wort ".repeat(60), 40, 2);
    ok(wrapped.split("\n").length <= 2 && wrapped.includes("…"), "(b) wrapCaption: max 2 Zeilen + Kürzung mit …");
  }

  // ========== (c) SHARP-KARTEN + QR ==========
  if (sharp && qrcode) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rcards-"));
    try {
      const brand = resolveBrand({ mode: "manual", tokens: { colors: { primary: "#c81e5a", background: "#fffafc", text: "#1a1a1a" } } });
      ok(brand.primary === "#c81e5a", "(c) resolveBrand liest Primärfarbe aus tokens");
      ok(resolveBrand(null).primary === "#3d4ee6", "(c) resolveBrand-Fallback = Indigo");

      const size = { w: 1920, h: 1080 };
      const introPng = path.join(dir, "intro.png");
      await sharp(Buffer.from(introCardSvg(brand, "Digitale Lohnabrechnung: äöü", size, null))).png().toFile(introPng);
      const im = await sharp(introPng).metadata();
      ok(fs.existsSync(introPng) && im.width === 1920 && im.height === 1080, "(c) Intro-Karte: PNG 1920x1080");

      const qrPng = await qrcode.toBuffer("https://steply.app/h/acme/test", { type: "png", margin: 1, width: 600 });
      ok(qrPng.length > 100, "(c) QR-PNG erzeugt (" + qrPng.length + " Bytes)");
      const qrMeta = await sharp(qrPng).metadata();
      ok(qrMeta.width >= 100, "(c) QR-PNG ist ein gültiges Bild (" + qrMeta.width + "px)");

      const outroPng = path.join(dir, "outro.png");
      await sharp(Buffer.from(outroCardSvg(brand, "https://steply.app/h/acme/test", size, "data:image/png;base64," + qrPng.toString("base64")))).png().toFile(outroPng);
      const om = await sharp(outroPng).metadata();
      ok(om.width === 1920 && om.height === 1080, "(c) Outro-Karte (mit QR): PNG 1920x1080");

      const chPng = path.join(dir, "chapter.png");
      await sharp(Buffer.from(chapterCardSvg(brand, "Fall: Ja", "#0f9d72", size))).png().toFile(chPng);
      const cm = await sharp(chPng).metadata();
      ok(cm.width === 1920 && cm.height === 1080, "(c) Kapitel-Karte: PNG 1920x1080");

      // Highlight-Overlay ist transparent (Alpha-Kanal).
      const hlPng = path.join(dir, "hl.png");
      await sharp(Buffer.from(highlightOverlaySvg({ x: 0.3, y: 0.3, w: 0.2, h: 0.15 }, size, 1))).png().toFile(hlPng);
      const hm = await sharp(hlPng).metadata();
      ok(hm.channels === 4 && hm.hasAlpha, "(c) Highlight-Overlay: transparentes PNG (Alpha)");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } else {
    ok(false, "(c) sharp/qrcode nicht verfügbar — Karten-Test übersprungen");
  }

  // ========== (d) createRenderJob-GATES (DB-Ebene wie die Server-Action) ==========
  {
    const email = `tutax-render-${Date.now()}@example.com`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
    userId = u.user.id;
    accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;

    // Die reine Gate-Logik der Action gegen echte DB-Rows nachbilden.
    async function gate(tutorialId, style) {
      const { data: acc } = await admin.from("accounts").select("plan").eq("id", accountId).single();
      const isBusiness = acc?.plan === "business";
      if (!isBusiness) throw new Error(BUSINESS_REQUIRED);
      const { data: t } = await admin.from("tutorials").select("id, account_id, title, status, visibility").eq("id", tutorialId).single();
      if (!t) throw new Error("Tutorial nicht gefunden.");
      if (t.account_id !== accountId) throw new Error("Kein Zugriff.");
      if (t.status !== "published" || t.visibility !== "public") throw new Error("Bitte das Tutorial zuerst öffentlich veröffentlichen.");
      const { data: running } = await admin.from("video_jobs").select("id").eq("kind", "render").eq("tutorial_id", tutorialId).eq("render_style", style).in("status", ["queued", "processing"]);
      if (running && running.length) throw new Error("Für dieses Tutorial läuft bereits ein Export in diesem Stil.");
      const { data: job } = await admin.from("video_jobs").insert({ account_id: accountId, kind: "render", render_style: style, tutorial_id: tutorialId, title: t.title, status: "queued" }).select("id, kind, render_style").single();
      return job;
    }

    // Tutorial (Entwurf, public) anlegen.
    const tutId = uuid();
    createdTuts.push(tutId);
    await admin.from("tutorials").insert({ id: tutId, account_id: accountId, title: "Render-Gate-Test", status: "draft", visibility: "public" });

    // free-Konto -> BUSINESS_REQUIRED.
    await admin.from("accounts").update({ plan: "free" }).eq("id", accountId);
    let msg = "";
    try { await gate(tutId, "classic"); } catch (e) { msg = e.message; }
    ok(msg === BUSINESS_REQUIRED, "(d) nicht-Business -> BUSINESS_REQUIRED");

    // Business, aber Entwurf -> Fehler.
    await admin.from("accounts").update({ plan: "business" }).eq("id", accountId);
    msg = "";
    try { await gate(tutId, "classic"); } catch (e) { msg = e.message; }
    ok(/veröffentlichen/.test(msg), "(d) Entwurf -> Fehler (bitte veröffentlichen)");

    // Veröffentlicht + public -> gültiger Job mit kind/render_style.
    await admin.from("tutorials").update({ status: "published", visibility: "public", slug: "render-gate-test" }).eq("id", tutId);
    const job1 = await gate(tutId, "classic");
    if (job1?.id) jobIds.push(job1.id);
    ok(job1 && job1.kind === "render" && job1.render_style === "classic", "(d) gültig -> Row mit kind='render', render_style='classic'");

    // Doppel-Job (gleicher Stil, läuft noch) -> Fehler.
    msg = "";
    try { await gate(tutId, "classic"); } catch (e) { msg = e.message; }
    ok(/bereits ein Export/.test(msg), "(d) Doppel-Job (gleicher Stil) -> Fehler");

    // Anderer Stil ist erlaubt (zum Vergleich beide erzeugen).
    const job2 = await gate(tutId, "screencast");
    if (job2?.id) jobIds.push(job2.id);
    ok(job2 && job2.render_style === "screencast", "(d) anderer Stil (screencast) parallel erlaubt");
  }

  // ========== (e) ECHTES MINI-RENDERING (nur mit lokalem ffmpeg) ==========
  if (hasFfmpeg && sharp && qrcode) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rminirender-"));
    try {
      const FONT = ["C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((f) => fs.existsSync(f));
      const FONT_BOLD = ["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => fs.existsSync(f)) || FONT;
      const img1 = path.join(dir, "s1.png"), img2 = path.join(dir, "s2.png");
      await sharp({ create: { width: 1280, height: 800, channels: 3, background: "#dde3f0" } }).png().toFile(img1);
      await sharp({ create: { width: 1280, height: 800, channels: 3, background: "#f0e3dd" } }).png().toFile(img2);

      const runFfmpeg = (args) => { const r = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }); if (r.status !== 0) throw new Error("ffmpeg " + r.status + ": " + (r.stderr || "").split("\n").slice(-4).join(" ")); };
      const ffprobeDuration = async (f) => parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", f], { encoding: "utf8" }).stdout.trim());

      const ctx = {
        tutorial: { title: "Mini: äöü Test", slug: "mini-test" },
        steps: [
          { id: "s1", title: "Schritt 1: klicken", is_decision: false, position: 1, video_time: null, highlights: [{ type: "rect", x: 0.3, y: 0.3, w: 0.2, h: 0.15 }], caption: "Klicken Sie auf den Knopf." },
          { id: "s2", title: "Schritt 2", is_decision: false, position: 2, video_time: null, highlights: [], caption: "Fertig." },
        ],
        branches: [{ step_id: "s1", label: null, color: null, target_step_id: "s2", position: 0 }],
        rootStepId: "s1", theme: null, appUrl: "https://steply.app", accountSlug: "acme",
        files: { imageByStep: { s1: img1, s2: img2 }, audioByStep: {}, logoPath: null, sourceVideoPath: null, clicks: [] },
      };
      const { outFile, chaptersText } = await renderVideo(
        { runFfmpeg, ffprobeDuration, sharp, qrcode, log: () => {} },
        ctx,
        { dir, format: "16:9", style: "classic", fontFile: FONT, fontBold: FONT_BOLD, fps: 24, onProgress: async () => {} },
      );
      ok(fs.existsSync(outFile), "(e) echtes Mini-Rendering erzeugt eine MP4");
      const dur = await ffprobeDuration(outFile);
      ok(dur > 5 && dur < 30, "(e) MP4-Dauer plausibel: " + dur.toFixed(1) + "s");
      const vs = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name", "-of", "csv=p=0", outFile], { encoding: "utf8" }).stdout.trim();
      ok(vs.includes("1920,1080") && vs.includes("h264"), "(e) MP4 ist 1080p H.264: " + vs);
      const as = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", outFile], { encoding: "utf8" }).stdout.trim();
      ok(as.includes("aac"), "(e) MP4 hat AAC-Audiospur: " + as);
      ok(chaptersText.includes("Intro") && chaptersText.includes("Schritt 1"), "(e) Kapitelmarken generiert");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } else {
    console.log("ℹ (e) ffmpeg/sharp/qrcode lokal nicht (alle) vorhanden — echtes Rendering erst nach deploy.sh testbar.");
  }

  void firstHighlight; void stepDurationFn;
} catch (e) {
  ok(false, "Unerwarteter Fehler: " + (e?.stack || e?.message || e));
} finally {
  // Cleanup: Jobs, Storage, Tutorials, Account, User.
  for (const jid of jobIds) { try { await admin.from("video_jobs").delete().eq("id", jid); } catch {} }
  for (const p of storagePaths) { try { await admin.storage.from("tutorial-videos").remove([p]); } catch {} }
  for (const tutId of createdTuts) {
    try {
      const { data: st } = await admin.from("steps").select("id").eq("tutorial_id", tutId);
      const ids = (st || []).map((s) => s.id);
      if (ids.length) await admin.from("step_branches").delete().in("step_id", ids);
      await admin.from("steps").delete().eq("tutorial_id", tutId);
      await admin.from("tutorials").delete().eq("id", tutId);
    } catch {}
  }
  if (accountId) { try { await admin.from("accounts").delete().eq("id", accountId); } catch {} }
  if (userId) { try { await admin.auth.admin.deleteUser(userId); } catch {} }
}

console.log(failed ? "\n✗ Render-Live-Test fehlgeschlagen." : "\n✓ Render-Live-Test grün (Segmentplan, ffmpeg-Bau, Karten/QR, Gates" + (hasFfmpeg ? ", echtes Rendering" : "") + ").");
process.exitCode = failed ? 1 : 0;
