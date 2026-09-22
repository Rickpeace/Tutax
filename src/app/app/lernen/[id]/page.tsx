import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dateLongDe } from "@/lib/format";
import { userDisplayName } from "@/lib/user-name";
import type { Step, StepBranch, Tutorial } from "@/lib/types";
import { LernenViewer } from "@/components/app/lernen-viewer";
import { trainingImageUrls } from "@/lib/training-images";

export default async function LernenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { account, userId, memberships } = await requireAccount({ allowMember: true });
  const supabase = await createClient();
  const isOwner = memberships.find((m) => m.id === account.id)?.role === "owner";

  const { data: tutorial } = await supabase
    .from("tutorials")
    .select("*")
    .eq("id", id)
    .single<Tutorial>();

  // Zugriff: Tutorial gehört zum aktiven Konto.
  if (!tutorial || tutorial.account_id !== account.id) notFound();
  // Nur veröffentlichte Schulungen — Entwürfe (auch interne) sieht niemand im Lernbereich,
  // sonst kämen Mitarbeiter per URL an unfertige Inhalte.
  if (tutorial.status !== "published") notFound();
  // Lern-Zugriff (Welle 20): intern ODER öffentlich-mit-in_lernen (beide mit Nachweis).
  // Öffentliche OHNE in_lernen gehören nicht in den Lernbereich -> auf die Hilfe-Seite,
  // sofern veröffentlicht + Slug vorhanden, sonst notFound.
  const inLernen = tutorial.visibility === "internal" || tutorial.in_lernen;
  if (!inLernen) {
    if (tutorial.status === "published" && tutorial.slug) {
      redirect(`/h/${account.slug}/${tutorial.slug}`);
    }
    notFound();
  }

  const { data: steps } = await supabase
    .from("steps")
    .select("*")
    .eq("tutorial_id", id)
    .order("position", { ascending: true })
    .returns<Step[]>();
  const stepIds = (steps ?? []).map((s) => s.id);

  const [{ data: branches }, { data: myCompletion }] = await Promise.all([
    stepIds.length
      ? supabase.from("step_branches").select("*").in("step_id", stepIds).returns<StepBranch[]>()
      : Promise.resolve({ data: [] as StepBranch[] }),
    supabase
      .from("tutorial_completions")
      .select("completed_at")
      .eq("tutorial_id", id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  // Bilder: signierte URLs aus dem PRIVATEN Bucket — bei Verpixelung auf eine Kopie mit
  // EINGEBRANNTER Verpixelung (verpixelt bleibt verpixelt, auch beim Öffnen der Bild-URL).
  const admin = createAdminClient();
  const imageUrls = await trainingImageUrls(account.id, steps ?? []);

  // Owner-Zusatz: Schulungsnachweis-Tabelle (alle Mitglieder + Status).
  const trainingRecord = isOwner ? await loadTrainingRecord(account.id, id, admin) : [];

  return (
    // Gleiche Breite wie die Live-/Vorschau-Ansicht (Schrittlisten-Sidebar ab lg).
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 lg:max-w-4xl">
      <Link
        href="/app/lernen"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-bold text-muted-foreground transition-colors hover:text-ink"
      >
        <ChevronLeft className="size-4" /> Schulungen
      </Link>
      <h1 className="mb-4 text-[26px] font-black leading-tight text-ink">{tutorial.title}</h1>

      <LernenViewer
        tutorialId={id}
        rootId={tutorial.root_step_id}
        steps={steps ?? []}
        branches={branches ?? []}
        imageUrls={imageUrls}
        completion={{
          completed: !!myCompletion,
          completedAt: myCompletion?.completed_at ?? null,
        }}
      />

      {isOwner && trainingRecord.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-1 text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
            Schulungsnachweis
          </h2>
          <p className="mb-2.5 text-[13px] font-semibold text-muted-foreground">
            {trainingRecord.filter((m) => m.completedAt).length} von {trainingRecord.length} im
            Team haben diese Schulung absolviert.
          </p>
          <div className="overflow-hidden rounded-card border-2 border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-line-2 text-left text-[11px] font-extrabold uppercase tracking-[0.08em] text-faint">
                  <th className="px-4 py-2 font-extrabold">Person</th>
                  <th className="px-4 py-2 text-right font-extrabold">Absolviert</th>
                </tr>
              </thead>
              <tbody>
                {trainingRecord.map((m) => (
                  <tr key={m.userId} className="border-t-2 border-line-2">
                    <td className="px-4 py-2.5">
                      <span className="block font-extrabold text-ink">{m.name ?? m.email}</span>
                      {m.name && (
                        <span className="block text-xs font-semibold text-muted-foreground">
                          {m.email}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {m.completedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2.5 py-[3px] text-xs font-black text-teal-text">
                          <Check className="size-3" /> am {dateLongDe(m.completedAt)}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-amber-soft px-2.5 py-[3px] text-xs font-black text-amber-text">
                          Noch offen
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}

/** Alle Mitglieder des Kontos + ob/wann sie dieses Tutorial absolviert haben. */
async function loadTrainingRecord(
  accountId: string,
  tutorialId: string,
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ userId: string; email: string; name: string | null; completedAt: string | null }[]> {
  const [{ data: memberRows }, { data: comps }] = await Promise.all([
    admin.from("account_members").select("user_id").eq("account_id", accountId),
    admin
      .from("tutorial_completions")
      .select("user_id, completed_at")
      .eq("tutorial_id", tutorialId),
  ]);
  const rows = memberRows ?? [];
  const doneBy = new Map((comps ?? []).map((c) => [c.user_id, c.completed_at as string]));
  const userRes = await Promise.all(rows.map((m) => admin.auth.admin.getUserById(m.user_id)));
  return rows.map((m, i) => ({
    userId: m.user_id,
    email: userRes[i].data?.user?.email ?? "—",
    name: userDisplayName(userRes[i].data?.user?.user_metadata),
    completedAt: doneBy.get(m.user_id) ?? null,
  }));
}
