import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDriftCheck } from "@/lib/drift";
import { appBaseUrl } from "@/lib/url";

// Cron kann bis zu 10 web_search-Läufe machen -> großzügiges Zeitbudget.
export const maxDuration = 300;

const MAX_PER_RUN = 10; // Kosten-Deckel pro Lauf (teuerster KI-Call = web_search)
const STALE_AFTER_DAYS = 7; // erst nach >7 Tagen erneut prüfen

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * Digest-Mail an alle Inhaber eines Kontos mit neu als veraltet erkannten Anleitungen.
 * Ohne RESEND_API_KEY/INVITE_FROM_EMAIL -> nur console.log (kein harter Fehler).
 */
async function sendDigest(to: string[], accountName: string, titles: string[]): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  const count = titles.length;
  const subject = `${count} Anleitung${count === 1 ? "" : "en"} wirk${count === 1 ? "t" : "en"} veraltet`;
  const link = `${appBaseUrl()}/app/alerts`;
  if (!key || !from) {
    console.log(`[cron/drift] Digest (Mail nicht konfiguriert) an ${to.join(", ")}: ${subject} — ${titles.join(", ")}`);
    return;
  }
  const items = titles.map((t) => `<li style="margin:4px 0">${escapeHtml(t)}</li>`).join("");
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#101524">
    <h2 style="margin:0 0 8px">${count} Anleitung${count === 1 ? "" : "en"} wirk${count === 1 ? "t" : "en"} veraltet</h2>
    <p style="color:#3b4254;line-height:1.55">Unser Aktualitäts-Check hat bei <b>${escapeHtml(accountName)}</b> mögliche Änderungen gefunden:</p>
    <ul style="color:#101524;padding-left:20px;margin:12px 0">${items}</ul>
    <p style="margin:24px 0"><a href="${link}" style="background:#3d4ee6;color:#fff;text-decoration:none;padding:11px 20px;border-radius:10px;font-weight:600;display:inline-block">Hinweise ansehen</a></p>
    <p style="color:#6b7280;font-size:12px">Sie erhalten diese Mail, weil Sie Inhaber dieses Kontos auf Steply sind.</p>
  </div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) console.error("[cron/drift] Resend-Fehler:", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[cron/drift] Digest-Versand:", e instanceof Error ? e.message : e);
  }
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

  // Veröffentlichte Tutorials, älteste/nie geprüfte zuerst. Den >7-Tage-Filter
  // machen wir in JS (robuster als ein roher Timestamp in einem PostgREST-or-Filter).
  const cutoff = Date.now() - STALE_AFTER_DAYS * 86_400_000;
  const { data: candidates, error } = await admin
    .from("tutorials")
    .select("id, title, account_id, drift_checked_at")
    .eq("status", "published")
    .order("drift_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) {
    console.error("[cron/drift] Kandidaten-Query:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const tutorials = (candidates ?? []).filter(
    (t) => !t.drift_checked_at || new Date(t.drift_checked_at).getTime() < cutoff,
  );
  // Konten mit NEU veralteten Anleitungen: account_id -> {name, titles[]}.
  const staleByAccount = new Map<string, string[]>();
  let checked = 0;

  for (const t of tutorials) {
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
    }
    // cooldown/error: still überspringen (Cooldown greift z. B. bei manuellem Check kurz zuvor).
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

  return NextResponse.json({ ok: true, checked, accountsNotified: notified });
}
