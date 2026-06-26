// Live-Test Template-System (§14): aktivieren, Standard auflösen, forken, zurücksetzen.
// Nutzung:  node --env-file=.env.local scripts/test-templates-live.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const uuid = () => crypto.randomUUID();

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const email = `tutax-tpl-${Date.now()}@example.com`;
let accountId, userId;

// Resolver (Spiegel von lib/templates.resolveCustomerTutorial)
async function resolve(db, acc, slug) {
  const { data: own } = await db.from("tutorials").select("id").eq("account_id", acc).eq("slug", slug).eq("status", "published").maybeSingle();
  if (own) return own.id;
  const { data: tpl } = await db.from("tutorials").select("id").eq("is_template", true).eq("status", "published").eq("slug", slug).maybeSingle();
  if (!tpl) return null;
  const { data: at } = await db.from("account_templates").select("enabled, forked_tutorial_id").eq("account_id", acc).eq("template_id", tpl.id).maybeSingle();
  if (!at?.enabled) return null;
  return at.forked_tutorial_id ?? tpl.id;
}

try {
  // Template (geseedet) holen
  const { data: tpl } = await admin.from("tutorials").select("id, slug").eq("is_template", true).eq("status", "published").not("slug", "is", null).limit(1).single();
  ok(!!tpl, `Globales Template vorhanden (slug=${tpl?.slug})`);

  // Kunde anlegen
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;
  const db = createClient(url, pub, { auth: { persistSession: false } });
  await db.auth.signInWithPassword({ email, password: "Test12345!" });

  // Kunde liest Template (public read published)
  const { data: readTpl } = await db.from("tutorials").select("id, title").eq("id", tpl.id).maybeSingle();
  ok(!!readTpl, "Kunde kann globales Template lesen (public read)");

  // Aktivieren (account_templates, owner RLS)
  const { error: enErr } = await db.from("account_templates").upsert({ account_id: accountId, template_id: tpl.id, enabled: true }, { onConflict: "account_id,template_id" });
  ok(!enErr, `Aktivieren (Häkchen) ${enErr ? "(" + enErr.message + ")" : ""}`);

  // Standard auflösen -> Template-ID
  ok((await resolve(db, accountId, tpl.slug)) === tpl.id, "Aufгелöst als STANDARD → zentrale Template-Version (Auto-Update)");

  // Forken: Kopie + Verknüpfung
  const forkId = uuid();
  await db.from("tutorials").insert({ id: forkId, account_id: accountId, is_template: false, title: readTpl.title, status: "published", slug: tpl.slug });
  const { data: tplSteps } = await admin.from("steps").select("*").eq("tutorial_id", tpl.id);
  const idMap = new Map();
  for (const s of tplSteps ?? []) idMap.set(s.id, uuid());
  if (tplSteps?.length) await db.from("steps").insert(tplSteps.map((s) => ({ id: idMap.get(s.id), tutorial_id: forkId, title: s.title, body: s.body, position: s.position, is_decision: s.is_decision })));
  await db.from("account_templates").upsert({ account_id: accountId, template_id: tpl.id, enabled: true, forked_tutorial_id: forkId }, { onConflict: "account_id,template_id" });
  ok((await resolve(db, accountId, tpl.slug)) === forkId, "Nach Fork → Aufлösung zeigt eigene Kopie (Angepasst)");

  // Zurücksetzen
  await db.from("tutorials").delete().eq("id", forkId);
  await db.from("account_templates").update({ forked_tutorial_id: null }).eq("account_id", accountId).eq("template_id", tpl.id);
  ok((await resolve(db, accountId, tpl.slug)) === tpl.id, "Nach Zurücksetzen → wieder STANDARD (zentrale Version)");

  // Deaktivieren -> nicht mehr sichtbar
  await db.from("account_templates").update({ enabled: false }).eq("account_id", accountId).eq("template_id", tpl.id);
  ok((await resolve(db, accountId, tpl.slug)) === null, "Deaktiviert → nicht auflösbar (nicht auf Hub)");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Template-System (§14) live verifiziert.");
process.exitCode = failed ? 1 : 0;
