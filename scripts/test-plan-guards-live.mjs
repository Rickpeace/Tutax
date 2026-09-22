// DB-Sperren gegen „am App vorbei per REST" (Migrationen 0037 + 0038).
// Ein Nutzer mit eigenem Login (Publishable Key, wie im Browser) versucht direkt:
// Tarif ändern, Business-Funktionen einschalten, Einladungen schreiben. Alles muss
// abgelehnt werden; Erlaubtes (Name ändern, Sprachen abwählen, Business-Konto) muss gehen.
// Wegwerf-Konto, wird am Ende gelöscht. Kein Server nötig.
//
// Nutzung:  node --env-file=.env.local scripts/test-plan-guards-live.mjs
import { createClient } from "@supabase/supabase-js";

const U = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(U, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const PW = "Test12345!";
const email = `tutax-guards-${Date.now()}@example.com`;

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const { data: created, error: ce } = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true });
if (ce) throw ce;
const uid = created.user.id;
const aid = (await admin.from("account_members").select("account_id").eq("user_id", uid)).data[0].account_id;
try {
  const user = createClient(U, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  await user.auth.signInWithPassword({ email, password: PW });
  const plan = async () => (await admin.from("accounts").select("plan").eq("id", aid).single()).data.plan;

  // Tarif (0037)
  const p = await user.from("accounts").update({ plan: "business" }).eq("id", aid).select("id");
  ok(!!p.error && (await plan()) === "free", `Tarif selbst hochstufen abgelehnt (${p.error?.message ?? "KEIN Fehler"})`);
  const n = await user.from("accounts").update({ name: "Neuer Name" }).eq("id", aid).select("name");
  ok(!n.error && n.data?.[0]?.name === "Neuer Name", "Name ändern bleibt erlaubt");

  // Sprachen (0038)
  const l = await user.from("accounts").update({ languages: ["en"] }).eq("id", aid).select("id");
  ok(!!l.error, `Kostenlos: Sprache per REST einschalten abgelehnt (${l.error?.message ?? "KEIN Fehler"})`);

  // Interne Anleitung (0038)
  const ti = await user.from("tutorials").insert({ account_id: aid, title: "Intern", status: "draft", visibility: "internal" }).select("id");
  ok(!!ti.error, `Kostenlos: interne Anleitung per REST anlegen abgelehnt (${ti.error?.message ?? "KEIN Fehler"})`);
  const tp = await user.from("tutorials").insert({ account_id: aid, title: "Öffentlich", status: "draft", visibility: "public" }).select("id");
  ok(!tp.error && tp.data?.length === 1, "Öffentliche Anleitung anlegen bleibt erlaubt");
  const tu = await user.from("tutorials").update({ visibility: "internal" }).eq("id", tp.data?.[0]?.id).select("id");
  ok(!!tu.error, `Kostenlos: Anleitung per REST auf „intern" stellen abgelehnt (${tu.error?.message ?? "KEIN Fehler"})`);

  // KI-Design (0038)
  const th = await user.from("themes").update({ mode: "ai" }).eq("account_id", aid).select("mode");
  ok(!!th.error, `Kostenlos: KI-Design per REST aktivieren abgelehnt (${th.error?.message ?? "KEIN Fehler"})`);

  // Einladungen (0038): nur noch lesen
  const inv = await user
    .from("invitations")
    .insert({ account_id: aid, email: "x@example.com", role: "editor", token: crypto.randomUUID().replace(/-/g, "") })
    .select("id");
  ok(!!inv.error || !(inv.data ?? []).length, `Einladung per REST am Server vorbei anlegen abgelehnt (${inv.error?.code ?? "0 Zeilen"})`);

  // Business-Konto darf (Server setzt den Tarif)
  await admin.from("accounts").update({ plan: "business" }).eq("id", aid);
  const lb = await user.from("accounts").update({ languages: ["en", "pl"] }).eq("id", aid).select("languages");
  ok(!lb.error && lb.data?.[0]?.languages?.length === 2, "Business: Sprachen einschalten erlaubt");
  const thb = await user.from("themes").update({ mode: "ai" }).eq("account_id", aid).select("mode");
  ok(!thb.error && thb.data?.[0]?.mode === "ai", "Business: KI-Design erlaubt");

  // Downgrade: Verkleinern/Zurückschalten bleibt erlaubt
  await admin.from("accounts").update({ plan: "free" }).eq("id", aid);
  const ld = await user.from("accounts").update({ languages: ["en"] }).eq("id", aid).select("languages");
  ok(!ld.error, "Nach Downgrade: Sprachen abwählen erlaubt");
  const thd = await user.from("themes").update({ mode: "manual" }).eq("account_id", aid).select("mode");
  ok(!thd.error, "Nach Downgrade: zurück auf Standard-Design erlaubt");
} catch (e) {
  ok(false, "Fehler: " + (e?.stack ?? e));
} finally {
  await admin.from("accounts").delete().eq("id", aid);
  await admin.auth.admin.deleteUser(uid);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ DB-Sperren (Tarif, Business-Funktionen, Einladungen) verifiziert.");
process.exit(failed ? 1 : 0);
