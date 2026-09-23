import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { loadCustomerList } from "@/lib/admin-customers";
import { relativeDe, dateDe } from "@/lib/format";
import { CustomerTable, type CustomerListItem } from "@/components/admin/customer-table";

export const metadata: Metadata = { title: "Kunden · Admin" };

const DAY = 86_400_000;

/** Kennzahlen oben (außerhalb der Komponente: Zeitvergleich mit „jetzt“). */
function summarize(rows: Awaited<ReturnType<typeof loadCustomerList>>) {
  const now = Date.now();
  return [
    { label: "Kunden", value: rows.length },
    { label: "Pro", value: rows.filter((r) => r.plan === "pro").length },
    { label: "Business", value: rows.filter((r) => r.plan === "business").length },
    { label: "Neu (7 Tage)", value: rows.filter((r) => now - new Date(r.createdAt).getTime() < 7 * DAY).length },
    {
      label: "Aktiv (30 Tage)",
      value: rows.filter((r) => r.lastActive && now - new Date(r.lastActive).getTime() < 30 * DAY).length,
    },
    { label: "Mit Veröffentlichung", value: rows.filter((r) => r.published > 0).length },
  ];
}

export default async function AdminCustomersPage() {
  // Gate AUCH hier (PPR: Layout und Seite rendern parallel — nur das Layout-Gate ließe den
  // Seiteninhalt vor dem Redirect raus).
  await requireAdmin();
  const rows = await loadCustomerList();

  const items: CustomerListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    plan: r.plan,
    ownerEmails: r.ownerEmails,
    members: r.members,
    pendingInvites: r.pendingInvites,
    tutorials: r.tutorials,
    published: r.published,
    views30: r.views30,
    chats30: r.chats30,
    extension: r.extension,
    onboarded: r.onboarded,
    createdAt: r.createdAt,
    createdLabel: dateDe(r.createdAt),
    lastActive: r.lastActive,
    lastActiveLabel: r.lastActive ? relativeDe(r.lastActive) : "nie",
  }));

  const stats = summarize(rows);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8">
      <h1 className="text-2xl font-black text-ink">Kunden</h1>
      <p className="text-sm font-semibold text-muted-foreground">
        Alle Organisationen mit Tarif, Team und Nutzung. Klick auf einen Kunden für Details und Tarif-Wechsel.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" data-testid="customer-stats">
        {stats.map((s) => (
          <div key={s.label} className="rounded-card border-2 border-line bg-card px-4 py-3">
            <div className="text-2xl font-black text-ink">{s.value}</div>
            <div className="text-xs font-bold text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <CustomerTable rows={items} />
      </div>
    </main>
  );
}
