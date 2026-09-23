import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDriftCheck } from "@/lib/drift";
import { appBaseUrl } from "@/lib/url";
import { sendEmail } from "@/lib/email/send";
import { driftDigestEmail } from "@/lib/email/templates";

// Cron kann bis zu 10 web_search-Läufe machen -> großzügiges Zeitbudget.
export const maxDuration = 300;

const MAX_PER_RUN = 10; // Kosten-Deckel pro Lauf (teuerster KI-Call = web_search)
const MAX_PER_ACCOUNT = 5; // kein Konto verbraucht allein den ganzen Lauf
const CANDIDATE_POOL = 200; // so viele älteste Kandidaten laden, um fair je Konto zu verteilen
const TIME_BUDGET_MS = 230_000; // danach keinen neuen Check starten (maxDuration 300 s, Check ≤ 55 s)
const STALE_AFTER_DAYS = 7; // erst nach >7 Tagen erneut prüfen

/**
 * Digest-Mail an alle Inhaber eines Kontos mit neu als veraltet erkannten Anleitungen.
 * Ohne RESEND_API_KEY/INVITE_FROM_EMAIL -> nur Log (kein harter Fehler).
 */
async function sendDigest(to: string[], accountName: string, titles: string[]): Promise<void> {
  const mail = driftDigestEmail({ baseUrl: appBaseUrl(), accountName, titles });
  const res = await sendEmail({ to, ...mail, tag: "drift-digest" });
  if (res === "unconfigured") console.log(`[cron/drift] Digest an ${to.join(", ")}: ${titles.join(", ")}`);
}

export async function GET(req: NextRequest) {
  // FAIL-CLOSED: ohne konfiguriertes Secret läuft der Cron NIE.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Cron nicht konfiguriert" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Veröffentlichte Anleitungen von BUSINESS-Konten (der wöchentliche Autopilot ist ein
  // Business-Versprechen, lib/pricing.ts) — keine Vorlagen, keine Free/Pro-Konten, die sonst
  // das Budget aufbrauchen. Älteste/nie geprüfte zuerst. Den >7-Tage-Filter machen wir in JS
  // (robuster als ein roher Timestamp in einem PostgREST-or-Filter).
  const cutoff = Date.now() - STALE_AFTER_DAYS * 86_400_000;
  const { data: candidates, error } = await admin
    .from("tutorials")
    .select("id, title, account_id, drift_checked_at, accounts!inner(plan)")
    .eq("status", "published")
    .eq("is_template", false)
    .eq("accounts.plan", "business")
    .order("drift_checked_at", { ascending: true, nullsFirst: true })
    .limit(CANDIDATE_POOL);
  if (error) {
    console.error("[cron/drift] Kandidaten-Query:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fair verteilen: höchstens MAX_PER_ACCOUNT je Konto, insgesamt MAX_PER_RUN.
  const perAccount = new Map<string, number>();
  const tutorials = (candidates ?? [])
    .filter((t) => !t.drift_checked_at || new Date(t.drift_checked_at).getTime() < cutoff)
    .filter((t) => {
      const n = perAccount.get(t.account_id) ?? 0;
      if (n >= MAX_PER_ACCOUNT) return false;
      perAccount.set(t.account_id, n + 1);
      return true;
    })
    .slice(0, MAX_PER_RUN);
  // Konten mit NEU veralteten Anleitungen: account_id -> {name, titles[]}.
  const staleByAccount = new Map<string, string[]>();
  let checked = 0;
  let failed = 0;
  const startedAt = Date.now();

  for (const t of tutorials) {
    // Zeitbudget: keinen neuen Check mehr starten, wenn einer (≤ 55 s) nicht mehr hineinpasst.
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const res = await runDriftCheck(admin, t.id);
    if (res.kind === "not_configured") {
      // Kein KI-Key -> Cron ist wirkungslos; früh raus (spart Schleifenläufe).
      return NextResponse.json({ ok: true, checked, note: "KI nicht konfiguriert" });
    }
    if (res.kind === "ok") {
      checked++;
      if (res.is_stale) {
        const list = staleByAccount.get(t.account_id) ?? [];
        list.push(t.title ?? "Anleitung");
        staleByAccount.set(t.account_id, list);
      }
    } else if (res.kind === "error") {
      // Fehlgeschlagene Prüfung trotzdem als „geprüft“ stempeln: sonst bliebe die Anleitung
      // ganz vorn in der Warteschlange und blockierte jede Woche den ganzen Lauf.
      failed++;
      console.error(`[cron/drift] Prüfung fehlgeschlagen (${t.id}):`, res.message);
      await admin.from("tutorials").update({ drift_checked_at: new Date().toISOString() }).eq("id", t.id);
    }
    // cooldown: still überspringen (greift z. B. bei manuellem Check kurz zuvor).
  }

  // Pro betroffenem Konto eine Digest-Mail an alle Inhaber.
  let notified = 0;
  for (const [accountId, titles] of staleByAccount) {
    const { data: account } = await admin
      .from("accounts")
      .select("name")
      .eq("id", accountId)
      .maybeSingle();
    const { data: owners } = await admin
      .from("account_members")
      .select("user_id")
      .eq("account_id", accountId)
      .eq("role", "owner");

    const emails: string[] = [];
    for (const o of owners ?? []) {
      const { data } = await admin.auth.admin.getUserById(o.user_id);
      const email = data?.user?.email;
      if (email) emails.push(email);
    }
    if (!emails.length) continue;
    await sendDigest(emails, account?.name ?? "Ihr Konto", titles);
    notified++;
  }

  return NextResponse.json({ ok: true, checked, failed, accountsNotified: notified });
}
