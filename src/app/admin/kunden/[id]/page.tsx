import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { loadCustomerDetail, PROTECTED_SLUGS } from "@/lib/admin-customers";
import { relativeDe, dateDe } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PlanBadge } from "@/components/admin/customer-table";
import { PlanSwitch, ResetLinkButton, DeleteCustomer } from "@/components/admin/customer-actions";

export const metadata: Metadata = { title: "Kunde · Admin" };

const ROLE: Record<string, string> = { owner: "Inhaber", editor: "Bearbeiter", member: "Mitarbeiter" };
const EVENT: Record<string, string> = {
  view: "Aufrufe der Hilfe-Seite",
  chat: "Fragen an den KI-Assistenten",
  feedback: "Rückmeldungen („hilfreich?“)",
  guide: "Live-Führungen (Erweiterung)",
};
const STATUS: Record<string, string> = { published: "Veröffentlicht", draft: "Entwurf" };
const JOB: Record<string, string> = { queued: "wartet", processing: "läuft", done: "fertig", failed: "fehlgeschlagen" };

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-card border-2 border-line bg-card">
      <div className="flex items-center justify-between gap-3 border-b-2 border-line-2 px-4 py-2.5">
        <h2 className="text-sm font-black text-ink">{title}</h2>
        {aside}
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export default async function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(); // eigenes Gate (PPR), s. /admin/kunden
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await loadCustomerDetail(id);
  if (!d) notFound();
  const a = d.account;
  const rel = (iso: string | null) => (iso ? relativeDe(iso) : "nie");

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <Link href="/admin/kunden" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-ink">
        <ArrowLeft className="size-4" /> Alle Kunden
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-black text-ink">
            {a.name} <PlanBadge plan={a.plan} />
          </h1>
          <p className="text-sm font-semibold text-muted-foreground">
            /h/{a.slug} · angelegt am {dateDe(a.createdAt)} ({rel(a.createdAt)})
            {!a.onboarded && " · Einrichtung noch nicht abgeschlossen"}
          </p>
          {a.sourceUrl && <p className="text-xs font-semibold text-muted-foreground">Website: {a.sourceUrl}</p>}
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/h/${a.slug}`} target="_blank" />}>
          <ExternalLink className="size-4" /> Hilfe-Seite öffnen
        </Button>
      </div>

      <div className="mt-6 grid gap-4">
        <Section title="Tarif">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-2">
              Aktuell: <b>{a.plan === "business" ? "Business" : a.plan === "pro" ? "Pro" : "Gratis"}</b>
              {a.languages.length > 0 && ` · Sprachen: ${a.languages.join(", ").toUpperCase()}`}
            </p>
            <PlanSwitch accountId={a.id} plan={a.plan} />
          </div>
        </Section>

        <Section title={`Team (${d.members.length})`}>
          <ul className="divide-y-2 divide-line-2">
            {d.members.map((m) => (
              <li key={m.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid="member-row">
                <span className="min-w-0 flex-1 truncate font-bold text-ink">{m.email}</span>
                <span className="rounded-full bg-line-2 px-2 py-0.5 text-[11px] font-black text-ink-2">{ROLE[m.role] ?? m.role}</span>
                <span className="text-xs font-semibold text-muted-foreground">zuletzt angemeldet {rel(m.lastSignIn)}</span>
                <ResetLinkButton userId={m.userId} email={m.email} />
              </li>
            ))}
          </ul>
          {d.invites.length > 0 && (
            <div className="mt-3 border-t-2 border-line-2 pt-3">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-faint">Offene Einladungen</p>
              <ul className="grid gap-1 text-sm font-semibold text-ink-2">
                {d.invites.map((i) => (
                  <li key={i.id}>
                    {i.email} · {ROLE[i.role] ?? i.role} · {rel(i.createdAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>

        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Nutzung">
            <ul className="grid gap-1.5 text-sm">
              {d.usage.map((u) => (
                <li key={u.type} className="flex justify-between gap-3">
                  <span className="font-semibold text-ink-2">{EVENT[u.type] ?? u.type}</span>
                  <span className="font-black text-ink">
                    {u.last30} <span className="text-xs font-bold text-faint">/ 30 T. · {u.total} gesamt</span>
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3">
                <span className="font-semibold text-ink-2">Wissensartikel</span>
                <span className="font-black text-ink">
                  {d.articles.published} <span className="text-xs font-bold text-faint">veröffentlicht · {d.articles.total} gesamt</span>
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="font-semibold text-ink-2">Automationen</span>
                <span className="font-black text-ink">{d.automations}</span>
              </li>
            </ul>
          </Section>

          <Section title={`Steply-Erweiterung (${d.extension.length})`}>
            {d.extension.length === 0 ? (
              <p className="text-sm font-semibold text-muted-foreground">Nicht verbunden.</p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {d.extension.map((t, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-ink-2">{t.label ?? "Browser"} · {t.email}</span>
                    <span className="text-xs font-bold text-muted-foreground">zuletzt genutzt {rel(t.lastUsed)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title={`Anleitungen (${d.tutorialTotal})`} aside={d.tutorialTotal > d.tutorials.length ? <span className="text-xs font-bold text-faint">die neuesten 50</span> : undefined}>
          {d.tutorials.length === 0 ? (
            <p className="text-sm font-semibold text-muted-foreground">Noch keine Anleitungen.</p>
          ) : (
            <ul className="divide-y-2 divide-line-2">
              {d.tutorials.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm" data-testid="tutorial-row">
                  {/* Jede Anleitung — auch Entwürfe und „nur Team“ — in der Admin-Vorschau öffnen. */}
                  <Link
                    href={`/admin/kunden/${a.id}/anleitung/${t.id}`}
                    className="min-w-0 flex-1 truncate font-bold text-ink hover:text-primary hover:underline"
                    title="Vorschau öffnen"
                  >
                    {t.title}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${t.status === "published" ? "bg-teal-soft text-[#118576]" : "bg-amber-soft text-amber-text"}`}>
                    {STATUS[t.status] ?? t.status}
                  </span>
                  {t.visibility === "internal" && <span className="text-[11px] font-black text-faint">nur Team</span>}
                  <span className="text-xs font-semibold text-muted-foreground">geändert {rel(t.updatedAt)}</span>
                  <Link
                    href={`/admin/kunden/${a.id}/anleitung/${t.id}`}
                    className="text-xs font-extrabold text-primary hover:underline"
                    data-testid="tutorial-preview-link"
                  >
                    Vorschau
                  </Link>
                  {t.status === "published" && t.slug && t.visibility === "public" && (
                    <Link href={`/h/${a.slug}/${t.slug}`} target="_blank" className="text-xs font-extrabold text-muted-foreground hover:text-primary hover:underline">
                      live ↗
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        {d.videos.length > 0 && (
          <Section title="Video-Aufträge (die letzten 10)">
            <ul className="grid gap-1.5 text-sm">
              {d.videos.map((v, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold text-ink-2">{v.title ?? "Video"} · {JOB[v.status] ?? v.status}</span>
                  <span className="text-xs font-bold text-muted-foreground" title={v.error ?? undefined}>{rel(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Gefahrenzone">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm font-semibold text-ink-2">
              Kunde samt allen Anleitungen, Dateien und der Hilfe-Seite endgültig löschen. Personen ohne weitere
              Organisation verlieren ihr Konto.
            </p>
            <DeleteCustomer
              accountId={a.id}
              name={a.name}
              blocked={PROTECTED_SLUGS.has(a.slug) ? "Steplys eigene Organisation – nicht löschbar" : undefined}
            />
          </div>
        </Section>
      </div>
    </main>
  );
}
