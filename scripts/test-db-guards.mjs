// Schutzregeln der Datenbank (Migration 0042) — alle Fälle in EINER Transaktion, danach ROLLBACK
// (nichts bleibt liegen), plus gleichzeitiges Austreten zweier Inhaber über zwei Verbindungen.
// Nutzung:  node --env-file=.env.local scripts/test-db-guards.mjs
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
async function mkUser(tag) {
  const { data, error } = await admin.auth.admin.createUser({ email: `guard-${tag}-${stamp}@example.com`, password: "Probe12345!", email_confirm: true });
  if (error) throw error;
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", data.user.id).single();
  return { uid: data.user.id, acc: m.account_id };
}
const A = await mkUser("a"), B = await mkUser("b"), C = await mkUser("c");
const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`); if (!cond) failed++; };
async function attempt(label, q, params = []) {
  await c.query("savepoint s");
  try { await c.query(q, params); await c.query("release savepoint s"); return null; }
  catch (e) { await c.query("rollback to savepoint s"); return e.message; }
}
try {
  await c.query("begin");
  const active = (await c.query("select count(*)::int n from pg_trigger where tgname in ('steps_path_guard','themes_path_guard','automation_steps_path_guard','account_members_last_owner')")).rows[0].n;
  ok(active === 4, `Alle 4 Wächter aktiv (${active})`);
  // Testdaten (innerhalb der Transaktion)
  const tut = (await c.query("insert into tutorials (account_id, title) values ($1, 'Probe') returning id", [A.acc])).rows[0].id;
  const step = (await c.query("insert into steps (tutorial_id, title, position) values ($1, 'S', 0) returning id", [tut])).rows[0].id;

  console.log("Regel 1 — Speicherpfade");
  ok(!!(await attempt("fremd", "update steps set image_path = $1 where id = $2", [`${B.acc}/x.webp`, step])), "Schritt: Bild aus FREMDEM Ordner abgelehnt");
  ok(!(await attempt("eigen", "update steps set image_path = $1 where id = $2", [`${A.acc}/${tut}/x.webp`, step])), "Schritt: Bild aus eigenem Ordner erlaubt");
  ok(!!(await attempt("dotdot", "update steps set image_path = $1 where id = $2", [`${A.acc}/../${B.acc}/x.webp`, step])), "Schritt: „..“-Trick abgelehnt");
  ok(!!(await attempt("audio", "update steps set audio_path = $1 where id = $2", [`${B.acc}/t/audio/a.mp3`, step])), "Schritt: Audio aus fremdem Ordner abgelehnt");
  ok(!(await attempt("audio-ok", "update steps set audio_path = $1 where id = $2", [`${A.acc}/${tut}/audio/a.mp3`, step])), "Schritt: eigenes Audio erlaubt");
  ok(!(await attempt("null", "update steps set image_path = null where id = $1", [step])), "Schritt: Bild entfernen erlaubt");
  ok(!(await attempt("title", "update steps set title = 'neu' where id = $1", [step])), "Schritt: Titel ändern unberührt");
  ok(!!(await attempt("logo", "update themes set logo_path = $1 where account_id = $2", [`${B.acc}/branding/l.png`, A.acc])), "Logo aus fremdem Ordner abgelehnt");
  ok(!(await attempt("logo-ok", "update themes set logo_path = $1 where account_id = $2", [`${A.acc}/branding/l.png`, A.acc])), "Eigenes Logo erlaubt");
  const tpl = (await c.query("insert into tutorials (account_id, title, is_template) values (null, 'Vorlage', true) returning id")).rows[0].id;
  ok(!(await attempt("tpl-server", "insert into steps (tutorial_id, title, position, image_path) values ($1, 'T', 0, 'vorlagen/x.webp')", [tpl])), "Vorlage: Server darf Pfad setzen");
  ok(!!(await attempt("tpl-user", "select set_config('request.jwt.claims', '{\"role\":\"authenticated\"}', true); insert into steps (tutorial_id, title, position, image_path) values ('" + tpl + "', 'T2', 1, 'vorlagen/y.webp')")), "Vorlage: Nutzer (per REST) darf keinen Pfad setzen");
  await c.query("select set_config('request.jwt.claims', '', true)");
  const auto = await attempt("auto", "insert into automations (account_id, title) values ($1, 'A') returning id", [A.acc]);
  if (!auto) {
    const aid = (await c.query("select id from automations where account_id = $1 order by created_at desc limit 1", [A.acc])).rows[0].id;
    ok(!!(await attempt("auto-fremd", "insert into automation_steps (automation_id, position, title, action, image_path) values ($1, 0, 'x', 'click', $2)", [aid, `${B.acc}/x.webp`])), "Automation: Bild aus fremdem Ordner abgelehnt");
    ok(!(await attempt("auto-eigen", "insert into automation_steps (automation_id, position, title, action, image_path) values ($1, 1, 'y', 'click', $2)", [aid, `${A.acc}/x.webp`])), "Automation: eigenes Bild erlaubt");
  } else console.log("  (Automation-Fall übersprungen:", auto.slice(0, 90), ")");

  console.log("Regel 2 — letzter Inhaber");
  await c.query("insert into account_members (account_id, user_id, role) values ($1, $2, 'editor')", [A.acc, B.uid]);
  ok(!!(await attempt("del-owner", "delete from account_members where account_id = $1 and user_id = $2", [A.acc, A.uid])), "Letzten Inhaber entfernen (Team hat noch jemanden) abgelehnt");
  ok(!!(await attempt("demote", "update account_members set role = 'editor' where account_id = $1 and user_id = $2", [A.acc, A.uid])), "Letzten Inhaber herabstufen abgelehnt");
  ok(!(await attempt("del-member", "delete from account_members where account_id = $1 and user_id = $2", [A.acc, B.uid])), "Bearbeiter entfernen erlaubt");
  await c.query("insert into account_members (account_id, user_id, role) values ($1, $2, 'editor')", [A.acc, B.uid]);
  ok(!(await attempt("promote", "update account_members set role = 'owner' where account_id = $1 and user_id = $2", [A.acc, B.uid])), "Zweiten Inhaber ernennen erlaubt");
  ok(!(await attempt("demote-ok", "update account_members set role = 'editor' where account_id = $1 and user_id = $2", [A.acc, A.uid])), "Mit zweitem Inhaber: sich selbst herabstufen erlaubt");
  ok(!(await attempt("sole", "delete from account_members where account_id = $1 and user_id = $2", [C.acc, C.uid])), "Einzige Person der Organisation darf gehen");
  ok(!(await attempt("cascade", "delete from accounts where id = $1", [A.acc])), "Organisation löschen (Kaskade) erlaubt");
} finally {
  await c.query("rollback").catch(() => {});
  await c.end();
  for (const u of [A, B, C]) {
    await admin.from("accounts").delete().eq("id", u.acc);
    await admin.auth.admin.deleteUser(u.uid);
  }
}
// ── Gleichzeitiges Austreten zweier Inhaber ──
{
const A = await mkUser("ra"), B = await mkUser("rb"), C = await mkUser("rc");
const conn = () => new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
const c1 = conn(), c2 = conn();
await c1.connect(); await c2.connect();
let result;
try {
  // Org von A: A + B Inhaber, C Mitarbeiter (Team bleibt also bestehen).
  await c1.query("insert into account_members (account_id, user_id, role) values ($1,$2,'owner'),($1,$3,'member')", [A.acc, B.uid, C.uid]);
  await c1.query("begin");
  await c1.query("delete from account_members where account_id=$1 and user_id=$2", [A.acc, A.uid]); // hält die Sperre
  await c2.query("begin");
  const p2 = c2.query("delete from account_members where account_id=$1 and user_id=$2", [A.acc, B.uid]).then(() => "ok", (e) => "abgelehnt: " + e.message);
  await new Promise((r) => setTimeout(r, 1500)); // c2 wartet jetzt auf die Sperre
  await c1.query("commit");
  const r2 = await p2;
  if (r2 === "ok") await c2.query("commit"); else await c2.query("rollback");
  const { rows } = await c1.query("select count(*)::int n from account_members where account_id=$1 and role='owner'", [A.acc]);
  result = { zweiter: r2, inhaberDanach: rows[0].n };
} finally {
  await c1.end(); await c2.end();
  for (const u of [A, B, C]) await admin.from("accounts").delete().eq("id", u.acc);
  for (const u of [A, B, C]) await admin.auth.admin.deleteUser(u.uid);
}
console.log("Zweiter Austritt:", result.zweiter);
console.log("Inhaber danach:", result.inhaberDanach);
const pass = result.zweiter.startsWith("abgelehnt") && result.inhaberDanach === 1;
console.log(pass ? "✓ Gleichzeitiges Austreten: Organisation behält einen Inhaber" : "✗ Organisation stünde ohne Inhaber da");
if (!pass) failed++;
}
console.log(failed ? `✗ ${failed} Prüfung(en) fehlgeschlagen` : "✓ Schutzregeln der Datenbank verifiziert");
process.exit(failed ? 1 : 0);
