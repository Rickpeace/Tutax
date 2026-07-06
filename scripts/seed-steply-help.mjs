// Seedet den STEPLY-HILFE-HUB (/h/steply): Steply erklärt Steply mit Steply.
// Eigenes Konto „Steply“ (KEINE Admin-Templates — die wären für Endkunden der Kanzleien).
//
// Welle 34: Die Doku ist jetzt FÜHRBAR. Jeder Schritt bekommt page_url (App-Route der Prod),
// jedes Tutorial site_domains (App-Host) — Grundlage für die Live-Führung der Erweiterung.
// Die Selektoren {css,text,role} + Screenshots setzt danach scripts/shoot-steply-help.mjs.
// Inhalt/Reihenfolge/Slugs kommen aus scripts/steply-help-content.mjs (geteilte Quelle).
//
// Ablauf empfohlen:  delete-steply-help.mjs  →  seed  →  shoot  →  backfill-tts.mjs
// Nutzung:  node --env-file=.env.local scripts/seed-steply-help.mjs
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { TUTORIALS, CATEGORIES, SHOT_ROUTES, resolveAppUrl, appSiteDomains } from "./steply-help-content.mjs";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const uuid = () => crypto.randomUUID();
const slugify = (s) =>
  s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 60);
const mkBody = (t) => ({ type: "doc", content: [{ type: "paragraph", content: t ? [{ type: "text", text: t }] : [] }] });

const APP_URL = resolveAppUrl();
const SITE_DOMAINS = appSiteDomains(APP_URL);
const pageUrlFor = (shot) => {
  const route = SHOT_ROUTES[shot];
  return route ? APP_URL + route : null;
};
console.log("App-URL (Prod):", APP_URL, "· site_domains:", JSON.stringify(SITE_DOMAINS), "\n");

// ---------- Konto „Steply“ sicherstellen ----------
const email = "hilfe@steply.dev";
let uid;
{
  const { data: created, error } = await admin.auth.admin.createUser({
    email, password: crypto.randomUUID() + "Xx1!", email_confirm: true,
    user_metadata: { account_name: "Steply" },
  });
  if (error && /already/i.test(error.message)) {
    const { data: page } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    uid = page.users.find((u) => u.email === email)?.id;
  } else if (error) { console.error(error.message); process.exit(1); }
  else uid = created.user.id;
}
const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", uid).limit(1).single();
const ACC = mem.account_id;
// business: Vorlesen (TTS) + Mehrsprachigkeit sind Business-Features, die die Doku erklärt.
await admin.from("accounts").update({ slug: "steply", onboarded: true, plan: "business" }).eq("id", ACC);
console.log("Konto Steply:", ACC, "→ /h/steply\n");

// ---------- Kategorien in fester Reihenfolge ----------
async function ensureCategory(name, pos) {
  const { data } = await admin.from("categories").select("id").eq("account_id", ACC).eq("name", name);
  if (data?.length) {
    await admin.from("categories").update({ position: pos }).eq("id", data[0].id);
    return data[0].id;
  }
  const { data: c } = await admin.from("categories").insert({ account_id: ACC, name, position: pos }).select("id").single();
  console.log("＋ Kategorie:", name);
  return c.id;
}
const catIds = {};
for (let i = 0; i < CATEGORIES.length; i++) catIds[CATEGORIES[i]] = await ensureCategory(CATEGORIES[i], i);

// ---------- KB-Index (mirror src/lib/kb.ts indexTutorial; @/-Alias hier nicht importierbar) ----------
const openaiKey = process.env.OPENAI_API_KEY ?? "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey, timeout: 30_000, maxRetries: 1 }) : null;
const plainBody = (body) => {
  const out = [];
  const walk = (n) => {
    if (!n || typeof n !== "object") return;
    if (typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(body);
  return out.join(" ").trim();
};
async function indexTutorialInline(tutorialId, title, slug, category, stepRows) {
  if (!openai) { console.log("  (kein OPENAI_API_KEY → KB-Index übersprungen)"); return; }
  const meta = { title, slug, category };
  const chunks = [`Anleitung: ${title}`];
  for (const s of stepRows) {
    const txt = [s.title, plainBody(s.body)].filter(Boolean).join(": ");
    if (txt.trim()) chunks.push(`${title} – ${txt}`);
  }
  await admin.from("kb_embeddings").delete()
    .eq("account_id", ACC).eq("source_type", "tutorial").eq("source_id", tutorialId);
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: chunks.map((c) => c.slice(0, 8000)),
  });
  const rows = res.data.map((d, i) => ({
    account_id: ACC, source_type: "tutorial", source_id: tutorialId,
    chunk: chunks[i], embedding: JSON.stringify(d.embedding), metadata: meta,
  }));
  const { error } = await admin.from("kb_embeddings").insert(rows);
  if (error) console.error("  ✗ KB-Index:", error.message);
  else console.log(`  ↳ KB-Index: ${rows.length} Chunks`);
}

// ---------- Seeden ----------
for (const t of TUTORIALS) {
  const { data: exists } = await admin.from("tutorials").select("id").eq("account_id", ACC).eq("title", t.title);
  if (exists?.length) { console.log("• übersprungen (existiert):", t.title); continue; }
  const tutId = uuid();

  // Slug: bevorzugt der vorgegebene (alte Links!); bei Kollision numerisch ausweichen.
  let slug = t.slug || slugify(t.title);
  for (let n = 1; ; n++) {
    const { data: s } = await admin.from("tutorials").select("id").eq("account_id", ACC).eq("slug", slug);
    if (!s?.length) break;
    slug = `${t.slug || slugify(t.title)}-${n + 1}`;
  }

  await admin.from("tutorials").insert({
    id: tutId, account_id: ACC, category_id: catIds[t.cat], title: t.title, description: t.desc,
    status: "published", visibility: "public", slug, published_at: new Date().toISOString(),
    site_domains: SITE_DOMAINS,
  });

  const rows = t.steps.map((st, i) => ({
    id: uuid(), tutorial_id: tutId, title: st.title, body: mkBody(st.body),
    position: i + 1, is_decision: false,
    page_url: pageUrlFor(st.shot), // App-Route der Prod; null bei Builder/öffentlichen Shots
  }));
  await admin.from("steps").insert(rows);
  await admin.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", tutId);

  const branches = rows.slice(0, -1).map((r, i) => ({
    id: uuid(), step_id: r.id, label: null, target_step_id: rows[i + 1].id, position: 0,
  }));
  if (branches.length) await admin.from("step_branches").insert(branches);

  console.log(`✓ veröffentlicht: ${t.title} (${rows.length} Schritte, /${slug})`);
  await indexTutorialInline(tutId, t.title, slug, t.cat, rows);
}

console.log("\n✓ Steply-Hilfe-Hub geseedet → /h/steply");
console.log("→ Jetzt Screenshots + Selektoren: node --env-file=.env.local scripts/shoot-steply-help.mjs <pw-dir>");
