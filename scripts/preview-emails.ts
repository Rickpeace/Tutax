// Vorschau aller Mails als HTML-Dateien + Screenshots (Desktop/Handy), ohne Versand.
// Nutzung:  npx tsx scripts/preview-emails.ts <Ausgabeordner>
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { welcomeEmail, inviteEmail, teamJoinedEmail, driftDigestEmail } from "../src/lib/email/templates";

const out = process.argv[2] ?? "email-preview";
mkdirSync(out, { recursive: true });
const base = "https://tutax-ivory.vercel.app";
const editor = { label: "Bearbeiter", hint: "Anleitungen, Wissen, Automationen & Einstellungen" };
const mails: Record<string, { subject: string; html: string; text: string }> = {
  "app-willkommen": welcomeEmail({ baseUrl: base, email: "anna@muster.de", orgName: "Muster GmbH" }),
  "app-einladung": inviteEmail({ baseUrl: base, orgName: "Muster GmbH", role: editor, link: `${base}/invite/abc123`, validDays: 7 }),
  "app-beitritt-neu": teamJoinedEmail({ baseUrl: base, email: "ben@muster.de", orgName: "Muster GmbH", role: editor, newAccount: true }),
  "app-beitritt-bestand": teamJoinedEmail({ baseUrl: base, email: "cara@firma.de", orgName: "Muster GmbH", role: { label: "Mitarbeiter", hint: "Nur Schulungen ansehen und abschließen" }, newAccount: false }),
  "app-hinweise": driftDigestEmail({ baseUrl: base, accountName: "Muster GmbH", titles: ["Rechnung erstellen", "Zugang einrichten"] }),
};
for (const [k, m] of Object.entries(mails)) {
  writeFileSync(path.join(out, `${k}.html`), m.html);
  writeFileSync(path.join(out, `${k}.txt`), `Betreff: ${m.subject}\n\n${m.text}`);
}
const tplDir = path.join(__dirname, "..", "supabase", "email-templates");
for (const f of readdirSync(tplDir).filter((f) => f.endsWith(".html")))
  writeFileSync(path.join(out, `supabase-${f}`), readFileSync(path.join(tplDir, f), "utf8").replaceAll("{{ .SiteURL }}", base).replaceAll("{{ .TokenHash }}", "TOKEN").replaceAll("{{ .Email }}", "alt@muster.de").replaceAll("{{ .NewEmail }}", "neu@muster.de"));

const require = createRequire(__filename);
let pw: typeof import("playwright");
try { pw = require("playwright"); } catch {
  const npx = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
  const d = readdirSync(npx).find((d) => { try { require.resolve(path.join(npx, d, "node_modules", "playwright")); return true; } catch { return false; } });
  pw = require(path.join(npx, d!, "node_modules", "playwright"));
}
(async () => {
  const browser = await pw.chromium.launch({ headless: true });
  for (const f of readdirSync(out).filter((f) => f.endsWith(".html"))) {
    for (const [tag, width] of [["desktop", 760], ["handy", 390]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(pathToFileURL(path.resolve(out, f)).href);
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(out, `${f.replace(".html", "")}-${tag}.png`), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      if (overflow) console.log(`WARN horizontaler Überlauf: ${f} (${tag})`);
      await page.close();
    }
  }
  await browser.close();
  console.log("Vorschau:", path.resolve(out));
})();
